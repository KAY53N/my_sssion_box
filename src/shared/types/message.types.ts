import { SessionData } from "./session.types";

export interface BaseMessage {
  action: string;
}

export interface GetCurrentSessionMessage extends BaseMessage {
  action: "getCurrentSession";
  domain: string;
  tabId: number;
}

export interface GetPageSignatureMessage extends BaseMessage {
  action: "getPageSignature";
  tabId: number;
}

export interface SwitchSessionMessage extends BaseMessage {
  action: "switchSession";
  sessionData: SessionData;
  tabId: number;
}

export interface ClearSessionMessage extends BaseMessage {
  action: "clearSession";
  domain: string;
  tabId: number;
}

export interface ValidateSessionsMessage extends BaseMessage {
  action: "validateSessions";
  sessions: SessionData[];
}

export type MessageType =
  | GetCurrentSessionMessage
  | GetPageSignatureMessage
  | SwitchSessionMessage
  | ClearSessionMessage
  | ValidateSessionsMessage;

export interface MessageResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SendResponseType<T = unknown> = (response: MessageResponse<T>) => void;
