import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  id?: string;
  message: string;
  variant?: 'info' | 'success' | 'danger';
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  variant = 'info',
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    info: <Info size={16} strokeWidth={1.75} className="text-[var(--accent)]" />,
    success: <CheckCircle2 size={16} strokeWidth={1.75} className="text-[var(--success)]" />,
    danger: <AlertCircle size={16} strokeWidth={1.75} className="text-[var(--danger)]" />,
  }[variant];

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-strong)] shadow-[var(--shadow-popover)] text-[13px] font-medium text-[var(--text-primary)] transition-all animate-in fade-in slide-in-from-bottom-2 duration-180"
    >
      {icons}
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="ml-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-0.5 rounded cursor-pointer"
      >
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
};
