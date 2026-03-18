import sharp from "sharp";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

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

/** Read an image file from disk into a Buffer. */
export async function readInputFile(filePath) {
  return readFile(filePath);
}

/** Write a buffer to disk, creating parent directories as needed. */
export async function writeOutputFile(buffer, outputPath) {
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, buffer);
}

/**
 * Resolve the output file path.
 * If outputPath is provided, use it. Otherwise place the result next to the
 * input file using the pattern  <name>_<suffix><ext>.
 * Pass ext to override the file extension (e.g. for format conversions).
 */
export function resolveOutputPath(inputPath, outputPath, suffix, ext) {
  if (outputPath) return outputPath;
  const parsed = path.parse(inputPath);
  const outExt = ext !== undefined ? ext : parsed.ext;
  return path.join(parsed.dir, `${parsed.name}_${suffix}${outExt}`);
}

/**
 * Write a processed image buffer to outputPath and return an MCP text-only
 * response containing file metadata. No image bytes are sent to the AI.
 */
export async function fileResult(buffer, outputPath) {
  await writeOutputFile(buffer, outputPath);
  const meta = await sharp(buffer).metadata();
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        output_path: outputPath,
        width:       meta.width,
        height:      meta.height,
        format:      meta.format,
        size:        buffer.length,
        channels:    meta.channels,
        hasAlpha:    meta.hasAlpha,
      }),
    }],
  };
}
