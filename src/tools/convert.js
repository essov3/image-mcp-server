import { z } from "zod";
import sharp from "sharp";
import { decodeInput, imageResult } from "../utils.js";

export function registerConvertTool(server) {
  server.tool(
    "convert",
    `Converts an image to a different format.

Supported target formats: jpeg, png, webp, gif, avif, tiff.
Optionally set quality for lossy formats (default 80).`,
    {
      image:   z.string().describe("Base64-encoded input image"),
      format:  z.enum(["jpeg", "png", "webp", "gif", "avif", "tiff"])
                 .describe("Target output format"),
      quality: z.number().int().min(1).max(100).optional()
                 .describe("Quality for lossy formats 1–100 (default: 80)"),
    },
    async ({ image, format, quality }) => {
      const buf = decodeInput(image);
      const q   = quality || 80;

      let pipeline = sharp(buf);

      switch (format) {
        case "jpeg": pipeline = pipeline.jpeg({ quality: q }); break;
        case "png":  pipeline = pipeline.png({ quality: q });  break;
        case "webp": pipeline = pipeline.webp({ quality: q }); break;
        case "gif":  pipeline = pipeline.gif();                break;
        case "avif": pipeline = pipeline.avif({ quality: q }); break;
        case "tiff": pipeline = pipeline.tiff({ quality: q }); break;
      }

      const result = await pipeline.toBuffer();
      return imageResult(result);
    }
  );
}
