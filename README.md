# Image MCP Server

Model Context Protocol server for image processing — resize, crop, optimize, convert, rotate, and AI background removal.

Built with [Sharp](https://sharp.pixelplumbing.com/) and [@imgly/background-removal-node](https://www.npmjs.com/package/@imgly/background-removal-node).

---

## Design: Zero Image Bytes Through the AI

All tools work entirely with **file paths**. The AI instructs the server with a source path and processing parameters; the server reads, processes, and writes the result to disk — then returns only a small JSON metadata object (path, dimensions, format, size).

```
AI  ──►  tool(input_path, options)  ──►  MCP Server
                                              │
                                        reads file from disk
                                        processes with Sharp
                                        writes output to disk
                                              │
AI  ◄──  { output_path, width, height, format, size }
```

**No base64, no image blobs in the context window.** A 1 MB image stays 1 MB on disk but costs only ~15 tokens as a file path — versus ~340,000 tokens as base64.

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

### HTTP + SSE

When `IMAGE_MCP_PORT` is set, the server starts an Express HTTP server with Server-Sent Events transport and **Bearer token authentication**.

```bash
IMAGE_MCP_PORT=3000 IMAGE_MCP_AUTH_TOKEN=my-secret-token node index.js
```

Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sse` | Open SSE connection (requires `Authorization: Bearer <token>`) |
| POST | `/messages?sessionId=…` | Send MCP messages (requires `Authorization: Bearer <token>`) |
| GET | `/health` | Health check |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_MCP_AUTH_TOKEN` | _(empty)_ | Bearer token for HTTP mode. **Required** when using HTTP transport. |
| `IMAGE_MCP_PORT` | _(empty)_ | Set to a port number (e.g. `3000`) to enable HTTP/SSE mode. |
| `IMAGE_MCP_MAX_SIZE_MB` | `50` | Maximum input image size in MB. |

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
docker build -t image-mcp-server .
docker run -p 3000:3000 \
  -e IMAGE_MCP_AUTH_TOKEN=my-secret \
  -e IMAGE_MCP_PORT=3000 \
  -v /your/images:/images \
  image-mcp-server
```

### Docker Compose

```yaml
services:
  image-mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      IMAGE_MCP_PORT: "3000"
      IMAGE_MCP_AUTH_TOKEN: "my-secret-token"
      IMAGE_MCP_MAX_SIZE_MB: "100"
    volumes:
      # Mount a shared folder so the server can read/write image files.
      # Use the same path when calling tools: input_path: /images/photo.jpg
      - ./images:/images
    restart: unless-stopped
```

```bash
docker compose up -d
```

> **Volume mount is required** when running in Docker — the server reads and writes image files directly from disk. Mount the folder containing your images to a path inside the container (e.g. `/images`) and use that container path as `input_path` / `output_path` in tool calls.

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

### HTTP/SSE mode

```json
{
  "mcpServers": {
    "image": {
      "url": "http://localhost:3000/sse",
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

- **`input_path`** ✅ — Absolute or relative path to the source image file on disk.
- **`output_path`** ⬜ — Where to write the result. If omitted, the server auto-generates a name next to the input (e.g. `photo_resized.jpg`).
- **Return value** — A JSON text block with `output_path`, `width`, `height`, `format`, and `size`. No image data is returned to the AI.

### resize

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Path to the source image |
| `output_path` | string | ⬜ | Path for the resized output |
| `width` | number | ⬜ | Target width (px) |
| `height` | number | ⬜ | Target height (px) — at least one of width/height required |
| `fit` | enum | ⬜ | `cover` (default) / `contain` / `fill` / `inside` / `outside` |
| `background` | string | ⬜ | Background colour for `contain` mode (e.g. `"#ffffff"`) |

### crop

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Path to the source image |
| `output_path` | string | ⬜ | Path for the cropped output |
| `width` | number | ✅ | Crop width (px) |
| `height` | number | ✅ | Crop height (px) |
| `left` | number | ⬜ | Left offset — triggers manual crop when set with `top` |
| `top` | number | ⬜ | Top offset — triggers manual crop when set with `left` |
| `gravity` | enum | ⬜ | Smart crop position: `centre` (default), `entropy`, `attention`, compass points |

### optimize

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Path to the source image |
| `output_path` | string | ⬜ | Path for the optimized output |
| `quality` | number | ⬜ | 1–100 compression quality (lower = smaller file) |
| `lossless` | boolean | ⬜ | Lossless mode (PNG, WebP) |

Returns extended metadata: `originalSize`, `optimizedSize`, `savedBytes`, `savedPercent`.

### convert

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Path to the source image |
| `output_path` | string | ⬜ | Path for the converted output (include extension, e.g. `out.webp`) |
| `format` | enum | ✅ | `jpeg` / `png` / `webp` / `gif` / `avif` / `tiff` |
| `quality` | number | ⬜ | 1–100 for lossy formats (default: 80) |

### rotate

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Path to the source image |
| `output_path` | string | ⬜ | Path for the rotated output |
| `angle` | number | ✅ | Degrees clockwise (e.g. 90, 180, 270 or any arbitrary angle) |
| `background` | string | ⬜ | Fill colour for non-90° rotations (e.g. `"#ffffff"`) |

### remove_bg

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_path` | string | ✅ | Path to the source image |
| `output_path` | string | ⬜ | Path for the transparent PNG output |
| `model` | enum | ⬜ | `small` (faster) or `medium` (better quality). Default: `medium` |

> The first call downloads the ONNX model (~30 MB). Subsequent calls use the cached model and are fast.

---

## Real-World Usage Examples

### Generate a social media thumbnail
```
resize photo.jpg to 300×300, fit cover → thumbnails/photo_thumb.jpg
```

### Prepare an OG image for a webpage
```
resize photo.jpg to 1200×630, fit contain, background #ffffff → og/banner.jpg
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
index.js              ← Entry point (stdio or HTTP/SSE)
src/
  config.js           ← Environment variable config
  auth.js             ← Bearer token middleware
  server.js           ← McpServer factory
  utils.js            ← Shared helpers (file I/O, path resolution, metadata)
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
