// ===== AI 圆桌模拟器 — Type Definitions =====

export const CURRENT_SCHEMA_VERSION = 2;

// ===== 1. 场景 =====
export interface Scenario {
  title: string;
  description: string;
  atmosphere?: string; // 正式/对抗性/轻松/紧张
}

// ===== 2. 阵营 =====
export interface Team {
  id: string;
  name: string;
  color: string;
}

// ===== 3. 角色（扩展，保留所有旧字段） =====
export interface Character {
  id: string;
  name: string;
  role: string;
  persona: string;       // NEW: 人设自由文本
  providerId: string;    // 使用的 LLM 厂商 ID，"default" = 使用第一个已配置厂商
  // 以下字段保留但改为可选（隐含在 persona 中）
  stance?: string;
  style?: string;
  // 高级可选字段
  motivation?: string;
  expertise?: string;
  relationship?: string;
  constraints?: string;
  teamId?: string;
  temperature?: number;      // 0.0-2.0，默认走厂商配置
}

// ===== 4. 主持人 =====
export type HostMode = 'visible' | 'invisible' | 'user';

export interface Host {
  name: string;
  style: string;
  mode: HostMode;                    // NEW: 默认 'visible'
  providerId?: string;               // 主持人使用的 LLM 厂商 ID，默认走第一个
  temperature?: number;              // 0.0-2.0
  allowUserInterruption?: boolean;
  autoIntervene?: boolean;
}

// ===== 5. 规则 =====
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

// ===== 6. 目标 =====
export type GoalType = 'consensus' | 'decision' | 'analysis'
                     | 'ranking' | 'debate' | 'creative' | 'custom';

export interface Goal {
  type: GoalType;
  description: string;
  successCriteria?: string;
}

// ===== 7. 结果 =====
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

// ===== 8. 运行时控制 =====
export interface RuntimeControl {
  currentHostMode: HostMode;
  userOverrideActive: boolean;
  temporaryRules?: Partial<RuleSet>;
}

// ===== 9. RoundTable =====
export interface RoundTable {
  id: string;
  schemaVersion: number;    // NEW: 2

  // V1 兼容字段（保留，引擎/UI 继续使用）
  topic: string;
  totalRounds: number;

  // V2 新字段
  scenario: Scenario;
  host: Host;
  characters: Character[];
  teams?: Team[];
  rules: RuleSet;
  goal: Goal;
  result?: StructuredResult;
  runtimeControl?: RuntimeControl;

  // 不变
  status: 'created' | 'discussing' | 'completed' | 'stopped';
  createdAt: number;
}

// ===== Message（Phase 12 不修改） =====
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

export interface DiscussionResult {
  roundTable: RoundTable;
  messages: Message[];
}

export function generateId(): string {
  return crypto.randomUUID();
}
