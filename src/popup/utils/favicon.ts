/**
 * Favicon utility functions for detecting and handling default icons
 */

/**
 * Known characteristics of DuckDuckGo's default favicon
 * Based on actual measurements from https://icons.duckduckgo.com/ip3/chat.deepseek.com.ico
 * - Natural size: 48 × 48 px
 * - File size: ~1.5 kB (1536 bytes)
 */
const DEFAULT_FAVICON_CHARACTERISTICS = {
  width: 48, // Default icon width in pixels
  height: 48, // Default icon height in pixels
  fileSize: 1536, // Expected file size in bytes (1.5 kB)
  fileSizeTolerance: 100, // Allow ±100 bytes tolerance for file size check
};

/**
 * Check if a loaded image is the default favicon
 * by comparing dimensions and optionally file size
 */
export async function isDefaultFavicon(
  img: HTMLImageElement,
  url: string,
): Promise<boolean> {
  // Check dimensions
  const matchesDimensions =
    img.naturalWidth === DEFAULT_FAVICON_CHARACTERISTICS.width &&
    img.naturalHeight === DEFAULT_FAVICON_CHARACTERISTICS.height;

  if (!matchesDimensions) {
    return false;
  }

  // If file size is configured, also check file size for more accuracy
  if (DEFAULT_FAVICON_CHARACTERISTICS.fileSize > 0) {
    const fileSize = await getFaviconFileSize(url);
    if (fileSize === 0) {
      // If we can't get file size, rely on dimensions only
      console.log(`[Favicon] Cannot get file size for ${url}, using dimensions only`);
      return true;
    }

    // Check if file size is within tolerance range
    const sizeDiff = Math.abs(fileSize - DEFAULT_FAVICON_CHARACTERISTICS.fileSize);
    const isWithinTolerance = sizeDiff <= DEFAULT_FAVICON_CHARACTERISTICS.fileSizeTolerance;

    console.log(`[Favicon] File size check: actual=${fileSize}, expected=${DEFAULT_FAVICON_CHARACTERISTICS.fileSize}, diff=${sizeDiff}, isDefault=${isWithinTolerance}`);

    return isWithinTolerance;
  }

  // If only dimensions match, return true
  return true;
}

/**
 * Get the exact file size of a favicon
 */
async function getFaviconFileSize(url: string): Promise<number> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const contentLength = response.headers.get("content-length");

    if (contentLength) {
      return parseInt(contentLength, 10);
    }

    return 0;
  } catch {
    return 0;
  }
}
