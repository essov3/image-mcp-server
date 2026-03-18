import { z } from "zod";
import sharp from "sharp";
import { readInput, fileResult, resolveOutputPath } from "../utils.js";

export function registerConvertTool(server) {
  server.tool(
    "convert",
    `Converts an image to a different format.
Reads from input_path (local file path or HTTP/HTTPS URL) and writes the result to output_path.
No image data passes through the AI — only file paths/URLs and metadata are exchanged.
In remote (HTTP) mode, the response includes a download_url for the processed image.

Supported target formats: jpeg, png, webp, gif, avif, tiff.
Optionally set quality for lossy formats (default 80).`,
    {
      input_path:  z.string().describe("Local file path or HTTP(S) URL to the input image"),
      output_path: z.string().optional().describe("Path to save the converted image. Defaults to auto-generated name"),
      format:      z.enum(["jpeg", "png", "webp", "gif", "avif", "tiff"])
                     .describe("Target output format"),
      quality:     z.number().int().min(1).max(100).optional()
                     .describe("Quality for lossy formats 1–100 (default: 80)"),
    },
    async ({ input_path, output_path, format, quality }) => {
      const buf = await readInput(input_path);
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

      const result  = await pipeline.toBuffer();
      const ext     = format === "jpeg" ? ".jpg" : `.${format}`;
      const outPath = resolveOutputPath(input_path, output_path, "converted", ext);
      return fileResult(result, outPath);
    }
  );
}
