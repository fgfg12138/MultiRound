// ===== AI 圆桌模拟器 — 剧本文件解析器 =====
// 解析 Markdown 文件中的 YAML front matter（--- 包裹部分）
// 输出可填充 Create 表单的 Draft 对象

export interface ScriptDraft {
  topic?: string;
  totalRounds?: number;
  atmosphere?: string;
  maxSpeechLength?: number;
  speakOrder?: string;
  scoringEnabled?: boolean;
  forbiddenTopics?: string[];
  goal?: { type?: string; description?: string; successCriteria?: string };
  host?: { name?: string; style?: string; mode?: string; providerId?: string; model?: string };
  characters?: {
    name: string; role?: string; persona?: string; providerId?: string; model?: string;
    stance?: string; style?: string;
    motivation?: string; expertise?: string;
    relationship?: string; constraints?: string;
    teamId?: string;
    secret?: { secretRole?: string; publicGoal?: string; privateGoal?: string };
    memory?: { privateMemory?: string[]; publicMemory?: string[]; strategyPlan?: string };
  }[];
  gameMode?: string;
  modules?: Record<string, boolean>;
  witchPotions?: { heal?: boolean; poison?: boolean };
  teams?: { name?: string; color?: string }[];
}

export function parseScript(text: string): ScriptDraft | null {
  if (!text) return null;
  const fmMatch = text.match(/---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  return parseYamlBlock(fmMatch[1]);
}

function parseYamlBlock(yaml: string): ScriptDraft {
  const draft: ScriptDraft = {};
  const chars: any[] = [];
  const teams: any[] = [];
  let goalObj: any = null;
  let hostObj: any = null;
  let currentSection: string | null = null;
  let currentObj: any = null;

  const lines = yaml.split('\n');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.trim().startsWith('#')) continue;

    // Section transitions (highest priority)
    if (/^\s*characters:/i.test(line)) { currentSection = 'characters'; currentObj = null; continue; }
    if (/^\s*teams:/i.test(line)) { currentSection = 'teams'; currentObj = null; continue; }
    if (/^\s*goal:/i.test(line)) { currentSection = 'goal'; goalObj = {}; currentObj = null; continue; }
    if (/^\s*host:/i.test(line)) { currentSection = 'host'; hostObj = {}; currentObj = null; continue; }
    if (/^\s*secret:/i.test(line) && currentSection === 'characters' && currentObj) { currentSection = 'secret'; continue; }
    if (/^\s*memory:/i.test(line) && currentSection === 'characters' && currentObj) { currentSection = 'memory'; continue; }

    // Array items (for characters/teams)
    if (/^\s*-\s/.test(line) && (currentSection === 'characters' || currentSection === 'teams')) {
      const rest = line.replace(/^\s*-\s+/, '');
      currentObj = {};
      for (const part of rest.split(/[,，]/)) {
        const m = part.match(/^\s*([\w.]+)\s*[:：]\s*(.*)/);
        if (m) currentObj[m[1]] = m[2].trim() || '';
      }
      if (currentSection === 'characters') chars.push(currentObj);
      else teams.push(currentObj);
      continue;
    }

    // Key-value parsing
    const kv = line.match(/^\s*([\w.]+)\s*:\s*(.*)/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();

    // Characters/teams nested keys
    if ((currentSection === 'characters' || currentSection === 'teams') && currentObj) {
      currentObj[key] = val;
      continue;
    }

    // Secret/memory nested within characters
    if (currentSection === 'secret' && currentObj) {
      if (!currentObj.secret) currentObj.secret = {};
      currentObj.secret[key] = val;
      continue;
    }
    if (currentSection === 'memory' && currentObj) {
      if (!currentObj.memory) currentObj.memory = {};
      currentObj.memory[key] = val;
      continue;
    }

    // Goal sub-keys
    if (currentSection === 'goal' && goalObj) {
      goalObj[key] = val;
      continue;
    }

    // Host sub-keys
    if (currentSection === 'host' && hostObj) {
      hostObj[key] = val;
      continue;
    }

    // Modules sub-keys
    if (currentSection === 'modules') {
      if (!draft.modules) draft.modules = {};
      draft.modules[key] = val === 'true';
      continue;
    }
    // WitchPotions sub-keys
    if (currentSection === 'witchPotions') {
      if (!draft.witchPotions) draft.witchPotions = {};
      if (key === 'heal' || key === 'poison') draft.witchPotions[key] = val === 'true';
      continue;
    }

    // Top-level keys
    if (key === 'topic') draft.topic = val;
    else if (key === 'totalRounds') draft.totalRounds = parseInt(val) || 0;
    else if (key === 'atmosphere') draft.atmosphere = val;
    else if (key === 'maxSpeechLength') draft.maxSpeechLength = parseInt(val) || 300;
    else if (key === 'speakOrder') draft.speakOrder = val;
    else if (key === 'scoringEnabled') draft.scoringEnabled = val === 'true';
    else if (key === 'gameMode') draft.gameMode = val;
    else if (key === 'forbiddenTopics') draft.forbiddenTopics = val.split('\n').filter(Boolean);
  }

  if (goalObj && Object.keys(goalObj).length > 0) draft.goal = goalObj;
  if (hostObj && Object.keys(hostObj).length > 0) draft.host = hostObj;
  if (chars.length > 0) draft.characters = chars;
  if (teams.length > 0) draft.teams = teams;
  return draft;
}
