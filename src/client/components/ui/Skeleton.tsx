import React from 'react';

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  rounded = 'md',
}) => {
  const roundedClass = {
    sm: 'rounded-[8px]',
    md: 'rounded-[var(--radius-buttons)]',
    lg: 'rounded-[var(--radius-cards)]',
    full: 'rounded-full',
  }[rounded];

  return (
    <div
      className={`animate-shimmer border border-[var(--border-subtle)] ${roundedClass} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      aria-hidden="true"
    />
  );
};
