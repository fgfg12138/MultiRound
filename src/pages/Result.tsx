// ===== AI 圆桌模拟器 — Result Page =====

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { RoundTable, Message } from '@/lib/types';
import { generateId, CURRENT_SCHEMA_VERSION } from '@/lib/types';
import { loadRoundTable, loadMessages, saveRoundTable, saveMessages } from '@/lib/storage';
import { useToast } from '@/components/Toast';
import Layout from '@/components/Layout';
import MessageBubble from '@/components/MessageBubble';
import { Copy, Check, RefreshCw, Loader2, FileText, Play } from 'lucide-react';

interface StructuredData {
  conclusion?: string;
  consensusPoints?: string[];
  disagreementPoints?: string[];
  goalAchieved?: string;
  recommendations?: string[];
}

function parseStructuredResult(raw: string): StructuredData | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed && (parsed.conclusion || parsed.consensusPoints)) {
        return {
          conclusion: parsed.conclusion || '',
          consensusPoints: Array.isArray(parsed.consensusPoints) ? parsed.consensusPoints : [],
          disagreementPoints: Array.isArray(parsed.disagreementPoints) ? parsed.disagreementPoints : [],
          goalAchieved: parsed.goalAchieved || '',
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        };
      }
    }
  } catch { /* fallthrough */ }
  return null;
}

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
          <Loader2 className="w-8 h-8 text-g400 animate-spin" />
        </div>
      </Layout>
    );
  }

  const rt = roundTable!;
  const finalSummary = messages.find((m) => m.type === 'final_summary');
  const structuredMsg = messages.find((m) => m.type === 'result');
  const regularMessages = messages.filter((m) => m.type !== 'final_summary' && m.type !== 'result');

  // Parse structured result from JSON
  const structured = structuredMsg ? parseStructuredResult(structuredMsg.content) : null;

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

  /** 从指定轮次之后继续讨论，创建新的 RoundTable */
  async function continueFromRound(round: number) {
    const newId = generateId();
    const newRt: RoundTable = {
      ...JSON.parse(JSON.stringify(rt)),
      id: newId,
      topic: `${rt.topic}（续第${round}轮）`,
      status: 'created',
      createdAt: Date.now(),
      _initialRound: round + 1, // new discussion starts from next round
    };
    // 携带该轮之前（含该轮）的历史消息作为种子
    const seedMessages = messages
      .filter((m) => m.round <= round)
      .map((m) => ({ ...m, roundTableId: newId }));
    await saveRoundTable(newRt);
    await saveMessages(newId, seedMessages);
    navigate(`/discuss/${newId}`);
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
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm border border-g200 rounded-r-xl hover:bg-g50 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-success" />
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
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-p600 text-white rounded-r-xl hover:bg-p700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            新讨论
          </button>
        </>
      }
    >
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        {/* Topic Card */}
        <div className="bg-gradient-to-r from-p600 to-p800 rounded-r-xl p-8 text-white mb-8">
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
        <div className="bg-white rounded-r-xl border-g200 p-s6 mb-8">
          <h3 className="text-sm font-semibold text-g900 mb-4">
            参与角色
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rt.characters.map((char, idx) => (
              <div
                key={char.id}
                className="p-3 border border-g100 rounded-r-lg bg-g50"
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
                  <span className="text-sm font-medium text-g800">
                    {char.name}
                  </span>
                  <span className="text-xs text-g400">{char.role}</span>
                </div>
                <p className="text-xs text-g500 ml-5">
                  立场：{char.stance}
                </p>
                <p className="text-xs text-g500 ml-5">
                  风格：{char.style}
                </p>
                {char.secret?.secretRole && (
                  <p className="text-xs text-g500 ml-5">
                    身份：{char.secret.secretRole}{char.secret.revealed ? '' : '（未公开）'}
                  </p>
                )}
                <p className="text-xs text-g500 ml-5">
                  模型：{char.model || '默认'}
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
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-p100 text-p700 rounded-full text-sm font-bold">
                    {round}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-g900">
                      第 {round} 轮
                    </h3>
                    <p className="text-xs text-g400">
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
                {/* 从本轮继续讨论 */}
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => continueFromRound(round)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-p600 bg-p50 border-p200 rounded-r-lg hover:bg-p100 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    从这里继续讨论
                  </button>
                </div>
              </div>
            ))}
        </div>

        {/* Structured Result */}
        {structured && (
          <div className="mt-10 bg-white rounded-r-xl border-g200 p-s6">
            <h3 className="text-base font-semibold text-g900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-p600" />
              结构化结论
            </h3>

            {structured.conclusion && (
              <div className="mb-4">
                <p className="text-xs text-g400 mb-1 font-medium">核心结论</p>
                <p className="text-sm text-g800 leading-relaxed bg-g50 rounded-r-lg p-4">{structured.conclusion}</p>
              </div>
            )}

            {structured.consensusPoints && structured.consensusPoints.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-g400 mb-1 font-medium">共识点</p>
                <ul className="space-y-1">
                  {structured.consensusPoints.map((pt, i) => (
                    <li key={i} className="text-sm text-g700 flex items-start gap-2">
                      <span className="text-success mt-1">✓</span> {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {structured.disagreementPoints && structured.disagreementPoints.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-g400 mb-1 font-medium">分歧点</p>
                <ul className="space-y-1">
                  {structured.disagreementPoints.map((pt, i) => (
                    <li key={i} className="text-sm text-g700 flex items-start gap-2">
                      <span className="text-error mt-1">✗</span> {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {structured.goalAchieved && (
              <div className="mb-4">
                <p className="text-xs text-g400 mb-1 font-medium">目标达成</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                  structured.goalAchieved === 'yes' ? 'bg-success/10 text-success' :
                  structured.goalAchieved === 'partial' ? 'bg-warning/10 text-warning' :
                  'bg-error/10 text-error'
                }`}>
                  {structured.goalAchieved === 'yes' ? '✅ 是' :
                   structured.goalAchieved === 'partial' ? '🔶 部分' : '❌ 否'}
                </span>
              </div>
            )}

            {structured.recommendations && structured.recommendations.length > 0 && (
              <div>
                <p className="text-xs text-g400 mb-1 font-medium">后续建议</p>
                <ul className="space-y-1">
                  {structured.recommendations.map((r, i) => (
                    <li key={i} className="text-sm text-g700 flex items-start gap-2">
                      <span className="text-p500 mt-0.5">→</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Final Summary */}
        {finalSummary && (
          <div className="mt-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 bg-warning/20 text-warning rounded-full text-sm font-bold">
                ★
              </span>
              <h3 className="text-base font-semibold text-g900">
                主持人最终总结
              </h3>
            </div>
            <div className="bg-gradient-to-r from-warning/10 to-orange-50 border-warning/30 rounded-r-xl p-6">
              <p className="text-sm leading-relaxed text-g800 whitespace-pre-wrap">
                {finalSummary.content}
              </p>
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center justify-center gap-4 mt-12 pb-8">
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-g200 rounded-r-xl hover:bg-g50 transition-colors shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5 text-success" />
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
            className="inline-flex items-center gap-2 px-6 py-3 bg-p600 text-white rounded-r-xl font-medium hover:bg-p700 transition-colors shadow-md shadow-p200"
          >
            <RefreshCw className="w-5 h-5" />
            创建新圆桌
          </button>
        </div>
      </div>
    </Layout>
  );
}
