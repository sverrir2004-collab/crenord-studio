import React, { useState, useRef } from 'react';

export interface BeforeAfterSliderProps {
  beforeUrl?: string;
  afterUrl?: string;
  isVideo?: boolean;
  beforeGradient?: string;
  afterGradient?: string;
  beforeLabel?: string;
  afterLabel?: string;
  aspectRatio?: string;
  className?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeUrl,
  afterUrl,
  isVideo = false,
  beforeGradient = 'linear-gradient(135deg, #101217 0%, #1c202a 100%)',
  afterGradient = 'linear-gradient(135deg, #13171f 0%, #293248 100%)',
  beforeLabel = 'Before',
  afterLabel = 'After',
  aspectRatio = '16/9',
  className = '',
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(pos);
  };

  const handleMouseDown = () => {
    isDragging.current = true;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      handleMove(e.clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchMove={handleTouchMove}
      className={`relative select-none overflow-hidden rounded-[var(--radius-cards)] border border-[var(--border-subtle)] bg-[var(--bg-2)] cursor-ew-resize ${className}`}
      style={{ aspectRatio }}
    >
      {/* After background (full width) */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ background: afterGradient }}
      >
        {afterUrl ? (
          isVideo ? (
            <video src={afterUrl} autoPlay loop muted playsInline className="w-full h-full object-contain" />
          ) : (
            <img src={afterUrl} alt="After" className="w-full h-full object-contain" />
          )
        ) : (
          <span className="type-caption text-[var(--text-tertiary)] opacity-30 select-none">
            CRENORD PROCESSED
          </span>
        )}
      </div>

      {/* Before overlay (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{
            background: beforeGradient,
            width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%',
          }}
        >
          {beforeUrl ? (
            isVideo ? (
              <video src={beforeUrl} autoPlay loop muted playsInline className="w-full h-full object-contain" />
            ) : (
              <img src={beforeUrl} alt="Before" className="w-full h-full object-contain" />
            )
          ) : (
            <span className="type-caption text-[var(--text-tertiary)] opacity-30 select-none">
              ORIGINAL SOURCE
            </span>
          )}
        </div>
      </div>

      {/* Pill Labels */}
      <div className="absolute top-4 left-4 z-10 px-2.5 py-1 rounded-full bg-[var(--bg-2)]/80 backdrop-blur-none border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)]">
        {beforeLabel}
      </div>
      <div className="absolute top-4 right-4 z-10 px-2.5 py-1 rounded-full bg-[var(--bg-2)]/80 backdrop-blur-none border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)]">
        {afterLabel}
      </div>

      {/* Draggable Divider Line and Handle */}
      <div
        className="absolute top-0 bottom-0 z-20 w-[2px] bg-[var(--accent)]"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[var(--bg-2)] border-2 border-[var(--accent)] shadow-[var(--shadow-popover)] flex items-center justify-center">
          <div className="flex items-center gap-0.5 text-[var(--text-primary)]">
            <span className="text-[10px]">◀</span>
            <span className="text-[10px]">▶</span>
          </div>
        </div>
      </div>
    </div>
  );
};
