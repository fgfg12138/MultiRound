// ===== AI 圆桌模拟器 — LLM Provider Types & Built-in Presets =====

export interface ProviderConfig {
  id: string;
  name: string;          // 显示名称 e.g. "DeepSeek"
  baseUrl: string;       // e.g. "https://api.deepseek.com/v1"
  apiKey: string;        // 存储明文，发送时脱敏显示
  model: string;         // e.g. "deepseek-chat"
  isCustom: boolean;     // 用户自定义还是预设
}

/** 内置预设厂商（均为 OpenAI 兼容协议） */
export const BUILTIN_PROVIDERS: Omit<ProviderConfig, 'apiKey' | 'id'>[] = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    isCustom: false,
  },
  {
    name: 'DeepSeek-Reasoner',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-reasoner',
    isCustom: false,
  },
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    isCustom: false,
  },
  {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    isCustom: false,
  },
  {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    isCustom: false,
  },
  {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    isCustom: false,
  },
  {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    isCustom: false,
  },
  {
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-latest',
    isCustom: false,
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-4-maverick-17b-128e-instruct',
    isCustom: false,
  },
  {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3-0324',
    isCustom: false,
  },
  {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    isCustom: false,
  },
  {
    name: '零一万物',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    model: 'yi-large',
    isCustom: false,
  },
];

/** 脱敏 API Key，仅显示最后4位 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 4) return '****';
  return `****${key.slice(-4)}`;
}

/** 生成唯一的 provider ID */
export function generateProviderId(): string {
  return `prov_${crypto.randomUUID().slice(0, 8)}`;
}
