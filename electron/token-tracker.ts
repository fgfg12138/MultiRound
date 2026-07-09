// ===== AI 圆桌模拟器 — Token 用量追踪器 =====
// 记录每次 LLM 调用的 token 估算值，支持按角色汇总和实时回调

import type { TokenRecord } from './types.js';
import { TokenEstimator } from './token-estimator.js';

export class TokenTracker {
  private records: TokenRecord[] = [];
  private _onUpdate?: (records: TokenRecord[], total: number) => void;

  /** 注册更新回调（前端订阅/IPC 推送用） */
  onUpdate(cb: (records: TokenRecord[], total: number) => void): void {
    this._onUpdate = cb;
  }

  /** 记录一次 LLM 调用的 token 用量 */
  record(params: {
    characterId: string;
    round: number;
    promptType: string;
    inputText: string;
    outputText: string;
  }): TokenRecord {
    const record: TokenRecord = {
      characterId: params.characterId,
      round: params.round,
      promptType: params.promptType,
      estimatedInputTokens: TokenEstimator.estimateTokens(params.inputText),
      estimatedOutputTokens: TokenEstimator.estimateTokens(params.outputText),
      timestamp: Date.now(),
    };
    this.records.push(record);
    this._onUpdate?.(this.getAllRecords(), this.getTotalTokens());
    return record;
  }

  /** 获取全部记录 */
  getAllRecords(): TokenRecord[] {
    return [...this.records];
  }

  /** 获取某个角色的累计 token（输入+输出） */
  getCharacterTotal(characterId: string): number {
    return this.records
      .filter(r => r.characterId === characterId)
      .reduce((sum, r) => sum + r.estimatedInputTokens + r.estimatedOutputTokens, 0);
  }

  /** 获取某个角色的输入 token 累计 */
  getCharacterInputTotal(characterId: string): number {
    return this.records
      .filter(r => r.characterId === characterId)
      .reduce((sum, r) => sum + r.estimatedInputTokens, 0);
  }

  /** 获取某个角色的输出 token 累计 */
  getCharacterOutputTotal(characterId: string): number {
    return this.records
      .filter(r => r.characterId === characterId)
      .reduce((sum, r) => sum + r.estimatedOutputTokens, 0);
  }

  /** 获取全部 token 总数 */
  getTotalTokens(): number {
    return this.records.reduce(
      (sum, r) => sum + r.estimatedInputTokens + r.estimatedOutputTokens, 0
    );
  }

  /** 获取所有角色的汇总 keyed by characterId */
  getAllCharacterTotals(): Record<string, { total: number; input: number; output: number }> {
    const result: Record<string, { total: number; input: number; output: number }> = {};
    for (const r of this.records) {
      if (!result[r.characterId]) {
        result[r.characterId] = { total: 0, input: 0, output: 0 };
      }
      result[r.characterId].total += r.estimatedInputTokens + r.estimatedOutputTokens;
      result[r.characterId].input += r.estimatedInputTokens;
      result[r.characterId].output += r.estimatedOutputTokens;
    }
    return result;
  }

  /** 获取某个角色的全部记录 */
  getCharacterRecords(characterId: string): TokenRecord[] {
    return this.records.filter(r => r.characterId === characterId);
  }

  /** 重置 */
  reset(): void {
    this.records = [];
  }

  /** 导出所有记录（用于追加到 DiscussionResult） */
  export(): TokenRecord[] {
    return this.getAllRecords();
  }
}
