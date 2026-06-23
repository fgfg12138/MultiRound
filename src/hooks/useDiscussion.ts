// ===== AI 圆桌模拟器 — Discussion State Hook =====

import { useState, useCallback, useRef } from 'react';
import type { Message, RoundTable } from '@/lib/types';
import { generateDiscussion } from '@/lib/discussion-engine';
import { generateId } from '@/lib/types';
import { saveMessages } from '@/lib/storage';
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

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const roundTableRef = useRef<RoundTable | null>(null);

  // Keep messagesRef in sync
  messagesRef.current = messages;

  const onMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      messagesRef.current = next;
      return next;
    });
    setCurrentRound(msg.round);

    // Track failed characters
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

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await generateDiscussion(roundTable, onMessage, {
          signal: controller.signal,
          onCharacterStart,
        });

        if (controller.signal.aborted) {
          setGenerateStatus('idle');
          setIsRunning(false);
        } else {
          setIsComplete(true);
          setGenerateStatus('idle');
          setIsRunning(false);
          setCurrentCharacter(null);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setGenerateStatus('idle');
        } else {
          setError(err.message || '讨论生成失败');
          setGenerateStatus('error');
        }
        setIsRunning(false);
        setCurrentCharacter(null);
      }
    },
    [onMessage, onCharacterStart]
  );

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setGenerateStatus('stopping');
      setIsRunning(false);
      setCurrentCharacter(null);
    }
  }, []);

  const retryCharacter = useCallback(
    async (characterName: string) => {
      // Find the failed message for this character
      const failedMsg = messagesRef.current.find(
        (m) => m.characterName === characterName && m.error
      );
      if (!failedMsg || !roundTableRef.current) return;

      // Remove the failed message
      const filtered = messagesRef.current.filter((m) => m.id !== failedMsg.id);
      setMessages(filtered);
      messagesRef.current = filtered;
      setFailedCharacters((prev) => prev.filter((f) => f.name !== characterName));

      // Regenerate just this character
      setGenerateStatus('generating');
      setIsRunning(true);
      setCurrentCharacter(characterName);

      const controller = new AbortController();
      abortRef.current = controller;

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
      } catch {
        // ignore
      }

      setGenerateStatus('idle');
      setIsRunning(false);
      setCurrentCharacter(null);
      abortRef.current = null;

      // Save updated messages
      if (roundTableRef.current) {
        await saveMessages(roundTableRef.current.id, messagesRef.current);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setMessages([]);
    setIsRunning(false);
    setError('');
    setCurrentRound(0);
    setIsComplete(false);
    setCurrentCharacter(null);
    setFailedCharacters([]);
    setGenerateStatus('idle');
    abortRef.current = null;
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
