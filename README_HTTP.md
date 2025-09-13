# OpenDAW FastMCP Server

FastMCP Server for OpenDAW music production, compatible with Alpic deployment platform.

## Features

- **FastMCP Framework**: Built with the latest FastMCP template for optimal performance
- **HTTP Streamable Protocol**: Compatible with MCP HTTP streaming specification
- **AWS S3 Integration**: Cloud storage for projects, audio, and MIDI files
- **Tools & Resources**: Complete MCP tools and resources support
- **Prompts**: AI-powered music creation prompts
- **Alpic Compatible**: Ready for one-click deployment on Alpic platform

## API Endpoints

### Core Endpoints
- `GET /` - Server information and capabilities
- `GET /health` - Health check endpoint
- `POST /mcp` - Main MCP protocol endpoint
- `GET /mcp/stream` - Server-Sent Events streaming

### MCP Tools
- `create_project` - Create new music projects
- `load_project` - Load existing projects
- `add_track` - Add tracks to projects
- `list_projects` - List all projects
- `generate_audio` - AI audio generation
- `export_project` - Export projects

## Local Development

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set environment variables:**
   ```bash
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_REGION=eu-north-1
   export S3_BUCKET=musixtral
   ```

3. **Run the server:**
   ```bash
   python fastmcp_server.py
   ```

4. **Test the server:**
   ```bash
   curl http://localhost:8000/health
   ```

## Docker Deployment

1. **Build image:**
   ```bash
   docker build -t opendaw-fastmcp .
   ```

2. **Run container:**
   ```bash
   docker run -p 8000:8000 \
     -e AWS_ACCESS_KEY_ID=your_key \
     -e AWS_SECRET_ACCESS_KEY=your_secret \
     -e AWS_REGION=eu-north-1 \
     -e S3_BUCKET=musixtral \
     opendaw-fastmcp
   ```

## Alpic Deployment

1. **Upload repository** to Alpic platform
2. **Configure environment variables** in Alpic dashboard:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (default: eu-north-1)
   - `S3_BUCKET` (default: musixtral)
3. **Deploy** using the `alpic.json` configuration
4. **Update Le Chat** MCP configuration with deployed URL

## Le Chat Integration

Update your Le Chat MCP configuration:

```json
{
  "mcpServers": {
    "opendaw": {
      "url": "https://your-alpic-deployment.alpic.io/mcp",
      "transport": "http"
    }
  }
}
```

## Usage Examples

### Create a Project
```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_project",
      "arguments": {
        "name": "My Song",
        "tempo": 120
      }
    }
  }'
```

### Add a Track
```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "add_track",
      "arguments": {
        "project_id": "your-project-id",
        "name": "Lead Vocal",
        "track_type": "audio"
      }
    }
  }'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key | Required |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Required |
| `AWS_REGION` | AWS region | `eu-north-1` |
| `S3_BUCKET` | S3 bucket name | `musixtral` |
| `PORT` | Server port | `8000` |

## Architecture

```
Le Chat → HTTP MCP Server → AWS S3 Storage
                ↓
        FastMCP Framework
        - Tools (create, load, add tracks)
        - Resources (project listings)
        - Prompts (AI music creation)
```

## Security

- AWS credentials are loaded from environment variables only
- No hardcoded secrets in the codebase
- HTTPS support for production deployments
- CORS configured for web access

## Support

For issues and questions:
- Check the server logs for error messages
- Verify AWS credentials and S3 bucket access
- Test local deployment before cloud deployment
