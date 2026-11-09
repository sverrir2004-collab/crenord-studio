import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Edit2,
  Sparkles,
  Eraser,
  FolderPlus,
  Trash2,
  Film,
  Image as ImageIcon,
  RotateCcw,
  Volume2,
  Mic,
} from 'lucide-react';
import { MediaItem } from '../../types/media.ts';
import { Button } from './Button.tsx';

export interface DetailsDrawerProps {
  item: MediaItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAction?: (action: string, payload?: any) => void;
}

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
  item,
  isOpen,
  onClose,
  onAction,
}) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(item.prompt || '');
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const downloadFormats =
    item.type === 'video' ? ['mp4', 'gif', 'webm'] : ['png', 'jpg', 'webp'];

  return (
    <>
      {/* Backdrop for closing */}
      <div
        className="fixed inset-0 z-40 bg-[var(--modal-backdrop)] transition-opacity duration-240"
        onClick={onClose}
      />

      {/* Drawer Body (440px right side, slides in 240ms) */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[440px] bg-[var(--bg-1)] border-l border-[var(--border-subtle)] shadow-[var(--shadow-popover)] flex flex-col overflow-hidden transition-transform duration-240 ease-out animate-in slide-in-from-right"
        role="dialog"
        aria-label="Asset details"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="type-h3 text-[var(--text-primary)]">Details</span>
            <span className="text-[12px] px-2 py-0.5 rounded-full bg-[var(--bg-3)] text-[var(--text-secondary)] font-medium">
              {item.type.toUpperCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details drawer"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Media Preview Box (dark gradient tile) */}
          <div
            className="relative w-full aspect-square rounded-[var(--radius-cards)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center"
            style={{ background: item.gradient }}
          >
            {item.url ? (
              item.type === 'video' ? (
                <video
                  src={item.url}
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : item.type === 'audio' ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[var(--bg-3)] gap-4">
                  <div className="w-16 h-16 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] border border-[var(--accent)]/30">
                    <Mic size={32} />
                  </div>
                  <div className="text-center">
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                      {item.title}
                    </div>
                    <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                      {item.metadata?.voice ? `Voice: ${item.metadata.voice}` : 'Audio Track'}
                    </div>
                  </div>
                  <audio src={item.url} controls className="w-full max-w-xs mt-2" />
                </div>
              ) : (
                <img
                  src={item.url}
                  alt={item.title || 'Asset preview'}
                  className="w-full h-full object-cover"
                />
              )
            ) : (
              <div className="text-[var(--text-secondary)] opacity-30">
                {item.type === 'video' ? (
                  <Film size={64} strokeWidth={1.5} />
                ) : (
                  <ImageIcon size={64} strokeWidth={1.5} />
                )}
              </div>
            )}
            {item.duration && (
              <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-[var(--bg-2)]/90 border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] tabular-nums">
                {item.duration}
              </span>
            )}
          </div>

          {/* Prompt Section with copy */}
          <div className="rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-subtle)] p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="type-caption uppercase tracking-wider text-[var(--text-tertiary)] font-semibold text-[11px]">
                PROMPT
              </span>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {copiedPrompt ? (
                  <>
                    <Check size={13} className="text-[var(--success)]" />
                    <span className="text-[var(--success)]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--text-primary)] select-text">
              {item.prompt}
            </p>
          </div>

          {/* Key-Value Details Rows */}
          <div className="space-y-3 divide-y divide-[var(--border-subtle)] text-[13px]">
            <div className="flex items-center justify-between pt-1">
              <span className="text-[var(--text-secondary)]">Model</span>
              <span className="font-medium text-[var(--text-primary)]">{item.model}</span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-[var(--text-secondary)]">Format / Aspect</span>
              <span className="font-medium text-[var(--text-primary)] tabular-nums">{item.format}</span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-[var(--text-secondary)]">Resolution</span>
              <span className="font-medium text-[var(--text-primary)] tabular-nums">{item.resolution}</span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-[var(--text-secondary)]">Created</span>
              <span className="font-medium text-[var(--text-primary)]">{item.createdAt}</span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-[var(--text-secondary)]">Estimated Cost</span>
              <span className="font-medium text-[var(--accent)] tabular-nums">
                {item.cost != null ? `$${item.cost.toFixed(3)}` : '—'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2.5">
            <Button
              variant="secondary"
              size={40}
              className="w-full justify-start"
              icon={<RotateCcw size={16} strokeWidth={1.75} />}
              onClick={() => onAction?.('reuseSettings', item)}
            >
              Reuse settings
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size={40}
                icon={<Edit2 size={16} strokeWidth={1.75} />}
                onClick={() => onAction?.('edit', item)}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                size={40}
                icon={<Sparkles size={16} strokeWidth={1.75} />}
                onClick={() => onAction?.(item.type === 'video' ? 'extend' : 'animate', item)}
              >
                {item.type === 'video' ? 'Extend' : 'Animate'}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size={40}
                icon={<Eraser size={16} strokeWidth={1.75} />}
                onClick={() => onAction?.('clean', item)}
              >
                Clean
              </Button>
              <Button
                variant="secondary"
                size={40}
                icon={<FolderPlus size={16} strokeWidth={1.75} />}
                onClick={() => onAction?.('addToProject', item)}
              >
                Add to project
              </Button>
            </div>

            {item.type === 'video' && (
              <Button
                variant="secondary"
                size={40}
                className="w-full"
                icon={<Volume2 size={16} strokeWidth={1.75} />}
                onClick={() => onAction?.('addSound', item)}
              >
                Add sound to video
              </Button>
            )}

            {/* Download Menu */}
            <div className="relative">
              <Button
                variant="primary"
                size={40}
                className="w-full"
                icon={<Download size={16} strokeWidth={1.75} />}
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              >
                Download
              </Button>
              {showDownloadMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-buttons)] shadow-[var(--shadow-popover)] z-20 flex gap-1 justify-center">
                  {downloadFormats.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => {
                        setShowDownloadMenu(false);
                        onAction?.('download', { item, format: fmt });
                      }}
                      className="px-3 py-1.5 text-[12px] font-medium uppercase rounded hover:bg-[var(--bg-3)] text-[var(--text-primary)] cursor-pointer"
                    >
                      .{fmt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="danger"
              size={40}
              className="w-full"
              icon={<Trash2 size={16} strokeWidth={1.75} />}
              onClick={() => onAction?.('delete', item)}
            >
              Delete asset
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};
