// ===== AI 圆桌模拟器 — Runner Control Functions =====
// 停止/暂停/恢复用户主持输入 — 从 discussion-runner.ts 拆分

import { sessions, createPendingPromise } from './runner-state.js';

export function injectUserHostInput(roundTableId: string, content: string): boolean {
  const s = sessions.get(roundTableId);
  if (s?.hostInputResolver) { s.hostInputResolver(content); s.hostInputResolver = undefined; return true; }
  return false;
}

export function pauseDiscussion(id: string): void {
  const s = sessions.get(id);
  if (!s || s.pausePromise) return;
  const { promise, resolve } = createPendingPromise();
  s.pausePromise = promise;
  s.pauseResolve = resolve;
}

export function resumeDiscussion(id: string): void {
  const s = sessions.get(id);
  if (s?.pauseResolve) {
    s.pauseResolve();
    s.pausePromise = undefined;
    s.pauseResolve = undefined;
  }
}

export function stopDiscussion(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.controller.abort();
  if (s.hostInputResolver) {
    s.hostInputResolver('');
    s.hostInputResolver = undefined;
  }
  if (s.pauseResolve) {
    s.pauseResolve();
    s.pausePromise = undefined;
    s.pauseResolve = undefined;
  }
  sessions.delete(id);
}
