// ===== AI 圆桌模拟器 — Discussion Runner (Main Process) =====
// 多圆桌并发运行，每个 RoundTable.id 独立管理
// V3: 隐藏身份、私密 Prompt 通道、裁判主持人私密视角、每轮角色记忆更新 JSON

import path from 'node:path';
import fs from 'node:fs';
import { callProviderLLMStream } from './providers.js';
import { getDataDir, ensureDir, atomicWriteJson, loadIndex, loadMessagesSync, saveWhispers, loadWhispers } from './data-store.js';
import type { RoundTable, Message, Character, WhisperMessage } from './types.js';
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

// ===== 狼人杀夜间阶段 =====
async function pushNightWhisper(rt: RoundTable, recipientId: string, content: string, isReply: boolean = false): Promise<void> {
  const d = getDataDir(); const idx = loadIndex(d); const fn = idx[rt.id]; if (!fn) return;
  const wd = loadWhispers(d, fn);
  const w: WhisperMessage = {
    id: genId(), roundTableId: rt.id,
    senderId: isReply ? recipientId : 'host',
    recipientId: isReply ? 'host' : recipientId,
    content, type: 'night-action',
    status: 'read', timestamp: Date.now(),
  };
  wd.whispers.push(w); saveWhispers(d, fn, wd);
  send('whisper:reply', { roundTableId: rt.id, originalMessageId: w.id, reply: w });
}

async function runNightPhase(rt: RoundTable, round: number, all: Message[], sig: AbortSignal): Promise<void> {
  const mods = rt.modules || {} as any;
  if (!mods.nightAction) return;
  const sys = buildSysPrompt();
  const budget = (rt.rules?.maxSpeechLength || 300) * 6 + 2000;
  for (const ch of rt.characters) if (ch.secret) ch.secret.nightActionDone = false;
  const actions: any = { wolfTarget: undefined, seerCheck: undefined, witchHeal: undefined, witchPoison: undefined, guardTarget: undefined, hunterShot: undefined, deaths: [] };
  const guard = rt.characters.find((c: any) => c.secret?.secretRole === 'guard' && c.secret?.isAlive !== false);
  send('discuss:message', buildMsg(rt.id, round, 'host', rt.host.name, 'summary', '🌙 第' + round + '夜降临…请大家闭眼。上帝依次询问各角色行动。'));
const wolves = rt.characters.filter((c: any) => c.secret?.secretRole === 'werewolf' && c.secret?.isAlive !== false);
  if (wolves.length > 0) {
    send('discuss:phase-change', { roundTableId: rt.id, phase: 'night', label: '狼人行动' });
    const targets = rt.characters.filter((c: any) => c.secret?.secretRole !== 'werewolf' && c.secret?.isAlive !== false).map((c: any) => c.name + '(' + c.id + ')').join('、');
    const prompt = '【信息边界】现在是第' + round + '夜，发生在白天发言之前。不能引用白天信息。\n你们是狼人阵营，你们知道彼此身份：' + wolves.map((w: any) => w.name).join('、') + '。\n你们不知道神职身份。请选择今晚杀害的目标。\n可选：' + targets + '\n输出 JSON：{"wolfTarget": "角色ID"}';
    const r = await callLlm(sys, prompt, sig, wolves[0].providerId, wolves[0].temperature, undefined, wolves[0].model, wolves[0].id, budget);
    if (r.content) { try { const j = JSON.parse(r.content); if (j.wolfTarget) { actions.wolfTarget = j.wolfTarget; var wn = rt.characters.find((cx: any) => cx.id === j.wolfTarget)?.name || j.wolfTarget; await pushNightWhisper(rt, wolves[0].id, '🐺 狼人决定今夜杀害 ' + wn, true); } else { await pushNightWhisper(rt, wolves[0].id, '🐺 狼人今夜未行动（未输出目标）。', true); } } catch { await pushNightWhisper(rt, wolves[0].id, '🐺 狼人行动解析失败，默认未行动。', true); } }
    for (const w of wolves) if (w.secret) w.secret.nightActionDone = true;
      send('discuss:message', buildMsg(rt.id, round, 'host', rt.host.name, 'summary', '🐺 狼人已商定今夜目标（保密）。'));
  }
  
const witch = rt.characters.find((c: any) => c.secret?.secretRole === 'witch' && c.secret?.isAlive !== false);
  if (witch && (rt.witchPotions?.heal || rt.witchPotions?.poison)) {
    send('discuss:phase-change', { roundTableId: rt.id, phase: 'night', label: '女巫行动' });
    const wolfTargetChar = actions.wolfTarget ? rt.characters.find((c: any) => c.id === actions.wolfTarget) : undefined;
    const prompt = '【信息边界】现在是第' + round + '夜。\n' + (wolfTargetChar ? '你闻到了' + wolfTargetChar.name + '被袭的气味。' : '一切平静。') + '\n你还有' + (rt.witchPotions?.heal ? '解药' : '') + (rt.witchPotions?.heal && rt.witchPotions?.poison ? '和' : '') + (rt.witchPotions?.poison ? '毒药' : '') + '。\n' + (wolfTargetChar ? '是否用解药救' + wolfTargetChar.name + '？' : '') + '\n注意：你不知道守卫守了谁，也不知道预言家验了谁。\n输出 JSON：{"witchHeal": true/false, "witchPoison": ""}';
    const r = await callLlm(sys, prompt, sig, witch.providerId, witch.temperature, undefined, witch.model, witch.id, budget);
    if (r.content) try { const j = JSON.parse(r.content); var wa = ''; if (typeof j.witchHeal === 'boolean') { actions.witchHeal = j.witchHeal; if (j.witchHeal && rt.witchPotions) { rt.witchPotions.heal = false; wa = '救了' + (wolfTargetChar?.name || '被刀者'); } } if (j.witchPoison) { actions.witchPoison = j.witchPoison; if (rt.witchPotions) rt.witchPotions.poison = false; wa += (wa ? '，' : '') + '毒了' + (rt.characters.find((cx: any) => cx.id === j.witchPoison)?.name || j.witchPoison); } await pushNightWhisper(rt, witch.id, wa || '⏭ 女巫按兵不动', true); } catch { await pushNightWhisper(rt, witch.id, '⏭ 女巫未响应', true); }
    if (witch.secret) witch.secret.nightActionDone = true;
      send('discuss:message', buildMsg(rt.id, round, 'host', rt.host.name, 'summary', '🧪 女巫已做出决定（保密）。'));
  }
  
const seer = rt.characters.find((c: any) => c.secret?.secretRole === 'seer' && c.secret?.isAlive !== false);
  if (seer) {
    send('discuss:phase-change', { roundTableId: rt.id, phase: 'night', label: '预言家查验' });
    const targets = rt.characters.filter((c: any) => c.id !== seer.id && c.secret?.isAlive !== false).map((c: any) => c.name + '(' + c.id + ')').join('、');
    const prompt = '【信息边界】现在是第' + round + '夜，发生在白天发言之前。你不能引用任何白天才发生的发言或事件。文本狼人杀没有肢体语言。' + '\n' + '你是预言家。请选择今晚查验的目标。' + (round === 1 ? '首夜没有信息，请随机选择或按位置习惯验。' : '根据之前验人结果推理，不要编造未验证的信息。') + '\n可选：' + targets + '\n输出 JSON：{"seerCheck": "角色ID"}';
    const r = await callLlm(sys, prompt, sig, seer.providerId, seer.temperature, undefined, seer.model, seer.id, budget);
    if (r.content) { try { const j = JSON.parse(r.content); if (j.seerCheck) { const target = rt.characters.find((c: any) => c.id === j.seerCheck); var sr = target?.secret?.secretRole === 'werewolf' ? '狼人' : '好人'; actions.seerCheck = { target: j.seerCheck, result: target?.secret?.secretRole === 'werewolf' ? 'wolf' : 'good' }; if (seer.secret && target) { if (!seer.secret.knownSecrets) seer.secret.knownSecrets = []; seer.secret.knownSecrets.push('第' + round + '夜验人：' + target.name + '(' + j.seerCheck + ') 是' + sr); } await pushNightWhisper(rt, seer.id, '🔮 查验结果：' + (target?.name || j.seerCheck) + ' 是 ' + sr, true); } else { await pushNightWhisper(rt, seer.id, '🔮 本夜查验未能完成（未输出目标）。', true); } } catch { await pushNightWhisper(rt, seer.id, '🔮 本夜查验未能完成（输出格式错误）。', true); } }
    if (seer.secret) seer.secret.nightActionDone = true;
      send('discuss:message', buildMsg(rt.id, round, 'host', rt.host.name, 'summary', '🔮 预言家已完成查验（结果保密）。'));
  }
  

const targetId = actions.wolfTarget;
  const guardId = actions.guardTarget;
  const poisonTarget = actions.witchPoison;
  if (targetId && targetId !== guardId) {
    const victim = rt.characters.find((c: any) => c.id === targetId);
    if (victim?.secret && victim.secret.isAlive !== false) {
      victim.secret.isAlive = false; victim.secret.diedAtRound = round; victim.secret.diedReason = 'wolf-kill';
      actions.deaths.push({ characterId: targetId, round: round, reason: 'wolf-kill' });
    }
  }
  if (poisonTarget && poisonTarget !== targetId) {
    const victim = rt.characters.find((c: any) => c.id === poisonTarget);
    if (victim?.secret && victim.secret.isAlive !== false) {
      victim.secret.isAlive = false; victim.secret.diedAtRound = round; victim.secret.diedReason = 'witch-poison';
      actions.deaths.push({ characterId: poisonTarget, round: round, reason: 'witch-poison' });
    }
  }
  rt.nightActions = actions;
  rt.deathLog = [...(rt.deathLog || []), ...actions.deaths];
  rt.lastGuardTarget = actions.guardTarget || rt.lastGuardTarget;
}


async function runRevealPhase(rt: RoundTable, round: number, all: Message[], sig: AbortSignal): Promise<void> {
  const actions = rt.nightActions; if (!actions || actions.deaths.length === 0) return;
  const sys = buildSysPrompt(); const budget = (rt.rules?.maxSpeechLength || 300) * 6 + 2000;
  const deathNames = actions.deaths.map((d: any) => rt.characters.find((c: any) => c.id === d.characterId)?.name || d.characterId).join('、');
  const announceText = '天亮了。昨夜：' + deathNames + ' 已死亡。请存活角色依次发言。';
  send('discuss:phase-change', { roundTableId: rt.id, phase: 'reveal', label: '天亮公布' });
  const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', announceText);
  all.push(m); send('discuss:message', m);
}

async function runVotePhase(rt: RoundTable, round: number, all: Message[], sig: AbortSignal): Promise<void> {
  if (!rt.modules?.vote) return;
  const sys = buildSysPrompt(); const budget = (rt.rules?.maxSpeechLength || 300) * 6 + 2000;
  const aliveChars = rt.characters.filter((c: any) => c.secret?.isAlive !== false);
  if (aliveChars.length < 2) return;
  send('discuss:phase-change', { roundTableId: rt.id, phase: 'vote', label: '投票放逐' });
  send('discuss:message', buildMsg(rt.id, round, 'host', rt.host.name, 'summary', '🗳 投票开始——存活玩家请投出一票放逐一人。'));
  const votes: Record<string, string> = {};
  const speechThisRound = all.filter((m: any) => m.round === round && m.type === 'speech' && !m.error);
  for (const voter of aliveChars) {
    const hasSpoken = speechThisRound.some((m: any) => m.characterId === voter.id);
    if (!hasSpoken) { continue; } // 未发言玩家默认弃票
    const candidates = aliveChars.filter((c: any) => c.id !== voter.id).map((c: any) => c.name + '(' + c.id + ')').join('、');
    const prompt = '你是' + voter.name + '。现在是投票放逐环节。\n【信息边界】只依据公开发言和票型投票，不用角色不应知的信息。\n请投票选择一个角色放逐，或选择弃票。可选：' + candidates + '\n输出 JSON：{"vote": "角色ID或null(弃票)", "reason": "理由"}';
    const r = await callLlm(sys, prompt, sig, voter.providerId, voter.temperature, undefined, voter.model, voter.id, budget);
    if (r.content) try { const j = JSON.parse(r.content); if (j.vote && j.vote !== 'null') votes[voter.id] = j.vote; } catch {}
  }
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) { tally[target] = (tally[target] || 0) + 1; }
  let maxV = 0; let ousted = ''; let tied = false;
  for (const [id, cnt] of Object.entries(tally)) { if (cnt > maxV) { maxV = cnt; ousted = id; tied = false; } else if (cnt === maxV) tied = true; }
  // Broadcast vote tally to message stream
  if (Object.keys(tally).length > 0) {
    const tallyLines = Object.entries(tally).map(([id, cnt]) => (rt.characters.find((c:any)=>c.id===id)?.name || id) + ' ' + cnt + '票').join('，');
    const voteDetail = Object.entries(votes).map(([voterId, targetId]) => (rt.characters.find((c:any)=>c.id===voterId)?.name || voterId) + '→' + (rt.characters.find((c:any)=>c.id===targetId)?.name || targetId)).join('，');
    const tallyMsg = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', '🗳 投票结果：' + tallyLines + (ousted ? '。' + (rt.characters.find((c:any)=>c.id===ousted)?.name || ousted) + ' 出局' : '') + '\n【票型】' + voteDetail);
    all.push(tallyMsg); send('discuss:message', tallyMsg);
  }
  if (tied) {
    const tiedIds = Object.keys(tally);
    const randomPick = tiedIds[Math.floor(Math.random() * tiedIds.length)];
    ousted = randomPick; tied = false;
    if (rt.host) {
      const names = tiedIds.map(id => rt.characters.find((c:any)=>c.id===id)?.name || id).join('、');
      const pickName = rt.characters.find((c:any)=>c.id===randomPick)?.name || randomPick;
      const am = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', '投票平局（' + names + '）。随机抽签决定 ' + pickName + ' 出局。');
      all.push(am); send('discuss:message', am);
    }
  }
  rt.voteResult = { votes, ousted, tied };
  if (ousted) {
    const eliminated = rt.characters.find((c: any) => c.id === ousted);
    if (eliminated?.secret && eliminated.secret.isAlive !== false) {
      eliminated.secret.isAlive = false; eliminated.secret.diedAtRound = round; eliminated.secret.diedReason = 'voted-out';
      rt.deathLog = [...(rt.deathLog || []), { characterId: ousted, round: round, reason: 'voted-out' }];
      const announce = eliminated.name + '（' + (eliminated.secret.revealed ? eliminated.secret.secretRole : '身份未揭') + '）出局。';
      if (rt.host) { const am = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', announce); all.push(am); send('discuss:message', am); }
    }
  }
}

function checkWinCondition(rt: RoundTable): { over: boolean; winner?: string } {
  const aliveChars = rt.characters.filter((c: any) => c.secret?.isAlive !== false);
  if (aliveChars.length === 0) return { over: true, winner: '平局' };
  const aliveWolves = aliveChars.filter((c: any) => c.secret?.secretRole === 'werewolf');
  const aliveGood = aliveChars.filter((c: any) => c.secret?.secretRole !== 'werewolf');
  if (aliveWolves.length === 0 || aliveWolves.length >= aliveGood.length) {
    // 游戏结束，全体翻牌
    for (const c of rt.characters) if (c.secret) c.secret.revealed = true;
    if (aliveWolves.length === 0) return { over: true, winner: '好人阵营' };
    return { over: true, winner: '狼人阵营' };
  }
  return { over: false };
}

async function runDaySpeech(rt: RoundTable, ch: Character, round: number, all: Message[], sig: AbortSignal, speechBudget: number, tokenTracker: any): Promise<void> {
  const sys = buildSysPrompt();
  if (sig?.aborted) throw new Error('生成已中止');
  if (ch.secret?.isAlive === false) return;
  send('discuss:character-start', ch.name);
  let streamedContent = '';
  const parser = new StreamingJsonParser();
  let lastSpeechLen = 0;
  let fallbackToRaw = false;
  const onChunk = (chunk: string) => {
    streamedContent += chunk;
    if (fallbackToRaw) { send('discuss:stream-chunk', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, chunk }); return; }
    const res = parser.feedChunk(chunk);
    const speech = res.speechBuffer;
    if (speech.length > lastSpeechLen) {
      const delta = speech.slice(lastSpeechLen); lastSpeechLen = speech.length;
      send('discuss:stream-chunk', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, chunk: delta });
    } else if (streamedContent.length > 10 && !streamedContent.trimStart().startsWith('{')) {
      fallbackToRaw = true; send('discuss:stream-chunk', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, chunk: streamedContent });
    }
  };
  const onReasoningChunk = (rc: string) => { send('discuss:stream-chunk', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, reasoningChunk: rc }); };
  const combinedPrompt = buildCombinedPrompt(rt, ch, round, all);
  const r = await callLlm(sys, combinedPrompt, sig, ch.providerId, ch.temperature, onChunk, ch.model, ch.id, speechBudget, onReasoningChunk);
  const rawContent = r.content || streamedContent || (r.error ? '（' + ch.name + ' 生成失败: ' + r.error + '）' : '（' + ch.name + ' 未能生成发言）');
  const parsed = parseCharacterOutput(rawContent);
  const speechContent = parsed ? parsed.speech : rawContent;
  // 关键角色无有效发言时重试一次（基于实际发言内容，非仅 r.error）
  const hasValidSpeech = speechContent && !speechContent.includes('未能生成发言') && !speechContent.includes('生成失败') && !speechContent.match(/^[。.！!？?]+$/) && speechContent.trim().length > 5;
  if (!hasValidSpeech && ch.secret?.secretRole && ['seer', 'guard', 'witch', 'hunter', 'werewolf'].includes(ch.secret.secretRole)) {
    const r2 = await callLlm(sys, combinedPrompt, sig, ch.providerId, ch.temperature, onChunk, ch.model, ch.id, speechBudget, onReasoningChunk);
    if (r2.content && !r2.error) {
      const raw2 = r2.content || '';
      const parsed2 = parseCharacterOutput(raw2);
      const speech2 = parsed2 ? parsed2.speech : raw2;
      if (speech2 && !speech2.includes('未能生成发言') && !speech2.includes('生成失败') && !speech2.match(/^[。.！!？?]+$/) && speech2.trim().length > 5) {
        const m2 = buildMsg(rt.id, round, ch.id, ch.name, 'speech', speech2, { provId: ch.providerId, reasoning: r2.reasoning });
        all.push(m2); send('discuss:message', m2);
        if (parsed2?.payload) mergeMemoryUpdate(ch, parsed2.payload);
        if (r2.content || streamedContent) { tokenTracker.record({ characterId: ch.id, round: round, promptType: 'CHAR_SPEECH_COMBINED', inputText: combinedPrompt, outputText: r2.content }); send('discuss:token-update', { roundTableId: rt.id, records: tokenTracker.getAllRecords() }); }
        return; // 重试成功，跳过原失败逻辑
      }
    }
  }
  send('discuss:stream-end', { roundTableId: rt.id, characterId: ch.id, characterName: ch.name, content: speechContent, error: r.error });
  const m = buildMsg(rt.id, round, ch.id, ch.name, 'speech', speechContent, { error: r.error, provId: ch.providerId, reasoning: r.reasoning });
  all.push(m); send('discuss:message', m);
  if (!r.error && parsed?.payload) mergeMemoryUpdate(ch, parsed.payload);
  if (r.content || streamedContent) {
    const outputText = r.content || streamedContent;
    tokenTracker.record({ characterId: ch.id, round: round, promptType: 'CHAR_SPEECH_COMBINED', inputText: combinedPrompt, outputText });
    send('discuss:token-update', { roundTableId: rt.id, records: tokenTracker.getAllRecords() });
  }
}

export async function startDiscussion(rt: RoundTable, startRound = 1): Promise<void> {
  normalizeRoundTable(rt);
  const speechBudget = (rt.rules?.maxSpeechLength || 300) * 6 + 2000;
  const ctrl = new AbortController();
  sessions.set(rt.id, { controller: ctrl });
  const sig = ctrl.signal;
  const all: Message[] = [];
  const sys = buildSysPrompt();
  const invisible = rt.host?.mode === 'invisible';

  rt.status = 'discussing';
  { const d = getDataDir(); ensureDir(d); const idx = loadIndex(d); const fn = idx[rt.id]; if (fn) atomicWriteJson(path.join(d, `${fn}.json`), rt); }

  const tryCall = async (nm: string, s: string, u: string, provId?: string, temp?: number, modelOverride?: string, charId?: string, budget?: number): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig, provId, temp, undefined, modelOverride, charId, budget);
    if (r.content || r.error === '生成已中止') return r;
    return { content: '', error: r.error || '生成失败' };
  };

  const tokenTracker = new TokenTracker();

  try {
    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostOpen(rt), rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
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
    const mods = rt.modules || { nightAction: false, vote: false, deathSilence: false, winCheck: false, phaseIndicator: false };
    const isGame = mods.nightAction || mods.vote;
    let round = startRound;
    while (round <= cap) {
      if (sig?.aborted) throw new Error('生成已中止');

      if (isGame) {
        if ((mods as any).nightAction) {
          send('discuss:phase-change', { roundTableId: rt.id, phase: 'night', label: '夜间' });
          await runNightPhase(rt, round, all, sig);
          await runRevealPhase(rt, round, all, sig);
        }
        if ((mods as any).winCheck) {
          const win = checkWinCondition(rt);
          if (win.over) {
            if (rt.host?.mode !== 'user' && !invisible) {
              const fs = await tryCall(rt.host.name, sys, buildHostFinal(rt, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
              all.push(buildMsg(rt.id, round, 'host', rt.host.name, 'final_summary', fs.content || '游戏结束', { error: fs.error }));
              send('discuss:message', all[all.length - 1]);
            }
            if (win.winner) { var rl = rt.characters.map((cx:any) => cx.name + '(' + (cx.secret?.secretRole || '未知') + ')').join('、'); all.push(buildMsg(rt.id, round, 'host', rt.host.name, 'result', '全体翻牌：' + rl + '。' + win.winner + '获胜！')); send('discuss:message', all[all.length - 1]); }
            break;
          }
        }
        send('discuss:phase-change', { roundTableId: rt.id, phase: 'day-speech', label: '白天讨论' });
      }

      const aliveChars = rt.characters.filter((c) => c.secret?.isAlive !== false);
      let speechOrder: Character[];
      const speakOrder = rt.rules?.speakOrder ?? 'sequential';
      if (speakOrder === 'free') { speechOrder = [...aliveChars].sort(() => Math.random() - 0.5); }
      else if (speakOrder === 'host-assigned') {
        const hostAssignPrompt = buildHostAssignPrompt(rt, round, aliveChars);
        const hostAssignResult = await tryCall(rt.host.name, sys, hostAssignPrompt, rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
        speechOrder = parseHostAssignedOrder(hostAssignResult.content || '', aliveChars);
      } else { speechOrder = aliveChars; }

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
        await runDaySpeech(rt, ch, round, all, sig, speechBudget, tokenTracker);
      }
      if (round < cap) {
        if (sig?.aborted) throw new Error('生成已中止');

        if ((mods as any).vote) {
          await runVotePhase(rt, round, all, sig);
          if ((mods as any).winCheck) {
            const win = checkWinCondition(rt);
            if (win.over && win.winner) { all.push(buildMsg(rt.id, round, 'host', rt.host.name, 'result', win.winner + '获胜！')); send('discuss:message', all[all.length - 1]); break; }
          }
        }

        if (rt.host?.mode === 'user') {
          send('discuss:awaiting-host-input', { roundTableId: rt.id, round });
          const userInput = await new Promise<string>((resolve) => { const s = sessions.get(rt.id); if (s) s.hostInputResolver = resolve; });
          if (sig?.aborted) throw new Error('生成已中止');
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', userInput); all.push(m); send('discuss:message', m);
        } else if (!invisible && !isGame) {
          send('discuss:character-start', rt.host.name);
          const r = await tryCall(rt.host.name, sys, buildHostSum(rt, round, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', r.content || '', { error: r.error }); all.push(m); send('discuss:message', m);
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
          const r = await tryCall(rt.host.name, sys, buildHostSum(rt, round, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', r.content || `（小结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
          all.push(m); send('discuss:message', m);
        }
      }
      round++;
    }

    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostFinal(rt, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
      const m = buildMsg(rt.id, round - 1, 'host', rt.host.name, 'final_summary', r.content || `（总结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    if (sig?.aborted) throw new Error('生成已中止');
    send('discuss:character-start', `${rt.host.name}（总结）`);
    const rp = await tryCall(rt.host.name, sys, buildResultPrompt(rt, all), rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
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
  const speechBudget = (rt.rules?.maxSpeechLength || 300) * 6 + 2000;
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

  const tryCall = async (nm: string, s: string, u: string, provId?: string, temp?: number, modelOverride?: string, charId?: string, budget?: number): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig, provId, temp, undefined, modelOverride, charId, budget);
    if (r.content || r.error === '生成已中止') return r;
    return { content: '', error: r.error || '生成失败' };
  };

  const tokenTracker = new TokenTracker();
  const lastRound = all.length > 0 ? all[all.length - 1].round : 0;
  const nextRound = lastRound + 1;

  try {
    if (sig?.aborted) throw new Error('生成已中止');
    const mods: any = rt.modules || {};
    const isGame = mods.nightAction || mods.vote;
    const aliveChars = rt.characters.filter((c) => c.secret?.isAlive !== false);
    let speechOrder: Character[];
    const speakOrder = rt.rules?.speakOrder ?? 'sequential';
    if (speakOrder === 'free') { speechOrder = [...aliveChars].sort(() => Math.random() - 0.5); }
    else if (speakOrder === 'host-assigned') {
      const hostAssignPrompt = buildHostAssignPrompt(rt, nextRound, aliveChars);
      const hostAssignResult = await tryCall(rt.host.name, sys, hostAssignPrompt, rt.host.providerId, rt.host.temperature, rt.host.model, 'host', speechBudget);
      speechOrder = parseHostAssignedOrder(hostAssignResult.content || '', aliveChars);
    } else { speechOrder = aliveChars; }

    if (isGame) {
      await runNightPhase(rt, nextRound, all, sig);
      await runRevealPhase(rt, nextRound, all, sig);
      if ((mods as any).winCheck) {
        const win = checkWinCondition(rt);
        if (win.over && win.winner) { all.push(buildMsg(rt.id, nextRound, 'host', rt.host.name, 'result', win.winner + '获胜！')); send('discuss:complete', { roundTableId: rt.id, messages: all }); sessions.delete(rt.id); return; }
      }
    }

    for (const ch of speechOrder) {
      if (sig?.aborted) throw new Error('生成已中止');
      if (ch.secret?.isAlive === false) continue;
      while (sessions.get(rt.id)?.pausePromise) {
        send('discuss:paused', { roundTableId: rt.id, round: nextRound });
        const s = sessions.get(rt.id); if (s?.controller.signal.aborted) break; await s?.pausePromise; if (sig?.aborted) throw new Error('生成已中止');
      }
      await runDaySpeech(rt, ch, nextRound, all, sig, speechBudget, tokenTracker);
    }

    if (isGame && mods.vote) {
      await runVotePhase(rt, nextRound, all, sig);
      if ((mods as any).winCheck) {
        const win = checkWinCondition(rt);
        if (win.over && win.winner) { all.push(buildMsg(rt.id, nextRound, 'host', rt.host.name, 'result', win.winner + '获胜！')); send('discuss:complete', { roundTableId: rt.id, messages: all }); sessions.delete(rt.id); return; }
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
