"""
AWS S3 Storage Manager for OpenDAW MCP Server
Handles project, audio, MIDI, and export file storage
"""

import boto3
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
import asyncio
from concurrent.futures import ThreadPoolExecutor

class StorageManager:
    def __init__(self):
        """Initialize S3 storage manager with AWS credentials"""
        # S3 configuration from environment variables
        self.bucket_name = os.getenv("S3_BUCKET", "musixtral")
        self.region = os.getenv("AWS_REGION", "eu-north-1")
        self.access_key = os.getenv("AWS_ACCESS_KEY_ID")
        self.secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        
        if not self.access_key or not self.secret_key:
            raise ValueError("AWS credentials not found in environment variables")
        
        # Initialize S3 client
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region
        )
        
        # Thread pool for async operations
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Storage paths
        self.project_prefix = "opendaw/projects/"
        self.audio_prefix = "opendaw/audio/"
        self.midi_prefix = "opendaw/midi/"
        self.export_prefix = "opendaw/exports/"
        self.temp_prefix = "opendaw/temp/"

    def _get_project_key(self, project_id: str) -> str:
        """Get S3 key for project file"""
        return f"{self.project_prefix}{project_id}.json"

    def _get_audio_key(self, project_id: str, audio_id: str) -> str:
        """Get S3 key for audio file"""
        return f"{self.audio_prefix}{project_id}/{audio_id}.wav"

    def _get_midi_key(self, project_id: str, midi_id: str) -> str:
        """Get S3 key for MIDI file"""
        return f"{self.midi_prefix}{project_id}/{midi_id}.mid"

    def _get_export_key(self, project_id: str, export_id: str, format: str) -> str:
        """Get S3 key for export file"""
        return f"{self.export_prefix}{project_id}/{export_id}.{format}"

    # Synchronous wrappers for FastMCP compatibility
    def _sync_save_project(self, project_id: str, project_data: Dict[str, Any]) -> bool:
        """Synchronous wrapper for save_project"""
        try:
            key = self._get_project_key(project_id)
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=json.dumps(project_data, indent=2),
                ContentType='application/json'
            )
            return True
        except Exception as e:
            print(f"Error saving project {project_id}: {e}")
            return False

    def _sync_load_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Synchronous wrapper for load_project"""
        try:
            key = self._get_project_key(project_id)
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
            return json.loads(response['Body'].read().decode('utf-8'))
        except Exception as e:
            print(f"Error loading project {project_id}: {e}")
            return None

    def _sync_list_projects(self) -> List[Dict[str, Any]]:
        """Synchronous wrapper for list_projects"""
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=self.project_prefix
            )
            
            projects = []
            if 'Contents' in response:
                for obj in response['Contents']:
                    try:
                        # Get project data
                        project_response = self.s3_client.get_object(
                            Bucket=self.bucket_name,
                            Key=obj['Key']
                        )
                        project_data = json.loads(project_response['Body'].read().decode('utf-8'))
                        
                        # Add metadata
                        project_data['tracks'] = len(project_data.get('tracks', []))
                        projects.append(project_data)
                    except Exception as e:
                        print(f"Error loading project from {obj['Key']}: {e}")
                        continue
            
            return projects
        except Exception as e:
            print(f"Error listing projects: {e}")
            return []

    # Async methods (original implementation)
    async def save_project(self, project_id: str, project_data: Dict[str, Any]) -> bool:
        """Save project data to S3"""
        def _save():
            return self._sync_save_project(project_id, project_data)
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _save)

    async def load_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Load project data from S3"""
        def _load():
            return self._sync_load_project(project_id)
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _load)

    async def list_projects(self) -> List[Dict[str, Any]]:
        """List all projects"""
        def _list():
            return self._sync_list_projects()
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _list)

    async def save_audio_file(self, project_id: str, audio_id: str, audio_data: bytes) -> bool:
        """Save audio file to S3"""
        try:
            key = self._get_audio_key(project_id, audio_id)
            
            def _save():
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=audio_data,
                    ContentType='audio/wav'
                )
                return True
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _save)
        except Exception as e:
            print(f"Error saving audio file {audio_id}: {e}")
            return False

    async def load_audio_file(self, project_id: str, audio_id: str) -> Optional[bytes]:
        """Load audio file from S3"""
        try:
            key = self._get_audio_key(project_id, audio_id)
            
            def _load():
                response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
                return response['Body'].read()
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _load)
        except Exception as e:
            print(f"Error loading audio file {audio_id}: {e}")
            return None

    async def save_midi_file(self, project_id: str, midi_id: str, midi_data: bytes) -> bool:
        """Save MIDI file to S3"""
        try:
            key = self._get_midi_key(project_id, midi_id)
            
            def _save():
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=midi_data,
                    ContentType='audio/midi'
                )
                return True
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _save)
        except Exception as e:
            print(f"Error saving MIDI file {midi_id}: {e}")
            return False

    async def load_midi_file(self, project_id: str, midi_id: str) -> Optional[bytes]:
        """Load MIDI file from S3"""
        try:
            key = self._get_midi_key(project_id, midi_id)
            
            def _load():
                response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
                return response['Body'].read()
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _load)
        except Exception as e:
            print(f"Error loading MIDI file {midi_id}: {e}")
            return None

    async def save_export_file(self, project_id: str, export_id: str, format: str, export_data: bytes) -> bool:
        """Save export file to S3"""
        try:
            key = self._get_export_key(project_id, export_id, format)
            
            content_types = {
                'wav': 'audio/wav',
                'mp3': 'audio/mpeg',
                'dawproject': 'application/zip'
            }
            
            def _save():
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=export_data,
                    ContentType=content_types.get(format, 'application/octet-stream')
                )
                return True
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _save)
        except Exception as e:
            print(f"Error saving export file {export_id}: {e}")
            return False

    async def load_export_file(self, project_id: str, export_id: str, format: str) -> Optional[bytes]:
        """Load export file from S3"""
        try:
            key = self._get_export_key(project_id, export_id, format)
            
            def _load():
                response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
                return response['Body'].read()
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _load)
        except Exception as e:
            print(f"Error loading export file {export_id}: {e}")
            return None

    async def delete_project(self, project_id: str) -> bool:
        """Delete project and all associated files"""
        try:
            # Delete project file
            project_key = self._get_project_key(project_id)
            
            # List all files for this project
            prefixes = [
                f"{self.audio_prefix}{project_id}/",
                f"{self.midi_prefix}{project_id}/",
                f"{self.export_prefix}{project_id}/"
            ]
            
            def _delete():
                # Delete project file
                try:
                    self.s3_client.delete_object(Bucket=self.bucket_name, Key=project_key)
                except:
                    pass  # File might not exist
                
                # Delete associated files
                for prefix in prefixes:
                    try:
                        response = self.s3_client.list_objects_v2(
                            Bucket=self.bucket_name,
                            Prefix=prefix
                        )
                        
                        if 'Contents' in response:
                            for obj in response['Contents']:
                                self.s3_client.delete_object(
                                    Bucket=self.bucket_name,
                                    Key=obj['Key']
                                )
                    except Exception as e:
                        print(f"Error deleting files with prefix {prefix}: {e}")
                
                return True
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _delete)
        except Exception as e:
            print(f"Error deleting project {project_id}: {e}")
            return False

    async def get_project_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        try:
            def _get_stats():
                stats = {
                    'total_projects': 0,
                    'total_audio_files': 0,
                    'total_midi_files': 0,
                    'total_exports': 0,
                    'storage_used_bytes': 0
                }
                
                # Count projects
                try:
                    response = self.s3_client.list_objects_v2(
                        Bucket=self.bucket_name,
                        Prefix=self.project_prefix
                    )
                    if 'Contents' in response:
                        stats['total_projects'] = len(response['Contents'])
                        stats['storage_used_bytes'] += sum(obj['Size'] for obj in response['Contents'])
                except:
                    pass
                
                # Count other file types
                prefixes = [
                    (self.audio_prefix, 'total_audio_files'),
                    (self.midi_prefix, 'total_midi_files'),
                    (self.export_prefix, 'total_exports')
                ]
                
                for prefix, key in prefixes:
                    try:
                        response = self.s3_client.list_objects_v2(
                            Bucket=self.bucket_name,
                            Prefix=prefix
                        )
                        if 'Contents' in response:
                            stats[key] = len(response['Contents'])
                            stats['storage_used_bytes'] += sum(obj['Size'] for obj in response['Contents'])
                    except:
                        pass
                
                return stats
            
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, _get_stats)
        except Exception as e:
            print(f"Error getting storage stats: {e}")
            return {}

    def __del__(self):
        """Cleanup thread pool"""
        if hasattr(self, 'executor'):
            self.executor.shutdown(wait=False)
