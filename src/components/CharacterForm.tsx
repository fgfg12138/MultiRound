// ===== AI 圆桌模拟器 — Character Form Component =====

import type { Character } from '@/lib/types';
import type { ProviderConfig } from '@/types/electron.d';

interface CharacterFormProps {
  index: number;
  character: Character;
  providers: ProviderConfig[];
  onChange: (char: Character) => void;
  onRemove: () => void;
}

export default function CharacterForm({
  index,
  character,
  providers,
  onChange,
  onRemove,
}: CharacterFormProps) {
  return (
    <div className="p-4 border border-gray-200 rounded-xl bg-white space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">角色 {index + 1}</h4>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          删除
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">角色名称</label>
          <input
            type="text"
            value={character.name}
            onChange={(e) =>
              onChange({ ...character, name: e.target.value })
            }
            placeholder="如：技术派"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">角色身份</label>
          <input
            type="text"
            value={character.role}
            onChange={(e) =>
              onChange({ ...character, role: e.target.value })
            }
            placeholder="如：技术负责人"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">立场观点</label>
          <input
            type="text"
            value={character.stance}
            onChange={(e) =>
              onChange({ ...character, stance: e.target.value })
            }
            placeholder="如：关注实现难度、成本和技术风险"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">说话风格</label>
          <input
            type="text"
            value={character.style}
            onChange={(e) =>
              onChange({ ...character, style: e.target.value })
            }
            placeholder="如：冷静、直接、偏现实"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
        </div>

        {/* Provider selection */}
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">AI 模型</label>
          {providers.length === 0 ? (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              请先在设置页添加 LLM 厂商
            </div>
          ) : (
            <select
              value={character.providerId}
              onChange={(e) =>
                onChange({ ...character, providerId: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.model})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
