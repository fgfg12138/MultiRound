// ===== AI 圆桌模拟器 — Discussion State Hook =====
// 新版：通过 IPC 启动/停止讨论，通过事件订阅消息流
// 支持多圆桌并发，支持离开页面不中断

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, RoundTable, TokenRecord } from '@/lib/types';
import { generateId } from '@/lib/types';
import { saveRoundTable, saveMessages, loadMessages } from '@/lib/storage';

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
  const [isPaused, setIsPaused] = useState(false);
  const [awaitingHostInput, setAwaitingHostInput] = useState<{ round: number; phase?: string } | null>(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [streamingCharacter, setStreamingCharacter] = useState<string | null>(null);
  const [tokenRecords, setTokenRecords] = useState<TokenRecord[]>([]);
  const [tokenTotals, setTokenTotals] = useState<{ inputTokens: number; outputTokens: number; total: number }>({
    inputTokens: 0, outputTokens: 0, total: 0,
  });
  /** Map characterName → accumulated streaming content */
  const streamingContentRef = useRef<Record<string, string>>({});

  const messagesRef = useRef<Message[]>([]);
  const roundTableRef = useRef<RoundTable | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const stoppedByUserRef = useRef(false);

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

  const subscribeEvents = useCallback((config: { onComplete?: (result: any) => Promise<void>; onError?: (err: any) => Promise<void> } = {}) => {
    const cleanup: (() => void)[] = [];
    const { onComplete, onError } = config;

    cleanup.push(window.electronAPI.onDiscussMessage((msg) => onMessage(msg)));
    cleanup.push(window.electronAPI.onDiscussCharacterStart((name) => onCharacterStart(name)));

    cleanup.push(window.electronAPI.onDiscussComplete(async (result) => {
      if (onComplete) await onComplete(result);
      setIsComplete(true); setGenerateStatus('idle'); setIsRunning(false); setCurrentCharacter(null);
      cleanup.forEach((fn) => fn()); cleanupRef.current = [];
    }));

    cleanup.push(window.electronAPI.onDiscussError(async (err) => {
      if (onError) await onError(err);
      setError(err.error || '讨论出错'); setGenerateStatus('error'); setIsRunning(false); setCurrentCharacter(null);
      cleanup.forEach((fn) => fn()); cleanupRef.current = [];
    }));

    cleanup.push(window.electronAPI.onDiscussPaused(() => setIsPaused(true)));
    if (window.electronAPI.onWhisperReply) cleanup.push(window.electronAPI.onWhisperReply((data) => { if (data.roundTableId === roundTableRef.current?.id) setMessages((prev) => [...prev]); }));
    if (window.electronAPI.onWhisperGroupReply) cleanup.push(window.electronAPI.onWhisperGroupReply((data) => { if (data.roundTableId === roundTableRef.current?.id) setMessages((prev) => [...prev]); }));
    cleanup.push(window.electronAPI.onDiscussAwaitingHostInput((info) => setAwaitingHostInput(info)));

    streamingContentRef.current = {};
    let chunkCounter = 0;
    cleanup.push(window.electronAPI.onDiscussStreamChunk((data) => {
      const { characterName, chunk } = data;
      setStreamingCharacter(characterName);
      streamingContentRef.current[characterName] = (streamingContentRef.current[characterName] || '') + chunk;
      chunkCounter++;
      setMessages((prev) => {
        const next = [...prev]; const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].characterName === characterName) {
          next[lastIdx] = { ...next[lastIdx], content: streamingContentRef.current[characterName] };
        } else if (lastIdx >= 0 && next[lastIdx].characterName !== characterName) {
          const rt = roundTableRef.current;
          if (rt) {
            const char = rt.characters.find((c) => c.name === characterName) || (rt.host?.name === characterName ? { id: 'host', name: characterName } : null);
            next.push({ id: `streaming-${characterName}-${chunkCounter}`, roundTableId: rt.id, characterId: char?.id || characterName, characterName, type: 'speech', content: streamingContentRef.current[characterName], timestamp: Date.now(), round: next[lastIdx]?.round || 1 });
          }
        } else {
          const rt = roundTableRef.current;
          if (rt) {
            const char = rt.characters.find((c) => c.name === characterName);
            next.push({ id: `streaming-${characterName}-${chunkCounter}`, roundTableId: rt.id, characterId: char?.id || characterName, characterName, type: 'speech', content: streamingContentRef.current[characterName], timestamp: Date.now(), round: 1 });
          }
        }
        return next;
      });
    }));

    cleanup.push(window.electronAPI.onDiscussStreamEnd((data) => {
      const { characterName } = data; setStreamingCharacter(null); delete streamingContentRef.current[characterName];
    }));

    if (window.electronAPI.onDiscussTokenUpdate) cleanup.push(window.electronAPI.onDiscussTokenUpdate((data) => {
      setTokenRecords(data.records || []);
      const gt = { inputTokens: 0, outputTokens: 0, total: 0 };
      for (const r of (data.records || [])) { gt.inputTokens += r.estimatedInputTokens || 0; gt.outputTokens += r.estimatedOutputTokens || 0; }
      gt.total = gt.inputTokens + gt.outputTokens; setTokenTotals(gt);
    }));

    cleanupRef.current = cleanup;
    return cleanup;
  }, [onMessage, onCharacterStart]);

  const startDiscussion = useCallback(async (roundTable: any, options?: any) => {
    const preserve = options?.preserveMessages === true && messagesRef.current.length > 0;
    setGenerateStatus('generating'); setIsRunning(true); setError('');
    if (!preserve) { setMessages([]); messagesRef.current = []; }
    setIsComplete(false); setCurrentCharacter(null); setFailedCharacters([]);
    stoppedByUserRef.current = false; roundTableRef.current = roundTable;

    subscribeEvents({
      onComplete: async (result) => {
        if (roundTableRef.current) {
          roundTableRef.current.status = stoppedByUserRef.current ? 'stopped' : 'completed';
          await saveRoundTable(roundTableRef.current);
          await saveMessages(roundTableRef.current.id, result.messages || messagesRef.current);
        }
      },
      onError: async () => { if (roundTableRef.current) await saveMessages(roundTableRef.current.id, messagesRef.current); },
    });

    try { await window.electronAPI.discussRun(roundTable); }
    catch (err: any) { setError(err.message || '启动讨论失败'); setGenerateStatus('error'); setIsRunning(false); setCurrentCharacter(null); cleanupRef.current.forEach((fn) => fn()); cleanupRef.current = []; }
  }, [onMessage, onCharacterStart, subscribeEvents]);

  const appendRound = useCallback(async (roundTable: any) => {
    setGenerateStatus('generating'); setIsRunning(true); setError('');
    setIsComplete(false); setCurrentCharacter(null); setFailedCharacters([]);
    stoppedByUserRef.current = false; roundTableRef.current = roundTable;

    subscribeEvents({
      onComplete: async (result) => {
        if (roundTableRef.current) { roundTableRef.current.status = 'completed'; await saveRoundTable(roundTableRef.current); await saveMessages(roundTableRef.current.id, result.messages || messagesRef.current); }
      },
      onError: async () => { if (roundTableRef.current) await saveMessages(roundTableRef.current.id, messagesRef.current); },
    });

    try { await window.electronAPI.discussAppendRound(roundTable); }
    catch (err: any) { setError(err.message || '追加讨论失败'); setGenerateStatus('error'); setIsRunning(false); setCurrentCharacter(null); cleanupRef.current.forEach((fn) => fn()); cleanupRef.current = []; }
  }, [onMessage, onCharacterStart, subscribeEvents]);


  const stop = useCallback(() => {
    if (roundTableRef.current) {
      stoppedByUserRef.current = true;
      setGenerateStatus('stopping');
      window.electronAPI.discussStop(roundTableRef.current.id);
      setIsRunning(false);
      setCurrentCharacter(null);
    }
  }, []);

  const pause = useCallback(() => {
    if (roundTableRef.current) {
      window.electronAPI.discussPause(roundTableRef.current.id);
    }
  }, []);

  const resume = useCallback(() => {
    if (roundTableRef.current) {
      window.electronAPI.discussResume(roundTableRef.current.id);
      setIsPaused(false);
    }
  }, []);

  const sendUserHostInput = useCallback(async (content: string) => {
    if (!roundTableRef.current || !awaitingHostInput) return;
    await window.electronAPI.discussUserHostInput(roundTableRef.current.id, content);
    setAwaitingHostInput(null);
  }, [awaitingHostInput]);

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
        const result = await window.electronAPI.discussRetryCharacter({
          roundTableId: roundTableRef.current.id,
          characterName,
          round: failedMsg.round,
          providerId: "",
        });

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
              providerId: "",
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
    setHasHistory(false);
    setTokenRecords([]);
    setTokenTotals({ inputTokens: 0, outputTokens: 0, total: 0 });
    messagesRef.current = [];
  }, []);

  // Load an existing completed discussion's history
  const loadExistingDiscussion = useCallback(async (roundTable: RoundTable) => {
    roundTableRef.current = roundTable;
    try {
      const msgs = await loadMessages(roundTable.id);
      setMessages(msgs);
      messagesRef.current = msgs;
      if (msgs.length > 0) {
        setCurrentRound(msgs[msgs.length - 1].round);
      }
      setIsComplete(roundTable.status === 'completed' || roundTable.status === 'stopped');
      setHasHistory(true);
    } catch {
      // silently fail — user can still start fresh
    }
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
    isPaused,
    awaitingHostInput,
    stoppedByUser: stoppedByUserRef,
    hasHistory,
    streamingCharacter,
    tokenRecords,
    tokenTotals,
    startDiscussion,
    appendRound,
    stop,
    pause,
    resume,
    sendUserHostInput,
    retryCharacter,
    reset,
    loadExistingDiscussion,
  };
}
