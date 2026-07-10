// ===== AI 圆桌模拟器 — Discussion Runner (Main Process) =====
// 多圆桌并发运行，每个 RoundTable.id 独立管理
// V3: 隐藏身份、私密 Prompt 通道、裁判主持人私密视角、每轮角色记忆更新 JSON

import path from 'node:path';
import fs from 'node:fs';
import { callProviderLLMStream } from './providers.js';
import { getDataDir, ensureDir, atomicWriteJson, loadIndex, loadMessagesSync, saveWhispers, loadWhispers } from './data-store.js';
import type { RoundTable, Message, Character } from './types.js';
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
import { sessions, send, buildMsg, callLlm, genId, resolveProvider } from './runner-state.js';

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
  { const d = getDataDir(); ensureDir(d); const idx = loadIndex(d); const fn = idx[rt.id]; if (fn) atomicWriteJson(path.join(d, `${fn}.json`), rt); }

  const tryCall = async (nm: string, s: string, u: string, provId?: string, temp?: number, modelOverride?: string, charId?: string): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig, provId, temp, undefined, modelOverride, charId);
    if (r.content || r.error === '生成已中止') return r;
    return { content: '', error: r.error || '生成失败' };
  };

  const tokenTracker = new TokenTracker();

  try {
    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostOpen(rt), rt.host.providerId, rt.host.temperature, rt.host.model, 'host');
      const m = buildMsg(rt.id, 1, 'host', rt.host.name, 'opening', r.content || `（主持人开场失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

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

      const aliveChars = rt.characters.filter((c) => c.secret?.isAlive !== false);
      let speechOrder: Character[];
      const speakOrder = rt.rules?.speakOrder ?? 'sequential';

      if (speakOrder === 'free') {
        speechOrder = [...aliveChars].sort(() => Math.random() - 0.5);
      } else if (speakOrder === 'host-assigned') {
        const hostAssignPrompt = buildHostAssignPrompt(rt, round, aliveChars);
        const hostAssignResult = await tryCall(rt.host.name, sys, hostAssignPrompt, rt.host.providerId, rt.host.temperature, rt.host.model, 'host');
        speechOrder = parseHostAssignedOrder(hostAssignResult.content || '', aliveChars);
      } else {
        speechOrder = aliveChars;
      }

      for (const ch of speechOrder) {
        if (sig?.aborted) throw new Error('生成已中止');
        if (ch.secret?.isAlive === false) continue;
        while (sessions.get(rt.id)?.pausePromise) {
          send('discuss:paused', { roundTableId: rt.id, round });
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
        const combinedPrompt = buildCombinedPrompt(rt, ch, round, all);
        const r = await callLlm(sys, combinedPrompt, sig, ch.providerId, ch.temperature, onChunk, ch.model, ch.id);
        const rawContent = r.content || streamedContent || (r.error ? `（${ch.name} 生成失败: ${r.error}）` : `（${ch.name} 未能生成发言）`);
        const parsed = parseCharacterOutput(rawContent);
        const speechContent = parsed ? parsed.speech : rawContent;
        send('discuss:stream-end', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, content: speechContent, error: r.error });
        const m = buildMsg(rt.id, round, ch.id, ch.name, 'speech', speechContent, { error: r.error, provId: ch.providerId });
        all.push(m); send('discuss:message', m);
        if (!r.error && parsed?.payload) mergeMemoryUpdate(ch, parsed.payload);
        if (r.content || streamedContent) {
          const outputText = r.content || streamedContent;
          tokenTracker.record({ characterId: ch.id, round, promptType: 'CHAR_SPEECH_COMBINED', inputText: combinedPrompt, outputText });
          send('discuss:token-update', { roundTableId: rt.id, records: tokenTracker.getAllRecords() });
        }
      }
      if (round < cap) {
        if (sig?.aborted) throw new Error('生成已中止');
        if (rt.host?.mode === 'user') {
          send('discuss:awaiting-host-input', { roundTableId: rt.id, round });
          const userInput = await new Promise<string>((resolve) => {
            const s = sessions.get(rt.id);
            if (s) s.hostInputResolver = resolve;
          });
          if (sig?.aborted) throw new Error('生成已中止');
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', userInput);
          all.push(m); send('discuss:message', m);
        } else if (!invisible) {
          send('discuss:character-start', rt.host.name);
          const r = await tryCall(rt.host.name, sys, buildHostSum(rt, round, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host');
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', r.content || `（小结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
          all.push(m); send('discuss:message', m);
        }
      }
      round++;
    }

    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostFinal(rt, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host');
      const m = buildMsg(rt.id, round - 1, 'host', rt.host.name, 'final_summary', r.content || `（总结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    if (sig?.aborted) throw new Error('生成已中止');
    send('discuss:character-start', `${rt.host.name}（总结）`);
    const rp = await tryCall(rt.host.name, sys, buildResultPrompt(rt, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host');
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

  const tryCall = async (nm: string, s: string, u: string, provId?: string, temp?: number, modelOverride?: string, charId?: string): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig, provId, temp, undefined, modelOverride, charId);
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
      const hostAssignResult = await tryCall(rt.host.name, sys, hostAssignPrompt, rt.host.providerId, rt.host.temperature, rt.host.model, 'host');
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
      const onChunk = (chunk: string) => { streamedContent += chunk; send('discuss:stream-chunk', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, chunk }); };
      const combinedPrompt = buildCombinedPrompt(rt, ch, nextRound, all);
      const r = await callLlm(sys, combinedPrompt, sig, ch.providerId, ch.temperature, onChunk, ch.model, ch.id);
      const rawContent = r.content || streamedContent || (r.error ? `（${ch.name} 生成失败: ${r.error}）` : `（${ch.name} 未能生成发言）`);
      const parsed = parseCharacterOutput(rawContent);
      const speechContent = parsed ? parsed.speech : rawContent;
      send('discuss:stream-end', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, content: speechContent, error: r.error });
      const m = buildMsg(rt.id, nextRound, ch.id, ch.name, 'speech', speechContent, { error: r.error, provId: ch.providerId });
      all.push(m); send('discuss:message', m);
      if (!r.error && parsed?.payload) mergeMemoryUpdate(ch, parsed.payload);
      if (r.content || streamedContent) {
      const outputText = r.content || streamedContent;
        tokenTracker.record({ characterId: ch.id, round: nextRound, promptType: 'CHAR_SPEECH_COMBINED', inputText: combinedPrompt, outputText });
        send('discuss:token-update', { roundTableId: rt.id, records: tokenTracker.getAllRecords() });
      }
    }

    if (sig?.aborted) throw new Error('生成已中止');
    if (rt.host?.mode === 'user') {
      send('discuss:awaiting-host-input', { roundTableId: rt.id, round: nextRound, phase: 'followup' });
      const userInput = await new Promise<string>((resolve) => { const s = sessions.get(rt.id); if (s) s.hostInputResolver = resolve; });
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
  try { const w = loadWhispers(dataDir, filename); saveWhispers(dataDir, filename, w); } catch { /* best-effort */ }
}
