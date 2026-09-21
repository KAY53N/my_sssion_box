import { STORAGE_KEYS } from "@shared/constants/storageKeys";
import { MessageService } from "./services/message.service";

const messageService = new MessageService();

// Extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log("MySessionBox extension started");
});

// Extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("MySessionBox extension installed/updated", details);

  if (details.reason === "install") {
    chrome.storage.local.set({
      [STORAGE_KEYS.SESSIONS]: [],
      [STORAGE_KEYS.ACTIVE_SESSIONS]: {},
    });
  }

  // Set side panel behavior - this makes clicking the icon open the side panel
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log("Side panel behavior set successfully");
  } catch (error) {
    console.error("Failed to set panel behavior:", error);
  }
});

// Monitor cookie changes for session validation
chrome.cookies.onChanged.addListener((changeInfo) => {
  // Only care about removed cookies (could indicate logout)
  if (changeInfo.removed) {
    console.log("Cookie removed:", changeInfo.cookie.domain, changeInfo.cookie.name);
    // The actual validation will happen when user opens popup
    // This just logs the change for debugging
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return messageService.handleMessage(message, sender, sendResponse);
});
