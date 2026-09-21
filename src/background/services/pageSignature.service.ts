import { PageSignature } from "@shared/types";

/**
 * Extracts page signature to identify logged-in state
 * This function runs in the page context via chrome.scripting.executeScript
 */
export function extractPageSignature(): PageSignature {
  // Common selectors that indicate a logged-in user
  const userIndicators = [
    "[class*='user']",
    "[class*='avatar']",
    "[class*='profile']",
    "[id*='user']",
    "[id*='avatar']",
    "[id*='profile']",
    "[data-testid*='user']",
    "[data-testid*='avatar']",
    // Common patterns
    ".user-menu",
    ".user-avatar",
    ".user-name",
    ".account-menu",
    "#user-dropdown",
    "#account-dropdown",
  ];

  // Check if any user-indicating elements exist
  let hasUserElements = false;
  for (const selector of userIndicators) {
    try {
      if (document.querySelector(selector)) {
        hasUserElements = true;
        break;
      }
    } catch (_e) {
      // Invalid selector, continue
    }
  }

  // Get important localStorage keys that might indicate logged-in state
  const storageKeys: string[] = [];
  const importantKeyPatterns = ["token", "auth", "user", "session", "login", "account"];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        // Check if key matches any important patterns
        const lowerKey = key.toLowerCase();
        if (importantKeyPatterns.some((pattern) => lowerKey.includes(pattern))) {
          storageKeys.push(key);
        }
      }
    }
  } catch (_error) {
    // localStorage might not be accessible
  }

  return {
    url: window.location.href,
    title: document.title,
    hasUserElements,
    storageKeys,
  };
}

/**
 * Validates if current page matches the saved signature
 * Returns a similarity score (0-1)
 */
export function validatePageSignature(savedSignature: PageSignature): number {
  const currentSignature = extractPageSignature();

  let score = 0;

  // Check 1: Title similarity (weight: 0.2)
  if (currentSignature.title === savedSignature.title) {
    score += 0.2;
  }

  // Check 2: User elements presence (weight: 0.4)
  if (currentSignature.hasUserElements === savedSignature.hasUserElements && savedSignature.hasUserElements) {
    score += 0.4;
  }

  // Check 3: Storage keys match (weight: 0.4)
  if (savedSignature.storageKeys.length > 0) {
    const matchingKeys = savedSignature.storageKeys.filter((key) => currentSignature.storageKeys.includes(key));
    const matchRatio = matchingKeys.length / savedSignature.storageKeys.length;
    score += 0.4 * matchRatio;
  }

  return score;
}
