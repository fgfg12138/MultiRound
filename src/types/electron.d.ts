// ===== AI 圆桌模拟器 — Electron API Type Declarations =====

import type { WhisperMessage, WhisperGroup, WhisperData } from '../lib/types.js';
import type { TokenRecord } from '../lib/types.js';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  models?: string[];
  defaultModel?: string;
  isCustom: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface ElectronAPI {
  // LLM discussion (with per-character provider)
  discussGenerate: (
    messages: { role: string; content: string }[],
    providerId?: string
  ) => Promise<{ content?: string; error?: string; code?: string }>;
  discussRun: (roundTable: any) => Promise<{ ok: boolean }>;
  discussStop: (roundTableId: string) => Promise<{ ok: boolean }>;
  discussUserHostInput: (roundTableId: string, content: string) => Promise<{ ok: boolean }>;
  discussPause: (roundTableId: string) => Promise<{ ok: boolean }>;
  discussResume: (roundTableId: string) => Promise<{ ok: boolean }>;
  discussRetryCharacter: (payload: { roundTableId: string; characterName: string; round: number; providerId?: string }) => Promise<{ ok: boolean; content?: string; error?: string }>;
  discussAppendRound: (roundTable: any) => Promise<{ ok: boolean }>;

  // Provider CRUD
  providersList: () => Promise<ProviderConfig[]>;
  providersSave: (config: ProviderConfig) => Promise<{ ok: boolean; error?: string }>;
  providersDelete: (id: string) => Promise<{ ok: boolean }>;
  providersUpdate: (id: string, updates: Partial<ProviderConfig>) => Promise<{ ok: boolean; error?: string }>;
  providersTest: (config: ProviderConfig) => Promise<{ content?: string; error?: string; code?: string }>;
  providersRevealKey: (providerId: string) => Promise<{ revealed: boolean; key?: string; name?: string; error?: string }>;
  providersFetchModels: (config: { baseUrl: string; apiKey: string }) => Promise<{ ok: boolean; models?: string[]; error?: string }>;

  // Roundtable management
  roundtablesSearch: (query?: string) => Promise<any[]>;
  roundtablesDeleteAll: (id?: string) => Promise<{ ok: boolean }>;
  roundtablesExport: (id: string) => Promise<{ content?: string; error?: string }>;

  // App info
  getUserDataPath: () => Promise<string>;

  // File-based data storage (roundtables & messages)
  dataGetPath: () => Promise<string>;
  dataSaveRoundtable: (rt: any) => Promise<{ ok: boolean; filename?: string }>;
  dataSaveMessages: (id: string, msgs: any[]) => Promise<{ ok: boolean; error?: string }>;
  dataLoadRoundtable: (id: string) => Promise<any>;
  dataLoadMessages: (id: string) => Promise<any[]>;
  dataListRoundtables: () => Promise<any[]>;
  dataDeleteRoundtable: (id: string) => Promise<{ ok: boolean }>;
  dataDeleteAllRoundtables: (id?: string) => Promise<{ ok: boolean }>;
  dataExportRoundtable: (id: string) => Promise<{ content?: string; error?: string }>;
  dataRepairIndex: () => Promise<{ repaired: number; removed: number; errors: string[] }>;
  dataOpenDirectory: () => Promise<void>;
  openMarkdownFile: () => Promise<
    | { ok: true; path: string; filename: string; content: string }
    | { ok: false; error: string }
    | null
  >;

  // Menu action listener (main → renderer)
  onMenuAction: (callback: (action: string) => void) => () => void;

  // Discussion runner event listeners (main → renderer)
  onDiscussMessage: (callback: (msg: any) => void) => () => void;
  onDiscussCharacterStart: (callback: (name: string) => void) => () => void;
  onDiscussComplete: (callback: (result: any) => void) => () => void;
  onDiscussError: (callback: (err: any) => void) => () => void;
  onDiscussAwaitingHostInput: (callback: (info: { roundTableId: string; round: number; phase?: string }) => void) => () => void;
  onDiscussPaused: (callback: (info: { roundTableId: string; round: number }) => void) => () => void;
  onDiscussPhaseChange: (callback: (data: { roundTableId: string; phase: string; label: string }) => void) => () => void;
  messagesUpdate: (roundTableId: string, messageId: string, content: string) => Promise<{ ok: boolean; error?: string }>;
  messagesDelete: (roundTableId: string, messageId: string) => Promise<{ ok: boolean; error?: string }>;

  // Whisper System
  whisperSend: (payload: { roundTableId: string; recipientId: string; content: string }) => Promise<{ ok: boolean; message?: WhisperMessage }>;
  whisperLoad: (payload: { roundTableId: string }) => Promise<WhisperData>;
  whisperCreateGroup: (payload: { roundTableId: string; name: string; memberIds: string[]; speakOrder: string }) => Promise<{ ok: boolean; group?: WhisperGroup }>;
  whisperSendGroup: (payload: { roundTableId: string; groupId: string; content: string }) => Promise<{ ok: boolean; message?: WhisperMessage }>;
  onWhisperReply: (callback: (data: { roundTableId: string; originalMessageId: string; reply: WhisperMessage }) => void) => () => void;
  onWhisperGroupReply: (callback: (data: { roundTableId: string; groupId: string; reply: WhisperMessage }) => void) => () => void;

  // Streaming events
  onDiscussModelUsed: (callback: (data: { providerId: string; model: string; characterId: string }) => void) => () => void;
  onDiscussRetry: (callback: (data: { roundTableId: string; retryingCharacter: string; retryAttempt: number; retryMax: number }) => void) => () => void;
  onDiscussStreamChunk: (callback: (data: { roundTableId: string; characterId: string; characterName: string; chunk?: string; reasoningChunk?: string }) => void) => () => void;
  onDiscussStreamEnd: (callback: (data: { roundTableId: string; characterId: string; characterName: string; content: string; error?: string }) => void) => () => void;

  // Token tracking events
  onDiscussTokenUpdate: (callback: (data: { roundTableId: string; records: TokenRecord[]; characterTotals?: Record<string, { total: number; input: number; output: number }>; totalTokens?: number }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
