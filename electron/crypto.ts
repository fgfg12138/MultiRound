// ===== AI 圆桌模拟器 — API Key 加密工具层 =====
// 使用 Electron safeStorage（调用 OS 级密钥链）
// Windows → DPAPI, macOS → Keychain, Linux → libsecret

import { safeStorage } from 'electron';

/**
 * 加密 API Key
 * 优先使用 safeStorage（OS 密钥链），不可用时回退 base64 编码
 */
export function encryptKey(plaintext: string): string {
  if (!plaintext) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plaintext).toString('base64');
    }
  } catch {
    // safeStorage 异常，回退 base64
  }
  // 极少数情况 safeStorage 不可用，base64 混淆（非安全，仅为避免明文裸存）
  return Buffer.from(plaintext, 'utf-8').toString('base64');
}

/**
 * 解密 API Key
 */
export function decryptKey(encrypted: string): string {
  if (!encrypted) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(encrypted, 'base64');
      return safeStorage.decryptString(buf);
    }
  } catch {
    // 尝试 base64 解码
  }
  // 回退：假定是 base64 编码
  try {
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * 脱敏显示 API Key：
 * sk-a1b2c3d4e5f6...xyz9 → sk-a1b2●●●●●●●●●●f6
 * 短 key（≤8）全部掩盖
 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '●●●●●●●●';
  const prefix = key.slice(0, 6);
  const suffix = key.slice(-4);
  return `${prefix}●●●●●●●●${suffix}`;
}
