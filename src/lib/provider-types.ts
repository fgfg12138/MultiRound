// ===== AI 圆桌模拟器 — LLM Provider Types =====

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isCustom: boolean;
}

/** 预设列表已移除。用户通过"添加厂商"手动配置，支持 fetch-models 拉取模型列表。 */
export const BUILTIN_PROVIDERS: Omit<ProviderConfig, 'apiKey' | 'id'>[] = [];

export function maskApiKey(key: string): string {
  if (!key || key.length < 4) return '****';
  return `****${key.slice(-4)}`;
}

export function generateProviderId(): string {
  return `prov_${crypto.randomUUID().slice(0, 8)}`;
}
