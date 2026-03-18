/**
 * Configuration — loaded from environment variables once at startup.
 *
 * IMAGE_MCP_AUTH_TOKEN          — Bearer token for HTTP mode authentication
 *                                 (required when running in HTTP mode)
 * IMAGE_MCP_PORT                — HTTP port for Streamable HTTP transport;
 *                                 if set, server runs in HTTP mode with bearer auth.
 *                                 If not set, server uses stdio transport.
 * IMAGE_MCP_MAX_SIZE_MB         — Maximum input image size in MB (default: 50)
 * IMAGE_MCP_BASE_URL            — Public base URL for download links
 *                                 (e.g. "https://my-server.com"). Falls back to
 *                                 http://localhost:{PORT} when not set.
 * IMAGE_MCP_TEMP_DIR            — Override temp folder location
 *                                 (default: {os.tmpdir()}/image-mcp)
 * IMAGE_MCP_TEMP_MAX_AGE_HOURS  — Hours before temp files are cleaned (default: 24)
 */

import { tmpdir } from "os";
import path from "path";

export const AUTH_TOKEN          = process.env.IMAGE_MCP_AUTH_TOKEN || "";
export const PORT                = parseInt(process.env.IMAGE_MCP_PORT || "0", 10);
export const MAX_INPUT_SIZE_MB   = parseInt(process.env.IMAGE_MCP_MAX_SIZE_MB || "50", 10);
export const BASE_URL            = process.env.IMAGE_MCP_BASE_URL || (PORT ? `http://localhost:${PORT}` : "");
export const TEMP_DIR            = process.env.IMAGE_MCP_TEMP_DIR || path.join(tmpdir(), "image-mcp");
export const TEMP_MAX_AGE_HOURS  = parseInt(process.env.IMAGE_MCP_TEMP_MAX_AGE_HOURS || "24", 10);
