import { z } from "zod";
import sharp from "sharp";
import { readInputFile, fileResult, resolveOutputPath } from "../utils.js";

export function registerRotateTool(server) {
  server.tool(
    "rotate",
    `Rotates an image by the specified angle (clockwise).
Reads from input_path and writes the result to output_path.
No image data passes through the AI — only file paths and metadata are exchanged.

Any angle is supported — not limited to 90° increments.
Non-90° rotations enlarge the canvas and fill corners with a background colour.`,
    {
      input_path:  z.string().describe("Absolute or relative path to the input image file"),
      output_path: z.string().optional().describe("Path to save the rotated image. Defaults to <name>_rotated.<ext> in the same directory"),
      angle:       z.number().describe("Rotation angle in degrees (clockwise). Common: 90, 180, 270"),
      background:  z.string().optional()
                     .describe('Background colour for non-90° rotations (e.g. "#ffffff"). Default: black'),
    },
    async ({ input_path, output_path, angle, background }) => {
      const buf  = await readInputFile(input_path);
      const opts = {};
      if (background) opts.background = background;

      const result  = await sharp(buf).rotate(angle, opts).toBuffer();
      const outPath = resolveOutputPath(input_path, output_path, "rotated");
      return fileResult(result, outPath);
    }
  );
}
