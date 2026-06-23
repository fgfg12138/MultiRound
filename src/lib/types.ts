// ===== AI 圆桌模拟器 — Type Definitions =====

export interface Character {
  id: string;
  name: string;
  role: string;
  stance: string;
  style: string;
  providerId: string;  // 使用的 LLM 厂商 ID，"default" = 使用第一个已配置厂商
}

export interface Host {
  name: string;
  style: string;
}

export interface RoundTable {
  id: string;
  topic: string;
  host: Host;
  characters: Character[];
  totalRounds: number;
  status: 'created' | 'discussing' | 'completed';
  createdAt: number;
}

export interface Message {
  id: string;
  roundTableId: string;
  round: number;
  characterId: string | 'host';
  characterName: string;
  type: 'opening' | 'speech' | 'summary' | 'followup' | 'final_summary';
  content: string;
  error?: string;       // 生成失败时的错误信息
  providerId?: string;  // 用于生成此消息的 LLM 厂商 ID
  timestamp: number;
}

export interface DiscussionResult {
  roundTable: RoundTable;
  messages: Message[];
}

export function generateId(): string {
  return crypto.randomUUID();
}
