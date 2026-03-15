import { z } from "zod";
import sharp from "sharp";
import { decodeInput, imageResult } from "../utils.js";

export function registerCropTool(server) {
  server.tool(
    "crop",
    `Crops a region from an image.

Two modes:
  1. Manual crop — specify left, top, width, height to extract an exact region.
  2. Smart crop  — specify width and height with a gravity/position for
                   automatic subject-aware cropping.

Gravity values:
  north | northeast | east | southeast | south | southwest | west | northwest |
  centre | center | entropy (focus on busy region) | attention (focus on subject)`,
    {
      image:   z.string().describe("Base64-encoded input image"),
      left:    z.number().int().min(0).optional().describe("Left offset in pixels (manual crop)"),
      top:     z.number().int().min(0).optional().describe("Top offset in pixels (manual crop)"),
      width:   z.number().int().positive().describe("Width of the crop region in pixels"),
      height:  z.number().int().positive().describe("Height of the crop region in pixels"),
      gravity: z.enum([
        "north", "northeast", "east", "southeast", "south",
        "southwest", "west", "northwest", "centre", "center",
        "entropy", "attention",
      ]).optional().describe("Crop gravity/position for smart crop (default: centre)"),
    },
    async ({ image, left, top, width, height, gravity }) => {
      const buf = decodeInput(image);
      let pipeline = sharp(buf);

      if (left !== undefined && top !== undefined) {
        // Manual extract
        pipeline = pipeline.extract({ left, top, width, height });
      } else {
        // Smart crop via resize + position strategy
        const g = gravity || "centre";
        const strategy = (g === "entropy" || g === "attention") ? g : undefined;
        pipeline = pipeline.resize({
          width,
          height,
          fit: "cover",
          position: strategy || g,
        });
      }

      const result = await pipeline.toBuffer();
      return imageResult(result);
    }
  );
}
