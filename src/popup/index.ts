import { getDomainFromUrl } from "@shared/utils/domain";
import { handleError } from "@shared/utils/errorHandling";
import { LoadingManager } from "./components/loadingManager";
import { ModalManager } from "./components/modalManager";
import { SessionList } from "./components/sessionList";
import { PopupService } from "./services/popup.service";
import { getElementByIdSafe } from "./utils/dom";

class PopupController {
  private loadingManager = new LoadingManager();
  private modalManager = new ModalManager();
  private sessionList: SessionList;
  private popupService = new PopupService();

  private currentSiteElement: HTMLElement;
  private saveBtn: HTMLButtonElement;
  private newSessionBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;

  constructor() {
    // Get DOM elements
    this.currentSiteElement = getElementByIdSafe("currentSite");
    this.saveBtn = getElementByIdSafe("saveBtn");
    this.newSessionBtn = getElementByIdSafe("newSessionBtn");
    this.refreshBtn = getElementByIdSafe("refreshBtn");

    // Initialize session list
    this.sessionList = new SessionList(getElementByIdSafe("sessionsList"));
    this.setupSessionListHandlers();
    this.setupEventListeners();
  }

  async initialize(): Promise<void> {
    try {
      this.modalManager.hideAllModals();
      const state = await this.loadingManager.withLoading(async () => {
        return await this.popupService.initialize();
      });

      // Check if the page is still loading
      const tab = await chrome.tabs.get(state.currentTab.id!);
      const isLoading = tab.status === "loading";

      if (isLoading) {
        this.setLoadingState(true);
        this.currentSiteElement.textContent = "Loading...";
      } else {
        this.setLoadingState(false);
        this.currentSiteElement.textContent = state.currentDomain;
      }

      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "PopupController.initialize"));
    }
  }

  getServiceInstance(): PopupService {
    return this.popupService;
  }

  private setupEventListeners(): void {
    this.saveBtn.addEventListener("click", () => this.handleSaveClick());
    this.newSessionBtn.addEventListener("click", () => this.handleNewSessionClick());
    this.refreshBtn.addEventListener("click", () => this.handleRefreshClick());

    // Modal event listeners
    getElementByIdSafe("confirmSave").addEventListener("click", () => this.handleConfirmSave());
    getElementByIdSafe("confirmRename").addEventListener("click", () => this.handleConfirmRename());
    getElementByIdSafe("confirmDelete").addEventListener("click", () => this.handleConfirmDelete());
  }

  private setupSessionListHandlers(): void {
    this.sessionList.setEventHandlers({
      onSessionClick: (sessionId) => this.handleSessionSwitch(sessionId),
      onRenameClick: (sessionId) => this.handleRenameClick(sessionId),
      onDeleteClick: (sessionId) => this.handleDeleteClick(sessionId),
    });
  }

  private async handleSaveClick(): Promise<void> {
    try {
      // Get current session to check cookie count
      const currentSession = await this.popupService.getCurrentSessionForWarning();
      const cookieCount = currentSession?.cookies?.length || 0;

      this.modalManager.showSaveModal("Unnamed Session", cookieCount);
    } catch (_error) {
      this.modalManager.showSaveModal(); // Fallback without warning
    }
  }

  private async handleConfirmSave(): Promise<void> {
    try {
      const name = this.modalManager.getSaveModalInput();

      await this.loadingManager.withLoading(async () => {
        await this.popupService.saveCurrentSession(name);
      });

      this.modalManager.hideSaveModal();
      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "save session"));
    }
  }

  private async handleNewSessionClick(): Promise<void> {
    try {
      await this.loadingManager.withLoading(async () => {
        await this.popupService.createNewSession();
      });

      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "create new session"));
    }
  }

  private async handleRefreshClick(): Promise<void> {
    try {
      // Add refreshing class for animation
      this.refreshBtn.classList.add("refreshing");
      this.refreshBtn.disabled = true;

      // Validate all sessions
      await this.popupService.validateAllSessions();

      // Re-render the sessions list with updated validation status
      this.renderSessionsList();

      // Small delay to show the animation
      setTimeout(() => {
        this.refreshBtn.classList.remove("refreshing");
        this.refreshBtn.disabled = false;
      }, 500);
    } catch (error) {
      this.refreshBtn.classList.remove("refreshing");
      this.refreshBtn.disabled = false;
      this.showError(handleError(error, "refresh sessions"));
    }
  }

  private async handleSessionSwitch(sessionId: string): Promise<void> {
    try {
      await this.loadingManager.withLoading(async () => {
        await this.popupService.switchToSession(sessionId);
      });

      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "switch session"));
    }
  }

  private handleRenameClick(sessionId: string): void {
    const session = this.popupService.getSession(sessionId);
    if (session) {
      this.popupService.setState({ currentRenameSessionId: sessionId });
      this.modalManager.showRenameModal(session.name);
    }
  }

  private async handleConfirmRename(): Promise<void> {
    try {
      const newName = this.modalManager.getRenameModalInput();
      const sessionId = this.popupService.getState().currentRenameSessionId;

      if (newName && sessionId) {
        await this.popupService.renameSession(sessionId, newName);
        this.renderSessionsList();
      }

      this.modalManager.hideRenameModal();
    } catch (error) {
      this.showError(handleError(error, "rename session"));
    }
  }

  private handleDeleteClick(sessionId: string): void {
    const session = this.popupService.getSession(sessionId);
    if (session) {
      this.popupService.setState({ currentDeleteSessionId: sessionId });
      this.modalManager.showDeleteModal(session.name);
    }
  }

  private async handleConfirmDelete(): Promise<void> {
    try {
      const sessionId = this.popupService.getState().currentDeleteSessionId;

      if (sessionId) {
        await this.popupService.deleteSession(sessionId);
        this.renderSessionsList();
      }

      this.modalManager.hideDeleteModal();
    } catch (error) {
      this.showError(handleError(error, "delete session"));
    }
  }

  private renderSessionsList(): void {
    const state = this.popupService.getState();
    this.sessionList.render(state.sessions, state.activeSessions, state.currentDomain);
  }

  private showError(message: string): void {
    console.error("Popup error:", message);

    this.modalManager.showErrorModal(message);
  }

  private setLoadingState(isLoading: boolean): void {
    if (isLoading) {
      this.saveBtn.disabled = true;
      this.newSessionBtn.disabled = true;
      this.saveBtn.classList.add("loading");
      this.newSessionBtn.classList.add("loading");
      this.currentSiteElement.classList.add("loading-site");
    } else {
      this.saveBtn.disabled = false;
      this.newSessionBtn.disabled = false;
      this.saveBtn.classList.remove("loading");
      this.newSessionBtn.classList.remove("loading");
      this.currentSiteElement.classList.remove("loading-site");
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("MySessionBox popup loaded");
  const controller = new PopupController();
  await controller.initialize();

  const service = controller.getServiceInstance();
  const state = service.getState();

  let currentDomain = state.currentDomain;

  const tabActivatedListener = async (activeInfo: { tabId: number }) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      const newDomain = getDomainFromUrl(tab.url);
      if (newDomain !== currentDomain) {
        currentDomain = newDomain;
        await controller.initialize();
      }
    }
  };

  const tabUpdatedListener = async (_: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (changeInfo.status === "loading" && tab.url) {
      const newDomain = getDomainFromUrl(tab.url);
      if (newDomain !== currentDomain) {
        currentDomain = newDomain;
        const currentSiteElement = document.getElementById("currentSite");
        if (currentSiteElement) {
          currentSiteElement.textContent = "Loading...";
          currentSiteElement.classList.add("loading-site");
        }
        // Disable buttons during loading
        const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
        const newSessionBtn = document.getElementById("newSessionBtn") as HTMLButtonElement;
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.classList.add("loading");
        }
        if (newSessionBtn) {
          newSessionBtn.disabled = true;
          newSessionBtn.classList.add("loading");
        }
      }
    } else if (changeInfo.status === "complete" && tab.url) {
      const newDomain = getDomainFromUrl(tab.url);
      if (newDomain !== currentDomain) {
        currentDomain = newDomain;
      }
      await controller.initialize();
    }
  };

  chrome.tabs.onActivated.addListener(tabActivatedListener);
  chrome.tabs.onUpdated.addListener(tabUpdatedListener);

  const cleanup = () => {
    chrome.tabs.onActivated.removeListener(tabActivatedListener);
    chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
  };

  window.addEventListener("beforeunload", cleanup);
  window.addEventListener("unload", cleanup);
});
