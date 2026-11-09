import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: React.ReactNode;
  hasChevron?: boolean;
  children: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({
  selected = false,
  icon,
  hasChevron = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <button
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium transition-all duration-[150ms] ease-out outline-none cursor-pointer border select-none ${
        selected
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
          : 'bg-[var(--bg-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
      } ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'active:bg-[var(--bg-4)]'} focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
      {hasChevron && <ChevronDown size={14} strokeWidth={1.75} className="shrink-0 opacity-70" />}
    </button>
  );
};
