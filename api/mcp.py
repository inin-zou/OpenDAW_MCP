#!/usr/bin/env python3
"""
MCP Server endpoint for Vercel deployment
Implements proper MCP protocol for client connections
"""

import os
import sys
import json
from typing import Dict, Any

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def handler(request, context=None):
    """Vercel serverless function handler"""
    try:
        # Import MCP server components
        from fastmcp_server import mcp
        
        # Set dummy AWS credentials if not present
        if not os.getenv("AWS_ACCESS_KEY_ID"):
            os.environ["AWS_ACCESS_KEY_ID"] = "dummy_key"
            os.environ["AWS_SECRET_ACCESS_KEY"] = "dummy_secret"
        
        # Extract method from request
        method = getattr(request, 'method', 'GET')
        
        if method == 'GET':
            # Return MCP server info
            response = get_server_info(mcp)
        elif method == 'POST':
            # Handle MCP JSON-RPC requests
            try:
                body = getattr(request, 'body', '{}')
                if isinstance(body, bytes):
                    body = body.decode('utf-8')
                request_data = json.loads(body) if body else {}
            except (json.JSONDecodeError, AttributeError):
                request_data = {}
            
            response = handle_mcp_request(request_data, mcp)
        else:
            response = {
                'error': 'Method not allowed',
                'message': 'Only GET and POST methods are supported'
            }
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            'body': json.dumps(response)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'message': 'MCP Server Error'
            })
        }

def handle_mcp_request(body: Dict[str, Any], mcp) -> Dict[str, Any]:
    """Handle MCP JSON-RPC requests"""
    method = body.get('method')
    params = body.get('params', {})
    request_id = body.get('id')
    
    try:
        if method == 'initialize':
            result = {
                'protocolVersion': '2024-11-05',
                'capabilities': {
                    'tools': {},
                    'resources': {},
                    'prompts': {}
                },
                'serverInfo': {
                    'name': 'OpenDAW MCP Server',
                    'version': '1.0.0'
                }
            }
        
        elif method == 'tools/list':
            tools = []
            for tool_name, tool_info in mcp._tool_manager._tools.items():
                tools.append({
                    'name': tool_name,
                    'description': getattr(tool_info, 'description', 'No description'),
                    'inputSchema': {
                        'type': 'object',
                        'properties': {},
                        'required': []
                    }
                })
            result = {'tools': tools}
        
        elif method == 'tools/call':
            tool_name = params.get('name')
            arguments = params.get('arguments', {})
            
            if tool_name in mcp._tool_manager._tools:
                tool_func = mcp._tool_manager._tools[tool_name]
                try:
                    # Call the tool function
                    if hasattr(tool_func, 'func'):
                        tool_result = tool_func.func(**arguments)
                    else:
                        tool_result = tool_func(**arguments)
                    
                    result = {
                        'content': [
                            {
                                'type': 'text',
                                'text': str(tool_result)
                            }
                        ]
                    }
                except Exception as e:
                    result = {
                        'content': [
                            {
                                'type': 'text',
                                'text': f'Error calling tool {tool_name}: {str(e)}'
                            }
                        ],
                        'isError': True
                    }
            else:
                result = {
                    'content': [
                        {
                            'type': 'text',
                            'text': f'Tool {tool_name} not found'
                        }
                    ],
                    'isError': True
                }
        
        elif method == 'resources/list':
            resources = []
            for resource_name, resource_info in mcp._resource_manager._resources.items():
                resources.append({
                    'uri': f'resource://{resource_name}',
                    'name': resource_name,
                    'description': getattr(resource_info, 'description', 'No description'),
                    'mimeType': 'application/json'
                })
            result = {'resources': resources}
        
        elif method == 'prompts/list':
            prompts = []
            for prompt_name, prompt_info in mcp._prompt_manager._prompts.items():
                prompts.append({
                    'name': prompt_name,
                    'description': getattr(prompt_info, 'description', 'No description'),
                    'arguments': []
                })
            result = {'prompts': prompts}
        
        else:
            result = {
                'error': {
                    'code': -32601,
                    'message': f'Method not found: {method}'
                }
            }
        
        response = {
            'jsonrpc': '2.0',
            'id': request_id,
            'result': result
        }
        
        return response
    
    except Exception as e:
        error_response = {
            'jsonrpc': '2.0',
            'id': request_id,
            'error': {
                'code': -32603,
                'message': f'Internal error: {str(e)}'
            }
        }
        
        return error_response

def get_server_info(mcp) -> Dict[str, Any]:
    """Get server information"""
    tools_count = len(mcp._tool_manager._tools)
    resources_count = len(mcp._resource_manager._resources)
    prompts_count = len(mcp._prompt_manager._prompts)
    
    return {
        'name': 'OpenDAW MCP Server',
        'version': '1.0.0',
        'protocol': 'MCP',
        'protocolVersion': '2024-11-05',
        'status': 'healthy',
        'tools': tools_count,
        'resources': resources_count,
        'prompts': prompts_count,
        'endpoints': {
            'mcp': '/api/mcp',
            'capabilities': '/api/mcp/capabilities',
            'tools': '/api/mcp/tools',
            'resources': '/api/mcp/resources',
            'prompts': '/api/mcp/prompts'
        }
    }
