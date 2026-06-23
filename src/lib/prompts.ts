// ===== AI 圆桌模拟器 — Prompt Templates =====
// Phase 13+14: 分层重构 + V2 注入 + 结构性输出
// 主持人函数签名改为 (rt: RoundTable)，引擎层同步更新

import type { Character, Message, RoundTable } from './types';

// ====================================================================
//  内部工具
// ====================================================================

function safe(v: unknown, fallback = '未指定'): string {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v);
}

// ====================================================================
//  分层上下文构建函数
// ====================================================================

/** 场景上下文：scenario.title/description/atmosphere → topic fallback */
export function buildScenarioContext(rt: RoundTable): string {
  const title = rt.scenario?.title || rt.topic || '未命名讨论';
  const desc = rt.scenario?.description || '';
  const atmos = rt.scenario?.atmosphere || '';
  let ctx = `讨论主题：${title}`;
  if (desc && desc !== title) ctx += `\n背景：${desc}`;
  if (atmos) ctx += `\n氛围：${atmos}`;
  return ctx;
}

/** 规则上下文：rules + temporaryRules 覆盖 → totalRounds fallback */
export function buildRulesContext(rt: RoundTable): string {
  const r = rt.rules;
  const count = r?.roundCount ?? rt.totalRounds ?? 3;
  const maxLen = r?.maxSpeechLength ?? 300;
  const order = r?.speakOrder ?? 'sequential';
  const resp = r?.requireResponse ?? false;
  const forbidden = r?.forbiddenTopics;
  let ctx = count === 0 ? '轮数不限' : `共 ${count} 轮`;
  ctx += `，每轮发言不超过 ${maxLen} 字`;
  if (order === 'host-assigned') ctx += '，主持人指定发言顺序';
  else if (order === 'free') ctx += '，自由顺序发言';
  else ctx += '，依次发言';
  ctx += '。';
  if (resp) ctx += ' 每位必须回应前一位。';
  if (forbidden?.length) ctx += ` 严禁讨论：${forbidden.join('、')}。`;
  // temporaryRules 覆盖
  const tmp = rt.runtimeControl?.temporaryRules;
  if (tmp) {
    if (tmp.maxSpeechLength) ctx += ` 注意：本轮临时字数上限调整为 ${tmp.maxSpeechLength} 字。`;
    if (tmp.speakOrder) ctx += ` 注意：本轮发言顺序临时改为 ${tmp.speakOrder}。`;
  }
  return ctx;
}

/** 目标上下文：goal → topic fallback */
export function buildGoalContext(rt: RoundTable): string {
  const g = rt.goal;
  const desc = g?.description || rt.topic || '';
  const type = g?.type || 'custom';
  const criteria = g?.successCriteria || '';
  let ctx = '';
  if (desc) ctx += `讨论目标（${type}）：${desc}`;
  if (criteria) ctx += `\n成功标准：${criteria}`;
  return ctx;
}

/** 角色人设上下文：persona 优先 → role+stance+style 合成 → 高级字段补全 */
export function buildCharacterPersonaContext(c: Character): string {
  const parts: string[] = [];
  if (c.name) parts.push(c.name);
  if (c.role) parts.push(`身份：${c.role}`);

  if (c.persona && c.persona.trim()) {
    parts.push(c.persona);
  } else {
    const syn: string[] = [];
    if (c.stance) syn.push(`立场：${c.stance}`);
    if (c.style) syn.push(`风格：${c.style}`);
    if (syn.length) parts.push(syn.join('，'));
  }

  if (c.motivation) parts.push(`核心动机：${c.motivation}`);
  if (c.expertise) parts.push(`擅长领域：${c.expertise}`);
  if (c.relationship) parts.push(`人物关系：${c.relationship}`);
  if (c.constraints) parts.push(`发言限制：${c.constraints}`);

  return parts.join('\n');
}

/** 近期发言上下文 */
export function buildRecentContext(msgs: Message[], limit = 6): string {
  if (!msgs?.length) return '（尚无发言记录）';
  return msgs
    .slice(-limit)
    .map((m) => `【${m.characterName} 第${m.round}轮】\n${m.content}`)
    .join('\n\n');
}

/** 主持人模式提示 */
function buildHostModeHint(rt: RoundTable): string {
  const mode = rt.host?.mode || 'visible';
  if (mode === 'invisible') {
    return '你作为隐性主持人，不输出用户可见的发言。你只在后台控制讨论流程、检查目标进度、准备下一轮启动指令。';
  }
  if (mode === 'user') {
    return '注意：本场讨论由用户手动主持。用户可能随时插入追问或指令。请根据用户的输入灵活调整。';
  }
  return '';
}

// ====================================================================
//  导出函数
// ====================================================================

/** 系统 Prompt：通用规则 */
export function buildSystemPrompt(): string {
  return `你是一个 AI 圆桌讨论模拟系统。根据给定的场景、规则和目标，扮演多个角色进行结构化讨论。

核心原则：
1. 每次只扮演一个角色发言
2. 严格遵循你的人设（persona）：身份、立场、性格、说话方式
3. 发言必须有实质内容，避免空洞套话
4. 参考前面角色的发言进行回应或辩论
5. 禁止重复自己之前的观点
6. 发言长度遵循规则指定的字数限制
7. 始终围绕讨论目标推进，不要离题
8. 使用中文回答`;
}

/** 主持人开场 Prompt。新签名 (rt: RoundTable) */
export function buildHostOpeningPrompt(rt: RoundTable): string {
  const modeHint = buildHostModeHint(rt);
  const scenario = buildScenarioContext(rt);
  const rules = buildRulesContext(rt);
  const goal = buildGoalContext(rt);
  const charList = rt.characters
    .map((c, i) => `${i + 1}. ${buildCharacterPersonaContext(c)}`)
    .join('\n\n');

  return `你是主持人「${rt.host.name}」，风格：${safe(rt.host.style, '中立控场')}。
${modeHint ? modeHint + '\n' : ''}
${scenario}
${rules}
${goal}

参与角色：
${charList}

请致开场白：介绍场景、说明规则、陈述目标，然后请第一位角色开始发言。
格式：先开场，再点名第一位角色。${rt.host?.mode === 'invisible' ? '\n注意：你作为隐性主持人，不要输出用户可见的开场白，仅输出"讨论开始"作为信号。' : ''}`;
}

/** 角色发言 Prompt。签名不变。 */
export function buildCharacterSpeechPrompt(
  topic: string,
  character: Character,
  round: number,
  previousMessages: Message[],
  hostFollowup?: string
): string {
  const persona = buildCharacterPersonaContext(character);
  const recent = buildRecentContext(previousMessages, 6);
  const followup = hostFollowup ? `\n主持人追问：${hostFollowup}` : '';

  return `你现在扮演：

${persona}

当前第 ${round} 轮。
讨论主题：${topic}
${followup}

近期发言：
${recent}

发言要求：
1. 以角色的身份和性格说话
2. 参考前面发言，表示赞同、补充或反对
3. 提出有实质内容的新观点
4. 第一人称"我"
5. 不重复自己之前的观点
${character.constraints ? `6. 特别注意：${character.constraints}` : ''}`;
}

/** 主持人单轮小结 Prompt。新签名 (rt, round, messages) */
export function buildHostSummaryPrompt(rt: RoundTable, round: number, messages: Message[]): string {
  const roundMsgs = messages
    .filter((m) => m.round === round)
    .map((m) => `【${m.characterName}】\n${m.content}`)
    .join('\n\n');
  const goalCtx = buildGoalContext(rt);
  const charNames = rt.characters.map((c) => c.name).join('、');

  return `你是主持人「${rt.host.name}」。
第 ${round} 轮讨论结束。

${goalCtx}

本轮发言：
${roundMsgs}

请：
1. 总结每位角色的核心观点
2. 指出共识和分歧
3. 对照目标，评估本轮推进了哪些
4. 对模糊观点提出追问
5. 引出下一轮方向（角色：${charNames}）

控制在 200-350 字。保持中立控场。`;
}

/** 主持人最终总结 Prompt。新签名 (rt, allMessages) */
export function buildHostFinalSummaryPrompt(rt: RoundTable, allMessages: Message[]): string {
  const records = allMessages
    .map((m) => `【${m.characterName} 第${m.round}轮】\n${m.content}`)
    .join('\n\n');
  const charSummary = rt.characters
    .map((c) => `${c.name}（${c.role}）—— ${safe(c.stance, '未指定立场')}`)
    .join('\n');
  const goalCtx = buildGoalContext(rt);
  const scenario = buildScenarioContext(rt);

  return `你是主持人「${rt.host.name}」。
整场讨论结束。

${scenario}
${goalCtx}

角色：
${charSummary}

完整记录：
${records}

请撰写总结陈词：
1. 主题回顾
2. 每位角色主要观点
3. 达成的共识
4. 仍存分歧
5. 后续方向
6. 感谢参与者

控制在 400-600 字。有深度，有洞见。`;
}

/** 结构化结果 Prompt。新函数，所有模式均生成。 */
export function buildStructuredResultPrompt(rt: RoundTable, allMessages: Message[]): string {
  const records = allMessages
    .map((m) => `【${m.characterName} 第${m.round}轮】\n${m.content}`)
    .join('\n\n');
  const goalCtx = buildGoalContext(rt);

  return `基于以下完整讨论记录，请生成结构化结果。

${goalCtx}

讨论记录：
${records}

请以 JSON 格式输出（不要 markdown 代码块包裹）：

{
  "conclusion": "最终结论（一段话）",
  "consensusPoints": ["共识1", "共识2"],
  "disagreementPoints": ["分歧1", "分歧2"],
  "goalAchieved": "yes|partial|no",
  "recommendations": ["建议1", "建议2"]
}`;
}
