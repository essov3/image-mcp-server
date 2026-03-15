import { z } from "zod";
import sharp from "sharp";
import { decodeInput, imageResult } from "../utils.js";

export function registerRemoveBgTool(server) {
  server.tool(
    "remove_bg",
    `Removes the background from an image using an AI model.
Returns a PNG with a transparent background.

Works best with photos of people, products, animals, or any distinct foreground subject.
The first invocation downloads the AI model (~30 MB) and may take longer.
Subsequent calls are fast.`,
    {
      image: z.string().describe("Base64-encoded input image"),
      model: z.enum(["small", "medium"]).optional()
               .describe("Model size: small (faster) or medium (better quality). Default: medium"),
    },
    async ({ image, model }) => {
      // Lazy-load to avoid download overhead when the tool is not used
      const { removeBackground } = await import("@imgly/background-removal-node");

      const buf        = decodeInput(image);
      const blob       = new Blob([buf]);
      const resultBlob = await removeBackground(blob, {
        model: model || "medium",
        output: { format: "image/png" },
      });

      const arrayBuf = await resultBlob.arrayBuffer();
      const resultBuf = Buffer.from(arrayBuf);

      // Ensure output is PNG for transparency support
      const pngBuf = await sharp(resultBuf).png().toBuffer();
      return imageResult(pngBuf);
    }
  );
}
