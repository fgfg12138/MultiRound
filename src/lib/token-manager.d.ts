export { TokenEstimator } from './token-estimator';
export declare const PromptType: {
    readonly CHAR_SPEECH: "CHAR_SPEECH";
    readonly MEMORY_UPDATE: "MEMORY_UPDATE";
    readonly HOST_OPENING: "HOST_OPENING";
    readonly HOST_SUMMARY: "HOST_SUMMARY";
    readonly HOST_FINAL: "HOST_FINAL";
    readonly STRUCTURED_RESULT: "STRUCTURED_RESULT";
};
export type PromptType = (typeof PromptType)[keyof typeof PromptType];
export declare const TOKEN_BUDGET_DEFAULTS: Record<PromptType, number>;
export declare const SAFETY_MARGIN = 0.85;
export declare const TOKEN_PER_CN_CHAR = 1.5;
export declare const TOKEN_PER_EN_CHAR = 3;
export declare const DEGRADE_STEPS: {
    readonly recentMsgMaxCount: readonly [6, 3, 2, 1];
    readonly memoryCap: readonly [40, 20, 10];
    readonly strategyMaxChars: readonly [240, 100];
};
export interface TruncationConfig {
    recentMsgMaxCount: number;
    memoryPrivateCap: number;
    memoryPublicCap: number;
    strategyMaxChars: number;
    isSummarized: boolean;
}
export interface BudgetCheckReport {
    isWithinBudget: boolean;
    totalEstimated: number;
    budgetLimit: number;
    sectionEstimates: Record<string, {
        text: string;
        estimated: number;
    }>;
    overage: number;
}
export interface DegradeResult {
    level: 0 | 1 | 2 | 3;
    actions: string[];
    finalBudget: number;
}
export declare class TokenBudgetManager {
    private readonly promptType;
    private readonly baseBudget;
    private effectiveBudget;
    private config;
    private constructor();
    /** 工厂方法：根据 PromptType 创建实例，支持按类型覆盖预算 */
    static create(promptType: PromptType, overrides?: Partial<Record<PromptType, number>>): TokenBudgetManager;
    /** 检查单段文本是否在有效预算内 */
    checkBudget(text: string): boolean;
    /** 检查多段 section 是否在有效预算内，返回详细报告 */
    checkBudgetSections(sections: Record<string, string>): BudgetCheckReport;
    /**
     * 自动降级：依次缩减 recentMsgMaxCount → memoryCap / strategyMaxChars → isSummarized。
     *
     * 注意：此方法仅更新内部 TruncationConfig，调用方需根据新 config 重建 section 内容后
     * 重新调用 checkBudgetSections 确认是否在预算内。
     */
    autoDegrade(sections: Record<string, string>): DegradeResult;
    /** 获取当前截断配置的浅拷贝 */
    getConfig(): TruncationConfig;
    /** 获取当前有效预算 */
    getEffectiveBudget(): number;
}
