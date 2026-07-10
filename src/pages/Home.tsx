// ===== AI 圆桌模拟器 — Home Page =====

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProviders } from '@/lib/settings-store';
import { generateId } from '@/lib/types';
import { saveRoundTable, listRoundTables, deleteRoundTable, saveMessages } from '@/lib/storage';
import { useToast } from '@/components/Toast';
import type { ProviderConfig } from '@/types/electron.d';
import Layout from '@/components/Layout';
import ConfirmDialog from '@/components/ConfirmDialog';
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
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; topic: string } | null>(null);
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
    setConfirmDelete({ id, topic });
  }

  async function doDelete(id: string, topic: string) {
    setConfirmDelete(null);
    
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
    const overwritten = {
      ...rt,
      id: rt.id,
      status: 'created' as const,
      updatedAt: Date.now(),
    };
    await saveRoundTable(overwritten as any);
    await saveMessages(rt.id, []);
    showToast({ type: 'success', message: '正在重新运行...' });
    navigate(`/discussion/${rt.id}`);
  }

  return (
    <Layout title="讨论列表" actions={
      <button
        onClick={() => navigate('/create')}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-p600 text-white rounded-lg text-sm font-medium hover:bg-p700 transition-colors"
      >
        <MessageSquarePlus className="w-4 h-4" />
        创建圆桌
      </button>
    }>
      {/* First-run */}
      {loaded && providers.length === 0 && (
        <section className="px-4 max-w-4xl mx-auto w-full pt-4">
          <div className="p-4 bg-warning/10 border border-warning/30 rounded-r-xl flex items-start gap-3">
            <div className="w-9 h-9 bg-warning/20 rounded-r-xl flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-warning" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-warning mb-1">欢迎使用MultiRound</h3>
              <p className="text-xs text-warning leading-relaxed">
                首次使用需要先配置 LLM 厂商。请前往设置页添加 API Key。
              </p>
              <button
                onClick={() => navigate('/settings')}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning text-white rounded-lg text-xs font-medium hover:opacity-80 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                前往设置
              </button>
            </div>
          </div>
        </section>
      )}

      {/* In-progress sessions */}
      {history.filter(rt => rt.status === 'discussing').length > 0 && (
        <section className="px-4 max-w-4xl mx-auto w-full pt-4">
          <h3 className="text-sm font-semibold text-g700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-p500 animate-pulse" />
            进行中
          </h3>
          <div className="flex flex-wrap gap-3">
            {history.filter(rt => rt.status === 'discussing').map(rt => (
              <button key={rt.id} onClick={() => navigate(`/discussion/${rt.id}`)}
                className="flex items-center gap-3 px-4 py-3 bg-p50 border-p200 rounded-r-xl hover:bg-p100 transition-colors">
                <span className="w-2 h-2 rounded-full bg-p500 animate-pulse" />
                <span className="text-sm font-medium text-p800 truncate max-w-[160px]">{rt.topic}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Discussion list — main content */}
      <section className="px-4 max-w-4xl mx-auto w-full pt-4 pb-12 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-g900 flex items-center gap-2">
            <History className="w-5 h-5" />
            讨论记录
          </h2>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <span className="text-xs text-g400">{history.length} 条记录</span>
            )}
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-g500 hover:text-p600 hover:bg-p50 rounded-lg transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              设置
            </button>
          </div>
        </div>

        {/* Search */}
        {history.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索历史讨论..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border-g300 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-p400 focus:border-transparent bg-white"
            />
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-r-xl border-g200">
            <div className="w-12 h-12 bg-g100 rounded-r-xl flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 text-g400" />
            </div>
            {history.length === 0 ? (
              <>
                <h3 className="text-sm font-medium text-g700 mb-1">暂无讨论记录</h3>
                <p className="text-xs text-g400">点击右上角「创建圆桌」开始你的第一场讨论</p>
              </>
            ) : (
              <p className="text-sm text-g500">未找到匹配的记录</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((rt) => (
            <div
              key={rt.id}
              className="bg-white rounded-r-xl border-g200 hover:border-p200 transition-all"
            >
              {/* Clickable topic area */}
              <button
                onClick={() => navigate(`/result/${rt.id}`)}
                className="w-full text-left p-4 pb-2"
              >
                <h3 className="font-medium text-g900 text-sm truncate" title={rt.topic}>{rt.topic}</h3>
                <p className="text-xs text-g400 mt-1">
                  {(rt.characters || []).length} 个角色 · {rt.totalRounds === 0 ? '不预设轮数' : `${rt.totalRounds || 3} 轮`} ·{' '}
                  {new Date(rt.createdAt || Date.now()).toLocaleDateString('zh-CN')}
                </p>
              </button>
              {/* Action buttons */}
              <div className="flex items-center gap-1 px-4 pb-3 border-t border-g50 pt-2">
                <button
                  onClick={() => handleReRun(rt)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-p600 hover:bg-p50 rounded-r-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  重新运行
                </button>
                <button
                  onClick={() => navigate(`/result/${rt.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-g500 hover:bg-g50 rounded-r-lg transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  查看
                </button>
                <button
                  onClick={() => handleExport(rt.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-g500 hover:bg-g50 rounded-r-lg transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  复制
                </button>
                <button
                  onClick={() => handleDelete(rt.id, rt.topic)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-error hover:bg-error/10 rounded-r-lg transition-colors ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={confirmDelete !== null}
        title="删除圆桌"
        message={`确定删除「${confirmDelete?.topic?.slice(0, 30) || ""}」吗？聊天记录也会一起删除。`}
        variant="danger"
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={() => { if (confirmDelete) doDelete(confirmDelete.id, confirmDelete.topic); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </Layout>
  );
}
