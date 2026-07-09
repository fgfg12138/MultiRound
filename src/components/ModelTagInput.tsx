// ===== AI 圆桌模拟器 — ModelTagInput Component =====
// 多模型名标签输入组件：输入框 + 回车/逗号添加标签，可删除，至少保留一个

import { useState, useRef, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

export interface ModelTagInputProps {
  models: string[];
  onChange: (models: string[]) => void;
  error?: string;
}

export default function ModelTagInput({ models, onChange, error }: ModelTagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [duplicateHint, setDuplicateHint] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addModel(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    // 去重检查
    if (models.includes(trimmed)) {
      setDuplicateHint(`"${trimmed}" 已存在`);
      setInputValue('');
      setTimeout(() => setDuplicateHint(''), 2000);
      return;
    }

    onChange([...models, trimmed]);
    setInputValue('');
    setDuplicateHint('');
  }

  function removeModel(index: number) {
    if (models.length <= 1) return; // 至少保留一个模型
    const next = [...models];
    next.splice(index, 1);
    onChange(next);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addModel(inputValue);
    } else if (e.key === ',') {
      e.preventDefault();
      addModel(inputValue.replace(/,/g, ''));
    } else if (e.key === 'Backspace' && inputValue === '' && models.length > 1) {
      // 输入框为空时按退格删除最后一个标签
      removeModel(models.length - 1);
    }
  }

  function handleContainerClick() {
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-1">
      <div
        onClick={handleContainerClick}
        className={`flex flex-wrap items-center gap-1.5 px-3 py-2 min-h-[42px] border rounded-r-lg bg-white cursor-text transition-colors ${
          error ? 'border-error focus-within:ring-2 focus-within:ring-error/30' : 'border border-g300 focus-within:ring-2 focus-within:ring-p400 focus-within:border-transparent'
        }`}
      >
        {models.map((model, idx) => (
          <span
            key={`${model}-${idx}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-p100 text-p700 text-xs rounded-full font-medium"
          >
            {model}
            {models.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeModel(idx);
                }}
                className="p-0.5 hover:bg-p200 rounded-full transition-colors"
                title={`移除 "${model}"`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setDuplicateHint('');
          }}
          onKeyDown={handleKeyDown}
          placeholder={models.length === 0 ? '输入模型名，回车或逗号添加...' : '继续添加...'}
          className="flex-1 min-w-[120px] border-none outline-none text-sm bg-transparent py-0.5 placeholder:text-g300"
        />
      </div>
      {duplicateHint && (
        <p className="text-xs text-warning">{duplicateHint}</p>
      )}
      {error && (
        <p className="text-xs text-error">{error}</p>
      )}
      {!error && !duplicateHint && models.length === 0 && (
        <p className="text-xs text-g400">至少需要一个模型名。输入后按回车或逗号添加。</p>
      )}
    </div>
  );
}
