// ===== AI 圆桌模拟器 — Toast Notification Component =====

import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;  // ms, default 5000
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
};

const BG_CLASSES: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-amber-50 border-amber-200',
  info: 'bg-blue-50 border-blue-200',
};

interface ToastComponentProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastComponent({ toast, onDismiss }: ToastComponentProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${BG_CLASSES[toast.type]} animate-slide-in-right`}
    >
      <div className="shrink-0 mt-0.5">{ICONS[toast.type]}</div>
      <p className="text-sm text-gray-800 flex-1 leading-relaxed">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-0.5 hover:bg-black/5 rounded transition-colors"
      >
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}

// ===== Toast Provider & Hook =====

import React, { createContext, useContext } from 'react';
import { generateId } from '@/lib/types';

interface ToastContextValue {
  showToast: (item: Omit<ToastItem, 'id'>) => void;
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  toasts: [],
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = generateId();
    setToasts((prev) => [...prev, { ...item, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, toasts }}>
      {children}
      {/* Toast container - fixed position top-right */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastComponent toast={t} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
