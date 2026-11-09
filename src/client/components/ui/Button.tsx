import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 32 | 40 | 44;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 40,
  icon,
  iconRight,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const sizeStyles = {
    32: 'h-8 px-3 text-[13px] leading-[18px]',
    40: 'h-10 px-4 text-[14px] leading-[20px]',
    44: 'h-11 px-5 text-[14px] leading-[20px]',
  }[size];

  const variantStyles = {
    primary:
      'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] border-transparent shadow-none',
    secondary:
      'bg-[var(--bg-3)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] active:bg-[var(--bg-4)]',
    ghost:
      'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] active:bg-[var(--bg-4)] border-transparent',
    danger:
      'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--on-accent)] active:opacity-90',
  }[variant];

  const disabledStyles = disabled
    ? 'opacity-40 cursor-not-allowed pointer-events-none'
    : 'cursor-pointer active:scale-[0.99]';

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-buttons)] font-medium transition-[background-color,border-color,color] duration-[150ms] ease-out outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-0)] ${sizeStyles} ${variantStyles} ${disabledStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className="inline-flex shrink-0 items-center justify-center">{iconRight}</span>}
    </button>
  );
};
