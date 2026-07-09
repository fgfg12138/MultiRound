// ===== AI 圆桌模拟器 — Create Group Dialog =====

import { useState } from 'react';
import type { Character } from '@/lib/types';

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  roundTableId: string;
  onCreated: () => void;
  characters?: Character[];
  createGroup?: (name: string, memberIds: string[], speakOrder: string) => Promise<void>;
}

export default function CreateGroupDialog({
  open,
  onClose,
  roundTableId: _roundTableId,
  onCreated,
  characters = [],
  createGroup,
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [speakOrder, setSpeakOrder] = useState<'free' | 'sequential' | 'host-assigned'>('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleToggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    const name = groupName.trim();
    if (!name) {
      setError('请输入群组名称');
      return;
    }
    if (selectedMemberIds.length < 2) {
      setError('请至少选择 2 名成员');
      return;
    }
    if (!createGroup) {
      setError('创建群组功能暂不可用');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await createGroup(name, selectedMemberIds, speakOrder);
      setGroupName('');
      setSelectedMemberIds([]);
      setSpeakOrder('free');
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-r-xl shadow-2xl border border-g200 overflow-hidden animate-[scale-in_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-g100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-r-lg bg-gradient-to-br from-p500 to-p700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-g800">创建群组</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-r-lg flex items-center justify-center text-g400 hover:text-g600 hover:bg-g100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Group name */}
          <div>
            <label className="block text-xs font-medium text-g600 mb-1.5">
              群组名称
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => { setGroupName(e.target.value); setError(''); }}
              placeholder="例如：策略讨论组"
              maxLength={30}
              className="w-full px-3 py-2 text-sm border border-g300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-p400 focus:border-p400 transition-all placeholder:text-g300"
            />
          </div>

          {/* Member selection */}
          <div>
            <label className="block text-xs font-medium text-g600 mb-1.5">
              选择成员
              <span className="text-g400 font-normal ml-1">（至少 2 人）</span>
            </label>
            <div className="max-h-40 overflow-y-auto border border-g200 rounded-r-lg divide-y divide-g100">
              {characters.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-g400">暂无可选角色</p>
                </div>
              ) : (
                characters.map((char) => {
                  const isSelected = selectedMemberIds.includes(char.id);
                  return (
                    <label
                      key={char.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                        isSelected ? 'bg-p50' : 'hover:bg-g50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-p600 border-p600'
                          : 'border-g300'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-p400 shrink-0" />
                        <span className="text-sm text-g700 truncate">{char.name}</span>
                      </div>
                      <span className="text-[10px] text-g400 shrink-0">{char.role}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Speak order */}
          <div>
            <label className="block text-xs font-medium text-g600 mb-1.5">
              发言顺序
            </label>
            <div className="flex gap-2">
              {([
                { value: 'free', label: '自由发言', desc: '谁都可以说' },
                { value: 'sequential', label: '顺序发言', desc: '轮流发言' },
                { value: 'host-assigned', label: '主持人指定', desc: '主持人点名' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSpeakOrder(opt.value)}
                  className={`flex-1 px-3 py-2 rounded-r-lg text-xs border transition-all ${
                    speakOrder === opt.value
                      ? 'bg-p50 border-p300 text-p700 shadow-sm'
                      : 'bg-white border-g200 text-g500 hover:border-g300'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-error/10 border-error/30 rounded-r-lg">
              <p className="text-xs text-error">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-g100 bg-g50/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-g600 bg-white border border-g200 rounded-r-lg hover:bg-g50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-br from-p600 to-p700 rounded-r-lg hover:from-p700 hover:to-p800 transition-all disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                创建中...
              </span>
            ) : (
              '创建群组'
            )}
          </button>
        </div>
      </div>

      {/* Scale-in animation keyframes */}
      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
