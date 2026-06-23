// ===== AI 圆桌模拟器 — Create Roundtable Page =====

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character, RoundTable } from '@/lib/types';
import type { ProviderConfig } from '@/types/electron.d';
import { generateId } from '@/lib/types';
import { saveRoundTable } from '@/lib/storage';
import { listProviders } from '@/lib/settings-store';
import { useToast } from '@/components/Toast';
import Layout from '@/components/Layout';
import CharacterForm from '@/components/CharacterForm';
import { Plus, Play, Settings, AlertCircle } from 'lucide-react';

export default function Create() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [topic, setTopic] = useState('');
  const [hostName, setHostName] = useState('主持人');
  const [hostStyle, setHostStyle] = useState('中立、控场、善于追问');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [totalRounds, setTotalRounds] = useState(3);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProviders().then((p) => {
      setProviders(p);
      setProvidersLoaded(true);
      const defaultProviderId = p.length > 0 ? p[0].id : 'default';
      setCharacters([
        {
          id: generateId(),
          name: '技术派',
          role: '技术负责人',
          stance: '关注实现难度、成本和技术风险',
          style: '冷静、直接、偏现实',
          providerId: defaultProviderId,
        },
        {
          id: generateId(),
          name: '用户代表',
          role: '普通用户',
          stance: '关注产品是否真的好用',
          style: '直白、具体、不讲空话',
          providerId: defaultProviderId,
        },
        {
          id: generateId(),
          name: '市场派',
          role: '市场总监',
          stance: '关注市场竞争和商业价值',
          style: '热情、有说服力、数据导向',
          providerId: defaultProviderId,
        },
      ]);
    });
  }, []);

  function addCharacter() {
    const defaultProviderId = providers.length > 0 ? providers[0].id : 'default';
    setCharacters([
      ...characters,
      { id: generateId(), name: '', role: '', stance: '', style: '', providerId: defaultProviderId },
    ]);
  }

  function updateCharacter(index: number, updated: Character) {
    const next = [...characters];
    next[index] = updated;
    setCharacters(next);
  }

  function removeCharacter(index: number) {
    if (characters.length <= 2) {
      setError('至少需要 2 个角色');
      return;
    }
    setCharacters(characters.filter((_, i) => i !== index));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Check providers first
    if (providers.length === 0) {
      setError('请先在设置页配置至少一个 LLM 厂商');
      return;
    }

    if (!topic.trim()) {
      setError('请输入讨论主题');
      return;
    }

    if (!hostName.trim()) {
      setError('请输入主持人名称');
      return;
    }

    const validChars = characters.filter((c) => c.name.trim());
    if (validChars.length < 2) {
      setError('至少需要 2 个有名称的角色');
      return;
    }

    if (totalRounds < 2 || totalRounds > 5) {
      setError('讨论轮数需要在 2-5 之间');
      return;
    }

    setSaving(true);
    try {
      const roundTable: RoundTable = {
        id: generateId(),
        topic: topic.trim(),
        host: { name: hostName.trim(), style: hostStyle.trim() },
        characters: validChars,
        totalRounds,
        status: 'created',
        createdAt: Date.now(),
      };

      await saveRoundTable(roundTable);
      navigate(`/discussion/${roundTable.id}`);
    } catch (err: any) {
      showToast({ type: 'error', message: err.message || '保存失败' });
    } finally {
      setSaving(false);
    }
  }

  // No providers configured — show blocking message
  if (providersLoaded && providers.length === 0) {
    return (
      <Layout title="创建圆桌" showBack backTo="/">
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            需要先配置 LLM 厂商
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            在开始创建圆桌之前，请先前往设置页添加至少一个 LLM 厂商（如 DeepSeek、OpenAI 等）。
          </p>
          <button
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
          >
            <Settings className="w-5 h-5" />
            前往设置
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="创建圆桌" showBack backTo="/">
      <div className="max-w-3xl mx-auto w-full px-4 py-8">
        <p className="text-sm text-gray-500 mb-6">
          设置讨论主题、主持人和参与角色
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Topic */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">讨论主题</h2>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入讨论主题，比如：人工智能是否会取代人类工作？"
              rows={3}
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none"
              required
            />
          </section>

          {/* Host */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">主持人设置</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  主持人名称
                </label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="主持人"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  主持风格
                </label>
                <input
                  type="text"
                  value={hostStyle}
                  onChange={(e) => setHostStyle(e.target.value)}
                  placeholder="中立、控场、善于追问"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
              </div>
            </div>
          </section>

          {/* Characters */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">角色列表</h2>
              <button
                type="button"
                onClick={addCharacter}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                添加角色
              </button>
            </div>
            <p className="text-xs text-gray-400">
              至少 2 个角色，建议 3-5 个角色。每个角色可选择不同的 AI 模型。
            </p>
            <div className="space-y-3">
              {characters.map((char, index) => (
                <CharacterForm
                  key={char.id}
                  index={index}
                  character={char}
                  providers={providers}
                  onChange={(updated) => updateCharacter(index, updated)}
                  onRemove={() => removeCharacter(index)}
                />
              ))}
            </div>
          </section>

          {/* Rounds */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">讨论轮数</h2>
            <div className="flex items-center gap-4">
              <input
                type="number"
                value={totalRounds}
                onChange={(e) =>
                  setTotalRounds(
                    Math.max(2, Math.min(5, parseInt(e.target.value) || 3))
                  )
                }
                min={2}
                max={5}
                className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent text-center"
              />
              <span className="text-sm text-gray-500">轮（2-5 轮）</span>
            </div>
            <p className="text-xs text-gray-400">
              默认 3 轮：第 1 轮初始观点 → 第 2 轮追问补充 → 第 3 轮收束总结
            </p>
          </section>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 disabled:opacity-50"
          >
            <Play className="w-5 h-5" />
            {saving ? '保存中...' : '开始讨论'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
