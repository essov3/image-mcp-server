# Image MCP Server

Model Context Protocol server for image processing — resize, crop, optimize, convert, rotate, and AI background removal.

Built with [Sharp](https://sharp.pixelplumbing.com/) and [@imgly/background-removal-node](https://www.npmjs.com/package/@imgly/background-removal-node).

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

All tools accept a **base64-encoded image** as input and return the processed image as an MCP image content block alongside JSON metadata (dimensions, format, file size).

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
  image-mcp-server
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

---

## Tool Details

### resize

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | string | ✅ | Base64-encoded image |
| `width` | number | ⬜ | Target width (px) |
| `height` | number | ⬜ | Target height (px) |
| `fit` | enum | ⬜ | `cover` / `contain` / `fill` / `inside` / `outside` |
| `background` | string | ⬜ | Background colour for `contain` mode |

### crop

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | string | ✅ | Base64-encoded image |
| `width` | number | ✅ | Crop width (px) |
| `height` | number | ✅ | Crop height (px) |
| `left` | number | ⬜ | Left offset for manual crop |
| `top` | number | ⬜ | Top offset for manual crop |
| `gravity` | enum | ⬜ | Smart crop: `centre`, `entropy`, `attention`, compass points |

### optimize

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | string | ✅ | Base64-encoded image |
| `quality` | number | ⬜ | 1–100 compression quality |
| `lossless` | boolean | ⬜ | Lossless mode (PNG, WebP) |

### convert

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | string | ✅ | Base64-encoded image |
| `format` | enum | ✅ | `jpeg` / `png` / `webp` / `gif` / `avif` / `tiff` |
| `quality` | number | ⬜ | 1–100 for lossy formats |

### rotate

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | string | ✅ | Base64-encoded image |
| `angle` | number | ✅ | Degrees clockwise (e.g. 90, 180, 270) |
| `background` | string | ⬜ | Fill colour for non-90° angles |

### remove_bg

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | string | ✅ | Base64-encoded image |
| `model` | enum | ⬜ | `small` (faster) or `medium` (better). Default: `medium` |

---

## Project Structure

```
index.js              ← Entry point (stdio or HTTP/SSE)
src/
  config.js           ← Environment variable config
  auth.js             ← Bearer token middleware
  server.js           ← McpServer factory
  utils.js            ← Shared helpers (decode, response builder)
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
