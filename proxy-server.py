#!/usr/bin/env python3
"""
CORS Proxy Server for Chroma Database Explorer
This server acts as a proxy to bypass CORS restrictions when connecting to remote Chroma instances.
"""

import http.server
import socketserver
import socket
import urllib.request
import urllib.parse
import urllib.error
import json
import sys
import os
from pathlib import Path


class CORSProxyHandler(http.server.BaseHTTPRequestHandler):
    """HTTP Request Handler that proxies requests and adds CORS headers"""

    def __init__(self, *args, target_host="localhost", target_port=8000, timeout=30, **kwargs):
        self.target_host = target_host
        self.target_port = target_port
        self.upstream_timeout = timeout
        super().__init__(*args, **kwargs)

    def _safe_write_body(self, data: bytes) -> None:
        """Avoid crashing the worker thread if the client already closed the connection."""
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        try:
            self.send_response(status)
            self.add_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self._safe_write_body(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def add_cors_headers(self):
        """Add CORS headers to the response"""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Requested-With",
        )
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        """Handle preflight OPTIONS requests"""
        self.send_response(200)
        self.add_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Handle GET requests"""
        self.proxy_request("GET")

    def do_POST(self):
        """Handle POST requests"""
        self.proxy_request("POST")

    def do_PUT(self):
        """Handle PUT requests"""
        self.proxy_request("PUT")

    def do_DELETE(self):
        """Handle DELETE requests"""
        self.proxy_request("DELETE")

    def proxy_request(self, method):
        """Proxy the request to the target Chroma server"""
        try:
            # Build target URL
            target_url = f"http://{self.target_host}:{self.target_port}{self.path}"

            # Prepare request data
            content_length = self.headers.get("Content-Length")
            post_data = None

            if content_length:
                post_data = self.rfile.read(int(content_length))
                # Log the request data for debugging
                if post_data:
                    print(
                        f"[PROXY] Request body: {post_data.decode('utf-8', errors='ignore')}"
                    )

            print(f"[PROXY] {method} {target_url}")

            # Create request
            req = urllib.request.Request(target_url, data=post_data, method=method)

            # Copy relevant headers (excluding host)
            for header_name, header_value in self.headers.items():
                if header_name.lower() not in ["host", "origin", "referer"]:
                    req.add_header(header_name, header_value)

            # Make request to target server
            with urllib.request.urlopen(req, timeout=self.upstream_timeout) as response:
                # Send response status
                self.send_response(response.getcode())

                # Add CORS headers
                self.add_cors_headers()

                # Copy response headers
                for header_name, header_value in response.headers.items():
                    if header_name.lower() not in ["transfer-encoding", "connection"]:
                        self.send_header(header_name, header_value)

                self.end_headers()

                # Copy response body
                self._safe_write_body(response.read())

        except urllib.error.HTTPError as e:
            # Handle HTTP errors from target server
            print(f"[PROXY] HTTP Error {e.code}: {e.reason}")
            try:
                error_body = e.read().decode("utf-8")
                print(f"[PROXY] Error response body: {error_body}")
            except Exception:
                pass

            try:
                self.send_response(e.code)
                self.add_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                error_response = {"error": f"HTTP {e.code}", "message": str(e.reason)}
                self._safe_write_body(json.dumps(error_response).encode())
            except (BrokenPipeError, ConnectionResetError):
                pass

        except urllib.error.URLError as e:
            # Timeouts, connection refused, DNS failures, etc.
            reason = getattr(e, "reason", None)
            rs = str(reason) if reason is not None else str(e)
            if isinstance(reason, TimeoutError) or "timed out" in rs.lower():
                code = 504
                msg = (
                    "Upstream timed out connecting to "
                    f"{self.target_host}:{self.target_port}. "
                    "Check the host/port, firewall rules, VPN, and that Chroma is listening."
                )
                print(f"[PROXY] URLError (timeout): {e}")
            elif isinstance(reason, ConnectionRefusedError):
                code = 502
                msg = (
                    f"Connection refused by {self.target_host}:{self.target_port}. "
                    "Is Chroma running and reachable from this machine?"
                )
                print(f"[PROXY] URLError (refused): {e}")
            else:
                code = 502
                msg = f"Upstream unreachable: {rs}"
                print(f"[PROXY] URLError: {e}")

            self._send_json(code, {"error": "Bad Gateway" if code == 502 else "Gateway Timeout", "message": msg})

        except Exception as e:
            print(f"[PROXY] Unexpected error: {e!r}")
            self._send_json(500, {"error": "Proxy Error", "message": str(e)})

    def log_message(self, format, *args):
        """Override to customize logging"""
        print(f"[PROXY] {format % args}")


def create_handler_class(target_host, target_port, timeout=30):
    """Create a handler class with the target server configuration"""

    class ConfiguredHandler(CORSProxyHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(
                *args,
                target_host=target_host,
                target_port=target_port,
                timeout=timeout,
                **kwargs,
            )

    return ConfiguredHandler


def create_proxy_server(port, handler_class):
    """Create a TCP server that supports localhost on IPv4 and IPv6."""

    class DualStackTCPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    # Prefer IPv6 dual-stack so localhost works for both ::1 and 127.0.0.1.
    if socket.has_ipv6:
        class DualStackIPv6Server(DualStackTCPServer):
            address_family = socket.AF_INET6

            def server_bind(self):
                try:
                    self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
                except OSError:
                    # Some systems don't allow changing this option.
                    pass
                super().server_bind()

        try:
            return DualStackIPv6Server(("::", port), handler_class)
        except OSError:
            pass

    return DualStackTCPServer(("", port), handler_class)


def main():
    """Main function to start the proxy server"""
    import argparse

    parser = argparse.ArgumentParser(
        description="CORS Proxy Server for Chroma Database"
    )
    parser.add_argument(
        "--proxy-port",
        type=int,
        default=5001,
        help="Port for the proxy server (default: 5001)",
    )
    parser.add_argument(
        "--target-host",
        default="localhost",
        help="Target Chroma server host (default: localhost)",
    )
    parser.add_argument(
        "--target-port",
        type=int,
        default=8000,
        help="Target Chroma server port (default: 8000)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Upstream request timeout in seconds (default: 30)",
    )

    args = parser.parse_args()

    # Create handler with target configuration
    handler_class = create_handler_class(
        args.target_host, args.target_port, timeout=args.timeout
    )

    try:
        with create_proxy_server(args.proxy_port, handler_class) as httpd:
            print("🔗 CORS Proxy Server for Chroma Database")
            print("=" * 50)
            print(f"📡 Proxy running on: http://localhost:{args.proxy_port}")
            print(
                f"🎯 Target Chroma server: http://{args.target_host}:{args.target_port}"
            )
            print(f"🌐 Configure your app to use: http://localhost:{args.proxy_port}")
            print("=" * 50)
            print("💡 Usage in Chroma Explorer:")
            print(f"   - Host: localhost")
            print(f"   - Port: {args.proxy_port}")
            print(f"   - Protocol: http")
            print("=" * 50)
            print("🛑 Press Ctrl+C to stop the proxy server")
            print()

            httpd.serve_forever()

    except KeyboardInterrupt:
        print("\n🛑 Proxy server stopped by user")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {args.proxy_port} is already in use!")
            print(
                f"💡 Try a different port: python3 proxy-server.py --proxy-port {args.proxy_port + 1}"
            )
        else:
            print(f"❌ Error starting proxy server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
