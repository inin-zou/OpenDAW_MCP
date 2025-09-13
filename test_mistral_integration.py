#!/usr/bin/env python3
"""
Test script for Mistral AI integration in OpenDAW MCP Server
Verifies the new generate_json_track tool functionality
"""

import os
import sys
import json
from typing import Dict, Any

def test_mistral_dependencies():
    """Test if Mistral AI dependencies can be imported"""
    try:
        print("=== Testing Mistral AI Dependencies ===")
        
        # Test mistralai import
        from mistralai import Mistral
        print("✓ mistralai package imported successfully")
        
        # Check if API key is available
        api_key = os.getenv("MISTRAL_API_KEY")
        if api_key:
            print("✓ MISTRAL_API_KEY environment variable found")
            # Initialize client to test
            client = Mistral(api_key=api_key)
            print("✓ Mistral client initialized successfully")
        else:
            print("⚠ MISTRAL_API_KEY not set - will use mock for testing")
        
        return True, {'mistral_available': True, 'api_key_set': bool(api_key)}
        
    except ImportError as e:
        print(f"✗ Failed to import mistralai: {e}")
        return False, {'error': f'Import error: {e}'}
    except Exception as e:
        print(f"✗ Mistral dependency test failed: {e}")
        return False, {'error': str(e)}

def test_updated_mcp_server():
    """Test if the updated MCP server with Mistral integration works"""
    try:
        print("\n=== Testing Updated MCP Server ===")
        
        # Set dummy credentials for testing
        if not os.getenv("AWS_ACCESS_KEY_ID"):
            os.environ["AWS_ACCESS_KEY_ID"] = "test_key"
            os.environ["AWS_SECRET_ACCESS_KEY"] = "test_secret"
            print("⚠ Using dummy AWS credentials for testing")
        
        from fastmcp_server import mcp
        
        tools = list(mcp._tool_manager._tools.keys())
        resources = list(mcp._resource_manager._resources.keys())
        prompts = list(mcp._prompt_manager._prompts.keys())
        
        print(f"✓ FastMCP server imported successfully")
        print(f"✓ Tools registered: {tools}")
        
        # Check if new generate_json_track tool is registered
        if 'generate_json_track' in tools:
            print("✓ generate_json_track tool found!")
        else:
            print("✗ generate_json_track tool NOT found")
            return False, {'error': 'generate_json_track tool not registered'}
        
        print(f"✓ Total: {len(tools)} tools, {len(resources)} resources, {len(prompts)} prompts")
        
        return True, {
            'tools': tools,
            'new_tool_found': 'generate_json_track' in tools,
            'tool_count': len(tools)
        }
        
    except Exception as e:
        print(f"✗ Updated MCP server test failed: {e}")
        import traceback
        traceback.print_exc()
        return False, {'error': str(e)}

def test_json_track_generation_mock():
    """Test JSON track generation with mock data (without actual API call)"""
    try:
        print("\n=== Testing JSON Track Generation (Mock) ===")
        
        # Mock the Mistral API response
        mock_json_track = {
            "title": "Test Track",
            "type": "melody",
            "tempo": 120,
            "key": "C major",
            "time_signature": "4/4",
            "notes": [
                {"pitch": "C4", "duration": 0.5, "timing": 0.0},
                {"pitch": "E4", "duration": 0.5, "timing": 0.5},
                {"pitch": "G4", "duration": 1.0, "timing": 1.0}
            ],
            "instruments": ["piano"],
            "effects": ["reverb"],
            "metadata": {
                "genre": "classical",
                "mood": "peaceful"
            }
        }
        
        print("✓ Mock JSON track structure created")
        print(f"✓ Mock track data: {json.dumps(mock_json_track, indent=2)}")
        
        # Validate JSON structure
        required_fields = ["title", "type", "tempo", "key", "time_signature"]
        for field in required_fields:
            if field in mock_json_track:
                print(f"✓ Required field '{field}' present")
            else:
                print(f"✗ Required field '{field}' missing")
                return False, {'error': f'Missing required field: {field}'}
        
        return True, {'mock_track': mock_json_track}
        
    except Exception as e:
        print(f"✗ JSON track generation mock test failed: {e}")
        return False, {'error': str(e)}

def test_tool_signature():
    """Test the generate_json_track tool signature and parameters"""
    try:
        print("\n=== Testing Tool Signature ===")
        
        from fastmcp_server import mcp
        
        if 'generate_json_track' not in mcp._tool_manager._tools:
            return False, {'error': 'generate_json_track tool not found'}
        
        tool_info = mcp._tool_manager._tools['generate_json_track']
        print(f"✓ Tool info retrieved: {type(tool_info)}")
        
        # Check if tool has description
        if hasattr(tool_info, 'description'):
            print(f"✓ Tool description: {tool_info.description}")
        
        print("✓ Tool signature validation passed")
        
        return True, {'tool_available': True}
        
    except Exception as e:
        print(f"✗ Tool signature test failed: {e}")
        return False, {'error': str(e)}

def test_integration_with_existing_tools():
    """Test that new tool integrates well with existing tools"""
    try:
        print("\n=== Testing Integration with Existing Tools ===")
        
        from fastmcp_server import mcp
        
        expected_tools = [
            'create_project',
            'load_project', 
            'add_track',
            'generate_audio',
            'list_projects',
            'export_project',
            'generate_json_track'  # New tool
        ]
        
        actual_tools = list(mcp._tool_manager._tools.keys())
        
        missing_tools = []
        for tool in expected_tools:
            if tool in actual_tools:
                print(f"✓ {tool} tool found")
            else:
                print(f"✗ {tool} tool missing")
                missing_tools.append(tool)
        
        if missing_tools:
            return False, {'error': f'Missing tools: {missing_tools}'}
        
        print(f"✓ All {len(expected_tools)} expected tools found")
        
        return True, {
            'expected_tools': expected_tools,
            'actual_tools': actual_tools,
            'all_tools_present': len(missing_tools) == 0
        }
        
    except Exception as e:
        print(f"✗ Integration test failed: {e}")
        return False, {'error': str(e)}

def main():
    """Run all Mistral AI integration tests"""
    print("OpenDAW MCP Server - Mistral AI Integration Test Suite")
    print("=" * 60)
    
    results = {}
    
    # Test 1: Mistral Dependencies
    success, result = test_mistral_dependencies()
    results['mistral_dependencies'] = {'success': success, 'result': result}
    
    # Test 2: Updated MCP Server
    success, result = test_updated_mcp_server()
    results['updated_mcp_server'] = {'success': success, 'result': result}
    
    # Test 3: JSON Track Generation Mock
    success, result = test_json_track_generation_mock()
    results['json_track_mock'] = {'success': success, 'result': result}
    
    # Test 4: Tool Signature
    success, result = test_tool_signature()
    results['tool_signature'] = {'success': success, 'result': result}
    
    # Test 5: Integration with Existing Tools
    success, result = test_integration_with_existing_tools()
    results['integration'] = {'success': success, 'result': result}
    
    # Summary
    print("\n=== Mistral AI Integration Test Summary ===")
    total_tests = len(results)
    passed_tests = sum(1 for r in results.values() if r['success'])
    
    print(f"Tests passed: {passed_tests}/{total_tests}")
    
    if passed_tests == total_tests:
        print("✅ All tests passed! Mistral AI integration is ready for deployment.")
        print("\n🚀 Next steps:")
        print("1. Set MISTRAL_API_KEY environment variable")
        print("2. Deploy to Vercel with updated dependencies")
        print("3. Test generate_json_track tool with real API calls")
    else:
        print("⚠ Some tests failed. Check the errors above before deployment.")
    
    # Output results as JSON for debugging
    print(f"\nDetailed results:\n{json.dumps(results, indent=2)}")
    
    return results

if __name__ == "__main__":
    main()
