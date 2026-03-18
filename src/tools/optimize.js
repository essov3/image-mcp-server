import { z } from "zod";
import sharp from "sharp";
import { readInput, writeOutputFile, resolveOutputPath } from "../utils.js";
import { PORT } from "../config.js";
import { getDownloadUrl } from "../temp.js";
import path from "path";

export function registerOptimizeTool(server) {
  server.tool(
    "optimize",
    `Compresses / optimizes an image to reduce file size while preserving quality.
Reads from input_path (local file path or HTTP/HTTPS URL) and writes the result to output_path.
No image data passes through the AI — only file paths/URLs and a size-reduction report are exchanged.
In remote (HTTP) mode, the response includes a download_url for the processed image.

Format-specific behaviour:
  • JPEG — quality 1–100 (default 80), mozjpeg optimization enabled
  • PNG  — quality 1–100, max compression level, optional palette mode
  • WebP — quality 1–100 (default 80), optional lossless mode
  • AVIF — quality 1–100 (default 50)
  • TIFF — quality 1–100 (default 80)

Returns the output path together with a size-reduction report.`,
    {
      input_path:  z.string().describe("Local file path or HTTP(S) URL to the input image"),
      output_path: z.string().optional().describe("Path to save the optimized image. Defaults to auto-generated name"),
      quality:     z.number().int().min(1).max(100).optional()
                     .describe("Compression quality 1–100 (lower = smaller file)"),
      lossless:    z.boolean().optional()
                     .describe("Use lossless compression where supported (PNG, WebP)"),
    },
    async ({ input_path, output_path, quality, lossless }) => {
      const buf          = await readInput(input_path);
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
      const outPath    = resolveOutputPath(input_path, output_path, "optimized");

      await writeOutputFile(result, outPath);

      const responseData = {
        output_path:   outPath,
        width:         outputMeta.width,
        height:        outputMeta.height,
        format:        outputMeta.format,
        originalSize,
        optimizedSize: result.length,
        savedBytes,
        savedPercent:  `${savedPct}%`,
      };

      // In HTTP mode, include download URL
      if (PORT) {
        const fileId = path.basename(outPath);
        responseData.download_url = getDownloadUrl(fileId);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData),
        }],
      };
    }
  );
}
