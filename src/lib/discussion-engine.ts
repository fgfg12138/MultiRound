// ===== AI 圆桌模拟器 — Discussion Engine =====

import type { RoundTable, Message, Character } from './types';
import { saveRoundTable, saveMessages } from './storage';
import {
  buildSystemPrompt,
  buildHostOpeningPrompt,
  buildCharacterSpeechPrompt,
  buildHostSummaryPrompt,
  buildHostFinalSummaryPrompt,
} from './prompts';
import { generateId } from './types';

export class AbortError extends Error {
  constructor() {
    super('生成已中止');
    this.name = 'AbortError';
  }
}

function buildMessage(
  roundTableId: string,
  round: number,
  characterId: string | 'host',
  characterName: string,
  type: Message['type'],
  content: string,
  opts?: { error?: string; providerId?: string }
): Message {
  return {
    id: generateId(),
    roundTableId,
    round,
    characterId,
    characterName,
    type,
    content,
    error: opts?.error,
    providerId: opts?.providerId,
    timestamp: Date.now(),
  };
}

/**
 * 调用 LLM，支持 AbortSignal 和 providerId
 * 发生错误时返回包含 error 字段的对象，不 throw（调用方决定是否重试）
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  providerId?: string
): Promise<{ content?: string; error?: string }> {
  if (signal?.aborted) return { error: '生成已中止' };

  try {
    const result = await window.electronAPI.discussGenerate(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      providerId
    );

    if (signal?.aborted) return { error: '生成已中止' };

    if (result.content) return { content: result.content };
    return { error: result.error || 'LLM 调用返回空' };
  } catch (err: any) {
    if (err.name === 'AbortError' || signal?.aborted) {
      return { error: '生成已中止' };
    }
    return { error: err.message || 'LLM 调用异常' };
  }
}

/**
 * 生成整场圆桌讨论
 * @param signal — AbortSignal，用于停止生成
 * @param onMessage — 每条消息生成后的回调
 * @param onCharacterStart — 角色开始生成时的回调（用于 UI 显示"正在生成X"）
 */
export async function generateDiscussion(
  roundTable: RoundTable,
  onMessage: (msg: Message) => void,
  options?: {
    signal?: AbortSignal;
    onCharacterStart?: (characterName: string) => void;
  }
): Promise<Message[]> {
  const allMessages: Message[] = [];
  const systemPrompt = buildSystemPrompt();
  const { signal, onCharacterStart } = options || {};

  roundTable.status = 'discussing';
  await saveRoundTable(roundTable);

  const tryCall = async (
    charName: string,
    sys: string,
    user: string,
    provId?: string
  ): Promise<{ content?: string; error?: string }> => {
    // 先尝试真实 LLM
    const result = await callLLM(sys, user, signal, provId);
    if (result.content || result.error === '生成已中止') return result;
    // 失败时用 mock 占位
    return { content: '', error: result.error || '生成失败' };
  };

  try {
    // Step 1: Host opening
    if (signal?.aborted) throw new AbortError();
    onCharacterStart?.(roundTable.host.name);
    const openingPrompt = buildHostOpeningPrompt(
      roundTable.topic, roundTable.host, roundTable.characters
    );
    const openingRes = await tryCall(roundTable.host.name, systemPrompt, openingPrompt);
    const openingMsg = buildMessage(
      roundTable.id, 1, 'host', roundTable.host.name, 'opening',
      openingRes.content || `（主持人开场失败${openingRes.error ? ': ' + openingRes.error : ''}）`,
      { error: openingRes.error }
    );
    allMessages.push(openingMsg);
    onMessage(openingMsg);

    // Rounds 1..N
    for (let round = 1; round <= roundTable.totalRounds; round++) {
      if (signal?.aborted) throw new AbortError();

      // Characters speak
      for (const character of roundTable.characters) {
        if (signal?.aborted) throw new AbortError();

        onCharacterStart?.(character.name);
        const speechPrompt = buildCharacterSpeechPrompt(
          roundTable.topic, character, round, allMessages.slice(-3)
        );
        const speechRes = await tryCall(
          character.name, systemPrompt, speechPrompt, character.providerId
        );

        const content = speechRes.content ||
          (speechRes.error
            ? `（${character.name} 生成失败: ${speechRes.error}）`
            : `（${character.name} 未能生成发言）`);

        const speechMsg = buildMessage(
          roundTable.id, round, character.id, character.name, 'speech',
          content,
          { error: speechRes.error, providerId: character.providerId }
        );
        allMessages.push(speechMsg);
        onMessage(speechMsg);
      }

      if (round < roundTable.totalRounds) {
        if (signal?.aborted) throw new AbortError();
        onCharacterStart?.(roundTable.host.name);

        const summaryPrompt = buildHostSummaryPrompt(
          roundTable.topic, roundTable.host, round, allMessages, roundTable.characters
        );
        const summaryRes = await tryCall(roundTable.host.name, systemPrompt, summaryPrompt);
        const summaryMsg = buildMessage(
          roundTable.id, round, 'host', roundTable.host.name, 'summary',
          summaryRes.content || `（小结生成失败${summaryRes.error ? ': ' + summaryRes.error : ''}）`,
          { error: summaryRes.error }
        );
        allMessages.push(summaryMsg);
        onMessage(summaryMsg);
      }
    }

    // Final summary
    if (signal?.aborted) throw new AbortError();
    onCharacterStart?.(roundTable.host.name);
    const finalPrompt = buildHostFinalSummaryPrompt(
      roundTable.topic, roundTable.host, allMessages, roundTable.characters
    );
    const finalRes = await tryCall(roundTable.host.name, systemPrompt, finalPrompt);
    const finalMsg = buildMessage(
      roundTable.id, roundTable.totalRounds, 'host', roundTable.host.name, 'final_summary',
      finalRes.content || `（总结生成失败${finalRes.error ? ': ' + finalRes.error : ''}）`,
      { error: finalRes.error }
    );
    allMessages.push(finalMsg);
    onMessage(finalMsg);

    roundTable.status = 'completed';
    await saveRoundTable(roundTable);
    await saveMessages(roundTable.id, allMessages);
    return allMessages;

  } catch (error: any) {
    if (error.name === 'AbortError') {
      // 中止时保存已有内容
      await saveMessages(roundTable.id, allMessages);
      return allMessages;
    }
    await saveMessages(roundTable.id, allMessages);
    throw error;
  }
}
