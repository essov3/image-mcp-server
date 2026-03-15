import sharp from "sharp";

const FORMAT_MIME = {
  jpeg: "image/jpeg",
  jpg:  "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  gif:  "image/gif",
  avif: "image/avif",
  tiff: "image/tiff",
  svg:  "image/svg+xml",
};

/** Map a sharp format name to a MIME type. */
export function getMimeType(format) {
  return FORMAT_MIME[format] || `image/${format}`;
}

/**
 * Build a standard MCP tool response containing image metadata + image content.
 * Returns both a text block (metadata JSON) and an image block (base64).
 */
export async function imageResult(buffer) {
  const meta = await sharp(buffer).metadata();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          width:    meta.width,
          height:   meta.height,
          format:   meta.format,
          size:     buffer.length,
          channels: meta.channels,
          hasAlpha: meta.hasAlpha,
        }),
      },
      {
        type: "image",
        data: buffer.toString("base64"),
        mimeType: getMimeType(meta.format),
      },
    ],
  };
}

/** Decode a base64 string (with optional data-URL prefix) into a Buffer. */
export function decodeInput(base64String) {
  const raw = base64String.replace(/^data:image\/[^;]+;base64,/, "");
  return Buffer.from(raw, "base64");
}
