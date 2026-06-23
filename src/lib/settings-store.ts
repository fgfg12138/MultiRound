// ===== AI 圆桌模拟器 — Settings Storage (Renderer) =====

import type { ProviderConfig } from '@/types/electron.d';

const api = () => window.electronAPI;

function checkApi() {
  if (!window.electronAPI) {
    throw new Error('请在 Electron 桌面应用中运行此功能');
  }
}

/** 获取所有已配置的 LLM 厂商列表 */
export async function listProviders(): Promise<ProviderConfig[]> {
  checkApi();
  try {
    return await api().providersList();
  } catch {
    return [];
  }
}

/** 保存一个厂商配置 */
export async function saveProvider(config: ProviderConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    return await api().providersSave(config);
  } catch (e: any) {
    return { ok: false, error: e.message || '保存失败' };
  }
}

/** 删除一个厂商配置 */
export async function deleteProvider(id: string): Promise<void> {
  try {
    await api().providersDelete(id);
  } catch {
    // silently fail
  }
}

/** 测试厂商连接 */
export async function testProvider(
  config: ProviderConfig
): Promise<{ content?: string; error?: string; code?: string }> {
  try {
    return await api().providersTest(config);
  } catch (e: any) {
    return { error: e.message || '测试失败', code: 'RENDERER_ERROR' };
  }
}

/** 临时揭示 API Key（需要用户确认） */
export async function revealProviderKey(
  providerId: string
): Promise<{ revealed: boolean; key?: string; name?: string; error?: string }> {
  try {
    return await api().providersRevealKey(providerId);
  } catch (e: any) {
    return { revealed: false, error: e.message || '操作失败' };
  }
}

/** 获取第一个可用的 provider ID */
export async function getFirstProviderId(): Promise<string | null> {
  const providers = await listProviders();
  return providers.length > 0 ? providers[0].id : null;
}
