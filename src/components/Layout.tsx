// ===== AI 圆桌模拟器 — Layout Component =====

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backTo?: string;
  actions?: ReactNode;
}

export default function Layout({
  children,
  title,
  showBack = false,
  backTo,
  actions,
}: LayoutProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Title bar (drag region for Electron) */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 select-none shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {showBack && (
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
            )}
            {title && (
              <h1 className="text-base font-semibold text-gray-900 truncate">
                {title}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
