import { CSS_CLASSES, UI_TEXT } from "@popup/utils/constants";
import { escapeHtml } from "@popup/utils/dom";
import { isDefaultFavicon } from "@popup/utils/favicon";
import { FaviconCacheService } from "@popup/services/faviconCache.service";
import { ActiveSessions, SessionData } from "@shared/types";
import { formatDate } from "@shared/utils/date";
import { extractRootDomain } from "@shared/utils/domain";

export class SessionList {
  private container: HTMLElement;
  private onSessionClick?: (sessionId: string) => void;
  private onRenameClick?: (sessionId: string) => void;
  private onDeleteClick?: (sessionId: string) => void;
  private expandedDomains: Set<string> = new Set(); // 跟踪展开的域名
  private faviconCache: FaviconCacheService;

  constructor(container: HTMLElement) {
    this.container = container;
    this.faviconCache = new FaviconCacheService();
    this.container.addEventListener("click", this.handleClick.bind(this));
    // Handle favicon load events
    this.container.addEventListener("load", this.handleImageLoad.bind(this), true);
    this.container.addEventListener("error", this.handleImageError.bind(this), true);

    // Cleanup expired cache entries on initialization
    this.faviconCache.cleanupExpiredEntries().catch(console.error);
  }

  setEventHandlers(handlers: {
    onSessionClick?: (sessionId: string) => void;
    onRenameClick?: (sessionId: string) => void;
    onDeleteClick?: (sessionId: string) => void;
  }): void {
    this.onSessionClick = handlers.onSessionClick;
    this.onRenameClick = handlers.onRenameClick;
    this.onDeleteClick = handlers.onDeleteClick;
  }

  render(sessions: SessionData[], activeSessions: ActiveSessions, currentDomain: string): void {
    if (sessions.length === 0) {
      this.renderEmptyState();
      return;
    }

    // 标准化域名：去除空格并转为小写
    const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();
    const normalizedCurrentDomain = normalizeDomain(currentDomain);

    // 按域名分组 - 使用标准化的域名作为 key
    const groupedSessions = new Map<string, SessionData[]>();
    sessions.forEach((session) => {
      const normalizedDomain = normalizeDomain(session.domain);
      if (!groupedSessions.has(normalizedDomain)) {
        groupedSessions.set(normalizedDomain, []);
      }
      groupedSessions.get(normalizedDomain)!.push(session);
    });

    // 按域名最近使用时间排序
    const sortedDomains = Array.from(groupedSessions.keys()).sort((a, b) => {
      const aLatest = Math.max(...groupedSessions.get(a)!.map((s) => s.lastUsed));
      const bLatest = Math.max(...groupedSessions.get(b)!.map((s) => s.lastUsed));
      return bLatest - aLatest;
    });

    this.renderGroupedSessions(sortedDomains, groupedSessions, activeSessions, normalizedCurrentDomain);

    // Load cached favicons asynchronously
    this.loadCachedFavicons();
  }

  private renderEmptyState(): void {
    this.container.innerHTML = `<div class="${CSS_CLASSES.NO_SESSIONS}">No sessions saved yet. Save your first session to get started!</div>`;
  }

  private renderGroupedSessions(
    domains: string[],
    groupedSessions: Map<string, SessionData[]>,
    activeSessions: ActiveSessions,
    currentDomain: string,
  ): void {
    // 辅助函数：标准化域名
    const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();

    const html = domains
      .map((normalizedDomain) => {
        const sessions = groupedSessions.get(normalizedDomain)!;
        const isCurrentDomain = normalizedDomain === currentDomain;
        const isExpanded = this.expandedDomains.has(normalizedDomain);

        // 在 activeSessions 中查找匹配的 sessionId（考虑域名标准化）
        let activeSessionId: string | undefined;
        for (const [domain, sessionId] of Object.entries(activeSessions)) {
          if (normalizeDomain(domain) === normalizedDomain) {
            activeSessionId = sessionId;
            break;
          }
        }

        const sessionCount = sessions.length;
        // 使用第一个 session 的原始域名作为显示用域名
        const displayDomain = sessions[0].domain;

        // 按最近使用时间排序
        const sortedSessions = sessions.sort((a, b) => b.lastUsed - a.lastUsed);

        const sessionsHtml = sortedSessions
          .map((session) => {
            const isActive = session.id === activeSessionId;
            const lastUsed = formatDate(session.lastUsed);

            const cookieCount = session.cookies?.length || 0;
            const storageCount = (Object.keys(session.localStorage || {}).length + Object.keys(session.sessionStorage || {}).length);
            const dataInfo = `${cookieCount} cookies${storageCount > 0 ? ` · ${storageCount} storage items` : ""}`;

            // Get favicon URL: use saved favicon or fallback to DuckDuckGo's service
            const faviconUrl = session.favicon || `https://icons.duckduckgo.com/ip3/${encodeURIComponent(session.domain)}.ico`;

            // Determine validity status and reason
            let validityStatus = "";

            if (session.isValid === true) {
              validityStatus = "<span class=\"validity-status valid\" title=\"Session is valid\">✓</span>";
            } else if (session.isValid === false) {
              // Show reason-specific icon and tooltip
              switch (session.invalidReason) {
                case "expired":
                  validityStatus = "<span class=\"validity-status invalid expired\" title=\"Session expired - cookies have expired\">⏱</span>";
                  break;
                case "logged_out":
                  validityStatus = "<span class=\"validity-status invalid logged-out\" title=\"Session invalid - likely logged out\">⚠</span>";
                  break;
                case "cookies_cleared":
                  validityStatus = "<span class=\"validity-status invalid cleared\" title=\"Session invalid - cookies were cleared\">🗑</span>";
                  break;
                default:
                  validityStatus = "<span class=\"validity-status invalid unknown\" title=\"Session invalid - unknown reason\">⚠</span>";
              }
            } else {
              validityStatus = "<span class=\"validity-status unknown\" title=\"Validation pending\">?</span>";
            }

            return `
            <div class="${CSS_CLASSES.SESSION_ITEM} ${isActive ? CSS_CLASSES.ACTIVE : ""} ${session.isValid === false ? "invalid" : ""}" data-session-id="${session.id}">
              <img
                class="session-favicon"
                src="${faviconUrl}"
                data-domain="${escapeHtml(session.domain)}"
                alt=""
              />
              <div class="session-info">
                <div class="session-name">
                  <span class="session-name-text">${escapeHtml(session.name)}</span>${isActive ? "<span class=\"active-indicator\">● Active</span>" : ""}${validityStatus}
                </div>
                <div class="session-meta">${dataInfo} · ${UI_TEXT.LAST_USED} ${lastUsed}</div>
              </div>
              <div class="session-actions">
                <button class="${CSS_CLASSES.SESSION_BTN} rename-btn" data-action="rename" data-session-id="${session.id}">
                  ✏️
                </button>
                <button class="${CSS_CLASSES.SESSION_BTN} delete-btn" data-action="delete" data-session-id="${session.id}">
                  🗑️
                </button>
              </div>
            </div>
          `;
          })
          .join("");

        return `
          <div class="domain-group ${isCurrentDomain ? "current-domain" : ""} ${isExpanded ? "expanded" : "collapsed"}" data-domain="${escapeHtml(normalizedDomain)}" title="${escapeHtml(displayDomain)}">
            <span class="domain-badge">${sessionCount}</span>
            <div class="domain-header" data-domain="${escapeHtml(normalizedDomain)}">
              <img
                class="domain-icon"
                src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(displayDomain)}.ico"
                data-domain="${escapeHtml(displayDomain)}"
                alt="${escapeHtml(displayDomain)}"
              />
              <svg class="expand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            <div class="domain-sessions">
              ${sessionsHtml}
            </div>
          </div>
        `;
      })
      .join("");

    this.container.innerHTML = html;
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;

    // 处理域名头部点击 - 展开/折叠
    const domainHeader = target.closest(".domain-header") as HTMLElement;
    if (domainHeader) {
      const domain = domainHeader.dataset.domain;
      if (domain) {
        e.stopPropagation();
        this.toggleDomain(domain);
        return;
      }
    }

    if (target.classList.contains(CSS_CLASSES.SESSION_BTN)) {
      e.stopPropagation();
      const action = target.dataset.action;
      const sessionId = target.dataset.sessionId;

      if (!sessionId) return;

      if (action === "rename" && this.onRenameClick) {
        this.onRenameClick(sessionId);
      } else if (action === "delete" && this.onDeleteClick) {
        this.onDeleteClick(sessionId);
      }
      return;
    }

    // Handle session switching
    const sessionItem = target.closest(`.${CSS_CLASSES.SESSION_ITEM}`) as HTMLElement;
    if (sessionItem && this.onSessionClick) {
      const sessionId = sessionItem.dataset.sessionId;
      if (sessionId) {
        this.onSessionClick(sessionId);
      }
    }
  }

  private toggleDomain(domain: string): void {
    const domainGroup = this.container.querySelector(`.domain-group[data-domain="${domain}"]`);
    if (!domainGroup) return;

    if (this.expandedDomains.has(domain)) {
      this.expandedDomains.delete(domain);
      domainGroup.classList.remove("expanded");
      domainGroup.classList.add("collapsed");
    } else {
      this.expandedDomains.add(domain);
      domainGroup.classList.remove("collapsed");
      domainGroup.classList.add("expanded");
    }
  }

  /**
   * Handle image load success - check if it's the default favicon
   * If yes, try root domain instead
   */
  private async handleImageLoad(e: Event): Promise<void> {
    const target = e.target as HTMLImageElement;

    // Only handle favicon images
    if (!target.classList.contains("session-favicon") && !target.classList.contains("domain-icon")) {
      return;
    }

    const originalDomain = target.dataset.domain;
    if (!originalDomain) return;

    // Skip if we've already tried the root domain
    if (target.dataset.triedRoot === "true") {
      return;
    }

    // Check if the loaded image is the default favicon
    const isDefault = await isDefaultFavicon(target, target.src);

    console.log(`[Favicon] ${originalDomain}: size=${target.naturalWidth}x${target.naturalHeight}, isDefault=${isDefault}`);

    if (isDefault) {
      // Try root domain
      const rootDomain = extractRootDomain(originalDomain);

      console.log(`[Favicon] Trying root domain: ${originalDomain} -> ${rootDomain}`);

      // Only try root domain if it's different from the original
      if (rootDomain !== originalDomain) {
        target.dataset.triedRoot = "true";
        target.src = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(rootDomain)}.ico`;
      } else {
        // If root domain is the same, use fallback SVG
        console.log("[Favicon] Root domain same as original, using fallback");
        this.useFallbackIcon(target);
      }
    }
  }

  /**
   * Handle image load errors - use fallback SVG
   */
  private handleImageError(e: Event): void {
    const target = e.target as HTMLImageElement;

    // Only handle favicon images
    if (!target.classList.contains("session-favicon") && !target.classList.contains("domain-icon")) {
      return;
    }

    const originalDomain = target.dataset.domain;
    if (!originalDomain) return;

    // Check if we've already tried the root domain
    if (target.dataset.triedRoot === "true") {
      // Final fallback: use SVG
      this.useFallbackIcon(target);
      return;
    }

    // Try root domain
    const rootDomain = extractRootDomain(originalDomain);

    // Only try root domain if it's different from the original
    if (rootDomain !== originalDomain) {
      target.dataset.triedRoot = "true";
      target.src = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(rootDomain)}.ico`;
    } else {
      // If root domain is the same as original, go straight to fallback
      this.useFallbackIcon(target);
    }
  }

  /**
   * Use fallback SVG icon
   */
  private useFallbackIcon(img: HTMLImageElement): void {
    img.src = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23cbd5e1%22 stroke-width=%222%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22/%3E%3Cpath d=%22M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z%22/%3E%3C/svg%3E";
    img.dataset.triedRoot = "final";
  }

  /**
   * Load cached favicons for all images in the container
   */
  private async loadCachedFavicons(): Promise<void> {
    const images = this.container.querySelectorAll<HTMLImageElement>("img.session-favicon, img.domain-icon");

    for (const img of images) {
      const domain = img.dataset.domain;
      if (!domain || img.dataset.cached === "true") {
        continue;
      }

      const originalSrc = img.src;

      try {
        // Try to get cached favicon
        const cachedUrl = await this.faviconCache.getFavicon(domain, originalSrc);

        // Only update if we got a data URL (cached version)
        if (cachedUrl.startsWith("data:")) {
          img.src = cachedUrl;
          img.dataset.cached = "true";
        }
      } catch (error) {
        console.error(`[SessionList] Failed to load cached favicon for ${domain}:`, error);
      }
    }
  }
}
