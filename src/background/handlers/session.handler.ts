import { PageSignature, SessionData, StoredSession } from "@shared/types";
import { ExtensionError } from "@shared/utils/errorHandling";
import { CookieHandler } from "./cookie.handler";
import { StorageHandler } from "./storage.handler";

export class SessionHandler {
  private cookieHandler = new CookieHandler();
  private storageHandler = new StorageHandler();

  async getCurrentSession(domain: string, tabId: number): Promise<StoredSession> {
    try {
      const [cookies, storageData] = await Promise.all([
        this.cookieHandler.getCookiesForDomain(domain),
        this.storageHandler.getStorageData(tabId),
      ]);

      return {
        cookies,
        localStorage: storageData.localStorage,
        sessionStorage: storageData.sessionStorage,
      };
    } catch (error) {
      throw new ExtensionError(`Failed to get current session: ${error}`);
    }
  }

  async getPageSignature(tabId: number): Promise<PageSignature | null> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Inline the extractPageSignature logic to avoid import issues
          const userIndicators = [
            "[class*='user']",
            "[class*='avatar']",
            "[class*='profile']",
            "[id*='user']",
            "[id*='avatar']",
            "[id*='profile']",
            "[data-testid*='user']",
            "[data-testid*='avatar']",
            ".user-menu",
            ".user-avatar",
            ".user-name",
            ".account-menu",
            "#user-dropdown",
            "#account-dropdown",
          ];

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

          const storageKeys: string[] = [];
          const importantKeyPatterns = ["token", "auth", "user", "session", "login", "account"];

          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key) {
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
        },
      });

      return results?.[0]?.result || null;
    } catch (error) {
      console.error("Error getting page signature:", error);
      return null;
    }
  }

  async switchToSession(sessionData: SessionData, tabId: number): Promise<void> {
    const { domain, cookies, localStorage, sessionStorage } = sessionData;

    try {
      await this.cookieHandler.clearCookiesForDomain(domain);

      await Promise.all([
        this.cookieHandler.restoreCookies(cookies, domain),
        this.storageHandler.restoreStorageData(tabId, {
          localStorage,
          sessionStorage,
        }),
      ]);

      await chrome.tabs.reload(tabId);
    } catch (error) {
      throw new ExtensionError(`Failed to switch session: ${error}`);
    }
  }

  async clearSession(domain: string, tabId: number): Promise<void> {
    try {
      await Promise.all([
        this.cookieHandler.clearCookiesForDomain(domain),
        this.storageHandler.clearStorageData(tabId),
      ]);

      await chrome.tabs.reload(tabId);
    } catch (error) {
      throw new ExtensionError(`Failed to clear session: ${error}`);
    }
  }

  async validateSessions(sessions: SessionData[]): Promise<SessionData[]> {
    try {
      const validatedSessions = await Promise.all(
        sessions.map(async (session) => {
          const validation = await this.validateSession(session);
          return {
            ...session,
            isValid: validation.isValid,
            invalidReason: validation.reason,
          };
        })
      );

      return validatedSessions;
    } catch (error) {
      throw new ExtensionError(`Failed to validate sessions: ${error}`);
    }
  }

  private async validateSession(
    session: SessionData
  ): Promise<{ isValid: boolean; reason?: "expired" | "logged_out" | "cookies_cleared" | "unknown" }> {
    // Phase 1: Quick cookie check
    const cookieCheck = await this.checkSessionCookies(session);

    if (cookieCheck.isValid) {
      // Cookies look good, session is likely valid
      return { isValid: true };
    }

    // Phase 2: Deep validation (if cookies suggest invalid)
    // We can't perform deep validation without a tab context
    // So we rely on cookie analysis to determine the reason
    return {
      isValid: false,
      reason: cookieCheck.reason,
    };
  }

  private async checkSessionCookies(session: SessionData): Promise<{
    isValid: boolean;
    reason?: "expired" | "logged_out" | "cookies_cleared" | "unknown";
  }> {
    try {
      // Get current cookies for the session's domain
      const currentCookies = await this.cookieHandler.getCookiesForDomain(session.domain);

      // If session has no cookies, it's invalid
      if (!session.cookies || session.cookies.length === 0) {
        return { isValid: false, reason: "unknown" };
      }

      // Check each saved cookie
      let matchCount = 0;
      let expiredCount = 0;
      let missingCount = 0;

      for (const savedCookie of session.cookies) {
        // Check if cookie is expired
        if (!savedCookie.session && savedCookie.expirationDate) {
          const now = Date.now() / 1000; // Convert to seconds
          if (savedCookie.expirationDate < now) {
            expiredCount++;
            continue;
          }
        }

        // Check if cookie still exists with same value
        const exists = currentCookies.some(
          (currentCookie) =>
            currentCookie.name === savedCookie.name &&
            currentCookie.domain === savedCookie.domain &&
            currentCookie.value === savedCookie.value
        );

        if (exists) {
          matchCount++;
        } else {
          // Cookie exists but with different value, or doesn't exist
          const existsWithDifferentValue = currentCookies.some(
            (currentCookie) =>
              currentCookie.name === savedCookie.name && currentCookie.domain === savedCookie.domain
          );

          if (!existsWithDifferentValue) {
            missingCount++;
          }
        }
      }

      // Calculate match percentage
      const validityThreshold = 0.5;
      const matchPercentage = matchCount / session.cookies.length;

      if (matchPercentage >= validityThreshold) {
        return { isValid: true };
      }

      // Determine reason for invalidity
      const expiredPercentage = expiredCount / session.cookies.length;
      const missingPercentage = missingCount / session.cookies.length;

      if (expiredPercentage > 0.3) {
        return { isValid: false, reason: "expired" };
      } else if (missingPercentage > 0.5) {
        // Most cookies are missing - likely logged out or cleared
        return { isValid: false, reason: "logged_out" };
      } else if (missingPercentage > 0) {
        return { isValid: false, reason: "cookies_cleared" };
      } else {
        return { isValid: false, reason: "unknown" };
      }
    } catch (error) {
      console.error(`Error checking session cookies for ${session.name}:`, error);
      return { isValid: false, reason: "unknown" };
    }
  }
}
