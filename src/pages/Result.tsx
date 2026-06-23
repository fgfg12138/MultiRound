// ===== AI 圆桌模拟器 — Result Page =====

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { RoundTable, Message } from '@/lib/types';
import { loadRoundTable, loadMessages } from '@/lib/storage';
import { useToast } from '@/components/Toast';
import Layout from '@/components/Layout';
import MessageBubble from '@/components/MessageBubble';
import { Copy, Check, RefreshCw, Loader2, FileText } from 'lucide-react';

export default function Result() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [roundTable, setRoundTable] = useState<RoundTable | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!id) return;
    loadRoundTable(id).then(async (rt) => {
      if (!rt) {
        navigate('/');
        return;
      }
      setRoundTable(rt);
      const msgs = await loadMessages(id);
      setMessages(msgs);
    });
  }, [id, navigate]);

  if (!roundTable) {
    return (
      <Layout>
        <div className="flex items-center justify-center flex-1 min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  const rt = roundTable!;
  const finalSummary = messages.find((m) => m.type === 'final_summary');
  const regularMessages = messages.filter((m) => m.type !== 'final_summary');

  const groupedByRound = new Map<number, Message[]>();
  regularMessages.forEach((msg) => {
    const existing = groupedByRound.get(msg.round) || [];
    existing.push(msg);
    groupedByRound.set(msg.round, existing);
  });

  function getFullTranscript(): string {
    const lines: string[] = [];
    lines.push(`主题：${rt.topic}`);
    lines.push(`主持人：${rt.host.name}`);
    lines.push(
      `参与角色：${rt.characters.map((c) => c.name).join('、')}`
    );
    lines.push(`讨论轮数：${rt.totalRounds} 轮`);
    lines.push('='.repeat(40));
    lines.push('');

    messages.forEach((msg) => {
      const roundLabel =
        msg.type === 'final_summary' ? '' : `[第${msg.round}轮]`;
      lines.push(`【${msg.characterName}】${roundLabel}`);
      lines.push(msg.content);
      lines.push('');
    });

    return lines.join('\n');
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(getFullTranscript());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = getFullTranscript();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }


  function getColorIndex(charId: string): number {
    return rt.characters.findIndex((c) => c.id === charId);
  }

  return (
    <Layout
      title="讨论记录"
      showBack
      backTo="/"
      actions={
        <>
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-500" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                复制全文
              </>
            )}
          </button>
          <button
            onClick={() => navigate('/create')}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            新讨论
          </button>
        </>
      }
    >
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        {/* Topic Card */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-8 text-white mb-8">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 opacity-80" />
            <span className="text-sm font-medium opacity-80">讨论主题</span>
          </div>
          <h2 className="text-2xl font-bold leading-relaxed">{rt.topic}</h2>
          <div className="flex flex-wrap gap-4 mt-4 text-sm opacity-80">
            <span>主持人：{rt.host.name}</span>
            <span>角色：{rt.characters.length} 人</span>
            <span>轮数：{rt.totalRounds} 轮</span>
          </div>
        </div>

        {/* Character Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            参与角色
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rt.characters.map((char, idx) => (
              <div
                key={char.id}
                className="p-3 border border-gray-100 rounded-xl bg-gray-50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      [
                        'bg-blue-400',
                        'bg-emerald-400',
                        'bg-amber-400',
                        'bg-rose-400',
                        'bg-indigo-400',
                        'bg-teal-400',
                        'bg-orange-400',
                        'bg-pink-400',
                      ][idx % 8]
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-800">
                    {char.name}
                  </span>
                  <span className="text-xs text-gray-400">{char.role}</span>
                </div>
                <p className="text-xs text-gray-500 ml-5">
                  立场：{char.stance}
                </p>
                <p className="text-xs text-gray-500 ml-5">
                  风格：{char.style}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Discussion Transcript */}
        <div className="space-y-8">
          {Array.from(groupedByRound.entries())
            .sort(([a], [b]) => a - b)
            .map(([round, msgs]) => (
              <div key={round}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-700 rounded-full text-sm font-bold">
                    {round}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      第 {round} 轮
                    </h3>
                    <p className="text-xs text-gray-400">
                      {round === 1
                        ? '初始观点'
                        : round === rt.totalRounds
                          ? '收束总结'
                          : '追问补充'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  {msgs.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      colorIndex={
                        msg.characterId === 'host'
                          ? 0
                          : getColorIndex(msg.characterId)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Final Summary */}
        {finalSummary && (
          <div className="mt-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 bg-amber-100 text-amber-700 rounded-full text-sm font-bold">
                ★
              </span>
              <h3 className="text-base font-semibold text-gray-900">
                主持人最终总结
              </h3>
            </div>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6">
              <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                {finalSummary.content}
              </p>
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center justify-center gap-4 mt-12 pb-8">
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5 text-green-500" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                复制全文
              </>
            )}
          </button>
          <button
            onClick={() => navigate('/create')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
          >
            <RefreshCw className="w-5 h-5" />
            创建新圆桌
          </button>
        </div>
      </div>
    </Layout>
  );
}
