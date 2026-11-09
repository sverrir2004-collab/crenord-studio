import React from 'react';

export interface BadgeProps {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
  dot = false,
}) => {
  const variantStyles = {
    default: 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
    success: 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/30',
    warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/30',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/30',
  }[variant];

  const dotColor = {
    default: 'bg-[var(--text-tertiary)]',
    accent: 'bg-[var(--accent)]',
    success: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
    danger: 'bg-[var(--danger)]',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[12px] font-medium border leading-none shrink-0 ${variantStyles} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      <span className="truncate">{children}</span>
    </span>
  );
};
