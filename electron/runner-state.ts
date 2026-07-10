// ===== AI 圆桌模拟器 — Runner Shared State =====
// 供 discussion-runner.ts 与 whisper-runner.ts 共享

import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { callProviderLLM, callProviderLLMStream, decryptProvider, ProviderConfig, StoredProviderConfig } from './providers.js';
import type { Message, MsgType } from './types.js';

export const store = new Store({ name: 'multiround-discussion', projectName: 'multiround' } as any);
export const PROVIDER_PREFIX = 'provider:';

export type SessionState = {
  controller: AbortController;
  pauseResolver?: () => void;
  pausePromise?: Promise<void>;
  pauseResolve?: () => void;
  hostInputResolver?: (content: string) => void;
};
export const sessions = new Map<string, SessionState>();

export function genId(): string { return crypto.randomUUID(); }

export function buildMsg(
  rtId: string, rnd: number, charId: string | 'host', charName: string,
  type: MsgType, content: string, opts?: { error?: string; provId?: string }
): Message {
  return { id: genId(), roundTableId: rtId, round: rnd, characterId: charId,
    characterName: charName, type, content, error: opts?.error,
    providerId: opts?.provId, timestamp: Date.now() };
}

export function send(ch: string, ...args: unknown[]): void {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0 && !wins[0].isDestroyed()) wins[0].webContents.send(ch, ...args);
}

export function resolveProvider(providerId?: string): ProviderConfig | undefined {
  const allKeys = Object.keys(store.store).filter((k) => k.startsWith(PROVIDER_PREFIX));
  if (providerId) {
    const raw = store.get(`${PROVIDER_PREFIX}${providerId}`);
    if (typeof raw === 'string') {
      try { return decryptProvider(JSON.parse(raw) as StoredProviderConfig); } catch { /* */ }
    }
  }
  for (const key of allKeys) {
    const raw = store.get(key);
    if (typeof raw === 'string') {
      try { return decryptProvider(JSON.parse(raw) as StoredProviderConfig); } catch { /* */ }
    }
  }
  return undefined;
}

export async function callLlm(sys: string, user: string, sig?: AbortSignal, provId?: string, temp?: number, onChunk?: (chunk: string) => void): Promise<{ content?: string; error?: string }> {
  if (sig?.aborted) return { error: '生成已中止' };
  try {
    const p = resolveProvider(provId);
  if (p) send('discuss:model-used', { providerId: provId, model: p.defaultModel || p.models?.[0] || p.model });
    if (!p) return { content: '', error: '未配置 LLM 厂商' };
    if (onChunk) {
      return await callProviderLLMStream(p, [{ role: 'system', content: sys }, { role: 'user', content: user }], onChunk, temp, sig);
    }
    const r = await callProviderLLM(p, [{ role: 'system', content: sys }, { role: 'user', content: user }], temp);
    if (sig?.aborted) return { error: '生成已中止' };
    return r.content ? { content: r.content } : { error: r.error || 'LLM 调用返回空' };
  } catch (e: any) {
    if (sig?.aborted) return { error: '生成已中止' };
    return { error: e.message || 'LLM 调用异常' };
  }
}

/** Create a pending Promise and return it with its resolve function */
export function createPendingPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
