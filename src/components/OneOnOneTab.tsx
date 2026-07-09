// ===== AI 圆桌模拟器 — One-on-One Whisper Tab =====

import { useState, useRef, useEffect } from 'react';
import type { Character, WhisperMessage } from '@/lib/types';

const CHAR_AVATAR_COLORS = [
  'bg-info', 'bg-success', 'bg-warning', 'bg-error',
  'bg-indigo-400', 'bg-teal-400', 'bg-orange-400', 'bg-pink-400',
];

interface OneOnOneTabProps {
  characters: Character[];
  selectedContactId: string | null;
  onSelectContact: (id: string | null) => void;
  getConversation: (contactId: string) => WhisperMessage[];
  getUnreadCount: (contactId: string) => number;
  sendWhisper: (recipientId: string, content: string) => Promise<void>;
  isPaused: boolean;
}

export default function OneOnOneTab({
  characters,
  selectedContactId,
  onSelectContact,
  getConversation,
  getUnreadCount,
  sendWhisper,
  isPaused,
}: OneOnOneTabProps) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedContact = characters.find((c) => c.id === selectedContactId);
  const conversation = selectedContactId ? getConversation(selectedContactId) : [];

  // Scroll to bottom when conversation changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.length]);

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || !selectedContactId || sending) return;

    setSending(true);
    setInputText('');
    try {
      await sendWhisper(selectedContactId, content);
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
  const inputPlaceholder = inputDisabled ? '讨论进行中无法发送私信' : '输入私信内容...';

  return (
    <div className="flex h-full">
      {/* Contacts list */}
      <div className="w-28 shrink-0 border-r border-g200 overflow-y-auto bg-g50">
        {characters.map((char, idx) => {
          const unread = getUnreadCount(char.id);
          const isSelected = char.id === selectedContactId;
          return (
            <button
              key={char.id}
              onClick={() => onSelectContact(isSelected ? null : char.id)}
              className={`w-full text-left px-2 py-2.5 border-b border-g100 transition-colors ${
                isSelected ? 'bg-p50 border-l-2 border-l-p500' : 'hover:bg-g100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${CHAR_AVATAR_COLORS[idx % CHAR_AVATAR_COLORS.length]}`} />
                <span className="text-xs text-g700 truncate">{char.name}</span>
                {unread > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-error rounded-full">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Conversation area */}
      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {conversation.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-g400">暂无私信记录</p>
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
                      className={`max-w-[80%] rounded-r-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap border-2 border-dashed ${
                        isHost
                          ? 'bg-p50 border-p300 text-p800 rounded-br-md'
                          : 'bg-white border-g300 text-g700 rounded-bl-md shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] opacity-60">
                          {isHost ? '主持人' : (characters.find(c => c.id === msg.senderId)?.name || '角色')}
                        </span>
                        <span className="text-[10px] opacity-40">🔒</span>
                      </div>
                      {msg.content}
                      <div className="text-[9px] opacity-40 mt-1 text-right">
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
              <div className="w-10 h-10 rounded-r-xl bg-p50 border border-p200 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-p400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-g500 mb-1">选择联系人开始私信</p>
              <p className="text-[11px] text-g400">讨论暂停时可与角色秘密交流</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
