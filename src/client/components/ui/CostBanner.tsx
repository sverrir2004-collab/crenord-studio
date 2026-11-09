import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export interface CostBannerProps {
  message?: string;
  onDismiss?: () => void;
  className?: string;
}

export const CostBanner: React.FC<CostBannerProps> = ({
  message = 'Daily limit reached ($3.00). Raise DAILY_CAP_USD in Secrets to continue.',
  onDismiss,
  className = '',
}) => {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-[var(--radius-buttons)] bg-[var(--danger-soft)] border border-[var(--danger)] text-[var(--danger)] text-[13px] leading-5 font-medium transition-all ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertCircle size={18} strokeWidth={1.75} className="shrink-0 text-[var(--danger)]" />
        <span className="truncate">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss banner"
          className="p-1 rounded-md hover:bg-[var(--danger)]/20 text-[var(--danger)] cursor-pointer transition-colors"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
};
