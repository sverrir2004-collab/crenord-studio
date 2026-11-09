import React from 'react';
import { Button } from './Button.tsx';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-12 max-w-md mx-auto ${className}`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-full bg-[var(--bg-2)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] mb-4">
          {icon}
        </div>
      )}
      <h2 className="type-h2 text-[var(--text-primary)] mb-1.5">{title}</h2>
      {description && (
        <p className="type-caption text-[var(--text-secondary)] max-w-sm mb-6">{description}</p>
      )}
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex items-center gap-3">
          {actionLabel && (
            <Button variant="primary" size={40} onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && (
            <Button variant="secondary" size={40} onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
