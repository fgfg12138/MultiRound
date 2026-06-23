// ===== AI 圆桌模拟器 — Prompt Templates =====

import type { Character, Host, Message } from './types';

export function buildSystemPrompt(): string {
  return `你是一个AI圆桌讨论模拟系统。你需要扮演多个角色进行一场有主持人的圆桌讨论。

规则：
1. 每次只扮演一个角色或主持人发言
2. 严格遵循给出的角色身份、立场和说话风格
3. 每次发言控制在150-300字之间
4. 你的发言必须有实质内容，不能空洞套话
5. 必须参考前面其他角色的发言，进行回应或辩论
6. 禁止重复自己之前的观点
7. 使用中文回答`;
}

export function buildHostOpeningPrompt(
  topic: string,
  host: Host,
  characters: Character[]
): string {
  const charList = characters
    .map(
      (c, i) =>
        `${i + 1}. ${c.name}（${c.role}）—— 立场：${c.stance}，说话风格：${c.style}`
    )
    .join('\n');

  return `你作为主持人「${host.name}」，风格：${host.style}。

请为以下圆桌讨论致开场白：

讨论主题：${topic}

参与角色：
${charList}

讨论将进行3轮：
第1轮：每位角色表达初始观点
第2轮：主持人追问补充，角色深入讨论
第3轮：收束总结

请用主持人的口吻，热情地介绍主题和各位参与者，说明讨论规则，然后请第一位角色开始发言。

格式：先说"开场白"，然后说"下面有请【角色名】首先发言"。`;
}

export function buildCharacterSpeechPrompt(
  topic: string,
  character: Character,
  round: number,
  previousMessages: Message[],
  hostFollowup?: string
): string {
  const recentContext = previousMessages
    .slice(-6)
    .map((m) => `【${m.characterName}（第${m.round}轮）】\n${m.content}`)
    .join('\n\n');

  const followupContext = hostFollowup
    ? `\n\n主持人向你提问：${hostFollowup}`
    : '';

  return `你现在扮演：${character.name}

角色身份：${character.role}
立场观点：${character.stance}
说话风格：${character.style}

当前是第 ${round} 轮讨论。
讨论主题：${topic}

之前的发言记录：
${recentContext}
${followupContext}

请严格遵守：
1. 以「${character.name}」的身份说话，语气和观点必须符合你的角色设定
2. 参考前面其他人的发言，表示赞同、补充或反对
3. 提出有实质内容的新观点，不要空洞套话
4. 控制在150-300字
5. 用第一人称「我」来发言
6. 不要重复自己之前说过的内容`;
}

export function buildHostSummaryPrompt(
  topic: string,
  host: Host,
  round: number,
  messages: Message[],
  characters: Character[]
): string {
  const roundMessages = messages
    .filter((m) => m.round === round)
    .map((m) => `【${m.characterName}】\n${m.content}`)
    .join('\n\n');

  const charNames = characters.map((c) => c.name).join('、');

  return `你作为主持人「${host.name}」，风格：${host.style}。

第 ${round} 轮讨论刚刚结束。讨论主题：${topic}

本轮发言记录：
${roundMessages}

请完成以下任务：
1. 总结第 ${round} 轮每位角色的核心观点
2. 指出角色之间有哪些共识和分歧
3. 对模糊或不够深入的观点提出追问
4. 引出下一轮需要深入讨论的问题
5. 请下一位角色（${charNames}）准备回应这些追问

控制在200-350字。保持主持人中立、控场的风格。`;
}

export function buildHostFinalSummaryPrompt(
  topic: string,
  host: Host,
  allMessages: Message[],
  characters: Character[]
): string {
  const allRecords = allMessages
    .map((m) => `【${m.characterName}（第${m.round}轮）】\n${m.content}`)
    .join('\n\n');

  const charSummary = characters
    .map((c, i) => `${i + 1}. ${c.name}（${c.role}）—— ${c.stance}`)
    .join('\n');

  return `你作为主持人「${host.name}」，风格：${host.style}。

整场圆桌讨论已经结束。讨论主题：${topic}

参与角色：
${charSummary}

完整讨论记录：
${allRecords}

请撰写一份完整的总结陈词，包括：
1. 讨论主题回顾
2. 每位角色的主要观点提炼
3. 讨论中形成的共识
4. 仍然存在的分歧
5. 值得继续思考的问题或方向
6. 对参与者的感谢

控制在400-600字。总结要有深度，提炼出真正的洞见，而不仅仅是罗列观点。`;
}
