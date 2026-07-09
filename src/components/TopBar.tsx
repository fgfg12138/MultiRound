import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface TopBarProps {
  title?: string;
  showBack?: boolean;
  backTo?: string;
  actions?: ReactNode;
  onBack?: () => void;
  badge?: string;
}

export default function TopBar({
  title,
  showBack = false,
  actions,
  onBack,
  badge,
}: TopBarProps) {
  return (
    <header className="h-14 min-h-[56px] flex items-center justify-between px-s6 border-b border-g200 bg-white select-none shrink-0">
      <div className="flex items-center gap-s3 min-w-0">
        {showBack && (
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-g100 rounded-r-lg transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-g500" />
          </button>
        )}
        {title && (
          <h1 className="text-base font-semibold text-g900 truncate flex items-center gap-s3">
            {title}
            {badge && (
              <span className="text-[11px] font-medium bg-p100 text-p700 px-2 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-s3 shrink-0">{actions}</div>
    </header>
  );
}
