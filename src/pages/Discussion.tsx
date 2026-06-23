// ===== AI 圆桌模拟器 — Discussion Page =====

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadRoundTable } from '@/lib/storage';
import type { RoundTable, Message } from '@/lib/types';
import { useDiscussion } from '@/hooks/useDiscussion';
import { useToast } from '@/components/Toast';
import Layout from '@/components/Layout';
import MessageBubble from '@/components/MessageBubble';
import RoundIndicator from '@/components/RoundIndicator';
import {
  Play,
  Pause,
  Loader2,
  AlertCircle,
  ChevronRight,
  Users,
  Square,
  RefreshCw,
  SkipForward,
} from 'lucide-react';

const CHAR_DOT_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400',
  'bg-indigo-400', 'bg-teal-400', 'bg-orange-400', 'bg-pink-400',
];

function getColorIndex(charId: string, characters: { id: string }[]): number {
  return characters.findIndex((c) => c.id === charId);
}

export default function Discussion() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const feedRef = useRef<HTMLDivElement>(null);
  const roundTableRef = useRef<RoundTable | null>(null);
  const [loaded, setLoaded] = useState(false);

  const {
    messages, isRunning, error, currentRound, isComplete,
    currentCharacter, failedCharacters, generateStatus,
    isPaused, awaitingHostInput,
    startDiscussion, stop, pause, resume, sendUserHostInput,
    retryCharacter, reset,
    stoppedByUser,
  } = useDiscussion();
  const { showToast } = useToast();

  useEffect(() => {
    if (!id) return;
    loadRoundTable(id).then((rt) => {
      if (!rt) { navigate('/'); return; }
      roundTableRef.current = rt;
      setLoaded(true);
    });
  }, [id, navigate]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, currentCharacter]);

  useEffect(() => {
    if (isComplete && id && !stoppedByUser.current) {
      setTimeout(() => navigate(`/result/${id}`), 2000);
    }
  }, [isComplete, id, navigate]);

  useEffect(() => {
    if (error) {
      showToast({ type: 'error', message: error, duration: 8000 });
    }
  }, [error, showToast]);

  const roundTable = roundTableRef.current;

  if (!loaded) {
    return (
      <Layout>
        <div className="flex items-center justify-center flex-1 min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
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
    <Layout title={roundTable.topic} showBack backTo="/">
      <div className="flex flex-1 h-[calc(100vh-53px)] overflow-hidden">
        {/* Left sidebar */}
        <aside className="hidden md:flex flex-col w-56 border-r border-gray-200 bg-gray-50 p-4 shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-gray-400" />
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">参与角色</h2>
          </div>
          <div className="space-y-2">
            {/* Host */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              currentCharacter === roundTable.host.name
                ? 'bg-purple-100 border border-purple-300 ring-2 ring-purple-200'
                : 'bg-purple-50 border border-purple-200'
            }`}>
              <div className="w-2 h-2 rounded-full bg-purple-500 relative">
                {currentCharacter === roundTable.host.name && (
                  <span className="absolute -inset-1 rounded-full bg-purple-400 animate-ping" />
                )}
              </div>
              <span className="text-sm font-medium text-purple-700">{roundTable.host.name}</span>
              <span className="text-xs text-purple-400 ml-auto">主持人</span>
            </div>
            {/* Characters */}
            {roundTable.characters.map((char, idx) => {
              const isFailed = failedNames.includes(char.name);
              const isCurrent = currentCharacter === char.name;
              return (
                <div
                  key={char.id}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${
                    isCurrent
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                      : isFailed
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="relative">
                    <div className={`w-2 h-2 rounded-full ${CHAR_DOT_COLORS[idx % CHAR_DOT_COLORS.length]}`} />
                    {isCurrent && (
                      <span className="absolute -inset-1 rounded-full bg-blue-400 animate-ping" />
                    )}
                  </div>
                  <span className="text-sm text-gray-700">{char.name}</span>
                  {isFailed && <span className="text-xs text-red-500 ml-auto">⚠</span>}
                  {isCurrent && <Loader2 className="w-3 h-3 text-blue-500 animate-spin ml-auto" />}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center - Discussion feed */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-6 discussion-feed">
            {messages.length === 0 && !isRunning && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-4">
                  <Play className="w-8 h-8 text-purple-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-700 mb-2">准备就绪</h2>
                <p className="text-sm text-gray-400 max-w-sm">点击下方按钮开始圆桌讨论</p>
              </div>
            )}

            {messages.length > 0 && (
              <div className="max-w-3xl mx-auto">
                {messages.map((msg) => {
                  const colorIdx = msg.characterId === 'host'
                    ? 0 : getColorIndex(msg.characterId, roundTable.characters);
                  return (
                    <div key={msg.id} className="space-y-1">
                      <MessageBubble message={msg} colorIndex={colorIdx} />
                      {/* Failed message retry button */}
                      {msg.error && msg.characterId !== 'host' && (
                        <div className="flex items-center gap-2 ml-2 mb-4">
                          <button
                            onClick={() => retryCharacter(msg.characterName)}
                            disabled={isRunning}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            重试 {msg.characterName}
                          </button>
                          <span className="text-xs text-gray-400">或稍后从列表重试</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Loading / Current character indicator */}
                {isRunning && currentCharacter && (
                  <div className="flex items-center gap-3 py-4">
                    <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                    <span className="text-sm text-gray-500">{statusText}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error box */}
            {error && !isRunning && (
              <div className="max-w-3xl mx-auto mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-600 font-medium">出错了</p>
                  <p className="text-xs text-red-500 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-gray-200 bg-white px-4 py-4 shrink-0">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                {!isRunning && !isComplete && generateStatus === 'idle' && (
                  <button
                    onClick={handleStart}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
                  >
                    <Play className="w-5 h-5" />
                    开始讨论
                  </button>
                )}

                {isRunning && (
                  <div className="flex items-center gap-2">
                    {isPaused ? (
                      <button onClick={resume}
                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors shadow-lg shadow-green-200">
                        <Play className="w-5 h-5" />继续
                      </button>
                    ) : (
                      <button onClick={pause}
                        className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200">
                        <Pause className="w-5 h-5" />暂停
                      </button>
                    )}
                    <button onClick={stop}
                      className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-200">
                      <Square className="w-5 h-5" />停止生成
                    </button>
                  </div>
                )}

                {isComplete && (
                  <button
                    onClick={() => navigate(`/result/${id}`)}
                    className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors shadow-lg shadow-green-200"
                  >
                    查看总结
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}

                {awaitingHostInput && (
                  <div className="flex gap-2 w-full max-w-xl">
                    <input id="hostInput" type="text"
                      placeholder={awaitingHostInput.phase === 'opening' ? '输入你的开场白...' : '输入你的主持追问或指令...'}
                      onKeyDown={e => { if (e.key === 'Enter') { sendUserHostInput(e.currentTarget.value); e.currentTarget.value = ''; }}}
                      className="flex-1 px-3 py-2 text-sm border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    <button onClick={() => { const el = document.getElementById('hostInput') as HTMLInputElement; if (el) { sendUserHostInput(el.value); el.value = ''; }}}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">发送</button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-400">
                {isRunning && currentCharacter && (
                  <span className="text-purple-600 font-medium">{statusText}</span>
                )}
                {failedNames.length > 0 && !isRunning && (
                  <span className="text-red-500">{failedNames.length} 个角色生成失败</span>
                )}
                {messages.length > 0 && !isRunning && (
                  <span>{messages.length} 条消息</span>
                )}
                {generateStatus === 'stopping' && (
                  <span className="text-amber-600">正在停止...</span>
                )}
              </div>
            </div>

            {/* Failed characters retry bar */}
            {failedNames.length > 0 && !isRunning && !isComplete && (
              <div className="max-w-3xl mx-auto mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">生成失败的角色：</span>
                  {failedNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => retryCharacter(name)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重试 {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="hidden lg:flex flex-col w-56 border-l border-gray-200 bg-gray-50 p-4 shrink-0">
          <RoundIndicator
            currentRound={currentRound || 1}
            totalRounds={roundTable.totalRounds}
            status={isComplete ? 'completed' : isRunning ? 'discussing' : 'created'}
          />

          <div className="mt-6 space-y-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">讨论信息</h3>
            <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">主题</span>
                <span className="text-gray-700 text-right max-w-[120px] truncate">{roundTable.topic}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">角色数</span>
                <span className="text-gray-700">{roundTable.characters.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">轮数</span>
                <span className="text-gray-700">{roundTable.totalRounds === 0 ? '不预设，最多 999 轮' : `${roundTable.totalRounds} 轮`}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">状态</span>
                <span className={
                  isComplete ? 'text-green-600' : isRunning ? 'text-purple-600' : 'text-gray-400'
                }>
                  {isComplete ? '已完成' : isRunning ? '进行中' : '待开始'}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Layout>
  );
}
