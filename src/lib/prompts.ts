// ===== AI 圆桌模拟器 — Prompt Templates =====
// Phase 13+14: 分层重构 + V2 注入 + 结构性输出
// V3: 隐藏身份、私密 Prompt 通道、裁判主持人私密视角、记忆更新 JSON

import type { Character, Message, RoundTable, WhisperMessage } from './types';
import { TokenBudgetManager, TokenEstimator, PromptType } from './token-manager';
import type { TruncationConfig } from './token-manager';

// ====================================================================
//  内部工具
// ====================================================================

function safe(v: unknown, fallback = '未指定'): string {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v);
}

function list(items?: string[]): string {
  const clean = (items || []).map((s) => String(s).trim()).filter(Boolean);
  return clean.length ? clean.map((s) => `- ${s}`).join('\n') : '无';
}

function roleHint(c: Character): string {
  const role = c.secret?.secretRole || 'normal';
  if (role === 'fraudster') {
    return '你的隐藏身份是欺诈者。你可以误导、隐瞒、转移怀疑，但必须保持逻辑一致；不要直接暴露自己是欺诈者。';
  }
  if (role === 'detective') {
    return '你的隐藏身份是侦探。你应根据矛盾、措辞、发言变化和投票倾向推理可疑者；不要直接暴露自己的私密信息。';
  }
  if (role === 'observer') {
    return '你的隐藏身份是观察者。你应观察局势、记录矛盾、保持相对中立，并在关键时刻指出结构性问题。';
  }
  return '你的隐藏身份是普通角色。你应根据公开信息寻找欺诈者或异常意图。';
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

/** 公开游戏上下文：所有角色只能看到公开目标和已揭示身份 */
export function buildPublicGameContext(rt: RoundTable): string {
  const rows = rt.characters
    .map((c) => {
      const alive = c.secret?.isAlive === false ? '已离场' : '在场';
      const revealed = c.secret?.revealed ? `已公开隐藏身份：${c.secret.secretRole}` : '隐藏身份：未公开';
      const publicGoal = c.secret?.publicGoal ? `公开目标：${c.secret.publicGoal}` : '';
      return `- ${c.name}（${c.role || '未指定身份'}，${alive}，${revealed}${publicGoal ? `，${publicGoal}` : ''}）`;
    })
    .join('\n');

  return `【公开信息】\n${buildScenarioContext(rt)}\n${buildGoalContext(rt)}\n\n公开角色列表：\n${rows || '无'}`;
}

/** 角色私密上下文：只注入当前角色自己的 secret */
export function buildPrivateGameContext(character: Character): string {
  const s = character.secret;
  if (!s) {
    return `【私密信息，仅你可见】\n你的隐藏身份：normal\n你的公开目标：参与公开讨论，判断其他角色的真实意图。\n你的私密目标：未指定\n你知道的秘密：\n无`;
  }

  return `【私密信息，仅你可见，禁止直接向其他角色暴露】\n你的隐藏身份：${s.secretRole}\n你的公开目标：${safe(s.publicGoal, '参与公开讨论，判断其他角色的真实意图。')}\n你的私密目标：${safe(s.privateGoal)}\n你是否仍在场：${s.isAlive === false ? '否' : '是'}\n你的身份是否已公开：${s.revealed ? '是' : '否'}\n你知道的秘密：\n${list(s.knownSecrets)}\n\n${roleHint(character)}`;
}

/** 角色记忆上下文：只注入当前角色自己的 memory */
export function buildMemoryContext(character: Character, config?: TruncationConfig): string {
  const m = character.memory;
  if (!m) {
    return '【你的记忆】\n私有记忆：\n无\n\n公开记忆：\n无\n\n怀疑度：{}\n\n当前策略：暂无';
  }

  const privateCap = config?.memoryPrivateCap ?? 40;
  const publicCap = config?.memoryPublicCap ?? 40;
  const strategyChars = config?.strategyMaxChars ?? 240;

  return `【你的记忆】\n私有记忆：\n${list(m.privateMemory.slice(-privateCap))}\n\n公开记忆：\n${list(m.publicMemory.slice(-publicCap))}\n\n你对其他角色的怀疑度：\n${JSON.stringify(m.suspicionMap || {}, null, 2)}\n\n当前策略：${safe(m.strategyPlan, '暂无').slice(0, strategyChars)}`;
}

/** 裁判主持人私密上下文：仅主持人可见，不得直接泄露 */
export function buildJudgePrivateContext(rt: RoundTable): string {
  const hostAccess = rt.host?.secretAccess || 'judge';
  if (hostAccess !== 'judge') return '';

  const rows = rt.characters.map((c) => {
    const s = c.secret;
    const m = c.memory;
    return `【${c.name}】\n公开身份：${c.role || '未指定'}\n隐藏身份：${s?.secretRole || 'normal'}\n公开目标：${safe(s?.publicGoal, '参与公开讨论，判断其他角色的真实意图。')}\n私密目标：${safe(s?.privateGoal)}\n已知秘密：\n${list(s?.knownSecrets)}\n状态：${s?.isAlive === false ? '已离场' : '在场'} / ${s?.revealed ? '身份已公开' : '身份未公开'}\n私有记忆：\n${list(m?.privateMemory)}\n公开记忆：\n${list(m?.publicMemory)}\n怀疑度：${JSON.stringify(m?.suspicionMap || {})}\n策略：${safe(m?.strategyPlan, '暂无')}`;
  }).join('\n\n');

  return `【裁判私密信息，仅主持人可见】\n你知道所有角色的隐藏身份、私密目标、已知秘密和当前记忆。\n你需要在每轮总结时：\n1. 根据发言判断谁更可疑\n2. 推动角色继续暴露矛盾\n3. 不直接公布未揭示的秘密身份和私密目标\n4. 如果需要投票、淘汰、胜负判断，可以用文本形式裁定\n5. 你的公开发言只能追问、总结、暗示和推动流程，不能直接泄露裁判私密信息\n\n${rows}`;
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
export function buildRecentContext(msgs: Message[], limit = 6, maxTokens?: number): string {
  if (!msgs?.length) return '（尚无发言记录）';
  let recent = msgs.slice(-limit);
  if (maxTokens !== undefined) {
    while (recent.length > 0) {
      const text = recent.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
      if (TokenEstimator.estimateTokens(text) <= maxTokens) break;
      recent = recent.slice(1);
    }
  }
  return recent
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
8. 使用中文回答
9. 私密信息只能影响策略，不能被直接泄露给不该知道的角色`;
}

/** 主持人开场 Prompt。 */
export function buildHostOpeningPrompt(rt: RoundTable): string {
  const modeHint = buildHostModeHint(rt);
  const scenario = buildScenarioContext(rt);
  const rules = buildRulesContext(rt);
  const goal = buildGoalContext(rt);
  const publicGame = buildPublicGameContext(rt);
  const judge = buildJudgePrivateContext(rt);
  const charList = rt.characters
    .map((c, i) => `${i + 1}. ${buildCharacterPersonaContext(c)}`)
    .join('\n\n');

  return `你是主持人「${rt.host.name}」，风格：${safe(rt.host.style, '中立控场')}。
${modeHint ? modeHint + '\n' : ''}
${scenario}
${rules}
${goal}

${publicGame}

参与角色：
${charList}

${judge ? judge + '\n\n' : ''}请致开场白：介绍场景、说明规则、陈述目标，然后请第一位角色开始发言。
格式：先开场，再点名第一位角色。${rt.host?.mode === 'invisible' ? '\n注意：你作为隐性主持人，不要输出用户可见的开场白，仅输出"讨论开始"作为信号。' : ''}`;
}

/** 角色发言 Prompt。兼容旧调用：第一个参数可以是 RoundTable，也可以是 topic 字符串。 */
/** @deprecated 使用 buildCombinedSpeechPrompt 替代（一次调用生成 speech + memoryUpdate JSON） */
export function buildCharacterSpeechPrompt(
  rtOrTopic: RoundTable | string,
  character: Character,
  round: number,
  previousMessages: Message[],
  hostFollowup?: string,
  whispers?: WhisperMessage[]  // ★NEW★
): string {
  const tbm = TokenBudgetManager.create(PromptType.CHAR_SPEECH);
  const persona = buildCharacterPersonaContext(character);
  const followup = hostFollowup ? `\n主持人追问：${hostFollowup}` : '';
  const publicContext = typeof rtOrTopic === 'string'
    ? `讨论主题：${rtOrTopic}`
    : buildPublicGameContext(rtOrTopic);
  const privateContext = buildPrivateGameContext(character);

  // —— 第一遍组装：用默认配置检查预算 ——
  let recentLimit = 6;
  let memoryConfig: TruncationConfig | undefined = undefined;

  const attemptBuild = (): { sections: Record<string, string> } => {
    const recent = buildRecentContext(previousMessages, recentLimit);
    const memoryContext = buildMemoryContext(character, memoryConfig);

    const instructions = `发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言，表示赞同、补充、质疑或反对\n3. 推进你的公开目标和私密目标\n4. 第一人称"我"\n5. 不重复自己之前的观点\n6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆\n7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致${character.constraints ? `\n8. 特别注意：${character.constraints}` : ''}`;

    return {
      sections: {
        persona,
        publicContext,
        privateContext,
        memory: memoryContext,
        recentMsgs: recent,
        instructions,
      },
    };
  };

  const { sections } = attemptBuild();
  const report = tbm.checkBudgetSections(sections);

  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    recentLimit = config.recentMsgMaxCount;
    if (config.memoryPrivateCap < 40 || config.memoryPublicCap < 40) {
      memoryConfig = config;
    }
  }

  // —— 用调整后的参数重新组装 ——
  const recent = buildRecentContext(previousMessages, recentLimit);
  const memoryContext = buildMemoryContext(character, memoryConfig);

  let whisperInjection = '';
  if (whispers && whispers.length > 0) {
    whisperInjection = buildWhisperContext(character, whispers).text;
  }

  return `你现在扮演：

${persona}

${publicContext}

${privateContext}

${memoryContext}

当前第 ${round} 轮。${followup}

近期公开发言：
${recent}

发言要求：
1. 以角色的身份和性格说话
2. 参考前面发言，表示赞同、补充、质疑或反对
3. 推进你的公开目标和私密目标
4. 第一人称"我"
5. 不重复自己之前的观点
6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆
7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致
${character.constraints ? `8. 特别注意：${character.constraints}` : ''}${whisperInjection}`;
}

/**
 * 合并发言+记忆更新的 Prompt（一次 LLM 调用）。
 * 模型同时输出 public.speech 和 private.memoryUpdate JSON。
 * 取代旧版 buildCharacterSpeechPrompt + buildMemoryUpdatePrompt 的两步调用。
 */
export function buildCombinedSpeechPrompt(
  rt: RoundTable,
  character: Character,
  round: number,
  previousMessages: Message[],
  hostFollowup?: string,
  whispers?: WhisperMessage[]
): string {
  const tbm = TokenBudgetManager.create(PromptType.CHAR_SPEECH_COMBINED);
  const persona = buildCharacterPersonaContext(character);
  const followup = hostFollowup ? `\n主持人追问：${hostFollowup}` : '';
  const publicContext = buildPublicGameContext(rt);
  const privateContext = buildPrivateGameContext(character);

  let recentLimit = 6;
  let memoryConfig: TruncationConfig | undefined = undefined;

  const attemptBuild = (): Record<string, string> => ({
    persona,
    publicContext,
    privateContext,
    memory: buildMemoryContext(character, memoryConfig),
    recentMsgs: buildRecentContext(previousMessages, recentLimit),
    instructions: `发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言，表示赞同、补充、质疑或反对\n3. 推进你的公开目标和私密目标\n4. 第一人称"我"\n5. 不重复自己之前的观点\n6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆\n7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致${character.constraints ? `\n8. 特别注意：${character.constraints}` : ''}`,
  });

  const sections = attemptBuild();
  const report = tbm.checkBudgetSections(sections);
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    recentLimit = config.recentMsgMaxCount;
    if (config.memoryPrivateCap < 40 || config.memoryPublicCap < 40) memoryConfig = config;
  }

  const recent = buildRecentContext(previousMessages, recentLimit);
  const memoryContext = buildMemoryContext(character, memoryConfig);

  let whisperInjection = '';
  if (whispers && whispers.length > 0) {
    whisperInjection = buildWhisperContext(character, whispers).text;
  }

  let result = `你现在扮演：

${persona}

${publicContext}

${privateContext}

${memoryContext}

当前第 ${round} 轮。${followup}

近期公开发言：
${recent}

发言要求：
1. 以角色的身份和性格说话
2. 参考前面发言，表示赞同、补充、质疑或反对
3. 推进你的公开目标和私密目标
4. 第一人称"我"
5. 不重复自己之前的观点
6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆
7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致
${character.constraints ? `8. 特别注意：${character.constraints}` : ''}${whisperInjection}

请以 JSON 格式输出（不要 markdown 代码块，不要额外文字）：
{
  "public": {
    "speech": "你的公开发言内容"
  },
  "private": {
    "memoryUpdate": {
      "privateMemoryAdd": [...],
      "publicMemoryAdd": [...],
      "suspicionMapDelta": {},
      "strategyPlan": "..."
    }
  }
}`;

  return result;
}

/** 每个角色发言后的私有记忆更新 Prompt。 */
/** @deprecated 使用 buildCombinedSpeechPrompt 替代（合并后的 Prompt 自带 memoryUpdate 输出） */
export function buildMemoryUpdatePrompt(
  rt: RoundTable,
  character: Character,
  round: number,
  allMessages: Message[]
): string {
  const tbm = TokenBudgetManager.create(PromptType.MEMORY_UPDATE);
  const publicGame = buildPublicGameContext(rt);
  const privateGame = buildPrivateGameContext(character);
  const mc = buildMemoryContext(character);
  const recent = buildRecentContext(allMessages, 12);

  const sections = { publicGame, privateGame, memory: mc, recentMsgs: recent, instructions: '...' };
  const report = tbm.checkBudgetSections(sections);
  let finalRecent = recent;
  let finalMc = mc;

  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    finalRecent = buildRecentContext(allMessages, config.recentMsgMaxCount);
    finalMc = buildMemoryContext(character, config);
  }

  return `你是「${character.name}」的内部记忆更新器。你不会对外发言，只根据本轮公开发言更新该角色自己的记忆。

${publicGame}

${privateGame}

${finalMc}

当前第 ${round} 轮。
近期公开记录：
${finalRecent}

请只输出 JSON，不要 markdown 代码块，不要解释：
{
  "privateMemoryAdd": ["只写该角色私下观察到、准备利用或需要记住的信息"],
  "publicMemoryAdd": ["只写公开发生、所有人理论上可观察的信息"],
  "suspicionMapDelta": {
    "characterId": 0
  },
  "strategyPlan": "下一轮的具体策略，保持简短"
}

要求：
1. privateMemoryAdd/publicMemoryAdd 每项不超过 40 字，最多各 3 条
2. suspicionMapDelta 的 key 必须使用角色 id，value 是 -30 到 30 的数字
3. 只更新「${character.name}」自己的记忆，不要替其他角色更新
4. 如果没有变化，数组输出 []，suspicionMapDelta 输出 {}
5. 必须是合法 JSON`;
}

/** 主持人单轮小结 Prompt。 */
export function buildHostSummaryPrompt(rt: RoundTable, round: number, messages: Message[]): string {
  const tbm = TokenBudgetManager.create(PromptType.HOST_SUMMARY);
  const roundMsgs = messages
    .filter((m) => m.round === round)
    .map((m) => `【${m.characterName}】\n${m.content}`)
    .join('\n\n');
  const goalCtx = buildGoalContext(rt);
  const charNames = rt.characters.map((c) => c.name).join('、');
  const judge = buildJudgePrivateContext(rt);

  // 检查 roundMsgs 是否超预算
  const sections = { roundMsgs, goal: goalCtx, judgeContext: judge || '' };
  const report = tbm.checkBudgetSections(sections);
  let finalRm = roundMsgs;
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    const roundMsgsList = messages.filter((m) => m.round === round);
    finalRm = roundMsgsList.slice(-config.recentMsgMaxCount).map((m) => `【${m.characterName}】\n${m.content}`).join('\n\n');
  }

  return `你是主持人「${rt.host.name}」。
第 ${round} 轮讨论结束。

${goalCtx}

${judge ? judge + '\n\n' : ''}本轮发言：
${finalRm}

请：
1. 总结每位角色的核心观点
2. 指出共识和分歧
3. 根据发言判断谁更可疑，但不要直接泄露未公开秘密
4. 推动角色继续暴露矛盾
5. 如果需要投票、淘汰、胜负判断，可以用文本形式裁定
6. 引出下一轮方向（角色：${charNames}）

控制在 200-350 字。保持中立控场，但要有裁判意识。`;
}

/** 主持人最终总结 Prompt。 */
export function buildHostFinalSummaryPrompt(rt: RoundTable, allMessages: Message[]): string {
  const tbm = TokenBudgetManager.create(PromptType.HOST_FINAL);
  const records = allMessages
    .map((m) => `【${m.characterName} 第${m.round}轮】\n${m.content}`)
    .join('\n\n');
  const charSummary = rt.characters
    .map((c) => `${c.name}（${c.role}）—— ${safe(c.stance, '未指定立场')}`)
    .join('\n');
  const goalCtx = buildGoalContext(rt);
  const scenario = buildScenarioContext(rt);
  const judge = buildJudgePrivateContext(rt);

  const sections = { records, chars: charSummary, goal: goalCtx, scenario, judgeContext: judge || '' };
  const report = tbm.checkBudgetSections(sections);
  let finalRec = records;
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    finalRec = allMessages.slice(-config.recentMsgMaxCount).map((m) => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  }

  return `你是主持人「${rt.host.name}」。
整场讨论结束。

${scenario}
${goalCtx}

角色：
${charSummary}

${judge ? judge + '\n\n' : ''}完整记录：
${finalRec}

请撰写总结陈词：
1. 主题回顾
2. 每位角色主要观点
3. 可疑点与矛盾链条
4. 如果存在欺诈者/隐藏阵营，给出裁判式判断，但不要编造代码里不存在的硬结算
5. 达成的共识
6. 仍存分歧
7. 后续方向

控制在 400-700 字。有深度，有洞见。`;
}

/** 结构化结果 Prompt。所有模式均生成。 */
export function buildStructuredResultPrompt(rt: RoundTable, allMessages: Message[]): string {
  const tbm = TokenBudgetManager.create(PromptType.STRUCTURED_RESULT);
  const records = allMessages
    .map((m) => `【${m.characterName} 第${m.round}轮】\n${m.content}`)
    .join('\n\n');
  const goalCtx = buildGoalContext(rt);
  const judge = buildJudgePrivateContext(rt);

  const sections = { records, goal: goalCtx, judgeContext: judge || '' };
  const report = tbm.checkBudgetSections(sections);
  let finalRec = records;
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    finalRec = allMessages.slice(-tbm.getConfig().recentMsgMaxCount).map((m) => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  }

  return `基于以下完整讨论记录，请生成结构化结果。

${goalCtx}

${judge ? judge + '\n\n' : ''}讨论记录：
${finalRec}

请以 JSON 格式输出（不要 markdown 代码块包裹）：

{
  "conclusion": "最终结论（一段话）",
  "consensusPoints": ["共识1", "共识2"],
  "disagreementPoints": ["分歧1", "分歧2"],
  "goalAchieved": "yes|partial|no",
  "recommendations": ["建议1", "建议2"]
}`;
}

export interface WhisperContextResult {
  /** 可直接拼接到 prompt 末尾的私信上下文字符串。 */
  text: string;
  /** 本次被注入的未读私信 id 列表，调用方应在发言成功后将其状态更新为 'read'。 */
  readIds: string[];
}

/**
 * 构建私信上下文段（供 retry 等前端逻辑使用）
 * 过滤出：主持人发送给该角色的未读私信（status='unread'）
 * 返回格式化的私信上下文字符串（空字符串 = 无未读私信）以及需要被标记为已读的消息 id 列表。
 * 注意：本函数为纯函数，不会修改 whispers 数组。
 */
export function buildWhisperContext(
  character: Character,
  whispers: WhisperMessage[]
): WhisperContextResult {
  const pending = whispers.filter(
    (w) => w.senderId === 'host' && w.recipientId === character.id && w.status === 'unread'
  );
  if (pending.length === 0) return { text: '', readIds: [] };

  const whisperLines = pending.map((w) => `  主持人: ${w.content}`).join('\n');
  const text = `

【你收到的主持人私信（私密，仅你和主持人可见，不得泄露）】
${whisperLines}

请在发言中自然地回应上述私信内容，但不要直接提及「主持人私下告诉我」或类似泄露私信存在的表述。`;
  return { text, readIds: pending.map((w) => w.id) };
}

/**
 * 构建角色私信回复 Prompt。
 * 用于目标角色回复主持人刚刚发送的 1:1 私信。
 */
export function buildWhisperReplyPrompt(
  character: Character,
  whisperContent: string
): string {
  const persona = buildCharacterPersonaContext(character);
  return `你现在扮演：

${persona}

你正在与主持人进行私下对话。主持人刚刚对你说：

主持人：${whisperContent}

请以角色的身份和性格，自然地回复主持人的私信。
注意：
1. 回复要符合你的人设
2. 语气自然，像私下交流
3. 不要提及这是私信或"私下告诉你"
4. 直接对主持人说话，使用"您"或合适称谓
5. 回复字数控制在 50-200 字

你可以直接回复主持人，也可以简单表示已读、点头、或暂时没有更多要说的。
如果这条私信不需要立即行动，保持简短即可，不必刻意展开对话。`;
}
