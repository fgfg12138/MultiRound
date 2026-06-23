// ===== AI 圆桌模拟器 — LLM Provider Types & Built-in Presets =====

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isCustom: boolean;
}

export const BUILTIN_PROVIDERS: Omit<ProviderConfig, 'apiKey' | 'id'>[] = [
  // ===== DeepSeek =====
  { name: 'DeepSeek V3',      baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',        isCustom: false },
  { name: 'DeepSeek R1',      baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner',    isCustom: false },

  // ===== 智谱 GLM =====
  { name: 'GLM-5.2',          baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2',      isCustom: false },
  { name: 'GLM-5.1',          baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.1',      isCustom: false },

  // ===== 月之暗面 Kimi =====
  { name: 'Kimi K2.7 Code',   baseUrl: 'https://api.moonshot.cn/v1',      model: 'kimi-k2.7-code',   isCustom: false },
  { name: 'Kimi K2.6',       baseUrl: 'https://api.moonshot.cn/v1',      model: 'kimi-k2.6',        isCustom: false },

  // ===== 阶跃星辰 StepFun =====
  { name: 'MiMo-V2.5',       baseUrl: 'https://api.stepfun.com/v1',      model: 'mimo-v2.5',        isCustom: false },
  { name: 'MiMo-V2.5-Pro',   baseUrl: 'https://api.stepfun.com/v1',      model: 'mimo-v2.5-pro',    isCustom: false },

  // ===== MiniMax =====
  { name: 'MiniMax M3',       baseUrl: 'https://api.minimax.chat/v1',     model: 'minimax-m3',       isCustom: false },
  { name: 'MiniMax M2.7',     baseUrl: 'https://api.minimax.chat/v1',     model: 'minimax-m2.7',     isCustom: false },

  // ===== 阿里 通义千问 Qwen =====
  { name: 'Qwen3.7 Max',      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-max',   isCustom: false },
  { name: 'Qwen3.7 Plus',     baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-plus',  isCustom: false },
  { name: 'Qwen3.6 Plus',     baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.6-plus',  isCustom: false },
];

export function maskApiKey(key: string): string {
  if (!key || key.length < 4) return '****';
  return `****${key.slice(-4)}`;
}

export function generateProviderId(): string {
  return `prov_${crypto.randomUUID().slice(0, 8)}`;
}

/** 按公司分组的预设列表（供 UI 下拉分组显示） */
export const PROVIDER_GROUPS: { company: string; models: typeof BUILTIN_PROVIDERS }[] = [
  { company: 'DeepSeek（深度求索）',    models: BUILTIN_PROVIDERS.filter(p => p.baseUrl.includes('deepseek')) },
  { company: '智谱 GLM',             models: BUILTIN_PROVIDERS.filter(p => p.baseUrl.includes('bigmodel')) },
  { company: '月之暗面 Kimi',          models: BUILTIN_PROVIDERS.filter(p => p.baseUrl.includes('moonshot')) },
  { company: '阶跃星辰 StepFun',       models: BUILTIN_PROVIDERS.filter(p => p.baseUrl.includes('stepfun')) },
  { company: 'MiniMax',              models: BUILTIN_PROVIDERS.filter(p => p.baseUrl.includes('minimax')) },
  { company: '阿里 通义千问 Qwen',      models: BUILTIN_PROVIDERS.filter(p => p.baseUrl.includes('dashscope')) },
];
