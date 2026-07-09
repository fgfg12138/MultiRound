// ===== AI 圆桌模拟器 — Discussion Page =====

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadRoundTable, loadMessages } from '@/lib/storage';
import type { RoundTable, Message } from '@/lib/types';
import { useDiscussion } from '@/hooks/useDiscussion';
import { useToast } from '@/components/Toast';
import Layout from '@/components/Layout';
import RightPanel from '@/components/RightPanel';
import {
  Play,
  Pause,
  Loader2,
  AlertCircle,
  ChevronRight,
  Square,
  RefreshCw,
} from 'lucide-react';

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

export default function Discussion() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const feedRef = useRef<HTMLDivElement>(null);
  const hostInputRef = useRef<HTMLInputElement>(null);
  const roundTableRef = useRef<RoundTable | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [whisperTabActive, setWhisperTabActive] = useState(false);
  const [roundTable, setRoundTable] = useState<RoundTable | null>(null);

  const {
    messages, isRunning, error, currentRound, isComplete,
    currentCharacter, failedCharacters, generateStatus,
    isPaused, awaitingHostInput, hasHistory,
    streamingCharacter,
    tokenRecords, tokenTotals,
    startDiscussion, appendRound, stop, pause, resume, sendUserHostInput,
    retryCharacter, reset,
    loadExistingDiscussion,
  } = useDiscussion();
  const { showToast } = useToast();

  useEffect(() => {
    if (!id) return;
    loadRoundTable(id).then(async (rt) => {
      if (!rt) { navigate('/'); return; }
      roundTableRef.current = rt;
      setRoundTable(rt);
      setLoaded(true);
      // Auto-load history for completed/stopped discussions
      if (rt.status === 'completed' || rt.status === 'stopped') {
        loadExistingDiscussion(rt);
      } else if (rt.status === 'created') {
        // Check if there are seed messages (continue-from-round scenario)
        const seedMsgs = await loadMessages(id);
        if (seedMsgs && seedMsgs.length > 0) {
          loadExistingDiscussion(rt);
          // Auto-start discussion, preserving seed messages
          startDiscussion(rt, { preserveMessages: true });
        }
      }
    });
  }, [id, navigate, loadExistingDiscussion, startDiscussion]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, currentCharacter]);

  // [Removed auto-navigation upon completion — now shows flicker button instead]

  useEffect(() => {
    if (error) {
      showToast({ type: 'error', message: error, duration: 8000 });
    }
  }, [error, showToast]);

  // 当讨论暂停且右侧面板不在私信 Tab 时，自动切换到私信 Tab
  useEffect(() => {
    if (isPaused && !whisperTabActive) {
      setWhisperTabActive(true);
    }
  }, [isPaused]);

  if (!loaded) {
    return (
      <Layout>
        <div className="flex items-center justify-center flex-1 min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-g400 animate-spin" />
        </div>
      </Layout>
    );
  }
  if (!roundTable) return null;

  const handleStart = () => startDiscussion(roundTable);

  // Group failed characters by name for retry
  const failedNames = [...new Set(failedCharacters.map((f) => f.name))];

  const statusText = currentCharacter
    ? `正在生成：${currentCharacter} 的发言...`
    : isRunning
      ? '准备中...'
      : '';

  return (
    <Layout
      title={roundTable.topic}
      showBack
      backTo="/"
      actions={
        <div className="flex items-center gap-2">
          {!isRunning && !isComplete && generateStatus === 'idle' && (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 bg-p600 text-white rounded-r-lg text-sm font-medium hover:bg-p700 transition-colors shadow-md shadow-p200"
            >
              <Play className="w-4 h-4" />
              开始讨论
            </button>
          )}
          {isRunning && (
            <>
              {isPaused ? (
                <button
                  onClick={resume}
                  className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-r-lg text-sm font-medium hover:bg-success/80 transition-colors shadow-md shadow-success/30"
                >
                  <Play className="w-4 h-4" />
                  继续
                </button>
              ) : (
                <button
                  onClick={pause}
                  className="flex items-center gap-2 px-4 py-2 bg-warning text-white rounded-r-lg text-sm font-medium hover:bg-warning/80 transition-colors shadow-md shadow-warning/30"
                >
                  <Pause className="w-4 h-4" />
                  暂停
                </button>
              )}
              <button
                onClick={stop}
                className="flex items-center gap-2 px-4 py-2 bg-error text-white rounded-r-lg text-sm font-medium hover:bg-error/80 transition-colors shadow-md shadow-error/30"
              >
                <Square className="w-4 h-4" />
                停止
              </button>
            </>
          )}
          {isComplete && (
            <button
              onClick={() => navigate(`/result/${id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-p600 text-white rounded-r-lg text-sm font-medium hover:bg-p700 transition-colors shadow-md shadow-p200 animate-pulse"
            >
              查看总结
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Center - Chat View */}
        <div className="flex-1 flex flex-col overflow-hidden p-5 pl-6 gap-4">
          {/* Chat Header */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <div className="text-lg font-semibold text-g900">{roundTable.topic}</div>
              <div className="text-[13px] text-g500">{roundTable.characters.length} 位参与者 · 第{currentRound || 1}轮</div>
            </div>
            {/* Participants avatars row */}
            <div className="flex items-center">
              <div
                className="chat-p-avatar"
                style={{ background: 'linear-gradient(135deg,#a78bfa,#7c3aed)' }}
              >
                {roundTable.host.name.charAt(0)}
              </div>
              {roundTable.characters.slice(0, 4).map((char, idx) => (
                <div
                  key={char.id}
                  className="chat-p-avatar -ml-2 first:ml-0"
                  style={{ background: AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length] }}
                >
                  {char.name.charAt(0)}
                </div>
              ))}
              {roundTable.characters.length > 4 && (
                <div className="chat-p-avatar -ml-2 bg-g300 text-g600 text-[10px]">
                  +{roundTable.characters.length - 4}
                </div>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={feedRef}
            className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2 custom-scrollbar discussion-feed"
          >
            {messages.length === 0 && !isRunning && !hasHistory && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-p100 rounded-r-xl flex items-center justify-center mb-4">
                  <Play className="w-8 h-8 text-p500" />
                </div>
                <h2 className="text-lg font-semibold text-g700 mb-2">准备就绪</h2>
                <p className="text-sm text-g400 max-w-sm">点击顶部按钮开始圆桌讨论</p>
              </div>
            )}

            {messages.map((msg) => {
              const colorIdx = msg.characterId === 'host'
                ? -1 : getColorIndex(msg.characterId, roundTable.characters);
              const isHost = msg.characterId === 'host';
              return (
                <div key={msg.id} className={`flex gap-3 max-w-[85%] ${isHost ? 'self-end flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
                    style={{
                      background: isHost
                        ? 'linear-gradient(135deg,#a78bfa,#7c3aed)'
                        : AVATAR_GRADIENTS[colorIdx % AVATAR_GRADIENTS.length],
                    }}
                  >
                    {msg.characterName.charAt(0)}
                  </div>
                  {/* Bubble */}
                  <div
                    className={`px-3 py-2.5 rounded-r-lg text-sm leading-relaxed ${
                      isHost
                        ? 'bg-gradient-to-r from-p50 to-blue-50 border border-p200 rounded-tr-sm'
                        : 'bg-white border border-g200 shadow-sm rounded-tl-sm'
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-1 ${isHost ? 'text-p700' : 'text-g600'}`}>
                      {msg.characterName}
                    </div>
                    <div className="whitespace-pre-wrap">
                      {msg.content}
                      {streamingCharacter === msg.characterName && (
                        <span className="inline-block w-[2px] h-[1em] bg-p500 animate-pulse ml-0.5 align-text-bottom" />
                      )}
                    </div>
                    <div className="text-[11px] text-g400 mt-1 text-right">
                      第{msg.round}轮
                    </div>
                  </div>
                  {/* Retry button for failed messages */}
                  {msg.error && msg.characterId !== 'host' && (
                    <button
                      onClick={() => retryCharacter(msg.characterName)}
                      disabled={isRunning}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-error/10 text-error border border-error/30 rounded-r-lg hover:bg-error/20 transition-colors disabled:opacity-50 shrink-0 self-start"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重试
                    </button>
                  )}
                </div>
              );
            })}

            {/* Loading / Current character indicator */}
            {isRunning && currentCharacter && (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="w-5 h-5 text-p500 animate-spin" />
                <span className="text-sm text-g500">{statusText}</span>
              </div>
            )}

            {/* Error box */}
            {error && !isRunning && (
              <div className="mt-2 p-4 bg-error/10 border border-error/30 rounded-r-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-error font-medium">出错了</p>
                  <p className="text-xs text-error/80 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* Failed characters retry bar (in-chat) */}
          {failedNames.length > 0 && !isRunning && !isComplete && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <span className="text-xs text-g500">生成失败的角色：</span>
              {failedNames.map((name) => (
                <button
                  key={name}
                  onClick={() => retryCharacter(name)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-error/10 text-error border border-error/30 rounded-r-lg hover:bg-error/20 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  重试 {name}
                </button>
              ))}
            </div>
          )}

          {/* Chat Input (host input mode) */}
          {awaitingHostInput && (
            <div className="flex gap-2 shrink-0">
              <input
                ref={hostInputRef}
                type="text"
                placeholder={awaitingHostInput.phase === 'opening' ? '输入你的开场白...' : '输入你的主持追问或指令...'}
                onKeyDown={e => {
                  if (e.key === 'Enter' && hostInputRef.current) {
                    sendUserHostInput(hostInputRef.current.value);
                    hostInputRef.current.value = '';
                  }
                }}
                className="flex-1 px-3 py-2 text-sm border border-p300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-p400"
              />
              <button
                onClick={() => {
                  if (hostInputRef.current) {
                    sendUserHostInput(hostInputRef.current.value);
                    hostInputRef.current.value = '';
                  }
                }}
                className="px-4 py-2 bg-p600 text-white rounded-r-lg text-sm font-medium hover:bg-p700 transition-colors"
              >
                发送
              </button>
            </div>
          )}

          {/* Status bar */}
          <div className="flex items-center justify-between gap-4 shrink-0 text-xs text-g400">
            <div className="flex items-center gap-3">
              <span className={isRunning ? 'text-p600 font-medium' : ''}>
                {isRunning ? statusText : ''}
              </span>
              {failedNames.length > 0 && !isRunning && (
                <span className="text-error">{failedNames.length} 个角色生成失败</span>
              )}
              {messages.length > 0 && !isRunning && (
                <span>{messages.length} 条消息</span>
              )}
              {generateStatus === 'stopping' && (
                <span className="text-warning">正在停止...</span>
              )}
            </div>
            {tokenRecords.length > 0 && (
              <span className="text-xs text-g400">
                总 Token: {tokenTotals.total} (输入: {tokenTotals.inputTokens} | 输出: {tokenTotals.outputTokens})
              </span>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <RightPanel
          characters={roundTable.characters}
          hostName={roundTable.host.name}
          currentRound={currentRound || 1}
          totalRounds={roundTable.totalRounds}
          isRunning={isRunning}
          isComplete={isComplete}
          isPaused={isPaused}
          currentCharacter={currentCharacter}
          tokenRecords={tokenRecords}
          tokenTotals={tokenTotals}
          roundTableId={roundTable.id}
          groups={[]}
          whisperTabActive={whisperTabActive}
          onWhisperTabChange={setWhisperTabActive}
        />
      </div>
    </Layout>
  );
}
