import { z } from "zod";
import sharp from "sharp";
import path from "path";
import { readInput, writeOutputFile } from "../utils.js";
import { PORT } from "../config.js";
import { saveTempFile, getDownloadUrl } from "../temp.js";

export function registerRemoveBgTool(server) {
  server.tool(
    "remove_bg",
    `Removes the background from an image using an AI model.
Reads from input_path (local file path or HTTP/HTTPS URL) and writes a PNG with transparent background to output_path.
No image data passes through the AI — only file paths/URLs and metadata are exchanged.
In remote (HTTP) mode, the response includes a download_url for the processed image.

Works best with photos of people, products, animals, or any distinct foreground subject.
The first invocation downloads the AI model (~30 MB) and may take longer.
Subsequent calls are fast.`,
    {
      input_path:  z.string().describe("Local file path or HTTP(S) URL to the input image"),
      output_path: z.string().optional().describe("Path to save the result PNG. Defaults to auto-generated name"),
      model:       z.enum(["small", "medium"]).optional()
                     .describe("Model size: small (faster) or medium (better quality). Default: medium"),
    },
    async ({ input_path, output_path, model }) => {
      // Lazy-load to avoid download overhead when the tool is not used
      const { removeBackground } = await import("@imgly/background-removal-node");

      const buf        = await readInput(input_path);
      // Provide MIME type so the library can detect the input format
      const cleanPath  = input_path.split("?")[0].split("#")[0];
      const mime       = cleanPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      const blob       = new Blob([buf], { type: mime });
      const resultBlob = await removeBackground(blob, {
        model:  model || "medium",
        output: { format: "image/png" },
      });

      const arrayBuf  = await resultBlob.arrayBuffer();
      const resultBuf = Buffer.from(arrayBuf);

      if (resultBuf.length === 0) {
        throw new Error("Background removal returned an empty result — the model may have failed to process this image.");
      }

      // Determine output path
      let outPath;
      if (output_path) {
        outPath = output_path;
      } else if (PORT) {
        // Remote mode — save to temp directory
        const { filePath } = saveTempFile(null, "_no_bg.png");
        outPath = filePath;
      } else {
        // Local mode — save next to input file
        const parsed = path.parse(input_path);
        outPath = path.join(parsed.dir, `${parsed.name}_no_bg.png`);
      }

      await writeOutputFile(resultBuf, outPath);

      // Use sharp only to read back metadata from the saved file.
      const meta = await sharp(outPath).metadata();

      const responseData = {
        output_path: outPath,
        width:       meta.width,
        height:      meta.height,
        format:      meta.format,
        size:        resultBuf.length,
        channels:    meta.channels,
        hasAlpha:    meta.hasAlpha,
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
