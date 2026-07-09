export declare const CURRENT_SCHEMA_VERSION = 3;
export interface Scenario {
    title: string;
    description: string;
    atmosphere?: string;
}
export interface Team {
    id: string;
    name: string;
    color: string;
}
export type SecretRole = 'normal' | 'fraudster' | 'detective' | 'observer';
export interface CharacterSecret {
    secretRole: SecretRole;
    publicGoal: string;
    privateGoal: string;
    knownSecrets: string[];
    isAlive: boolean;
    revealed: boolean;
}
export interface CharacterMemory {
    privateMemory: string[];
    publicMemory: string[];
    suspicionMap: Record<string, number>;
    strategyPlan: string;
}
export interface Character {
    id: string;
    name: string;
    role: string;
    persona: string;
    providerId: string;
    stance?: string;
    style?: string;
    motivation?: string;
    expertise?: string;
    relationship?: string;
    constraints?: string;
    teamId?: string;
    temperature?: number;
    secret?: CharacterSecret;
    memory?: CharacterMemory;
}
export type HostMode = 'visible' | 'invisible' | 'user';
export type HostSecretAccess = 'public' | 'judge';
export interface Host {
    name: string;
    style: string;
    mode: HostMode;
    providerId?: string;
    temperature?: number;
    allowUserInterruption?: boolean;
    autoIntervene?: boolean;
    secretAccess?: HostSecretAccess;
}
export type SpeakOrder = 'sequential' | 'free' | 'host-assigned';
export interface RuleSet {
    roundCount: number;
    speakOrder: SpeakOrder;
    maxSpeechLength: number;
    requireResponse: boolean;
    allowConsecutiveSpeech: boolean;
    scoringEnabled: boolean;
    scoringDimensions?: string[];
    forbiddenTopics?: string[];
}
export type GoalType = 'consensus' | 'decision' | 'analysis' | 'ranking' | 'debate' | 'creative' | 'custom';
export interface Goal {
    type: GoalType;
    description: string;
    successCriteria?: string;
}
export interface StructuredResult {
    conclusion: string;
    consensusPoints: string[];
    disagreementPoints: string[];
    goalAchieved: 'yes' | 'partial' | 'no';
    recommendations?: string[];
    scores?: Record<string, {
        total: number;
        dimensions: Record<string, number>;
    }>;
}
export interface RuntimeControl {
    currentHostMode: HostMode;
    userOverrideActive: boolean;
    temporaryRules?: Partial<RuleSet>;
}
export interface RoundTable {
    id: string;
    schemaVersion: number;
    topic: string;
    totalRounds: number;
    scenario: Scenario;
    host: Host;
    characters: Character[];
    teams?: Team[];
    rules: RuleSet;
    goal: Goal;
    result?: StructuredResult;
    runtimeControl?: RuntimeControl;
    status: 'created' | 'discussing' | 'completed' | 'stopped';
    createdAt: number;
    _initialRound?: number;
}
export interface Message {
    id: string;
    roundTableId: string;
    round: number;
    characterId: string | 'host';
    characterName: string;
    type: 'opening' | 'speech' | 'summary' | 'followup' | 'final_summary' | 'result';
    content: string;
    error?: string;
    providerId?: string;
    timestamp: number;
}
export interface PublicOutput {
    speech: string;
}
export interface MemoryUpdate {
    privateMemoryAdd: string[];
    publicMemoryAdd: string[];
    suspicionMapDelta: Record<string, number>;
    strategyPlan: string;
}
export interface PrivateOutput {
    memoryUpdate: MemoryUpdate;
}
export interface CharacterOutput {
    public: PublicOutput;
    private: PrivateOutput;
}
export interface TokenRecord {
    characterId: string;
    round: number;
    promptType: string;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    timestamp: number;
}
export interface DiscussionResult {
    roundTable: RoundTable;
    messages: Message[];
    tokenRecords: TokenRecord[];
}
export declare function generateId(): string;
export interface WhisperMessage {
    id: string;
    roundTableId: string;
    senderId: string;
    recipientId?: string;
    groupId?: string;
    type: '1:1' | 'group';
    content: string;
    timestamp: number;
    status: 'sent' | 'read' | 'unread';
    replyToId?: string;
    /**
     * 是否已经触发过自动回复。
     * 仅对 senderId='host' 的 1:1 私信有意义。
     * 用于防止重复触发、意外重试导致的多轮循环。
     */
    autoReplyTriggered?: boolean;
}
export interface WhisperGroup {
    id: string;
    roundTableId: string;
    name: string;
    hostId: string;
    memberIds: string[];
    speakOrder: 'sequential' | 'free' | 'host-assigned';
    createdAt: number;
    /**
     * 是否允许该群聊触发 AI 自动回复。
     * MVP 默认 false。
     */
    autoReplyEnabled?: boolean;
    /**
     * 该群聊自创建以来已完成的「主持人消息 → AI 回复」轮数。
     * 用于限制总轮数和审计。
     */
    replyRoundCount?: number;
}
export interface WhisperData {
    whispers: WhisperMessage[];
    groups: WhisperGroup[];
}
