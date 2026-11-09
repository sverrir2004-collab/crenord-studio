import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, X, Download, Film, RotateCcw } from 'lucide-react';

export interface AudioMiniPlayerProps {
  item: {
    id: string;
    url: string;
    title?: string;
    voice?: string;
    model?: string;
    duration?: number;
  } | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
  onUseInVideo?: () => void;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}

export const AudioMiniPlayer: React.FC<AudioMiniPlayerProps> = ({
  item,
  isPlaying,
  onTogglePlay,
  onClose,
  onUseInVideo,
  audioRef,
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef?.current;
    if (!el) return;

    const handleTimeUpdate = () => {
      setCurrentTime(el.currentTime || 0);
      if (el.duration && !isNaN(el.duration) && el.duration !== Infinity) {
        setDuration(el.duration);
      }
    };

    const handleLoadedMetadata = () => {
      if (el.duration && !isNaN(el.duration) && el.duration !== Infinity) {
        setDuration(el.duration);
      }
    };

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [audioRef, item?.url]);

  if (!item) return null;

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef?.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-1)] border-t border-[var(--border-strong)] px-4 sm:px-6 py-2.5 shadow-2xl animate-in slide-in-from-bottom duration-200">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Track Information */}
        <div className="flex items-center gap-3 min-w-0 w-1/4">
          <div className="w-9 h-9 rounded-lg bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)] shrink-0 relative overflow-hidden">
            <Volume2 size={16} />
            {isPlaying && (
              <span className="absolute bottom-1 w-2 h-0.5 bg-[var(--accent)] rounded-full animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-tight">
              {item.title || item.voice || 'Studio Audio'}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)] truncate">
              {item.voice ? `Voice: ${item.voice}` : item.model || 'CRENORD Audio'}
            </p>
          </div>
        </div>

        {/* Center: Play Controls & Timeline */}
        <div className="flex-1 max-w-xl flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-8 h-8 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
            </button>
          </div>

          {/* Timeline and time indicator */}
          <div className="w-full flex items-center gap-2.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">
            <span className="w-8 text-right text-[var(--text-secondary)]">{formatTime(currentTime)}</span>
            <div className="relative flex-1 flex items-center h-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-[var(--bg-3)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${progressPercent}%, var(--bg-3) ${progressPercent}%, var(--bg-3) 100%)`,
                }}
              />
            </div>
            <span className="w-8">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Actions & Close */}
        <div className="flex items-center justify-end gap-2 w-1/4 shrink-0">
          {onUseInVideo && (
            <button
              type="button"
              onClick={onUseInVideo}
              className="px-2.5 py-1 bg-[var(--bg-3)] hover:bg-[var(--bg-4)] text-[var(--text-primary)] text-[11px] font-medium rounded-[var(--radius-buttons)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all cursor-pointer flex items-center gap-1.5"
              title="Add sound to video"
            >
              <Film size={13} className="text-[var(--accent)]" />
              <span className="hidden sm:inline">Use in video</span>
            </button>
          )}

          <a
            href={item.url}
            download={`crenord_${item.id || 'audio'}.mp3`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] transition-colors"
            title="Download audio"
          >
            <Download size={15} />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] transition-colors cursor-pointer"
            title="Close player"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
