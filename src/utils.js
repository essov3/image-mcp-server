import sharp from "sharp";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { PORT } from "./config.js";
import { saveTempFile, getDownloadUrl } from "./temp.js";

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
 * Unified input reader — handles both local file paths and HTTP(S) URLs.
 * When input_path is a URL, fetches the image data via HTTP.
 * Otherwise reads from the local file system.
 */
export async function readInput(inputPath) {
  if (/^https?:\/\//i.test(inputPath)) {
    const res = await fetch(inputPath);
    if (!res.ok) {
      throw new Error(`Failed to fetch image from URL: ${res.status} ${res.statusText}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
  return readFile(inputPath);
}

/** Read an image file from disk into a Buffer (legacy alias). */
export async function readInputFile(filePath) {
  return readFile(filePath);
}

/** Write a buffer to disk, creating parent directories as needed. */
export async function writeOutputFile(buffer, outputPath) {
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, buffer);
}

/**
 * Detect the file extension from an input path or URL.
 * Falls back to the provided default or ".jpg".
 */
export function detectExt(inputPath, fallback = ".jpg") {
  // Strip query strings / fragments from URLs
  const cleanPath = inputPath.split("?")[0].split("#")[0];
  const ext = path.extname(cleanPath);
  return ext || fallback;
}

/**
 * Resolve the output file path.
 *
 * Remote mode (HTTP):
 *   If no outputPath is given, the result is saved to the temp directory
 *   so it can be served via a download URL.
 *
 * Local mode (stdio):
 *   If outputPath is provided, use it. Otherwise place the result next to the
 *   input file using the pattern  <name>_<suffix><ext>.
 *   Pass ext to override the file extension (e.g. for format conversions).
 */
export function resolveOutputPath(inputPath, outputPath, suffix, ext) {
  if (outputPath) return outputPath;

  if (PORT) {
    // Remote mode — output to temp directory
    const outExt = ext !== undefined ? ext : detectExt(inputPath);
    const { filePath } = saveTempFile(null, `_${suffix}${outExt}`);
    return filePath;
  }

  // Local mode — output next to input file
  const parsed = path.parse(inputPath);
  const outExt = ext !== undefined ? ext : parsed.ext;
  return path.join(parsed.dir, `${parsed.name}_${suffix}${outExt}`);
}

/**
 * Write a processed image buffer to outputPath and return an MCP text-only
 * response containing file metadata.  No image bytes are sent to the AI.
 *
 * In HTTP mode, the response includes a download_url for the output file.
 */
export async function fileResult(buffer, outputPath) {
  await writeOutputFile(buffer, outputPath);
  const meta = await sharp(buffer).metadata();

  const result = {
    output_path: outputPath,
    width:       meta.width,
    height:      meta.height,
    format:      meta.format,
    size:        buffer.length,
    channels:    meta.channels,
    hasAlpha:    meta.hasAlpha,
  };

  // In HTTP mode, also provide a download URL
  if (PORT) {
    const fileId = path.basename(outputPath);
    result.download_url = getDownloadUrl(fileId);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result),
    }],
  };
}
