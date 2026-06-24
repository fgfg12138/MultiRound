// ===== AI 圆桌模拟器 — Create Roundtable Page (V3) =====

import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character, RoundTable, Team, SecretRole, CharacterSecret, CharacterMemory } from '@/lib/types';
import type { ProviderConfig } from '@/types/electron.d';
import { generateId, CURRENT_SCHEMA_VERSION } from '@/lib/types';
import { saveRoundTable } from '@/lib/storage';
import { listProviders } from '@/lib/settings-store';
import { useToast } from '@/components/Toast';
import Layout from '@/components/Layout';
import { Plus, Play, Settings, AlertCircle, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const TEAM_COLORS = ['#8B5CF6','#EC4899','#10B981','#F59E0B','#3B82F6','#EF4444','#06B6D4','#84CC16'];

function createDefaultSecret(overrides?: Partial<CharacterSecret>): CharacterSecret {
  return {
    secretRole: 'normal',
    publicGoal: '参与公开讨论，判断其他角色的真实意图。',
    privateGoal: '',
    knownSecrets: [],
    isAlive: true,
    revealed: false,
    ...overrides,
  };
}

function createDefaultMemory(overrides?: Partial<CharacterMemory>): CharacterMemory {
  return {
    privateMemory: [],
    publicMemory: [],
    suspicionMap: {},
    strategyPlan: '',
    ...overrides,
    suspicionMap: overrides?.suspicionMap || {},
  };
}

function withDefaults(c: Character): Character {
  return {
    ...c,
    secret: createDefaultSecret(c.secret),
    memory: createDefaultMemory(c.memory),
  };
}

function parseLines(value: string): string[] {
  return value.split('\n').map((s) => s.trim()).filter(Boolean);
}

function toLines(value?: string[]): string {
  return (value || []).join('\n');
}

export default function Create() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Scenario
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [scenarioDesc, setScenarioDesc] = useState('');
  const [atmosphere, setAtmosphere] = useState('formal');

  // Host
  const [hostName, setHostName] = useState('主持人');
  const [hostStyle, setHostStyle] = useState('中立、控场、善于追问');
  const [hostMode, setHostMode] = useState<'visible' | 'invisible' | 'user'>('visible');
  const [hostProviderId, setHostProviderId] = useState('');

  // Teams
  const [teams, setTeams] = useState<Team[]>([]);

  // Characters
  const [characters, setCharacters] = useState<Character[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState<Record<number, boolean>>({});

  // Rules
  const [unlimitedRounds, setUnlimitedRounds] = useState(false);
  const [roundCount, setRoundCount] = useState(3);
  const [speakOrder, setSpeakOrder] = useState<'sequential' | 'free' | 'host-assigned'>('sequential');
  const [maxSpeechLength, setMaxSpeechLength] = useState(300);
  const [scoringEnabled, setScoringEnabled] = useState(false);
  const [forbiddenTopics, setForbiddenTopics] = useState('');

  // Goal
  const [goalType, setGoalType] = useState<'consensus' | 'decision' | 'analysis' | 'ranking' | 'debate' | 'creative' | 'custom'>('consensus');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalCriteria, setGoalCriteria] = useState('');

  useEffect(() => {
    listProviders().then((p) => {
      setProviders(p);
      setProvidersLoaded(true);
      const dp = p.length > 0 ? p[0].id : '';
      setHostProviderId(dp);
      setCharacters([
        withDefaults({ id: generateId(), name: '技术派', role: '技术专家', persona: '关注架构、性能与工程实现，务实但有时过于悲观', stance: '', style: '', providerId: dp }),
        withDefaults({ id: generateId(), name: '用户代表', role: '产品经理', persona: '关注需求、体验与商业价值，讨厌空话', stance: '', style: '', providerId: dp }),
        withDefaults({ id: generateId(), name: '市场派', role: '市场分析师', persona: '关注竞品、趋势与增长路径，数据导向', stance: '', style: '', providerId: dp }),
      ]);
    });
  }, []);

  function addCharacter() {
    setCharacters([...characters, withDefaults({ id: generateId(), name: '', role: '', persona: '', stance: '', style: '', providerId: hostProviderId })]);
  }
  function removeCharacter(idx: number) {
    if (characters.length <= 2) { setError('至少需要 2 个角色'); return; }
    setCharacters(characters.filter((_, i) => i !== idx));
    setError('');
  }
  function updateCharacter<K extends keyof Character>(idx: number, field: K, value: Character[K]) {
    const next = [...characters];
    next[idx] = { ...next[idx], [field]: value };
    setCharacters(next);
  }
  function updateSecret<K extends keyof CharacterSecret>(idx: number, field: K, value: CharacterSecret[K]) {
    const next = [...characters];
    const secret = createDefaultSecret(next[idx].secret);
    next[idx] = { ...next[idx], secret: { ...secret, [field]: value } };
    setCharacters(next);
  }
  function updateMemory<K extends keyof CharacterMemory>(idx: number, field: K, value: CharacterMemory[K]) {
    const next = [...characters];
    const memory = createDefaultMemory(next[idx].memory);
    next[idx] = { ...next[idx], memory: { ...memory, [field]: value } };
    setCharacters(next);
  }

  function addTeam() {
    setTeams([...teams, { id: generateId(), name: `阵营${teams.length + 1}`, color: TEAM_COLORS[teams.length % TEAM_COLORS.length] }]);
  }
  function removeTeam(idx: number) { setTeams(teams.filter((_, i) => i !== idx)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (providers.length === 0) { setError('请先在设置页配置至少一个 LLM 厂商'); return; }
    if (!scenarioTitle.trim()) { setError('请输入讨论主题'); return; }
    const validChars = characters.filter(c => c.name.trim());
    if (validChars.length < 2) { setError('至少需要 2 个有名称的角色'); return; }

    setSaving(true);
    try {
      const actualRounds = unlimitedRounds ? 0 : roundCount;
      const rt: RoundTable = {
        id: generateId(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        topic: scenarioTitle.trim(),
        totalRounds: actualRounds,
        scenario: { title: scenarioTitle.trim(), description: scenarioDesc.trim(), atmosphere },
        host: { name: hostName.trim(), style: hostStyle.trim(), mode: hostMode, providerId: hostProviderId || undefined, secretAccess: 'judge' },
        characters: validChars.map(c => {
          const normalized = withDefaults(c);
          return {
            ...normalized,
            persona: normalized.persona || [normalized.role, normalized.stance, normalized.style].filter(Boolean).join('；'),
            teamId: normalized.teamId || undefined,
          };
        }),
        teams: teams.length > 0 ? teams : undefined,
        rules: {
          roundCount: actualRounds, speakOrder, maxSpeechLength,
          requireResponse: false, allowConsecutiveSpeech: false, scoringEnabled,
          forbiddenTopics: forbiddenTopics.trim() ? forbiddenTopics.split('\n').filter(Boolean) : undefined,
        },
        goal: { type: goalType, description: goalDesc.trim() || scenarioTitle.trim(), successCriteria: goalCriteria.trim() || undefined },
        status: 'created', createdAt: Date.now(),
      };
      await saveRoundTable(rt);
      navigate(`/discussion/${rt.id}`);
    } catch (err: any) {
      showToast({ type: 'error', message: err.message || '保存失败' });
    } finally { setSaving(false); }
  }

  if (providersLoaded && providers.length === 0) {
    return (
      <Layout title="创建圆桌" showBack backTo="/">
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">需要先配置 LLM 厂商</h2>
          <p className="text-sm text-gray-500 mb-6">在开始创建圆桌之前，请先前往设置页添加至少一个 LLM 厂商。</p>
          <button onClick={() => navigate('/settings')} className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200">
            <Settings className="w-5 h-5" />前往设置
          </button>
        </div>
      </Layout>
    );
  }

  const SectionNum = ({ n }: { n: number }) => (
    <span className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{n}</span>
  );

  return (
    <Layout title="创建圆桌" showBack backTo="/">
      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        <p className="text-sm text-gray-500 mb-6">设置讨论主题、主持人和参与角色</p>
        <form onSubmit={handleSubmit} className="space-y-6 pb-24">

          {/* ===== 1. 场景 ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><SectionNum n={1} />讨论场景</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">主题</label>
              <input type="text" value={scenarioTitle} onChange={e => setScenarioTitle(e.target.value)} placeholder="例如：AI 欺诈师圆桌博弈" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">场景描述</label>
              <textarea value={scenarioDesc} onChange={e => setScenarioDesc(e.target.value)} placeholder="描述讨论的背景、上下文和期望方向..." rows={3} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none" />
              <button type="button"
                onClick={async () => {
                  try {
                    const result = await window.electronAPI?.openMarkdownFile?.();
                    if (!result) return;
                    if (!result.ok) { showToast({ type: 'error', message: result.error }); return; }
                    setScenarioDesc(result.content);
                    showToast({ type: 'success', message: `已导入 ${result.filename}` });
                  } catch (err: any) { showToast({ type: 'error', message: err?.message || '导入失败' }); }
                }}
                className="text-xs text-purple-600 hover:text-purple-800 underline mt-1">从 Markdown 导入</button>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">氛围</label>
              <select value={atmosphere} onChange={e => setAtmosphere(e.target.value)} className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white">
                <option value="formal">正式</option>
                <option value="confrontational">对抗性</option>
                <option value="relaxed">轻松</option>
                <option value="tense">紧张</option>
              </select>
            </div>
          </section>

          {/* ===== 2. 主持人 ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><SectionNum n={2} />主持人</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">名称</label>
                <input type="text" value={hostName} onChange={e => setHostName(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">主持风格</label>
                <input type="text" value={hostStyle} onChange={e => setHostStyle(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">模式</label>
                <select value={hostMode} onChange={e => setHostMode(e.target.value as any)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white">
                  <option value="visible">可见（参与发言）</option>
                  <option value="invisible">不可见（仅控场）</option>
                  <option value="user">用户（你作为主持人）</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">AI 主持人默认使用上帝/裁判视角读取全部秘密，但公开发言不得直接泄露。</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">模型厂商</label>
                <select value={hostProviderId} onChange={e => setHostProviderId(e.target.value)} className="w-full min-w-[160px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white">
                  {providers.map(p => <option key={p.id} value={p.id}>{p.model ? `${p.name} — ${p.model}` : p.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ===== 3. 阵营（可选） ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><SectionNum n={3} />阵营<span className="text-xs font-normal text-gray-400 ml-1">（可选）</span></h2>
              <button type="button" onClick={addTeam} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"><Plus className="w-3.5 h-3.5" />添加</button>
            </div>
            {teams.length === 0 && <p className="text-xs text-gray-400">暂无阵营，角色将使用默认颜色</p>}
            {teams.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3">
                <input type="text" value={t.name} onChange={e => { const n = [...teams]; n[i].name = e.target.value; setTeams(n); }} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" placeholder="阵营名称" />
                <div className="flex gap-1.5">
                  {TEAM_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => { const n = [...teams]; n[i].color = c; setTeams(n); }} className={`w-5 h-5 rounded-md border-2 ${t.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`} style={{ background: c }} />
                  ))}
                </div>
                <button type="button" onClick={() => removeTeam(i)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </section>

          {/* ===== 4. 角色列表 ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><SectionNum n={4} />角色列表</h2>
              <button type="button" onClick={addCharacter} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"><Plus className="w-4 h-4" />添加角色</button>
            </div>
            <p className="text-xs text-gray-400">至少 2 个角色。每个角色可选择不同的 AI 模型；高级选项里可配置隐藏身份、私密目标和初始策略。</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="py-2 px-2 font-medium">名称</th>
                    <th className="py-2 px-2 font-medium">身份</th>
                    <th className="py-2 px-2 font-medium">人设</th>
                    <th className="py-2 px-2 font-medium">模型</th>
                    <th className="py-2 px-2 font-medium">阵营</th>
                    <th className="py-2 px-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {characters.map((c, i) => {
                    const secret = createDefaultSecret(c.secret);
                    const memory = createDefaultMemory(c.memory);
                    return (
                    <Fragment key={c.id}>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 px-2"><input type="text" value={c.name} onChange={e => updateCharacter(i, 'name', e.target.value)} placeholder="名称" className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></td>
                        <td className="py-2 px-2"><input type="text" value={c.role} onChange={e => updateCharacter(i, 'role', e.target.value)} placeholder="身份" className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></td>
                        <td className="py-2 px-2 min-w-[200px]"><textarea value={c.persona} onChange={e => updateCharacter(i, 'persona', e.target.value)} placeholder="角色人设：性格、背景、立场、说话方式..." rows={2} className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none" /></td>
                        <td className="py-2 px-2">
                          <select value={c.providerId} onChange={e => updateCharacter(i, 'providerId', e.target.value)} className="w-full min-w-[160px] px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white">
                            {providers.map(p => <option key={p.id} value={p.id}>{p.model ? `${p.name} — ${p.model}` : p.name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <select value={c.teamId || ''} onChange={e => updateCharacter(i, 'teamId', e.target.value)} className="w-full min-w-[80px] px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white">
                            <option value="">无</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setAdvancedOpen(prev => ({ ...prev, [i]: !prev[i] }))} className="text-gray-400 hover:text-gray-600" title="高级选项">
                              {advancedOpen[i] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <button type="button" onClick={() => removeCharacter(i)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                      {advancedOpen[i] && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="py-4 px-4">
                            <div className="space-y-4 text-xs">
                              <div>
                                <p className="font-medium text-gray-700 mb-2">公开人设补充</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  <div><label className="text-gray-500">立场</label><input type="text" value={c.stance || ''} onChange={e => updateCharacter(i, 'stance', e.target.value)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></div>
                                  <div><label className="text-gray-500">说话风格</label><input type="text" value={c.style || ''} onChange={e => updateCharacter(i, 'style', e.target.value)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></div>
                                  <div><label className="text-gray-500">动机</label><input type="text" value={c.motivation || ''} onChange={e => updateCharacter(i, 'motivation', e.target.value)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></div>
                                  <div><label className="text-gray-500">专业领域</label><input type="text" value={c.expertise || ''} onChange={e => updateCharacter(i, 'expertise', e.target.value)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></div>
                                  <div><label className="text-gray-500">人物关系</label><input type="text" value={c.relationship || ''} onChange={e => updateCharacter(i, 'relationship', e.target.value)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></div>
                                  <div><label className="text-gray-500">限制条件</label><input type="text" value={c.constraints || ''} onChange={e => updateCharacter(i, 'constraints', e.target.value)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" /></div>
                                </div>
                              </div>

                              <div>
                                <p className="font-medium text-gray-700 mb-2">隐藏身份 / 私密信息</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-gray-500">秘密身份</label>
                                    <select value={secret.secretRole} onChange={e => updateSecret(i, 'secretRole', e.target.value as SecretRole)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white">
                                      <option value="normal">normal 普通角色</option>
                                      <option value="fraudster">fraudster 欺诈者</option>
                                      <option value="detective">detective 侦探</option>
                                      <option value="observer">observer 观察者</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-gray-500">公开目标</label>
                                    <input type="text" value={secret.publicGoal} onChange={e => updateSecret(i, 'publicGoal', e.target.value)} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400" />
                                  </div>
                                  <div>
                                    <label className="text-gray-500">私密目标</label>
                                    <textarea value={secret.privateGoal} onChange={e => updateSecret(i, 'privateGoal', e.target.value)} rows={2} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none" />
                                  </div>
                                  <div>
                                    <label className="text-gray-500">已知秘密 <span className="text-gray-400">每行一个</span></label>
                                    <textarea value={toLines(secret.knownSecrets)} onChange={e => updateSecret(i, 'knownSecrets', parseLines(e.target.value))} rows={2} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none" />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-4 mt-2">
                                  <label className="flex items-center gap-2 text-gray-600"><input type="checkbox" checked={secret.isAlive} onChange={e => updateSecret(i, 'isAlive', e.target.checked)} />在场</label>
                                  <label className="flex items-center gap-2 text-gray-600"><input type="checkbox" checked={secret.revealed} onChange={e => updateSecret(i, 'revealed', e.target.checked)} />身份已公开</label>
                                </div>
                              </div>

                              <div>
                                <p className="font-medium text-gray-700 mb-2">初始记忆 / 策略</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-gray-500">私有记忆 <span className="text-gray-400">每行一个</span></label>
                                    <textarea value={toLines(memory.privateMemory)} onChange={e => updateMemory(i, 'privateMemory', parseLines(e.target.value))} rows={2} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none" />
                                  </div>
                                  <div>
                                    <label className="text-gray-500">公开记忆 <span className="text-gray-400">每行一个</span></label>
                                    <textarea value={toLines(memory.publicMemory)} onChange={e => updateMemory(i, 'publicMemory', parseLines(e.target.value))} rows={2} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none" />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="text-gray-500">初始策略计划</label>
                                    <textarea value={memory.strategyPlan} onChange={e => updateMemory(i, 'strategyPlan', e.target.value)} rows={2} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );})}
                </tbody>
              </table>
            </div>
          </section>

          {/* ===== 5. 规则 ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><SectionNum n={5} />讨论规则</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={unlimitedRounds} onChange={e => setUnlimitedRounds(e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-700">不预设轮数</span>
                </label>
                {!unlimitedRounds && (
                  <div className="flex items-center gap-2">
                    <input type="number" value={roundCount} onChange={e => setRoundCount(Math.max(2, Math.min(50, parseInt(e.target.value) || 3)))} min={2} max={50} className="w-16 px-2 py-1.5 text-sm text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    <span className="text-sm text-gray-500">轮</span>
                  </div>
                )}
                {unlimitedRounds && <p className="text-xs text-gray-400 mt-1">不限轮数，最多 999 轮安全上限，可随时停止</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">发言顺序</label>
                <select value={speakOrder} onChange={e => setSpeakOrder(e.target.value as any)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white">
                  <option value="sequential">顺序发言</option>
                  <option value="free">自由辩论</option>
                  <option value="host-assigned">主持人指派</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">字数上限</label>
                <input type="number" value={maxSpeechLength} onChange={e => setMaxSpeechLength(Math.max(50, Math.min(1000, parseInt(e.target.value) || 300)))} min={50} max={1000} className="w-20 px-2 py-1.5 text-sm text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={scoringEnabled} onChange={e => setScoringEnabled(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">启用评分</span>
              </label>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">禁止话题</label>
              <textarea value={forbiddenTopics} onChange={e => setForbiddenTopics(e.target.value)} placeholder="每行一个话题，讨论中将避开这些内容" rows={2} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" />
            </div>
          </section>

          {/* ===== 6. 目标 ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><SectionNum n={6} />讨论目标</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">目标类型</label>
              <select value={goalType} onChange={e => setGoalType(e.target.value as any)} className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white">
                <option value="consensus">达成共识</option>
                <option value="decision">做出决策</option>
                <option value="analysis">深度分析</option>
                <option value="ranking">方案排序</option>
                <option value="debate">观点辩论</option>
                <option value="creative">创意头脑风暴</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">目标描述</label>
              <textarea value={goalDesc} onChange={e => setGoalDesc(e.target.value)} placeholder="描述本次讨论希望达成的具体目标..." rows={2} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">成功标准 <span className="text-gray-400">（可选）</span></label>
              <input type="text" value={goalCriteria} onChange={e => setGoalCriteria(e.target.value)} placeholder="如何衡量讨论是否成功？" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          </section>

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

          {/* Submit bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex justify-between items-center z-40">
            <span className="text-xs text-gray-400">共 {characters.filter(c => c.name.trim()).length} 个角色 · {unlimitedRounds ? '不限轮数' : `${roundCount} 轮`}</span>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 disabled:opacity-50">
              <Play className="w-5 h-5" />{saving ? '保存中...' : '开始讨论'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
