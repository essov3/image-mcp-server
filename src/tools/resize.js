import { z } from "zod";
import sharp from "sharp";
import { readInputFile, fileResult, resolveOutputPath } from "../utils.js";

export function registerResizeTool(server) {
  server.tool(
    "resize",
    `Resizes an image to the specified dimensions.
Reads from input_path and writes the result to output_path (or auto-named next to the input file).
No image data passes through the AI — only file paths and metadata are exchanged.

Fit modes:
  • cover   — crop to exactly fill both dimensions (default)
  • contain — fit within dimensions, padding added if aspect differs
  • fill    — stretch to fill exactly (may distort)
  • inside  — preserve aspect ratio, fit within both dimensions
  • outside — preserve aspect ratio, cover both dimensions

At least one of width or height is required.`,
    {
      input_path:  z.string().describe("Absolute or relative path to the input image file"),
      output_path: z.string().optional().describe("Path to save the resized image. Defaults to <name>_resized.<ext> in the same directory"),
      width:       z.number().int().positive().optional().describe("Target width in pixels"),
      height:      z.number().int().positive().optional().describe("Target height in pixels"),
      fit:         z.enum(["cover", "contain", "fill", "inside", "outside"]).optional()
                     .describe("How to fit the image into the target dimensions (default: cover)"),
      background:  z.string().optional()
                     .describe('Background color for contain mode (e.g. "#ffffff", "rgba(0,0,0,0)")'),
    },
    async ({ input_path, output_path, width, height, fit, background }) => {
      if (!width && !height) throw new Error("At least one of width or height is required.");

      const buf  = await readInputFile(input_path);
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
