// ===== AI 圆桌模拟器 — Discussion State Hook =====
// 新版：通过 IPC 启动/停止讨论，通过事件订阅消息流
// 支持多圆桌并发，支持离开页面不中断

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, RoundTable } from '@/lib/types';
import { generateId } from '@/lib/types';
import { saveRoundTable, saveMessages } from '@/lib/storage';
import { buildCharacterSpeechPrompt, buildSystemPrompt } from '@/lib/prompts';

export type GenerateStatus = 'idle' | 'generating' | 'stopping' | 'error';

interface FailedCharacter {
  index: number;
  name: string;
  error: string;
  providerId: string;
}

export function useDiscussion() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [currentRound, setCurrentRound] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<string | null>(null);
  const [failedCharacters, setFailedCharacters] = useState<FailedCharacter[]>([]);
  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>('idle');

  const messagesRef = useRef<Message[]>([]);
  const roundTableRef = useRef<RoundTable | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);

  // Keep messagesRef in sync
  messagesRef.current = messages;

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
    };
  }, []);

  const onMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      messagesRef.current = next;
      return next;
    });
    setCurrentRound(msg.round);

    if (msg.error && msg.characterId !== 'host') {
      setFailedCharacters((prev) => {
        const exists = prev.find((f) => f.name === msg.characterName);
        if (exists) return prev;
        return [
          ...prev,
          {
            index: prev.length,
            name: msg.characterName,
            error: msg.error || '未知错误',
            providerId: msg.providerId || '',
          },
        ];
      });
    }
  }, []);

  const onCharacterStart = useCallback((name: string) => {
    setCurrentCharacter(name);
  }, []);

  const startDiscussion = useCallback(
    async (roundTable: RoundTable) => {
      setGenerateStatus('generating');
      setIsRunning(true);
      setError('');
      setMessages([]);
      messagesRef.current = [];
      setIsComplete(false);
      setCurrentCharacter(null);
      setFailedCharacters([]);
      roundTableRef.current = roundTable;

      // Set up event listeners
      const cleanup: (() => void)[] = [];

      const unsubMsg = window.electronAPI.onDiscussMessage((msg: Message) => {
        onMessage(msg);
      });
      cleanup.push(unsubMsg);

      const unsubChar = window.electronAPI.onDiscussCharacterStart((name: string) => {
        onCharacterStart(name);
      });
      cleanup.push(unsubChar);

      const unsubComplete = window.electronAPI.onDiscussComplete(async (result: any) => {
        if (roundTableRef.current) {
          roundTableRef.current.status = 'completed';
          await saveRoundTable(roundTableRef.current);
          await saveMessages(roundTableRef.current.id, result.messages || messagesRef.current);
        }
        setIsComplete(true);
        setGenerateStatus('idle');
        setIsRunning(false);
        setCurrentCharacter(null);
        cleanup.forEach((fn) => fn());
        cleanupRef.current = [];
      });
      cleanup.push(unsubComplete);

      const unsubError = window.electronAPI.onDiscussError(async (err: any) => {
        if (roundTableRef.current) {
          await saveMessages(roundTableRef.current.id, messagesRef.current);
        }
        setError(err.error || '讨论生成失败');
        setGenerateStatus('error');
        setIsRunning(false);
        setCurrentCharacter(null);
        cleanup.forEach((fn) => fn());
        cleanupRef.current = [];
      });
      cleanup.push(unsubError);

      cleanupRef.current = cleanup;

      // Start the discussion in the main process
      try {
        await window.electronAPI.discussRun(roundTable);
      } catch (err: any) {
        setError(err.message || '启动讨论失败');
        setGenerateStatus('error');
        setIsRunning(false);
        setCurrentCharacter(null);
        cleanup.forEach((fn) => fn());
        cleanupRef.current = [];
      }
    },
    [onMessage, onCharacterStart]
  );

  const stop = useCallback(() => {
    if (roundTableRef.current) {
      setGenerateStatus('stopping');
      window.electronAPI.discussStop(roundTableRef.current.id);
      setIsRunning(false);
      setCurrentCharacter(null);
    }
  }, []);

  const retryCharacter = useCallback(
    async (characterName: string) => {
      const failedMsg = messagesRef.current.find(
        (m) => m.characterName === characterName && m.error
      );
      if (!failedMsg || !roundTableRef.current) return;

      const filtered = messagesRef.current.filter((m) => m.id !== failedMsg.id);
      setMessages(filtered);
      messagesRef.current = filtered;
      setFailedCharacters((prev) => prev.filter((f) => f.name !== characterName));

      setGenerateStatus('generating');
      setIsRunning(true);
      setCurrentCharacter(characterName);

      try {
        const systemPrompt = buildSystemPrompt();
        const character = roundTableRef.current.characters.find(
          (c) => c.name === characterName
        );
        if (!character) return;

        const speechPrompt = buildCharacterSpeechPrompt(
          roundTableRef.current.topic,
          character,
          failedMsg.round,
          messagesRef.current.slice(-3)
        );

        const result = await window.electronAPI.discussGenerate(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: speechPrompt },
          ],
          character.providerId
        );

        if (result.content) {
          const newMsg = {
            ...failedMsg,
            content: result.content,
            error: undefined,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, newMsg]);
          messagesRef.current = [...messagesRef.current, newMsg];
        } else {
          setFailedCharacters((prev) => [
            ...prev,
            {
              index: prev.length,
              name: characterName,
              error: result.error || '重试失败',
              providerId: character.providerId,
            },
          ]);
        }
      } catch (err: any) {
        setError(err?.message || '重试失败');
        setGenerateStatus('error');
      }

      setGenerateStatus('idle');
      setIsRunning(false);
      setCurrentCharacter(null);

      if (roundTableRef.current) {
        await saveMessages(roundTableRef.current.id, messagesRef.current);
      }
    },
    []
  );

  const reset = useCallback(() => {
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];
    setMessages([]);
    setIsRunning(false);
    setError('');
    setCurrentRound(0);
    setIsComplete(false);
    setCurrentCharacter(null);
    setFailedCharacters([]);
    setGenerateStatus('idle');
    messagesRef.current = [];
  }, []);

  return {
    messages,
    isRunning,
    error,
    currentRound,
    isComplete,
    currentCharacter,
    failedCharacters,
    generateStatus,
    startDiscussion,
    stop,
    retryCharacter,
    reset,
  };
}
