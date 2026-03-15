import { z } from "zod";
import sharp from "sharp";
import { decodeInput, getMimeType } from "../utils.js";

export function registerOptimizeTool(server) {
  server.tool(
    "optimize",
    `Compresses / optimizes an image to reduce file size while preserving quality.

Format-specific behaviour:
  • JPEG — quality 1–100 (default 80), mozjpeg optimization enabled
  • PNG  — quality 1–100, max compression level, optional palette mode
  • WebP — quality 1–100 (default 80), optional lossless mode
  • AVIF — quality 1–100 (default 50)
  • TIFF — quality 1–100 (default 80)

Returns the optimized image together with a size-reduction report.`,
    {
      image:    z.string().describe("Base64-encoded input image"),
      quality:  z.number().int().min(1).max(100).optional()
                  .describe("Compression quality 1–100 (lower = smaller file)"),
      lossless: z.boolean().optional()
                  .describe("Use lossless compression where supported (PNG, WebP)"),
    },
    async ({ image, quality, lossless }) => {
      const buf          = decodeInput(image);
      const meta         = await sharp(buf).metadata();
      const originalSize = buf.length;

      let pipeline = sharp(buf);
      const fmt    = meta.format;

      if (fmt === "jpeg" || fmt === "jpg") {
        pipeline = pipeline.jpeg({ quality: quality || 80, mozjpeg: true });
      } else if (fmt === "png") {
        pipeline = pipeline.png({
          quality:          quality || 80,
          compressionLevel: 9,
          palette:          !lossless,
        });
      } else if (fmt === "webp") {
        pipeline = pipeline.webp({
          quality:  quality || 80,
          lossless: lossless || false,
        });
      } else if (fmt === "avif") {
        pipeline = pipeline.avif({ quality: quality || 50 });
      } else if (fmt === "gif") {
        pipeline = pipeline.gif();
      } else if (fmt === "tiff") {
        pipeline = pipeline.tiff({ quality: quality || 80 });
      } else {
        // Fallback — output as PNG
        pipeline = pipeline.png({ quality: quality || 80, compressionLevel: 9 });
      }

      const result     = await pipeline.toBuffer();
      const outputMeta = await sharp(result).metadata();
      const savedBytes = originalSize - result.length;
      const savedPct   = ((savedBytes / originalSize) * 100).toFixed(1);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              width:         outputMeta.width,
              height:        outputMeta.height,
              format:        outputMeta.format,
              originalSize,
              optimizedSize: result.length,
              savedBytes,
              savedPercent:  `${savedPct}%`,
            }),
          },
          {
            type: "image",
            data: result.toString("base64"),
            mimeType: getMimeType(outputMeta.format),
          },
        ],
      };
    }
  );
}
