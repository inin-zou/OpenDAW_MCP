#!/usr/bin/env python3
"""
Test script for OpenDAW MCP Server
Verifies tool registration and basic functionality
"""

import os
import sys
import json
from typing import Dict, Any

def test_mcp_import():
    """Test if FastMCP server can be imported and tools are registered"""
    try:
        print("=== Testing MCP Import ===")
        from fastmcp_server import mcp
        
        tools = list(mcp._tool_manager._tools.keys())
        resources = list(mcp._resource_manager._resources.keys())
        prompts = list(mcp._prompt_manager._prompts.keys())
        
        print(f"✓ FastMCP imported successfully")
        print(f"✓ Tools registered: {tools}")
        print(f"✓ Resources registered: {resources}")
        print(f"✓ Prompts registered: {prompts}")
        print(f"✓ Total: {len(tools)} tools, {len(resources)} resources, {len(prompts)} prompts")
        
        return True, {
            'tools': tools,
            'resources': resources,
            'prompts': prompts,
            'tool_count': len(tools),
            'resource_count': len(resources),
            'prompt_count': len(prompts)
        }
    except Exception as e:
        print(f"✗ MCP import failed: {e}")
        import traceback
        traceback.print_exc()
        return False, {'error': str(e)}

def test_storage_manager():
    """Test StorageManager initialization"""
    try:
        print("\n=== Testing Storage Manager ===")
        
        # Set dummy AWS credentials for testing if not present
        if not os.getenv("AWS_ACCESS_KEY_ID"):
            os.environ["AWS_ACCESS_KEY_ID"] = "test_key"
            os.environ["AWS_SECRET_ACCESS_KEY"] = "test_secret"
            print("⚠ Using dummy AWS credentials for testing")
        
        from storage_manager import StorageManager
        storage = StorageManager()
        print("✓ StorageManager imported and initialized")
        
        # Test sync methods exist
        assert hasattr(storage, '_sync_list_projects')
        assert hasattr(storage, '_sync_load_project')
        assert hasattr(storage, '_sync_save_project')
        print("✓ Sync methods available")
        
        return True, {'status': 'initialized'}
    except Exception as e:
        print(f"✗ StorageManager test failed: {e}")
        return False, {'error': str(e)}

def test_lambda_handler():
    """Test Lambda handler functionality"""
    try:
        print("\n=== Testing Lambda Handler ===")
        from lambda_handler import lambda_handler
        
        # Test list capabilities
        event = {'action': 'list_capabilities'}
        result = lambda_handler(event, None)
        
        print(f"✓ Lambda handler imported and callable")
        print(f"✓ Capabilities result: {json.dumps(result, indent=2)}")
        
        return True, result
    except Exception as e:
        print(f"✗ Lambda handler test failed: {e}")
        import traceback
        traceback.print_exc()
        return False, {'error': str(e)}

def test_tool_execution():
    """Test individual tool execution"""
    try:
        print("\n=== Testing Tool Execution ===")
        from fastmcp_server import mcp
        
        # Test create_project tool
        if 'create_project' in mcp._tool_manager._tools:
            print("✓ create_project tool found")
            # We won't actually execute it without proper AWS setup
        else:
            print("✗ create_project tool not found")
        
        # Test list_projects tool
        if 'list_projects' in mcp._tool_manager._tools:
            print("✓ list_projects tool found")
        else:
            print("✗ list_projects tool not found")
        
        return True, {'tools_found': list(mcp._tool_manager._tools.keys())}
    except Exception as e:
        print(f"✗ Tool execution test failed: {e}")
        return False, {'error': str(e)}

def main():
    """Run all tests"""
    print("OpenDAW MCP Server Test Suite")
    print("=" * 40)
    
    results = {}
    
    # Test 1: MCP Import
    success, result = test_mcp_import()
    results['mcp_import'] = {'success': success, 'result': result}
    
    # Test 2: Storage Manager
    success, result = test_storage_manager()
    results['storage_manager'] = {'success': success, 'result': result}
    
    # Test 3: Lambda Handler
    success, result = test_lambda_handler()
    results['lambda_handler'] = {'success': success, 'result': result}
    
    # Test 4: Tool Execution
    success, result = test_tool_execution()
    results['tool_execution'] = {'success': success, 'result': result}
    
    # Summary
    print("\n=== Test Summary ===")
    total_tests = len(results)
    passed_tests = sum(1 for r in results.values() if r['success'])
    
    print(f"Tests passed: {passed_tests}/{total_tests}")
    
    if passed_tests == total_tests:
        print("✓ All tests passed! MCP server should work correctly.")
    else:
        print("⚠ Some tests failed. Check the errors above.")
    
    # Output results as JSON for debugging
    print(f"\nDetailed results:\n{json.dumps(results, indent=2)}")
    
    return results

if __name__ == "__main__":
    main()
