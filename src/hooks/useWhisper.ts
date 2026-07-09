// ===== AI 圆桌模拟器 — Whisper System Hook =====

import { useState, useCallback, useEffect } from 'react';
import type { WhisperMessage, WhisperGroup, Character } from '@/lib/types';

export function useWhisper(roundTableId: string, characters: Character[]) {
  const [whispers, setWhispers] = useState<WhisperMessage[]>([]);
  const [groups, setGroups] = useState<WhisperGroup[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWhispers = useCallback(async () => {
    try {
      const data = await window.electronAPI.whisperLoad({ roundTableId });
      setWhispers(data.whispers || []);
      setGroups(data.groups || []);
    } catch (err) {
      console.error('loadWhispers error:', err);
    } finally {
      setLoading(false);
    }
  }, [roundTableId]);

  const sendWhisper = useCallback(async (recipientId: string, content: string): Promise<void> => {
    try {
      const result = await window.electronAPI.whisperSend({ roundTableId, recipientId, content });
      if (result.ok && result.message) {
        setWhispers((prev) => [...prev, result.message!]);
      }
    } catch (err) {
      console.error('sendWhisper error:', err);
    }
  }, [roundTableId]);

  const sendGroupMessage = useCallback(async (groupId: string, content: string): Promise<void> => {
    try {
      await window.electronAPI.whisperSendGroup({ roundTableId, groupId, content });
    } catch (err) {
      console.error('sendGroupMessage error:', err);
    }
  }, [roundTableId]);

  const createGroup = useCallback(async (name: string, memberIds: string[], speakOrder: string): Promise<void> => {
    try {
      const result = await window.electronAPI.whisperCreateGroup({ roundTableId, name, memberIds, speakOrder });
      if (result.ok && result.group) {
        setGroups((prev) => [...prev, result.group!]);
      }
    } catch (err) {
      console.error('createGroup error:', err);
    }
  }, [roundTableId]);

  const getConversation = useCallback((contactId: string): WhisperMessage[] => {
    return whispers.filter(
      (w) =>
        (w.senderId === 'host' && w.recipientId === contactId) ||
        (w.senderId === contactId)
    ).sort((a, b) => a.timestamp - b.timestamp);
  }, [whispers]);

  const getGroupConversation = useCallback((groupId: string): WhisperMessage[] => {
    return whispers.filter((w) => w.groupId === groupId).sort((a, b) => a.timestamp - b.timestamp);
  }, [whispers]);

  const getUnreadCount = useCallback((contactId: string): number => {
    return whispers.filter(
      (w) => w.recipientId === 'host' && w.senderId === contactId && w.status === 'unread'
    ).length;
  }, [whispers]);

  const getPendingReplies = useCallback((charId: string): WhisperMessage[] => {
    return whispers.filter(
      (w) => w.senderId === 'host' && w.recipientId === charId && w.status === 'unread'
    );
  }, [whispers]);

  // Register whisper:reply listener
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (window.electronAPI.onWhisperReply) {
      cleanup = window.electronAPI.onWhisperReply((data: { roundTableId: string; originalMessageId: string; reply: WhisperMessage }) => {
        if (data.roundTableId === roundTableId) {
          setWhispers((prev) => {
            // 按 reply.id 去重，防止 IPC 重复推送导致 UI 重复
            if (prev.some((w) => w.id === data.reply.id)) return prev;
            return [...prev, data.reply];
          });
        }
      });
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [roundTableId]);

  // Register whisper:group-reply listener
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (window.electronAPI.onWhisperGroupReply) {
      cleanup = window.electronAPI.onWhisperGroupReply((data: { roundTableId: string; groupId: string; reply: WhisperMessage }) => {
        if (data.roundTableId === roundTableId) {
          setWhispers((prev) => {
            // 按 reply.id 去重，防止 IPC 重复推送导致 UI 重复
            if (prev.some((w) => w.id === data.reply.id)) return prev;
            return [...prev, data.reply];
          });
        }
      });
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [roundTableId]);

  return {
    whispers,
    groups,
    selectedContactId,
    selectedGroupId,
    setSelectedContactId,
    setSelectedGroupId,
    loading,
    sendWhisper,
    sendGroupMessage,
    loadWhispers,
    createGroup,
    getConversation,
    getGroupConversation,
    getUnreadCount,
    getPendingReplies,
  };
}
