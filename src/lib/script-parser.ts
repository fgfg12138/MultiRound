// ===== AI 圆桌模拟器 — 剧本文件解析器 =====
// 解析 Markdown 文件中的 YAML front matter（--- 包裹部分）
// 输出可填充 Create 表单的 Draft 对象

import type { RoundTable } from './types';

export interface ScriptDraft {
  topic?: string;
  totalRounds?: number;
  atmosphere?: string;
  maxSpeechLength?: number;
  speakOrder?: string;
  scoringEnabled?: boolean;
  forbiddenTopics?: string[];
  goal?: { type?: string; description?: string; successCriteria?: string };
  host?: { name?: string; style?: string; mode?: string };
  characters?: {
    name: string; role?: string; persona?: string;
    stance?: string; style?: string;
    motivation?: string; expertise?: string;
    relationship?: string; constraints?: string;
    teamId?: string;
    secret?: { secretRole?: string; publicGoal?: string; privateGoal?: string };
    memory?: { privateMemory?: string[]; publicMemory?: string[]; strategyPlan?: string };
  }[];
  teams?: { name?: string; color?: string }[];
}

/**
 * 从 .md 文本中提取 YAML front matter 并解析为 ScriptDraft
 * 支持 YAML 基本语法：键值对、数组（- name:）、嵌套对象、# 注释
 */
export function parseScript(text: string): ScriptDraft | null {
  if (!text) return null;

  // 1. 提取 --- ... --- 包裹的 front matter
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const yamlText = fmMatch[1];
  const draft: ScriptDraft = {};
  let currentSection: string | null = null;
  let currentArray: any[] | null = null;
  let currentObj: any | null = null;

  const lines = yamlText.split('\n');

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Skip empty lines and comments
    if (!line || line.trim().startsWith('#')) continue;

    // Detect array item start: "- name: ..." or "- key: value"
    const arrayMatch = line.match(/^\s*-\s+(.+)/);
    if (arrayMatch) {
      const rest = arrayMatch[1];
      if (currentSection === 'characters') {
        currentObj = parseKeyValues(rest);
        (draft.characters || (draft.characters = [])).push(currentObj);
      } else if (currentSection === 'teams') {
        currentObj = parseKeyValues(rest);
        (draft.teams || (draft.teams = [])).push(currentObj);
      }
      continue;
    }

    // Non-array line: could be a top-level key or sub-key of current object
    const kv = line.match(/^\s*(\w[\w.]*)\s*:\s*(.*)/);
    if (!kv) continue;

    const key = kv[1];
    const val = kv[2].trim();

    // Section headers (keys that expect array children)
    if (key === 'characters' || key === 'teams') {
      currentSection = key;
      if (key === 'characters') draft.characters = [];
      else if (key === 'teams') draft.teams = [];
      currentObj = null;
      continue;
    }

    // If we're inside a character/team object, set nested key
    if (currentObj && (currentSection === 'characters' || currentSection === 'teams')) {
      setDeep(currentObj, key, parseValue(val));
      continue;
    }

    // Top-level keys
    if (key === 'goal') {
      draft.goal = draft.goal || {};
      if (val) {
        // Inline format: goal: consensus | 描述...
        const parts = val.split(/\s+|：/);
        draft.goal.type = parts[0];
        draft.goal.description = parts.slice(1).join(' ');
      }
      currentSection = 'goal';
      continue;
    }

    if (key === 'host') {
      draft.host = draft.host || {};
      if (val) {
        // Inline: host: 主持人 | 中立控场 | visible
        const parts = val.split(/\s*[|｜]\s*/);
        draft.host.name = parts[0] || '主持人';
        draft.host.style = parts[1] || '中立控场';
        draft.host.mode = parts[2] || 'visible';
      }
      currentSection = 'host';
      continue;
    }

    // Sub-keys of goal/host
    if (currentSection === 'goal') {
      if (!draft.goal) draft.goal = {};
      (draft.goal as any)[key] = parseValue(val);
      continue;
    }

    if (currentSection === 'host') {
      if (!draft.host) draft.host = {};
      (draft.host as any)[key] = parseValue(val);
      continue;
    }

    // Regular top-level key
    setDraftValue(draft, key, parseValue(val));
  }

  return draft;
}

function parseValue(v: string): any {
  if (v === 'true' || v === 'yes') return true;
  if (v === 'false' || v === 'no') return false;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  if (/^\[.*\]$/.test(v)) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v || '';
}

function parseKeyValues(text: string): any {
  const obj: any = {};
  // name: xxx, key: value, ...
  for (const part of text.split(/[,，]/)) {
    const m = part.match(/^\s*(\w[\w.]*)\s*[:：]\s*(.*)/);
    if (m) obj[m[1]] = parseValue(m[2].trim());
  }
  return obj;
}

function setDeep(obj: any, key: string, value: any): void {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function setDraftValue(draft: ScriptDraft, key: string, value: any): void {
  const map: Record<string, string> = {
    topic: 'topic', totalRounds: 'totalRounds', atmosphere: 'atmosphere',
    maxSpeechLength: 'maxSpeechLength', speakOrder: 'speakOrder',
    scoringEnabled: 'scoringEnabled', forbiddenTopics: 'forbiddenTopics',
  };
  if (map[key]) {
    (draft as any)[map[key]] = value;
  }
}
