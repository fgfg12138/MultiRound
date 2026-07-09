// ===== AI 圆桌模拟器 — Whisper Panel =====

import { useState, useEffect } from 'react';
import type { WhisperGroup, Character } from '@/lib/types';
import { useWhisper } from '@/hooks/useWhisper';
import OneOnOneTab from './OneOnOneTab';
import GroupTab from './GroupTab';
import CreateGroupDialog from './CreateGroupDialog';

interface WhisperPanelProps {
  roundTableId: string;
  characters: Character[];
  groups: WhisperGroup[];
  isPaused: boolean;
  onWhisperSend?: (recipientId: string, content: string) => void;
}

type TabKey = '1on1' | 'group';

export default function WhisperPanel({
  roundTableId,
  characters,
  groups: externalGroups,
  isPaused,
}: WhisperPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('1on1');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const whisper = useWhisper(roundTableId, characters);

  useEffect(() => {
    whisper.loadWhispers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundTableId]);

  // Calculate unread counts
  const totalUnread = characters.reduce((sum, c) => sum + whisper.getUnreadCount(c.id), 0);

  const tabClass = (tab: TabKey) =>
    `px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
      activeTab === tab
        ? 'bg-p100 text-p700'
        : 'text-g500 hover:text-g700 hover:bg-g100'
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-g200">
        <button
          className={tabClass('1on1')}
          onClick={() => setActiveTab('1on1')}
        >
          1:1 私信
          {totalUnread > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-error rounded-full">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
        <button
          className={tabClass('group')}
          onClick={() => setActiveTab('group')}
        >
          群组聊天
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === '1on1' && (
          <OneOnOneTab
            characters={characters}
            selectedContactId={whisper.selectedContactId}
            onSelectContact={whisper.setSelectedContactId}
            getConversation={whisper.getConversation}
            getUnreadCount={whisper.getUnreadCount}
            sendWhisper={whisper.sendWhisper}
            isPaused={isPaused}
          />
        )}
        {activeTab === 'group' && (
          <GroupTab
            groups={whisper.groups.length > 0 ? whisper.groups : externalGroups}
            selectedGroupId={whisper.selectedGroupId}
            onSelectGroup={whisper.setSelectedGroupId}
            getGroupConversation={whisper.getGroupConversation}
            sendGroupMessage={whisper.sendGroupMessage}
            isPaused={isPaused}
            onCreateGroup={() => setCreateGroupOpen(true)}
          />
        )}

      {/* Create Group Dialog */}
      <CreateGroupDialog
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        roundTableId={roundTableId}
        onCreated={() => whisper.loadWhispers()}
        characters={characters}
        createGroup={whisper.createGroup}
      />
      </div>
    </div>
  );
}
