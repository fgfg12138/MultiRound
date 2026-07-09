// ===== AI 圆桌模拟器 — Drag Resize Handle Component =====
// 用于在两栏之间拖拽调整宽度。支持左/右方向的宽度调整。

import { useCallback, useRef, useState } from 'react';

interface ResizeHandleProps {
  /** 拖拽时的回调，delta 为正表示向右拖拽（左侧栏变宽），负值表示向左 */
  onResize: (delta: number) => void;
  /** 拖拽结束后的回调，可用于持久化宽度 */
  onResizeEnd?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
}

export default function ResizeHandle({ onResize, onResizeEnd, disabled = false }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      startXRef.current = e.clientX;

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current;
        startXRef.current = ev.clientX;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onResizeEnd?.();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [disabled, onResize, onResizeEnd]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-[6px] shrink-0 cursor-col-resize relative group z-10
        ${isDragging ? 'bg-p300' : 'bg-transparent hover:bg-p200'}
        transition-colors duration-100`}
      title="拖拽调整宽度"
    >
      {/* Visual indicator line */}
      <div
        className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px]
          ${isDragging ? 'bg-p400' : 'bg-g200 group-hover:bg-p300'}
          transition-colors duration-100`}
      />
      {/* Invisible wider hit area for easier grabbing */}
      <div className="absolute inset-0 -left-1 -right-1" />
    </div>
  );
}
