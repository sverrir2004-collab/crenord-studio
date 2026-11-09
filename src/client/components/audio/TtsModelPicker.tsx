import React, { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { TTS_MODELS, ttsModelInfo } from '../../lib/ttsModels.ts';

/**
 * Model gallery for text to speech. Shows the chosen model as a card; opening it lists every model
 * grouped by company with price, language support and what it is good at.
 */
export const TtsModelPicker: React.FC<{ value: string; onChange: (key: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const cur = ttsModelInfo(value);
  const providers = Array.from(new Set(TTS_MODELS.map((m) => m.provider)));

  const price = (m: (typeof TTS_MODELS)[number]) =>
    m.perSecond ? `$${m.per1k.toFixed(3)}/sec` : `$${(m.per1k * 1).toFixed(m.per1k < 0.02 ? 3 : 2)}/1k chars`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left p-3 bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-[var(--radius-buttons)] cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">{cur.provider}</div>
            <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{cur.name}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">{price(cur)}</span>
            <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{cur.tagline}</p>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-3xl max-h-[88vh] overflow-y-auto bg-[var(--bg-1)] border border-[var(--border-subtle)] rounded-t-2xl sm:rounded-[var(--radius-cards)] p-4 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Choose a voice model</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                <X size={18} />
              </button>
            </div>
            {providers.map((prov) => (
              <div key={prov} className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">{prov}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TTS_MODELS.filter((m) => m.provider === prov).map((m) => {
                    const sel = m.key === value;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => {
                          onChange(m.key);
                          setOpen(false);
                        }}
                        className={`text-left p-3 rounded-[var(--radius-buttons)] border cursor-pointer transition-all ${
                          sel
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                            : 'bg-[var(--bg-2)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{m.name}</span>
                          <span className="flex items-center gap-1.5">
                            {m.badge && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-3)] text-[var(--text-secondary)]">{m.badge}</span>
                            )}
                            {sel && <Check size={14} className="text-[var(--accent)]" />}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{m.tagline}</p>
                        <div className="flex items-center flex-wrap gap-1.5 mt-2">
                          <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">{price(m)}</span>
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                              m.swedish
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {m.swedish ? 'Swedish' : 'No Swedish'}
                          </span>
                          {m.tags.map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-3)] text-[var(--text-tertiary)]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
