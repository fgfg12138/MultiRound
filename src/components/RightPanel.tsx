// ===== AI 圆桌模拟器 — Right Panel Component =====
// 讨论信息 + 私密消息 Tab 切换面板

import { useState } from 'react';
import type { TokenRecord } from '@/lib/types';
import WhisperPanel from '@/components/WhisperPanel';

interface RightPanelProps {
  characters: Array<{ id: string; name: string }>;
  hostName: string;
  currentRound: number;
  totalRounds: number;
  isRunning: boolean;
  isComplete: boolean;
  isPaused: boolean;
  currentCharacter: string | null;
  tokenRecords: TokenRecord[];
  tokenTotals: { total: number; inputTokens: number; outputTokens: number };
  roundTableId: string;
  groups: Array<{ id: string; name: string; members: string[] }>;
  whisperTabActive: boolean;
  onWhisperTabChange: (active: boolean) => void;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#818cf8,#6366f1)',
  'linear-gradient(135deg,#34d399,#10b981)',
  'linear-gradient(135deg,#fbbf24,#f59e0b)',
  'linear-gradient(135deg,#f87171,#ef4444)',
  'linear-gradient(135deg,#a78bfa,#8b5cf6)',
  'linear-gradient(135deg,#22d3ee,#06b6d4)',
  'linear-gradient(135deg,#fb923c,#f97316)',
  'linear-gradient(135deg,#e879f9,#d946ef)',
];

function getColorIndex(charId: string, characters: { id: string }[]): number {
  return characters.findIndex((c) => c.id === charId);
}

export default function RightPanel({
  characters,
  hostName,
  currentRound,
  totalRounds,
  isRunning,
  isComplete,
  isPaused,
  currentCharacter,
  tokenRecords,
  tokenTotals,
  roundTableId,
  groups,
  whisperTabActive,
  onWhisperTabChange,
}: RightPanelProps) {
  const charTokenTotals = tokenRecords.reduce<Record<string, { total: number; input: number; output: number }>>(
    (acc, r) => {
      if (!acc[r.characterId]) {
        acc[r.characterId] = { total: 0, input: 0, output: 0 };
      }
      acc[r.characterId].total += r.estimatedInputTokens + r.estimatedOutputTokens;
      acc[r.characterId].input += r.estimatedInputTokens;
      acc[r.characterId].output += r.estimatedOutputTokens;
      return acc;
    },
    {}
  );

  const unlimited = totalRounds === 0;
  const statusLabel = isComplete ? '已完成' : isRunning ? '进行中' : '待开始';
  const statusColor = isComplete ? 'text-success' : isRunning ? 'text-p600' : 'text-g400';

  return (
    <aside className="w-[260px] min-w-[260px] border-l border-g200 bg-g50 flex flex-col overflow-hidden shrink-0">
      {/* Tab bar */}
      <div className="flex border-b border-g200 bg-white relative">
        <button
          className={`flex-1 py-2.5 text-xs font-medium text-center cursor-pointer transition-colors ${
            !whisperTabActive
              ? 'text-p600 border-b-2 border-p600'
              : 'text-g500 hover:text-g700'
          }`}
          onClick={() => onWhisperTabChange(false)}
        >
          讨论信息
        </button>
        <button
          className={`flex-1 py-2.5 text-xs font-medium text-center cursor-pointer transition-colors relative ${
            whisperTabActive
              ? 'text-p600 border-b-2 border-p600'
              : 'text-g500 hover:text-g700'
          }`}
          onClick={() => onWhisperTabChange(true)}
        >
          私密消息
          {isPaused && !whisperTabActive && (
            <span className="absolute top-1.5 right-[calc(50%-32px)] w-2 h-2 bg-error rounded-full" />
          )}
        </button>
      </div>

      {/* Tab content */}
      {whisperTabActive ? (
        <div className="flex-1 overflow-hidden">
          <WhisperPanel
            roundTableId={roundTableId}
            characters={characters as any}
            groups={groups as any}
            isPaused={isPaused}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* Discussion Info */}
          <div className="rp-section-title">讨论信息</div>

          <div className="bg-white rounded-r-lg border border-g200 p-3 space-y-2.5 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-g400">主题</span>
              <span className="text-g700 text-right max-w-[140px] truncate font-medium">
                Discussion
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-g400">角色数</span>
              <span className="text-g700">{characters.length + 1}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-g400">轮数</span>
              <span className="text-g700">
                {unlimited
                  ? `第 ${currentRound} 轮 / 不限`
                  : `${currentRound} / ${totalRounds} 轮`}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-g400">状态</span>
              <span className={statusColor}>{statusLabel}</span>
            </div>
          </div>

          {/* Token Usage */}
          {tokenRecords.length > 0 && (
            <>
              <div className="rp-section-title">Token 用量</div>
              <div className="bg-white rounded-r-lg border border-g200 p-3 space-y-2 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-g400">总消耗</span>
                  <span className="text-g700 font-medium">{tokenTotals.total}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-g400">输入</span>
                  <span className="text-g700">{tokenTotals.inputTokens}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-g400">输出</span>
                  <span className="text-g700">{tokenTotals.outputTokens}</span>
                </div>
                {/* Per-character token usage — only show > 0 */}
                {Object.entries(charTokenTotals).map(([charId, totals]) => {
                  const char = charId === 'host'
                    ? { name: hostName, id: 'host' }
                    : characters.find(c => c.id === charId);
                  if (!char || totals.total <= 0) return null;
                  return (
                    <div key={charId} className="flex justify-between text-xs">
                      <span className="text-g400">{char.name}</span>
                      <span className="text-g700">{totals.total}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Participants list */}
          <div className="rp-section-title">参与角色</div>
          <div className="space-y-1.5">
            {/* Host */}
            <div className="host-bar flex items-center gap-3 p-3 bg-p50 border border-p200 rounded-r-lg">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg,#a78bfa,#7c3aed)' }}
              >
                {hostName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-p700 truncate">{hostName}</div>
                <div className="text-[10px] text-p400">主持人</div>
              </div>
              <div
                className={`w-2 h-2 rounded-full ${
                  currentCharacter === hostName
                    ? 'bg-success shadow-[0_0_0_3px_rgba(16,185,129,0.2)]'
                    : 'bg-g300'
                }`}
              />
            </div>

            {/* Characters */}
            {characters.map((char) => {
              const colorIdx = getColorIndex(char.id, characters);
              const isCurrent = currentCharacter === char.name;
              const charTotal = charTokenTotals[char.id];
              return (
                <div
                  key={char.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-r-lg hover:bg-white/60 transition-colors"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                    style={{ background: AVATAR_GRADIENTS[colorIdx % AVATAR_GRADIENTS.length] }}
                  >
                    {char.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-g700 truncate">{char.name}</div>
                    {charTotal && charTotal.total > 0 && (
                      <div className="text-[10px] text-g400">{charTotal.total} tokens</div>
                    )}
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isCurrent
                        ? 'bg-success shadow-[0_0_0_3px_rgba(16,185,129,0.2)]'
                        : 'bg-g300'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
