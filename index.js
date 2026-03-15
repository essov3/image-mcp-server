#!/usr/bin/env node
/**
 * Image MCP Server — entry point
 * ─────────────────────────────────────────────────────────────────
 * Model Context Protocol server for image processing.
 * Tools: resize, crop, optimize (compress), convert, rotate, remove_bg.
 *
 * Transport modes:
 *   stdio  (default)  — for local / subprocess usage (no auth)
 *   HTTP + SSE        — when IMAGE_MCP_PORT is set (bearer-auth enabled)
 *
 * Environment variables:
 *   IMAGE_MCP_AUTH_TOKEN   — bearer token for HTTP mode   (required for HTTP)
 *   IMAGE_MCP_PORT         — port → enables HTTP/SSE mode (e.g. 3000)
 *   IMAGE_MCP_MAX_SIZE_MB  — max input image size in MB   (default 50)
 *
 * Usage:
 *   node index.js                                          # stdio mode
 *   IMAGE_MCP_PORT=3000 IMAGE_MCP_AUTH_TOKEN=secret node index.js  # HTTP mode
 * ─────────────────────────────────────────────────────────────────
 */

import { AUTH_TOKEN, PORT } from "./src/config.js";
import { createServer }     from "./src/server.js";

if (PORT) {
  /* ── HTTP / SSE mode ─────────────────────────────────────────── */
  const [
    { default: express },
    { SSEServerTransport },
    { bearerAuth },
  ] = await Promise.all([
    import("express"),
    import("@modelcontextprotocol/sdk/server/sse.js"),
    import("./src/auth.js"),
  ]);

  const app = express();
  app.use(express.json({ limit: "100mb" }));

  /** sessionId → { server, transport } */
  const sessions = new Map();

  app.get("/sse", bearerAuth, async (req, res) => {
    const server    = createServer();
    const transport = new SSEServerTransport("/messages", res);
    sessions.set(transport.sessionId, { server, transport });

    res.on("close", () => {
      sessions.delete(transport.sessionId);
    });

    await server.connect(transport);
  });

  app.post("/messages", bearerAuth, async (req, res) => {
    const sessionId = req.query.sessionId;
    const session   = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    await session.transport.handlePostMessage(req, res);
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.listen(PORT, () => {
    process.stderr.write(
      `[image-mcp] HTTP/SSE server started on port ${PORT}` +
      (AUTH_TOKEN ? " (bearer auth enabled)" : " (WARNING: no auth token set)") + "\n"
    );
  });
} else {
  /* ── Stdio mode ──────────────────────────────────────────────── */
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );

  const server    = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("[image-mcp] Server started (stdio mode)\n");
}
