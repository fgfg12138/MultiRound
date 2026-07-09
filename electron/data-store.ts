// ===== AI 圆桌模拟器 — Shared Data Store Utilities =====
// Used by main.ts and discussion-runner.ts (both in electron/ directory)

import path from 'node:path';
import fs from 'node:fs';
import type { WhisperData } from './types.js';
import { app } from 'electron';

export function getDataDir(): string {
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), 'data');
  }
  return path.join(app.getPath('userData'), 'data');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Atomically write a JSON file: .tmp → rename → fallback */
export function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.writeFileSync(filePath, content, 'utf-8');
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

export function loadIndex(dataDir: string): Record<string, string> {
  ensureDir(dataDir);
  const indexPath = path.join(dataDir, '_index.json');
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveIndex(dataDir: string, index: Record<string, string>): void {
  atomicWriteJson(path.join(dataDir, '_index.json'), index);
}

export function loadMessagesSync(dataDir: string, filename: string): unknown[] | null {
  const msgsPath = path.join(dataDir, `${filename}_messages.json`);
  try {
    return JSON.parse(fs.readFileSync(msgsPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveWhispers(dataDir: string, filename: string, data: WhisperData): void {
  atomicWriteJson(path.join(dataDir, `${filename}_whispers.json`), data);
}

export function loadWhispers(dataDir: string, filename: string): WhisperData {
  const filePath = path.join(dataDir, `${filename}_whispers.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { whispers: [], groups: [] };
  }
}

export function deleteWhispers(dataDir: string, filename: string): void {
  try { fs.unlinkSync(path.join(dataDir, `${filename}_whispers.json`)); } catch { /* ignore */ }
}
