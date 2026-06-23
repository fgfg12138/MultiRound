// ===== AI 圆桌模拟器 — Electron Main Process =====

import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Store from 'electron-store';
import { callProviderLLM, testProviderConnection, encryptProvider, decryptProvider, maskProviderForUI, ProviderConfig, StoredProviderConfig } from './providers.js';

interface Schema {
  [key: string]: unknown;
}

const store = new Store<Schema>();

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
              message: 'MultiRound v1.0',
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

function getDataDir(): string {
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), 'data');
  }
  return path.join(app.getPath('userData'), 'data');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Atomically write a JSON file: write to .tmp then rename to final path.
 *  Falls back to direct write if rename fails (cross-device edge case).
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2) + '\n';
  // Write to temp file first
  fs.writeFileSync(tmpPath, content, 'utf-8');
  // Rename to final path (atomic on same filesystem)
  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Fallback: direct write if rename fails (e.g. cross-device)
    fs.writeFileSync(filePath, content, 'utf-8');
    // Clean up .tmp if it still exists
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

/** Clean up any leftover .tmp file for a given base filename */
function cleanTmp(dataDir: string, filename: string): void {
  try { fs.unlinkSync(path.join(dataDir, `${filename}.json.tmp`)); } catch { /* ignore */ }
  try { fs.unlinkSync(path.join(dataDir, `${filename}_messages.json.tmp`)); } catch { /* ignore */ }
  try { fs.unlinkSync(path.join(dataDir, `${filename}.backup-v1.json`)); } catch { /* ignore */ }
}

/** Create a backup copy of a V1 file before migrating it to V2.
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

/** Load the index file that maps roundtable UUIDs → human-readable filenames */
function loadIndex(dataDir: string): Record<string, string> {
  ensureDir(dataDir);
  const indexPath = path.join(dataDir, '_index.json');
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveIndex(dataDir: string, index: Record<string, string>): void {
  const indexPath = path.join(dataDir, '_index.json');
  atomicWriteJson(indexPath, index);
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

const CURRENT_SCHEMA_VERSION = 2;

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

function migrateV1toV2(data: any): any {
  const topic = data.topic || '';
  const totalRounds = data.totalRounds || 3;

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

function normalizeToV2(data: any): any {
  if (!data || typeof data !== 'object') {
    return migrateV1toV2({ id: data?.id || 'corrupt', createdAt: Date.now() });
  }
  if ((data.schemaVersion ?? 0) >= 2) return data; // already V2
  return migrateV1toV2(data);
}

// ===== Data IPC Handlers =====

ipcMain.handle('data:get-path', async () => getDataDir());

ipcMain.handle('data:save-roundtable', async (_event, rt: any) => {
  const dataDir = getDataDir();
  ensureDir(dataDir);

  // Normalize to V2 in memory
  const v2 = normalizeToV2(rt);

  // Load index
  const index = loadIndex(dataDir);
  let filename = index[v2.id];

  // If this was V1 data, create backup before overwriting
  if (filename && detectVersion(rt) < 2) {
    backupBeforeMigrate(dataDir, filename);
  }

  // Generate new filename if this is a new roundtable
  if (!filename) {
    filename = generateFilename(dataDir, v2.scenario?.title || v2.topic, v2.createdAt);
    index[v2.id] = filename;
    saveIndex(dataDir, index);
  }

  // Atomically write metadata file
  atomicWriteJson(path.join(dataDir, `${filename}.json`), v2);

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
    return normalizeToV2(raw);
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
        tables.push(normalizeToV2(rt));
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
    rt = normalizeToV2(rt);  // normalize to ensure V2 fields
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
  lines.push(`讨论轮数：${rt.totalRounds || 3} 轮`);
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
      const v2 = normalizeToV2(content);
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
            results.push(normalizeToV2(rt));
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
  try { rt = JSON.parse(fs.readFileSync(rtPath, 'utf-8')); rt = normalizeToV2(rt); } catch { return { error: '数据文件损坏' }; }

  const msgs: any[] = fs.existsSync(msgsPath)
    ? (() => { try { return JSON.parse(fs.readFileSync(msgsPath, 'utf-8')); } catch { return []; } })()
    : [];

  const lines: string[] = [];
  lines.push(`主题：${rt.topic}`);
  lines.push(`主持人：${rt.host?.name || ''}`);
  lines.push(`参与角色：${(rt.characters || []).map((c: any) => c.name).join('、')}`);
  lines.push(`讨论轮数：${rt.totalRounds || 3} 轮`);
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

// App info
ipcMain.handle('app:get-user-data-path', async () => {
  return app.getPath('userData');
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
