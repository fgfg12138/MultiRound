// ===== AI 圆桌模拟器 — Message Bubble Component =====
// 设计稿风格：头像 + 气泡 + 名称标签 + 时间/轮次

import type { Message } from '@/lib/types';

/** 清理 LLM 输出中的残留 JSON 片段和 markdown fence */
function cleanContent(raw: string): string {
  let s = raw || '';
  // 移除开头的 {"public":{"speech":" 或 {"speech":"
  s = s.replace(/^\{?"public"?:\s*\{?"speech"?:\s*"/, '');
  // 移除结尾的 JSON 残片（",  }}} 等）
  s = s.replace(/",?\s*\}?\}?\}?\s*$/, '');
  // 移除 markdown 代码块标记
  s = s.replace(/^```(?:json)?\s*/gi, '').replace(/\s*```\s*$/gi, '');
  var m = s.match(/"speech"\s*:\s*"([^"]*?)"\s*[,}]/);
  if (m) s = m[1];
  return s.trim();
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#818cf8,#6366f1)',
  'linear-gradient(135deg,#34d399,#10b981)',
  'linear-gradient(135deg,#fbbf24,#f59e0b)',
  'linear-gradient(135deg,#f87171,#ef4444)',
  'linear-gradient(135deg,#a78bfa,#8b5cf6)',
  'linear-gradient(135deg,#22d3ee,#06b6d4)',
  'linear-gradient(135deg,#fb923c,#f97316)',
  'linear-gradient(135deg,#e879f9,#d946ef)',
];

const HOST_GRADIENT = 'linear-gradient(135deg,#a78bfa,#7c3aed)';

interface MessageBubbleProps {
  message: Message;
  colorIndex?: number;
  /** 是否正在流式输出中，显示打字光标 */
  streaming?: boolean;
  /** 是否为私密消息（Whisper），显示虚线边框 + 锁图标 */
  isWhisper?: boolean;
}

export default function MessageBubble({
  message,
  colorIndex = 0,
  streaming = false,
  isWhisper = false,
}: MessageBubbleProps) {
  const isHost = message.characterId === 'host';

  return (
    <div className={`flex gap-3 max-w-[85%] ${isHost ? 'self-end flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
        style={{ background: isHost ? HOST_GRADIENT : AVATAR_GRADIENTS[colorIndex % AVATAR_GRADIENTS.length] }}
      >
        {message.characterName.charAt(0)}
      </div>

      {/* Content area */}
      <div className="flex flex-col gap-0.5 min-w-0">
        {/* Name label */}
        <div className={`text-xs font-semibold ${isHost ? 'text-p700 text-right' : 'text-g600'} ml-1`}>
          {message.characterName}
        </div>

        {/* Bubble */}
        <div
          className={`px-3 py-2.5 rounded-r-lg text-sm leading-relaxed whitespace-pre-wrap ${
            isWhisper
              ? 'border-2 border-dashed border-p400 bg-p50'
              : isHost
                ? 'bg-gradient-to-r from-p50 to-blue-50 border border-p200 rounded-tr-sm'
                : 'bg-white border border-g200 shadow-sm rounded-tl-sm'
          }`}
        >
          {isWhisper && (
            <div className="flex items-center gap-1 mb-1.5 text-[10px]">
              <span className="text-p400">🔒</span>
              <span className="font-medium text-p500">私密消息</span>
            </div>
          )}
          <div>
            {cleanContent(message.content)}
            {streaming && (
              <span className="inline-block w-[2px] h-[1em] bg-p500 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
          <div className="text-[11px] text-g400 mt-1 text-right">
            第{message.round}轮
          </div>
          {isWhisper && (
            <div className="text-[10px] text-p400 italic mt-1.5 pt-1.5 border-t border-p200/50">
              仅你和 {message.characterName} 可见
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
