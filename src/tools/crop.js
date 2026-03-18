import { z } from "zod";
import sharp from "sharp";
import { readInput, fileResult, resolveOutputPath } from "../utils.js";

export function registerCropTool(server) {
  server.tool(
    "crop",
    `Crops a region from an image.
Reads from input_path (local file path or HTTP/HTTPS URL) and writes the result to output_path.
No image data passes through the AI — only file paths/URLs and metadata are exchanged.
In remote (HTTP) mode, the response includes a download_url for the processed image.

Two modes:
  1. Manual crop — specify left, top, width, height to extract an exact region.
  2. Smart crop  — specify width and height with a gravity/position for
                   automatic subject-aware cropping.

Gravity values:
  north | northeast | east | southeast | south | southwest | west | northwest |
  centre | center | entropy (focus on busy region) | attention (focus on subject)`,
    {
      input_path:  z.string().describe("Local file path or HTTP(S) URL to the input image"),
      output_path: z.string().optional().describe("Path to save the cropped image. Defaults to auto-generated name"),
      left:        z.number().int().min(0).optional().describe("Left offset in pixels (manual crop)"),
      top:         z.number().int().min(0).optional().describe("Top offset in pixels (manual crop)"),
      width:       z.number().int().positive().describe("Width of the crop region in pixels"),
      height:      z.number().int().positive().describe("Height of the crop region in pixels"),
      gravity:     z.enum([
        "north", "northeast", "east", "southeast", "south",
        "southwest", "west", "northwest", "centre", "center",
        "entropy", "attention",
      ]).optional().describe("Crop gravity/position for smart crop (default: centre)"),
    },
    async ({ input_path, output_path, left, top, width, height, gravity }) => {
      const buf = await readInput(input_path);
      let pipeline = sharp(buf);

      if (left !== undefined && top !== undefined) {
        // Manual extract
        pipeline = pipeline.extract({ left, top, width, height });
      } else {
        // Smart crop via resize + position strategy
        const g        = gravity || "centre";
        const strategy = (g === "entropy" || g === "attention") ? g : undefined;
        pipeline = pipeline.resize({
          width,
          height,
          fit:      "cover",
          position: strategy || g,
        });
      }

      const result  = await pipeline.toBuffer();
      const outPath = resolveOutputPath(input_path, output_path, "cropped");
      return fileResult(result, outPath);
    }
  );
}
