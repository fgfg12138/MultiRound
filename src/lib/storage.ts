// ===== AI 圆桌模拟器 — Storage Layer (File-based via IPC) =====

import type { RoundTable, Message } from './types';

const api = () => window.electronAPI;

const REQUIRES_ELECTRON =
  '此功能需要 Electron 运行环境。请通过 "npm run dev" 启动 Electron 桌面应用。';

function ensureElectron() {
  if (!window.electronAPI) {
    throw new Error(REQUIRES_ELECTRON);
  }
}

export async function saveRoundTable(rt: RoundTable): Promise<void> {
  ensureElectron();
  await api().dataSaveRoundtable(rt);
}

export async function loadRoundTable(id: string): Promise<RoundTable | null> {
  ensureElectron();
  return await api().dataLoadRoundtable(id);
}

export async function saveMessages(
  roundTableId: string,
  msgs: Message[]
): Promise<void> {
  ensureElectron();
  await api().dataSaveMessages(roundTableId, msgs);
}

export async function loadMessages(roundTableId: string): Promise<Message[]> {
  ensureElectron();
  return await api().dataLoadMessages(roundTableId);
}

export async function listRoundTables(): Promise<RoundTable[]> {
  ensureElectron();
  return await api().dataListRoundtables();
}

export async function deleteRoundTable(id: string): Promise<void> {
  ensureElectron();
  await api().dataDeleteRoundtable(id);
}
