// ===== AI 圆桌模拟器 — Token 估算工具 =====
// 中文为主场景下的 token 数量估算器

export interface TokenEstimateResult {
  text: string;
  estimatedTokens: number;
  charLength: number;
  isOverBudget: boolean;
}

export class TokenEstimator {
  /**
   * 估算单段文本的 token 数（中文为主场景）。
   *
   * 中文字符权重 1.0，英文字符权重 0.33。
   * 等价于 (cnChars * 2 + enChars) / 3。
   */
  static estimateTokens(text: string): number {
    let cnChars = 0;
    let enChars = 0;

    for (const ch of text) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
        cnChars++;
      } else if (ch.match(/\S/)) {
        enChars++;
      }
    }

    return Math.ceil((cnChars * 2 + enChars) / 3);
  }

  /** 批量估算一组消息的 token 数 */
  static estimateMessages(msgs: { content: string }[]): TokenEstimateResult[] {
    return msgs.map((msg) => {
      const tokens = this.estimateTokens(msg.content);
      return {
        text: msg.content,
        estimatedTokens: tokens,
        charLength: msg.content.length,
        isOverBudget: false, // caller fills this
      };
    });
  }

  /** 估算命名 sections 的 token 数 */
  static estimateSections(
    sections: Record<string, string>,
  ): Record<string, TokenEstimateResult> {
    const result: Record<string, TokenEstimateResult> = {};
    for (const [key, text] of Object.entries(sections)) {
      const tokens = this.estimateTokens(text);
      result[key] = {
        text,
        estimatedTokens: tokens,
        charLength: text.length,
        isOverBudget: false,
      };
    }
    return result;
  }

  /** 对一组估算结果求和 */
  static totalOf(results: TokenEstimateResult[]): number {
    return results.reduce((sum, r) => sum + r.estimatedTokens, 0);
  }
}
