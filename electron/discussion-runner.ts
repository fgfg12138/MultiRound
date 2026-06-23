// ===== AI 圆桌模拟器 — Discussion Runner (Main Process) =====
// 多圆桌并发运行，每个 RoundTable.id 独立管理
// 所有类型和 prompt builder 内联，避免 tsconfig rootDir 冲突

import { BrowserWindow } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import { callProviderLLM, decryptProvider, ProviderConfig, StoredProviderConfig } from './providers.js';
import { getDataDir, ensureDir, atomicWriteJson, loadIndex, saveIndex } from './data-store.js';

// ====================================================================
//  内联类型（精简版，与 src/lib/types.ts 同步）
// ====================================================================

type HostMode = 'visible' | 'invisible' | 'user';
type SpeakOrder = 'sequential' | 'free' | 'host-assigned';
type GoalType = 'consensus' | 'decision' | 'analysis' | 'ranking' | 'debate' | 'creative' | 'custom';
type MsgType = 'opening' | 'speech' | 'summary' | 'followup' | 'final_summary' | 'result';

interface InlineCharacter {
  id: string; name: string; role: string; persona: string;
  providerId: string; stance?: string; style?: string;
  motivation?: string; expertise?: string; relationship?: string;
  constraints?: string; teamId?: string;
}

interface InlineHost {
  name: string; style: string; mode: HostMode;
  providerId?: string;
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

// ====================================================================
//  内联 prompt builder（与 src/lib/prompts.ts 逻辑同步）
// ====================================================================

function safe(v: unknown, fb = '未指定'): string {
  if (v === undefined || v === null || v === '') return fb;
  return String(v);
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
  return `你是一个 AI 圆桌讨论模拟系统。根据给定的场景、规则和目标，扮演多个角色进行结构化讨论。\n\n核心原则：\n1. 每次只扮演一个角色发言\n2. 严格遵循你的人设\n3. 发言必须有实质内容\n4. 参考前面角色的发言进行回应或辩论\n5. 禁止重复自己之前的观点\n6. 发言长度遵循规则指定的字数限制\n7. 始终围绕讨论目标推进\n8. 使用中文回答`;
}

function buildHostOpen(rt: InlineRoundTable): string {
  const mh = buildHostModeHint(rt);
  const sc = buildScenarioContext(rt);
  const ru = buildRulesContext(rt);
  const gl = buildGoalContext(rt);
  const cl = rt.characters.map((c, i) => `${i + 1}. ${buildCharPersona(c)}`).join('\n\n');
  return `你是主持人「${rt.host.name}」，风格：${safe(rt.host.style, '中立控场')}。\n${mh ? mh + '\n' : ''}\n${sc}\n${ru}\n${gl}\n\n参与角色：\n${cl}\n\n请致开场白：介绍场景、说明规则、陈述目标，然后请第一位角色开始发言。`;
}

function buildCharSpeech(topic: string, c: InlineCharacter, round: number, msgs: InlineMessage[], hf?: string): string {
  const p = buildCharPersona(c);
  const rc = buildRecentMsgs(msgs, 6);
  const fu = hf ? `\n主持人追问：${hf}` : '';
  return `你现在扮演：\n\n${p}\n\n当前第 ${round} 轮。\n讨论主题：${topic}${fu}\n\n近期发言：\n${rc}\n\n发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言\n3. 提出有实质内容的新观点\n4. 第一人称"我"\n5. 不重复自己之前的观点${c.constraints ? `\n6. 特别注意：${c.constraints}` : ''}`;
}

function buildHostSum(rt: InlineRoundTable, round: number, msgs: InlineMessage[]): string {
  const rm = msgs.filter(m => m.round === round).map(m => `【${m.characterName}】\n${m.content}`).join('\n\n');
  const gl = buildGoalContext(rt);
  const cn = rt.characters.map(c => c.name).join('、');
  return `你是主持人「${rt.host.name}」。\n第 ${round} 轮讨论结束。\n\n${gl}\n\n本轮发言：\n${rm}\n\n请：\n1. 总结每位角色的核心观点\n2. 指出共识和分歧\n3. 对照目标，评估本轮推进了哪些\n4. 对模糊观点提出追问\n5. 引出下一轮方向（角色：${cn}）\n\n控制在 200-350 字。保持中立控场。`;
}

function buildHostFinal(rt: InlineRoundTable, all: InlineMessage[]): string {
  const rec = all.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  const cs = rt.characters.map(c => `${c.name}（${c.role}）—— ${safe(c.stance, '未指定立场')}`).join('\n');
  const gl = buildGoalContext(rt);
  const sc = buildScenarioContext(rt);
  return `你是主持人「${rt.host.name}」。\n整场讨论结束。\n\n${sc}\n${gl}\n\n角色：\n${cs}\n\n完整记录：\n${rec}\n\n请撰写总结陈词：\n1. 主题回顾\n2. 每位角色主要观点\n3. 达成的共识\n4. 仍存分歧\n5. 后续方向\n6. 感谢参与者\n\n控制在 400-600 字。`;
}

function buildResultPrompt(rt: InlineRoundTable, all: InlineMessage[]): string {
  const rec = all.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  const gl = buildGoalContext(rt);
  return `基于以下完整讨论记录，请生成结构化结果。\n\n${gl}\n\n讨论记录：\n${rec}\n\n请以 JSON 格式输出（不要 markdown 代码块包裹）：\n\n{\n  "conclusion": "最终结论（一段话）",\n  "consensusPoints": ["共识1", "共识2"],\n  "disagreementPoints": ["分歧1", "分歧2"],\n  "goalAchieved": "yes|partial|no",\n  "recommendations": ["建议1", "建议2"]\n}`;
}

// ====================================================================
//  运行时
// ====================================================================

const store = new Store();
const PROVIDER_PREFIX = 'provider:';
const sessions = new Map<string, AbortController>();

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

async function callLlm(sys: string, user: string, sig?: AbortSignal, provId?: string): Promise<{ content?: string; error?: string }> {
  if (sig?.aborted) return { error: '生成已中止' };
  try {
    const p = resolveProvider(provId);
    if (!p) return { content: '', error: '未配置 LLM 厂商' };
    const r = await callProviderLLM(p, [{ role: 'system', content: sys }, { role: 'user', content: user }]);
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
  const ctrl = new AbortController();
  sessions.set(rt.id, ctrl);
  const sig = ctrl.signal;
  const all: InlineMessage[] = [];
  const sys = buildSysPrompt();
  const invisible = rt.host?.mode === 'invisible';

  rt.status = 'discussing';

  const tryCall = async (nm: string, s: string, u: string): Promise<{ content?: string; error?: string }> => {
    const r = await callLlm(s, u, sig);
    if (r.content || r.error === '生成已中止') return r;
    return { content: '', error: r.error || '生成失败' };
  };

  try {
    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible) {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostOpen(rt));
      const m = buildMsg(rt.id, 1, 'host', rt.host.name, 'opening', r.content || `（主持人开场失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    const cap = rt.totalRounds === 0 ? 999 : rt.totalRounds;
    let round = 1;
    while (round <= cap) {
      if (sig?.aborted) throw new Error('生成已中止');
      for (const ch of rt.characters) {
        if (sig?.aborted) throw new Error('生成已中止');
        send('discuss:character-start', ch.name);
        const r = await tryCall(ch.name, sys, buildCharSpeech(rt.topic, ch, round, all));
        const ct = r.content || (r.error ? `（${ch.name} 生成失败: ${r.error}）` : `（${ch.name} 未能生成发言）`);
        const m = buildMsg(rt.id, round, ch.id, ch.name, 'speech', ct, { error: r.error, provId: ch.providerId });
        all.push(m); send('discuss:message', m);
      }
      if (round < cap) {
        if (sig?.aborted) throw new Error('生成已中止');
        if (!invisible) {
          send('discuss:character-start', rt.host.name);
          const r = await tryCall(rt.host.name, sys, buildHostSum(rt, round, all));
          const m = buildMsg(rt.id, round, 'host', rt.host.name, 'summary', r.content || `（小结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
          all.push(m); send('discuss:message', m);
        }
      }
      round++;
    }

    if (sig?.aborted) throw new Error('生成已中止');
    if (!invisible) {
      send('discuss:character-start', rt.host.name);
      const r = await tryCall(rt.host.name, sys, buildHostFinal(rt, all));
      const m = buildMsg(rt.id, round - 1, 'host', rt.host.name, 'final_summary', r.content || `（总结生成失败${r.error ? ': ' + r.error : ''}）`, { error: r.error });
      all.push(m); send('discuss:message', m);
    }

    if (sig?.aborted) throw new Error('生成已中止');
    send('discuss:character-start', `${rt.host.name}（总结）`);
    const rp = await tryCall(rt.host.name, sys, buildResultPrompt(rt, all));
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
