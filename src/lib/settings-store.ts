// ===== AI 圆桌模拟器 — Settings Storage (Renderer) =====

import type { ProviderConfig } from '@/types/electron.d';

const api = () => {
  if (!window.electronAPI) {
    throw new Error('请在 Electron 桌面应用中运行此功能。请通过 "npm run dev" 启动，而非单独打开浏览器。');
  }
  return window.electronAPI;
};

export async function listProviders(): Promise<ProviderConfig[]> {
  try {
    return await api().providersList();
  } catch {
    return [];
  }
}

export async function saveProvider(config: ProviderConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    return await api().providersSave(config);
  } catch (e: any) {
    return { ok: false, error: e.message || '保存失败' };
  }
}

export async function deleteProvider(id: string): Promise<void> {
  try { await api().providersDelete(id); } catch {}
}

export async function testProvider(config: ProviderConfig): Promise<{ content?: string; error?: string; code?: string }> {
  try {
    return await api().providersTest(config);
  } catch (e: any) {
    return { error: e.message || '测试失败', code: 'RENDERER_ERROR' };
  }
}

export async function revealProviderKey(providerId: string): Promise<{ revealed: boolean; key?: string; name?: string; error?: string }> {
  try {
    return await api().providersRevealKey(providerId);
  } catch (e: any) {
    return { revealed: false, error: e.message || '操作失败' };
  }
}

export async function getFirstProviderId(): Promise<string | null> {
  const providers = await listProviders();
  return providers.length > 0 ? providers[0].id : null;
}
