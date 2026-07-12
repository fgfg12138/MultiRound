// ===== AI 圆桌模拟器 — Whisper / 私信类型（Electron 进程专用副本） =====
// 注意：此文件包含主进程需要但受 tsconfig rootDir 限制无法从 src/ 导入的类型。
// 须与 src/lib/types.ts 手动同步。
// ====================================================================

export type HostMode = 'visible' | 'invisible' | 'user';
export type HostSecretAccess = 'none' | 'judge';
export type SpeakOrder = 'sequential' | 'free' | 'host-assigned';

// ===== 游戏模块系统 =====
export type GamePhase = 'night' | 'day-speech' | 'day-vote' | 'reveal' | 'ended';

export interface GameModules {
  nightAction: boolean; vote: boolean; deathSilence: boolean; winCheck: boolean; phaseIndicator: boolean;
}

export function defaultGameModules(): GameModules {
  return { nightAction: false, vote: false, deathSilence: false, winCheck: false, phaseIndicator: false };
}

export interface NightActions {
  wolfTarget?: string; seerCheck?: { target: string; result: 'good' | 'wolf' };
  witchHeal?: boolean; witchPoison?: string; guardTarget?: string; hunterShot?: string;
  deaths: { characterId: string; round: number; reason?: string }[];
}

export interface VoteResult { votes: Record<string, string>; ousted: string; tied: boolean; }

export interface DeathEntry { characterId: string; round: number; reason?: string; }

export type GoalType = 'consensus' | 'decision' | 'analysis' | 'ranking' | 'debate' | 'creative' | 'custom';
export type MsgType = 'opening' | 'speech' | 'summary' | 'followup' | 'final_summary' | 'result';
export type SecretRole = '[redacted]' | 'normal' | 'fraudster' | 'detective' | 'observer' | 'werewolf' | 'seer' | 'witch' | 'guard' | 'hunter' | 'villager';
export interface WhisperMessage {  id: string;  roundTableId: string;  senderId: string;  recipientId?: string;  groupId?: string;  type: '1:1' | 'group' | 'night-action';  content: string;  timestamp: number;  status: 'sent' | 'read' | 'unread';  replyToId?: string;  autoReplyTriggered?: boolean;}export interface WhisperGroup {  id: string;  roundTableId: string;  name: string;  hostId: string;  memberIds: string[];  speakOrder: 'sequential' | 'free' | 'host-assigned';  createdAt: number;  autoReplyEnabled?: boolean;  replyRoundCount?: number;}export interface WhisperData {  whispers: WhisperMessage[];  groups: WhisperGroup[];}export interface TokenRecord {  characterId: string;  round: number;  promptType: string;  estimatedInputTokens: number;  estimatedOutputTokens: number;  timestamp: number;}

export interface CharacterSecret {
  secretRole: SecretRole;
  publicGoal: string;
  privateGoal: string;
  knownSecrets: string[];
  isAlive: boolean;
  revealed: boolean;
  diedAtRound?: number;
  diedReason?: 'wolf-kill' | 'witch-poison' | 'voted-out' | 'hunter-shot';
  nightActionDone?: boolean;
}

export interface CharacterMemory {
  privateMemory: string[];
  publicMemory: string[];
  suspicionMap: Record<string, number>;
  strategyPlan: string;
}

export interface Character {
  id: string; name: string; role: string; persona: string;
  providerId: string; stance?: string; style?: string;
  motivation?: string; expertise?: string; relationship?: string;
  constraints?: string; teamId?: string; temperature?: number;
  model?: string;
  secret?: CharacterSecret;
  memory?: CharacterMemory;
}

export interface Host {
  name: string; style: string; mode: HostMode;
  providerId?: string; temperature?: number;
  model?: string;
  secretAccess?: HostSecretAccess;
}

export interface RuleSet {
  roundCount: number; speakOrder: SpeakOrder; maxSpeechLength: number;
  requireResponse: boolean; allowConsecutiveSpeech: boolean;
  scoringEnabled: boolean; forbiddenTopics?: string[];
}

export interface Goal { type: GoalType; description: string; successCriteria?: string; }

export interface Scenario { title: string; description: string; atmosphere?: string; }

export interface RuntimeControl {
  currentHostMode?: HostMode; userOverrideActive?: boolean;
  temporaryRules?: Partial<RuleSet>;
}

export interface RoundTable {
  id: string; topic: string; totalRounds: number;
  status: string; createdAt: number;
  scenario: Scenario; host: Host;
  characters: Character[]; rules: RuleSet;
  goal: Goal; runtimeControl?: RuntimeControl;
  gameMode?: 'discussion' | 'werewolf';
  modules?: GameModules;
  phase?: GamePhase;
  nightActions?: NightActions;
  voteResult?: VoteResult;
  deathLog?: DeathEntry[];
  witchPotions?: { heal: boolean; poison: boolean };
  lastGuardTarget?: string;
}

export interface Message {
  id: string; roundTableId: string; round: number;
  characterId: string | 'host'; characterName: string;
  type: MsgType; content: string;
  error?: string; providerId?: string; timestamp: number;
  reasoning?: string;
}

export interface MemoryUpdatePayload {
  privateMemoryAdd?: string[];
  publicMemoryAdd?: string[];
  suspicionMapDelta?: Record<string, number>;
  strategyPlan?: string;
}

export interface CharacterOutput {
  public: { speech: string };
  private: { memoryUpdate: MemoryUpdatePayload };
}
