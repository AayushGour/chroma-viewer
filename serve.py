#!/usr/bin/env python3
"""
Simple HTTP Server for Chroma Database Explorer
Run this script to serve the SPA and avoid CORS issues
"""

import http.server
import socketserver
import socket
import webbrowser
import os
import sys
import urllib.parse
from pathlib import Path

PORT = 5000
DIRECTORY = Path(__file__).parent

try:
    from explorer_backend import handle_request as explorer_handle_request

    HAS_EXPLORER_API = True
except ImportError:
    HAS_EXPLORER_API = False
    explorer_handle_request = None


def _send_explorer(handler, status: int, content_type: str, body: bytes) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP Request Handler with CORS headers + optional /api/explorer (chromadb client)."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/explorer"):
            if not HAS_EXPLORER_API:
                msg = b'{"error":"Install chromadb: pip install -r requirements.txt"}'
                _send_explorer(self, 503, "application/json", msg)
                return
            path_q = parsed.path
            if parsed.query:
                path_q = f"{parsed.path}?{parsed.query}"
            status, ctype, body = explorer_handle_request("GET", path_q, None)
            _send_explorer(self, status, ctype, body)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/explorer"):
            if not HAS_EXPLORER_API:
                msg = b'{"error":"Install chromadb: pip install -r requirements.txt"}'
                _send_explorer(self, 503, "application/json", msg)
                return
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else None
            path_q = parsed.path
            if parsed.query:
                path_q = f"{parsed.path}?{parsed.query}"
            status, ctype, body = explorer_handle_request("POST", path_q, raw)
            _send_explorer(self, status, ctype, body)
            return
        self.send_error(405, "Method not allowed")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/explorer"):
            if not HAS_EXPLORER_API:
                msg = b'{"error":"Install chromadb: pip install -r requirements.txt"}'
                _send_explorer(self, 503, "application/json", msg)
                return
            path_q = parsed.path
            if parsed.query:
                path_q = f"{parsed.path}?{parsed.query}"
            status, ctype, body = explorer_handle_request("DELETE", path_q, None)
            _send_explorer(self, status, ctype, body)
            return
        self.send_error(405, "Method not allowed")


def create_http_server(port, handler_class):
    """Create a TCP server that accepts localhost IPv4 and IPv6."""

    class DualStackTCPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    if socket.has_ipv6:
        class DualStackIPv6Server(DualStackTCPServer):
            address_family = socket.AF_INET6

            def server_bind(self):
                try:
                    self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
                except OSError:
                    pass
                super().server_bind()

        try:
            return DualStackIPv6Server(("::", port), handler_class)
        except OSError:
            pass

    return DualStackTCPServer(("", port), handler_class)


def main():
    """Start the HTTP server"""
    os.chdir(DIRECTORY)

    try:
        with create_http_server(PORT, CORSHTTPRequestHandler) as httpd:
            print(f"🚀 Starting Chroma Database Explorer server...")
            print(f"📂 Serving directory: {DIRECTORY}")
            if HAS_EXPLORER_API:
                print(f"🐍 chromadb explorer API: /api/explorer/* (Python client → your Chroma host)")
            else:
                print(f"⚠️  chromadb not installed — only static UI + direct REST. Run: pip install -r requirements.txt")
            print(f"🌐 Server running at: http://localhost:{PORT}")
            print(f"📱 Opening browser...")
            print(f"🛑 Press Ctrl+C to stop the server")
            print("-" * 50)

            # Open browser automatically
            webbrowser.open(f"http://localhost:{PORT}")

            # Start server
            httpd.serve_forever()

    except KeyboardInterrupt:
        print(f"\n🛑 Server stopped by user")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {PORT} is already in use!")
            print(f"💡 Try a different port or stop the existing server")
        else:
            print(f"❌ Error starting server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
