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

  const startDiscussion = useCallback(
    async (roundTable: RoundTable, options?: { preserveMessages?: boolean }) => {
      const preserve = options?.preserveMessages === true && messagesRef.current.length > 0;
      setGenerateStatus('generating');
      setIsRunning(true);
      setError('');
      if (!preserve) {
        setMessages([]);
        messagesRef.current = [];
      }
      setIsComplete(false);
      setCurrentCharacter(null);
      setFailedCharacters([]);
      stoppedByUserRef.current = false;
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
          roundTableRef.current.status = stoppedByUserRef.current ? 'stopped' : 'completed';
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

      const unsubPaused = window.electronAPI.onDiscussPaused(() => setIsPaused(true));
      cleanup.push(unsubPaused);

      // Whisper reply listeners — trigger re-render when new whisper messages arrive
      const unsubWhisperReply = window.electronAPI.onWhisperReply
        ? window.electronAPI.onWhisperReply((data) => {
            if (data.roundTableId === roundTableRef.current?.id) {
              setMessages((prev) => [...prev]);
            }
          })
        : undefined;
      if (unsubWhisperReply) cleanup.push(unsubWhisperReply);

      const unsubWhisperGroupReply = window.electronAPI.onWhisperGroupReply
        ? window.electronAPI.onWhisperGroupReply((data) => {
            if (data.roundTableId === roundTableRef.current?.id) {
              setMessages((prev) => [...prev]);
            }
          })
        : undefined;
      if (unsubWhisperGroupReply) cleanup.push(unsubWhisperGroupReply);

      const unsubAwait = window.electronAPI.onDiscussAwaitingHostInput((info) => {
        setAwaitingHostInput(info);
      });
      cleanup.push(unsubAwait);

      // Streaming: collect chunks for each character
      streamingContentRef.current = {};
      let chunkCounter = 0;
      const unsubStreamChunk = window.electronAPI.onDiscussStreamChunk((data) => {
        const { characterName, chunk } = data;
        setStreamingCharacter(characterName);
        streamingContentRef.current[characterName] =
          (streamingContentRef.current[characterName] || '') + chunk;
        chunkCounter++;
        // Update the last streaming message in the list
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].characterName === characterName) {
            // 已有该角色的消息，更新内容
            next[lastIdx] = { ...next[lastIdx], content: streamingContentRef.current[characterName] };
          } else if (lastIdx >= 0 && next[lastIdx].characterName !== characterName) {
            // 前一个角色的消息已完成，插入当前角色的占位消息
            const rt = roundTableRef.current;
            if (rt) {
              const char = rt.characters.find((c: any) => c.name === characterName)
                || (rt.host?.name === characterName ? { id: 'host', name: characterName } : null);
              const round = next[lastIdx]?.round || 1;
              next.push({
                id: `streaming-${characterName}-${chunkCounter}`,
                roundTableId: rt.id,
                characterId: char?.id || characterName,
                characterName,
                type: 'speech',
                content: streamingContentRef.current[characterName],
                timestamp: Date.now(),
                round,
              });
            }
          } else {
            // 空列表，插入第一条占位消息
            const rt = roundTableRef.current;
            if (rt) {
              const char = rt.characters.find((c: any) => c.name === characterName);
              next.push({
                id: `streaming-${characterName}-${chunkCounter}`,
                roundTableId: rt.id,
                characterId: char?.id || characterName,
                characterName,
                type: 'speech',
                content: streamingContentRef.current[characterName],
                timestamp: Date.now(),
                round: 1,
              });
            }
          }
          return next;
        });
      });
      cleanup.push(unsubStreamChunk);

      const unsubStreamEnd = window.electronAPI.onDiscussStreamEnd((data) => {
        const { characterName } = data;
        setStreamingCharacter(null);
        delete streamingContentRef.current[characterName];
      });
      cleanup.push(unsubStreamEnd);

      const unsubTokenUpdate = window.electronAPI.onDiscussTokenUpdate
        ? window.electronAPI.onDiscussTokenUpdate((data: { roundTableId: string; records: TokenRecord[] }) => {
            setTokenRecords(data.records);
            const gt = { inputTokens: 0, outputTokens: 0, total: 0 };
            for (const r of data.records) {
              gt.inputTokens += r.estimatedInputTokens;
              gt.outputTokens += r.estimatedOutputTokens;
            }
            gt.total = gt.inputTokens + gt.outputTokens;
            setTokenTotals(gt);
          })
        : undefined;
      if (unsubTokenUpdate) cleanup.push(unsubTokenUpdate);

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

  const appendRound = useCallback(async (roundTable: RoundTable) => {
    setGenerateStatus('generating');
    setIsRunning(true);
    setError('');
    setIsComplete(false);
    setCurrentCharacter(null);
    setFailedCharacters([]);
    stoppedByUserRef.current = false;
    roundTableRef.current = roundTable;

    // Set up event listeners (same as startDiscussion)
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
      setError(err.error || '追加讨论失败');
      setGenerateStatus('error');
      setIsRunning(false);
      setCurrentCharacter(null);
      cleanup.forEach((fn) => fn());
      cleanupRef.current = [];
    });
    cleanup.push(unsubError);

    const unsubPaused = window.electronAPI.onDiscussPaused(() => setIsPaused(true));
    cleanup.push(unsubPaused);

    // Whisper reply listeners — trigger re-render when new whisper messages arrive
    const unsubWhisperReply = window.electronAPI.onWhisperReply
      ? window.electronAPI.onWhisperReply((data) => {
          if (data.roundTableId === roundTableRef.current?.id) {
            setMessages((prev) => [...prev]);
          }
        })
      : undefined;
    if (unsubWhisperReply) cleanup.push(unsubWhisperReply);

    const unsubWhisperGroupReply = window.electronAPI.onWhisperGroupReply
      ? window.electronAPI.onWhisperGroupReply((data) => {
          if (data.roundTableId === roundTableRef.current?.id) {
            setMessages((prev) => [...prev]);
          }
        })
      : undefined;
    if (unsubWhisperGroupReply) cleanup.push(unsubWhisperGroupReply);

    const unsubAwait = window.electronAPI.onDiscussAwaitingHostInput((info) => {
      setAwaitingHostInput(info);
    });
    cleanup.push(unsubAwait);

    streamingContentRef.current = {};
    let chunkCounter = 0;
    const unsubStreamChunk = window.electronAPI.onDiscussStreamChunk((data) => {
      const { characterName, chunk } = data;
      setStreamingCharacter(characterName);
      streamingContentRef.current[characterName] =
        (streamingContentRef.current[characterName] || '') + chunk;
      chunkCounter++;
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].characterName === characterName) {
          next[lastIdx] = { ...next[lastIdx], content: streamingContentRef.current[characterName] };
        } else if (lastIdx >= 0 && next[lastIdx].characterName !== characterName) {
          const rt = roundTableRef.current;
          if (rt) {
            const char = rt.characters.find((c: any) => c.name === characterName)
              || (rt.host?.name === characterName ? { id: 'host', name: characterName } : null);
            const round = next[lastIdx]?.round || 1;
            next.push({
              id: `streaming-${characterName}-${chunkCounter}`,
              roundTableId: rt.id,
              characterId: char?.id || characterName,
              characterName,
              type: 'speech',
              content: streamingContentRef.current[characterName],
              timestamp: Date.now(),
              round,
            });
          }
        } else {
          const rt = roundTableRef.current;
          if (rt) {
            const char = rt.characters.find((c: any) => c.name === characterName);
            next.push({
              id: `streaming-${characterName}-${chunkCounter}`,
              roundTableId: rt.id,
              characterId: char?.id || characterName,
              characterName,
              type: 'speech',
              content: streamingContentRef.current[characterName],
              timestamp: Date.now(),
              round: 1,
            });
          }
        }
        return next;
      });
    });
    cleanup.push(unsubStreamChunk);

    const unsubStreamEnd = window.electronAPI.onDiscussStreamEnd((data) => {
      const { characterName } = data;
      setStreamingCharacter(null);
      delete streamingContentRef.current[characterName];
    });
    cleanup.push(unsubStreamEnd);

    const unsubTokenUpdate = window.electronAPI.onDiscussTokenUpdate
      ? window.electronAPI.onDiscussTokenUpdate((data: { roundTableId: string; records: TokenRecord[] }) => {
          setTokenRecords(data.records);
          const gt = { inputTokens: 0, outputTokens: 0, total: 0 };
          for (const r of data.records) {
            gt.inputTokens += r.estimatedInputTokens;
            gt.outputTokens += r.estimatedOutputTokens;
          }
          gt.total = gt.inputTokens + gt.outputTokens;
          setTokenTotals(gt);
        })
      : undefined;
    if (unsubTokenUpdate) cleanup.push(unsubTokenUpdate);

    cleanupRef.current = cleanup;

    try {
      await window.electronAPI.discussAppendRound(roundTable);
    } catch (err: any) {
      setError(err.message || '追加讨论失败');
      setGenerateStatus('error');
      setIsRunning(false);
      setCurrentCharacter(null);
      cleanup.forEach((fn) => fn());
      cleanupRef.current = [];
    }
  }, [onMessage, onCharacterStart]);

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
