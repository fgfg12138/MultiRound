// ===== AI 圆桌模拟器 — ConfirmDialog Component =====
// 通用确认弹窗，支持 danger / warning / default 三种变体

import { AlertTriangle, Info, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;       // 附加详情（如"以下角色正在使用..."）
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES: Record<
  NonNullable<ConfirmDialogProps['variant']>,
  { icon: typeof AlertTriangle; iconColor: string; iconBg: string; btnClass: string; btnHover: string }
> = {
  danger: {
    icon: AlertTriangle,
    iconColor: 'text-error',
    iconBg: 'bg-error/10',
    btnClass: 'bg-error text-white',
    btnHover: 'hover:bg-error/90',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-warning',
    iconBg: 'bg-warning/10',
    btnClass: 'bg-warning text-white',
    btnHover: 'hover:bg-warning/90',
  },
  default: {
    icon: Info,
    iconColor: 'text-p600',
    iconBg: 'bg-p50',
    btnClass: 'bg-p600 text-white',
    btnHover: 'hover:bg-p700',
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const styles = VARIANT_STYLES[variant];
  const Icon = styles.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={onCancel}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-r-xl shadow-xl max-w-md w-full mx-4 p-6 animate-in zoom-in-95">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 hover:bg-g100 rounded-r-lg transition-colors"
        >
          <X className="w-4 h-4 text-g400" />
        </button>

        <div className="flex items-start gap-4">
          {/* 图标 */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${styles.iconBg}`}>
            <Icon className={`w-5 h-5 ${styles.iconColor}`} />
          </div>

          {/* 文本区域 */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-g900 mb-2">{title}</h3>
            <p className="text-sm text-g600 leading-relaxed">{message}</p>

            {detail && (
              <div className="mt-3 p-3 bg-g50 border border-g200 rounded-r-lg">
                <p className="text-xs text-g500 whitespace-pre-wrap">{detail}</p>
              </div>
            )}
          </div>
        </div>

        {/* 按钮区域 */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-g600 border border-g200 rounded-r-lg hover:bg-g50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-r-lg font-medium transition-colors ${styles.btnClass} ${styles.btnHover}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
