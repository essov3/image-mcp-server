import { z } from "zod";
import sharp from "sharp";
import { decodeInput, imageResult } from "../utils.js";

export function registerRotateTool(server) {
  server.tool(
    "rotate",
    `Rotates an image by the specified angle (clockwise).

Any angle is supported — not limited to 90° increments.
Non-90° rotations enlarge the canvas and fill corners with a background colour.`,
    {
      image:      z.string().describe("Base64-encoded input image"),
      angle:      z.number().describe("Rotation angle in degrees (clockwise). Common: 90, 180, 270"),
      background: z.string().optional()
                    .describe('Background colour for non-90° rotations (e.g. "#ffffff"). Default: black'),
    },
    async ({ image, angle, background }) => {
      const buf  = decodeInput(image);
      const opts = {};
      if (background) opts.background = background;

      const result = await sharp(buf).rotate(angle, opts).toBuffer();
      return imageResult(result);
    }
  );
}
