// ===== AI 圆桌模拟器 — Token 上下文管理器 =====
// 基于 PromptType 的 token 预算管理、检查、自动降级

import { TokenEstimator } from './token-estimator.js';
import type { TokenEstimateResult } from './token-estimator.js';

export { TokenEstimator } from './token-estimator.js';

// ===== PromptType Constants =====

export const PromptType = {
  CHAR_SPEECH: 'CHAR_SPEECH',
  CHAR_SPEECH_COMBINED: 'CHAR_SPEECH_COMBINED',
  MEMORY_UPDATE: 'MEMORY_UPDATE',
  HOST_OPENING: 'HOST_OPENING',
  HOST_SUMMARY: 'HOST_SUMMARY',
  HOST_FINAL: 'HOST_FINAL',
  STRUCTURED_RESULT: 'STRUCTURED_RESULT',
} as const;

export type PromptType = (typeof PromptType)[keyof typeof PromptType];

export const TOKEN_BUDGET_DEFAULTS: Record<PromptType, number> = {
  [PromptType.CHAR_SPEECH]: 4000,
  [PromptType.CHAR_SPEECH_COMBINED]: 5000,
  [PromptType.MEMORY_UPDATE]: 3000,
  [PromptType.HOST_OPENING]: 4000,
  [PromptType.HOST_SUMMARY]: 4000,
  [PromptType.HOST_FINAL]: 6000,
  [PromptType.STRUCTURED_RESULT]: 4000,
};

export const SAFETY_MARGIN = 0.85;

export const TOKEN_PER_CN_CHAR = 1.5;
export const TOKEN_PER_EN_CHAR = 3;

export const DEGRADE_STEPS = {
  recentMsgMaxCount: [6, 3, 2, 1],
  memoryCap: [40, 20, 10],
  strategyMaxChars: [240, 100],
} as const;

// ===== Interfaces =====

export interface TruncationConfig {
  recentMsgMaxCount: number;   // default: 6
  memoryPrivateCap: number;    // default: 40
  memoryPublicCap: number;     // default: 40
  strategyMaxChars: number;    // default: 240
  isSummarized: boolean;       // default: false (Level 3)
}

export interface BudgetCheckReport {
  isWithinBudget: boolean;
  totalEstimated: number;
  budgetLimit: number;
  sectionEstimates: Record<string, { text: string; estimated: number }>;
  overage: number;
}

export interface DegradeResult {
  level: 0 | 1 | 2 | 3;
  actions: string[];
  finalBudget: number;
}

// ===== TokenBudgetManager =====

export class TokenBudgetManager {
  private readonly promptType: PromptType;
  private readonly baseBudget: number;
  private effectiveBudget: number;
  private config: TruncationConfig;

  private constructor(promptType: PromptType, baseBudget: number) {
    this.promptType = promptType;
    this.baseBudget = baseBudget;
    this.effectiveBudget = Math.floor(baseBudget * SAFETY_MARGIN);
    this.config = {
      recentMsgMaxCount: DEGRADE_STEPS.recentMsgMaxCount[0], // 6
      memoryPrivateCap: DEGRADE_STEPS.memoryCap[0],          // 40
      memoryPublicCap: DEGRADE_STEPS.memoryCap[0],           // 40
      strategyMaxChars: DEGRADE_STEPS.strategyMaxChars[0],   // 240
      isSummarized: false,
    };
  }

  /** 工厂方法：根据 PromptType 创建实例，支持按类型覆盖预算 */
  static create(
    promptType: PromptType,
    overrides?: Partial<Record<PromptType, number>>,
  ): TokenBudgetManager {
    const budget = overrides?.[promptType] ?? TOKEN_BUDGET_DEFAULTS[promptType];
    return new TokenBudgetManager(promptType, budget);
  }

  /** 检查单段文本是否在有效预算内 */
  checkBudget(text: string): boolean {
    return TokenEstimator.estimateTokens(text) <= this.effectiveBudget;
  }

  /** 检查多段 section 是否在有效预算内，返回详细报告 */
  checkBudgetSections(sections: Record<string, string>): BudgetCheckReport {
    const estimates = TokenEstimator.estimateSections(sections);
    const total = Object.values(estimates).reduce(
      (sum, e) => sum + e.estimatedTokens,
      0,
    );
    const overage = Math.max(0, total - this.effectiveBudget);

    const sectionEstimates: Record<string, { text: string; estimated: number }> = {};
    for (const [key, est] of Object.entries(estimates)) {
      sectionEstimates[key] = { text: est.text, estimated: est.estimatedTokens };
    }

    return {
      isWithinBudget: total <= this.effectiveBudget,
      totalEstimated: total,
      budgetLimit: this.effectiveBudget,
      sectionEstimates,
      overage,
    };
  }

  /**
   * 自动降级：依次缩减 recentMsgMaxCount → memoryCap / strategyMaxChars → isSummarized。
   *
   * 注意：此方法仅更新内部 TruncationConfig，调用方需根据新 config 重建 section 内容后
   * 重新调用 checkBudgetSections 确认是否在预算内。
   */
  autoDegrade(sections: Record<string, string>): DegradeResult {
    const actions: string[] = [];
    let level: 0 | 1 | 2 | 3 = 0;

    const report = this.checkBudgetSections(sections);
    if (report.isWithinBudget) {
      return { level: 0, actions: [], finalBudget: this.effectiveBudget };
    }

    // --- Level 1: 截断 recentMsgMaxCount ---
    if (!report.isWithinBudget) {
      for (const count of DEGRADE_STEPS.recentMsgMaxCount.slice(1)) {
        if (count >= this.config.recentMsgMaxCount) continue;
        this.config.recentMsgMaxCount = count;
        actions.push(`recentMsgMaxCount: ${count}`);
        level = 1;
        break;
      }
    }

    // --- Level 2: 压缩 memory caps + strategy chars ---
    if (!report.isWithinBudget) {
      for (const cap of DEGRADE_STEPS.memoryCap.slice(1)) {
        if (cap >= this.config.memoryPrivateCap) continue;
        this.config.memoryPrivateCap = cap;
        this.config.memoryPublicCap = cap;
        actions.push(`memoryCap: ${cap}`);
        level = 2;
        break;
      }

      for (const chars of DEGRADE_STEPS.strategyMaxChars.slice(1)) {
        if (chars >= this.config.strategyMaxChars) continue;
        this.config.strategyMaxChars = chars;
        actions.push(`strategyMaxChars: ${chars}`);
        break;
      }
    }

    // --- Level 3: 标记需要摘要化（实际清除由调用方执行） ---
    this.config.isSummarized = true;
    level = 3;

    return { level, actions, finalBudget: this.effectiveBudget };
  }

  /** 获取当前截断配置的浅拷贝 */
  getConfig(): TruncationConfig {
    return { ...this.config };
  }

  /** 获取当前有效预算 */
  getEffectiveBudget(): number {
    return this.effectiveBudget;
  }
}
