<p align="center">
  <img src="https://raw.githubusercontent.com/andremichelle/openDAW/refs/heads/main/packages/app/studio/public/favicon.svg" height="120"/>
  <h1 align="center">openDAW FastMCP Server</h1>
</p>

<p align="center">
<a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="nofollow"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPLv3"></a>
<a href="https://discord.gg/ZRm8du7vn4" rel="nofollow"><img src="https://img.shields.io/discord/1241019312328675399?label=Discord&logo=discord&logoColor=white" alt="discord server"></a>
<a href="https://github.com/andremichelle/opendaw" rel="nofollow"><img src="https://img.shields.io/github/stars/andremichelle/opendaw" alt="stars"></a>
</p>

**openDAW FastMCP Server** is a next-generation HTTP-based Model Context Protocol (MCP) server that brings the power of **openDAW** music production capabilities to AI assistants and applications. Built with the **FastMCP framework**, it provides seamless integration with cloud storage, real-time streaming, and comprehensive music production tools through a modern HTTP API.

This server democratizes access to professional music production tools by making them available through AI interfaces, with a strong focus on **education**, **accessibility**, and **data-privacy**.

<p align="center">
<img src="https://raw.githubusercontent.com/andremichelle/openDAW/refs/heads/main/assets/studio-teaser.png"/>
</p>

---

## Features

- **FastMCP Framework**: Built with the latest FastMCP template for optimal performance and reliability
- **HTTP Streamable Protocol**: Full compatibility with MCP HTTP streaming specification
- **AWS S3 Integration**: Seamless cloud storage for projects, audio files, and MIDI data
- **Real-time Streaming**: Server-Sent Events (SSE) for live updates and real-time collaboration
- **Comprehensive MCP Tools**: Complete suite of music production tools accessible via MCP protocol
- **AI-Powered Prompts**: Intelligent music creation assistance and workflow optimization
- **Alpic Compatible**: Ready for one-click deployment on Alpic platform
- **Cross-Platform**: Works with any MCP-compatible AI assistant or application

## API Endpoints

### Core HTTP Endpoints
- `GET /` - Server information and capabilities overview
- `GET /health` - Health check endpoint for monitoring
- `POST /mcp` - Main MCP protocol endpoint for tool execution
- `GET /mcp/stream` - Server-Sent Events streaming for real-time updates

### MCP Tools Available
- `create_project` - Create new music projects with customizable parameters
- `load_project` - Load and access existing projects from cloud storage
- `add_track` - Add audio, MIDI, or instrument tracks to projects
- `list_projects` - Browse and search through all available projects
- `generate_audio` - AI-powered audio generation and synthesis
- `export_project` - Export projects in various formats (WAV, MP3, MIDI, etc.)

---

## Open-Source

We are committed to transparency and community-driven development.

The source code for openDAW is available under **AGPL v3 (or later)**

### Built on Trust and Transparency

**openDAW stands for radical simplicity and respect.**

- **No SignUp**
- **No Tracking**
- **No Cookie Banners**
- **No User Profiling**
- **No Terms & Conditions**
- **No Ads**
- **No Paywalls**
- **No Data Mining**

---

## Huge Shoutout To The Incredible openDAW Community!

To everyone who has contributed feedback, reported bugs, suggested improvements, or helped spread the word — thank you!
Your support is shaping openDAW into something truly powerful!

Thank
you [@ccswdavidson](https://github.com/ccswdavidson), [@Chaosmeister](https://github.com/Chaosmeister), [@jeffreylouden](https://github.com/jeffreylouden), [@solsos](https://github.com/solsos), [@TheRealSyler](https://github.com/TheRealSyler), [@Trinitou](https://github.com/Trinitou),
and [@xnstad](https://github.com/xnstad) for testing the repositories and identifying issues during the installation of
openDAW!

Special shout-out to the biggest bug hunters: [kanaris](https://kanaris.net/)
and [BeatMax Prediction](https://linktr.ee/beatmax_prediction). Your relentless attention to detail made a huge
difference!

Huge thanks to our [ambassadors](https://opendaw.org/ambassadors), whose dedication and outreach amplify our mission!

## And big hugs to all our supporters!

### openDAW Visionary — $25.00

- Polarity
- kanaris
- Stephen Tai
- Thad Guidry
- Pathfinder
- One Sound Every Day (santino)

### openDAW Supporter — $5.00

- Cal Lycus
- Jetdarc
- Truls Enstad
- p07a
- Ynot Etluhcs
- Mats Gisselson
- Dado
- centomila
- Ola
- SKYENCE
- BeatMax_Prediction
- Kim T
- Nyenoidz
- Bruce Hunter
- Steve Meiers
- 4ohm
- Yito
- Shawn Lukas
- Tommes
- David Thompson
- Harry Gillich
- OxVolt
- Wojciech Miłkowski
- Client
- skyboundzoo

### openDAW Custom Pledge

- lokomotywa ($2.47)

---

## Local Development

### Prerequisites

Before starting, ensure you have the following installed on your system:

- **Python 3.8+** - Required for running the FastMCP server
- **pip** - Python package manager for installing dependencies
- **AWS CLI** (optional) - For configuring AWS credentials
- **Docker** (optional) - For containerized deployment

### Installation

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
4. **Update AI Assistant** MCP configuration with deployed URL

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
AI Assistant → HTTP MCP Server → AWS S3 Storage
                      ↓
              FastMCP Framework
              - Tools (create, load, add tracks)
              - Resources (project listings)
              - Prompts (AI music creation)
```

---

### Repositories

* [openDAW](https://github.com/andremichelle/opendaw) - Main web-based DAW
* [openDAW-headless (SDK)](https://github.com/andremichelle/opendaw-headless) - Headless SDK

[![Custom Caption: Watch the Demo](https://img.youtube.com/vi/VPTXeJY6Eaw/0.jpg)](https://www.youtube.com/watch?v=VPTXeJY6Eaw)

Watch Polarity's Video *"there's a new FREE DAW in town"*

## Get Involved

We welcome contributions from developers, musicians, educators, and enthusiasts. To learn more about how you can
participate, visit our [Contribute](https://opendaw.org/contribute) page.

### What We Are Looking For:

1. **Offline desktop build (e.g., via Tauri) or a standalone installable PWA** — offer offline capability.
2. **Cloud-agnostic project storage** — a facade layer that lets users plug in different cloud services (e.g., Drive,
   S3, Dropbox) for projects and sample libraries.
3. **Live remote collaboration** — real-time session sharing and sync so multiple users can edit the same project
   concurrently.
4. **AI manual assistant** — an embedded agent that answers context-aware questions and guides users through features as
   they work.
5. **AI-powered stem splitting** — integrated source-separation to extract vocals, drums, and other stems directly
   inside the DAW.
6. **Import and Export** - Contribute every possible file format IO

## Links

* [opendaw.studio (prototype)](https://opendaw.studio)
* [opendaw.org (website)](https://opendaw.org)
* [openDAW on Discord](https://discord.opendaw.studio)
* [openDAW SDK](https://www.npmjs.com/org/opendaw)
* [openDAW on Patreon](https://www.patreon.com/join/openDAW)
* [openDAW on ko-fi](https://ko-fi.com/opendaw)
* [LinkedIn](https://www.linkedin.com/company/opendaw-org/)
* [Instagram](https://www.instagram.com/opendaw.studio)

## Dual-Licensing Model

openDAW is available **under two alternative license terms**:

| Option                      | When to choose it                                                                                                  | Obligations                                                                                                                                                                                             |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **A. AGPL v3 (or later)**   | You are happy for the entire work that includes openDAW to be released under AGPL-compatible open-source terms.      | – Must distribute complete corresponding source code under AGPL.<br>– Must keep copyright & licence notices.<br>– Applies both to distribution **and** to public use via network/SaaS (§13).<br>– May run openDAW privately in any software, open or closed (§0). |
| **B. Commercial Licence**   | You wish to incorporate openDAW into **closed-source** or otherwise licence-incompatible software or SaaS offerings. | – Pay the agreed fee.<br>– No copyleft requirement for your own source code.<br>– Other terms as per the signed agreement.                                                                                |

> **How to obtain the Commercial License**  
> Email `andre.michelle@opendaw.org` with your company name, product description, and expected distribution volume.

If you redistribute or run modified versions of openDAW for public use **without** a commercial license, the AGPL v3 terms apply automatically.

## License

[AGPL v3 (or later)](https://www.gnu.org/licenses/agpl-3.0.txt) © 2025 André Michelle
