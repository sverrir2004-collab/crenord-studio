import React, { useState, useEffect } from 'react';
import { Search, Check, Sparkles, Image as ImageIcon, Film, Eraser, Lock } from 'lucide-react';
import { Badge } from './Badge.tsx';
import { fetchWithAuth } from '../../lib/firebase.ts';

export interface ModelOption {
  key: string;
  tool: string;
  label: string;
  group: 'Image' | 'Video' | 'Clean' | 'Voice';
  badge: string;
  mode: 'draft' | 'final';
  unit: string;
  price: number;
  priceNote: string;
  enabled: boolean;
  commercialOk: boolean;
  endpoint?: string;
  inputKind?: 'text' | 'image' | 'both' | 'video' | 'audio';
  resolutions?: string[];
  formats?: string[];
  maxDuration?: number;
}

export interface ModelPickerProps {
  selectedModelKey: string;
  onSelectModel: (model: ModelOption) => void;
  onClose: () => void;
  tool?: string;
  toolGroup?: 'Image' | 'Video' | 'Clean';
  videoMode?: 'text' | 'image' | 'start-end' | 'text-to-video' | 'image-to-video';
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  selectedModelKey,
  onSelectModel,
  onClose,
  tool,
  toolGroup = 'Image',
  videoMode,
}) => {
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Target tool: default to tool prop or derive from toolGroup
  const effectiveTool =
    tool ||
    (toolGroup === 'Video'
      ? 'video.create'
      : toolGroup === 'Clean'
      ? 'image.clean'
      : 'image.create');

  useEffect(() => {
    let isMounted = true;
    const fetchModels = async () => {
      try {
        const url = effectiveTool ? `/api/models?tool=${encodeURIComponent(effectiveTool)}` : '/api/models';
        const res = await fetchWithAuth(url);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.models)) {
            setModels(data.models);
          }
        }
      } catch {
        // Fall back gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchModels();
    return () => {
      isMounted = false;
    };
  }, [effectiveTool]);

  // Filter models strictly by TOOL, plus videoMode if video.create, plus search
  const filteredModels = models.filter((m) => {
    // 1. Tool check
    if (effectiveTool && m.tool !== effectiveTool) return false;

    // 2. Video mode check
    if (effectiveTool === 'video.create' && videoMode) {
      const isTextMode = videoMode === 'text' || videoMode === 'text-to-video';
      const isImageMode = videoMode === 'image' || videoMode === 'image-to-video' || videoMode === 'start-end';
      if (isTextMode && !(m.inputKind === 'text' || m.inputKind === 'both')) {
        return false;
      }
      if (isImageMode && !(m.inputKind === 'image' || m.inputKind === 'both')) {
        return false;
      }
    }

    // 3. Search query
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      m.label.toLowerCase().includes(query) ||
      m.key.toLowerCase().includes(query) ||
      m.badge.toLowerCase().includes(query)
    );
  });

  // Group into 3 sections: "Draft - cheapest", "Final - best quality", "Not connected yet"
  const draftModels = filteredModels.filter((m) => m.enabled && m.mode === 'draft');
  const finalModels = filteredModels.filter((m) => m.enabled && m.mode === 'final');
  const notConnectedModels = filteredModels.filter((m) => !m.enabled);

  const getModelIcon = (group: string) => {
    switch (group) {
      case 'Video':
        return <Film size={16} strokeWidth={1.75} />;
      case 'Clean':
        return <Eraser size={16} strokeWidth={1.75} />;
      default:
        return <ImageIcon size={16} strokeWidth={1.75} />;
    }
  };

  const renderModelButton = (model: ModelOption) => {
    const isSelected = model.key === selectedModelKey;
    const isEnabled = model.enabled;

    return (
      <button
        key={model.key}
        type="button"
        disabled={!isEnabled}
        onClick={() => {
          if (isEnabled) {
            onSelectModel(model);
            onClose();
          }
        }}
        className={`w-full h-14 px-3 rounded-[var(--radius-buttons)] flex items-center justify-between text-left transition-colors duration-150 ${
          !isEnabled
            ? 'opacity-40 cursor-not-allowed bg-[var(--bg-1)]'
            : isSelected
            ? 'bg-[var(--bg-4)] border border-[var(--accent)]/50 cursor-pointer'
            : 'hover:bg-[var(--bg-3)] border border-transparent cursor-pointer'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
            {model.key.includes('draft') ? (
              <Sparkles size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
            ) : !isEnabled ? (
              <Lock size={15} strokeWidth={1.75} className="text-[var(--text-disabled)]" />
            ) : (
              getModelIcon(model.group)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                {model.label}
              </span>
              {isEnabled ? (
                <Badge variant={model.mode === 'draft' ? 'default' : 'accent'}>
                  {model.badge}
                </Badge>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-4)] border border-[var(--border-subtle)] text-[var(--text-disabled)]">
                  Not connected yet
                </span>
              )}
            </div>
            <p className="type-caption text-[var(--text-secondary)] truncate">
              {isEnabled ? model.priceNote : 'Schema verification pending'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-[12px] tabular-nums font-medium text-[var(--text-tertiary)]">
            ${model.price.toFixed(3)}
          </span>
          {isSelected && (
            <Check size={16} strokeWidth={2.5} className="text-[var(--accent)]" />
          )}
        </div>
      </button>
    );
  };

  return (
    <div
      className="w-[380px] bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-cards)] shadow-[var(--shadow-popover)] overflow-hidden flex flex-col z-50 animate-in fade-in zoom-in-95 duration-180"
      role="dialog"
      aria-label="Model Picker"
    >
      {/* Search Header */}
      <div className="p-3 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-2)]">
        <div className="relative flex items-center">
          <Search size={16} strokeWidth={1.75} className="absolute left-3 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search AI models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full h-9 pl-9 pr-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Model List: 3 sections (Draft - cheapest, Final - best quality, Not connected yet) */}
      <div className="max-h-[min(420px,calc(100vh-140px))] overflow-y-auto p-2 space-y-3">
        {loading ? (
          <div className="p-6 text-center text-[var(--text-secondary)] text-[13px]">
            Loading registered models...
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="p-6 text-center text-[var(--text-secondary)] text-[13px]">
            No models found matching "{search}"
          </div>
        ) : (
          <>
            {/* Section 1: Draft - cheapest */}
            {draftModels.length > 0 && (
              <div className="space-y-1">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Draft - cheapest
                </div>
                {draftModels.map(renderModelButton)}
              </div>
            )}

            {/* Section 2: Final - best quality */}
            {finalModels.length > 0 && (
              <div className="space-y-1">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Final - best quality
                </div>
                {finalModels.map(renderModelButton)}
              </div>
            )}

            {/* Section 3: Not connected yet */}
            {notConnectedModels.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                  Not connected yet
                </div>
                {notConnectedModels.map(renderModelButton)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
