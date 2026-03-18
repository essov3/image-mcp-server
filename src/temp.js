/**
 * Temp folder management — stores uploaded and processed images for remote
 * access via download URLs.  Files are automatically cleaned up after a
 * configurable max age (default 24 hours).
 */

import { mkdir, readdir, stat, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { TEMP_DIR, TEMP_MAX_AGE_HOURS, BASE_URL } from "./config.js";

/** Create the temp directory on startup. */
export async function initTempDir() {
  await mkdir(TEMP_DIR, { recursive: true });
  process.stderr.write(`[image-mcp] Temp directory: ${TEMP_DIR}\n`);
}

/**
 * Save a buffer to the temp directory with a UUID-based filename.
 * @param {Buffer} buffer — image data
 * @param {string} ext    — file extension including dot (e.g. ".jpg")
 * @returns {{ fileId: string, filePath: string, downloadUrl: string }}
 */
export function saveTempFile(buffer, ext) {
  const fileId   = `${randomUUID()}${ext}`;
  const filePath = path.join(TEMP_DIR, fileId);
  return { fileId, filePath, buffer };
}

/**
 * Build a download URL for a given file ID.
 * @param {string} fileId
 * @returns {string}
 */
export function getDownloadUrl(fileId) {
  return `${BASE_URL}/download/${fileId}`;
}

/**
 * Resolve a file ID to an absolute path in the temp directory.
 * Validates the file ID does not escape the temp directory.
 * @param {string} fileId
 * @returns {string} absolute path
 */
export function getTempFilePath(fileId) {
  // Prevent directory traversal
  const safeName = path.basename(fileId);
  return path.join(TEMP_DIR, safeName);
}

/**
 * Delete temp files older than TEMP_MAX_AGE_HOURS.
 */
async function cleanOldFiles() {
  const maxAgeMs = TEMP_MAX_AGE_HOURS * 60 * 60 * 1000;
  const now      = Date.now();

  let files;
  try {
    files = await readdir(TEMP_DIR);
  } catch {
    return; // temp dir doesn't exist yet
  }

  let cleaned = 0;
  for (const file of files) {
    const filePath = path.join(TEMP_DIR, file);
    try {
      const st = await stat(filePath);
      if (now - st.mtimeMs > maxAgeMs) {
        await unlink(filePath);
        cleaned++;
      }
    } catch {
      // file may have been deleted concurrently — skip
    }
  }

  if (cleaned > 0) {
    process.stderr.write(`[image-mcp] Cleaned ${cleaned} expired temp file(s)\n`);
  }
}

/**
 * Start the periodic cleanup scheduler.  Runs every hour.
 */
export function startCleanupScheduler() {
  // Run an initial cleanup on startup
  cleanOldFiles();

  const ONE_HOUR_MS = 60 * 60 * 1000;
  setInterval(cleanOldFiles, ONE_HOUR_MS);
  process.stderr.write(
    `[image-mcp] Temp cleanup scheduler started (max age: ${TEMP_MAX_AGE_HOURS}h)\n`
  );
}
