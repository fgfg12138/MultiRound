// ===== AI 圆桌模拟器 — Electron Preload Script =====

import { contextBridge, ipcRenderer } from 'electron';
import type { ProviderConfig } from './providers.js';
import type { WhisperMessage, WhisperGroup, TokenRecord } from './types.js';

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // LLM discussion (with per-character provider)
    discussGenerate: (
      messages: { role: string; content: string }[],
      providerId?: string
    ) => ipcRenderer.invoke('discuss:generate', messages, providerId),
    discussRun: (roundTable: any) =>
      ipcRenderer.invoke('discuss:run', roundTable),
    discussStop: (roundTableId: string) =>
      ipcRenderer.invoke('discuss:stop', roundTableId),
    discussUserHostInput: (roundTableId: string, content: string) =>
      ipcRenderer.invoke('discuss:user-host-input', roundTableId, content),
    discussPause: (roundTableId: string) =>
      ipcRenderer.invoke('discuss:pause', roundTableId),
    discussResume: (roundTableId: string) =>
      ipcRenderer.invoke('discuss:resume', roundTableId),
    discussRetryCharacter: (payload: { roundTableId: string; characterName: string; round: number; providerId?: string }) =>
      ipcRenderer.invoke('discuss:retry-character', payload),
    discussAppendRound: (roundTable: any) =>
      ipcRenderer.invoke('discuss:append-round', roundTable),

    // Provider CRUD
    providersList: () => ipcRenderer.invoke('providers:list'),
    providersSave: (config: ProviderConfig) =>
      ipcRenderer.invoke('providers:save', config),
    providersDelete: (id: string) =>
      ipcRenderer.invoke('providers:delete', id),
    providersTest: (config: ProviderConfig) =>
      ipcRenderer.invoke('providers:test', config),
    providersRevealKey: (providerId: string) =>
      ipcRenderer.invoke('providers:reveal-key', providerId),
    providersFetchModels: (config: { baseUrl: string; apiKey: string }) =>
      ipcRenderer.invoke('providers:fetch-models', config),

    // Roundtable management
    roundtablesSearch: (query?: string) =>
      ipcRenderer.invoke('roundtables:search', query || ''),
    roundtablesDeleteAll: (id?: string) =>
      ipcRenderer.invoke('roundtables:delete-all', id),
    roundtablesExport: (id: string) =>
      ipcRenderer.invoke('roundtables:export', id),

    // App info
    getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),

    // File-based data storage (roundtables & messages)
    dataGetPath: () => ipcRenderer.invoke('data:get-path'),
    dataSaveRoundtable: (rt: any) =>
      ipcRenderer.invoke('data:save-roundtable', rt),
    dataSaveMessages: (id: string, msgs: any[]) =>
      ipcRenderer.invoke('data:save-messages', id, msgs),
    dataLoadRoundtable: (id: string) =>
      ipcRenderer.invoke('data:load-roundtable', id),
    dataLoadMessages: (id: string) =>
      ipcRenderer.invoke('data:load-messages', id),
    dataListRoundtables: () =>
      ipcRenderer.invoke('data:list-roundtables'),
    dataDeleteRoundtable: (id: string) =>
      ipcRenderer.invoke('data:delete-roundtable', id),
    dataDeleteAllRoundtables: (id?: string) =>
      ipcRenderer.invoke('data:delete-all-roundtables', id),
    dataExportRoundtable: (id: string) =>
      ipcRenderer.invoke('data:export-roundtable', id),
    dataRepairIndex: () =>
      ipcRenderer.invoke('data:repair-index'),
    dataOpenDirectory: () =>
      ipcRenderer.invoke('data:open-directory'),
    openMarkdownFile: () =>
      ipcRenderer.invoke('dialog:open-markdown'),

    // Menu action listener (main → renderer)
    onMenuAction: (callback: (action: string) => void) => {
      const handler = (_event: any, action: string) => callback(action);
      ipcRenderer.on('menu-action', handler);
      return () => ipcRenderer.removeListener('menu-action', handler);
    },

    // Discussion runner event listeners (main → renderer)
    onDiscussMessage: (callback: (msg: any) => void) => {
      const handler = (_event: any, msg: any) => callback(msg);
      ipcRenderer.on('discuss:message', handler);
      return () => ipcRenderer.removeListener('discuss:message', handler);
    },
    onDiscussCharacterStart: (callback: (name: string) => void) => {
      const handler = (_event: any, name: string) => callback(name);
      ipcRenderer.on('discuss:character-start', handler);
      return () => ipcRenderer.removeListener('discuss:character-start', handler);
    },
    onDiscussComplete: (callback: (result: any) => void) => {
      const handler = (_event: any, result: any) => callback(result);
      ipcRenderer.on('discuss:complete', handler);
      return () => ipcRenderer.removeListener('discuss:complete', handler);
    },
    onDiscussError: (callback: (err: any) => void) => {
      const handler = (_event: any, err: any) => callback(err);
      ipcRenderer.on('discuss:error', handler);
      return () => ipcRenderer.removeListener('discuss:error', handler);
    },
    onDiscussAwaitingHostInput: (callback: (info: { roundTableId: string; round: number; phase?: string }) => void) => {
      const handler = (_event: any, info: any) => callback(info);
      ipcRenderer.on('discuss:awaiting-host-input', handler);
      return () => ipcRenderer.removeListener('discuss:awaiting-host-input', handler);
    },
    onDiscussPaused: (callback: (info: { roundTableId: string; round: number }) => void) => {
      const handler = (_event: any, info: any) => callback(info);
      ipcRenderer.on('discuss:paused', handler);
      return () => ipcRenderer.removeListener('discuss:paused', handler);
    },

    // Whisper System IPC
    whisperSend: (payload: { roundTableId: string; recipientId: string; content: string }) =>
      ipcRenderer.invoke('whisper:send', payload),
    whisperLoad: (payload: { roundTableId: string }) =>
      ipcRenderer.invoke('whisper:load', payload),
    whisperCreateGroup: (payload: { roundTableId: string; name: string; memberIds: string[]; speakOrder: string }) =>
      ipcRenderer.invoke('whisper:create-group', payload),
    whisperSendGroup: (payload: { roundTableId: string; groupId: string; content: string }) =>
      ipcRenderer.invoke('whisper:send-group', payload),
    onWhisperReply: (
      callback: (data: {
        roundTableId: string;
        originalMessageId: string;
        reply: WhisperMessage;
      }) => void
    ) => {
      const handler = (
        _event: any,
        data: { roundTableId: string; originalMessageId: string; reply: WhisperMessage }
      ) => callback(data);
      ipcRenderer.on('whisper:reply', handler);
      return () => ipcRenderer.removeListener('whisper:reply', handler);
    },
    onWhisperGroupReply: (
      callback: (data: {
        roundTableId: string;
        groupId: string;
        reply: WhisperMessage;
      }) => void
    ) => {
      const handler = (
        _event: any,
        data: { roundTableId: string; groupId: string; reply: WhisperMessage }
      ) => callback(data);
      ipcRenderer.on('whisper:group-reply', handler);
      return () => ipcRenderer.removeListener('whisper:group-reply', handler);
    },

    // Streaming chunk events (main → renderer)
    onDiscussStreamChunk: (callback: (data: { roundTableId: string; characterId: string; characterName: string; chunk: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('discuss:stream-chunk', handler);
      return () => ipcRenderer.removeListener('discuss:stream-chunk', handler);
    },
    onDiscussStreamEnd: (callback: (data: { roundTableId: string; characterId: string; characterName: string; content: string; error?: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('discuss:stream-end', handler);
      return () => ipcRenderer.removeListener('discuss:stream-end', handler);
    },
    onDiscussTokenUpdate: (callback: (data: { roundTableId: string; records: TokenRecord[]; characterTotals?: Record<string, { total: number; input: number; output: number }>; totalTokens?: number }) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('discuss:token-update', handler);
      return () => ipcRenderer.removeListener('discuss:token-update', handler);
    },

    // Generic storage
    storageGet: (key: string) => ipcRenderer.invoke('storage:get', key),
    storageSet: (key: string, value: unknown) =>
      ipcRenderer.invoke('storage:set', key, value),
    storageDelete: (key: string) => ipcRenderer.invoke('storage:delete', key),
    storageList: (prefix: string) => ipcRenderer.invoke('storage:list', prefix),
  });
} catch (err: any) {
  // If contextBridge fails, expose error so renderer can diagnose
  try {
    contextBridge.exposeInMainWorld('electronAPI', {
      _error: err?.message || 'preload 脚本加载失败',
    });
  } catch {
    // contextBridge itself is broken — nothing we can do
  }
}
