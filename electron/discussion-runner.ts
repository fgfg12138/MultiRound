// ===== AI 圆桌模拟器 — Discussion Runner (Main Process) =====
// 多圆桌并发运行，每个 RoundTable.id 独立管理
// V3: 隐藏身份、私密 Prompt 通道、裁判主持人私密视角、每轮角色记忆更新 JSON

import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Store from 'electron-store';
import { callProviderLLM, callProviderLLMStream, decryptProvider, ProviderConfig, StoredProviderConfig } from './providers.js';
import { getDataDir, ensureDir, atomicWriteJson, loadIndex, loadMessagesSync, saveWhispers, loadWhispers } from './data-store.js';
import type { Character, Host, RuleSet, Goal, Scenario, RoundTable, Message, CharacterSecret, CharacterMemory, MemoryUpdatePayload, CharacterOutput, HostMode, HostSecretAccess, SpeakOrder, GoalType, MsgType, SecretRole } from './types.js';
import type { WhisperMessage } from './types.js';
import { TokenBudgetManager, TokenEstimator, PromptType, TruncationConfig } from './token-manager.js';
import { TokenTracker } from './token-tracker.js';
import { StreamingJsonParser } from './streaming-json-parser.js';
import {
  buildSysPrompt, buildHostOpen, buildCharSpeech, buildHostSum, buildHostFinal, buildResultPrompt,
  buildCombinedPrompt, buildPublicGameContext, buildPrivateGameContext, buildMemoryContext,
  buildCharPersona, buildRecentMsgs, buildHostModeHint, buildHostAssignPrompt,
  parseHostAssignedOrder, parseCharacterOutput, mergeMemoryUpdate,
  defaultSecret, defaultMemory, normalizeCharacter, normalizeRoundTable,
} from './prompts.js';

// ====================================================================
//  内联 prompt builder（与 src/lib/prompts.ts 逻辑同步）
// ====================================================================


// ====================================================================
//  运行时
// ====================================================================

const store = new Store({ name: 'multiround-discussion', projectName: 'multiround' } as any);
const PROVIDER_PREFIX = 'provider:';
type SessionState = {
  controller: AbortController;
  /** pauseResolver: 设了值则说明讨论线程在等待暂停恢复 */
  pauseResolver?: () => void;
  pausePromise?: Promise<void>;
  pauseResolve?: () => void;
  hostInputResolver?: (content: string) => void;
};
const sessions = new Map<string, SessionState>();

export function injectUserHostInput(roundTableId: string, content: string): boolean {
  const s = sessions.get(roundTableId);
  if (s?.hostInputResolver) { s.hostInputResolver(content); s.hostInputResolver = undefined; return true; }
  return false;
}

export function pauseDiscussion(id: string): void {
  const s = sessions.get(id);
  if (!s || s.pausePromise) return; // already paused

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

/** Create a pending Promise and return it with its resolve function */
function createPendingPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

function genId(): string { return crypto.randomUUID(); }

function buildMsg(
  rtId: string, rnd: number, charId: string | 'host', charName: string,
  type: MsgType, content: string, opts?: { error?: string; provId?: string }
): Message {
  return { id: genId(), roundTableId: rtId, round: rnd, characterId: charId,
    characterName: charName, type, content, error: opts?.error,
    providerId: opts?.provId, timestamp: Date.now() };
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

async function callLlm(sys: string, user: string, sig?: AbortSignal, provId?: string, temp?: number, onChunk?: (chunk: string) => void): Promise<{ content?: string; error?: string }> {
  if (sig?.aborted) return { error: '生成已中止' };
  try {
    const p = resolveProvider(provId);
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

function send(ch: string, ...args: unknown[]): void {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0 && !wins[0].isDestroyed()) wins[0].webContents.send(ch, ...args);
}

/** startRound — 起始轮次（用于"续"场景，默认 1） */
export async function startDiscussion(rt: RoundTable, startRound = 1): Promise<void> {
  normalizeRoundTable(rt);
  const ctrl = new AbortController();
  sessions.set(rt.id, { controller: ctrl });
  const sig = ctrl.signal;
  const all: Message[] = [];
  const sys = buildSysPrompt();
  const invisible = rt.host?.mode === 'invisible';

  rt.status = 'discussing';
  // Immediately save status so Home in-progress panel can see it
  { const d = getDataDir(); ensureDir(d); const idx = loadIndex(d); const fn = idx[rt.id]; if (fn) atomicWriteJson(path.join(d, `${fn}.json`), rt); }

  const tryCall = async (nm: string, s: string, u: string, provId?: string, temp?: number): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig, provId, temp);
    if (r.content || r.error === '生成已中止') return r;
    return { content: '', error: r.error || '生成失败' };
  };

  const tokenTracker = new TokenTracker();

  try {
    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostOpen(rt), rt.host.providerId, rt.host.temperature);
      const m = buildMsg(rt.id, 1, 'host', rt.host.name, 'opening', r.content || `（主持人开场失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    // User host mode: wait for opening statement before starting rounds
    if (rt.host?.mode === 'user') {
      send('discuss:awaiting-host-input', { roundTableId: rt.id, round: 0, phase: 'opening' });
      const userOpening = await new Promise<string>((resolve) => {
        const s = sessions.get(rt.id);
        if (s) s.hostInputResolver = resolve;
      });
      if (sig?.aborted) throw new Error('生成已中止');
      const openingMsg = buildMsg(rt.id, 0, 'host', rt.host.name, 'opening', userOpening);
      all.push(openingMsg); send('discuss:message', openingMsg);
    }

    const cap = rt.totalRounds === 0 ? 999 : rt.totalRounds;
    let round = startRound;
    while (round <= cap) {
      if (sig?.aborted) throw new Error('生成已中止');

      // —— 确定本轮发言顺序 ——
      const aliveChars = rt.characters.filter((c) => c.secret?.isAlive !== false);
      let speechOrder: Character[];

      const speakOrder = rt.rules?.speakOrder ?? 'sequential';

      if (speakOrder === 'free') {
        // Free: shuffle the order each round
        speechOrder = [...aliveChars].sort(() => Math.random() - 0.5);
      } else if (speakOrder === 'host-assigned') {
        // Host-assigned: ask host to decide who speaks
        const hostAssignPrompt = buildHostAssignPrompt(rt, round, aliveChars);
        const hostAssignResult = await tryCall(rt.host.name, sys, hostAssignPrompt, rt.host.providerId, rt.host.temperature);
        speechOrder = parseHostAssignedOrder(hostAssignResult.content || '', aliveChars);
      } else {
        // Sequential (default): use original order
        speechOrder = aliveChars;
      }

      for (const ch of speechOrder) {
        if (sig?.aborted) throw new Error('生成已中止');
        if (ch.secret?.isAlive === false) continue;
        // Pause check: wait while paused
        while (sessions.get(rt.id)?.pausePromise) {
          send('discuss:paused', { roundTableId: rt.id, round });
          const s = sessions.get(rt.id);
          if (s?.controller.signal.aborted) break;
          await s?.pausePromise;
          if (sig?.aborted) throw new Error('生成已中止');
        }
        send('discuss:character-start', ch.name);
        // 使用流式生成，通过 IPC 逐 token 推送（JSON 字符流）
        let streamedContent = '';
        const onChunk = (chunk: string) => {
          streamedContent += chunk;
          send('discuss:stream-chunk', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, chunk });
        };
        const combinedPrompt = buildCombinedPrompt(rt, ch, round, all);
        const r = await callLlm(sys, combinedPrompt, sig, ch.providerId, ch.temperature, onChunk);
        // 流式完成时推送一条完整消息
        const rawContent = r.content || streamedContent || (r.error ? `（${ch.name} 生成失败: ${r.error}）` : `（${ch.name} 未能生成发言）`);

        // 解析合并输出：提取 speech + memoryUpdate
        const parsed = parseCharacterOutput(rawContent);
        const speechContent = parsed ? parsed.speech : rawContent;

        send('discuss:stream-end', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, content: speechContent, error: r.error });
        const m = buildMsg(rt.id, round, ch.id, ch.name, 'speech', speechContent, { error: r.error, provId: ch.providerId });
        all.push(m); send('discuss:message', m);

        // 合并记忆更新（来自同一 LLM 调用）
        if (!r.error && parsed?.payload) {
          mergeMemoryUpdate(ch, parsed.payload);
        }

        // 记录 token 用量
        if (r.content || streamedContent) {
          const outputText = r.content || streamedContent;
          tokenTracker.record({
            characterId: ch.id,
            round,
            promptType: 'CHAR_SPEECH_COMBINED',
            inputText: combinedPrompt,
            outputText,
          });
          send('discuss:token-update', {
            roundTableId: rt.id,
            records: tokenTracker.getAllRecords(),
          });
        }
      }
      if (round < cap) {
        if (sig?.aborted) throw new Error('生成已中止');
        if (rt.host?.mode === 'user') {
          // User host mode: wait for user input
          send('discuss:awaiting-host-input', { roundTableId: rt.id, round });
          const userInput = await new Promise<string>((resolve) => {
            const s = sessions.get(rt.id);
            if (s) s.hostInputResolver = resolve;
          });
          if (sig?.aborted) throw new Error('生成已中止');
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', userInput);
          all.push(m); send('discuss:message', m);
        } else if (!invisible) {
          // AI visible host
          send('discuss:character-start', rt.host.name);
          const r = await tryCall(rt.host.name, sys, buildHostSum(rt, round, all), rt.host.providerId, rt.host.temperature);
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', r.content || `（小结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
          all.push(m); send('discuss:message', m);
        }
        // invisible: no summary generated
      }
      round++;
    }

    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostFinal(rt, all), rt.host.providerId, rt.host.temperature);
      const m = buildMsg(rt.id, round - 1, 'host', rt.host.name, 'final_summary', r.content || `（总结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    if (sig?.aborted) throw new Error('生成已中止');
    send('discuss:character-start', `${rt.host.name}（总结）`);
    const rp = await tryCall(rt.host.name, sys, buildResultPrompt(rt, all), rt.host.providerId, rt.host.temperature);
    const rm = buildMsg(rt.id, round - 1, 'host', rt.host.name, 'result', rp.content || '', { error: rp.error });
    all.push(rm); send('discuss:message', rm);

    sessions.delete(rt.id);
    saveDiscussion(rt, all, 'completed');
    send('discuss:complete', { roundTableId: rt.id, messages: all });

  } catch (e: any) {
    sessions.delete(rt.id);
    try { saveDiscussion(rt, all, e.message === '生成已中止' ? 'stopped' : 'error'); } catch { /* save best-effort */ }
    if (e.message === '生成已中止') {
      send('discuss:complete', { roundTableId: rt.id, messages: all });
    } else {
      send('discuss:error', { roundTableId: rt.id, error: e.message });
    }
  }
}

/**
 * appendRound — Add one more round to an already-completed discussion.
 * Loads the saved messages, determines the next round number,
 * and runs one additional round of character speeches (no host opening/final).
 */
export async function appendRound(rt: RoundTable): Promise<void> {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[rt.id];
  if (!filename) return;
  const saved = loadMessagesSync(dataDir, filename);
  if (!saved || saved.length === 0) return;

  const ctrl = new AbortController();
  sessions.set(rt.id, { controller: ctrl });
  const sig = ctrl.signal;
  const all: Message[] = JSON.parse(JSON.stringify(saved));
  const sys = buildSysPrompt();
  const invisible = rt.host?.mode === 'invisible';

  rt.status = 'discussing';
  { const d = getDataDir(); ensureDir(d); const idx = loadIndex(d); const fn = idx[rt.id]; if (fn) atomicWriteJson(path.join(d, `${fn}.json`), rt); }

  const tryCall = async (nm: string, s: string, u: string, provId?: string, temp?: number): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig, provId, temp);
    if (r.content || r.error === '生成已中止') return r;
    return { content: '', error: r.error || '生成失败' };
  };

  const tokenTracker = new TokenTracker();

  const lastRound = all.length > 0 ? all[all.length - 1].round : 0;
  const nextRound = lastRound + 1;

  try {
    if (sig?.aborted) throw new Error('生成已中止');
    const aliveChars = rt.characters.filter((c) => c.secret?.isAlive !== false);
    let speechOrder: Character[];
    const speakOrder = rt.rules?.speakOrder ?? 'sequential';

    if (speakOrder === 'free') {
      speechOrder = [...aliveChars].sort(() => Math.random() - 0.5);
    } else if (speakOrder === 'host-assigned') {
      const hostAssignPrompt = buildHostAssignPrompt(rt, nextRound, aliveChars);
      const hostAssignResult = await tryCall(rt.host.name, sys, hostAssignPrompt, rt.host.providerId, rt.host.temperature);
      speechOrder = parseHostAssignedOrder(hostAssignResult.content || '', aliveChars);
    } else {
      speechOrder = aliveChars;
    }

    for (const ch of speechOrder) {
      if (sig?.aborted) throw new Error('生成已中止');
      if (ch.secret?.isAlive === false) continue;
      while (sessions.get(rt.id)?.pausePromise) {
        send('discuss:paused', { roundTableId: rt.id, round: nextRound });
        const s = sessions.get(rt.id);
        if (s?.controller.signal.aborted) break;
        await s?.pausePromise;
        if (sig?.aborted) throw new Error('生成已中止');
      }
      send('discuss:character-start', ch.name);
      let streamedContent = '';
      const onChunk = (chunk: string) => {
        streamedContent += chunk;
        send('discuss:stream-chunk', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, chunk });
      };
      const combinedPrompt = buildCombinedPrompt(rt, ch, nextRound, all);
      const r = await callLlm(sys, combinedPrompt, sig, ch.providerId, ch.temperature, onChunk);
      const rawContent = r.content || streamedContent || (r.error ? `（${ch.name} 生成失败: ${r.error}）` : `（${ch.name} 未能生成发言）`);

      // 解析合并输出：提取 speech + memoryUpdate
      const parsed = parseCharacterOutput(rawContent);
      const speechContent = parsed ? parsed.speech : rawContent;

      send('discuss:stream-end', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, content: speechContent, error: r.error });
      const m = buildMsg(rt.id, nextRound, ch.id, ch.name, 'speech', speechContent, { error: r.error, provId: ch.providerId });
      all.push(m); send('discuss:message', m);

      // 合并记忆更新
      if (!r.error && parsed?.payload) {
        mergeMemoryUpdate(ch, parsed.payload);
      }

      // 记录 token 用量
      if (r.content || streamedContent) {
        const outputText = r.content || streamedContent;
        tokenTracker.record({
          characterId: ch.id,
          round: nextRound,
          promptType: 'CHAR_SPEECH_COMBINED',
          inputText: combinedPrompt,
          outputText,
        });
        send('discuss:token-update', {
          roundTableId: rt.id,
          records: tokenTracker.getAllRecords(),
        });
      }
    }

    if (sig?.aborted) throw new Error('生成已中止');
    // Host summary for this round
    if (rt.host?.mode === 'user') {
      send('discuss:awaiting-host-input', { roundTableId: rt.id, round: nextRound, phase: 'followup' });
      const userInput = await new Promise<string>((resolve) => {
        const s = sessions.get(rt.id);
        if (s) s.hostInputResolver = resolve;
      });
      if (sig?.aborted) throw new Error('生成已中止');
      const m = buildMsg(rt.id, nextRound, 'host', rt.host.name, 'followup', userInput);
      all.push(m); send('discuss:message', m);
    } else if (!invisible) {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostSum(rt, nextRound, all), rt.host.providerId, rt.host.temperature);
      const m = buildMsg(rt.id, nextRound, 'host', rt.host.name, 'followup', r.content || `（小结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    sessions.delete(rt.id);
    saveDiscussion(rt, all, 'completed');
    send('discuss:complete', { roundTableId: rt.id, messages: all });

  } catch (e: any) {
    sessions.delete(rt.id);
    try { saveDiscussion(rt, all, e.message === '生成已中止' ? 'stopped' : 'error'); } catch { /* */ }
    if (e.message === '生成已中止') {
      send('discuss:complete', { roundTableId: rt.id, messages: all });
    } else {
      send('discuss:error', { roundTableId: rt.id, error: e.message });
    }
  }
}

function saveDiscussion(rt: RoundTable, all: Message[], status: 'completed' | 'stopped' | 'error' = 'completed'): void {
  const dataDir = getDataDir();
  ensureDir(dataDir);
  const index = loadIndex(dataDir);
  const filename = index[rt.id];
  if (!filename) return;
  rt.status = status;
  atomicWriteJson(path.join(dataDir, `${filename}.json`), rt);
  atomicWriteJson(path.join(dataDir, `${filename}_messages.json`), all);
  // Whisper: ensure whispers are saved alongside discussion
  try {
    const whispers = loadWhispers(dataDir, filename);
    saveWhispers(dataDir, filename, whispers);
  } catch { /* best-effort */ }
}

/**
 * 处理 1:1 私信 AI 回复
 * 1. 构建角色私信回复 Prompt
 * 2. 调用 LLM 生成回复
 * 3. 保存角色回复到 _whispers.json
 * 4. 通过 IPC 推送 whisper:reply 到渲染进程
 */
export async function handleWhisperReply(
  roundTableId: string,
  recipientId: string,
  whisperContent: string,
  originalMessageId: string
): Promise<WhisperMessage | null> {
  try {
    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const filename = index[roundTableId];
    if (!filename) return null;

    const rtPath = path.join(dataDir, `${filename}.json`);
    if (!fs.existsSync(rtPath)) return null;
    const roundTable: RoundTable = JSON.parse(fs.readFileSync(rtPath, 'utf-8'));

    const character = roundTable.characters.find((c) => c.id === recipientId);
    if (!character) return null;

    // WAIL-Guard 防御检查
    const whisperData = loadWhispers(dataDir, filename);
    const original = whisperData.whispers.find((w) => w.id === originalMessageId);
    if (!original) {
      console.log('[WAIL-Guard] whisper reply blocked: original message not found', originalMessageId);
      return null;
    }
    if (original.senderId !== 'host') {
      console.log('[WAIL-Guard] whisper reply blocked: sender is not host', original.senderId);
      return null;
    }
    if (original.status !== 'unread') {
      console.log('[WAIL-Guard] whisper reply blocked: original message already consumed (status=', original.status, ')');
      return null;
    }
    if (original.autoReplyTriggered === true) {
      console.log('[WAIL-Guard] whisper reply blocked: autoReplyTriggered already true', originalMessageId);
      return null;
    }

    // 确认可触发：先置位，再调用 LLM，避免重复触发
    original.autoReplyTriggered = true;
    saveWhispers(dataDir, filename, whisperData);

    // 独立的 AbortController，允许单独取消私信回复
    const controller = new AbortController();
    const sig = controller.signal;

    // 构建角色私信回复 Prompt（与 src/lib/prompts.ts buildWhisperReplyPrompt 逻辑对齐）
    const sys = buildSysPrompt();
    const persona = buildCharPersona(character);
    const prompt = `你现在扮演：\n\n${persona}\n\n你正在与主持人进行私下对话。主持人刚刚对你说：\n\n主持人：${whisperContent}\n\n请以角色的身份和性格，自然地回复主持人的私信。\n注意：\n1. 回复要符合你的人设\n2. 语气自然，像私下交流\n3. 不要提及这是私信或"私下告诉你"\n4. 直接对主持人说话，使用"您"或合适称谓\n5. 回复字数控制在 50-200 字\n\n你可以直接回复主持人，也可以简单表示已读、点头、或暂时没有更多要说的。\n如果这条私信不需要立即行动，保持简短即可，不必刻意展开对话。`;
    const result = await callLlm(sys, prompt, sig, character.providerId, character.temperature);
    if (!result.content) {
      controller.abort();
      return null;
    }

    // 保存角色回复到 _whispers.json
    const replyMessage: WhisperMessage = {
      id: genId(),
      roundTableId,
      senderId: character.id,
      recipientId: 'host',
      type: '1:1',
      content: result.content,
      timestamp: Date.now(),
      status: 'unread',
      replyToId: originalMessageId,
      // 角色回复本身不是触发源，不设置 autoReplyTriggered
    };
    whisperData.whispers.push(replyMessage);

    saveWhispers(dataDir, filename, whisperData);

    // 通过 IPC 推送 whisper:reply 到渲染进程
    send('whisper:reply', {
      roundTableId,
      originalMessageId,
      reply: replyMessage,
    });

    controller.abort(); // 清理 signal
    return replyMessage;
  } catch (error: any) {
    console.error('handleWhisperReply error:', error);
    return null;
  }
}

export function stopDiscussion(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.controller.abort();
  // Wake up host input wait
  if (s.hostInputResolver) {
    s.hostInputResolver('');
    s.hostInputResolver = undefined;
  }
  // Wake up pause wait
  if (s.pauseResolve) {
    s.pauseResolve();
    s.pausePromise = undefined;
    s.pauseResolve = undefined;
  }
  sessions.delete(id);
}
