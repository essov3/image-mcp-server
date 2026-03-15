import { z } from "zod";
import sharp from "sharp";
import { decodeInput, imageResult } from "../utils.js";

export function registerResizeTool(server) {
  server.tool(
    "resize",
    `Resizes an image to the specified dimensions.
Provide image as base64 string. Returns the resized image with metadata.

Fit modes:
  • cover   — crop to exactly fill both dimensions (default)
  • contain — fit within dimensions, padding added if aspect differs
  • fill    — stretch to fill exactly (may distort)
  • inside  — preserve aspect ratio, fit within both dimensions
  • outside — preserve aspect ratio, cover both dimensions

At least one of width or height is required.`,
    {
      image:      z.string().describe("Base64-encoded input image (data-URL prefix allowed)"),
      width:      z.number().int().positive().optional().describe("Target width in pixels"),
      height:     z.number().int().positive().optional().describe("Target height in pixels"),
      fit:        z.enum(["cover", "contain", "fill", "inside", "outside"]).optional()
                    .describe("How to fit the image into the target dimensions (default: cover)"),
      background: z.string().optional()
                    .describe('Background color for contain mode (e.g. "#ffffff", "rgba(0,0,0,0)")'),
    },
    async ({ image, width, height, fit, background }) => {
      if (!width && !height) throw new Error("At least one of width or height is required.");

      const buf  = decodeInput(image);
      const opts = { fit: fit || "cover" };
      if (width)  opts.width  = width;
      if (height) opts.height = height;
      if (background) opts.background = background;

      const result = await sharp(buf).resize(opts).toBuffer();
      return imageResult(result);
    }
  );
}
