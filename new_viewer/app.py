#!/usr/bin/env python3
"""
ChromaDB Database Visualizer - Simple Flask Server
Serves the SPA static files
"""

import os
from flask import Flask, send_from_directory
from flask_cors import CORS
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
STATIC_FOLDER = os.path.dirname(os.path.abspath(__file__))


@app.route("/")
def index():
    """Serve the main SPA page"""
    return send_from_directory(STATIC_FOLDER, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    """Serve static files (CSS, JS, etc.)"""
    return send_from_directory(STATIC_FOLDER, filename)


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors by serving the SPA (for client-side routing)"""
    return send_from_directory(STATIC_FOLDER, "index.html")


if __name__ == "__main__":
    # Run the Flask app
    logger.info("Starting ChromaDB Database Visualizer...")
    logger.info("Access the application at: http://localhost:8080")

    app.run(host="0.0.0.0", port=8080, debug=True, threaded=True)
