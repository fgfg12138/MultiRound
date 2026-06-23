// ===== AI 圆桌模拟器 — Message Bubble Component =====

import type { Message } from '@/lib/types';

const CHARACTER_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-indigo-100 border-indigo-300 text-indigo-800',
  'bg-teal-100 border-teal-300 text-teal-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-pink-100 border-pink-300 text-pink-800',
];

const TYPE_LABELS: Record<string, string> = {
  opening: '开场',
  speech: '发言',
  summary: '小结',
  followup: '追问',
  final_summary: '总结',
};

interface MessageBubbleProps {
  message: Message;
  colorIndex?: number;
}

export default function MessageBubble({
  message,
  colorIndex = 0,
}: MessageBubbleProps) {
  const isHost = message.characterId === 'host';
  const colorClass = isHost
    ? 'bg-purple-100 border-purple-300 text-purple-800'
    : CHARACTER_COLORS[colorIndex % CHARACTER_COLORS.length];

  return (
    <div
      className={`flex flex-col ${
        isHost ? 'items-center' : 'items-start'
      } w-full mb-4`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
        >
          {message.characterName}
        </span>
        <span className="text-xs text-gray-400">
          第{message.round}轮 · {TYPE_LABELS[message.type] || message.type}
        </span>
      </div>

      <div
        className={`rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap ${
          isHost
            ? 'bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200'
            : 'bg-white border border-gray-200 shadow-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
