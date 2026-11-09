import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  AtSign,
  Sparkles,
  Sliders,
  ArrowUp,
  Minus,
} from 'lucide-react';
import { Chip } from './Chip.tsx';
import { Segmented } from './Segmented.tsx';
import { ModelPicker, ModelOption } from './ModelPicker.tsx';
import { SettingsPopover, SettingsState } from './SettingsPopover.tsx';
import { CostBanner } from './CostBanner.tsx';
import { fetchWithAuth } from '../../lib/firebase.ts';

export interface PromptBarSubmitPayload {
  prompt: string;
  modelKey: string;
  modelLabel: string;
  mode: 'draft' | 'final';
  variants: number;
  settings: SettingsState;
}

export interface PromptBarProps {
  isCentered?: boolean;
  defaultTool?: 'Image' | 'Video' | 'Clean';
  tool?: string;
  videoMode?: 'text' | 'image' | 'start-end' | 'text-to-video' | 'image-to-video';
  onSubmit?: (payload: PromptBarSubmitPayload) => void;
  pageExtras?: React.ReactNode;
  initialPrompt?: string;
  isCostBlocked?: boolean;
  costBlockedMessage?: string;
  errorMessage?: string | null;
  currentMode?: 'draft' | 'final';
  onModeChange?: (mode: 'draft' | 'final') => void;
}

export const PromptBar: React.FC<PromptBarProps> = ({
  isCentered = false,
  defaultTool = 'Image',
  tool,
  videoMode,
  onSubmit,
  pageExtras,
  initialPrompt = '',
  isCostBlocked = false,
  costBlockedMessage,
  errorMessage,
  currentMode,
  onModeChange,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<'draft' | 'final'>(currentMode || 'draft');
  const [variants, setVariants] = useState<number>(1);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Available models from /api/models
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelOption>({
    key: 'img_draft',
    tool: 'image.create',
    label: 'Seedream 5.0 Lite',
    group: 'Image',
    badge: 'Draft',
    mode: 'draft',
    unit: 'image',
    price: 0.035,
    priceNote: '$0.035 per image',
    enabled: true,
    commercialOk: true,
    resolutions: ['auto_2K', 'square_hd', 'portrait_4_3', 'landscape_4_3', 'portrait_16_9', 'landscape_16_9'],
    formats: ['jpeg', 'png'],
  });

  const [settings, setSettings] = useState<SettingsState>({
    format: 'Auto',
    resolution: defaultTool === 'Video' ? '720p' : '2K',
    quality: 'Standard',
    duration: '5s',
    audio: false,
    seed: '',
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const modelPortalRef = useRef<HTMLDivElement>(null);
  const settingsPortalRef = useRef<HTMLDivElement>(null);

  const [modelCoords, setModelCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const [settingsCoords, setSettingsCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const updateModelCoords = useCallback(() => {
    if (!modelPickerRef.current) return;
    const rect = modelPickerRef.current.getBoundingClientRect();
    const popoverHeight = 440;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDown = isCentered || (spaceBelow >= popoverHeight || spaceBelow > spaceAbove);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - 380 - 16));

    if (openDown) {
      setModelCoords({ top: rect.bottom + 8, left });
    } else {
      setModelCoords({ bottom: window.innerHeight - rect.top + 8, left });
    }
  }, [isCentered]);

  const updateSettingsCoords = useCallback(() => {
    if (!settingsRef.current) return;
    const rect = settingsRef.current.getBoundingClientRect();
    const popoverHeight = 440;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDown = isCentered || (spaceBelow >= popoverHeight || spaceBelow > spaceAbove);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - 340 - 16));

    if (openDown) {
      setSettingsCoords({ top: rect.bottom + 8, left });
    } else {
      setSettingsCoords({ bottom: window.innerHeight - rect.top + 8, left });
    }
  }, [isCentered]);

  useEffect(() => {
    if (showModelPicker) {
      updateModelCoords();
      window.addEventListener('resize', updateModelCoords);
      window.addEventListener('scroll', updateModelCoords, true);
      return () => {
        window.removeEventListener('resize', updateModelCoords);
        window.removeEventListener('scroll', updateModelCoords, true);
      };
    }
  }, [showModelPicker, updateModelCoords]);

  useEffect(() => {
    if (showSettings) {
      updateSettingsCoords();
      window.addEventListener('resize', updateSettingsCoords);
      window.addEventListener('scroll', updateSettingsCoords, true);
      return () => {
        window.removeEventListener('resize', updateSettingsCoords);
        window.removeEventListener('scroll', updateSettingsCoords, true);
      };
    }
  }, [showSettings, updateSettingsCoords]);

  // Sync mode with parent if controlled
  useEffect(() => {
    if (currentMode && currentMode !== mode) {
      setMode(currentMode);
    }
  }, [currentMode]);

  // Load models from server
  useEffect(() => {
    let isMounted = true;
    const loadModels = async () => {
      try {
        const res = await fetchWithAuth('/api/models');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.models)) {
            setModels(data.models);
            // Default model for tool
            if (defaultTool === 'Video') {
              const draftVid = data.models.find(
                (m: ModelOption) => m.tool === 'video.create' && m.key === 'vid_draft' && m.enabled
              );
              if (draftVid) {
                setSelectedModel(draftVid);
              }
            } else {
              const draftModel = data.models.find(
                (m: ModelOption) => m.tool === 'image.create' && m.key === 'img_draft' && m.enabled
              );
              if (draftModel && mode === 'draft') {
                setSelectedModel(draftModel);
              }
            }
          }
        }
      } catch {
        // Fall back gracefully
      }
    };
    loadModels();
    return () => {
      isMounted = false;
    };
  }, [defaultTool]);

  // When mode changes, switch model appropriately
  const handleModeToggle = (newMode: 'draft' | 'final') => {
    setMode(newMode);
    onModeChange?.(newMode);

    if (defaultTool === 'Video') {
      if (newMode === 'draft') {
        const draft = models.find((m) => m.key === 'vid_draft') || {
          key: 'vid_draft',
          tool: 'video.create',
          label: 'HappyHorse (Draft)',
          group: 'Video',
          badge: 'Draft',
          mode: 'draft',
          unit: 'second',
          price: 0.14,
          priceNote: '$0.14 per second',
          enabled: true,
          commercialOk: true,
        };
        setSelectedModel(draft);
      } else {
        const pro = models.find((m) => m.group === 'Video' && m.key === 'vid_seedance_20_fast' && m.enabled) ||
          models.find((m) => m.group === 'Video' && m.mode === 'final' && m.enabled) ||
          selectedModel;
        setSelectedModel(pro);
      }
      return;
    }

    if (newMode === 'draft') {
      const draft = models.find((m) => m.key === 'img_draft') || {
        key: 'img_draft',
        tool: 'image.create',
        label: 'Seedream 5.0 Lite',
        group: 'Image',
        badge: 'Draft',
        mode: 'draft',
        unit: 'image',
        price: 0.035,
        priceNote: '$0.035 per image',
        enabled: true,
        commercialOk: true,
      };
      setSelectedModel(draft);
    } else {
      // In final mode, default to Seedream 5.0 Pro (img_pro)
      const pro = models.find((m) => m.key === 'img_pro' && m.enabled) ||
        models.find((m) => m.mode === 'final' && m.enabled) ||
        selectedModel;
      setSelectedModel(pro);
    }
  };

  // Auto-grow textarea between 1 and 8 lines
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 8 * 24;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 24), maxHeight)}px`;
    }
  }, [prompt]);

  // Handle outside clicks and Escape key for popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        modelPickerRef.current &&
        !modelPickerRef.current.contains(target) &&
        modelPortalRef.current &&
        !modelPortalRef.current.contains(target)
      ) {
        setShowModelPicker(false);
      }
      if (
        settingsRef.current &&
        !settingsRef.current.contains(target) &&
        settingsPortalRef.current &&
        !settingsPortalRef.current.contains(target)
      ) {
        setShowSettings(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModelPicker(false);
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Compute live estimated cost from model price in registry
  const isVideoTool = defaultTool === 'Video' || selectedModel.group === 'Video' || selectedModel.unit === 'second';
  let liveCostRate = selectedModel.price;

  if (isVideoTool) {
    if (selectedModel.key.includes('happy_horse') || selectedModel.key === 'vid_draft') {
      liveCostRate = settings.resolution === '1080p' ? 0.28 : 0.14;
    } else if (selectedModel.key.includes('seedance_25')) {
      liveCostRate = settings.resolution === '480p' ? 0.2205 : settings.resolution === '1080p' ? 1.164 : 0.4730;
    } else if (selectedModel.key.includes('seedance_20')) {
      liveCostRate = 0.2419;
    }
  }

  const durationSec = isVideoTool ? (parseInt(settings.duration, 10) || 5) : 1;
  const liveCost = (isVideoTool ? (liveCostRate * durationSec) : (liveCostRate * variants)).toFixed(3);
  const isReadyToSend = prompt.trim().length > 0 && !isCostBlocked;

  const handleSend = () => {
    if (!isReadyToSend) return;
    onSubmit?.({
      prompt: prompt.trim(),
      modelKey: selectedModel.key,
      modelLabel: selectedModel.label,
      mode,
      variants,
      settings,
    });
    setPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEnhance = () => {
    if (!prompt.trim()) return;
    setIsEnhancing(true);
    setTimeout(() => {
      setPrompt((prev) => `${prev.trim()}, 8k studio lighting, cinematic hyper-detailed shot, editorial commercial aesthetic`);
      setIsEnhancing(false);
    }, 300);
  };

  return (
    <div
      className={`z-30 transition-[left] duration-200 ${
        isCentered
          ? 'relative w-full max-w-[920px] mx-auto px-4 md:px-0'
          : 'fixed bottom-20 md:bottom-6 left-0 md:left-[var(--sidebar-width,264px)] right-0 px-4 md:px-8 flex flex-col items-center pointer-events-none'
      }`}
    >
      <div className="w-full max-w-[920px] pointer-events-auto space-y-2">
        {/* Cost banner if cost guard blocks */}
        {isCostBlocked && (
          <CostBanner message={costBlockedMessage} />
        )}

        {/* Inline error message (e.g. model needs start image) */}
        {errorMessage && (
          <div className="p-3.5 rounded-[var(--radius-buttons)] bg-[var(--danger-soft)] border border-[var(--danger)] text-[13px] text-[var(--danger)] font-medium flex items-center justify-between shadow-sm animate-fade-in">
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Signature PromptBar Container */}
        <div className="relative rounded-[var(--radius-prompt-bar)] bg-[var(--bg-2)] border border-[var(--border-subtle)] shadow-[var(--shadow-prompt-bar)] px-5 py-4 transition-all duration-150 focus-within:border-[rgba(61,107,255,0.5)]">
          {/* Auto-growing Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              defaultTool === 'Video'
                ? 'Describe the video you want to generate...'
                : 'Describe what you want to create or edit...'
            }
            className="w-full bg-transparent resize-none text-[16px] leading-[24px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none scrollbar-none"
          />

          {/* Controls Row (44px high) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 h-auto min-h-[44px]">
            {/* Left Tools: Attach (+), Mention (@), Divider, Model, Settings, PageExtras */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                aria-label="Attach reference image"
                title="Attach reference"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] border border-transparent hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                <Plus size={18} strokeWidth={1.75} />
              </button>

              <button
                type="button"
                aria-label="Mention asset from library"
                title="Mention asset (@)"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] border border-transparent hover:border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                <AtSign size={16} strokeWidth={1.75} />
              </button>

              <div className="w-[1px] h-5 bg-[var(--border-subtle)] mx-1" />

              {/* Model Chip */}
              <div className="relative" ref={modelPickerRef}>
                <Chip
                  hasChevron
                  selected={showModelPicker}
                  onClick={() => setShowModelPicker(!showModelPicker)}
                >
                  {selectedModel.label}
                </Chip>
              </div>

              {/* Settings Chip */}
              <div className="relative" ref={settingsRef}>
                <Chip
                  icon={<Sliders size={14} strokeWidth={1.75} />}
                  hasChevron
                  selected={showSettings}
                  onClick={() => setShowSettings(!showSettings)}
                >
                  Settings
                </Chip>
              </div>

              {pageExtras}
            </div>

            {/* Right Controls: Draft|Final, Enhance, Variants Stepper, Cost Label, Send Button */}
            <div className="flex items-center gap-2.5 ml-auto">
              {/* Draft | Final Segmented Control */}
              <Segmented
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'final', label: 'Final' },
                ]}
                value={mode}
                onChange={(val) => handleModeToggle(val as 'draft' | 'final')}
                size="sm"
              />

              {/* Enhance Prompt (Sparkles) */}
              <button
                type="button"
                aria-label="Enhance prompt with AI"
                title="Enhance prompt"
                onClick={handleEnhance}
                disabled={!prompt.trim() || isEnhancing}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-3)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <Sparkles
                  size={15}
                  strokeWidth={1.75}
                  className={isEnhancing ? 'animate-spin text-[var(--accent)]' : ''}
                />
              </button>

              {/* Variants Stepper (x1 to x4) */}
              <div className="inline-flex items-center h-8 bg-[var(--bg-3)] border border-[var(--border-subtle)] rounded-full px-1.5 gap-1">
                <button
                  type="button"
                  aria-label="Decrease variants"
                  disabled={variants <= 1}
                  onClick={() => setVariants((v) => Math.max(1, v - 1))}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                >
                  <Minus size={11} strokeWidth={2} />
                </button>
                <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums px-1">
                  x{variants}
                </span>
                <button
                  type="button"
                  aria-label="Increase variants"
                  disabled={variants >= 4}
                  onClick={() => setVariants((v) => Math.min(4, v + 1))}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                >
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>

              {/* Live Cost Label from GET /api/models */}
              <span className="type-caption font-medium text-[var(--text-tertiary)] tabular-nums px-1" title="Estimated cost based on registry unit price">
                ≈ ${liveCost}
              </span>

              {/* 44px Round Send Button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={!isReadyToSend}
                aria-label="Generate media"
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 select-none ${
                  isReadyToSend
                    ? 'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] shadow-md cursor-pointer'
                    : 'bg-[var(--bg-4)] text-[var(--text-disabled)] cursor-not-allowed opacity-60'
                }`}
              >
                <ArrowUp size={20} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Portaled ModelPicker */}
      {showModelPicker && modelCoords && createPortal(
        <div
          ref={modelPortalRef}
          style={{
            position: 'fixed',
            left: `${modelCoords.left}px`,
            ...(modelCoords.top !== undefined ? { top: `${modelCoords.top}px` } : { bottom: `${modelCoords.bottom}px` }),
            zIndex: 99999,
          }}
        >
          <ModelPicker
            selectedModelKey={selectedModel.key}
            tool={tool || (defaultTool === 'Video' ? 'video.create' : defaultTool === 'Clean' ? 'image.clean' : 'image.create')}
            videoMode={videoMode}
            onSelectModel={(m) => {
              setSelectedModel(m);
              const mRes = m.resolutions || [];
              if (mRes.length > 0) {
                const lower = mRes.map((r) => r.toLowerCase());
                if (defaultTool === 'Video' || m.group === 'Video') {
                  if (settings.resolution === '1080p' && !lower.some((r) => r.includes('1080'))) {
                    setSettings((prev) => ({ ...prev, resolution: '720p' }));
                  }
                } else {
                  if (settings.resolution === '4K' && !lower.includes('4k') && !lower.includes('auto_4k')) {
                    setSettings((prev) => ({ ...prev, resolution: '2K' }));
                  }
                }
              }
            }}
            onClose={() => setShowModelPicker(false)}
          />
        </div>,
        document.body
      )}

      {/* Portaled SettingsPopover */}
      {showSettings && settingsCoords && createPortal(
        <div
          ref={settingsPortalRef}
          style={{
            position: 'fixed',
            left: `${settingsCoords.left}px`,
            ...(settingsCoords.top !== undefined ? { top: `${settingsCoords.top}px` } : { bottom: `${settingsCoords.bottom}px` }),
            zIndex: 99999,
          }}
        >
          <SettingsPopover
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
            isVideo={defaultTool === 'Video' || selectedModel.group === 'Video'}
            modelResolutions={selectedModel.resolutions || []}
          />
        </div>,
        document.body
      )}
    </div>
  );
};
