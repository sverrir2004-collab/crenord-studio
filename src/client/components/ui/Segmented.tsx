import React from 'react';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string = string> {
  options: SegmentedOption<T>[] | { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: SegmentedProps<T>) {
  const itemHeight = size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[13px]';

  return (
    <div
      className={`inline-flex items-center p-1 bg-[var(--bg-3)] rounded-[var(--radius-buttons)] border border-[var(--border-subtle)] ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center justify-center gap-1.5 px-3 rounded-[8px] font-medium transition-[background-color,color] duration-[150ms] ease-out cursor-pointer outline-none select-none ${itemHeight} ${
              isSelected
                ? 'bg-[var(--bg-4)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-4)]/40'
            } focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
          >
            {'icon' in opt && opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
