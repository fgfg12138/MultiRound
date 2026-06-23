// ===== AI 圆桌模拟器 — Home Page =====

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProviders } from '@/lib/settings-store';
import { generateId } from '@/lib/types';
import { saveRoundTable, listRoundTables, deleteRoundTable } from '@/lib/storage';
import { useToast } from '@/components/Toast';
import type { ProviderConfig } from '@/types/electron.d';
import Layout from '@/components/Layout';
import {
  MessageSquarePlus, History, MessageCircle, Sparkles,
  Settings, AlertCircle, Search, Trash2, Copy, Download,
  Play, ChevronRight, Clock,
} from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [history, setHistory] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadHistory() {
    try {
      const provs = await listProviders();
      setProviders(provs);

      let tables = await listRoundTables();
      setHistory(tables);
      setFiltered(tables);
    } catch (err: any) {
      console.error('[loadHistory]', err);
      showToast?.({ type: 'error', message: '加载历史记录失败' });
    }
    setLoaded(true);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  // Search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(history);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFiltered(history.filter((rt) => rt.topic?.toLowerCase().includes(q)));
  }, [searchQuery, history]);

  async function handleDelete(id: string, topic: string) {
    if (!window.confirm(`确定删除「${topic.slice(0, 30)}」吗？\n聊天记录也会一起删除。`)) return;
    await deleteRoundTable(id);
    showToast({ type: 'info', message: '已删除' });
    loadHistory();
  }

  async function handleExport(id: string) {
    const result = await (window.electronAPI?.dataExportRoundtable?.(id) ?? Promise.resolve({ error: '未在桌面环境中' }));
    if (result.content) {
      try {
        await navigator.clipboard.writeText(result.content);
        showToast({ type: 'success', message: '讨论记录已复制到剪贴板' });
      } catch {
        showToast({ type: 'error', message: '复制失败，请手动复制' });
      }
    } else {
      showToast({ type: 'error', message: result.error || '导出失败' });
    }
  }

  async function handleReRun(rt: any) {
    const newRt = {
      ...rt,
      id: rt.id,
      characters: (rt.characters || []).map((c: any) => ({
        ...c,
        id: c.id,
      })),
      status: 'created' as const,
      createdAt: Date.now(),
    };
    await saveRoundTable(newRt as any);
    showToast({ type: 'success', message: '正在重新运行...' });
    navigate(`/discussion/${rt.id}`);
  }

  return (
    <Layout>
      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-16 px-4 text-center bg-gradient-to-br from-purple-50 via-white to-indigo-50">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            <MessageCircle className="w-4 h-4" />
            AI 圆桌讨论
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
            MultiRound
          </h1>
          <p className="text-lg text-gray-600 max-w-lg mx-auto leading-relaxed">
            让多个 AI 角色围绕一个主题进行主持式圆桌讨论
          </p>
          <button
            onClick={() => navigate('/create')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
          >
            <MessageSquarePlus className="w-5 h-5" />
            创建圆桌
          </button>
        </div>
      </section>

      {/* First-run */}
      {loaded && providers.length === 0 && (
        <section className="px-4 max-w-4xl mx-auto w-full -mt-4">
          <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800 mb-1">欢迎使用MultiRound 🎉</h3>
              <p className="text-xs text-amber-700 leading-relaxed">
                首次使用需要先配置 LLM 厂商。请前往设置页添加 API Key。
              </p>
              <button
                onClick={() => navigate('/settings')}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                前往设置
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-12 px-4 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <MessageCircle className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">多角色讨论</h3>
            <p className="text-sm text-gray-500">每个角色可选不同的 AI 模型</p>
          </div>
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">主持人控场</h3>
            <p className="text-sm text-gray-500">开场、小结、追问、总结</p>
          </div>
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
              <History className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">保存记录</h3>
            <p className="text-sm text-gray-500">自动保存，随时回顾或重新运行</p>
          </div>
        </div>
      </section>

      {/* Settings shortcut */}
      <section className="px-4 max-w-4xl mx-auto w-full mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 hover:border-purple-300 transition-colors"
        >
          <Settings className="w-4 h-4" />
          LLM 厂商设置
        </button>
      </section>

      {/* In-progress sessions */}
      {history.filter(rt => rt.status === 'discussing').length > 0 && (
        <section className="px-4 max-w-4xl mx-auto w-full mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            进行中
          </h3>
          <div className="flex flex-wrap gap-3">
            {history.filter(rt => rt.status === 'discussing').map(rt => (
              <button key={rt.id} onClick={() => navigate(`/discussion/${rt.id}`)}
                className="flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-sm font-medium text-purple-800 truncate max-w-[160px]">{rt.topic}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* History section */}
      <section className="px-4 max-w-4xl mx-auto w-full pb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5" />
            历史记录
          </h2>
          {history.length > 0 && (
            <span className="text-xs text-gray-400">{history.length} 条记录</span>
          )}
        </div>

        {/* Search */}
        {history.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索历史讨论..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white"
            />
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 text-gray-400" />
            </div>
            {history.length === 0 ? (
              <>
                <h3 className="text-sm font-medium text-gray-700 mb-1">暂无历史记录</h3>
                <p className="text-xs text-gray-400">完成一场圆桌讨论后，记录会自动保存到这里</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">未找到匹配的记录</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((rt) => (
            <div
              key={rt.id}
              className="bg-white rounded-xl border border-gray-200 hover:border-purple-200 transition-all"
            >
              {/* Clickable topic area */}
              <button
                onClick={() => navigate(`/result/${rt.id}`)}
                className="w-full text-left p-4 pb-2"
              >
                <h3 className="font-medium text-gray-900 text-sm truncate" title={rt.topic}>{rt.topic}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {(rt.characters || []).length} 个角色 · {rt.totalRounds === 0 ? '不预设轮数' : `${rt.totalRounds || 3} 轮`} ·{' '}
                  {new Date(rt.createdAt || Date.now()).toLocaleDateString('zh-CN')}
                </p>
              </button>
              {/* Action buttons */}
              <div className="flex items-center gap-1 px-4 pb-3 border-t border-gray-50 pt-2">
                <button
                  onClick={() => handleReRun(rt)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  重新运行
                </button>
                <button
                  onClick={() => navigate(`/result/${rt.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  查看
                </button>
                <button
                  onClick={() => handleExport(rt.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  复制
                </button>
                <button
                  onClick={() => handleDelete(rt.id, rt.topic)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto py-6 text-center text-xs text-gray-400 border-t border-gray-100">
        MultiRound v1.0
      </footer>
    </Layout>
  );
}
