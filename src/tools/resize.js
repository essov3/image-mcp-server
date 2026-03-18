import { z } from "zod";
import sharp from "sharp";
import { readInput, fileResult, resolveOutputPath } from "../utils.js";

export function registerResizeTool(server) {
  server.tool(
    "resize",
    `Resizes an image to the specified dimensions.
Reads from input_path (local file path or HTTP/HTTPS URL) and writes the result to output_path (or auto-generated).
No image data passes through the AI — only file paths/URLs and metadata are exchanged.
In remote (HTTP) mode, the response includes a download_url for the processed image.

Fit modes:
  • cover   — crop to exactly fill both dimensions (default)
  • contain — fit within dimensions, padding added if aspect differs
  • fill    — stretch to fill exactly (may distort)
  • inside  — preserve aspect ratio, fit within both dimensions
  • outside — preserve aspect ratio, cover both dimensions

At least one of width or height is required.`,
    {
      input_path:  z.string().describe("Local file path or HTTP(S) URL to the input image"),
      output_path: z.string().optional().describe("Path to save the resized image. Defaults to auto-generated name"),
      width:       z.number().int().positive().optional().describe("Target width in pixels"),
      height:      z.number().int().positive().optional().describe("Target height in pixels"),
      fit:         z.enum(["cover", "contain", "fill", "inside", "outside"]).optional()
                     .describe("How to fit the image into the target dimensions (default: cover)"),
      background:  z.string().optional()
                     .describe('Background color for contain mode (e.g. "#ffffff", "rgba(0,0,0,0)")'),
    },
    async ({ input_path, output_path, width, height, fit, background }) => {
      if (!width && !height) throw new Error("At least one of width or height is required.");

      const buf  = await readInput(input_path);
      const opts = { fit: fit || "cover" };
      if (width)      opts.width      = width;
      if (height)     opts.height     = height;
      if (background) opts.background = background;

      const result  = await sharp(buf).resize(opts).toBuffer();
      const outPath = resolveOutputPath(input_path, output_path, "resized");
      return fileResult(result, outPath);
    }
  );
}
