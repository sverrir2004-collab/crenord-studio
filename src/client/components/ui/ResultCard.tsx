import React, { useState, useRef } from 'react';
import {
  Star,
  Download,
  Edit2,
  Sparkles,
  Eraser,
  FolderPlus,
  MoreVertical,
  Play,
  Pause,
  RotateCcw,
  Check,
  Film,
  Image as ImageIcon,
  Mic,
  Volume2,
} from 'lucide-react';
import { MediaItem } from '../../types/media.ts';

export interface ResultCardProps {
  item: MediaItem;
  status?: 'done' | 'running' | 'failed';
  progress?: number;
  elapsedSeconds?: number;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  onFavoriteToggle?: () => void;
  onOpenDetails?: () => void;
  onAction?: (action: string) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  item,
  status = 'done',
  progress = 0,
  elapsedSeconds = 0,
  isSelected = false,
  onSelect,
  onFavoriteToggle,
  onOpenDetails,
  onAction,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.url) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(item.url);
        audioRef.current.onended = () => setIsPlaying(false);
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatKey = (item.format as string) || '1:1';
  const aspectRatioStyle =
    {
      '1:1': 'aspect-square',
      '9:16': 'aspect-[9/16]',
      '16:9': 'aspect-video',
      '4:5': 'aspect-[4/5]',
    }[formatKey] || 'aspect-square';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMoreMenu(false);
      }}
      className={`group relative overflow-hidden rounded-[var(--radius-cards)] border transition-all duration-[150ms] ease-out select-none ${
        isSelected
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
      } ${aspectRatioStyle}`}
      style={{
        background: status === 'failed' ? 'var(--bg-2)' : item.gradient,
      }}
    >
      {/* Real Media Rendering if item.url exists */}
      {item.url && status === 'done' && (
        item.type === 'video' ? (
          <video
            src={item.url}
            className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
            muted
            playsInline
            loop
            autoPlay
          />
        ) : item.type === 'audio' ? (
          <div className="absolute inset-0 z-0 p-4 flex flex-col justify-between bg-gradient-to-br from-[var(--bg-2)] to-[var(--bg-1)]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)]">
                <Mic size={14} />
              </div>
              <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                {item.title || 'Audio'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="h-7 flex items-center gap-0.5 px-2 bg-[var(--bg-3)] rounded-lg overflow-hidden">
                {Array.from({ length: 24 }).map((_, i) => {
                  const height = Math.sin(i * 0.5) * 45 + 50;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-all ${
                        isPlaying ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--text-tertiary)]/50'
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                <span className="capitalize">{item.metadata?.voice || item.tool?.replace('audio.', '') || 'Audio'}</span>
                <span>{item.duration || item.metadata?.duration || 'Track'}</span>
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
              <button
                type="button"
                onClick={toggleAudio}
                className="w-11 h-11 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform cursor-pointer"
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5 fill-current" />}
              </button>
            </div>
          </div>
        ) : (
          <img
            src={item.url}
            alt={item.title || 'Generated media'}
            className="absolute inset-0 w-full h-full object-cover z-0"
            loading="lazy"
          />
        )
      )}
      {/* Running State Shimmer + Progress Ring */}
      {status === 'running' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--bg-2)]/90 animate-shimmer">
          <div className="relative w-12 h-12 flex items-center justify-center mb-2">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-[var(--border-strong)]"
                strokeWidth="3"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-[var(--accent)]"
                strokeDasharray={`${progress}, 100`}
                strokeWidth="3"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-[11px] font-semibold text-[var(--text-primary)] tabular-nums">
              {progress}%
            </span>
          </div>
          <span className="type-caption text-[var(--text-secondary)] tabular-nums">
            {elapsedSeconds}s elapsed
          </span>
        </div>
      )}

      {/* Failed State */}
      {status === 'failed' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-[var(--danger-soft)]/20 border border-[var(--danger)]/40 text-center">
          <span className="text-[13px] font-medium text-[var(--danger)] mb-2">Generation Failed</span>
          <button
            type="button"
            onClick={() => onAction?.('retry')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
          >
            <RotateCcw size={12} strokeWidth={1.75} />
            Retry
          </button>
        </div>
      )}

      {/* Faint Center Icon for gradient tile */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 text-[var(--text-secondary)]">
        {item.type === 'video' ? (
          <Film size={48} strokeWidth={1.5} />
        ) : (
          <ImageIcon size={48} strokeWidth={1.5} />
        )}
      </div>

      {/* Video 40px play circle and duration badge */}
      {item.type === 'video' && status === 'done' && (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-2)]/90 border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-primary)] shadow-md group-hover:scale-105 transition-transform duration-150">
              <Play size={18} strokeWidth={1.75} className="ml-0.5 fill-current" />
            </div>
          </div>
          {item.duration && (
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-[var(--bg-2)]/90 border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] tabular-nums group-hover:opacity-0 transition-opacity duration-150">
              {item.duration}
            </div>
          )}
        </>
      )}

      {/* Top Header Overlay: Checkbox and Star */}
      <div
        className={`absolute top-3 inset-x-3 z-10 flex items-center justify-between transition-opacity duration-150 ${
          isHovered || isSelected ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect?.(!isSelected)}
          className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
            isSelected
              ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--on-accent)]'
              : 'bg-[var(--bg-2)]/90 border-[var(--border-strong)] text-transparent hover:border-[var(--text-primary)]'
          }`}
          aria-label="Select item"
        >
          <Check size={14} strokeWidth={2.5} className={isSelected ? 'opacity-100' : 'opacity-0'} />
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onFavoriteToggle}
            className={`w-7 h-7 rounded-full bg-[var(--bg-2)]/90 border border-[var(--border-subtle)] flex items-center justify-center transition-colors cursor-pointer ${
              item.isFavorite
                ? 'text-[var(--warning)] border-[var(--warning)]/40'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            aria-label="Favorite"
          >
            <Star
              size={14}
              strokeWidth={1.75}
              className={item.isFavorite ? 'fill-[var(--warning)]' : ''}
            />
          </button>
        </div>
      </div>

      {/* Bottom Action Bar (Hover): Download, Edit, Animate/Extend, Clean, Add to project, More */}
      {status === 'done' && (
        <div
          className={`absolute bottom-0 inset-x-0 z-10 p-2 bg-gradient-to-t from-[var(--bg-2)] via-[var(--bg-2)]/90 to-transparent transition-opacity duration-150 flex items-center justify-between gap-1 ${
            isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAction?.('download')}
              title="Download"
              className="w-7 h-7 rounded-md bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              <Download size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onAction?.('edit')}
              title="Edit"
              className="w-7 h-7 rounded-md bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              <Edit2 size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onAction?.(item.type === 'video' ? 'extend' : 'animate')}
              title={item.type === 'video' ? 'Extend' : 'Animate'}
              className="w-7 h-7 rounded-md bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              <Sparkles size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onAction?.('clean')}
              title="Clean"
              className="w-7 h-7 rounded-md bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              <Eraser size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onAction?.('addToProject')}
              title="Add to project"
              className="w-7 h-7 rounded-md bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              <FolderPlus size={13} strokeWidth={1.75} />
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="More"
              className="w-7 h-7 rounded-md bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              <MoreVertical size={13} strokeWidth={1.75} />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 bottom-full mb-1 w-36 py-1 rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-strong)] shadow-[var(--shadow-popover)] z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onAction?.('reusePrompt');
                  }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
                >
                  Reuse prompt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenDetails?.();
                  }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
                >
                  Open details
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onAction?.('delete');
                  }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--danger)] hover:bg-[var(--danger-soft)] cursor-pointer"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
