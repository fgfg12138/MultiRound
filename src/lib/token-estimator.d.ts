export interface TokenEstimateResult {
    text: string;
    estimatedTokens: number;
    charLength: number;
    isOverBudget: boolean;
}
export declare class TokenEstimator {
    /**
     * 估算单段文本的 token 数（中文为主场景）。
     *
     * 中文字符权重 1.0，英文字符权重 0.33。
     * 等价于 (cnChars * 2 + enChars) / 3。
     */
    static estimateTokens(text: string): number;
    /** 批量估算一组消息的 token 数 */
    static estimateMessages(msgs: {
        content: string;
    }[]): TokenEstimateResult[];
    /** 估算命名 sections 的 token 数 */
    static estimateSections(sections: Record<string, string>): Record<string, TokenEstimateResult>;
    /** 对一组估算结果求和 */
    static totalOf(results: TokenEstimateResult[]): number;
}
