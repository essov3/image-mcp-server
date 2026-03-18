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
 *   IMAGE_MCP_AUTH_TOKEN            — bearer token for HTTP mode (required for HTTP)
 *   IMAGE_MCP_PORT                  — port → enables HTTP mode   (e.g. 3000)
 *   IMAGE_MCP_MAX_SIZE_MB           — max input image size in MB (default 50)
 *   IMAGE_MCP_BASE_URL              — public base URL for download links
 *                                     (e.g. "https://my-server.com")
 *   IMAGE_MCP_TEMP_DIR              — override temp folder location
 *   IMAGE_MCP_TEMP_MAX_AGE_HOURS    — hours before temp files are deleted (default 24)
 *
 * HTTP endpoints (when in HTTP mode):
 *   POST   /mcp            — MCP Streamable HTTP transport
 *   GET    /mcp            — MCP SSE re-attach
 *   DELETE /mcp            — close MCP session
 *   POST   /upload         — upload an image file (multipart form, field: "file")
 *   GET    /download/:id   — download a processed/uploaded image
 *   GET    /health         — health check
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
    { default: multer },
    tempModule,
  ] = await Promise.all([
    import("express"),
    import("@modelcontextprotocol/sdk/server/streamableHttp.js"),
    import("./src/auth.js"),
    import("multer"),
    import("./src/temp.js"),
  ]);

  const {
    initTempDir,
    startCleanupScheduler,
    getTempFilePath,
    getDownloadUrl,
  } = tempModule;

  const { TEMP_DIR } = await import("./src/config.js");

  // Initialise temp directory and cleanup scheduler
  await initTempDir();
  startCleanupScheduler();

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

  /* ── File Upload Endpoint ──────────────────────────────────── */
  const upload = multer({
    dest: TEMP_DIR,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  });

  /**
   * POST /upload — upload an image file via multipart form.
   * Field name: "file"
   * Returns: { file_id, download_url, size, original_name }
   * Requires bearer auth.
   */
  app.post("/upload", bearerAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
      }

      const { promises: fs } = await import("fs");
      const path = await import("path");

      // Multer saves with a random name — rename to include the original extension
      const ext    = path.default.extname(req.file.originalname) || ".jpg";
      const fileId = `${randomUUID()}${ext}`;
      const dest   = path.default.join(TEMP_DIR, fileId);
      await fs.rename(req.file.path, dest);

      const stats = await fs.stat(dest);
      res.json({
        file_id:       fileId,
        download_url:  getDownloadUrl(fileId),
        size:          stats.size,
        original_name: req.file.originalname,
      });
    } catch (err) {
      process.stderr.write(`[upload error] ${err.message}\n`);
      res.status(500).json({ error: err.message });
    }
  });

  /* ── File Download Endpoint ────────────────────────────────── */
  /**
   * GET /download/:fileId — download an uploaded or processed image.
   * Requires bearer auth.
   */
  app.get("/download/:fileId", bearerAuth, async (req, res) => {
    try {
      const filePath = getTempFilePath(req.params.fileId);
      const { promises: fs } = await import("fs");

      // Verify file exists
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: "File not found or expired" });
      }

      res.sendFile(filePath);
    } catch (err) {
      process.stderr.write(`[download error] ${err.message}\n`);
      res.status(500).json({ error: err.message });
    }
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
