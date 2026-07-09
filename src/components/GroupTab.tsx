// ===== AI 圆桌模拟器 — Group Chat Tab =====

import { useState, useRef, useEffect } from 'react';
import type { WhisperGroup, WhisperMessage } from '@/lib/types';

interface GroupTabProps {
  groups: WhisperGroup[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
  getGroupConversation: (groupId: string) => WhisperMessage[];
  sendGroupMessage: (groupId: string, content: string) => Promise<void>;
  isPaused: boolean;
  onCreateGroup?: () => void;
}

const GROUP_COLORS = [
  'from-p500 to-p700',
  'from-success to-teal-600',
  'from-error to-pink-600',
  'from-warning to-orange-600',
  'from-info to-blue-600',
  'from-fuchsia-500 to-p700',
];

function getGroupGradient(idx: number) {
  return GROUP_COLORS[idx % GROUP_COLORS.length];
}

export default function GroupTab({
  groups,
  selectedGroupId,
  onSelectGroup,
  getGroupConversation,
  sendGroupMessage,
  isPaused,
  onCreateGroup,
}: GroupTabProps) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const conversation = selectedGroupId ? getGroupConversation(selectedGroupId) : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.length]);

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || !selectedGroupId || sending) return;

    setSending(true);
    setInputText('');
    try {
      await sendGroupMessage(selectedGroupId, content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputDisabled = !isPaused;
  const inputPlaceholder = inputDisabled ? '讨论进行中无法发送群消息' : '输入群消息...';

  return (
    <div className="flex h-full">
      {/* Group list */}
      <div className="w-28 shrink-0 border-r border-g200 overflow-y-auto bg-g50/80">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-2 text-center">
            <div className="w-8 h-8 rounded-full bg-p100 flex items-center justify-center mb-2">
              <svg className="w-4 h-4 text-p400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-8.303a4 4 0 00-5.292 0M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
              </svg>
            </div>
            <p className="text-[10px] text-g400 leading-tight">暂无群组</p>
            {onCreateGroup && (
              <button
                onClick={onCreateGroup}
                className="mt-2 text-[10px] text-p600 hover:text-p700 font-medium"
              >
                创建群组
              </button>
            )}
          </div>
        ) : (
          <>
            {onCreateGroup && (
              <button
                onClick={onCreateGroup}
                className="w-full flex items-center gap-1.5 px-3 py-2.5 border-b border-g100 text-xs text-p600 hover:bg-p50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                创建群组
              </button>
            )}
            {groups.map((group, idx) => {
              const isSelected = group.id === selectedGroupId;
              const unreadCount = conversation.filter(
                (m) => m.senderId !== 'host' && m.status === 'unread'
              ).length;

              return (
                <button
                  key={group.id}
                  onClick={() => onSelectGroup(isSelected ? null : group.id)}
                  className={`w-full text-left px-2 py-2.5 border-b border-g100 transition-colors ${
                    isSelected
                      ? 'bg-p50 border-l-2 border-l-p500'
                      : 'hover:bg-g100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${getGroupGradient(idx)} shrink-0`} />
                    <span className="text-xs text-g700 truncate flex-1">{group.name}</span>
                    {unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-error rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-g400 mt-0.5 truncate pl-[14px]">
                    {group.memberIds.length} 人 · {group.speakOrder === 'sequential' ? '顺序' : group.speakOrder === 'free' ? '自由' : '主持人指定'}
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Conversation area */}
      <div className="flex-1 flex flex-col">
        {selectedGroup ? (
          <>
            {/* Group header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-g200 bg-white/80 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-br ${getGroupGradient(groups.findIndex(g => g.id === selectedGroupId))} shrink-0`} />
              <span className="text-xs font-medium text-g700">{selectedGroup.name}</span>
              <span className="text-[10px] text-g400 ml-auto">
                {selectedGroup.memberIds.length} 名成员
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {conversation.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-2xl mb-2">💬</div>
                    <p className="text-xs text-g400">群聊中暂无消息</p>
                    <p className="text-[10px] text-g300 mt-1">发送第一条消息开始群聊</p>
                  </div>
                </div>
              )}
              {conversation.map((msg) => {
                const isHost = msg.senderId === 'host';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isHost ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-r-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        isHost
                          ? 'bg-gradient-to-br from-p500 to-p700 text-white rounded-br-md'
                          : 'bg-white border border-g200 text-g700 rounded-bl-md shadow-sm'
                      }`}
                    >
                      {!isHost && (
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[10px] font-medium text-p600">
                            {msg.senderId}
                          </span>
                        </div>
                      )}
                      {msg.content}
                      <div className={`text-[9px] mt-1 ${isHost ? 'text-p200 text-right' : 'text-g400'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-g200 p-3 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={inputPlaceholder}
                  disabled={inputDisabled}
                  rows={2}
                  className="flex-1 resize-none rounded-r-lg border border-g300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-p400 disabled:bg-g100 disabled:text-g400 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSend}
                  disabled={inputDisabled || sending || !inputText.trim()}
                  className="px-4 py-2 bg-gradient-to-br from-p600 to-p700 text-white rounded-r-lg text-xs font-medium hover:from-p700 hover:to-p800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm"
                >
                  {sending ? '发送中...' : '发送'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-6">
              <div className="w-12 h-12 rounded-r-xl bg-gradient-to-br from-p100 to-p50 border border-p200 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-p400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-g500 mb-1">选择群组开始聊天</p>
              <p className="text-[11px] text-g400">或点击左侧「创建群组」建立新群</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
