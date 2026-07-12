// ===== AI 圆桌模拟器 — Create Page Helpers =====
// 从 Create.tsx 中提取的纯函数，用于角色构建与配置

import type { CharacterSecret, CharacterMemory, Character, SecretRole } from './types';

export function createDefaultSecret(overrides?: Partial<CharacterSecret>): CharacterSecret {
  return {
    secretRole: '[redacted]' as SecretRole,
    publicGoal: '参与公开讨论，判断其他角色的真实意图。',
    privateGoal: '',
    knownSecrets: [],
    isAlive: true,
    revealed: false,
    diedAtRound: undefined,
    diedReason: undefined,
    nightActionDone: false,
    ...overrides,
  };
}

export function createDefaultMemory(overrides?: Partial<CharacterMemory>): CharacterMemory {
  return {
    privateMemory: [],
    publicMemory: [],
    suspicionMap: {},
    strategyPlan: '',
    ...overrides,
  };
}

export function withDefaults(c: Character): Character {
  return {
    ...c,
    secret: createDefaultSecret(c.secret),
    memory: createDefaultMemory(c.memory),
  };
}

export function parseLines(value: string): string[] {
  return value.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function toLines(value?: string[]): string {
  return (value || []).join('\n');
}
