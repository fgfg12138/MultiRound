// ===== AI 圆桌模拟器 — Electron API Type Declarations =====

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isCustom: boolean;
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

  // Provider CRUD
  providersList: () => Promise<ProviderConfig[]>;
  providersSave: (config: ProviderConfig) => Promise<{ ok: boolean; error?: string }>;
  providersDelete: (id: string) => Promise<{ ok: boolean }>;
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
  openMarkdownFile: () => Promise<{ path: string; content: string } | null>;

  // Menu action listener (main → renderer)
  onMenuAction: (callback: (action: string) => void) => () => void;

  // Discussion runner event listeners (main → renderer)
  onDiscussMessage: (callback: (msg: any) => void) => () => void;
  onDiscussCharacterStart: (callback: (name: string) => void) => () => void;
  onDiscussComplete: (callback: (result: any) => void) => () => void;
  onDiscussError: (callback: (err: any) => void) => () => void;
  onDiscussAwaitingHostInput: (callback: (info: { roundTableId: string; round: number }) => void) => () => void;

  // Generic storage
  storageGet: (key: string) => Promise<unknown>;
  storageSet: (key: string, value: unknown) => Promise<boolean>;
  storageDelete: (key: string) => Promise<boolean>;
  storageList: (prefix: string) => Promise<string[]>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
