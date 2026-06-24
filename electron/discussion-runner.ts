// ===== AI 圆桌模拟器 — Discussion Runner (Main Process) =====
// 多圆桌并发运行，每个 RoundTable.id 独立管理
// 所有类型和 prompt builder 内联，避免 tsconfig rootDir 冲突
// V3: 隐藏身份、私密 Prompt 通道、裁判主持人私密视角、每轮角色记忆更新 JSON

import { BrowserWindow } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import { callProviderLLM, decryptProvider, ProviderConfig, StoredProviderConfig } from './providers.js';
import { getDataDir, ensureDir, atomicWriteJson, loadIndex } from './data-store.js';

// ====================================================================
//  内联类型（精简版，与 src/lib/types.ts 同步）
// ====================================================================

type HostMode = 'visible' | 'invisible' | 'user';
type HostSecretAccess = 'public' | 'judge';
type SpeakOrder = 'sequential' | 'free' | 'host-assigned';
type GoalType = 'consensus' | 'decision' | 'analysis' | 'ranking' | 'debate' | 'creative' | 'custom';
type MsgType = 'opening' | 'speech' | 'summary' | 'followup' | 'final_summary' | 'result';
type SecretRole = 'normal' | 'fraudster' | 'detective' | 'observer';

interface InlineCharacterSecret {
  secretRole: SecretRole;
  publicGoal: string;
  privateGoal: string;
  knownSecrets: string[];
  isAlive: boolean;
  revealed: boolean;
}

interface InlineCharacterMemory {
  privateMemory: string[];
  publicMemory: string[];
  suspicionMap: Record<string, number>;
  strategyPlan: string;
}

interface InlineCharacter {
  id: string; name: string; role: string; persona: string;
  providerId: string; stance?: string; style?: string;
  motivation?: string; expertise?: string; relationship?: string;
  constraints?: string; teamId?: string; temperature?: number;
  secret?: InlineCharacterSecret;
  memory?: InlineCharacterMemory;
}

interface InlineHost {
  name: string; style: string; mode: HostMode;
  providerId?: string; temperature?: number;
  secretAccess?: HostSecretAccess;
}

interface InlineRules {
  roundCount: number; speakOrder: SpeakOrder; maxSpeechLength: number;
  requireResponse: boolean; allowConsecutiveSpeech: boolean;
  scoringEnabled: boolean; forbiddenTopics?: string[];
}

interface InlineGoal { type: GoalType; description: string; successCriteria?: string; }

interface InlineScenario { title: string; description: string; atmosphere?: string; }

interface InlineRuntimeControl {
  currentHostMode?: HostMode; userOverrideActive?: boolean;
  temporaryRules?: Partial<InlineRules>;
}

interface InlineRoundTable {
  id: string; topic: string; totalRounds: number;
  status: string; createdAt: number;
  scenario: InlineScenario; host: InlineHost;
  characters: InlineCharacter[]; rules: InlineRules;
  goal: InlineGoal; runtimeControl?: InlineRuntimeControl;
}

interface InlineMessage {
  id: string; roundTableId: string; round: number;
  characterId: string | 'host'; characterName: string;
  type: MsgType; content: string;
  error?: string; providerId?: string; timestamp: number;
}

interface MemoryUpdatePayload {
  privateMemoryAdd?: string[];
  publicMemoryAdd?: string[];
  suspicionMapDelta?: Record<string, number>;
  strategyPlan?: string;
}

// ====================================================================
//  内联 prompt builder（与 src/lib/prompts.ts 逻辑同步）
// ====================================================================

function safe(v: unknown, fb = '未指定'): string {
  if (v === undefined || v === null || v === '') return fb;
  return String(v);
}

function list(items?: string[]): string {
  const clean = (items || []).map((s) => String(s).trim()).filter(Boolean);
  return clean.length ? clean.map((s) => `- ${s}`).join('\n') : '无';
}

function defaultSecret(): InlineCharacterSecret {
  return {
    secretRole: 'normal',
    publicGoal: '参与公开讨论，判断其他角色的真实意图。',
    privateGoal: '',
    knownSecrets: [],
    isAlive: true,
    revealed: false,
  };
}

function defaultMemory(): InlineCharacterMemory {
  return {
    privateMemory: [],
    publicMemory: [],
    suspicionMap: {},
    strategyPlan: '',
  };
}

function normalizeCharacter(c: InlineCharacter): InlineCharacter {
  return {
    ...c,
    secret: { ...defaultSecret(), ...(c.secret || {}) },
    memory: { ...defaultMemory(), ...(c.memory || {}), suspicionMap: c.memory?.suspicionMap || {} },
  };
}

function normalizeRoundTable(rt: InlineRoundTable): void {
  rt.host = { ...rt.host, secretAccess: rt.host?.secretAccess || 'judge' };
  rt.characters = (rt.characters || []).map(normalizeCharacter);
}

function roleHint(c: InlineCharacter): string {
  const role = c.secret?.secretRole || 'normal';
  if (role === 'fraudster') return '你的隐藏身份是欺诈者。你可以误导、隐瞒、转移怀疑，但必须保持逻辑一致；不要直接暴露自己是欺诈者。';
  if (role === 'detective') return '你的隐藏身份是侦探。你应根据矛盾、措辞、发言变化和投票倾向推理可疑者；不要直接暴露自己的私密信息。';
  if (role === 'observer') return '你的隐藏身份是观察者。你应观察局势、记录矛盾、保持相对中立，并在关键时刻指出结构性问题。';
  return '你的隐藏身份是普通角色。你应根据公开信息寻找欺诈者或异常意图。';
}

function buildScenarioContext(rt: InlineRoundTable): string {
  const t = rt.scenario?.title || rt.topic || '未命名讨论';
  const d = rt.scenario?.description || '';
  const a = rt.scenario?.atmosphere || '';
  let ctx = `讨论主题：${t}`;
  if (d && d !== t) ctx += `\n背景：${d}`;
  if (a) ctx += `\n氛围：${a}`;
  return ctx;
}

function buildRulesContext(rt: InlineRoundTable): string {
  const r = rt.rules;
  const c = r?.roundCount ?? rt.totalRounds ?? 3;
  const ml = r?.maxSpeechLength ?? 300;
  const o = r?.speakOrder ?? 'sequential';
  const rp = r?.requireResponse ?? false;
  const fb = r?.forbiddenTopics;
  let ctx = c === 0 ? '轮数不限' : `共 ${c} 轮`;
  ctx += `，每轮发言不超过 ${ml} 字`;
  if (o === 'host-assigned') ctx += '，主持人指定发言顺序';
  else if (o === 'free') ctx += '，自由顺序发言';
  else ctx += '，依次发言';
  ctx += '。';
  if (rp) ctx += ' 每位必须回应前一位。';
  if (fb?.length) ctx += ` 严禁讨论：${fb.join('、')}。`;
  return ctx;
}

function buildGoalContext(rt: InlineRoundTable): string {
  const g = rt.goal;
  const d = g?.description || rt.topic || '';
  const t = g?.type || 'custom';
  const sc = g?.successCriteria || '';
  let ctx = '';
  if (d) ctx += `讨论目标（${t}）：${d}`;
  if (sc) ctx += `\n成功标准：${sc}`;
  return ctx;
}

function buildPublicGameContext(rt: InlineRoundTable): string {
  const rows = rt.characters.map((c) => {
    const alive = c.secret?.isAlive === false ? '已离场' : '在场';
    const revealed = c.secret?.revealed ? `已公开隐藏身份：${c.secret.secretRole}` : '隐藏身份：未公开';
    const publicGoal = c.secret?.publicGoal ? `公开目标：${c.secret.publicGoal}` : '';
    return `- ${c.name}（${c.role || '未指定身份'}，${alive}，${revealed}${publicGoal ? `，${publicGoal}` : ''}）`;
  }).join('\n');
  return `【公开信息】\n${buildScenarioContext(rt)}\n${buildGoalContext(rt)}\n\n公开角色列表：\n${rows || '无'}`;
}

function buildPrivateGameContext(c: InlineCharacter): string {
  const s = c.secret || defaultSecret();
  return `【私密信息，仅你可见，禁止直接向其他角色暴露】\n你的隐藏身份：${s.secretRole}\n你的公开目标：${safe(s.publicGoal, '参与公开讨论，判断其他角色的真实意图。')}\n你的私密目标：${safe(s.privateGoal)}\n你是否仍在场：${s.isAlive === false ? '否' : '是'}\n你的身份是否已公开：${s.revealed ? '是' : '否'}\n你知道的秘密：\n${list(s.knownSecrets)}\n\n${roleHint(c)}`;
}

function buildMemoryContext(c: InlineCharacter): string {
  const m = c.memory || defaultMemory();
  return `【你的记忆】\n私有记忆：\n${list(m.privateMemory)}\n\n公开记忆：\n${list(m.publicMemory)}\n\n你对其他角色的怀疑度：\n${JSON.stringify(m.suspicionMap || {}, null, 2)}\n\n当前策略：${safe(m.strategyPlan, '暂无')}`;
}

function buildJudgePrivateContext(rt: InlineRoundTable): string {
  const hostAccess = rt.host?.secretAccess || 'judge';
  if (hostAccess !== 'judge') return '';

  const rows = rt.characters.map((c) => {
    const s = c.secret || defaultSecret();
    const m = c.memory || defaultMemory();
    return `【${c.name}】\n公开身份：${c.role || '未指定'}\n隐藏身份：${s.secretRole}\n公开目标：${safe(s.publicGoal, '参与公开讨论，判断其他角色的真实意图。')}\n私密目标：${safe(s.privateGoal)}\n已知秘密：\n${list(s.knownSecrets)}\n状态：${s.isAlive === false ? '已离场' : '在场'} / ${s.revealed ? '身份已公开' : '身份未公开'}\n私有记忆：\n${list(m.privateMemory)}\n公开记忆：\n${list(m.publicMemory)}\n怀疑度：${JSON.stringify(m.suspicionMap || {})}\n策略：${safe(m.strategyPlan, '暂无')}`;
  }).join('\n\n');

  return `【裁判私密信息，仅主持人可见】\n你知道所有角色的隐藏身份、私密目标、已知秘密和当前记忆。\n你需要在每轮总结时：\n1. 根据发言判断谁更可疑\n2. 推动角色继续暴露矛盾\n3. 不直接公布未揭示的秘密身份和私密目标\n4. 如果需要投票、淘汰、胜负判断，可以用文本形式裁定\n5. 你的公开发言只能追问、总结、暗示和推动流程，不能直接泄露裁判私密信息\n\n${rows}`;
}

function buildCharPersona(c: InlineCharacter): string {
  const p: string[] = [];
  if (c.name) p.push(c.name);
  if (c.role) p.push(`身份：${c.role}`);
  if (c.persona?.trim()) { p.push(c.persona); }
  else {
    const s: string[] = [];
    if (c.stance) s.push(`立场：${c.stance}`);
    if (c.style) s.push(`风格：${c.style}`);
    if (s.length) p.push(s.join('，'));
  }
  if (c.motivation) p.push(`核心动机：${c.motivation}`);
  if (c.expertise) p.push(`擅长领域：${c.expertise}`);
  if (c.relationship) p.push(`人物关系：${c.relationship}`);
  if (c.constraints) p.push(`发言限制：${c.constraints}`);
  return p.join('\n');
}

function buildRecentMsgs(msgs: InlineMessage[], limit = 6): string {
  if (!msgs?.length) return '（尚无发言记录）';
  return msgs.slice(-limit).map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
}

function buildHostModeHint(rt: InlineRoundTable): string {
  const m = rt.host?.mode || 'visible';
  if (m === 'invisible') return '你作为隐性主持人，不输出用户可见的发言。你只在后台控制讨论流程。';
  if (m === 'user') return '注意：本场讨论由用户手动主持。';
  return '';
}

function buildSysPrompt(): string {
  return `你是一个 AI 圆桌讨论模拟系统。根据给定的场景、规则和目标，扮演多个角色进行结构化讨论。\n\n核心原则：\n1. 每次只扮演一个角色发言\n2. 严格遵循你的人设\n3. 发言必须有实质内容\n4. 参考前面角色的发言进行回应或辩论\n5. 禁止重复自己之前的观点\n6. 发言长度遵循规则指定的字数限制\n7. 始终围绕讨论目标推进\n8. 使用中文回答\n9. 私密信息只能影响策略，不能被直接泄露给不该知道的角色`;
}

function buildHostOpen(rt: InlineRoundTable): string {
  const mh = buildHostModeHint(rt);
  const sc = buildScenarioContext(rt);
  const ru = buildRulesContext(rt);
  const gl = buildGoalContext(rt);
  const publicGame = buildPublicGameContext(rt);
  const judge = buildJudgePrivateContext(rt);
  const cl = rt.characters.map((c, i) => `${i + 1}. ${buildCharPersona(c)}`).join('\n\n');
  return `你是主持人「${rt.host.name}」，风格：${safe(rt.host.style, '中立控场')}。\n${mh ? mh + '\n' : ''}\n${sc}\n${ru}\n${gl}\n\n${publicGame}\n\n参与角色：\n${cl}\n\n${judge ? judge + '\n\n' : ''}请致开场白：介绍场景、说明规则、陈述目标，然后请第一位角色开始发言。`;
}

function buildCharSpeech(rt: InlineRoundTable, c: InlineCharacter, round: number, msgs: InlineMessage[], hf?: string): string {
  const p = buildCharPersona(c);
  const rc = buildRecentMsgs(msgs, 6);
  const fu = hf ? `\n主持人追问：${hf}` : '';
  return `你现在扮演：\n\n${p}\n\n${buildPublicGameContext(rt)}\n\n${buildPrivateGameContext(c)}\n\n${buildMemoryContext(c)}\n\n当前第 ${round} 轮。${fu}\n\n近期公开发言：\n${rc}\n\n发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言，表示赞同、补充、质疑或反对\n3. 推进你的公开目标和私密目标\n4. 第一人称"我"\n5. 不重复自己之前的观点\n6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆\n7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致${c.constraints ? `\n8. 特别注意：${c.constraints}` : ''}`;
}

function buildMemoryUpdate(rt: InlineRoundTable, c: InlineCharacter, round: number, all: InlineMessage[]): string {
  const recent = buildRecentMsgs(all, 12);
  return `你是「${c.name}」的内部记忆更新器。你不会对外发言，只根据本轮公开发言更新该角色自己的记忆。\n\n${buildPublicGameContext(rt)}\n\n${buildPrivateGameContext(c)}\n\n${buildMemoryContext(c)}\n\n当前第 ${round} 轮。\n近期公开记录：\n${recent}\n\n请只输出 JSON，不要 markdown 代码块，不要解释：\n{\n  "privateMemoryAdd": ["只写该角色私下观察到、准备利用或需要记住的信息"],\n  "publicMemoryAdd": ["只写公开发生、所有人理论上可观察的信息"],\n  "suspicionMapDelta": {\n    "characterId": 0\n  },\n  "strategyPlan": "下一轮的具体策略，保持简短"\n}\n\n要求：\n1. privateMemoryAdd/publicMemoryAdd 每项不超过 40 字，最多各 3 条\n2. suspicionMapDelta 的 key 必须使用角色 id，value 是 -30 到 30 的数字\n3. 只更新「${c.name}」自己的记忆，不要替其他角色更新\n4. 如果没有变化，数组输出 []，suspicionMapDelta 输出 {}\n5. 必须是合法 JSON`;
}

function buildHostSum(rt: InlineRoundTable, round: number, msgs: InlineMessage[]): string {
  const rm = msgs.filter(m => m.round === round).map(m => `【${m.characterName}】\n${m.content}`).join('\n\n');
  const gl = buildGoalContext(rt);
  const cn = rt.characters.map(c => c.name).join('、');
  const judge = buildJudgePrivateContext(rt);
  return `你是主持人「${rt.host.name}」。\n第 ${round} 轮讨论结束。\n\n${gl}\n\n${judge ? judge + '\n\n' : ''}本轮发言：\n${rm}\n\n请：\n1. 总结每位角色的核心观点\n2. 指出共识和分歧\n3. 根据发言判断谁更可疑，但不要直接泄露未公开秘密\n4. 推动角色继续暴露矛盾\n5. 如果需要投票、淘汰、胜负判断，可以用文本形式裁定\n6. 引出下一轮方向（角色：${cn}）\n\n控制在 200-350 字。保持中立控场，但要有裁判意识。`;
}

function buildHostFinal(rt: InlineRoundTable, all: InlineMessage[]): string {
  const rec = all.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  const cs = rt.characters.map(c => `${c.name}（${c.role}）—— ${safe(c.stance, '未指定立场')}`).join('\n');
  const gl = buildGoalContext(rt);
  const sc = buildScenarioContext(rt);
  const judge = buildJudgePrivateContext(rt);
  return `你是主持人「${rt.host.name}」。\n整场讨论结束。\n\n${sc}\n${gl}\n\n角色：\n${cs}\n\n${judge ? judge + '\n\n' : ''}完整记录：\n${rec}\n\n请撰写总结陈词：\n1. 主题回顾\n2. 每位角色主要观点\n3. 可疑点与矛盾链条\n4. 如果存在欺诈者/隐藏阵营，给出裁判式判断，但不要编造代码里不存在的硬结算\n5. 达成的共识\n6. 仍存分歧\n7. 后续方向\n\n控制在 400-700 字。`;
}

function buildResultPrompt(rt: InlineRoundTable, all: InlineMessage[]): string {
  const rec = all.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  const gl = buildGoalContext(rt);
  const judge = buildJudgePrivateContext(rt);
  return `基于以下完整讨论记录，请生成结构化结果。\n\n${gl}\n\n${judge ? judge + '\n\n' : ''}讨论记录：\n${rec}\n\n请以 JSON 格式输出（不要 markdown 代码块包裹）：\n\n{\n  "conclusion": "最终结论（一段话）",\n  "consensusPoints": ["共识1", "共识2"],\n  "disagreementPoints": ["分歧1", "分歧2"],\n  "goalAchieved": "yes|partial|no",\n  "recommendations": ["建议1", "建议2"]\n}`;
}

// ====================================================================
//  记忆更新解析 / 合并
// ====================================================================

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cleanShortList(v: unknown, limit: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((x) => x.slice(0, 80));
}

function uniqueAppend(base: string[], add: string[], cap = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...base, ...add]) {
    const clean = String(item || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.slice(-cap);
}

function parseJsonPayload(text: string): MemoryUpdatePayload | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const withoutFence = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as MemoryUpdatePayload;
  } catch {
    return null;
  }
}

function mergeMemoryUpdate(c: InlineCharacter, payload: MemoryUpdatePayload | null): void {
  if (!payload) return;
  const current = c.memory || defaultMemory();
  const privateAdd = cleanShortList(payload.privateMemoryAdd, 3);
  const publicAdd = cleanShortList(payload.publicMemoryAdd, 3);

  const suspicion = { ...(current.suspicionMap || {}) };
  const delta = payload.suspicionMapDelta || {};
  for (const [id, value] of Object.entries(delta)) {
    if (!id || id === c.id) continue;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) continue;
    suspicion[id] = clamp((suspicion[id] || 0) + clamp(n, -30, 30), 0, 100);
  }

  c.memory = {
    privateMemory: uniqueAppend(current.privateMemory || [], privateAdd),
    publicMemory: uniqueAppend(current.publicMemory || [], publicAdd),
    suspicionMap: suspicion,
    strategyPlan: typeof payload.strategyPlan === 'string' && payload.strategyPlan.trim()
      ? payload.strategyPlan.trim().slice(0, 240)
      : current.strategyPlan || '',
  };
}

// ====================================================================
//  运行时
// ====================================================================

const store = new Store();
const PROVIDER_PREFIX = 'provider:';
const sessions = new Map<string, AbortController>();
const pendingHostInputs = new Map<string, (content: string) => void>();
const pausedSessions = new Map<string, () => void>();

export function injectUserHostInput(roundTableId: string, content: string): boolean {
  const resolve = pendingHostInputs.get(roundTableId);
  if (resolve) { resolve(content); pendingHostInputs.delete(roundTableId); return true; }
  return false;
}

export function pauseDiscussion(id: string): void {
  if (sessions.has(id) && !pausedSessions.has(id)) {
    pausedSessions.set(id, null as any);
  }
}

export function resumeDiscussion(id: string): void {
  const resolve = pausedSessions.get(id);
  if (resolve) resolve();
  pausedSessions.delete(id);
}

function genId(): string { return crypto.randomUUID(); }

function buildMsg(
  rtId: string, rnd: number, charId: string | 'host', charName: string,
  type: MsgType, content: string, opts?: { error?: string; provId?: string }
): InlineMessage {
  return { id: genId(), roundTableId: rtId, round: rnd, characterId: charId,
    characterName: charName, type, content, error: opts?.error,
    providerId: opts?.provId, timestamp: Date.now() };
}

function resolveProvider(providerId?: string): ProviderConfig | undefined {
  const allKeys = Object.keys(store.store).filter((k) => k.startsWith(PROVIDER_PREFIX));
  if (providerId) {
    const raw = store.get(`${PROVIDER_PREFIX}${providerId}`);
    if (typeof raw === 'string') {
      try { return decryptProvider(JSON.parse(raw) as StoredProviderConfig); } catch { /* */ }
    }
  }
  for (const key of allKeys) {
    const raw = store.get(key);
    if (typeof raw === 'string') {
      try { return decryptProvider(JSON.parse(raw) as StoredProviderConfig); } catch { /* */ }
    }
  }
  return undefined;
}

async function callLlm(sys: string, user: string, sig?: AbortSignal, provId?: string, temp?: number): Promise<{ content?: string; error?: string }> {
  if (sig?.aborted) return { error: '生成已中止' };
  try {
    const p = resolveProvider(provId);
    if (!p) return { content: '', error: '未配置 LLM 厂商' };
    const r = await callProviderLLM(p, [{ role: 'system', content: sys }, { role: 'user', content: user }], temp);
    if (sig?.aborted) return { error: '生成已中止' };
    return r.content ? { content: r.content } : { error: r.error || 'LLM 调用返回空' };
  } catch (e: any) {
    if (sig?.aborted) return { error: '生成已中止' };
    return { error: e.message || 'LLM 调用异常' };
  }
}

function send(ch: string, ...args: unknown[]): void {
  const win = BrowserWindow.getFocusedWindow();
  if (win && !win.isDestroyed()) win.webContents.send(ch, ...args);
}

export async function startDiscussion(rt: InlineRoundTable): Promise<void> {
  normalizeRoundTable(rt);
  const ctrl = new AbortController();
  sessions.set(rt.id, ctrl);
  const sig = ctrl.signal;
  const all: InlineMessage[] = [];
  const sys = buildSysPrompt();
  const invisible = rt.host?.mode === 'invisible';

  rt.status = 'discussing';

  const tryCall = async (nm: string, s: string, u: string, provId?: string, temp?: number): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig, provId, temp);
    if (r.content || r.error === '生成已中止') return r;
    return { content: '', error: r.error || '生成失败' };
  };

  const updateMemoryAfterSpeech = async (ch: InlineCharacter, round: number): Promise<void> => {
    if (sig?.aborted) throw new Error('生成已中止');
    const prompt = buildMemoryUpdate(rt, ch, round, all);
    const r = await tryCall(`${ch.name}（记忆更新）`, sys, prompt, ch.providerId, 0.2);
    if (r.content) mergeMemoryUpdate(ch, parseJsonPayload(r.content));
  };

  try {
    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostOpen(rt), rt.host.providerId, rt.host.temperature);
      const m = buildMsg(rt.id, 1, 'host', rt.host.name, 'opening', r.content || `（主持人开场失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    // User host mode: wait for opening statement before starting rounds
    if (rt.host?.mode === 'user') {
      send('discuss:awaiting-host-input', { roundTableId: rt.id, round: 0, phase: 'opening' });
      const userOpening = await new Promise<string>((resolve) => {
        pendingHostInputs.set(rt.id, resolve);
      });
      if (sig?.aborted) throw new Error('生成已中止');
      const openingMsg = buildMsg(rt.id, 0, 'host', rt.host.name, 'opening', userOpening);
      all.push(openingMsg); send('discuss:message', openingMsg);
    }

    const cap = rt.totalRounds === 0 ? 999 : rt.totalRounds;
    let round = 1;
    while (round <= cap) {
      if (sig?.aborted) throw new Error('生成已中止');
      for (const ch of rt.characters) {
        if (sig?.aborted) throw new Error('生成已中止');
        if (ch.secret?.isAlive === false) continue;
        // Pause check: wait while paused
        while (pausedSessions.has(rt.id)) {
          send('discuss:paused', { roundTableId: rt.id, round });
          await new Promise<void>((resolve) => {
            if (sig?.aborted) { resolve(); return; }
            pausedSessions.set(rt.id, resolve);
          });
          if (sig?.aborted) throw new Error('生成已中止');
        }
        send('discuss:character-start', ch.name);
        const r = await tryCall(ch.name, sys, buildCharSpeech(rt, ch, round, all), ch.providerId, ch.temperature);
        const ct = r.content || (r.error ? `（${ch.name} 生成失败: ${r.error}）` : `（${ch.name} 未能生成发言）`);
        const m = buildMsg(rt.id, round, ch.id, ch.name, 'speech', ct, { error: r.error, provId: ch.providerId });
        all.push(m); send('discuss:message', m);
        if (!r.error && ct.trim()) await updateMemoryAfterSpeech(ch, round);
      }
      if (round < cap) {
        if (sig?.aborted) throw new Error('生成已中止');
        if (rt.host?.mode === 'user') {
          // User host mode: wait for user input
          send('discuss:awaiting-host-input', { roundTableId: rt.id, round });
          const userInput = await new Promise<string>((resolve) => {
            pendingHostInputs.set(rt.id, resolve);
          });
          if (sig?.aborted) throw new Error('生成已中止');
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', userInput);
          all.push(m); send('discuss:message', m);
        } else if (!invisible) {
          // AI visible host
          send('discuss:character-start', rt.host.name);
          const r = await tryCall(rt.host.name, sys, buildHostSum(rt, round, all), rt.host.providerId, rt.host.temperature);
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', r.content || `（小结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
          all.push(m); send('discuss:message', m);
        }
        // invisible: no summary generated
      }
      round++;
    }

    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible && rt.host?.mode !== 'user') {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostFinal(rt, all), rt.host.providerId, rt.host.temperature);
      const m = buildMsg(rt.id, round - 1, 'host', rt.host.name, 'final_summary', r.content || `（总结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    if (sig?.aborted) throw new Error('生成已中止');
    send('discuss:character-start', `${rt.host.name}（总结）`);
    const rp = await tryCall(rt.host.name, sys, buildResultPrompt(rt, all), rt.host.providerId, rt.host.temperature);
    const rm = buildMsg(rt.id, round - 1, 'host', rt.host.name, 'result', rp.content || '', { error: rp.error });
    all.push(rm); send('discuss:message', rm);

    sessions.delete(rt.id);
    saveDiscussion(rt, all);
    send('discuss:complete', { roundTableId: rt.id, messages: all });

  } catch (e: any) {
    sessions.delete(rt.id);
    try { saveDiscussion(rt, all); } catch { /* save best-effort */ }
    if (e.message === '生成已中止') {
      send('discuss:complete', { roundTableId: rt.id, messages: all });
    } else {
      send('discuss:error', { roundTableId: rt.id, error: e.message });
    }
  }
}

function saveDiscussion(rt: InlineRoundTable, all: InlineMessage[]): void {
  const dataDir = getDataDir();
  ensureDir(dataDir);
  const index = loadIndex(dataDir);
  const filename = index[rt.id];
  if (!filename) return;
  rt.status = 'completed';
  atomicWriteJson(path.join(dataDir, `${filename}.json`), rt);
  atomicWriteJson(path.join(dataDir, `${filename}_messages.json`), all);
}

export function stopDiscussion(id: string): void {
  const c = sessions.get(id);
  if (c) { c.abort(); sessions.delete(id); }
}
