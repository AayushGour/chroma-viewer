#!/usr/bin/env python3
"""
Simple HTTP Server for Chroma Database Explorer
Run this script to serve the SPA and avoid CORS issues
"""

import http.server
import socketserver
import webbrowser
import os
import sys
from pathlib import Path

PORT = 5000
DIRECTORY = Path(__file__).parent


class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP Request Handler with CORS headers"""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()


def main():
    """Start the HTTP server"""
    os.chdir(DIRECTORY)

    try:
        with socketserver.TCPServer(("", PORT), CORSHTTPRequestHandler) as httpd:
            print(f"🚀 Starting Chroma Database Explorer server...")
            print(f"📂 Serving directory: {DIRECTORY}")
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
