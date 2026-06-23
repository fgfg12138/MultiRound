// ===== AI 圆桌模拟器 — LLM Provider API Bridge (Main Process) =====

import { encryptKey, decryptKey, maskKey } from './crypto.js';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isCustom: boolean;
}

/** 磁盘存储格式 — apiKey 已加密 */
export interface StoredProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  model: string;
  isCustom: boolean;
}

interface LlmResponse {
  content?: string;
  error?: string;
  code?: string;
}

// ===== 加密/解密转换 =====

/** 将明文 ProviderConfig 加密为存储格式 */
export function encryptProvider(config: ProviderConfig): StoredProviderConfig {
  return {
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    apiKeyEncrypted: encryptKey(config.apiKey),
    model: config.model,
    isCustom: config.isCustom,
  };
}

/** 将存储格式解密为明文 ProviderConfig */
export function decryptProvider(stored: StoredProviderConfig): ProviderConfig {
  return {
    id: stored.id,
    name: stored.name,
    baseUrl: stored.baseUrl,
    apiKey: decryptKey(stored.apiKeyEncrypted),
    model: stored.model,
    isCustom: stored.isCustom,
  };
}

/** 将存储格式转为渲染进程可安全显示的脱敏对象 */
export function maskProviderForUI(stored: StoredProviderConfig): ProviderConfig {
  return {
    id: stored.id,
    name: stored.name,
    baseUrl: stored.baseUrl,
    apiKey: maskKey(decryptKey(stored.apiKeyEncrypted)),
    model: stored.model,
    isCustom: stored.isCustom,
  };
}

/**
 * 调用指定厂商的 LLM API（OpenAI 兼容协议）
 */
export async function callProviderLLM(
  provider: ProviderConfig,
  messages: { role: string; content: string }[],
  temperature?: number
): Promise<LlmResponse> {
  // 无 API Key 时回落 Mock
  if (!provider.apiKey || provider.apiKey === '') {
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
    const prompt = lastUserMsg?.content || '';
    return { content: generateMockReply(prompt) };
  }

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: 1024,
        temperature: temperature ?? 0.8,
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `API 错误 (${response.status})`;
      if (response.status === 401) errorMsg = `API Key 无效或已过期（${provider.name}）`;
      else if (response.status === 429) errorMsg = `请求过于频繁，请稍后重试（${provider.name}）`;
      else if (response.status >= 500) errorMsg = `${provider.name} 服务端错误，请稍后重试`;
      return { error: errorMsg, code: `HTTP_${response.status}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { error: `${provider.name} 返回了空内容`, code: 'EMPTY_RESPONSE' };
    }
    return { content };
  } catch (err: any) {
    if (err.name === 'AbortError' || err.code === 'ABORT_ERR' || err.type === 'aborted') {
      return { error: `${provider.name} 请求超时，请检查网络或 API 地址`, code: 'TIMEOUT' };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return { error: `无法连接 ${provider.name}，请检查 Base URL 或网络连接`, code: 'NETWORK' };
    }
    return { error: `${provider.name} 请求失败: ${err.message || '未知错误'}`, code: 'UNKNOWN' };
  }
}

/**
 * 测试指定厂商的连接
 */
export async function testProviderConnection(
  provider: ProviderConfig
): Promise<LlmResponse> {
  const testMessages = [{ role: 'user', content: '你好' }];
  const result = await callProviderLLM(provider, testMessages);
  return result;
}

/**
 * Mock 回复生成器（开发/无 Key 时使用）
 */
function generateMockReply(prompt: string): string {
  const nameMatch = prompt.match(/你现在扮演：(.+)/);
  const name = nameMatch ? nameMatch[1] : '参与者';
  const topicMatch = prompt.match(/讨论主题：(.+)/);
  const topic = topicMatch ? topicMatch[1] : '这个主题';
  const roundMatch = prompt.match(/当前是第 (\d+) 轮/);
  const round = roundMatch ? parseInt(roundMatch[1]) : 1;

  const mockResponses: Record<string, string[]> = {
    '技术派': [
      `关于「${topic}」，我认为技术可行性是最关键的考量因素。从技术角度来看，现有的基础设施和团队能力可以支撑这个方向，但在数据安全和系统稳定性方面还需要做更多的评估。`,
      `在听取大家的意见后，我想补充一点：虽然用户体验很重要，但如果没有扎实的技术架构支撑，所有的功能特性都是空中楼阁。建议采用渐进式的技术方案。`,
      `经过几轮讨论，我的最终看法是：这个方向值得投入，但需要建立明确的技术评估标准和分阶段实施的路线图。先做小规模POC验证关键技术难点。`,
    ],
    '用户代表': [
      `我关心的是「${topic}」是否能真正解决实际问题。很多时候产品功能很丰富，但用户真正需要的是最基础的那几个功能。希望多从用户实际使用场景出发思考。`,
      `我同意技术稳定很重要，但我更想强调用户感受。再稳定的系统，用户不知道怎么用也是失败的。建议在产品设计阶段就让目标用户参与测试。`,
      `核心是要回到用户价值。技术选型和功能设计都应该以"用户是否真的需要"为标准。建议建立用户反馈的快速响应机制。`,
    ],
    '市场派': [
      `从市场来看，「${topic}」有明确的用户需求，市场空间足够大。关键是要找到差异化的切入点，而不是做同质化产品。目前市场上还没有完全满足这个需求的产品。`,
      `技术风险确实存在，但市场窗口期不等人。建议采用MVP策略，用最小功能集快速验证市场反应，再根据反馈迭代优化。`,
      `市场前景乐观。关键是找到技术和市场的平衡点，在保证核心体验的前提下快速推向市场。建议制定3个月和6个月两个里程碑。`,
    ],
    '设计派': [
      `我认为用户体验的流畅性和视觉的一致性同样重要。好的设计不仅仅是好看，更重要的是让用户能自然地完成任务流程，减少认知负担。`,
      `我支持用户代表的观点。从设计角度，建议先梳理核心用户旅程，找出关键交互节点，在这些节点上投入设计资源。`,
      `设计应贯穿产品开发全过程，而不是最后才来"美化"。建议建立设计规范体系，确保多端体验一致性。`,
    ],
  };

  const fallbacks = [
    `关于「${topic}」，这是一个值得深入探讨的方向。需要综合考虑多方面因素，找到最适合的方案。`,
    `我同意其他角色的观点，同时补充一些新的角度。在理想和现实之间找到平衡点，做好优先级管理。`,
    `这个项目有很大潜力。关键是形成共识，明确目标和执行路径，在执行中保持灵活性。`,
  ];

  const responses = mockResponses[name] || fallbacks;
  const idx = Math.min(round - 1, responses.length - 1);
  return responses[idx] || responses[0];
}
