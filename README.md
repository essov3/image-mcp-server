# Image MCP Server

Model Context Protocol server for image processing — resize, crop, optimize, convert, rotate, and AI background removal.

Built with [Sharp](https://sharp.pixelplumbing.com/) and [@imgly/background-removal-node](https://www.npmjs.com/package/@imgly/background-removal-node).

---

## Design: Zero Image Bytes Through the AI

All tools work entirely with **file paths and URLs**. The AI instructs the server with a source path (local or URL) and processing parameters; the server reads, processes, and writes the result — then returns only a small JSON metadata object.

### Local Mode (stdio)

```
AI  ──►  tool(input_path, options)  ──►  MCP Server
                                              │
                                        reads file from disk
                                        processes with Sharp
                                        writes output to disk
                                              │
AI  ◄──  { output_path, width, height, format, size }
```

### Remote Mode (HTTP) — Upload → Process → Download

```
Client App  ──►  POST /upload (file)  ──►  MCP Server
                                                │
                                          saves to temp dir
                                                │
Client App  ◄──  { file_id, download_url }      │
                                                │
AI  ──►  resize({ input_path: download_url })   │
                                                │
                                          fetches URL → processes → saves to temp
                                                │
AI  ◄──  { download_url, width, height, format, size }
                                                │
Client App  ──►  GET /download/{id}  ──►  downloads processed image
```

**No base64, no image blobs in the context window.** A 1 MB image stays on disk/temp and costs only ~15 tokens as a URL — versus ~340,000 tokens as base64.

---

## Tools

| Tool | Description |
|------|-------------|
| **resize** | Resize with fit modes: `cover`, `contain`, `fill`, `inside`, `outside` |
| **crop** | Manual extract (left/top/width/height) or smart gravity-based crop |
| **optimize** | Compress images — format-aware quality, mozjpeg, lossless WebP/PNG |
| **convert** | Convert between `jpeg`, `png`, `webp`, `gif`, `avif`, `tiff` |
| **rotate** | Rotate by any angle (not limited to 90°) |
| **remove_bg** | AI-powered background removal → transparent PNG |

---

## Transport Modes

### Stdio (default)

For local/subprocess usage — no authentication required.

```bash
node index.js
```

### HTTP + Streamable

When `IMAGE_MCP_PORT` is set, the server starts an Express HTTP server with Streamable HTTP transport and **Bearer token authentication**.

```bash
IMAGE_MCP_PORT=3000 IMAGE_MCP_AUTH_TOKEN=my-secret-token node index.js
```

---

## HTTP Endpoints

All endpoints (except `/health`) require Bearer token authentication via the `Authorization` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/mcp` | ✅ Bearer | MCP Streamable HTTP — initialise session or handle message |
| GET | `/mcp` | ✅ Bearer | Re-attach SSE stream for an existing MCP session |
| DELETE | `/mcp` | ✅ Bearer | Close an MCP session |
| POST | `/upload` | ✅ Bearer | Upload an image file (multipart form, field: `file`) |
| GET | `/download/:fileId` | ✅ Bearer | Download an uploaded or processed image |
| GET | `/health` | ❌ | Health check |

### Upload Endpoint

Upload an image for processing. Returns a `download_url` that can be used as `input_path` in tool calls.

```bash
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer my-secret-token" \
  -F "file=@photo.jpg"
```

**Response:**
```json
{
  "file_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg",
  "download_url": "http://localhost:3000/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg",
  "size": 245678,
  "original_name": "photo.jpg"
}
```

### Download Endpoint

Download a processed or uploaded image by its file ID.

```bash
curl -O http://localhost:3000/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg \
  -H "Authorization: Bearer my-secret-token"
```

> **Note:** Temp files are automatically deleted after `IMAGE_MCP_TEMP_MAX_AGE_HOURS` (default: 24 hours).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_MCP_AUTH_TOKEN` | _(empty)_ | Bearer token for HTTP mode. **Required** when using HTTP transport. |
| `IMAGE_MCP_PORT` | _(empty)_ | Set to a port number (e.g. `3000`) to enable HTTP mode. |
| `IMAGE_MCP_MAX_SIZE_MB` | `50` | Maximum input image size in MB. |
| `IMAGE_MCP_BASE_URL` | `http://localhost:{PORT}` | Public base URL for download links (e.g. `https://my-server.com`). |
| `IMAGE_MCP_TEMP_DIR` | `{os.tmpdir()}/image-mcp` | Directory for temporary uploaded/processed images. |
| `IMAGE_MCP_TEMP_MAX_AGE_HOURS` | `24` | Hours before temp files are automatically deleted. |

---

## Quick Start

### Install & Run Locally

```bash
npm install
node index.js            # stdio mode
```

### Run with HTTP + Auth

```bash
npm install
IMAGE_MCP_PORT=3000 IMAGE_MCP_AUTH_TOKEN=my-secret node index.js
```

### Docker

```bash
# Pull from Docker Hub
docker pull essov3/image-mcp-server:latest

docker run -p 3000:3000 \
  -e IMAGE_MCP_AUTH_TOKEN=my-secret \
  -e IMAGE_MCP_PORT=3000 \
  -e IMAGE_MCP_BASE_URL=https://your-server.com \
  essov3/image-mcp-server:latest
```

### Docker Compose

```yaml
services:
  image-mcp-server:
    image: essov3/image-mcp-server:latest  # or use build: . for local builds
    ports:
      - "3000:3000"
    environment:
      IMAGE_MCP_PORT: "3000"
      IMAGE_MCP_AUTH_TOKEN: "my-secret-token"
      IMAGE_MCP_MAX_SIZE_MB: "100"
      IMAGE_MCP_BASE_URL: "https://your-server.com"
      IMAGE_MCP_TEMP_MAX_AGE_HOURS: "24"
    restart: unless-stopped
```

```bash
docker compose up -d
```

> **Volume mount is optional** in HTTP mode — temp files are stored inside the container. Mount a volume only if you want persistent storage: `-v /data/image-mcp-temp:/tmp/image-mcp`

---

## Remote Deployment Workflow

When the server is deployed remotely (Docker, cloud, etc.), clients interact via HTTP:

### 1. Upload an image

The client application (OpenWebUI, custom agent, etc.) uploads the image via REST:

```bash
curl -X POST https://your-server.com/upload \
  -H "Authorization: Bearer my-secret-token" \
  -F "file=@product.jpg"
```

Returns:
```json
{
  "file_id": "abc123.jpg",
  "download_url": "https://your-server.com/download/abc123.jpg"
}
```

### 2. AI calls a processing tool

The AI only sees the URL (a short string, ~15 tokens):

```json
{
  "tool": "resize",
  "arguments": {
    "input_path": "https://your-server.com/download/abc123.jpg",
    "width": 800,
    "height": 600
  }
}
```

### 3. Server processes and returns metadata

```json
{
  "output_path": "/tmp/image-mcp/def456_resized.jpg",
  "download_url": "https://your-server.com/download/def456_resized.jpg",
  "width": 800,
  "height": 600,
  "format": "jpeg",
  "size": 45678
}
```

### 4. Client downloads the result

```bash
curl -O https://your-server.com/download/def456_resized.jpg \
  -H "Authorization: Bearer my-secret-token"
```

---

## MCP Client Configuration

### Stdio mode

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/path/to/image-mcp-server/index.js"]
    }
  }
}
```

### HTTP mode

```json
{
  "mcpServers": {
    "image": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer my-secret-token"
      }
    }
  }
}
```

### VS Code (`mcp.json`)

```json
{
  "servers": {
    "image": {
      "command": "node",
      "args": ["./index.js"]
    }
  }
}
```

---

## Tool Details

All tools share the same input/output contract:

- **`input_path`** ✅ — Local file path **or** HTTP/HTTPS URL to the source image.
- **`output_path`** ⬜ — Where to write the result. If omitted:
  - **Local mode:** auto-generates a name next to the input (e.g. `photo_resized.jpg`)
  - **Remote mode:** saves to temp directory and returns a `download_url`
- **Return value** — A JSON text block with `output_path`, `width`, `height`, `format`, `size`, and in HTTP mode, `download_url`. No image data is returned to the AI.

### resize

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Local file path or HTTP(S) URL |
| `output_path` | string | ⬜ | Path for the resized output |
| `width` | number | ⬜ | Target width (px) |
| `height` | number | ⬜ | Target height (px) — at least one of width/height required |
| `fit` | enum | ⬜ | `cover` (default) / `contain` / `fill` / `inside` / `outside` |
| `background` | string | ⬜ | Background colour for `contain` mode (e.g. `"#ffffff"`) |

### crop

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Local file path or HTTP(S) URL |
| `output_path` | string | ⬜ | Path for the cropped output |
| `width` | number | ✅ | Crop width (px) |
| `height` | number | ✅ | Crop height (px) |
| `left` | number | ⬜ | Left offset — triggers manual crop when set with `top` |
| `top` | number | ⬜ | Top offset — triggers manual crop when set with `left` |
| `gravity` | enum | ⬜ | Smart crop position: `centre` (default), `entropy`, `attention`, compass points |

### optimize

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Local file path or HTTP(S) URL |
| `output_path` | string | ⬜ | Path for the optimized output |
| `quality` | number | ⬜ | 1–100 compression quality (lower = smaller file) |
| `lossless` | boolean | ⬜ | Lossless mode (PNG, WebP) |

Returns extended metadata: `originalSize`, `optimizedSize`, `savedBytes`, `savedPercent`.

### convert

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Local file path or HTTP(S) URL |
| `output_path` | string | ⬜ | Path for the converted output (include extension, e.g. `out.webp`) |
| `format` | enum | ✅ | `jpeg` / `png` / `webp` / `gif` / `avif` / `tiff` |
| `quality` | number | ⬜ | 1–100 for lossy formats (default: 80) |

### rotate

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Local file path or HTTP(S) URL |
| `output_path` | string | ⬜ | Path for the rotated output |
| `angle` | number | ✅ | Degrees clockwise (e.g. 90, 180, 270 or any arbitrary angle) |
| `background` | string | ⬜ | Fill colour for non-90° rotations (e.g. `"#ffffff"`) |

### remove_bg

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Local file path or HTTP(S) URL |
| `output_path` | string | ⬜ | Path for the transparent PNG output |
| `model` | enum | ⬜ | `small` (faster) or `medium` (better quality). Default: `medium` |

> The first call downloads the ONNX model (~30 MB). Subsequent calls use the cached model and are fast.

---

## Real-World Usage Examples

### Remote: Upload → Resize → Download

```bash
# 1. Upload
UPLOAD=$(curl -s -X POST https://your-server.com/upload \
  -H "Authorization: Bearer token" \
  -F "file=@photo.jpg")
URL=$(echo $UPLOAD | jq -r '.download_url')

# 2. AI calls resize with the download URL as input_path
# 3. AI receives { download_url: "https://your-server.com/download/result.jpg" }

# 4. Download result
curl -O https://your-server.com/download/result_resized.jpg \
  -H "Authorization: Bearer token"
```

### Local: Generate a social media thumbnail
```
resize photo.jpg to 300×300, fit cover → thumbnails/photo_thumb.jpg
```

### Convert to WebP for web delivery
```
convert photo.jpg to webp, quality 75 → web/photo.webp
```

### Compress a JPEG by ~55%
```
optimize photo.jpg, quality 75 → dist/photo_optimized.jpg
```

### Smart-crop a portrait for an avatar
```
crop photo.jpg to 200×200, gravity attention → avatars/user.jpg
```

### Remove background for a product image
```
remove_bg product.jpg, model medium → assets/product_no_bg.png
```

---

## Project Structure

```
index.js              ← Entry point (stdio or HTTP)
src/
  config.js           ← Environment variable config
  auth.js             ← Bearer token middleware
  server.js           ← McpServer factory
  utils.js            ← Shared helpers (file I/O, URL fetch, path resolution, metadata)
  temp.js             ← Temp folder management and cleanup scheduler
  tools/
    resize.js         ← Resize tool
    crop.js           ← Crop tool
    optimize.js       ← Optimize / compress tool
    convert.js        ← Format conversion tool
    rotate.js         ← Rotate tool
    remove-bg.js      ← AI background removal tool
```

## License

MIT
