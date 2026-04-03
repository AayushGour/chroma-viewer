"""
Chroma explorer API — uses the official chromadb Python client (HttpClient + AdminClient)
so the UI can use full client features instead of hand-rolled REST calls.

Mounted under /api/explorer/ by serve.py. Query params host, port, ssl identify the Chroma server.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import parse_qs, unquote

import chromadb
import httpx
from chromadb.config import DEFAULT_TENANT, Settings

# Common tenant names to probe via GET /api/v1/tenants/{name}.
# ChromaDB has no "list tenants" endpoint, so we check these one by one.
COMMON_TENANT_PROBES = frozenset([
    "default_tenant",
    "admin", "system", "root",
    "test", "testing",
    "dev", "development",
    "staging", "stage",
    "prod", "production",
    "main", "primary",
    "chroma", "chromadb",
    "app", "api", "service", "backend", "data",
    "demo", "sandbox", "local",
])


def _settings(host: str, port: int, ssl: bool) -> Settings:
    s = Settings()
    s.chroma_api_impl = "chromadb.api.fastapi.FastAPI"
    s.chroma_server_host = str(host)
    s.chroma_server_http_port = int(port)
    s.chroma_server_ssl_enabled = bool(ssl)
    return s


def _admin(host: str, port: int, ssl: bool):
    return chromadb.AdminClient(_settings(host, port, ssl))


def _client(host: str, port: int, ssl: bool, tenant: str, database: str):
    return chromadb.HttpClient(
        host=host,
        port=int(port),
        ssl=bool(ssl),
        tenant=tenant,
        database=database,
    )


def _parse_target(qs: Dict[str, List[str]]) -> Tuple[str, int, bool]:
    host = (qs.get("host") or ["localhost"])[0].strip() or "localhost"
    port = int((qs.get("port") or ["8000"])[0])
    ssl = (qs.get("ssl") or ["0"])[0].strip().lower() in ("1", "true", "yes")
    return host, port, ssl


def _json_safe(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if hasattr(obj, "tolist"):
        try:
            return obj.tolist()
        except Exception:
            return str(obj)
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(x) for x in obj]
    return obj


def handle_heartbeat(qs: Dict[str, List[str]]) -> Tuple[int, dict]:
    host, port, ssl = _parse_target(qs)
    try:
        c = _client(host, port, ssl, DEFAULT_TENANT, "default_database")
        ns = c.heartbeat()
        return 200, {"nanoseconds": int(ns)}
    except Exception as e:
        return 502, {"error": str(e)}


def _resolve_chroma_sqlite_path(persist_path: str) -> Optional[str]:
    """Chroma sysdb is persist_directory/chroma.sqlite3 (or user may pass the file path)."""
    if not persist_path or not str(persist_path).strip():
        return None
    p = os.path.expanduser(str(persist_path).strip())
    if os.path.isfile(p) and (p.endswith(".sqlite3") or p.endswith(".sqlite")):
        return p
    candidate = os.path.join(p, "chroma.sqlite3")
    if os.path.isfile(candidate):
        return candidate
    return None


def _auto_detect_sqlite_paths() -> List[str]:
    """Try to find chroma.sqlite3 in common default locations."""
    candidates: List[str] = []

    # Environment variables Chroma may use
    for env_key in ("PERSIST_DIRECTORY", "CHROMA_PERSIST_DIRECTORY", "CHROMA_DATA_DIR"):
        env_val = os.environ.get(env_key)
        if env_val:
            candidates.append(env_val)

    # Common default directories (relative to cwd and absolute)
    candidates.extend([
        "./chroma",
        "./chroma_data",
        "./chromadb",
        "./data",
        os.path.expanduser("~/.chroma"),
        "/tmp/chroma",
    ])

    found: List[str] = []
    seen: set = set()
    for c in candidates:
        resolved = _resolve_chroma_sqlite_path(c)
        if resolved and resolved not in seen:
            seen.add(resolved)
            found.append(resolved)

    return found


def _tenants_from_sqlite(db_path: str) -> List[str]:
    """Read tenant ids from Chroma's SQLite sysdb (true list when you have filesystem access).

    There is no HTTP API to list tenants; for K8s pods you often query the same DB via kubectl.
    See docs/chroma-sysdb-tenants-note.sql for the sqlite3 / kubectl exec example.
    """
    names: Set[str] = set()
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'"
        )
        if cur.fetchone():
            cur.execute("SELECT id FROM tenants")
            for row in cur.fetchall():
                if row and row[0]:
                    names.add(str(row[0]))
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='databases'"
        )
        if cur.fetchone():
            cur.execute("SELECT DISTINCT tenant_id FROM databases")
            for row in cur.fetchall():
                if row and row[0]:
                    names.add(str(row[0]))
    finally:
        conn.close()
    return sorted(names)


def _parse_tenant_list_json(data: Any) -> List[str]:
    if data is None:
        return []
    if isinstance(data, list):
        out: List[str] = []
        for o in data:
            if isinstance(o, str) and o.strip():
                out.append(o.strip())
            elif isinstance(o, dict):
                n = o.get("name") or o.get("id")
                if n is not None and str(n).strip():
                    out.append(str(n).strip())
        return out
    if isinstance(data, dict):
        for key in ("tenants", "data", "items", "results"):
            if key in data:
                return _parse_tenant_list_json(data[key])
    return []


def _http_try_list_tenants(host: str, port: int, ssl: bool) -> List[str]:
    """Some Chroma builds or proxies expose GET /api/v*/tenants; stock server returns 405."""
    scheme = "https" if ssl else "http"
    base = f"{scheme}://{host}:{int(port)}"
    paths = (
        "/api/v2/tenants",
        "/api/v1/tenants",
    )
    params_opts: Tuple[Optional[Dict[str, Any]], ...] = (
        None,
        {"limit": 10000, "offset": 0},
    )
    with httpx.Client(timeout=8.0, follow_redirects=True) as client:
        for path in paths:
            for params in params_opts:
                try:
                    r = client.get(base + path, params=params)
                    if r.status_code != 200:
                        continue
                    data = r.json()
                    found = _parse_tenant_list_json(data)
                    if found:
                        return found
                except Exception:
                    continue
    return []


def _probe_tenants_parallel(
    host: str, port: int, ssl: bool, names: Set[str]
) -> List[str]:
    """
    Verify which tenant names actually exist on the server.
    Uses direct HTTP GET /api/v1/tenants/{name} in parallel for speed.
    Each thread creates its own httpx client to avoid thread-safety issues.
    Returns only the names that got a 200 response.
    """
    if not names:
        return []

    scheme = "https" if ssl else "http"
    base = f"{scheme}://{host}:{port}"

    def check(name: str) -> Optional[str]:
        with httpx.Client(timeout=5.0, follow_redirects=True) as client:
            for prefix in ("/api/v2", "/api/v1"):
                try:
                    r = client.get(f"{base}{prefix}/tenants/{name}")
                    if r.status_code == 200:
                        return name
                except Exception:
                    pass
        return None

    verified: List[str] = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(check, n): n for n in names}
        for f in as_completed(futures):
            try:
                result = f.result()
                if result:
                    verified.append(result)
            except Exception:
                pass

    return sorted(verified)


def handle_tenants(qs: Dict[str, List[str]]) -> Tuple[int, dict]:
    """
    Aggregate tenant names from every available source:
    1. Local chroma.sqlite3 (persist_path or auto-detected)
    2. HTTP GET /api/v2|v1/tenants (if server supports listing)
    3. Parallel probing of common tenant names via GET /tenants/{name}
    4. User-supplied extra tenant hints (comma-separated)
    All non-SQLite candidates are verified against the server in parallel.
    """
    host, port, ssl = _parse_target(qs)
    extra_raw = (qs.get("extra") or [""])[0]
    persist_raw = (qs.get("persist_path") or [""])[0]
    persist_path = unquote(persist_raw.strip()) if persist_raw else ""

    # ── SQLite discovery ──────────────────────────────────────
    sqlite_names: List[str] = []
    db_file = _resolve_chroma_sqlite_path(persist_path) if persist_path else None

    if not db_file:
        for auto_path in _auto_detect_sqlite_paths():
            try:
                auto_names = _tenants_from_sqlite(auto_path)
                if auto_names:
                    db_file = auto_path
                    sqlite_names = auto_names
                    break
            except Exception:
                continue

    if db_file and not sqlite_names:
        try:
            sqlite_names = _tenants_from_sqlite(db_file)
        except Exception:
            sqlite_names = []

    # ── HTTP list endpoint (non-standard) ─────────────────────
    http_names = _http_try_list_tenants(host, port, ssl)

    # ── Build candidate set ───────────────────────────────────
    candidates: Set[str] = {DEFAULT_TENANT}
    candidates.update(sqlite_names)
    candidates.update(http_names)
    candidates.update(COMMON_TENANT_PROBES)
    for part in extra_raw.split(","):
        t = part.strip()
        if t:
            candidates.add(t)

    # ── Verify candidates against server ──────────────────────
    sqlite_set = set(sqlite_names)
    # SQLite names are already trusted; only probe the rest
    to_probe = candidates - sqlite_set
    probed = _probe_tenants_parallel(host, port, ssl, to_probe)

    verified = sorted(set(sqlite_names) | set(probed))
    if not verified:
        verified = [DEFAULT_TENANT]

    return 200, {
        "tenants": verified,
        "discovery": {
            "sqlite_path_resolved": db_file,
            "sqlite_auto_detected": db_file is not None and not persist_path,
            "sqlite_count": len(sqlite_names),
            "http_count": len(http_names),
            "probed_count": len(probed),
            "candidates_checked": len(candidates),
        },
    }


def _database_name_id(d: Any) -> Tuple[str, str]:
    """Chroma may return Database as TypedDict (dict) or a small object with .name/.id."""
    if isinstance(d, dict):
        name = str(d.get("name") or "")
        did = d.get("id")
    else:
        name = str(getattr(d, "name", "") or "")
        did = getattr(d, "id", None)
    sid = str(did) if did is not None else ""
    return name, sid


def handle_databases(qs: Dict[str, List[str]]) -> Tuple[int, Any]:
    host, port, ssl = _parse_target(qs)
    tenant = (qs.get("tenant") or [DEFAULT_TENANT])[0].strip() or DEFAULT_TENANT
    try:
        admin = _admin(host, port, ssl)
        dbs = admin.list_databases(tenant=tenant)
        out = []
        for d in dbs:
            name, sid = _database_name_id(d)
            out.append({"name": name, "id": sid})
        return 200, out
    except Exception as e:
        return 502, {"error": str(e)}


def handle_collections(qs: Dict[str, List[str]]) -> Tuple[int, Any]:
    host, port, ssl = _parse_target(qs)
    tenant = (qs.get("tenant") or [DEFAULT_TENANT])[0].strip() or DEFAULT_TENANT
    database = (qs.get("database") or ["default_database"])[0].strip() or "default_database"
    try:
        client = _client(host, port, ssl, tenant, database)
        cols = client.list_collections()
        out = []
        for c in cols:
            mid = getattr(c, "id", None)
            cfg = getattr(c, "configuration_json", None) or {}
            ef = cfg.get("embedding_function")
            ef_name = None
            if isinstance(ef, str):
                ef_name = ef
            elif isinstance(ef, dict):
                ef_name = (
                    ef.get("name")
                    or ef.get("id")
                    or ef.get("type")
                    or ef.get("class")
                    or ef.get("provider")
                )
            out.append(
                {
                    "id": str(mid) if mid is not None else "",
                    "name": c.name,
                    "metadata": getattr(c, "metadata", None) or {},
                    "embedding_function": ef_name,
                }
            )
        return 200, out
    except Exception as e:
        return 502, {"error": str(e)}


def handle_count(qs: Dict[str, List[str]], collection_id: str) -> Tuple[int, Any]:
    host, port, ssl = _parse_target(qs)
    tenant = (qs.get("tenant") or [DEFAULT_TENANT])[0].strip() or DEFAULT_TENANT
    database = (qs.get("database") or ["default_database"])[0].strip() or "default_database"
    collection_id = unquote(collection_id)
    try:
        client = _client(host, port, ssl, tenant, database)
        col = _get_collection_by_id_or_name(client, collection_id)
        return 200, col.count()
    except Exception as e:
        return 502, {"error": str(e)}


def _get_collection_by_id_or_name(client, collection_id: str):
    """Resolve collection UUID or name to a Collection object."""
    cols = client.list_collections()
    for c in cols:
        if str(c.id) == collection_id or c.name == collection_id:
            return client.get_collection(name=c.name)
    raise ValueError(f"Collection not found: {collection_id}")


def handle_get(
    qs: Dict[str, List[str]], collection_id: str, body: Optional[bytes]
) -> Tuple[int, Any]:
    host, port, ssl = _parse_target(qs)
    tenant = (qs.get("tenant") or [DEFAULT_TENANT])[0].strip() or DEFAULT_TENANT
    database = (qs.get("database") or ["default_database"])[0].strip() or "default_database"
    collection_id = unquote(collection_id)
    payload = {}
    if body:
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return 400, {"error": "Invalid JSON body"}
    limit = int(payload.get("limit") or 50)
    offset = int(payload.get("offset") or 0)
    include = payload.get("include") or ["documents", "metadatas", "embeddings"]
    try:
        client = _client(host, port, ssl, tenant, database)
        col = _get_collection_by_id_or_name(client, collection_id)
        # Map REST-style include names to chromadb Include if needed
        inc = list(include)
        res = col.get(limit=limit, offset=offset, include=inc)
        if not isinstance(res, dict):
            res = dict(res)
        ids = res.get("ids")
        data = {
            "ids": list(ids) if ids is not None else [],
            "documents": _json_safe(res.get("documents")),
            "metadatas": _json_safe(res.get("metadatas")),
            "embeddings": _json_safe(res.get("embeddings")),
        }
        return 200, data
    except Exception as e:
        return 502, {"error": str(e)}


def handle_delete_collection(qs: Dict[str, List[str]], collection_id: str) -> Tuple[int, Any]:
    host, port, ssl = _parse_target(qs)
    tenant = (qs.get("tenant") or [DEFAULT_TENANT])[0].strip() or DEFAULT_TENANT
    database = (qs.get("database") or ["default_database"])[0].strip() or "default_database"
    collection_id = unquote(collection_id)
    try:
        client = _client(host, port, ssl, tenant, database)
        col = _get_collection_by_id_or_name(client, collection_id)
        client.delete_collection(name=col.name)
        return 200, {"ok": True, "deleted": {"id": str(col.id), "name": col.name}}
    except Exception as e:
        return 502, {"error": str(e)}


def handle_verify_tenant(qs: Dict[str, List[str]]) -> Tuple[int, dict]:
    """Verify a single tenant name exists on the server. Used by the UI 'add tenant' flow."""
    host, port, ssl = _parse_target(qs)
    name = (qs.get("name") or [""])[0].strip()
    if not name:
        return 400, {"error": "Missing 'name' parameter"}
    found = _probe_tenants_parallel(host, port, ssl, {name})
    if found:
        return 200, {"exists": True, "name": name}
    return 200, {"exists": False, "name": name}


def route(method: str, path: str, body: Optional[bytes]) -> Tuple[int, Any]:
    """path is path only, e.g. /api/explorer/heartbeat?host=..."""
    if "?" in path:
        path_only, query = path.split("?", 1)
    else:
        path_only, query = path, ""
    qs = parse_qs(query, keep_blank_values=True)

    if path_only == "/api/explorer/heartbeat" and method == "GET":
        return handle_heartbeat(qs)

    if path_only == "/api/explorer/tenants" and method == "GET":
        return handle_tenants(qs)

    if path_only == "/api/explorer/verify-tenant" and method == "GET":
        return handle_verify_tenant(qs)

    if path_only == "/api/explorer/databases" and method == "GET":
        return handle_databases(qs)

    if path_only == "/api/explorer/collections" and method == "GET":
        return handle_collections(qs)

    m = re.match(r"^/api/explorer/collection/([^/]+)/count$", path_only)
    if m and method == "GET":
        return handle_count(qs, m.group(1))

    m = re.match(r"^/api/explorer/collection/([^/]+)/get$", path_only)
    if m and method == "POST":
        return handle_get(qs, m.group(1), body)

    m = re.match(r"^/api/explorer/collection/([^/]+)/delete$", path_only)
    if m and method == "DELETE":
        return handle_delete_collection(qs, m.group(1))

    return 404, {"error": "Not found"}


def handle_request(method: str, full_path: str, body: Optional[bytes]) -> Tuple[int, str, bytes]:
    status, payload = route(method, full_path, body)
    text = json.dumps(payload) if not isinstance(payload, str) else payload
    return status, "application/json", text.encode("utf-8")
