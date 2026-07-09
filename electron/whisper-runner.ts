// ===== AI 圆桌模拟器 — Whisper Reply Handler =====
// 处理主持人私信 → 角色 AI 回复 — 从 discussion-runner.ts 拆分

import path from 'node:path';
import fs from 'node:fs';
import { getDataDir, loadIndex, loadWhispers, saveWhispers } from './data-store.js';
import type { RoundTable, WhisperMessage } from './types.js';
import { buildSysPrompt, buildCharPersona } from './prompts.js';
import { genId, send, callLlm } from './runner-state.js';

/**
 * 处理 1:1 私信 AI 回复 — 独立 AbortController，可单独取消
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

    const whisperData = loadWhispers(dataDir, filename);
    const original = whisperData.whispers.find((w) => w.id === originalMessageId);
    if (!original) { console.log('[WAIL-Guard] blocked: original not found', originalMessageId); return null; }
    if (original.senderId !== 'host') { console.log('[WAIL-Guard] blocked: sender not host', original.senderId); return null; }
    if (original.status !== 'unread') { console.log('[WAIL-Guard] blocked: already consumed', original.status); return null; }
    if (original.autoReplyTriggered === true) { console.log('[WAIL-Guard] blocked: already triggered', originalMessageId); return null; }

    original.autoReplyTriggered = true;
    saveWhispers(dataDir, filename, whisperData);

    const sys = buildSysPrompt();
    const persona = buildCharPersona(character);
    const prompt = `你现在扮演：\n\n${persona}\n\n你正在与主持人进行私下对话。主持人刚刚对你说：\n\n主持人：${whisperContent}\n\n请以角色的身份和性格，自然地回复主持人的私信。\n注意：\n1. 回复要符合你的人设\n2. 语气自然，像私下交流\n3. 不要提及这是私信或"私下告诉你"\n4. 直接对主持人说话，使用"您"或合适称谓\n5. 回复字数控制在 50-200 字\n\n你可以直接回复主持人，也可以简单表示已读、点头、或暂时没有更多要说的。\n如果这条私信不需要立即行动，保持简短即可，不必刻意展开对话。`;

    const controller = new AbortController();
    const result = await callLlm(sys, prompt, controller.signal, character.providerId, character.temperature);
    if (!result.content) { controller.abort(); return null; }

    const replyMessage: WhisperMessage = {
      id: genId(), roundTableId, senderId: character.id, recipientId: 'host',
      type: '1:1', content: result.content, timestamp: Date.now(),
      status: 'unread', replyToId: originalMessageId,
    };
    whisperData.whispers.push(replyMessage);
    saveWhispers(dataDir, filename, whisperData);

    send('whisper:reply', { roundTableId, originalMessageId, reply: replyMessage });
    controller.abort();
    return replyMessage;
  } catch (error: any) {
    console.error('handleWhisperReply error:', error);
    return null;
  }
}
