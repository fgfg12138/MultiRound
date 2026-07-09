// ===== AI 圆桌模拟器 — Electron Main Process =====

import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, dialog, shell } from 'electron';
import path from 'node:path';

import fs from 'node:fs';
import Store from 'electron-store';
import { callProviderLLM, testProviderConnection, encryptProvider, decryptProvider, maskProviderForUI, ProviderConfig, StoredProviderConfig } from './providers.js';
import { startDiscussion, appendRound } from './discussion-runner.js';
import { stopDiscussion, pauseDiscussion, resumeDiscussion, injectUserHostInput } from './control.js';
import { handleWhisperReply } from './whisper-runner.js';
import { getDataDir, ensureDir, atomicWriteJson, loadIndex, saveIndex, saveWhispers, loadWhispers } from './data-store.js';
import type { WhisperMessage } from './types.js';
import { buildSysPrompt, buildCharSpeech } from './prompts.js';
import { resolveProvider } from './runner-state.js';

interface Schema {
  [key: string]: unknown;
}

const store = new Store<Schema>({ name: 'multiround', projectName: 'multiround' } as any);

let mainWindow: BrowserWindow | null = null;

// ===== Menu Builder =====

function buildMenu(win: BrowserWindow): Menu {
  const send = (action: string) => {
    win.webContents.send('menu-action', action);
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建圆桌',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('new-roundtable'),
        },
        {
          label: '打开设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => send('open-settings'),
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        {
          label: '撤销',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo',
        },
        {
          label: '复制',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy',
        },
        {
          label: '全选',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll',
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          role: 'reload',
        },
        {
          label: '开发者工具',
          accelerator: 'CmdOrCtrl+Shift+I',
          role: 'toggleDevTools',
        },
        { type: 'separator' },
        {
          label: '实际大小',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom',
        },
        {
          label: '放大',
          accelerator: 'CmdOrCtrl+=',
          role: 'zoomIn',
        },
        {
          label: '缩小',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut',
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 MultiRound',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于 MultiRound',
              message: 'MultiRound v0.3.0 Beta',
              detail:
                '让多个 AI 角色围绕一个主题进行主持式圆桌讨论。\n\n' +
                '技术栈: Electron + React + TypeScript\n' +
                '支持多厂商 LLM（OpenAI 兼容协议）',
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MultiRound',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set menu
  const menu = buildMenu(mainWindow);
  Menu.setApplicationMenu(menu);

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===== Storage Helpers =====

const PROVIDER_PREFIX = 'provider:';

function getProviders(): ProviderConfig[] {
  const allKeys = Object.keys(store.store).filter((k) => k.startsWith(PROVIDER_PREFIX));
  const providers: ProviderConfig[] = [];
  for (const key of allKeys) {
    const raw = store.get(key);
    if (typeof raw === 'string') {
      try {
        const stored = JSON.parse(raw) as StoredProviderConfig;
        providers.push(decryptProvider(stored));
      } catch { /* skip corrupt data */ }
    }
  }
  return providers;
}

/** 获取脱敏后的列表（用于渲染进程展示） */
function getMaskedProviders(): ProviderConfig[] {
  const allKeys = Object.keys(store.store).filter((k) => k.startsWith(PROVIDER_PREFIX));
  const providers: ProviderConfig[] = [];
  for (const key of allKeys) {
    const raw = store.get(key);
    if (typeof raw === 'string') {
      try {
        const stored = JSON.parse(raw) as StoredProviderConfig;
        providers.push(maskProviderForUI(stored));
      } catch { /* skip corrupt data */ }
    }
  }
  return providers;
}

function saveProviderToStore(config: ProviderConfig): void {
  const stored = encryptProvider(config);
  store.set(`${PROVIDER_PREFIX}${config.id}`, JSON.stringify(stored));
}

function deleteProviderFromStore(id: string): void {
  store.delete(`${PROVIDER_PREFIX}${id}`);
}

// ===== IPC Handlers =====

// LLM discussion (with provider support)
ipcMain.handle('discuss:generate', async (_event, messages: { role: string; content: string }[], providerId?: string) => {
  try {
    let provider: ProviderConfig | undefined;
    if (providerId) {
      const raw = store.get(`${PROVIDER_PREFIX}${providerId}`);
      if (typeof raw === 'string') {
        try {
          const stored = JSON.parse(raw) as StoredProviderConfig;
          provider = decryptProvider(stored);
        } catch { /* ignore */ }
      }
    }
    if (!provider) {
      const providers = getProviders();
      provider = providers[0];
    }
    if (!provider) {
      const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
      const prompt = lastUserMsg?.content || '';
      return { content: generateMockFallback(prompt) };
    }
    return await callProviderLLM(provider, messages);
  } catch (error: any) {
    return { error: error.message || 'LLM 调用失败', code: 'IPC_ERROR' };
  }
});

// Provider CRUD (加密存储，脱敏返回)
ipcMain.handle('providers:list', async () => getMaskedProviders());

ipcMain.handle('providers:save', async (_event, config: ProviderConfig) => {
  try {
    saveProviderToStore(config);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message || '保存失败' };
  }
});

ipcMain.handle('providers:delete', async (_event, id: string) => {
  deleteProviderFromStore(id);
  return { ok: true };
});

// 测试时从存储解密拿到明文 Key
ipcMain.handle('providers:test', async (_event, config: ProviderConfig) => {
  // 如果是从列表传来的脱敏对象，从 store 重新获取解密版本
  const raw = store.get(`${PROVIDER_PREFIX}${config.id}`);
  if (typeof raw === 'string') {
    try {
      const stored = JSON.parse(raw) as StoredProviderConfig;
      const decrypted = decryptProvider(stored);
      return await testProviderConnection(decrypted);
    } catch { /* fall through */ }
  }
  return await testProviderConnection(config);
});

// 谨慎揭示明文 API Key（需要用户确认）
ipcMain.handle('providers:reveal-key', async (_event, providerId: string) => {
  const raw = store.get(`${PROVIDER_PREFIX}${providerId}`);
  if (typeof raw !== 'string') return { error: '未找到厂商' };

  try {
    const stored = JSON.parse(raw) as StoredProviderConfig;
    const decrypted = decryptProvider(stored);

    // 弹出原生确认对话框
    if (!mainWindow) return { error: '窗口未就绪' };
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '确认查看 API Key',
      message: `您正在查看「${decrypted.name}」的 API Key`,
      detail: `这将临时显示完整的 API Key。请确认周围没有其他人可以看到您的屏幕。\n\n30 秒后密钥将自动隐藏。`,
      buttons: ['取消', '确认查看'],
      defaultId: 0,
      cancelId: 0,
    });

    if (result.response !== 1) return { revealed: false };

    return { revealed: true, key: decrypted.apiKey, name: decrypted.name };
  } catch {
    return { error: '数据损坏' };
  }
});

// ===== Fetch Models =====
ipcMain.handle('providers:fetch-models', async (_event, config: { baseUrl: string; apiKey: string }) => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/models`, { headers });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const json = await res.json();
    const models: string[] = (json.data || []).map((m: any) => m.id).sort();
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, error: e.message || '获取模型列表失败' };
  }
});

// Generic storage
ipcMain.handle('storage:get', async (_event, key: string) => store.get(key));

ipcMain.handle('storage:set', async (_event, key: string, value: unknown) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('storage:delete', async (_event, key: string) => {
  store.delete(key);
  return true;
});

ipcMain.handle('storage:list', async (_event, prefix: string) => {
  return Object.keys(store.store).filter((k) => k.startsWith(prefix));
});

// ===== File-based Data Storage (roundtables & messages) =====
function cleanTmp(dataDir: string, filename: string): void {
  try { fs.unlinkSync(path.join(dataDir, `${filename}.json.tmp`)); } catch { /* ignore */ }
  try { fs.unlinkSync(path.join(dataDir, `${filename}_messages.json.tmp`)); } catch { /* ignore */ }
  try { fs.unlinkSync(path.join(dataDir, `${filename}.backup-v1.json`)); } catch { /* ignore */ }
}

/** Create a backup copy of a V1 file before migrating it to V3.
 *  Only creates the backup once — skips if the backup already exists.
 */
function backupBeforeMigrate(dataDir: string, filename: string): void {
  const srcPath = path.join(dataDir, `${filename}.json`);
  const backupPath = path.join(dataDir, `${filename}.backup-v1.json`);
  if (fs.existsSync(srcPath) && !fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(srcPath, backupPath);
    } catch { /* ignore — migration continues without backup */ }
  }
}

/** Sanitize a string for use as a filename.
 *  Rules:
 *    - Keep: Chinese chars, letters, digits, `-`, `_`, `.`
 *    - Replace illegal chars (Windows: < > : " / \ | ? * , control chars) with `_`
 *    - Collapse consecutive `_` into one
 *    - Strip leading/trailing `_`, `.`, and whitespace
 *    - Empty → "untitled"
 *    - Truncate to 100 bytes at UTF-8 character boundary
 */
function sanitizeFilename(name: string): string {
  let s = String(name ?? '');
  // Replace any char that is NOT a safe printable ASCII, CJK, or common symbol
  // Keep: a-z A-Z 0-9 \u4e00-\u9fff (CJK), \u3000-\u303f (CJK punct), \u00c0-\u024f (Latin ext), `-`, `_`, `.`
  s = s.replace(/[^\w\s\-\u4e00-\u9fff\u3000-\u303f\u00c0-\u024f.]/g, '_');
  // Also replace whitespace with _
  s = s.replace(/\s+/g, '_');
  // Collapse consecutive _
  s = s.replace(/_+/g, '_');
  // Strip leading/trailing special chars
  s = s.replace(/^[_.\s]+/, '').replace(/[_.\s]+$/, '');
  // Empty → untitled
  if (!s || s.length === 0) {
    s = 'untitled';
  }
  // Truncate to 100 UTF-8 bytes at a character boundary
  let bytes = 0;
  let safeLen = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (bytes > 95) break; // leave room for 4 chars extra (`-999`)
    safeLen = i + 1;
  }
  return s.slice(0, safeLen) || 'untitled';
}

/** Generate a human-readable filename: topic-YYYY-MM-DZ, auto-deduplicate on collision */
function generateFilename(dataDir: string, topic: string, createdAt: number): string {
  const date = new Date(createdAt).toISOString().slice(0, 10);
  const safeTopic = sanitizeFilename(topic) || 'untitled';
  let base = `${safeTopic}-${date}`;

  let filename = base;
  let counter = 2;
  while (fs.existsSync(path.join(dataDir, `${filename}.json`))) {
    filename = `${base}-${counter}`;
    counter++;
  }

  return filename;
}

// ===== Schema Migration =====

const CURRENT_SCHEMA_VERSION = 3;

function detectVersion(data: any): number {
  return data?.schemaVersion ?? 0;
}

function synthesizePersona(c: any): string {
  const parts: string[] = [];
  if (c.role) parts.push(`身份：${c.role}`);
  if (c.stance) parts.push(`立场：${c.stance}`);
  if (c.style) parts.push(`风格：${c.style}`);
  return parts.join('；') || c.name || '';
}

function migrateV1toV3(data: any): any {
  const topic = data.topic || '';
  const totalRounds = data.totalRounds;

  return {
    id: data.id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    topic,
    totalRounds,
    scenario: { title: topic, description: topic },
    host: {
      name: data.host?.name || '主持人',
      style: data.host?.style || '中立',
      mode: 'visible',
    },
    characters: (data.characters || []).map((c: any) => ({
      id: c.id,
      name: c.name || '',
      role: c.role || '',
      persona: c.persona || synthesizePersona(c),
      providerId: c.providerId || 'default',
      stance: c.stance,
      style: c.style,
      motivation: c.motivation,
      expertise: c.expertise,
      relationship: c.relationship,
      constraints: c.constraints,
      teamId: c.teamId,
    })),
    rules: {
      roundCount: totalRounds,
      speakOrder: 'sequential',
      maxSpeechLength: 300,
      requireResponse: false,
      allowConsecutiveSpeech: false,
      scoringEnabled: false,
    },
    goal: { type: 'custom', description: topic },
    status: data.status || 'created',
    createdAt: data.createdAt || Date.now(),
    // Pass through optional fields
    teams: data.teams,
    result: data.result,
    runtimeControl: data.runtimeControl,
  };
}

function normalizeToV3(data: any): any {
  if (!data || typeof data !== 'object') {
    return migrateV1toV3({ id: data?.id || 'corrupt', createdAt: Date.now() });
  }
  const ver = data.schemaVersion ?? 0;
  if (ver >= 3) return data; // already V3
  const v2 = migrateV1toV3(data); // V1→V3 (V2 structure was same as V1→V3 except version number)
  if (ver >= 2) {
    // V2→V3: ensure newer optional fields exist
    v2.host = { ...v2.host, secretAccess: v2.host?.secretAccess || 'judge' };
    v2.characters = (v2.characters || []).map((c: any) => ({
      ...c,
      temperature: c.temperature ?? undefined,
      secret: c.secret || undefined,
      memory: c.memory || undefined,
    }));
  }
  return v2;
}

// ===== Data IPC Handlers =====

ipcMain.handle('data:get-path', async () => getDataDir());

ipcMain.handle('data:save-roundtable', async (_event, rt: any) => {
  const dataDir = getDataDir();
  ensureDir(dataDir);

  // Normalize to V3 in memory
  const v3 = normalizeToV3(rt);

  // Load index
  const index = loadIndex(dataDir);
  let filename = index[v3.id];

  // If this was V1 data, create backup before overwriting
  if (filename && detectVersion(rt) < 2) {
    backupBeforeMigrate(dataDir, filename);
  }

  // Generate new filename if this is a new roundtable
  if (!filename) {
    filename = generateFilename(dataDir, v3.scenario?.title || v3.topic, v3.createdAt);
    index[v3.id] = filename;
    saveIndex(dataDir, index);
  }

  // Atomically write metadata file
  atomicWriteJson(path.join(dataDir, `${filename}.json`), v3);

  return { ok: true, filename };
});

ipcMain.handle('data:save-messages', async (_event, id: string, msgs: any[]) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[id];
  if (!filename) return { ok: false, error: '未找到该圆桌' };

  // Atomically write messages file
  atomicWriteJson(path.join(dataDir, `${filename}_messages.json`), msgs);
  return { ok: true };
});

ipcMain.handle('data:load-roundtable', async (_event, id: string) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[id];
  if (!filename) return null;

  // Try .json first, then check if .tmp exists (recovery from interrupted write)
  let filePath = path.join(dataDir, `${filename}.json`);
  if (!fs.existsSync(filePath)) {
    const tmpPath = filePath + '.tmp';
    if (fs.existsSync(tmpPath)) {
      filePath = tmpPath; // recover from .tmp
    } else {
      return null;
    }
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return normalizeToV3(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('data:load-messages', async (_event, id: string) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[id];
  if (!filename) return [];

  let filePath = path.join(dataDir, `${filename}_messages.json`);
  if (!fs.existsSync(filePath)) {
    const tmpPath = filePath + '.tmp';
    if (fs.existsSync(tmpPath)) {
      filePath = tmpPath;
    } else {
      return [];
    }
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
});

ipcMain.handle('data:list-roundtables', async () => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const tables: any[] = [];

  for (const [id, filename] of Object.entries(index)) {
    const filePath = path.join(dataDir, `${filename}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const rt = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        tables.push(normalizeToV3(rt));
      } catch {
        // skip corrupt file
      }
    }
  }

  return tables.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
});

ipcMain.handle('data:delete-roundtable', async (_event, id: string) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[id];
  if (!filename) return { ok: true };

  // Delete metadata, messages, AND any .tmp leftovers
  try { fs.unlinkSync(path.join(dataDir, `${filename}.json`)); } catch { /* ignore */ }
  try { fs.unlinkSync(path.join(dataDir, `${filename}_messages.json`)); } catch { /* ignore */ }
  cleanTmp(dataDir, filename);

  // Update index
  delete index[id];
  saveIndex(dataDir, index);

  return { ok: true };
});

ipcMain.handle('data:delete-all-roundtables', async (_event, id?: string) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);

  if (id) {
    // Single delete — inline the logic (ipcMain.emit cannot invoke .handle)
    const filename = index[id];
    if (filename) {
      try { fs.unlinkSync(path.join(dataDir, `${filename}.json`)); } catch {}
      try { fs.unlinkSync(path.join(dataDir, `${filename}_messages.json`)); } catch {}
      cleanTmp(dataDir, filename);
      delete index[id];
      saveIndex(dataDir, index);
    }
    return { ok: true };
  }

  // Delete ALL roundtables
  for (const filename of Object.values(index)) {
    try { fs.unlinkSync(path.join(dataDir, `${filename}.json`)); } catch {}
    try { fs.unlinkSync(path.join(dataDir, `${filename}_messages.json`)); } catch {}
    cleanTmp(dataDir, filename);
  }

  // Reset index
  saveIndex(dataDir, {});
  return { ok: true };
});

ipcMain.handle('data:export-roundtable', async (_event, id: string) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[id];
  if (!filename) return { error: '未找到该圆桌' };

  const rtPath = path.join(dataDir, `${filename}.json`);
  const msgsPath = path.join(dataDir, `${filename}_messages.json`);

  // Try .tmp recovery for .json
  let actualRtPath = rtPath;
  if (!fs.existsSync(rtPath)) {
    const tmpRt = rtPath + '.tmp';
    if (fs.existsSync(tmpRt)) actualRtPath = tmpRt;
  }
  if (!fs.existsSync(actualRtPath)) return { error: '数据文件丢失' };

  let rt: any;
  try {
    rt = JSON.parse(fs.readFileSync(actualRtPath, 'utf-8'));
    rt = normalizeToV3(rt);  // normalize to ensure V2 fields
  } catch {
    return { error: '数据文件损坏' };
  }

  let actualMsgsPath = msgsPath;
  if (!fs.existsSync(msgsPath)) {
    const tmpMsgs = msgsPath + '.tmp';
    if (fs.existsSync(tmpMsgs)) actualMsgsPath = tmpMsgs;
  }

  const msgs: any[] = fs.existsSync(actualMsgsPath)
    ? (() => { try { return JSON.parse(fs.readFileSync(actualMsgsPath, 'utf-8')); } catch { return []; } })()
    : [];

  const lines: string[] = [];
  lines.push(`主题：${rt.topic}`);
  lines.push(`主持人：${rt.host?.name || ''}`);
  lines.push(`参与角色：${(rt.characters || []).map((c: any) => c.name).join('、')}`);
  lines.push(`讨论轮数：${rt.totalRounds === 0 ? "不预设轮数（最多 999 轮）" : rt.totalRounds + " 轮"}`);
  lines.push(`创建时间：${new Date(rt.createdAt || Date.now()).toLocaleString('zh-CN')}`);
  lines.push('='.repeat(40));
  lines.push('');
  for (const msg of msgs) {
    const roundLabel = msg.type === 'final_summary' ? '' : `[第${msg.round}轮]`;
    lines.push(`【${msg.characterName}】${roundLabel}`);
    lines.push(msg.content || '');
    if (msg.error) lines.push(`⚠ ${msg.error}`);
    lines.push('');
  }
  return { content: lines.join('\n') };
});

// ===== Index Repair =====

ipcMain.handle('data:repair-index', async () => {
  const dataDir = getDataDir();
  ensureDir(dataDir);
  const index = loadIndex(dataDir);
  const errors: string[] = [];
  let removed = 0;
  let repaired = 0;

  // Phase 1: remove index entries that point to missing files
  const orphanIds: string[] = [];
  for (const [id, filename] of Object.entries(index)) {
    const filePath = path.join(dataDir, `${filename}.json`);
    if (!fs.existsSync(filePath)) {
      orphanIds.push(id);
    }
  }
  for (const id of orphanIds) {
    delete index[id];
    removed++;
  }
  if (orphanIds.length > 0) {
    try { saveIndex(dataDir, index); } catch (e: any) { errors.push(`保存索引失败: ${e.message}`); }
  }

  // Phase 2: scan data dir for JSON files not in index, try to add them
  let dirEntries: string[];
  try {
    dirEntries = fs.readdirSync(dataDir);
  } catch (e: any) {
    return { repaired: 0, removed, errors: [`读取目录失败: ${e.message}`] };
  }

  const indexedFiles = new Set(Object.values(index).map((f) => `${f}.json`));

  for (const entry of dirEntries) {
    // Skip non-JSON, index file, messages files, .tmp files
    if (!entry.endsWith('.json')) continue;
    if (entry === '_index.json') continue;
    if (entry.endsWith('_messages.json')) continue;
    if (entry.endsWith('.tmp')) continue;
    if (entry.endsWith('.json.tmp')) continue;
    if (indexedFiles.has(entry)) continue;

    // Try to parse and extract id
    const entryPath = path.join(dataDir, entry);
    try {
      const content = JSON.parse(fs.readFileSync(entryPath, 'utf-8'));
      const v2 = normalizeToV3(content);
      if (v2 && v2.id) {
        // Check if filename already ends with .json
        const baseName = entry.replace(/\.json$/, '');
        if (!index[v2.id]) {
          index[v2.id] = baseName;
          repaired++;
          indexedFiles.add(entry);
        }
      } else {
        errors.push(`文件 ${entry} 缺少有效的 id 字段，已跳过`);
      }
    } catch {
      errors.push(`文件 ${entry} JSON 格式损坏，已跳过`);
    }
  }

  if (repaired > 0) {
    try { saveIndex(dataDir, index); } catch (e: any) { errors.push(`保存索引失败: ${e.message}`); }
  }

  return { repaired, removed, errors };
});

// ===== Open Data Directory =====

ipcMain.handle('data:open-directory', async () => {
  const dataDir = getDataDir();
  ensureDir(dataDir);
  await shell.openPath(dataDir);
});

// ===== File Dialog =====

const MAX_MD_SIZE = 2 * 1024 * 1024; // 2MB

ipcMain.handle('dialog:open-markdown', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择 Markdown 文件',
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_MD_SIZE) {
      return { ok: false, error: `文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），限制 2MB` };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, path: filePath, filename: path.basename(filePath), content };
  } catch (err: any) {
    return { ok: false, error: err.message || '读取文件失败' };
  }
});

// App info
ipcMain.handle('app:get-user-data-path', async () => {
  return app.getPath('userData');
});

/** Keep the old roundtables:search as a compatibility alias for data:list-roundtables */
ipcMain.handle('roundtables:search', async (_event, query: string) => {
  const tables: any[] = await (async () => {
    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const results: any[] = [];
    for (const [id, fn] of Object.entries(index)) {
      const filePath = path.join(dataDir, `${fn}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const rt = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (!query || rt.topic?.toLowerCase().includes(query.toLowerCase())) {
            results.push(normalizeToV3(rt));
          }
        } catch { /* skip */ }
      }
    }
    return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  })();
  return tables;
});

/** Keep old roundtables:delete-all as compatibility alias */
ipcMain.handle('roundtables:delete-all', async (_event, id?: string) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);

  if (id) {
    const filename = index[id];
    if (filename) {
      try { fs.unlinkSync(path.join(dataDir, `${filename}.json`)); } catch {}
      try { fs.unlinkSync(path.join(dataDir, `${filename}_messages.json`)); } catch {}
      cleanTmp(dataDir, filename);
      delete index[id];
      saveIndex(dataDir, index);
    }
  } else {
    for (const fn of Object.values(index)) {
      try { fs.unlinkSync(path.join(dataDir, `${fn}.json`)); } catch {}
      try { fs.unlinkSync(path.join(dataDir, `${fn}_messages.json`)); } catch {}
      cleanTmp(dataDir, fn);
    }
    saveIndex(dataDir, {});
  }
  return { ok: true };
});

/** Keep old roundtables:export as compatibility alias */
ipcMain.handle('roundtables:export', async (_event, id: string) => {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[id];
  if (!filename) return { error: '未找到该圆桌' };

  const rtPath = path.join(dataDir, `${filename}.json`);
  const msgsPath = path.join(dataDir, `${filename}_messages.json`);
  if (!fs.existsSync(rtPath)) return { error: '数据文件丢失' };

  let rt: any;
  try { rt = JSON.parse(fs.readFileSync(rtPath, 'utf-8')); rt = normalizeToV3(rt); } catch { return { error: '数据文件损坏' }; }

  const msgs: any[] = fs.existsSync(msgsPath)
    ? (() => { try { return JSON.parse(fs.readFileSync(msgsPath, 'utf-8')); } catch { return []; } })()
    : [];

  const lines: string[] = [];
  lines.push(`主题：${rt.topic}`);
  lines.push(`主持人：${rt.host?.name || ''}`);
  lines.push(`参与角色：${(rt.characters || []).map((c: any) => c.name).join('、')}`);
  lines.push(`讨论轮数：${rt.totalRounds === 0 ? "不预设轮数（最多 999 轮）" : rt.totalRounds + " 轮"}`);
  lines.push(`创建时间：${new Date(rt.createdAt || Date.now()).toLocaleString('zh-CN')}`);
  lines.push('='.repeat(40));
  lines.push('');
  for (const msg of msgs) {
    const roundLabel = msg.type === 'final_summary' ? '' : `[第${msg.round}轮]`;
    lines.push(`【${msg.characterName}】${roundLabel}`);
    lines.push(msg.content || '');
    if (msg.error) lines.push(`⚠ ${msg.error}`);
    lines.push('');
  }
  return { content: lines.join('\n') };
});

// ===== Discussion Runner =====

ipcMain.handle('discuss:run', async (_event, roundTable: any) => {
  const initialRound = roundTable._initialRound || 1;
  await startDiscussion(roundTable, initialRound);
  return { ok: true };
});

ipcMain.handle('discuss:stop', async (_event, roundTableId: string) => {
  stopDiscussion(roundTableId);
  return { ok: true };
});

ipcMain.handle('discuss:append-round', async (_event, roundTable: any) => {
  await appendRound(roundTable);
  return { ok: true };
});

ipcMain.handle('discuss:user-host-input', async (_event, roundTableId: string, content: string) => {
  const ok = injectUserHostInput(roundTableId, content);
  return { ok };
});

ipcMain.handle('discuss:pause', async (_event, roundTableId: string) => {
  pauseDiscussion(roundTableId);
  return { ok: true };
});

ipcMain.handle('discuss:retry-character', async (_event, payload: { roundTableId: string; characterName: string; round: number; providerId?: string }) => {
  try {
    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const filename = index[payload.roundTableId];
    if (!filename) return { ok: false, error: '圆桌不存在' };

    const rtPath = path.join(dataDir, `${filename}.json`);
    const msgsPath = path.join(dataDir, `${filename}_messages.json`);
    if (!fs.existsSync(rtPath)) return { ok: false, error: '数据文件丢失' };

    const rt = JSON.parse(fs.readFileSync(rtPath, 'utf-8'));
    const allMsgs = fs.existsSync(msgsPath) ? JSON.parse(fs.readFileSync(msgsPath, 'utf-8')) : [];

    const character = rt.characters?.find((c: any) => c.name === payload.characterName);
    if (!character) return { ok: false, error: '角色未找到' };

    const provider = resolveProvider(payload.providerId || character.providerId);
    if (!provider) return { ok: false, error: '未找到 LLM 厂商配置' };
    const sys = buildSysPrompt();
    const speechPrompt = buildCharSpeech(rt, character, payload.round, allMsgs.slice(-3));
    const result = await callProviderLLM(provider, [
      { role: 'system', content: sys },
      { role: 'user', content: speechPrompt },
    ]);
    return { ok: true, characterName: payload.characterName, round: payload.round, content: result.content, error: result.error };
  } catch (e: any) {
    return { ok: false, error: e.message || '重试失败' };
  }
});

// ===== Whisper System IPC =====

ipcMain.handle('whisper:send', async (_event, payload: { roundTableId: string; recipientId: string; content: string }) => {
  try {
    const { roundTableId, recipientId, content } = payload;
    if (!roundTableId || !recipientId || !content) {
      return { ok: false, error: '参数不完整' };
    }

    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const filename = index[roundTableId];
    if (!filename) return { ok: false, error: '未找到该圆桌' };

    // 加载现有私信
    const whisperData = loadWhispers(dataDir, filename);

    // 创建新私信消息
    const message: WhisperMessage = {
      id: crypto.randomUUID(),
      roundTableId,
      senderId: 'host',
      recipientId,
      type: '1:1',
      content,
      timestamp: Date.now(),
      status: 'unread',
      autoReplyTriggered: false,
    };

    whisperData.whispers.push(message);
    saveWhispers(dataDir, filename, whisperData);

    // 异步触发目标角色的 AI 私信回复（不阻塞发送响应）
    (async () => {
      try {
        await handleWhisperReply(roundTableId, recipientId, content, message.id);
      } catch (err: any) {
        console.error('whisper:send auto-reply error:', err);
      }
    })();

    return { ok: true, message };
  } catch (error: any) {
    return { ok: false, error: error.message || '发送私信失败' };
  }
});

ipcMain.handle('whisper:load', async (_event, payload: { roundTableId: string }) => {
  try {
    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const filename = index[payload.roundTableId];
    if (!filename) return { whispers: [], groups: [] };

    return loadWhispers(dataDir, filename);
  } catch {
    return { whispers: [], groups: [] };
  }
});

ipcMain.handle('whisper:create-group', async (_event, payload: { roundTableId: string; name: string; memberIds: string[]; speakOrder: string }) => {
  try {
    // P1: 占位实现
    return { ok: false, error: '群组功能正在开发中' };
  } catch (error: any) {
    return { ok: false, error: error.message || '创建群组失败' };
  }
});

ipcMain.handle('whisper:send-group', async (_event, payload: { roundTableId: string; groupId: string; content: string }) => {
  try {
    const { roundTableId, groupId, content } = payload;
    if (!roundTableId || !groupId || !content) {
      return { ok: false, error: '参数不完整' };
    }

    const dataDir = getDataDir();
    const index = loadIndex(dataDir);
    const filename = index[roundTableId];
    if (!filename) return { ok: false, error: '未找到该圆桌' };

    const whisperData = loadWhispers(dataDir, filename);

    // 查找目标群聊
    const group = whisperData.groups.find((g) => g.id === groupId);
    if (!group) return { ok: false, error: '未找到该群组' };

    // 创建新的群主消息
    const message: WhisperMessage = {
      id: crypto.randomUUID(),
      roundTableId,
      senderId: 'host',
      groupId,
      type: 'group',
      content,
      timestamp: Date.now(),
      status: 'unread',
      // 群聊消息本身不设置 autoReplyTriggered，由 group.replyRoundCount 等字段控制
    };

    whisperData.whispers.push(message);
    saveWhispers(dataDir, filename, whisperData);

    // MVP: 默认不触发群聊 AI 自动回复；开启后可在 P1 中调用 handleGroupWhisperReply
    if (group.autoReplyEnabled === true) {
      console.log('[WAIL-Guard] group auto reply is enabled but P1 handler not implemented yet:', groupId);
    }

    return { ok: true, message };
  } catch (error: any) {
    return { ok: false, error: error.message || '发送群组消息失败' };
  }
});

// ===== App Lifecycle =====

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function generateMockFallback(prompt: string): string {
  return `感谢您的提问！当前尚未配置 LLM 厂商，请前往设置页添加 API Key 以启用真实 AI 讨论。这是开发模式下的模拟回复。`;
}

/**
 * 从磁盘加载并反序列化指定圆桌，供 whisper:send 触发 AI 回复时使用。
 * 返回的对象与 src/lib/types.ts 的 RoundTable 形状一致。
 */
async function loadRoundTableFromDisk(roundTableId: string): Promise<unknown | null> {
  const dataDir = getDataDir();
  const index = loadIndex(dataDir);
  const filename = index[roundTableId];
  if (!filename) return null;

  const filePath = path.join(dataDir, `${filename}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return normalizeToV3(raw);
  } catch {
    return null;
  }
}
