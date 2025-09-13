#!/usr/bin/env python3
"""
AWS Lambda Handler for OpenDAW FastMCP Server
Handles MCP requests in Lambda environment
"""

import json
import os
import sys
from typing import Dict, Any

# Add current directory to Python path
sys.path.insert(0, '/var/task')

# Import the FastMCP server
from fastmcp_server import mcp

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for MCP requests
    """
    try:
        # Set default environment variables if not present
        if not os.getenv("AWS_ACCESS_KEY_ID"):
            # These should be set in Lambda environment or IAM role
            print("Warning: AWS credentials not found in environment")
        
        # Handle different types of requests
        if event.get('httpMethod'):
            # HTTP API Gateway request
            return handle_http_request(event, context)
        else:
            # Direct Lambda invocation
            return handle_direct_invocation(event, context)
            
    except Exception as e:
        print(f"Lambda handler error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': f'Internal server error: {str(e)}'
            })
        }

def handle_http_request(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle HTTP API Gateway requests"""
    try:
        method = event.get('httpMethod', 'GET')
        path = event.get('path', '/')
        
        if method == 'GET' and path == '/health':
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'status': 'healthy',
                    'server': 'OpenDAW MCP Server',
                    'tools': len(mcp._tool_manager._tools),
                    'resources': len(mcp._resource_manager._resources),
                    'prompts': len(mcp._prompt_manager._prompts)
                })
            }
        
        elif method == 'GET' and path == '/tools':
            # List available tools
            tools = []
            for tool_name, tool_info in mcp._tool_manager._tools.items():
                tools.append({
                    'name': tool_name,
                    'description': getattr(tool_info, 'description', 'No description'),
                })
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'tools': tools,
                    'count': len(tools)
                })
            }
        
        elif method == 'POST' and path == '/mcp':
            # Handle MCP protocol requests
            body = event.get('body', '{}')
            if isinstance(body, str):
                body = json.loads(body)
            
            # This would need proper MCP protocol handling
            # For now, return available capabilities
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'jsonrpc': '2.0',
                    'result': {
                        'capabilities': {
                            'tools': list(mcp._tool_manager._tools.keys()),
                            'resources': list(mcp._resource_manager._resources.keys()),
                            'prompts': list(mcp._prompt_manager._prompts.keys())
                        }
                    }
                })
            }
        
        else:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Not found'})
            }
            
    except Exception as e:
        print(f"HTTP request error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def handle_direct_invocation(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle direct Lambda invocations"""
    try:
        action = event.get('action', 'list_capabilities')
        
        if action == 'list_capabilities':
            return {
                'tools': list(mcp._tool_manager._tools.keys()),
                'resources': list(mcp._resource_manager._resources.keys()),
                'prompts': list(mcp._prompt_manager._prompts.keys()),
                'tool_count': len(mcp._tool_manager._tools),
                'resource_count': len(mcp._resource_manager._resources),
                'prompt_count': len(mcp._prompt_manager._prompts)
            }
        
        elif action == 'call_tool':
            tool_name = event.get('tool_name')
            tool_args = event.get('tool_args', {})
            
            if tool_name not in mcp._tool_manager._tools:
                return {'error': f'Tool {tool_name} not found'}
            
            try:
                tool_func = mcp._tool_manager._tools[tool_name]
                result = tool_func(**tool_args)
                return {'result': result}
            except Exception as e:
                return {'error': f'Tool execution error: {str(e)}'}
        
        elif action == 'test_storage':
            # Test storage connectivity
            try:
                from storage_manager import StorageManager
                storage = StorageManager()
                projects = storage._sync_list_projects()
                return {
                    'storage_status': 'connected',
                    'project_count': len(projects)
                }
            except Exception as e:
                return {
                    'storage_status': 'error',
                    'error': str(e)
                }
        
        else:
            return {'error': f'Unknown action: {action}'}
            
    except Exception as e:
        print(f"Direct invocation error: {str(e)}")
        return {'error': str(e)}

# For testing locally
if __name__ == "__main__":
    # Test the handler
    test_event = {'action': 'list_capabilities'}
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))
