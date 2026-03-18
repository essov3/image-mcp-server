import { z } from "zod";
import sharp from "sharp";
import path from "path";
import { readInputFile, writeOutputFile } from "../utils.js";

export function registerRemoveBgTool(server) {
  server.tool(
    "remove_bg",
    `Removes the background from an image using an AI model.
Reads from input_path and writes a PNG with transparent background to output_path.
No image data passes through the AI — only file paths and metadata are exchanged.

Works best with photos of people, products, animals, or any distinct foreground subject.
The first invocation downloads the AI model (~30 MB) and may take longer.
Subsequent calls are fast.`,
    {
      input_path:  z.string().describe("Absolute or relative path to the input image file"),
      output_path: z.string().optional().describe("Path to save the result PNG. Defaults to <name>_no_bg.png in the same directory"),
      model:       z.enum(["small", "medium"]).optional()
                     .describe("Model size: small (faster) or medium (better quality). Default: medium"),
    },
    async ({ input_path, output_path, model }) => {
      // Lazy-load to avoid download overhead when the tool is not used
      const { removeBackground } = await import("@imgly/background-removal-node");

      const buf        = await readInputFile(input_path);
      // Provide MIME type so the library can detect the input format
      const mime       = input_path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
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

      // Write raw PNG bytes directly — no re-encode needed, the library already outputs PNG.
      const parsed  = path.parse(input_path);
      const outPath = output_path || path.join(parsed.dir, `${parsed.name}_no_bg.png`);
      await writeOutputFile(resultBuf, outPath);

      // Use sharp only to read back metadata from the saved file.
      const meta = await sharp(outPath).metadata();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            output_path: outPath,
            width:       meta.width,
            height:      meta.height,
            format:      meta.format,
            size:        resultBuf.length,
            channels:    meta.channels,
            hasAlpha:    meta.hasAlpha,
          }),
        }],
      };
    }
  );
}
