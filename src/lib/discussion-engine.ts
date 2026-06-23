// ⚠️ DEPRECATED — 实际运行引擎已迁移至 electron/discussion-runner.ts
// 本文件不再被任何运行路径引用，保留仅作参考。请勿修改。
// 如需修改讨论逻辑，请改 electron/discussion-runner.ts
// ===== AI 圆桌模拟器 — Discussion Engine =====
// Phase 13+14: V2 prompt 注入 + 隐性主持人 + 结构化结果

import type { RoundTable, Message, Character } from './types';
import { saveRoundTable, saveMessages } from './storage';
import {
  buildSystemPrompt,
  buildHostOpeningPrompt,
  buildCharacterSpeechPrompt,
  buildHostSummaryPrompt,
  buildHostFinalSummaryPrompt,
  buildStructuredResultPrompt,
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
 * @param onCharacterStart — 角色开始生成时的回调
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
  const isInvisibleHost = roundTable.host?.mode === 'invisible';

  roundTable.status = 'discussing';
  await saveRoundTable(roundTable);

  const tryCall = async (
    charName: string,
    sys: string,
    user: string,
    provId?: string
  ): Promise<{ content?: string; error?: string }> => {
    const result = await callLLM(sys, user, signal, provId);
    if (result.content || result.error === '生成已中止') return result;
    return { content: '', error: result.error || '生成失败' };
  };

  try {
    // Step 1: Host opening (skip for invisible host)
    if (signal?.aborted) throw new AbortError();
    if (!isInvisibleHost) {
      onCharacterStart?.(roundTable.host.name);
      const openingPrompt = buildHostOpeningPrompt(roundTable);
      const openingRes = await tryCall(roundTable.host.name, systemPrompt, openingPrompt, roundTable.host.providerId);
      const openingMsg = buildMessage(
        roundTable.id, 1, 'host', roundTable.host.name, 'opening',
        openingRes.content || `（主持人开场失败${openingRes.error ? ': ' + openingRes.error : ''}）`,
        { error: openingRes.error }
      );
      allMessages.push(openingMsg);
      onMessage(openingMsg);
    }

    // Rounds 1..N (0 = infinite, stops via AbortSignal)
    const SAFETY_HARD_CAP = 999; // prevent infinite loop bug, not a user limit
    const maxRounds = roundTable.totalRounds === 0 ? SAFETY_HARD_CAP : roundTable.totalRounds;
    let round = 1;
    while (round <= maxRounds) {
      if (signal?.aborted) throw new AbortError();

      // Characters speak (always, regardless of host mode)
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

      // Host round summary (skip for invisible host; skip on final round in finite mode)
      if (round < maxRounds) {
        if (signal?.aborted) throw new AbortError();

        if (!isInvisibleHost) {
          onCharacterStart?.(roundTable.host.name);
          const summaryPrompt = buildHostSummaryPrompt(roundTable, round, allMessages);
          const summaryRes = await tryCall(roundTable.host.name, systemPrompt, summaryPrompt, roundTable.host.providerId);
          const summaryMsg = buildMessage(
            roundTable.id, round, 'host', roundTable.host.name, 'summary',
            summaryRes.content || `（小结生成失败${summaryRes.error ? ': ' + summaryRes.error : ''}）`,
            { error: summaryRes.error }
          );
          allMessages.push(summaryMsg);
          onMessage(summaryMsg);
        }
      }
      round++;
    }

    // Step 4: Final summary (skip for invisible host)
    if (signal?.aborted) throw new AbortError();
    if (!isInvisibleHost) {
      onCharacterStart?.(roundTable.host.name);
      const finalPrompt = buildHostFinalSummaryPrompt(roundTable, allMessages);
      const finalRes = await tryCall(roundTable.host.name, systemPrompt, finalPrompt, roundTable.host.providerId);
      const finalMsg = buildMessage(
        roundTable.id, round - 1, 'host', roundTable.host.name, 'final_summary',
        finalRes.content || `（总结生成失败${finalRes.error ? ': ' + finalRes.error : ''}）`,
        { error: finalRes.error }
      );
      allMessages.push(finalMsg);
      onMessage(finalMsg);
    }

    // Step 5: Structured result (all modes)
    if (signal?.aborted) throw new AbortError();
    onCharacterStart?.(`${roundTable.host.name}（总结）`);
    const resultPrompt = buildStructuredResultPrompt(roundTable, allMessages);
    const resultRes = await tryCall(roundTable.host.name, systemPrompt, resultPrompt, roundTable.host.providerId);
    const resultContent = resultRes.content || '';
    const resultMsg = buildMessage(
      roundTable.id, round - 1, 'host', roundTable.host.name, 'result',
      resultContent, { error: resultRes.error }
    );
    allMessages.push(resultMsg);
    onMessage(resultMsg);

    roundTable.status = 'completed';
    await saveRoundTable(roundTable);
    await saveMessages(roundTable.id, allMessages);
    return allMessages;

  } catch (error: any) {
    if (error.name === 'AbortError') {
      await saveMessages(roundTable.id, allMessages);
      return allMessages;
    }
    await saveMessages(roundTable.id, allMessages);
    throw error;
  }
}
