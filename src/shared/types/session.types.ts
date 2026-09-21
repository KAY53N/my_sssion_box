export type SessionInvalidReason = "expired" | "logged_out" | "cookies_cleared" | "unknown";

export interface PageSignature {
  url: string; // URL when session was saved
  title: string; // Page title when logged in
  hasUserElements: boolean; // Whether user-specific elements exist (avatar, username, etc)
  storageKeys: string[]; // Key localStorage/sessionStorage keys that indicate logged-in state
}

export interface SessionData extends StoredSession {
  id: string;
  name: string;
  domain: string;
  createdAt: number;
  lastUsed: number;
  isValid?: boolean; // Session validity status: true if cookies exist in browser, false if expired/cleared
  invalidReason?: SessionInvalidReason; // Reason why session is invalid
  pageSignature?: PageSignature; // Page characteristics when session was saved for deep validation
  favicon?: string; // Website favicon URL
}

export interface StoredSession {
  cookies: chrome.cookies.Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface ActiveSessions {
  [domain: string]: string; // domain -> sessionId
}
