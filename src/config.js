/**
 * Configuration — loaded from environment variables once at startup.
 *
 * IMAGE_MCP_AUTH_TOKEN   — Bearer token for HTTP mode authentication
 *                          (required when running in HTTP mode)
 * IMAGE_MCP_PORT         — HTTP port for SSE transport; if set, server
 *                          runs in HTTP/SSE mode with bearer auth.
 *                          If not set, server uses stdio transport.
 * IMAGE_MCP_MAX_SIZE_MB  — Maximum input image size in MB (default: 50)
 */

export const AUTH_TOKEN      = process.env.IMAGE_MCP_AUTH_TOKEN || "";
export const PORT            = parseInt(process.env.IMAGE_MCP_PORT || "0", 10);
export const MAX_INPUT_SIZE_MB = parseInt(process.env.IMAGE_MCP_MAX_SIZE_MB || "50", 10);
