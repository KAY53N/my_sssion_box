import { storedSessionDefaultValue } from "@popup/utils/defaultValue";
import { MESSAGE_ACTIONS } from "@shared/constants/messages";
import { STORAGE_KEYS } from "@shared/constants/storageKeys";
import { ExtensionStorage, PopupState, SessionData, StoredSession } from "@shared/types";
import { getDomainFromUrl } from "@shared/utils/domain";
import { ExtensionError, handleError } from "@shared/utils/errorHandling";
import { generateId } from "@shared/utils/idGenerator";
import { validateSessionName } from "@shared/utils/validation";
import { ChromeApiService } from "./chromeApi.service";

export class PopupService {
  private chromeApi = new ChromeApiService();
  private state: PopupState = {
    currentDomain: "",
    currentTab: {} as chrome.tabs.Tab,
    sessions: [],
    activeSessions: {},
    currentRenameSessionId: "",
    currentDeleteSessionId: "",
  };

  async initialize(): Promise<PopupState> {
    try {
      this.state.currentTab = await this.chromeApi.getCurrentTab();
      if (!this.state.currentTab.url) {
        throw new ExtensionError("Unable to get current tab URL");
      }

      this.state.currentDomain = getDomainFromUrl(this.state.currentTab.url);
      await this.loadStorageData();

      // Validate all sessions
      await this.validateAllSessions();

      return { ...this.state };
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.initialize"));
    }
  }

  async getCurrentSessionForWarning(): Promise<StoredSession | null> {
    try {
      const response = await this.chromeApi.sendMessage<StoredSession | null>({
        action: MESSAGE_ACTIONS.GET_CURRENT_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTab.id!,
      });

      if (!response.success) {
        return null;
      }

      return response.data ?? null;
    } catch (error) {
      console.error("Error getting current session for warning:", error);
      return null;
    }
  }

  async saveCurrentSession(name: string): Promise<SessionData> {
    try {
      const validatedName = validateSessionName(name);

      const [sessionResponse, pageSignatureResponse] = await Promise.all([
        this.chromeApi.sendMessage<StoredSession | null>({
          action: MESSAGE_ACTIONS.GET_CURRENT_SESSION,
          domain: this.state.currentDomain,
          tabId: this.state.currentTab.id!,
        }),
        this.chromeApi.sendMessage({
          action: MESSAGE_ACTIONS.GET_PAGE_SIGNATURE,
          tabId: this.state.currentTab.id!,
        }),
      ]);

      if (!sessionResponse.success) {
        throw new ExtensionError(sessionResponse.error || "Failed to get current session");
      }

      const storedSession = sessionResponse.data ?? storedSessionDefaultValue;
      const pageSignature = pageSignatureResponse.success ? pageSignatureResponse.data : null;

      const newSession: SessionData = {
        ...storedSession,
        id: generateId(),
        name: validatedName,
        domain: this.state.currentDomain,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        pageSignature: pageSignature || undefined,
        favicon: this.state.currentTab.favIconUrl || undefined,
      };

      this.state.sessions.push(newSession);
      this.state.activeSessions[this.state.currentDomain] = newSession.id;
      await this.saveStorageData();

      return newSession;
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.saveCurrentSession"));
    }
  }

  async switchToSession(sessionId: string): Promise<void> {
    try {
      const session = this.state.sessions.find((s) => s.id === sessionId);
      if (!session) {
        throw new ExtensionError("Session not found");
      }

      // 如果会话的域名和当前域名不同，需要先导航到目标域名
      if (session.domain !== this.state.currentDomain) {
        // 先应用会话的cookies
        const response = await this.chromeApi.sendMessage({
          action: MESSAGE_ACTIONS.SWITCH_SESSION,
          sessionData: session,
          tabId: this.state.currentTab.id!,
        });

        if (!response.success) {
          throw new ExtensionError(response.error || "Failed to switch session");
        }

        // 导航到目标域名（使用 https，如果失败则使用 http）
        const targetUrl = `https://${session.domain}`;
        await chrome.tabs.update(this.state.currentTab.id!, { url: targetUrl });
      } else {
        // 同域名，直接切换
        const response = await this.chromeApi.sendMessage({
          action: MESSAGE_ACTIONS.SWITCH_SESSION,
          sessionData: session,
          tabId: this.state.currentTab.id!,
        });

        if (!response.success) {
          throw new ExtensionError(response.error || "Failed to switch session");
        }
      }

      this.state.activeSessions[session.domain] = sessionId;
      session.lastUsed = Date.now();

      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.switchToSession"));
    }
  }

  async createNewSession(): Promise<void> {
    try {
      const response = await this.chromeApi.sendMessage({
        action: MESSAGE_ACTIONS.CLEAR_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTab.id!,
      });

      if (!response.success) {
        throw new ExtensionError(response.error || "Failed to clear session");
      }

      delete this.state.activeSessions[this.state.currentDomain];
      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.createNewSession"));
    }
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    try {
      const session = this.state.sessions.find((s) => s.id === sessionId);
      if (!session) {
        throw new ExtensionError("Session not found");
      }

      session.name = validateSessionName(newName);
      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.renameSession"));
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      this.state.sessions = this.state.sessions.filter((s) => s.id !== sessionId);

      if (this.state.activeSessions[this.state.currentDomain] === sessionId) {
        delete this.state.activeSessions[this.state.currentDomain];
      }

      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.deleteSession"));
    }
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.state.sessions.find((s) => s.id === sessionId);
  }

  getState(): PopupState {
    return { ...this.state };
  }

  setState(newState: Partial<PopupState>): void {
    this.state = { ...this.state, ...newState };
  }

  // 按域名分组获取所有会话
  getSessionsByDomain(): Map<string, SessionData[]> {
    const groupedSessions = new Map<string, SessionData[]>();

    this.state.sessions.forEach((session) => {
      const domain = session.domain;
      if (!groupedSessions.has(domain)) {
        groupedSessions.set(domain, []);
      }
      groupedSessions.get(domain)!.push(session);
    });

    // 按最近使用时间排序每个域名下的会话
    groupedSessions.forEach((sessions) => {
      sessions.sort((a, b) => b.lastUsed - a.lastUsed);
    });

    return groupedSessions;
  }

  // 获取所有域名列表，按最近使用排序
  getAllDomains(): string[] {
    const domains = Array.from(new Set(this.state.sessions.map((s) => s.domain)));

    // 按该域名下最近使用的会话时间排序
    return domains.sort((a, b) => {
      const aLatest = Math.max(...this.state.sessions.filter((s) => s.domain === a).map((s) => s.lastUsed));
      const bLatest = Math.max(...this.state.sessions.filter((s) => s.domain === b).map((s) => s.lastUsed));
      return bLatest - aLatest;
    });
  }

  async validateAllSessions(): Promise<void> {
    try {
      if (this.state.sessions.length === 0) {
        return;
      }

      const response = await this.chromeApi.sendMessage<SessionData[]>({
        action: MESSAGE_ACTIONS.VALIDATE_SESSIONS,
        sessions: this.state.sessions,
      });

      if (response.success && response.data) {
        this.state.sessions = response.data;
        // Don't save to storage here, as validation status is temporary
      }
    } catch (error) {
      console.error("Error validating sessions:", error);
      // Don't throw error, validation is not critical
    }
  }

  private async loadStorageData(): Promise<void> {
    try {
      const result = await this.chromeApi.getStorageData<ExtensionStorage>([
        STORAGE_KEYS.SESSIONS,
        STORAGE_KEYS.ACTIVE_SESSIONS,
      ]);

      this.state.sessions = result[STORAGE_KEYS.SESSIONS] || [];
      this.state.activeSessions = result[STORAGE_KEYS.ACTIVE_SESSIONS] || {};
    } catch (error) {
      console.error("Error loading storage data:", error);
      this.state.sessions = [];
      this.state.activeSessions = {};
    }
  }

  private async saveStorageData(): Promise<void> {
    await this.chromeApi.setStorageData({
      [STORAGE_KEYS.SESSIONS]: this.state.sessions,
      [STORAGE_KEYS.ACTIVE_SESSIONS]: this.state.activeSessions,
    });
  }
}
