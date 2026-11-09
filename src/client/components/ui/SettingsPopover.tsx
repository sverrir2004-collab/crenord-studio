import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Sliders, Volume2, VolumeX } from 'lucide-react';
import { Segmented } from './Segmented.tsx';

export interface SettingsState {
  format: 'Auto' | '1:1' | '4:5' | '9:16' | '16:9' | '3:4' | string;
  resolution: '720p' | '1080p' | '2K' | '4K' | string;
  quality: 'Standard' | 'High';
  duration: '5s' | '10s' | '15s' | string;
  audio: boolean;
  seed: string;
}

export interface SettingsPopoverProps {
  settings: SettingsState;
  onChange: (settings: SettingsState) => void;
  onClose: () => void;
  isVideo?: boolean;
  modelResolutions?: string[];
}

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({
  settings,
  onChange,
  onClose,
  isVideo = false,
  modelResolutions = [],
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const formats: SettingsState['format'][] = ['Auto', '1:1', '4:5', '9:16', '16:9', '3:4'];

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    onChange({ ...settings, [key]: value });
  };

  // Derive visible resolution buttons from modelResolutions
  const getVisibleResolutions = (): Array<{ value: string; label: string }> => {
    if (!modelResolutions || modelResolutions.length === 0) return [];

    const lowerResolutions = modelResolutions.map((r) => r.toLowerCase());

    if (!isVideo) {
      // Image resolution buttons: 1K, 2K, 4K
      const options: Array<{ value: string; label: string }> = [];
      const has1K =
        lowerResolutions.includes('1k') ||
        lowerResolutions.includes('auto_1k') ||
        lowerResolutions.includes('square_hd');
      const has2K =
        lowerResolutions.includes('2k') ||
        lowerResolutions.includes('auto_2k');
      const has4K =
        lowerResolutions.includes('4k') ||
        lowerResolutions.includes('auto_4k');

      if (has1K) options.push({ value: '1K', label: '1K' });
      if (has2K) options.push({ value: '2K', label: '2K' });
      if (has4K) options.push({ value: '4K', label: '4K' });

      // If model has no resolution choices (e.g. only 1 fixed resolution or none)
      if (options.length <= 1) return [];
      return options;
    } else {
      // Video resolution buttons: 480p, 720p, 1080p
      const options: Array<{ value: string; label: string }> = [];
      const has480 = lowerResolutions.some((r) => r.includes('480'));
      const has720 = lowerResolutions.some((r) => r.includes('720') || r.includes('768'));
      const has1080 = lowerResolutions.some((r) => r.includes('1080'));
      const has2k = lowerResolutions.some((r) => r.includes('1440') || r === '2k');
      const has4k = lowerResolutions.some((r) => r.includes('2160') || r.includes('4k'));

      if (has480) options.push({ value: '480p', label: '480p' });
      if (has720) options.push({ value: '720p', label: '720p' });
      if (has1080) options.push({ value: '1080p', label: '1080p' });
      if (has2k) options.push({ value: '2k', label: '2K' });
      if (has4k) options.push({ value: '4k', label: '4K' });

      if (options.length <= 1) return [];
      return options;
    }
  };

  const visibleResolutions = getVisibleResolutions();

  return (
    <div
      className="w-[340px] max-h-[min(520px,calc(100vh-120px))] overflow-y-auto bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-cards)] shadow-[var(--shadow-popover)] p-4 space-y-4 z-50 animate-in fade-in zoom-in-95 duration-180"
      role="dialog"
      aria-label="Generation Settings"
    >
      <div className="sticky -top-4 -mx-4 px-4 pt-1 pb-2 bg-[var(--bg-2)] border-b border-[var(--border-subtle)] flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Sliders size={16} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
          <span className="type-h3 text-[var(--text-primary)]">Settings</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          Done
        </button>
      </div>

      {/* Format / Aspect Ratio Pills */}
      <div>
        <label className="block type-caption uppercase tracking-wider text-[var(--text-tertiary)] font-semibold text-[11px] mb-2">
          ASPECT RATIO
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {formats.map((fmt) => {
            const isSelected = settings.format === fmt;
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => updateSetting('format', fmt)}
                className={`h-8 rounded-full text-[12px] font-medium border transition-colors cursor-pointer tabular-nums ${
                  isSelected
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                    : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                }`}
              >
                {fmt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution Row: shown only if model has resolution choices */}
      {visibleResolutions.length > 0 && (
        <div>
          <label className="block type-caption uppercase tracking-wider text-[var(--text-tertiary)] font-semibold text-[11px] mb-2">
            RESOLUTION
          </label>
          <Segmented
            options={visibleResolutions}
            value={settings.resolution}
            onChange={(val) => updateSetting('resolution', val as SettingsState['resolution'])}
            className="w-full flex justify-between"
            size="sm"
          />
        </div>
      )}

      {/* Quality (Image) or Duration + Audio (Video) */}
      {!isVideo ? (
        <div>
          <label className="block type-caption uppercase tracking-wider text-[var(--text-tertiary)] font-semibold text-[11px] mb-2">
            QUALITY
          </label>
          <Segmented
            options={[
              { value: 'Standard', label: 'Standard' },
              { value: 'High', label: 'High Detail' },
            ]}
            value={settings.quality}
            onChange={(val) => updateSetting('quality', val as SettingsState['quality'])}
            className="w-full flex justify-between"
            size="sm"
          />
        </div>
      ) : (
        <>
          <div>
            <label className="block type-caption uppercase tracking-wider text-[var(--text-tertiary)] font-semibold text-[11px] mb-2">
              DURATION
            </label>
            <Segmented
              options={[
                { value: '5s', label: '5 sec' },
                { value: '10s', label: '10 sec' },
                { value: '15s', label: '15 sec' },
              ]}
              value={settings.duration}
              onChange={(val) => updateSetting('duration', val as SettingsState['duration'])}
              className="w-full flex justify-between"
              size="sm"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {settings.audio ? (
                <Volume2 size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
              ) : (
                <VolumeX size={16} strokeWidth={1.75} className="text-[var(--text-tertiary)]" />
              )}
              <span className="text-[13px] text-[var(--text-primary)] font-medium">Generate Audio</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.audio}
              onClick={() => updateSetting('audio', !settings.audio)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                settings.audio ? 'bg-[var(--accent)]' : 'bg-[var(--bg-4)]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.audio ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </>
      )}

      {/* Collapsible Advanced Settings */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center justify-between w-full text-left text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <span>Advanced</span>
          {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-2 animate-in fade-in duration-150">
            <div>
              <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                Seed (optional)
              </label>
              <input
                type="text"
                placeholder="Random"
                value={settings.seed}
                onChange={(e) => updateSetting('seed', e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full h-8 px-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] tabular-nums"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
