#!/usr/bin/env node
/**
 * Image MCP Server — entry point
 * ─────────────────────────────────────────────────────────────────
 * Model Context Protocol server for image processing.
 * Tools: resize, crop, optimize (compress), convert, rotate, remove_bg.
 *
 * Transport modes:
 *   stdio  (default)  — for local / subprocess usage (no auth)
 *   HTTP Streamable   — when IMAGE_MCP_PORT is set (bearer-auth enabled)
 *
 * Environment variables:
 *   IMAGE_MCP_AUTH_TOKEN   — bearer token for HTTP mode   (required for HTTP)
 *   IMAGE_MCP_PORT         — port → enables HTTP mode     (e.g. 3000)
 *   IMAGE_MCP_MAX_SIZE_MB  — max input image size in MB   (default 50)
 *
 * Usage:
 *   node index.js                                          # stdio mode
 *   IMAGE_MCP_PORT=3000 IMAGE_MCP_AUTH_TOKEN=secret node index.js  # HTTP mode
 * ─────────────────────────────────────────────────────────────────
 */

import { randomUUID }           from "crypto";
import { AUTH_TOKEN, PORT }     from "./src/config.js";
import { createServer }         from "./src/server.js";

if (PORT) {
  /* ── HTTP Streamable mode ────────────────────────────────────── */
  const [
    { default: express },
    { StreamableHTTPServerTransport },
    { bearerAuth },
  ] = await Promise.all([
    import("express"),
    import("@modelcontextprotocol/sdk/server/streamableHttp.js"),
    import("./src/auth.js"),
  ]);

  const app = express();

  // Simple logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      process.stderr.write(`[${req.method}] ${req.url} - ${res.statusCode} (${Date.now() - start}ms)\n`);
    });
    next();
  });

  app.use(express.json({ limit: "100mb" }));

  /** sessionId → { server, transport } */
  const sessions = new Map();

  // POST — initialise a new session or handle a message for an existing one
  app.post(["/", "/mcp"], bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    let session = sessions.get(sessionId);

    if (!session) {
      // New session — create transport + server
      const handler = {};
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, handler);
        },
      });
      const server = createServer();
      handler.server    = server;
      handler.transport = transport;

      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      await server.connect(transport);
      session = handler;
    }

    await session.transport.handleRequest(req, res, req.body);
  });

  // GET — re-attach SSE stream for an existing session
  app.get(["/", "/mcp"], bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const session   = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    await session.transport.handleRequest(req, res);
  });

  // DELETE — close a session explicitly
  app.delete(["/", "/mcp"], bearerAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        try { await session.transport.close(); } catch {}
        sessions.delete(sessionId);
      }
    }
    res.status(200).end();
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.listen(PORT, () => {
    process.stderr.write(
      `[image-mcp] Streamable HTTP server started on port ${PORT}` +
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
