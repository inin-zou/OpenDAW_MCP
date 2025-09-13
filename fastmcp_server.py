#!/usr/bin/env python3
"""
OpenDAW FastMCP Server
HTTP Streamable MCP Server for AI-assisted music production
Compatible with Alpic deployment platform
"""

import os
import json
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid
from pydantic import BaseModel, Field
from fastmcp import FastMCP
from mistralai import Mistral
import fastmcp
from storage_manager import StorageManager

# Initialize FastMCP server
mcp = FastMCP("OpenDAW MCP Server")

# Initialize storage manager (will be created when needed)
storage = None

def get_storage():
    """Get storage manager instance, creating it if needed"""
    global storage
    if storage is None:
        storage = StorageManager()
    return storage

@mcp.tool(
    title="Create Project",
    description="Create a new music project",
)
def create_project(
    name: str = Field(description="Project name"),
    tempo: int = Field(description="Tempo in BPM", default=120),
    time_signature: str = Field(description="Time signature", default="4/4")
) -> str:
    """Create a new music project"""
    try:
        project_id = str(uuid.uuid4())
        project_data = {
            "id": project_id,
            "name": name,
            "tempo": tempo,
            "timeSignature": time_signature,
            "tracks": [],
            "created": datetime.now().isoformat(),
            "lastModified": datetime.now().isoformat()
        }
        
        success = storage._sync_save_project(project_id, project_data)
        
        if success:
            return f"✅ Created project '{name}' with ID: {project_id}\n📊 Tempo: {tempo} BPM\n🎵 Time Signature: {time_signature}\n💾 Saved to cloud storage"
        else:
            return f"❌ Failed to save project to cloud storage"
        
    except Exception as e:
        return f"❌ Error creating project: {str(e)}"

@mcp.tool(
    title="Load Project",
    description="Load an existing project",
)
def load_project(
    project_id: str = Field(description="Project ID to load")
) -> str:
    """Load an existing project"""
    try:
        project_data = storage._sync_load_project(project_id)
        
        if not project_data:
            return f"❌ Project {project_id} not found"
        
        tracks_info = f"📊 Tracks: {len(project_data.get('tracks', []))}"
        if project_data.get('tracks'):
            track_list = "\n".join([f"  - {track['name']} ({track['type']})" 
                                  for track in project_data['tracks']])
            tracks_info += f"\n{track_list}"
        
        return f"✅ Loaded project '{project_data['name']}'\n🆔 ID: {project_id}\n🎵 Tempo: {project_data.get('tempo', 120)} BPM\n📅 Last Modified: {project_data.get('lastModified', 'Unknown')}\n{tracks_info}"
        
    except Exception as e:
        return f"❌ Error loading project: {str(e)}"

@mcp.tool(
    title="Add Track",
    description="Add a new track to a project",
)
def add_track(
    project_id: str = Field(description="Project ID"),
    name: str = Field(description="Track name"),
    track_type: str = Field(description="Track type: audio, midi, or instrument", default="audio")
) -> str:
    """Add a track to a project"""
    try:
        if track_type not in ["audio", "midi", "instrument"]:
            return "❌ Track type must be 'audio', 'midi', or 'instrument'"
        
        # Load existing project
        project_data = storage._sync_load_project(project_id)
        if not project_data:
            return f"❌ Project {project_id} not found"
        
        # Create new track
        track_id = str(uuid.uuid4())
        new_track = {
            "id": track_id,
            "name": name,
            "type": track_type,
            "volume": 0.8,
            "pan": 0.0,
            "mute": False,
            "solo": False,
            "effects": [],
            "clips": []
        }
        
        # Add track to project
        project_data["tracks"].append(new_track)
        project_data["lastModified"] = datetime.now().isoformat()
        
        # Save updated project
        success = storage._sync_save_project(project_id, project_data)
        
        if success:
            return f"✅ Added {track_type} track '{name}' to project\n🆔 Track ID: {track_id}\n📊 Total tracks: {len(project_data['tracks'])}"
        else:
            return f"❌ Failed to save updated project"
        
    except Exception as e:
        return f"❌ Error adding track: {str(e)}"

@mcp.tool(
    title="Generate Audio",
    description="Generate AI audio for a track",
)
def generate_audio(
    project_id: str = Field(description="Project ID"),
    track_id: str = Field(description="Track ID"),
    prompt: str = Field(description="Audio generation prompt"),
    duration: int = Field(description="Duration in seconds", default=30)
) -> str:
    """Generate AI audio for a track"""
    try:
        # This is a placeholder for AI audio generation
        # In a real implementation, this would call an AI audio generation service
        audio_id = str(uuid.uuid4())
        return f"🎵 Generated audio for track {track_id}\n🆔 Audio ID: {audio_id}\n📝 Prompt: {prompt}\n⏱️ Duration: {duration}s\n💡 Note: This is a placeholder - integrate with real AI audio generation service"
        
    except Exception as e:
        return f"❌ Error generating audio: {str(e)}"

@mcp.tool(
    title="Generate JSON Track",
    description="Generate a JSON track using Mistral AI multimodal LLM",
)
def generate_json_track(
    project_id: str = Field(description="Project ID"),
    track_name: str = Field(description="Track name"),
    prompt: str = Field(description="Description of the track to generate (e.g., 'upbeat electronic melody', 'ambient soundscape')"),
    track_type: str = Field(default="melody", description="Type of track: melody, rhythm, bass, harmony, ambient"),
) -> str:
    """Generate a JSON track using Mistral AI multimodal LLM"""
    try:
        # Check if Mistral API key is available
        mistral_api_key = os.getenv("MISTRAL_API_KEY")
        if not mistral_api_key:
            return "❌ MISTRAL_API_KEY environment variable not set"
        
        # Initialize Mistral AI client
        mistral_client = Mistral(api_key=mistral_api_key)
        
        # Create a detailed prompt for JSON track generation
        system_prompt = f"""You are a music composition AI. Generate a JSON representation of a {track_type} track based on the user's description.

The JSON should include:
- notes: array of note objects with pitch, duration, timing
- tempo: BPM value
- key: musical key
- time_signature: like "4/4"
- instruments: array of instrument names
- effects: array of audio effects
- metadata: title, genre, mood

Return ONLY valid JSON, no additional text."""

        user_prompt = f"Create a {track_type} track: {prompt}"
        
        # Create messages for chat completion
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        # Call Mistral AI API
        response = mistral_client.chat.complete(
            model="mistral-large-latest",
            messages=messages,
            temperature=0.7,
            max_tokens=2000
        )
        
        # Extract generated content
        generated_content = response.choices[0].message.content
        
        # Try to parse as JSON to validate
        try:
            track_json = json.loads(generated_content)
        except json.JSONDecodeError:
            # If not valid JSON, wrap in a basic structure
            track_json = {
                "title": track_name,
                "type": track_type,
                "description": prompt,
                "generated_content": generated_content,
                "tempo": 120,
                "key": "C major",
                "time_signature": "4/4"
            }
        
        # Load existing project
        project_data = storage._sync_load_project(project_id)
        if not project_data:
            return f"❌ Project {project_id} not found"
        
        # Create new track
        track_id = str(uuid.uuid4())
        new_track = {
            "id": track_id,
            "name": track_name,
            "type": "json_ai_generated",
            "track_type": track_type,
            "prompt": prompt,
            "data": track_json,
            "generated_by": "mistral_ai",
            "created_at": datetime.now().isoformat()
        }
        
        # Add track to project
        project_data["tracks"].append(new_track)
        project_data["lastModified"] = datetime.now().isoformat()
        
        # Save updated project
        success = storage._sync_save_project(project_id, project_data)
        
        if success:
            return f"✅ Generated and added JSON track '{track_name}' to project\n🆔 Track ID: {track_id}\n🎵 Type: {track_type}\n📊 Total tracks: {len(project_data['tracks'])}\n🎼 Generated content preview: {str(track_json)[:200]}..."
        else:
            return f"❌ Failed to save updated project"
        
    except Exception as e:
        return f"❌ Error generating JSON track: {str(e)}"

@mcp.tool(
    title="List Projects",
    description="List all available projects",
)
def list_projects() -> str:
    """List all projects"""
    try:
        projects = storage._sync_list_projects()
        
        if not projects:
            return "📁 No projects found. Create your first project!"
        
        project_list = "📁 Available Projects:\n\n"
        for project in projects:
            project_list += f"🎵 {project['name']}\n"
            project_list += f"   🆔 ID: {project['id']}\n"
            project_list += f"   📅 Modified: {project.get('lastModified', 'Unknown')}\n"
            project_list += f"   📊 Tracks: {project.get('tracks', 0)}\n\n"
        
        return project_list
        
    except Exception as e:
        return f"❌ Error listing projects: {str(e)}"

@mcp.tool(
    title="Export Project",
    description="Export a project to various formats",
)
def export_project(
    project_id: str = Field(description="Project ID"),
    format: str = Field(description="Export format: wav, mp3, or dawproject", default="wav")
) -> str:
    """Export a project"""
    try:
        project_data = storage._sync_load_project(project_id)
        if not project_data:
            return f"❌ Project {project_id} not found"
        
        # This is a placeholder for project export
        # In a real implementation, this would render the project to the specified format
        export_id = str(uuid.uuid4())
        return f"📤 Exported project '{project_data['name']}' to {format.upper()}\n🆔 Export ID: {export_id}\n💡 Note: This is a placeholder - integrate with real audio rendering engine"
        
    except Exception as e:
        return f"❌ Error exporting project: {str(e)}"

@mcp.resource(
    uri="opendaw://projects",
    name="Projects",
    description="List of all music projects"
)
def get_projects() -> str:
    """Get all projects as a resource"""
    try:
        projects = storage._sync_list_projects()
        if not projects:
            return "No projects available"
        
        result = "OpenDAW Projects:\n\n"
        for project in projects:
            result += f"- {project['name']} (ID: {project['id']})\n"
            result += f"  Tempo: {project.get('tempo', 120)} BPM\n"
            result += f"  Tracks: {len(project.get('tracks', []))}\n"
            result += f"  Modified: {project.get('lastModified', 'Unknown')}\n\n"
        
        return result
    except Exception as e:
        return f"Error loading projects: {str(e)}"

@mcp.prompt(
    name="music_creation",
    description="AI-powered music creation assistant"
)
def music_creation_prompt(
    style: str = Field(description="Music style or genre"),
    mood: str = Field(description="Desired mood or emotion"),
    instruments: str = Field(description="Preferred instruments", default="")
) -> str:
    """Generate a music creation prompt"""
    prompt = f"""You are an AI music production assistant for OpenDAW. Help create music with the following specifications:

🎵 Style: {style}
🎭 Mood: {mood}
🎹 Instruments: {instruments if instruments else "Any suitable instruments"}

Please suggest:
1. Project structure (tracks, arrangement)
2. Tempo and time signature recommendations
3. Chord progressions or melodic ideas
4. Production techniques and effects
5. Step-by-step creation process

Focus on practical, actionable advice for music production in a DAW environment."""
    
    return prompt

if __name__ == "__main__":
    # Run the FastMCP server
    mcp.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000))
    )
