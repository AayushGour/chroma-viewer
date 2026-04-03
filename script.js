'use strict';

// ============================================================
// API Layer — single source of truth for all fetch calls
// ============================================================

class ChromaAPI {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.version = null; // 'v1' | 'v2'
    }

    get isV2() { return this.version === 'v2'; }

    /** Build a full URL for the currently detected API version */
    url(path) {
        return `${this.baseUrl}/api/${this.version}${path}`;
    }

    /** Build the URL for collection-scoped endpoints.
     *  v2: /api/v2/tenants/{t}/databases/{d}/collections{suffix}
     *  v1: /api/v1/collections{suffix}
     */
    collUrl(tenant, database, suffix = '') {
        if (this.isV2) {
            return this.url(
                `/tenants/${enc(tenant)}/databases/${enc(database)}/collections${suffix}`
            );
        }
        return this.url(`/collections${suffix}`);
    }

    /** Probe v2 then v1. Returns 'v2'|'v1'|null. Sets this.version on success. */
    async detect() {
        for (const v of ['v2', 'v1']) {
            try {
                const r = await fetch(`${this.baseUrl}/api/${v}/heartbeat`, {
                    signal: AbortSignal.timeout(7000)
                });
                if (r.ok) { this.version = v; return v; }
            } catch { /* try next */ }
        }
        return null;
    }

    /** GET /api/v2/tenants/{tenant}/databases → array of db objects */
    async listDatabases(tenant) {
        return this._json(this.url(`/tenants/${enc(tenant)}/databases`));
    }

    /** GET collections for the current tenant/database */
    async listCollections(tenant, database) {
        return this._json(this.collUrl(tenant, database));
    }

    /** GET document count for a collection */
    async countCollection(collectionId, tenant, database) {
        return this._json(this.collUrl(tenant, database, `/${collectionId}/count`));
    }

    /** DELETE a collection (and all records) */
    async deleteCollection(collectionId, collectionName, tenant, database) {
        if (this.isV2) {
            return this._json(this.collUrl(tenant, database, `/${collectionId}`), { method: 'DELETE' });
        }
        // v1 commonly addresses collections by name
        return this._json(this.url(`/collections/${enc(collectionName || collectionId)}`), { method: 'DELETE' });
    }

    /** POST to fetch paginated documents from a collection */
    async getDocuments(collectionId, tenant, database, { limit = 50, offset = 0, include } = {}) {
        return this._json(
            this.collUrl(tenant, database, `/${collectionId}/get`),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    limit,
                    offset,
                    include: include || ['documents', 'metadatas', 'embeddings']
                })
            }
        );
    }

    /** Low-level: fetch + throw on non-OK, return parsed JSON */
    async _json(url, opts = {}) {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000), ...opts });
        if (!r.ok) {
            const body = await r.text().catch(() => '');
            throw new APIError(r.status, r.statusText, url, body);
        }
        return r.json();
    }
}

/**
 * Uses /api/explorer/* on the same origin (serve.py + chromadb) so data paths go through
 * the official Python client instead of calling Chroma REST from the browser.
 */
class ChromaLibraryAPI {
    constructor(cfg) {
        this.cfg = cfg;
        this.version = 'v2';
    }

    get isV2() { return true; }

    _qs(extra = {}) {
        const p = new URLSearchParams({
            host: this.cfg.host || 'localhost',
            port: String(this.cfg.port ?? 8000),
            ssl: this.cfg.protocol === 'https' ? '1' : '0'
        });
        Object.entries(extra).forEach(([k, v]) => {
            if (v != null && v !== '') p.set(k, String(v));
        });
        return p.toString();
    }

    async detect() {
        const url = `/api/explorer/heartbeat?${this._qs()}`;
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
            return r.ok ? 'v2' : null;
        } catch {
            return null;
        }
    }

    /** Full tenant discovery: SQLite (persist path), HTTP GET /tenants, get_tenant hints. */
    async fetchTenantDiscovery(extraCsv, persistPath) {
        const p = new URLSearchParams({
            host: this.cfg.host || 'localhost',
            port: String(this.cfg.port ?? 8000),
            ssl: this.cfg.protocol === 'https' ? '1' : '0'
        });
        if (extraCsv && String(extraCsv).trim()) p.set('extra', String(extraCsv).trim());
        if (persistPath && String(persistPath).trim()) {
            p.set('persist_path', String(persistPath).trim());
        }
        const url = `/api/explorer/tenants?${p.toString()}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) {
            const body = await r.text().catch(() => '');
            throw new APIError(r.status, r.statusText, url, body);
        }
        const data = await r.json();
        if (data.discovery) {
            console.info('[Chroma explorer] tenant discovery:', data.discovery);
        }
        return data.tenants || [];
    }

    /** Verify a single tenant name exists on the server */
    async verifyTenant(name) {
        return this._jsonGet(`/api/explorer/verify-tenant?${this._qs({ name })}`);
    }

    async listDatabases(tenant) {
        return this._jsonGet(`/api/explorer/databases?${this._qs({ tenant })}`);
    }

    async listCollections(tenant, database) {
        return this._jsonGet(`/api/explorer/collections?${this._qs({ tenant, database })}`);
    }

    async countCollection(collectionId, tenant, database) {
        const encId = encodeURIComponent(collectionId);
        return this._jsonGet(
            `/api/explorer/collection/${encId}/count?${this._qs({ tenant, database })}`
        );
    }

    /** DELETE a collection (and all records) */
    async deleteCollection(collectionId, _collectionName, tenant, database) {
        const encId = encodeURIComponent(collectionId);
        const url = `/api/explorer/collection/${encId}/delete?${this._qs({ tenant, database })}`;
        const r = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(20000) });
        if (!r.ok) {
            const body = await r.text().catch(() => '');
            throw new APIError(r.status, r.statusText, url, body);
        }
        return r.json();
    }

    async getDocuments(collectionId, tenant, database, { limit = 50, offset = 0, include } = {}) {
        const encId = encodeURIComponent(collectionId);
        const url = `/api/explorer/collection/${encId}/get?${this._qs({ tenant, database })}`;
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                limit,
                offset,
                include: include || ['documents', 'metadatas', 'embeddings']
            }),
            signal: AbortSignal.timeout(120000)
        });
        if (!r.ok) {
            const body = await r.text().catch(() => '');
            throw new APIError(r.status, r.statusText, url, body);
        }
        return r.json();
    }

    async _jsonGet(url) {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) {
            const body = await r.text().catch(() => '');
            throw new APIError(r.status, r.statusText, url, body);
        }
        return r.json();
    }
}

class APIError extends Error {
    constructor(status, statusText, url, body) {
        super(`HTTP ${status} ${statusText}`);
        this.status = status;
        this.url = url;
        this.body = body;
    }
}

// ============================================================
// Helpers
// ============================================================

function enc(s) { return encodeURIComponent(s); }

function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function extractNames(payload) {
    const arr = Array.isArray(payload)
        ? payload
        : (payload?.databases || payload?.tenants || payload?.data || []);
    return arr.map(x => (typeof x === 'string' ? x : x?.name)).filter(Boolean);
}

function parseExtraTenants(str) {
    if (!str || !String(str).trim()) return [];
    return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

/** Sentinel value for "Other tenant" row in the tenant <select> */
const TENANT_CUSTOM_VALUE = '__custom__';

// ============================================================
// ChromaExplorer — Application Controller
// ============================================================

class ChromaExplorer {
    constructor() {
        this.api = null;
        this.apiMode = 'rest'; // 'library' | 'rest'

        // Persisted config
        this.cfg = this.loadConfig();
        this.tenant  = this.cfg.tenant   || 'default_tenant';
        this.database = this.cfg.database || 'default_database';

        // Volatile state
        this.collections    = [];
        this.activeCollId   = null;
        this.activeCollName = null;
        this.currentData    = null;
        this.totalItems     = 0;
        this.page           = 1;
        this.pageSize       = 50;
        this.view           = 'table';

        this.$ = id => document.getElementById(id);
        this.bindElements();
        this.bindEvents();
        this.boot();
    }

    // ── Element refs ──────────────────────────────────────────

    bindElements() {
        const g = id => this.$(id);
        this.el = {
            // Nav
            connBadge:     g('connBadge'),
            connLabel:     g('connLabel'),
            settingsBtn:   g('settingsBtn'),
            // Context bar
            contextBar:       g('contextBar'),
            tenantSelect:     g('tenantSelect'),
            tenantCustomInput: g('tenantCustomInput'),
            tenantApplyBtn:   g('tenantApplyBtn'),
            dbSelect:         g('dbSelect'),
            // Sidebar
            sidebarLoading:g('sidebarLoading'),
            collList:      g('collList'),
            sidebarEmpty:  g('sidebarEmpty'),
            refreshBtn:    g('refreshBtn'),
            // Main panels
            panelWelcome:  g('panelWelcome'),
            panelError:    g('panelError'),
            errorMsg:      g('errorMsg'),
            retryBtn:      g('retryBtn'),
            panelCollection: g('panelCollection'),
            // Collection header
            collNameDisplay: g('collNameDisplay'),
            collCountBadge:  g('collCountBadge'),
            collEmbeddingFn: g('collEmbeddingFn'),
            deleteCollectionBtn: g('deleteCollectionBtn'),
            searchInput:   g('searchInput'),
            viewToggle:    g('viewToggle'),
            // Data
            dataLoading:   g('dataLoading'),
            tableView:     g('tableView'),
            tableBody:     g('tableBody'),
            jsonView:      g('jsonView'),
            jsonContent:   g('jsonContent'),
            // Pagination
            paginationBar: g('paginationBar'),
            paginationLabel: g('paginationLabel'),
            firstBtn:      g('firstBtn'),
            prevBtn:       g('prevBtn'),
            pageNumbers:   g('pageNumbers'),
            nextBtn:       g('nextBtn'),
            lastBtn:       g('lastBtn'),
            pageSizeSelect: g('pageSizeSelect'),
            // Modal
            settingsModal:    g('settingsModal'),
            hostInput:        g('hostInput'),
            portInput:        g('portInput'),
            protocolInput:    g('protocolInput'),
            extraTenantsInput: g('extraTenantsInput'),
            persistPathInput:  g('persistPathInput'),
            urlPreview:       g('urlPreview'),
            testConnBtn:      g('testConnBtn'),
            testResult:       g('testResult'),
            saveConnBtn:      g('saveConnBtn'),
            closeSettingsBtn: g('closeSettingsBtn'),
        };
    }

    // ── Events ────────────────────────────────────────────────

    bindEvents() {
        const e = this.el;

        // Context bar — tenant: native <select> (reliable) + optional custom name
        e.tenantSelect.addEventListener('change', async () => {
            const v = e.tenantSelect.value;
            if (v === TENANT_CUSTOM_VALUE) {
                e.tenantCustomInput.focus();
                return;
            }
            if (!v || v === this.tenant) return;
            this.tenant = v;
            e.tenantCustomInput.value = '';
            this.saveConfig();
            await this.loadDatabases(this.tenant, true);
        });
        e.tenantApplyBtn.addEventListener('click', () => this.applyTenantFromCustom());
        e.tenantCustomInput.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                this.applyTenantFromCustom();
            }
        });

        // Context bar — database
        e.dbSelect.addEventListener('change', () => {
            const db = e.dbSelect.value;
            if (db && db !== this.database) {
                this.database = db;
                this.saveConfig();
                this.reloadCollections();
            }
        });

        // Sidebar refresh
        e.refreshBtn.addEventListener('click', () => this.reloadCollections());

        // Sidebar collection click (delegated)
        e.collList.addEventListener('click', ev => {
            const li = ev.target.closest('.coll-item');
            if (li) this.selectCollection(li.dataset.id, li.dataset.name);
        });

        // Retry
        e.retryBtn.addEventListener('click', () => {
            if (this.activeCollId) this.loadDocuments(this.page);
        });

        // Delete collection
        e.deleteCollectionBtn.addEventListener('click', () => this.deleteActiveCollection());

        // Search
        let searchTimer;
        e.searchInput.addEventListener('input', ev => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => this.filterCurrentPage(ev.target.value), 250);
        });

        // View toggle
        e.viewToggle.addEventListener('click', ev => {
            const btn = ev.target.closest('.view-btn');
            if (btn) this.setView(btn.dataset.view);
        });

        // Pagination
        e.firstBtn.addEventListener('click', () => this.goToPage(1));
        e.prevBtn.addEventListener('click',  () => this.goToPage(this.page - 1));
        e.nextBtn.addEventListener('click',  () => this.goToPage(this.page + 1));
        e.lastBtn.addEventListener('click',  () => this.goToPage(this.totalPages));
        e.pageSizeSelect.addEventListener('change', () => {
            this.pageSize = parseInt(e.pageSizeSelect.value);
            this.page = 1;
            this.loadDocuments(1);
        });

        // Settings modal
        e.settingsBtn.addEventListener('click',       () => this.openSettings());
        e.closeSettingsBtn.addEventListener('click',  () => this.closeSettings());
        e.settingsModal.addEventListener('click', ev => {
            if (ev.target === e.settingsModal) this.closeSettings();
        });
        document.addEventListener('keydown', ev => {
            if (ev.key === 'Escape' && e.settingsModal.style.display !== 'none') {
                this.closeSettings();
            }
        });
        [e.hostInput, e.portInput, e.protocolInput].forEach(el => {
            el.addEventListener('input', () => this.updateUrlPreview());
        });
        e.testConnBtn.addEventListener('click', () => this.testConnectionModal());
        e.saveConnBtn.addEventListener('click', () => this.saveAndConnect());
    }

    // ── Boot ─────────────────────────────────────────────────

    async boot() {
        this.setConnStatus('connecting');
        this.showSidebar('loading');
        this.showPanel('welcome');

        const url = this.buildBaseUrl(this.cfg);
        const lib = new ChromaLibraryAPI(this.cfg);
        let version = null;

        if (await lib.detect()) {
            this.api = lib;
            this.apiMode = 'library';
            version = 'v2';
        } else {
            this.api = new ChromaAPI(url);
            this.apiMode = 'rest';
            version = await this.api.detect();
        }

        if (!version) {
            this.setConnStatus('disconnected');
            this.showSidebar('empty');
            return;
        }

        this.setConnStatus('connected', version);

        if (this.api.isV2) {
            this.el.contextBar.style.display = 'flex';
            await this.loadTenantOptions();
            await this.loadDatabases(this.tenant, false);
        }

        await this.reloadCollections();
    }

    // ── Connection Status ─────────────────────────────────────

    setConnStatus(state, version = null) {
        const { connBadge, connLabel } = this.el;
        connBadge.className = `conn-badge ${state}`;
        const map = {
            connecting:   'Connecting…',
            connected:    version
                ? (this.apiMode === 'library'
                    ? 'Connected · chromadb (Python)'
                    : `Connected · API ${version.toUpperCase()}`)
                : 'Connected',
            disconnected: 'Disconnected'
        };
        connLabel.textContent = map[state] || state;
    }

    // ── Tenant / Database ─────────────────────────────────────

    /**
     * Populate tenant <select>. Library mode: SQLite path + HTTP + get_tenant.
     * REST mode: default + saved + Additional tenants. Custom names use "Other" + text field.
     */
    async loadTenantOptions() {
        const extra = parseExtraTenants(this.cfg.extraTenants);
        const set = new Set(['default_tenant', this.tenant, ...extra]);

        if (this.apiMode === 'library') {
            try {
                const discovered = await this.api.fetchTenantDiscovery(
                    this.cfg.extraTenants || '',
                    this.cfg.persistPath || ''
                );
                discovered.forEach(t => set.add(t));
            } catch (e) {
                console.warn('fetchTenantDiscovery failed:', e);
            }
        }

        const names = [...set].filter(Boolean).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        );

        const sel = this.el.tenantSelect;
        const opts = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        sel.innerHTML =
            `<option value="">Select tenant…</option>${opts}` +
            `<option value="${TENANT_CUSTOM_VALUE}">Other (type below)…</option>`;

        if (names.includes(this.tenant)) {
            sel.value = this.tenant;
            this.el.tenantCustomInput.value = '';
        } else {
            sel.value = TENANT_CUSTOM_VALUE;
            this.el.tenantCustomInput.value = this.tenant;
        }
    }

    async applyTenantFromCustom() {
        const raw = this.el.tenantCustomInput.value.trim();
        if (!raw) return;

        // In library mode, verify the tenant exists before switching
        if (this.apiMode === 'library') {
            try {
                const res = await this.api.verifyTenant(raw);
                if (!res.exists) {
                    this.el.tenantCustomInput.style.borderColor = 'var(--red)';
                    this.el.tenantCustomInput.title = `Tenant "${raw}" not found on server`;
                    setTimeout(() => {
                        this.el.tenantCustomInput.style.borderColor = '';
                        this.el.tenantCustomInput.title = '';
                    }, 3000);
                    return;
                }
            } catch (e) {
                console.warn('verifyTenant failed, proceeding anyway:', e);
            }
        }

        this.tenant = raw;
        this.saveConfig();
        await this.loadTenantOptions();
        await this.loadDatabases(this.tenant, true);
    }

    /**
     * Load databases for the given tenant and populate the select.
     * If reloadCollections is true, also reload collections afterwards.
     */
    async loadDatabases(tenant, reloadColl = true) {
        const sel = this.el.dbSelect;
        sel.disabled = true;
        sel.innerHTML = '<option value="">Loading…</option>';

        let dbs = [];
        try {
            const data = await this.api.listDatabases(tenant);
            dbs = extractNames(data);
        } catch (err) {
            console.warn('listDatabases failed, using default_database.', err);
        }

        if (!dbs.length) dbs = ['default_database'];

        // Keep current selection if it still exists; otherwise use first
        if (!dbs.includes(this.database)) this.database = dbs[0];

        sel.innerHTML = dbs.map(d =>
            `<option value="${esc(d)}"${d === this.database ? ' selected' : ''}>${esc(d)}</option>`
        ).join('');
        sel.disabled = false;

        this.saveConfig();
        if (reloadColl) await this.reloadCollections();
    }

    // ── Collections ───────────────────────────────────────────

    async reloadCollections() {
        this.showSidebar('loading');
        // Clear selection
        this.activeCollId = null;
        this.activeCollName = null;
        this.showPanel('welcome');

        try {
            const data = await this.api.listCollections(this.tenant, this.database);
            this.collections = Array.isArray(data) ? data : [];
            this.renderCollections();
        } catch (err) {
            console.error('listCollections failed:', err);
            this.collections = [];
            this.showSidebar('empty');
        }
    }

    renderCollections() {
        const { collList } = this.el;

        if (!this.collections.length) {
            this.showSidebar('empty');
            return;
        }

        this.showSidebar('list');
        collList.innerHTML = this.collections.map(c => `
            <li class="coll-item" data-id="${esc(c.id)}" data-name="${esc(c.name)}">
                <span class="coll-item-name" title="${esc(c.name)}">${esc(c.name)}</span>
            </li>
        `).join('');

        // Load counts asynchronously without blocking
        this.collections.forEach(c => {
            this.api.countCollection(c.id, this.tenant, this.database)
                .then(count => {
                    const li = collList.querySelector(`[data-id="${c.id}"]`);
                    if (!li) return;
                    const num = typeof count === 'number' ? count : parseInt(count, 10);
                    const badge = document.createElement('span');
                    badge.className = 'coll-item-count';
                    badge.textContent = isNaN(num) ? '—' : num.toLocaleString();
                    const existing = li.querySelector('.coll-item-count');
                    if (existing) existing.replaceWith(badge);
                    else li.appendChild(badge);
                })
                .catch(() => { /* count is optional — silently ignore */ });
        });
    }

    selectCollection(id, name) {
        if (id === this.activeCollId) return;

        this.activeCollId   = id;
        this.activeCollName = name;
        this.page = 1;
        this.el.searchInput.value = '';

        this.el.collList.querySelectorAll('.coll-item').forEach(li => {
            li.classList.toggle('active', li.dataset.id === id);
        });
        this.el.deleteCollectionBtn.disabled = false;

        this.loadDocuments(1);
    }

    getActiveCollection() {
        return this.collections.find(c => String(c.id) === String(this.activeCollId)) || null;
    }

    async deleteActiveCollection() {
        if (!this.activeCollId || !this.activeCollName) return;
        const label = `${this.activeCollName} (${this.activeCollId})`;
        const ok = window.confirm(
            `Delete collection "${this.activeCollName}" and all its data?\n\nThis cannot be undone.`
        );
        if (!ok) return;

        const btn = this.el.deleteCollectionBtn;
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';
        try {
            await this.api.deleteCollection(
                this.activeCollId,
                this.activeCollName,
                this.tenant,
                this.database
            );

            // Reset current selection and data panel, then refresh list
            this.activeCollId = null;
            this.activeCollName = null;
            this.currentData = null;
            this.totalItems = 0;
            this.page = 1;
            this.el.searchInput.value = '';
            this.showPanel('welcome');
            this.el.collList.querySelectorAll('.coll-item').forEach(li => li.classList.remove('active'));
            await this.reloadCollections();
            window.alert(`Deleted collection: ${label}`);
        } catch (err) {
            console.error('deleteCollection failed:', err);
            this.el.errorMsg.textContent = `Failed to delete collection: ${err.message}`;
            this.showPanel('error');
            btn.disabled = false;
        } finally {
            btn.innerHTML = prevHtml;
            if (!this.activeCollId) {
                btn.disabled = true;
            }
        }
    }

    // ── Documents ─────────────────────────────────────────────

    async loadDocuments(page) {
        if (!this.activeCollId) return;
        this.page = page;

        // Show collection panel immediately with loading state
        this.el.collNameDisplay.textContent = this.activeCollName;
        this.el.collCountBadge.textContent  = '';
        const activeColl = this.getActiveCollection();
        const ef = activeColl?.embedding_function;
        if (ef) {
            this.el.collEmbeddingFn.style.display = 'inline-flex';
            this.el.collEmbeddingFn.textContent = `EF: ${ef}`;
            this.el.collEmbeddingFn.title = `Embedding function: ${ef}`;
        } else {
            this.el.collEmbeddingFn.style.display = 'none';
            this.el.collEmbeddingFn.textContent = '';
            this.el.collEmbeddingFn.title = 'Embedding function unavailable';
        }
        this.showPanel('collection');
        this.setDataLoading(true);

        try {
            const offset = (page - 1) * this.pageSize;

            // Fetch documents and count in parallel
            const [dataResult, countResult] = await Promise.allSettled([
                this.api.getDocuments(
                    this.activeCollId, this.tenant, this.database,
                    { limit: this.pageSize, offset }
                ),
                this.api.countCollection(this.activeCollId, this.tenant, this.database)
            ]);

            if (dataResult.status === 'rejected') throw dataResult.reason;

            const data = dataResult.value;
            this.currentData = data;

            if (countResult.status === 'fulfilled') {
                const c = countResult.value;
                this.totalItems = typeof c === 'number' ? c : parseInt(c, 10) || 0;
            } else {
                this.totalItems = data.ids?.length || 0;
            }

            this.el.collCountBadge.textContent = `${this.totalItems.toLocaleString()} docs`;

            this.renderTableView(data);
            this.renderJsonView(data);
            this.updatePagination();
            this.setDataLoading(false);

        } catch (err) {
            console.error('getDocuments failed:', err);
            this.el.errorMsg.textContent = `${err.message}${err.url ? ` — ${err.url}` : ''}`;
            this.showPanel('error');
        }
    }

    get totalPages() {
        return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    }

    // ── Rendering ─────────────────────────────────────────────

    renderTableView(data) {
        const rows = data.ids || [];
        if (!rows.length) {
            this.el.tableBody.innerHTML =
                `<tr class="no-data-row"><td colspan="4">No documents found in this collection.</td></tr>`;
            return;
        }

        this.el.tableBody.innerHTML = rows.map((id, i) => {
            const doc  = data.documents?.[i] ?? null;
            const meta = data.metadatas?.[i]  ?? null;
            const emb  = data.embeddings?.[i] ?? null;

            const metaStr = meta !== null
                ? `<code class="cell-mono cell-truncate">${esc(JSON.stringify(meta, null, 2))}</code>`
                : `<span class="cell-nil">—</span>`;

            const embStr = emb !== null
                ? `<span class="emb-tag"><i class="fas fa-vector-square" style="font-size:10px"></i>${emb.length}D</span>`
                : `<span class="cell-nil">—</span>`;

            return `
                <tr>
                    <td><span class="cell-id cell-truncate">${esc(id)}</span></td>
                    <td><span class="cell-doc cell-truncate">${doc !== null ? esc(doc) : '<span class="cell-nil">—</span>'}</span></td>
                    <td>${metaStr}</td>
                    <td>${embStr}</td>
                </tr>
            `;
        }).join('');
    }

    renderJsonView(data) {
        if (!data?.ids?.length) {
            this.el.jsonContent.textContent = '[]';
            return;
        }
        const rows = data.ids.map((id, i) => ({
            id,
            document: data.documents?.[i] ?? null,
            metadata: data.metadatas?.[i]  ?? null,
            embedding: data.embeddings?.[i]
                ? { dimensions: data.embeddings[i].length, preview: data.embeddings[i].slice(0, 5) }
                : null
        }));
        this.el.jsonContent.textContent = JSON.stringify(rows, null, 2);
    }

    // ── Search (client-side filter on current page) ───────────

    filterCurrentPage(term) {
        if (!this.currentData) return;

        if (!term.trim()) {
            this.renderTableView(this.currentData);
            this.renderJsonView(this.currentData);
            return;
        }

        const t = term.toLowerCase();
        const filtered = { ids: [], documents: [], metadatas: [], embeddings: [] };

        (this.currentData.ids || []).forEach((id, i) => {
            const doc  = String(this.currentData.documents?.[i]  ?? '');
            const meta = JSON.stringify(this.currentData.metadatas?.[i] ?? '');
            if (id.toLowerCase().includes(t) || doc.toLowerCase().includes(t) || meta.toLowerCase().includes(t)) {
                filtered.ids.push(id);
                filtered.documents.push(this.currentData.documents?.[i] ?? null);
                filtered.metadatas.push(this.currentData.metadatas?.[i]  ?? null);
                filtered.embeddings.push(this.currentData.embeddings?.[i] ?? null);
            }
        });

        this.renderTableView(filtered);
        this.renderJsonView(filtered);
    }

    // ── View Toggle ───────────────────────────────────────────

    setView(view) {
        this.view = view;
        this.el.viewToggle.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.el.tableView.style.display = view === 'table' ? '' : 'none';
        this.el.jsonView.style.display  = view === 'json'  ? '' : 'none';
    }

    // ── Pagination ────────────────────────────────────────────

    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.page) return;
        this.loadDocuments(page);
    }

    updatePagination() {
        const total = this.totalPages;
        const start = this.totalItems ? (this.page - 1) * this.pageSize + 1 : 0;
        const end   = Math.min(this.page * this.pageSize, this.totalItems);

        this.el.paginationLabel.textContent = this.totalItems
            ? `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${this.totalItems.toLocaleString()}`
            : 'No documents';

        this.el.firstBtn.disabled = this.page <= 1;
        this.el.prevBtn.disabled  = this.page <= 1;
        this.el.nextBtn.disabled  = this.page >= total;
        this.el.lastBtn.disabled  = this.page >= total;

        // Page number buttons
        const pages = this.buildPageRange(this.page, total);
        this.el.pageNumbers.innerHTML = pages.map(p =>
            p === '…'
                ? `<span class="page-ellipsis">…</span>`
                : `<button class="page-num-btn${p === this.page ? ' active' : ''}" data-page="${p}">${p}</button>`
        ).join('');

        this.el.pageNumbers.onclick = ev => {
            const btn = ev.target.closest('.page-num-btn');
            if (btn) this.goToPage(parseInt(btn.dataset.page, 10));
        };
    }

    buildPageRange(current, total, delta = 2) {
        const pages = [1];
        const lo = Math.max(2, current - delta);
        const hi = Math.min(total - 1, current + delta);

        if (lo > 2) pages.push('…');
        for (let i = lo; i <= hi; i++) pages.push(i);
        if (hi < total - 1) pages.push('…');
        if (total > 1) pages.push(total);
        return pages;
    }

    // ── UI State Helpers ──────────────────────────────────────

    showSidebar(state) {
        // state: 'loading' | 'list' | 'empty'
        this.el.sidebarLoading.style.display = state === 'loading' ? ''     : 'none';
        this.el.collList.style.display       = state === 'list'    ? ''     : 'none';
        this.el.sidebarEmpty.style.display   = state === 'empty'   ? ''     : 'none';
    }

    showPanel(panel) {
        // panel: 'welcome' | 'error' | 'collection'
        this.el.panelWelcome.style.display    = panel === 'welcome'    ? '' : 'none';
        this.el.panelError.style.display      = panel === 'error'      ? '' : 'none';
        this.el.panelCollection.style.display = panel === 'collection' ? '' : 'none';
        if (panel !== 'collection' || !this.activeCollId) {
            this.el.deleteCollectionBtn.disabled = true;
        }
    }

    /** Within the collection panel, toggle the loading overlay vs content */
    setDataLoading(loading) {
        this.el.dataLoading.style.display    = loading ? '' : 'none';
        this.el.tableView.style.display      = !loading && this.view === 'table' ? '' : 'none';
        this.el.jsonView.style.display       = !loading && this.view === 'json'  ? '' : 'none';
        this.el.paginationBar.style.display  = loading ? 'none' : '';
    }

    // ── Settings Modal ────────────────────────────────────────

    openSettings() {
        const { hostInput, portInput, protocolInput, extraTenantsInput, testResult, settingsModal } = this.el;
        hostInput.value     = this.cfg.host     || 'localhost';
        portInput.value     = this.cfg.port     || 5001;
        protocolInput.value = this.cfg.protocol || 'http';
        extraTenantsInput.value = this.cfg.extraTenants || '';
        this.el.persistPathInput.value = this.cfg.persistPath || '';
        testResult.textContent = '';
        testResult.className   = 'test-result';
        this.updateUrlPreview();
        settingsModal.style.display = 'flex';
    }

    closeSettings() {
        this.el.settingsModal.style.display = 'none';
    }

    updateUrlPreview() {
        const { hostInput, portInput, protocolInput, urlPreview } = this.el;
        urlPreview.textContent =
            `${protocolInput.value || 'http'}://${hostInput.value || 'localhost'}:${portInput.value || 5001}`;
    }

    async testConnectionModal() {
        const { testConnBtn, testResult } = this.el;
        testConnBtn.disabled = true;
        testResult.className = 'test-result';
        testResult.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing…';

        const tmpCfg = {
            protocol: this.el.protocolInput.value,
            host:     this.el.hostInput.value.trim() || 'localhost',
            port:     parseInt(this.el.portInput.value) || 5001
        };

        const lib = new ChromaLibraryAPI(tmpCfg);
        if (await lib.detect()) {
            testConnBtn.disabled = false;
            testResult.className = 'test-result success';
            testResult.innerHTML =
                '<i class="fas fa-check-circle"></i> Connected · chromadb (Python) via this app';
            return;
        }

        const probe = new ChromaAPI(this.buildBaseUrl(tmpCfg));
        const v = await probe.detect();
        testConnBtn.disabled = false;

        if (v) {
            testResult.className = 'test-result success';
            testResult.innerHTML = `<i class="fas fa-check-circle"></i> Connected · API ${v.toUpperCase()} (browser → Chroma)`;
        } else {
            testResult.className = 'test-result error';
            testResult.innerHTML = `<i class="fas fa-times-circle"></i> Connection failed`;
        }
    }

    async saveAndConnect() {
        const host     = this.el.hostInput.value.trim()           || 'localhost';
        const port     = parseInt(this.el.portInput.value)         || 5001;
        const protocol = this.el.protocolInput.value               || 'http';
        const extraTenants = this.el.extraTenantsInput.value.trim();
        const persistPath = this.el.persistPathInput.value.trim();

        this.cfg = { ...this.cfg, host, port, protocol, extraTenants, persistPath };
        this.saveConfig();
        this.closeSettings();

        // Full re-init
        this.activeCollId   = null;
        this.activeCollName = null;
        this.collections    = [];
        this.currentData    = null;
        this.el.collList.innerHTML = '';
        this.el.contextBar.style.display = 'none';
        await this.boot();
    }

    // ── Config Persistence ────────────────────────────────────

    loadConfig() {
        try {
            const s = localStorage.getItem('chromaExplorer2');
            if (s) return { host: 'localhost', port: 5001, protocol: 'http', ...JSON.parse(s) };
        } catch { /* ignore */ }
        return { host: 'localhost', port: 5001, protocol: 'http', extraTenants: '', persistPath: '' };
    }

    saveConfig() {
        try {
            localStorage.setItem('chromaExplorer2', JSON.stringify({
                ...this.cfg,
                tenant:   this.tenant,
                database: this.database,
                extraTenants: this.cfg.extraTenants || '',
                persistPath: this.cfg.persistPath || ''
            }));
        } catch { /* ignore */ }
    }

    buildBaseUrl(c) {
        return `${c.protocol || 'http'}://${c.host || 'localhost'}:${c.port || 5001}`;
    }
}

// ── Boot ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    window.chromaExplorer = new ChromaExplorer();
});
