#!/usr/bin/env python3
"""
CORS Proxy Server for Chroma Database Explorer
This server acts as a proxy to bypass CORS restrictions when connecting to remote Chroma instances.
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import sys
import os
from pathlib import Path


class CORSProxyHandler(http.server.BaseHTTPRequestHandler):
    """HTTP Request Handler that proxies requests and adds CORS headers"""

    def __init__(self, *args, target_host="localhost", target_port=8000, **kwargs):
        self.target_host = target_host
        self.target_port = target_port
        super().__init__(*args, **kwargs)

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
            with urllib.request.urlopen(req, timeout=30) as response:
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
                self.wfile.write(response.read())

        except urllib.error.HTTPError as e:
            # Handle HTTP errors from target server
            print(f"[PROXY] HTTP Error {e.code}: {e.reason}")
            try:
                error_body = e.read().decode("utf-8")
                print(f"[PROXY] Error response body: {error_body}")
            except:
                pass

            self.send_response(e.code)
            self.add_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()

            error_response = {"error": f"HTTP {e.code}", "message": str(e.reason)}
            self.wfile.write(json.dumps(error_response).encode())

        except Exception as e:
            # Handle other errors
            self.send_response(500)
            self.add_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()

            error_response = {"error": "Proxy Error", "message": str(e)}
            self.wfile.write(json.dumps(error_response).encode())

    def log_message(self, format, *args):
        """Override to customize logging"""
        print(f"[PROXY] {format % args}")


def create_handler_class(target_host, target_port):
    """Create a handler class with the target server configuration"""

    class ConfiguredHandler(CORSProxyHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(
                *args, target_host=target_host, target_port=target_port, **kwargs
            )

    return ConfiguredHandler


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

    args = parser.parse_args()

    # Create handler with target configuration
    handler_class = create_handler_class(args.target_host, args.target_port)

    try:
        with socketserver.TCPServer(("", args.proxy_port), handler_class) as httpd:
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
