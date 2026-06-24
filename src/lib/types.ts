// ===== AI 圆桌模拟器 — Type Definitions =====

export const CURRENT_SCHEMA_VERSION = 3;

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

// ===== 3. 隐藏身份 / 私有记忆 =====
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

// ===== 4. 角色（扩展，保留所有旧字段） =====
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

  // V3: 隐藏身份和运行记忆。代码层隔离，不能只写在人设里。
  secret?: CharacterSecret;
  memory?: CharacterMemory;
}

// ===== 5. 主持人 =====
export type HostMode = 'visible' | 'invisible' | 'user';
export type HostSecretAccess = 'public' | 'judge';

export interface Host {
  name: string;
  style: string;
  mode: HostMode;                    // NEW: 默认 'visible'
  providerId?: string;               // 主持人使用的 LLM 厂商 ID，默认走第一个
  temperature?: number;              // 0.0-2.0
  allowUserInterruption?: boolean;
  autoIntervene?: boolean;
  secretAccess?: HostSecretAccess;   // V3: judge = 上帝/裁判主持人，可读全部秘密但公开发言不能泄露
}

// ===== 6. 规则 =====
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

// ===== 7. 目标 =====
export type GoalType = 'consensus' | 'decision' | 'analysis'
                     | 'ranking' | 'debate' | 'creative' | 'custom';

export interface Goal {
  type: GoalType;
  description: string;
  successCriteria?: string;
}

// ===== 8. 结果 =====
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

// ===== 9. 运行时控制 =====
export interface RuntimeControl {
  currentHostMode: HostMode;
  userOverrideActive: boolean;
  temporaryRules?: Partial<RuleSet>;
}

// ===== 10. RoundTable =====
export interface RoundTable {
  id: string;
  schemaVersion: number;    // V3

  // V1 兼容字段（保留，引擎/UI 继续使用）
  topic: string;
  totalRounds: number;

  // V2+ 新字段
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

// ===== Message =====
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
