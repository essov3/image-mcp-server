import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResizeTool }    from "./tools/resize.js";
import { registerCropTool }      from "./tools/crop.js";
import { registerOptimizeTool }  from "./tools/optimize.js";
import { registerConvertTool }   from "./tools/convert.js";
import { registerRotateTool }    from "./tools/rotate.js";
import { registerRemoveBgTool }  from "./tools/remove-bg.js";

/**
 * Creates and returns a fully configured McpServer with all image tools.
 * Called once for stdio mode, or per-connection in HTTP/SSE mode.
 */
export function createServer() {
  const server = new McpServer({
    name:    "image-mcp-server",
    version: "1.0.0",
  });

  registerResizeTool(server);
  registerCropTool(server);
  registerOptimizeTool(server);
  registerConvertTool(server);
  registerRotateTool(server);
  registerRemoveBgTool(server);

  return server;
}
