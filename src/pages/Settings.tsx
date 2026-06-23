// ===== AI 圆桌模拟器 — Settings Page =====

import { useEffect, useState } from 'react';
import type { ProviderConfig } from '@/types/electron.d';
import { BUILTIN_PROVIDERS, generateProviderId } from '@/lib/provider-types';
import { listProviders, saveProvider, deleteProvider, testProvider, revealProviderKey } from '@/lib/settings-store';
import { useToast } from '@/components/Toast';
import Layout from '@/components/Layout';
import {
  Plus, Trash2, TestTube, Check, X, Loader2, Settings as SettingsIcon,
  AlertCircle, FlaskConical, Star, Eye, EyeOff, Info, FolderOpen,
  ExternalLink, Wrench,
} from 'lucide-react';

const PRESET_INFO = [
  // DeepSeek
  { name: 'DeepSeek V3', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'DeepSeek R1', url: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner' },
  // 智谱 GLM
  { name: 'GLM-5.2', url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2' },
  { name: 'GLM-5.1', url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.1' },
  // Kimi
  { name: 'Kimi K2.7 Code', url: 'https://api.moonshot.cn/v1', model: 'kimi-k2.7-code' },
  { name: 'Kimi K2.6', url: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' },
  // 阶跃星辰
  { name: 'MiMo-V2.5', url: 'https://api.stepfun.com/v1', model: 'mimo-v2.5' },
  { name: 'MiMo-V2.5-Pro', url: 'https://api.stepfun.com/v1', model: 'mimo-v2.5-pro' },
  // MiniMax
  { name: 'MiniMax M3', url: 'https://api.minimax.chat/v1', model: 'minimax-m3' },
  { name: 'MiniMax M2.7', url: 'https://api.minimax.chat/v1', model: 'minimax-m2.7' },
  // Qwen
  { name: 'Qwen3.7 Max', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-max' },
  { name: 'Qwen3.7 Plus', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-plus' },
  { name: 'Qwen3.6 Plus', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.6-plus' },
];

export default function Settings() {
  const { showToast } = useToast();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [plaintextKeys, setPlaintextKeys] = useState<Record<string, string>>({});
  const [keyCountdowns, setKeyCountdowns] = useState<Record<string, number>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  useEffect(() => {
    loadProviders();
    const api = window.electronAPI;
    if (api?.getUserDataPath) {
      api.getUserDataPath().then((p) => setStoragePath(p)).catch(() => {});
    }
    // Load data directory path from the new file-based storage
    if (api?.dataGetPath) {
      api.dataGetPath().then((p) => setStoragePath(p)).catch(() => {});
    }
  }, []);

  async function loadProviders() {
    setLoading(true);
    const p = await listProviders();
    setProviders(p);
    setLoading(false);
  }

  function applyPreset(name: string) {
    setShowPresetMenu(false);
    const preset = BUILTIN_PROVIDERS.find((p) => p.name === name);
    if (!preset) return;
    setFormName(preset.name);
    setFormBaseUrl(preset.baseUrl);
    setFormModel(preset.model);
  }

  async function handleSaveProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formBaseUrl.trim() || !formApiKey.trim()) {
      showToast({ type: 'warning', message: '请填写厂商名称、Base URL 和 API Key' });
      return;
    }

    setFormSaving(true);
    const config: ProviderConfig = {
      id: generateProviderId(),
      name: formName.trim(),
      baseUrl: formBaseUrl.trim().replace(/\/+$/, ''),
      apiKey: formApiKey.trim(),
      model: formModel.trim() || 'default',
      isCustom: !BUILTIN_PROVIDERS.some((p) => p.name === formName.trim()),
    };

    const result = await saveProvider(config);
    setFormSaving(false);

    if (result.ok) {
      showToast({ type: 'success', message: `已添加 ${config.name}` });
      setShowAddForm(false);
      setFormName(''); setFormBaseUrl(''); setFormApiKey(''); setFormModel('');
      await loadProviders();
    } else {
      showToast({ type: 'error', message: result.error || '保存失败' });
    }
  }

  async function handleTest(config: ProviderConfig) {
    setTestingId(config.id);
    const result = await testProvider(config);
    setTestingId(null);

    if (result.content) {
      showToast({ type: 'success', message: `✅ ${config.name} 连接成功！` });
    } else {
      showToast({ type: 'error', message: `❌ ${config.name} ${result.error || '连接失败'}` });
    }
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id);
    await deleteProvider(id);
    setDeletingId(null);
    showToast({ type: 'info', message: `已删除 ${name}` });
    await loadProviders();
  }

  async function handleRevealKey(id: string) {
    // Already revealed — hide it
    if (showKeys[id]) {
      setShowKeys((prev) => ({ ...prev, [id]: false }));
      return;
    }

    const result = await revealProviderKey(id);
    if (result.revealed && result.key) {
      setShowKeys((prev) => ({ ...prev, [id]: true }));
      setPlaintextKeys((prev) => ({ ...prev, [id]: result.key || '' }));
      setKeyCountdowns((prev) => ({ ...prev, [id]: 30 }));

      // Auto-hide countdown
      const timer = setInterval(() => {
        setKeyCountdowns((prev) => {
          const current = prev[id] ?? 0;
          if (current <= 1) {
            clearInterval(timer);
            setShowKeys((k) => ({ ...k, [id]: false }));
            return { ...prev, [id]: 0 };
          }
          return { ...prev, [id]: current - 1 };
        });
      }, 1000);
    } else if (result.error) {
      showToast({ type: 'error', message: result.error });
    }
  }

  // Test status tracking: we track last test time in a local map (ephemeral)
  const [lastTestTime, setLastTestTime] = useState<Record<string, string>>({});
  const [repairing, setRepairing] = useState(false);

  async function handleOpenDataDir() {
    await window.electronAPI?.dataOpenDirectory?.();
  }

  async function handleRepairIndex() {
    setRepairing(true);
    try {
      const result = await window.electronAPI?.dataRepairIndex?.();
      if (result) {
        const parts: string[] = [];
        if (result.repaired > 0) parts.push(`修复 ${result.repaired} 条`);
        if (result.removed > 0) parts.push(`移除 ${result.removed} 条孤儿`);
        if (result.errors.length > 0) parts.push(`${result.errors.length} 个错误`);
        showToast({
          type: result.errors.length > 0 ? 'warning' : 'success',
          message: parts.length > 0 ? `索引修复完成：${parts.join('，')}` : '索引正常，无需修复',
        });
        // Reload providers in case index changes affected anything
        loadProviders();
      }
    } catch (e: any) {
      showToast({ type: 'error', message: `修复失败：${e.message}` });
    }
    setRepairing(false);
  }

  return (
    <Layout
      title="设置"
      showBack
      backTo="/"
      actions={
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加厂商
        </button>
      }
    >
      <div className="max-w-3xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <SettingsIcon className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">LLM 厂商配置</h2>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form onSubmit={handleSaveProvider} className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-gray-900">添加 LLM 厂商</h3>
              <button type="button" onClick={() => setShowAddForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Preset selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className="w-full flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors"
              >
                <FlaskConical className="w-4 h-4" />
                从预设选择
              </button>
              {showPresetMenu && (
                <div className="absolute top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                  {PRESET_INFO.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p.name)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2 block sm:inline">{p.url}</span>
                      <span className="text-xs text-gray-400 ml-2">模型: {p.model}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">厂商名称</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="如：DeepSeek"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  API Base URL
                  <span className="text-gray-300 ml-1">例: {PRESET_INFO[0]?.url}</span>
                </label>
                <input type="text" value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <input type="password" value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  模型名称
                  <span className="text-gray-300 ml-1 cursor-help" title="模型名称由厂商决定，如 deepseek-chat、gpt-4o、glm-4 等">ⓘ</span>
                </label>
                <input type="text" value={formModel} onChange={(e) => setFormModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" />
              </div>
            </div>

            <button type="submit" disabled={formSaving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50">
              {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {formSaving ? '保存中...' : '保存'}
            </button>
          </form>
        )}

        {/* Provider list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        ) : providers.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-base font-medium text-gray-700 mb-2">尚未配置 LLM 厂商</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">点击右上角"添加厂商"按钮配置</p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((p, idx) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-purple-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 min-w-0 flex-1">
                    {/* Name + default badge */}
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{p.name}</h3>
                      {idx === 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          <Star className="w-3 h-3" />
                          默认
                        </span>
                      )}
                      {/* Connection status indicator (last test result) */}
                      <span className="w-2 h-2 rounded-full bg-gray-300" title="未测试" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-gray-500">
                      <div className="truncate">
                        <span className="text-gray-400">API: </span>
                        <span title={p.baseUrl}>{p.baseUrl}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-gray-400">模型: </span>
                        <span title={p.model}>{p.model}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">Key: </span>
                        <span className="font-mono">
                          {showKeys[p.id] && plaintextKeys[p.id]
                            ? plaintextKeys[p.id]
                            : p.apiKey}
                        </span>
                        {showKeys[p.id] && keyCountdowns[p.id] != null && (
                          <span className="text-xs text-amber-500 ml-1">
                            {keyCountdowns[p.id]}s
                          </span>
                        )}
                        <button onClick={() => handleRevealKey(p.id)}
                          className="p-0.5 hover:bg-gray-100 rounded transition-colors">
                          {showKeys[p.id] ? <EyeOff className="w-3 h-3 text-gray-400" /> : <Eye className="w-3 h-3 text-gray-400" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => handleTest(p)}
                      disabled={testingId === p.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      title="测试连接">
                      {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                      {testingId === p.id ? '测试中...' : '测试连接'}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={deletingId === p.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                      {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Usage guide */}
        <div className="mt-8 p-5 bg-indigo-50 border border-indigo-200 rounded-2xl">
          <h3 className="text-sm font-medium text-indigo-800 mb-2">💡 使用说明</h3>
          <ul className="space-y-1.5 text-xs text-indigo-700">
            <li>• 添加多个厂商后，创建圆桌时可为每个角色选择不同的 AI 模型</li>
            <li>• 建议先点击"测试连接"确认 API Key 有效</li>
            <li>• 所有厂商使用 OpenAI 兼容协议</li>
            <li>• API Key 仅存储在本地，不会上传到任何第三方</li>
            <li>• 列表第一个厂商将作为默认使用</li>
          </ul>
        </div>

        {/* Storage path */}
        {storagePath && (
          <div className="mt-4 p-4 bg-white border border-gray-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <FolderOpen className="w-3.5 h-3.5" />
                <span>数据目录：<code className="text-gray-700">{storagePath}</code></span>
              </div>
              <button
                onClick={handleOpenDataDir}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                打开
              </button>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={handleRepairIndex}
                disabled={repairing}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Wrench className="w-3.5 h-3.5" />
                {repairing ? '修复中...' : '修复索引'}
              </button>
              <span className="text-xs text-gray-400">校验索引与数据文件一致性</span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
