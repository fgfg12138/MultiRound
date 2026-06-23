// ===== AI 圆桌模拟器 — LLM Provider Types =====

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isCustom: boolean;
}

export const BUILTIN_PROVIDERS: Omit<ProviderConfig, 'apiKey' | 'id'>[] = [
  { name: 'DeepSeek',         baseUrl: 'https://api.deepseek.com/v1',                     model: '', isCustom: false },
  { name: '智谱 GLM',          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',            model: '', isCustom: false },
  { name: '月之暗面 Kimi',      baseUrl: 'https://api.moonshot.cn/v1',                      model: '', isCustom: false },
  { name: '阶跃星辰 MiMo',      baseUrl: 'https://api.stepfun.com/v1',                      model: '', isCustom: false },
  { name: '阿里 通义千问 Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '', isCustom: false },
];

export function maskApiKey(key: string): string {
  if (!key || key.length < 4) return '****';
  return `****${key.slice(-4)}`;
}

export function generateProviderId(): string {
  return `prov_${crypto.randomUUID().slice(0, 8)}`;
}
