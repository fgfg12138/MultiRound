// ===== AI 圆桌模拟器 — Settings Page =====

import { useEffect, useState } from 'react';
import type { ProviderConfig } from '@/types/electron.d';
import { BUILTIN_PROVIDERS, generateProviderId } from '@/lib/provider-types';
import { listProviders, saveProvider, updateProvider, deleteProvider, testProvider, revealProviderKey } from '@/lib/settings-store';
import { useToast } from '@/components/Toast';
import ModelTagInput from '@/components/ModelTagInput';
import Layout from '@/components/Layout';
import {
  Plus, Trash2, TestTube, Check, X, Loader2, Settings as SettingsIcon,
  AlertCircle, FlaskConical, Star, Eye, EyeOff, Info, FolderOpen,
  ExternalLink, Wrench,
} from 'lucide-react';

const PRESET_INFO = BUILTIN_PROVIDERS;

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
  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'success' | 'error' | null>>({});
  // Form state
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formModels, setFormModels] = useState<string[]>([]);
  const [formDefaultModel, setFormDefaultModel] = useState('');
  // placeholder
  const [formSaving, setFormSaving] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
const [editingId, setEditingId] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

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
    setFormModel('');  // 清空，用户自己填或用「获取模型」
    setFormModels([]); setFormDefaultModel('');
  }

  async function handleSaveProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formBaseUrl.trim() || !formApiKey.trim()) {
    if (formModels.length === 0 && !formModel.trim()) { showToast({ type: 'warning', message: '请至少添加一个模型（点获取模型或手动输入）' }); return; }
      showToast({ type: 'warning', message: '请填写厂商名称、Base URL 和 API Key' });
      return;
    }

    setFormSaving(true);
    const config: ProviderConfig = {
      id: editingId || generateProviderId(),
      name: formName.trim(),
      baseUrl: formBaseUrl.trim().replace(/\/+$/, ''),
      apiKey: formApiKey.trim(),
      model: formDefaultModel || formModels[0] || formModel.trim() || "",
      models: formModels.length > 0 ? formModels.filter(m => m && m !== 'default') : (formModel.trim() ? [formModel.trim()] : []),
      defaultModel: formDefaultModel || formModels[0] || formModel.trim() || "",
      isCustom: !BUILTIN_PROVIDERS.some((p) => p.name === formName.trim()),
    };

    const result = editingId ? await updateProvider(editingId, config) : await saveProvider(config);
    setFormSaving(false);

    if (result.ok) {
      showToast({ type: 'success', message: `已添加 ${config.name}` });
      setShowAddForm(false);
      setEditingId(null);
      setFormName(''); setFormBaseUrl(''); setFormApiKey(''); setFormModel(''); setFormModels([]); setFormDefaultModel('');
      await loadProviders();
    } else {
      showToast({ type: 'error', message: result.error || '保存失败' });
    }
  }

  async function handleTest(config: ProviderConfig) {
    setTestingId(config.id);
    setTestStatus(prev => ({ ...prev, [config.id]: 'testing' }));
    const result = await testProvider(config);
    setTestingId(null);
    setLastTestTime(prev => ({ ...prev, [config.id]: new Date().toLocaleTimeString() }));

    if (result.content) {
      setTestStatus(prev => ({ ...prev, [config.id]: 'success' }));
      showToast({ type: 'success', message: `✅ ${config.name} 连接成功！` });
    } else {
      setTestStatus(prev => ({ ...prev, [config.id]: 'error' }));
      showToast({ type: 'error', message: `❌ ${config.name} ${result.error || '连接失败'}` });
    }
  }

  async function handleEdit(p: ProviderConfig) {
    setFormName(p.name);
    setFormBaseUrl(p.baseUrl);
    setFormApiKey('');
    setFormModel(p.model || '');
    setFormModels(p.models || []);
    setFormDefaultModel(p.defaultModel || p.model || '');
    setEditingId(p.id);
    setShowAddForm(true);
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id);
    const result = await deleteProvider(id);
    setDeletingId(null);
    if (result.ok) {
      showToast({ type: 'info', message: `已删除 ${name}` });
    } else {
      showToast({ type: 'error', message: result.error || '删除失败' });
    }
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-p600 text-white rounded-r-lg hover:bg-p700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加厂商
        </button>
      }
    >
      <div className="max-w-3xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <SettingsIcon className="w-5 h-5 text-g500" />
          <h2 className="text-lg font-semibold text-g900">LLM 厂商配置</h2>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form onSubmit={handleSaveProvider} className="bg-white rounded-r-xl border-g200 p-s6 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-g900">添加 LLM 厂商</h3>
              <button type="button" onClick={() => { setShowAddForm(false); setEditingId(null); }} className="p-1 hover:bg-g100 rounded-r-lg">
                <X className="w-4 h-4 text-g400" />
              </button>
            </div>

            {/* Preset selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className="w-full flex items-center gap-2 px-4 py-2.5 border border-dashed border-g300 rounded-r-xl text-sm text-g500 hover:border-p300 hover:text-p600 transition-colors"
              >
                <FlaskConical className="w-4 h-4" />
                从预设选择
              </button>
              {showPresetMenu && (
                <div className="absolute top-full mt-1 left-0 w-full bg-white border border-g200 rounded-r-xl shadow-lg z-10 overflow-hidden">
                  {PRESET_INFO.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p.name)}
                      className="w-full text-left px-4 py-2.5 text-sm text-g700 hover:bg-p50 hover:text-p700 transition-colors"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-g400 ml-2">{p.baseUrl}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-g500 mb-1">厂商名称</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="如：DeepSeek"
                  className="w-full px-3 py-2 text-sm border-g300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-p400 focus:border-transparent" required />
              </div>
              <div>
                <label className="block text-xs text-g500 mb-1">
                  API Base URL
                  <span className="text-g300 ml-1">例: {PRESET_INFO[0]?.baseUrl}</span>
                </label>
                <input type="text" value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 text-sm border-g300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-p400 focus:border-transparent" required />
              </div>
              <div>
                <label className="block text-xs text-g500 mb-1">API Key</label>
                <input type="password" value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 text-sm border-g300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-p400 focus:border-transparent" required />
              </div>
              <div>
                <label className="block text-xs text-g500 mb-1">
                  模型列表
                  <span className="text-g300 ml-1 cursor-help" title="可添加多个模型，创建圆桌时为每个角色选择">ⓘ</span>
                </label>
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <ModelTagInput models={formModels} onChange={setFormModels} error={formModels.length === 0 ? '至少添加一个模型' : undefined} />
                  </div>
                  <button type="button"
                    onClick={async () => {
                      if (!formBaseUrl.trim()) { showToast({ type: 'warning', message: '请先填写 Base URL' }); return; }
                      setFormSaving(true);
                      try {
                        if (!window.electronAPI?.providersFetchModels) { showToast({ type: 'error', message: '此功能仅在 Electron 桌面应用中可用' }); return; }
                        const result = await window.electronAPI.providersFetchModels({ baseUrl: formBaseUrl.trim(), apiKey: formApiKey.trim() });
                        if (result.ok && result.models?.length) {
                          setFormModels(result.models);
                          setFormDefaultModel(result.models[0]);
                          showToast({ type: 'success', message: '找到 ' + result.models.length + ' 个模型' });
                        } else {
                          showToast({ type: 'error', message: result.error || '获取失败，请手动输入模型名' });
                        }
                      } catch (err: any) {
                        showToast({ type: 'error', message: err?.message || '获取失败' });
                      } finally { setFormSaving(false); }
                    }}
                    disabled={formSaving}
                    className="shrink-0 px-3 py-2 text-sm bg-g100 hover:bg-g200 rounded-r-lg transition-colors disabled:opacity-50 whitespace-nowrap">获取模型</button>
                </div>
                {formModels.length > 1 && (
                  <div className="mt-2">
                    <label className="block text-xs text-g500 mb-1">默认模型</label>
                    <select value={formDefaultModel} onChange={e => setFormDefaultModel(e.target.value)} className="w-full px-3 py-2 text-sm border-g300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-p400 bg-white">
                      {formModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" disabled={formSaving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-p600 text-white rounded-r-xl text-sm font-medium hover:bg-p700 transition-colors disabled:opacity-50">
              {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {formSaving ? '保存中...' : '保存'}
            </button>
          </form>
        )}

        {/* Provider list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-g400 animate-spin" /></div>
        ) : providers.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-r-xl border-g200">
            <div className="w-12 h-12 bg-g100 rounded-r-xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-g400" />
            </div>
            <h3 className="text-base font-medium text-g700 mb-2">尚未配置 LLM 厂商</h3>
            <p className="text-sm text-g400 max-w-sm mx-auto">点击右上角"添加厂商"按钮配置</p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((p, idx) => (
              <div key={p.id} className="bg-white rounded-r-xl border-g200 p-5 hover:border-p200 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 min-w-0 flex-1">
                    {/* Name + default badge */}
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-g900">{p.name}</h3>
                      {idx === 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning/20 text-warning rounded-full text-xs font-medium">
                          <Star className="w-3 h-3" />
                          默认
                        </span>
                      )}
                      {/* Connection status indicator */}
                      {testStatus[p.id] === 'testing' && <span className="w-2 h-2 rounded-full bg-warning" title="测试中..." />}
                      {testStatus[p.id] === 'success' && <span className="w-2 h-2 rounded-full bg-success" title={`最后测试: ${lastTestTime[p.id]}`} />}
                      {testStatus[p.id] === 'error' && <span className="w-2 h-2 rounded-full bg-error" title={`失败: ${lastTestTime[p.id]}`} />}
                      {!testStatus[p.id] && <span className="w-2 h-2 rounded-full bg-g300" title="未测试" />}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-g500">
                      <div className="truncate">
                        <span className="text-g400">API: </span>
                        <span title={p.baseUrl}>{p.baseUrl}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-g400">模型: </span>
                        <span title={p.model}>{p.model}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-g400">Key: </span>
                        <span className="font-mono">
                          {showKeys[p.id] && plaintextKeys[p.id]
                            ? plaintextKeys[p.id]
                            : p.apiKey}
                        </span>
                        {showKeys[p.id] && keyCountdowns[p.id] != null && (
                          <span className="text-xs text-warning ml-1">
                            {keyCountdowns[p.id]}s
                          </span>
                        )}
                        <button onClick={() => handleRevealKey(p.id)}
                          className="p-0.5 hover:bg-g100 rounded transition-colors">
                          {showKeys[p.id] ? <EyeOff className="w-3 h-3 text-g400" /> : <Eye className="w-3 h-3 text-g400" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => handleTest(p)}
                      disabled={testingId === p.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-g200 rounded-r-lg hover:bg-g50 transition-colors disabled:opacity-50"
                      title="测试连接">
                      {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                      {testingId === p.id ? '测试中...' : '测试连接'}
                    </button>
                    <button
                      onClick={() => handleEdit(p)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-g200 rounded-r-lg hover:bg-g50 transition-colors"
                      title="编辑">
                      <SettingsIcon className="w-3.5 h-3.5" />
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={deletingId === p.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-error border border-error/30 rounded-r-lg hover:bg-error/10 transition-colors disabled:opacity-50">
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
        <div className="mt-8 p-5 bg-p50 border-p200 rounded-r-xl">
          <h3 className="text-sm font-medium text-p800 mb-2">💡 使用说明</h3>
          <ul className="space-y-1.5 text-xs text-p700">
            <li>• 添加多个厂商后，创建圆桌时可为每个角色选择不同的 AI 模型</li>
            <li>• 建议先点击"测试连接"确认 API Key 有效</li>
            <li>• 所有厂商使用 OpenAI 兼容协议</li>
            <li>• API Key 仅存储在本地，不会上传到任何第三方</li>
            <li>• 列表第一个厂商将作为默认使用</li>
          </ul>
        </div>

        {/* Storage path */}
        {storagePath && (
          <div className="mt-4 p-4 bg-white border-g200 rounded-r-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-g500">
                <FolderOpen className="w-3.5 h-3.5" />
                <span>数据目录：<code className="text-g700">{storagePath}</code></span>
              </div>
              <button
                onClick={handleOpenDataDir}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-p600 border-p200 rounded-r-lg hover:bg-p50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                打开
              </button>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-g100">
              <button
                onClick={handleRepairIndex}
                disabled={repairing}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-g600 border-g200 rounded-r-lg hover:bg-g50 transition-colors disabled:opacity-50"
              >
                <Wrench className="w-3.5 h-3.5" />
                {repairing ? '修复中...' : '修复索引'}
              </button>
              <span className="text-xs text-g400">校验索引与数据文件一致性</span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
