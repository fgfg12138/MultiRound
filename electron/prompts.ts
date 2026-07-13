// ===== AI 圆桌模拟器 — Electron Prompt Builders =====
// 独立模块，从 discussion-runner.ts 抽出。仅供主进程使用。
// 与 src/lib/prompts.ts 保持同步（但允许 Electron 特有逻辑差异）。

import type { Character, Host, RuleSet, Goal, Scenario, RoundTable, Message, CharacterSecret, CharacterMemory, MemoryUpdatePayload, CharacterOutput, HostMode, HostSecretAccess, SpeakOrder, GoalType, MsgType, SecretRole } from './types.js';
import type { WhisperMessage } from './types.js';
import { TokenBudgetManager, TokenEstimator, PromptType, TruncationConfig } from './token-manager.js';
import { getDataDir, ensureDir, loadIndex, saveWhispers, loadWhispers, } from './data-store.js';
import fs from 'node:fs';
import path from 'node:path';

export function safe(v: unknown, fb = '未指定'): string {
  if (v === undefined || v === null || v === '') return fb;
  return String(v);
}

export function list(items?: string[]): string {
  const clean = (items || []).map((s) => String(s).trim()).filter(Boolean);
  return clean.length ? clean.map((s) => `- ${s}`).join('\n') : '无';
}

export function defaultSecret(): CharacterSecret {
  return {
    secretRole: 'normal',
    publicGoal: '参与公开讨论，判断其他角色的真实意图。',
    privateGoal: '',
    knownSecrets: [],
    isAlive: true,
    revealed: false,
    diedAtRound: undefined,
    diedReason: undefined,
    nightActionDone: false,
  };
}

export function defaultMemory(): CharacterMemory {
  return {
    privateMemory: [],
    publicMemory: [],
    suspicionMap: {},
    strategyPlan: '',
  };
}

export function normalizeCharacter(c: Character): Character {
  return {
    ...c,
    secret: { ...defaultSecret(), ...(c.secret || {}) },
    memory: { ...defaultMemory(), ...(c.memory || {}), suspicionMap: c.memory?.suspicionMap || {} },
  };
}

export function normalizeRoundTable(rt: RoundTable): void {
  rt.host = { ...rt.host, secretAccess: rt.host.secretAccess || 'judge' };
  rt.modules = rt.modules || { nightAction: false, vote: false, deathSilence: false, winCheck: false, phaseIndicator: false };
  if (rt.gameMode === 'werewolf' && rt.modules && !rt.modules.nightAction && !rt.modules.vote) {
    rt.modules = { nightAction: true, vote: true, deathSilence: true, winCheck: true, phaseIndicator: true };
  }
  rt.witchPotions = rt.witchPotions || { heal: true, poison: true };
  rt.characters = (rt.characters || []).map(normalizeCharacter);
}

export function roleHint(c: Character): string {
  const role = c.secret?.secretRole || 'normal';
  if (role === 'fraudster') return '你的隐藏身份是欺诈者。你可以误导、隐瞒、转移怀疑，但必须保持逻辑一致；不要直接暴露自己是欺诈者。';
  if (role === 'detective') return '你的隐藏身份是侦探。你应根据矛盾、措辞、发言变化和投票倾向推理可疑者；不要直接暴露自己的私密信息。';
  if (role === 'observer') return '你的隐藏身份是观察者。你应观察局势、记录矛盾、保持相对中立，并在关键时刻指出结构性问题。';
  return '你的隐藏身份是普通角色。你应根据公开信息寻找欺诈者或异常意图。';
}

export function buildScenarioContext(rt: RoundTable): string {
  const t = rt.scenario?.title || rt.topic || '未命名讨论';
  const d = rt.scenario?.description || '';
  const a = rt.scenario?.atmosphere || '';
  let ctx = `讨论主题：${t}`;
  if (d && d !== t) ctx += `\n背景：${d}`;
  if (a) ctx += `\n氛围：${a}`;
  return ctx;
}

export function buildRulesContext(rt: RoundTable): string {
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

export function buildGoalContext(rt: RoundTable): string {
  const g = rt.goal;
  const d = g?.description || rt.topic || '';
  const t = g?.type || 'custom';
  const sc = g?.successCriteria || '';
  let ctx = '';
  if (d) ctx += `讨论目标（${t}）：${d}`;
  if (sc) ctx += `\n成功标准：${sc}`;
  return ctx;
}

export function buildPublicGameContext(rt: RoundTable): string {
  const isWw = rt.gameMode === 'werewolf' || (rt.modules && (rt.modules.nightAction || rt.modules.vote));
  const rows = rt.characters.map((c) => {
    const alive = c.secret?.isAlive === false ? '已离场' : '在场';
    let revealed: string;
    let roleLine: string;
    if (isWw) {
      if (c.secret?.isAlive === false && c.secret?.revealed) {
        revealed = `已翻牌：${c.role || '未知'}（${c.secret.secretRole}）`;
      } else if (c.secret?.isAlive === false) {
        revealed = '已离场（身份未公开）';
      } else {
        revealed = '身份未公开';
      }
      roleLine = c.name;
    } else {
      revealed = c.secret?.revealed ? `已公开隐藏身份：${c.secret.secretRole}` : '隐藏身份：未公开';
      roleLine = `${c.name}（${c.role || '未指定身份'}）`;
    }
    const publicGoal = (!isWw && c.secret?.publicGoal) ? `，公开目标：${c.secret.publicGoal}` : '';
    return isWw
      ? `- ${roleLine}（${alive}，${revealed}）`
      : `- ${roleLine}（${alive}，${revealed}${publicGoal}）`;
  }).join('\n');
  return `【公开信息】\n${buildScenarioContext(rt)}\n${buildGoalContext(rt)}\n\n公开角色列表：\n${rows || '无'}`;
}

export function buildPrivateGameContext(c: Character): string {
  const s = c.secret || defaultSecret();
  return `【私密信息，仅你可见，禁止直接向其他角色暴露】\n你的隐藏身份：${s.secretRole}\n你的公开目标：${safe(s.publicGoal, '参与公开讨论，判断其他角色的真实意图。')}\n你的私密目标：${safe(s.privateGoal)}\n你是否仍在场：${s.isAlive === false ? '否' : '是'}\n你的身份是否已公开：${s.revealed ? '是' : '否'}\n你知道的秘密：\n${list(s.knownSecrets)}\n\n${roleHint(c)}`;
}

export function buildMemoryContext(c: Character, config?: TruncationConfig): string {
  const m = c.memory || defaultMemory();
  const privateCap = config?.memoryPrivateCap ?? 40;
  const publicCap = config?.memoryPublicCap ?? 40;
  const strategyChars = config?.strategyMaxChars ?? 240;
  return `【你的记忆】\n私有记忆：\n${list(m.privateMemory.slice(-privateCap))}\n\n公开记忆：\n${list(m.publicMemory.slice(-publicCap))}\n\n你对其他角色的怀疑度：\n${JSON.stringify(m.suspicionMap || {}, null, 2)}\n\n当前策略：${safe(m.strategyPlan, '暂无').slice(0, strategyChars)}`;
}

/**
 * 合并发言+记忆更新的 Prompt。
 * 一次 LLM 调用同时生成 public.speech 和 private.memoryUpdate JSON。
 * 取代旧版 buildCharSpeech + buildMemoryUpdate 的两步调用。
 */
export function buildCombinedPrompt(rt: RoundTable, c: Character, round: number, msgs: Message[], hf?: string): string {
  const tbm = TokenBudgetManager.create(PromptType.CHAR_SPEECH_COMBINED);
  const p = buildCharPersona(c);
  const publicGame = buildPublicGameContext(rt);
  const privateGame = buildPrivateGameContext(c);

  let recentMsgsLimit = 6;
  let memoryConfig: TruncationConfig | undefined = undefined;

  const attemptBuild = (): Record<string, string> => {
    const rc = buildRecentMsgs(msgs, recentMsgsLimit);
    const mc = buildMemoryContext(c, memoryConfig);
    const fu = hf ? `\n主持人追问：${hf}` : '';
    return {
      persona: p,
      publicGame,
      privateGame,
      memory: mc,
      recentMsgs: rc,
      instructions: `发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言，表示赞同、补充、质疑或反对\n3. 推进你的公开目标和私密目标\n4. 第一人称"我"\n5. 不重复自己之前的观点\n6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆\n7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致
8. 严禁复读上一位发言或简单同意
9. 观点必须分裂：怀疑不同的人
10. 推理必须独立成链
11. 文本狼人杀无肢体语言
12. 忠于人设${c.constraints ? `\n13. 特别注意：${c.constraints}` : ''}\n14. 狼人杀术语规则（严格遵守方可用）：悍跳=狼人冒充神职上跳；倒钩=狼人打自己狼队友做身份；冲锋=狼人支持狼同伴带节奏；禁止乱用术语，使用前明确收益\n15. 推理不充分时用概率判断而非断言（如「我判断6真预约40%，8真预约35%」），禁止贴标签式结论\n16. 严格遵守时间线：夜间行动发生在白天发言之前。白天只能引用上帝已公开宣布的死亡名单与本轮公开发言。禁止引用未公布的夜间细节（谁被刀、是否被救、谁验了谁、守谁）。\n17. 禁止从某角色已离场推断其职业身份或死因。未翻牌身份属于隐藏信息，你无权断言某号是女巫/猎人/预言家。`,
    };
  };

  const sections = attemptBuild();
  const report = tbm.checkBudgetSections(sections);
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    recentMsgsLimit = config.recentMsgMaxCount;
    if (config.memoryPrivateCap < 40 || config.memoryPublicCap < 40) memoryConfig = config;
  }

  const rc = buildRecentMsgs(msgs, recentMsgsLimit);
  const mc = buildMemoryContext(c, memoryConfig);
  const fu = hf ? `\n主持人追问：${hf}` : '';

  let result = `你现在扮演：\n\n${p}\n\n${publicGame}\n\n${privateGame}\n\n${mc}\n\n当前第 ${round} 轮。${fu}\n\n近期公开发言：\n${rc}\n\n发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言，表示赞同、补充、质疑或反对\n3. 推进你的公开目标和私密目标\n4. 第一人称"我"\n5. 不重复自己之前的观点\n6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆\n7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致
8. 严禁复读上一位发言或简单同意。必须提出新观点、新怀疑对象或新逻辑链。
9. 观点必须分裂：不同角色应怀疑不同的人，不许全桌只怀疑一个人。
10. 推理必须独立成链（验人→怀疑目标→逻辑结论），禁止循环论证。
11. 文本狼人杀没有眼神/微表情/肢体动作/手势/呼吸，禁止编造这类描写。
12. 角色性格差异化：你的性格写在人设里，必须忠于人设。${c.constraints ? `\n13. 特别注意：${c.constraints}` : ''}\n14. 狼人杀术语规则：悍跳=狼人冒充神职上跳；倒钩=狼人打自己狼队友做身份；冲锋=狼人支持狼同伴带节奏；禁止乱用术语，使用前明确收益\n15. 推理不充分时用概率判断而非断言（如「我判断6真预约40%，8真预约35%」），禁止贴标签式结论\n16. 严格遵守时间线：夜间行动发生在白天发言之前。白天只能引用上帝已公开宣布的死亡名单与本轮公开发言。禁止引用未公布的夜间细节（谁被刀、是否被救、谁验了谁、守谁）。\n17. 禁止从某角色已离场推断其职业身份或死因。未翻牌身份属于隐藏信息，你无权断言某号是女巫/猎人/预言家。`;

  // Whisper injection (same logic as buildCharSpeech)
  let whisperInjection = '';
  try {
    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const filename = index[rt.id];
    if (filename) {
      const whisperData = loadWhispers(dataDir, filename);
      const { text, readIds } = injectWhisperContext(c.id, whisperData.whispers);
      if (readIds.length > 0) {
        for (const w of whisperData.whispers) {
          if (readIds.includes(w.id)) w.status = 'read';
        }
        saveWhispers(dataDir, filename, whisperData);
      }
      whisperInjection = text;
    }
  } catch { /* silently fail — whisper injection is best-effort */ }

  result += whisperInjection;

  result += `\n\n请以 JSON 格式输出（不要 markdown 代码块，不要额外文字）：\n{\n  "public": {\n    "speech": "你的公开发言内容"\n  },\n  "private": {\n    "memoryUpdate": {\n      "privateMemoryAdd": [...],\n      "publicMemoryAdd": [...],\n      "suspicionMapDelta": {},\n      "strategyPlan": "..."\n    }\n  }\n}`;
  return result;
}

export function buildJudgePrivateContext(rt: RoundTable): string {
  const hostAccess = rt.host?.secretAccess || 'judge';
  if (hostAccess !== 'judge') return '';

  const rows = rt.characters.map((c) => {
    const s = c.secret || defaultSecret();
    const m = c.memory || defaultMemory();
    return `【${c.name}】\n公开身份：${c.role || '未指定'}\n隐藏身份：${s.secretRole}\n公开目标：${safe(s.publicGoal, '参与公开讨论，判断其他角色的真实意图。')}\n私密目标：${safe(s.privateGoal)}\n已知秘密：\n${list(s.knownSecrets)}\n状态：${s.isAlive === false ? '已离场' : '在场'} / ${s.revealed ? '身份已公开' : '身份未公开'}\n私有记忆：\n${list(m.privateMemory)}\n公开记忆：\n${list(m.publicMemory)}\n怀疑度：${JSON.stringify(m.suspicionMap || {})}\n策略：${safe(m.strategyPlan, '暂无')}`;
  }).join('\n\n');

  return `【裁判私密信息，仅主持人可见】\n你知道所有角色的隐藏身份、私密目标、已知秘密和当前记忆。\n你需要在每轮总结时：\n1. 根据发言判断谁更可疑\n2. 推动角色继续暴露矛盾\n3. 不直接公布未揭示的秘密身份和私密目标\n4. 如果需要投票、淘汰、胜负判断，可以用文本形式裁定\n5. 你的公开发言只能追问、总结、暗示和推动流程，不能直接泄露裁判私密信息\n\n${rows}`;
}

export function buildWerewolfJudgeContext(rt: RoundTable): string {
  const alive = rt.characters.filter(c => c.secret?.isAlive !== false);
  const dead = rt.characters.filter(c => c.secret?.isAlive === false);
  const pub = '存活：' + alive.map(c=>c.name).join('、') + String.fromCharCode(10) + '已死亡翻牌：' + dead.filter(c=>c.secret?.revealed).map(c=>c.name + '(' + c.secret?.secretRole + ')').join('、') + String.fromCharCode(10) + '历史出局：' + (rt.deathLog||[]).map((d:any)=>'第'+d.round+'轮 '+rt.characters.find((cx:any)=>cx.id===d.characterId)?.name+' 出局('+(d.reason||'未知')+')').join(String.fromCharCode(10)) || '无';
  const na = rt.nightActions;
  var scName = '无'; var scResult = '';
  if (na && na.seerCheck && na.seerCheck.target) {
    var scChar = rt.characters.find((cx:any)=>cx.id===na.seerCheck!.target);
    scName = scChar?.name || '未知';
    scResult = '(' + na.seerCheck!.result + ')';
  }
  const naStr = na ? '本轮被刀目标：' + (na.wolfTarget?rt.characters.find((cx:any)=>cx.id===na.wolfTarget)?.name:'无') + '；女巫' + (na.witchHeal?'已救':'未救') + (na.witchPoison?',毒了'+(rt.characters.find((cx:any)=>cx.id===na.witchPoison)?.name||''):'') + '；守卫守' + (na.guardTarget?rt.characters.find((cx:any)=>cx.id===na.guardTarget)?.name:'无') + '；预言家验' + scName + scResult : '尚无夜间行动';
  return '【主持人职责】你是上帝，只负责流程推进。' + String.fromCharCode(10) + '你能知道的公开信息：' + String.fromCharCode(10) + pub + String.fromCharCode(10) + '夜间行动汇总（仅你知道，不可对外说）：' + naStr + String.fromCharCode(10) + String.fromCharCode(10) + '你绝对不可对外泄露：' + String.fromCharCode(10) + '1. 任何存活角色的隐藏身份、私密目标、已知秘密、阵营归属' + String.fromCharCode(10) + '2. 女巫是否持药、守卫守谁、预言家验了谁、被刀/被救过程' + String.fromCharCode(10) + '3. 对谁是狼、谁是神下裁判结论' + String.fromCharCode(10) + '你的公开发言只能：报死亡名单、推进流程、组织投票、宣布出局与翻牌。';
}
export function buildCharPersona(c: Character): string {
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

export function buildRecentMsgs(msgs: Message[], limit = 6, maxTokens?: number): string {
  if (!msgs?.length) return '（尚无发言记录）';
  let recent = msgs.slice(-limit);
  if (maxTokens !== undefined) {
    while (recent.length > 0) {
      const text = recent.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
      if (TokenEstimator.estimateTokens(text) <= maxTokens) break;
      recent = recent.slice(1);
    }
  }
  return recent.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
}

export function buildHostModeHint(rt: RoundTable): string {
  const m = rt.host?.mode || 'visible';
  if (m === 'invisible') return '你作为隐性主持人，不输出用户可见的发言。你只在后台控制讨论流程。';
  if (m === 'user') return '注意：本场讨论由用户手动主持。';
  return '';
}

/** Build prompt for host to assign speaking order in host-assigned mode */
export function buildHostAssignPrompt(rt: RoundTable, round: number, aliveChars: Character[]): string {
  const names = aliveChars.map((c) => `- ${c.name}（${c.role || '未指定身份'}）`).join('\n');
  return `你是主持人「${rt.host.name}」。当前是第 ${round} 轮讨论。

请根据讨论进程指定这一轮的发言顺序。

在场的角色：
${names}

请直接输出一个发言顺序列表，每行一个角色名，例如：
张三
李四
王五

只能从以上角色中选择，不必包含所有角色。不要添加序号、解释或其他文字。只输出角色名列表。`;
}

/** Parse host-assigned order from LLM output — extracts character names line by line */
export function parseHostAssignedOrder(text: string, aliveChars: Character[]): Character[] {
  const nameSet = new Set(aliveChars.map((c) => c.name));
  const nameToChar = new Map(aliveChars.map((c) => [c.name, c]));
  const seen = new Set<string>();
  const result: Character[] = [];

  const lines = String(text || '')
    .replace(/^```[\w]*/gm, '')
    .replace(/```$/gm, '')
    .split('\n');

  for (const line of lines) {
    const name = line.replace(/^[\d\.\-\s\)]+/, '').trim();
    if (nameSet.has(name) && !seen.has(name)) {
      seen.add(name);
      const ch = nameToChar.get(name);
      if (ch) result.push(ch);
    }
  }

  // Fallback: if no names were parsed, return all alive chars
  if (result.length === 0) return aliveChars;
  return result;
}

export function buildSysPrompt(): string {
  return `你是一个 AI 圆桌讨论模拟系统。根据给定的场景、规则和目标，扮演多个角色进行结构化讨论。\n\n核心原则：\n1. 每次只扮演一个角色发言\n2. 严格遵循你的人设\n3. 发言必须有实质内容\n4. 参考前面角色的发言进行回应或辩论\n5. 禁止重复自己之前的观点\n6. 发言长度遵循规则指定的字数限制\n7. 始终围绕讨论目标推进\n8. 使用中文回答\n9. 私密信息只能影响策略，不能被直接泄露给不该知道的角色`;
}

export function buildHostOpen(rt: RoundTable): string {
  const mh = buildHostModeHint(rt);
  const sc = buildScenarioContext(rt);
  const ru = buildRulesContext(rt);
  const gl = buildGoalContext(rt);
  const publicGame = buildPublicGameContext(rt);
  const isWw = rt.gameMode === 'werewolf' || (rt.modules && (rt.modules.nightAction || rt.modules.vote));
  const judge = isWw ? buildWerewolfJudgeContext(rt) : buildJudgePrivateContext(rt);
  const cl = rt.characters.map((c, i) => `${i + 1}. ${buildCharPersona(c)}`).join('\n\n');
  if (isWw) {
    return `你是主持人「${rt.host.name}」即上帝，风格：${safe(rt.host.style, '中立控场')}。\n${mh ? mh + '\n' : ''}\n${sc}\n${ru}\n${gl}\n\n${publicGame}\n\n参与角色：\n${cl}\n\n${judge}\n\n请致开场白：介绍场景、说明夜昼流程（夜晚行动→天亮公布死亡→白天发言→投票放逐→循环至胜负）、陈述目标，然后说"天黑请闭眼"开始第一夜。\n【严格要求】你是上帝，只主持流程，绝不公布任何角色的隐藏身份、私密目标、阵营归属、持药状态。开场白不分析谁是狼、不下任何身份结论。`;
  }
  return `你是主持人「${rt.host.name}」，风格：${safe(rt.host.style, '中立控场')}。\n${mh ? mh + '\n' : ''}\n${sc}\n${ru}\n${gl}\n\n${publicGame}\n\n参与角色：\n${cl}\n\n${judge ? judge + '\n\n' : ''}请致开场白：介绍场景、说明规则、陈述目标，然后请第一位角色开始发言。\n注意：作为主持人，你绝对不得在发言中透露任何角色的隐藏身份、私密目标、已知秘密或阵营归属。`;
}

/** @deprecated 使用 buildCombinedPrompt 替代（一次调用同时生成 speech + memoryUpdate） */
export function buildCharSpeech(rt: RoundTable, c: Character, round: number, msgs: Message[], hf?: string): string {
  const tbm = TokenBudgetManager.create(PromptType.CHAR_SPEECH);
  const p = buildCharPersona(c);
  const publicGame = buildPublicGameContext(rt);
  const privateGame = buildPrivateGameContext(c);

  // —— 第一遍组装：用默认配置检查预算 ——
  let recentMsgsLimit = 6;
  let memoryConfig: TruncationConfig | undefined = undefined;

  const attemptBuild = (): { sections: Record<string, string>; fu: string } => {
    const rc = buildRecentMsgs(msgs, recentMsgsLimit);
    const fu = hf ? `\n主持人追问：${hf}` : '';
    const mc = buildMemoryContext(c, memoryConfig);

    const sections: Record<string, string> = {
      persona: p,
      publicGame,
      privateGame,
      memory: mc,
      recentMsgs: rc,
      instructions: `发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言，表示赞同、补充、质疑或反对\n3. 推进你的公开目标和私密目标\n4. 第一人称"我"\n5. 不重复自己之前的观点\n6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆\n7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致${c.constraints ? `\n13. 特别注意：${c.constraints}` : ''}`,
    };
    return { sections, fu };
  };

  const { sections, fu } = attemptBuild();
  const report = tbm.checkBudgetSections(sections);

  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    // 根据 degrade.config 调整参数
    const config = tbm.getConfig();
    recentMsgsLimit = config.recentMsgMaxCount;
    if (config.memoryPrivateCap < 40 || config.memoryPublicCap < 40) {
      memoryConfig = config;
    }
  }

  // —— 用调整后的参数重新组装 ——
  const rc = buildRecentMsgs(msgs, recentMsgsLimit);
  const mc = buildMemoryContext(c, memoryConfig);
  let result = `你现在扮演：\n\n${p}\n\n${publicGame}\n\n${privateGame}\n\n${mc}\n\n当前第 ${round} 轮。${fu}\n\n近期公开发言：\n${rc}\n\n发言要求：\n1. 以角色的身份和性格说话\n2. 参考前面发言，表示赞同、补充、质疑或反对\n3. 推进你的公开目标和私密目标\n4. 第一人称"我"\n5. 不重复自己之前的观点\n6. 不要直接泄露你的隐藏身份、私密目标、已知秘密和私有记忆\n7. 如果你需要欺骗或隐藏，必须保持前后逻辑一致${c.constraints ? `\n13. 特别注意：${c.constraints}` : ''}`;

  // Whisper: inject pending whisper context
  let whisperInjection = '';
  try {
    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const filename = index[rt.id];
    if (filename) {
      const whisperData = loadWhispers(dataDir, filename);
      const { text, readIds } = injectWhisperContext(c.id, whisperData.whispers);
      if (readIds.length > 0) {
        for (const w of whisperData.whispers) {
          if (readIds.includes(w.id)) w.status = 'read';
        }
        saveWhispers(dataDir, filename, whisperData);
      }
      whisperInjection = text;
    }
  } catch { /* silently fail — whisper injection is best-effort */ }

  return result + whisperInjection;
}

/** @deprecated 使用 buildCombinedPrompt 替代（合并后的 Prompt 自带 memoryUpdate 输出） */
export function buildMemoryUpdate(rt: RoundTable, c: Character, round: number, all: Message[]): string {
  const tbm = TokenBudgetManager.create(PromptType.MEMORY_UPDATE);
  const publicGame = buildPublicGameContext(rt);
  const privateGame = buildPrivateGameContext(c);
  const mc = buildMemoryContext(c);
  const recent = buildRecentMsgs(all, 12);

  const sections = { publicGame, privateGame, memory: mc, recentMsgs: recent, instructions: '...' };
  const report = tbm.checkBudgetSections(sections);
  let finalRecent = recent;
  let finalMc = mc;

  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    finalRecent = buildRecentMsgs(all, config.recentMsgMaxCount);
    finalMc = buildMemoryContext(c, config);
  }

  return `你是「${c.name}」的内部记忆更新器。你不会对外发言，只根据本轮公开发言更新该角色自己的记忆。\n\n${publicGame}\n\n${privateGame}\n\n${finalMc}\n\n当前第 ${round} 轮。\n近期公开记录：\n${finalRecent}\n\n请只输出 JSON，不要 markdown 代码块，不要解释：\n{\n  "privateMemoryAdd": ["只写该角色私下观察到、准备利用或需要记住的信息"],\n  "publicMemoryAdd": ["只写公开发生、所有人理论上可观察的信息"],\n  "suspicionMapDelta": {\n    "characterId": 0\n  },\n  "strategyPlan": "下一轮的具体策略，保持简短"\n}\n\n要求：\n1. privateMemoryAdd/publicMemoryAdd 每项不超过 40 字，最多各 3 条\n2. suspicionMapDelta 的 key 必须使用角色 id，value 是 -30 到 30 的数字\n3. 只更新「${c.name}」自己的记忆，不要替其他角色更新\n4. 如果没有变化，数组输出 []，suspicionMapDelta 输出 {}\n5. 必须是合法 JSON`;
}

export function buildHostSum(rt: RoundTable, round: number, msgs: Message[]): string {
  const tbm = TokenBudgetManager.create(PromptType.HOST_SUMMARY);
  const rm = msgs.filter(m => m.round === round).map(m => `【${m.characterName}】\n${m.content}`).join('\n\n');
  const gl = buildGoalContext(rt);
  const cn = rt.characters.map(c => c.name).join('、');
  const isWw = rt.gameMode === 'werewolf' || (rt.modules && (rt.modules.nightAction || rt.modules.vote));
  const judge = isWw ? buildWerewolfJudgeContext(rt) : buildJudgePrivateContext(rt);

  const sections = { roundMsgs: rm, goal: gl, judgeContext: judge || '' };
  const report = tbm.checkBudgetSections(sections);
  let finalRm = rm;
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    const roundMsgsList = msgs.filter(m => m.round === round);
    finalRm = roundMsgsList.slice(-config.recentMsgMaxCount).map(m => `【${m.characterName}】\n${m.content}`).join('\n\n');
  }

  if (isWw) {
    const wdF = getDataDir(); const wdI = loadIndex(wdF); const wdFn = wdI[rt.id];
    let nl = '';
    if (wdFn) { try { const wd = loadWhispers(wdF, wdFn); const na = wd.whispers.filter((w:any) => w.type === 'night-action'); if (na.length) nl = '\n\n【本夜私密行动（仅供你参考）】\n' + na.slice(-10).map((w:any) => (w.senderId === 'host' ? '上帝→' + (rt.characters.find((c:any) => c.id === w.recipientId)?.name || w.recipientId) : rt.characters.find((c:any) => c.id === w.senderId)?.name || w.senderId) + '：' + w.content).join('\n'); } catch {} }
    return `你是主持人「${rt.host.name}」。第 ${round} 轮白天发言结束。\n\n${gl}\n\n${judge}\n\n本轮发言：\n${finalRm}\n\n总结要求（严格）:\n1. 只陈述本轮公开发言的事实：谁沉默、谁对跳预言家、谁站边、谁被怀疑\n2. 只报双预/单预/沉默/站边分布等中立事实，禁止下任何身份结论\n3. 禁止剧透未翻牌身份、持药状态、守卫守谁、预言家验了谁、狼队关系\n4. 禁止马后炮分析全局、禁止为剧情编造因果\n5. 禁止替玩家下X号就是狼的裁判结论；可列存在两种可能：方案A/方案B\n6. 若启用投票，引出投票环节\n7. 150-250字，纯事实播报，禁止裁判式断言\n8. 可给概率分布而非身份断言（如「6真预约40%，8真预约35%，双狼互踩约10%」），禁止贴标签式结论`;
  }
  return `你是主持人「${rt.host.name}」。\n第 ${round} 轮讨论结束。\n\n${gl}\n\n${judge ? judge + '\n\n' : ''}本轮发言：\n${finalRm}\n\n请：\n1. 总结每位角色的核心观点\n2. 指出共识和分歧\n3. 根据发言判断谁更可疑，但绝对不要直接泄露任何角色的隐藏身份、私密目标、已知秘密或阵营归属\n4. 推动角色继续暴露矛盾\n5. 如果需要投票、淘汰、胜负判断，可以用文本形式裁定\n6. 引出下一轮方向（角色：${cn}）\n\n控制在 200-350 字。保持中立控场，但要有裁判意识。`;
}

export function buildHostFinal(rt: RoundTable, all: Message[]): string {
  const tbm = TokenBudgetManager.create(PromptType.HOST_FINAL);
  const rec = all.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  const cs = rt.characters.map(c => `${c.name}（${c.role}）—— ${safe(c.stance, '未指定立场')}`).join('\n');
  const gl = buildGoalContext(rt);
  const sc = buildScenarioContext(rt);
  const judge = buildJudgePrivateContext(rt);
  const isWw3 = rt.gameMode === 'werewolf' || (rt.modules && (rt.modules.nightAction || rt.modules.vote));
  const judge2 = isWw3 ? buildWerewolfJudgeContext(rt) : judge;

  const sections = { records: rec, chars: cs, goal: gl, scenario: sc, judgeContext: judge2 || '' };
  const report = tbm.checkBudgetSections(sections);
  let finalRec = rec;
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    const config = tbm.getConfig();
    finalRec = all.slice(-config.recentMsgMaxCount).map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  }

  let fullNightLog = '';
  if (isWw3) {
    try { const wdF2 = getDataDir(); const wdI2 = loadIndex(wdF2); const wdFn2 = wdI2[rt.id]; if (wdFn2) { const wd2 = loadWhispers(wdF2, wdFn2); const na2 = wd2.whispers.filter((w:any) => w.type === 'night-action'); if (na2.length) fullNightLog = '\n\n【全剧夜间行动记录（仅供你参考）】\n' + na2.map((w:any) => (w.senderId === 'host' ? '上帝→' + (rt.characters.find((c:any) => c.id === w.recipientId)?.name || w.recipientId) : rt.characters.find((c:any) => c.id === w.senderId)?.name || w.senderId) + '：' + w.content).join('\n'); } } catch {} }
  return `你是主持人「${rt.host.name}」。\n整场讨论结束。\n\n${sc}\n${gl}\n\n角色：\n${cs}\n\n${judge2 ? judge2 + '\n\n' : ''}完整记录：\n${finalRec}${fullNightLog}\n\n请撰写总结陈词：\n1. 主题回顾\n2. 每位角色主要观点\n3. 可疑点与矛盾链条\n4. 如果存在欺诈者/隐藏阵营，给出裁判式判断，但不要编造代码里不存在的硬结算\n5. 达成的共识\n6. 仍存分歧\n7. 后续方向\n\n控制在 400-700 字。`;
}

export function buildResultPrompt(rt: RoundTable, all: Message[]): string {
  const tbm = TokenBudgetManager.create(PromptType.STRUCTURED_RESULT);
  const rec = all.map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  const gl = buildGoalContext(rt);
  const judge = buildJudgePrivateContext(rt);
  const isWw4 = rt.gameMode === 'werewolf' || (rt.modules && (rt.modules.nightAction || rt.modules.vote));
  const judge2 = isWw4 ? buildWerewolfJudgeContext(rt) : judge;

  const sections = { records: rec, goal: gl, judgeContext: judge2 || '' };
  const report = tbm.checkBudgetSections(sections);
  let finalRec = rec;
  if (!report.isWithinBudget) {
    tbm.autoDegrade(sections);
    finalRec = all.slice(-tbm.getConfig().recentMsgMaxCount).map(m => `【${m.characterName} 第${m.round}轮】\n${m.content}`).join('\n\n');
  }

  return `基于以下完整讨论记录，请生成结构化结果。\n\n${gl}\n\n${judge2 ? judge2 + '\n\n' : ''}讨论记录：\n${finalRec}\n\n请以 JSON 格式输出（不要 markdown 代码块包裹）：\n\n{\n  "conclusion": "最终结论（一段话）",\n  "consensusPoints": ["共识1", "共识2"],\n  "disagreementPoints": ["分歧1", "分歧2"],\n  "goalAchieved": "yes|partial|no",\n  "recommendations": ["建议1", "建议2"]\n}`;
}

/**
 * 注入私信上下文到角色发言 Prompt
 * 过滤出：主持人发送给该角色的未读私信 (status='unread')
 * 返回格式化的私信上下文字符串以及本次需要被标记为已读的消息 id 列表。
 * 调用方负责持久化状态更新，避免重复注入。
 */
export function injectWhisperContext(
  characterId: string,
  allWhispers: WhisperMessage[]
): { text: string; readIds: string[] } {
  const pending = allWhispers.filter(
    (w) => w.senderId === 'host' && w.recipientId === characterId && w.status === 'unread'
  );
  if (pending.length === 0) return { text: '', readIds: [] };

  const whisperLines = pending.map((w) => `  主持人: ${w.content}`).join('\n');
  const text = `

【你收到的主持人私信（私密，仅你和主持人可见，不得泄露）】
${whisperLines}

请在发言中自然地回应上述私信内容，但不要直接提及「主持人私下告诉我」或类似泄露私信存在的表述。`;
  return { text, readIds: pending.map((w) => w.id) };
}

// ====================================================================
//  记忆更新解析 / 合并
// ====================================================================

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function cleanShortList(v: unknown, limit: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((x) => x.slice(0, 80));
}

export function uniqueAppend(base: string[], add: string[], cap = 40): string[] {
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

export function parseJsonPayload(text: string): MemoryUpdatePayload | null {
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

/**
 * 解析合并输出的 JSON：{ "public": { "speech": "..." }, "private": { "memoryUpdate": {...} } }
 * 返回提取的 speech 文本和 memoryUpdate payload。
 */
export function parseCharacterOutput(text: string): { speech: string; payload: MemoryUpdatePayload | null } | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const withoutFence = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(withoutFence.slice(start, end + 1)) as any;
    const pub = parsed.public;
    const priv = parsed.private;
    if (!pub || typeof pub.speech !== 'string') return null;
    const payload: MemoryUpdatePayload = {
      privateMemoryAdd: priv?.memoryUpdate?.privateMemoryAdd,
      publicMemoryAdd: priv?.memoryUpdate?.publicMemoryAdd,
      suspicionMapDelta: priv?.memoryUpdate?.suspicionMapDelta,
      strategyPlan: priv?.memoryUpdate?.strategyPlan,
    };
    return { speech: pub.speech, payload };
  } catch {
    try { var m = withoutFence.match(/"speech"\s*:\s*"([^"])*?"\s*[,}]/); if (!m) m = withoutFence.match(/"speech"\s*:\s*"([^"]*)/); if (m) return { speech: m[1], payload: null }; } catch {}
    return null;
  }
}

export function mergeMemoryUpdate(c: Character, payload: MemoryUpdatePayload | null): void {
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
