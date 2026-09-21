/**
 * Favicon Cache Service
 * Caches favicon data URLs in chrome.storage.local to avoid repeated network requests
 */

import { STORAGE_KEYS } from "@shared/constants/storageKeys";

const FAVICON_CACHE_KEY = STORAGE_KEYS.FAVICON_CACHE;
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE = 100; // Maximum number of cached favicons

interface CachedFavicon {
  dataUrl: string;
  timestamp: number;
  domain: string;
}

interface FaviconCache {
  [domain: string]: CachedFavicon;
}

export class FaviconCacheService {
  private memoryCache: Map<string, string> = new Map();

  /**
   * Get favicon from cache or fetch and cache it
   */
  async getFavicon(domain: string, fallbackUrl: string): Promise<string> {
    // Check memory cache first
    if (this.memoryCache.has(domain)) {
      return this.memoryCache.get(domain)!;
    }

    // Check storage cache
    const cached = await this.getCachedFavicon(domain);
    if (cached) {
      this.memoryCache.set(domain, cached);
      return cached;
    }

    // Fetch and cache
    try {
      const dataUrl = await this.fetchAndConvertToDataUrl(fallbackUrl);
      await this.cacheFavicon(domain, dataUrl);
      this.memoryCache.set(domain, dataUrl);
      return dataUrl;
    } catch (error) {
      console.error(`[FaviconCache] Failed to fetch favicon for ${domain}:`, error);
      return fallbackUrl; // Return original URL as fallback
    }
  }

  /**
   * Get cached favicon from storage
   */
  private async getCachedFavicon(domain: string): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(FAVICON_CACHE_KEY);
      const cache: FaviconCache = result[FAVICON_CACHE_KEY] || {};
      
      const cached = cache[domain];
      if (!cached) {
        return null;
      }

      // Check if cache is expired
      const now = Date.now();
      if (now - cached.timestamp > CACHE_EXPIRY_MS) {
        // Remove expired entry
        delete cache[domain];
        await chrome.storage.local.set({ [FAVICON_CACHE_KEY]: cache });
        return null;
      }

      return cached.dataUrl;
    } catch (error) {
      console.error("[FaviconCache] Error reading cache:", error);
      return null;
    }
  }

  /**
   * Cache favicon in storage
   */
  private async cacheFavicon(domain: string, dataUrl: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get(FAVICON_CACHE_KEY);
      let cache: FaviconCache = result[FAVICON_CACHE_KEY] || {};

      // Add new entry
      cache[domain] = {
        dataUrl,
        timestamp: Date.now(),
        domain,
      };

      // Enforce cache size limit (LRU eviction)
      const entries = Object.entries(cache);
      if (entries.length > MAX_CACHE_SIZE) {
        // Sort by timestamp and remove oldest entries
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toKeep = entries.slice(-MAX_CACHE_SIZE);
        cache = Object.fromEntries(toKeep);
      }

      await chrome.storage.local.set({ [FAVICON_CACHE_KEY]: cache });
    } catch (error) {
      console.error("[FaviconCache] Error writing cache:", error);
    }
  }

  /**
   * Fetch favicon and convert to data URL
   */
  private async fetchAndConvertToDataUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }

  /**
   * Clear all cached favicons
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    await chrome.storage.local.remove(FAVICON_CACHE_KEY);
  }

  /**
   * Clear expired entries from cache
   */
  async cleanupExpiredEntries(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(FAVICON_CACHE_KEY);
      const cache: FaviconCache = result[FAVICON_CACHE_KEY] || {};
      
      const now = Date.now();
      let hasChanges = false;

      for (const [domain, cached] of Object.entries(cache)) {
        if (now - cached.timestamp > CACHE_EXPIRY_MS) {
          delete cache[domain];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await chrome.storage.local.set({ [FAVICON_CACHE_KEY]: cache });
      }
    } catch (error) {
      console.error("[FaviconCache] Error cleaning up cache:", error);
    }
  }
}

