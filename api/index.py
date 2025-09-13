#!/usr/bin/env python3
"""
Vercel API endpoint for OpenDAW MCP Server
"""

import sys
import os
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests"""
        try:
            # Import here to avoid module loading issues
            from lambda_handler import handle_http_request
            
            # Parse URL
            parsed_url = urlparse(self.path)
            
            # Create event
            event = {
                'httpMethod': 'GET',
                'path': parsed_url.path,
                'queryStringParameters': parse_qs(parsed_url.query),
                'headers': dict(self.headers)
            }
            
            # Call handler
            response = handle_http_request(event, None)
            
            # Send response
            self.send_response(response.get('statusCode', 200))
            
            # Send headers
            headers = response.get('headers', {})
            for key, value in headers.items():
                self.send_header(key, value)
            self.end_headers()
            
            # Send body
            body = response.get('body', '')
            if isinstance(body, str):
                body = body.encode('utf-8')
            self.wfile.write(body)
            
        except Exception as e:
            # Error response
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            error_response = {
                'error': str(e),
                'message': 'OpenDAW MCP Server Error'
            }
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
    
    def do_POST(self):
        """Handle POST requests"""
        try:
            # Import here to avoid module loading issues
            from lambda_handler import handle_http_request
            
            # Get content length
            content_length = int(self.headers.get('Content-Length', 0))
            
            # Read body
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else None
            
            # Parse URL
            parsed_url = urlparse(self.path)
            
            # Create event
            event = {
                'httpMethod': 'POST',
                'path': parsed_url.path,
                'queryStringParameters': parse_qs(parsed_url.query),
                'headers': dict(self.headers),
                'body': body
            }
            
            # Call handler
            response = handle_http_request(event, None)
            
            # Send response
            self.send_response(response.get('statusCode', 200))
            
            # Send headers
            headers = response.get('headers', {})
            for key, value in headers.items():
                self.send_header(key, value)
            self.end_headers()
            
            # Send body
            body = response.get('body', '')
            if isinstance(body, str):
                body = body.encode('utf-8')
            self.wfile.write(body)
            
        except Exception as e:
            # Error response
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            error_response = {
                'error': str(e),
                'message': 'OpenDAW MCP Server Error'
            }
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
