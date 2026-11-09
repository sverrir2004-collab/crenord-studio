import React, { useState, useEffect, useMemo } from 'react';
import { Search, Play, Pause, Star, Check, X, Filter } from 'lucide-react';

export interface VoiceData {
  name: string;
  gender: 'Female' | 'Male' | 'Non-binary';
  style: string;
  accent: string;
  description: string;
  tags: string[];
}

export const VOICES_CATALOG: VoiceData[] = [
  { name: 'Rachel', gender: 'Female', style: 'Narration', accent: 'American', description: 'Calm, soothing and natural tone ideal for storytelling and explainers.', tags: ['Calm', 'Narration', 'Warm'] },
  { name: 'Aria', gender: 'Female', style: 'Commercial', accent: 'American', description: 'Expressive and energetic delivery suited for ads and social videos.', tags: ['Expressive', 'Commercial', 'Dynamic'] },
  { name: 'Roger', gender: 'Male', style: 'Conversational', accent: 'American', description: 'Confident, friendly and approachable voice for podcasts and casual ads.', tags: ['Confident', 'Conversational', 'Casual'] },
  { name: 'Sarah', gender: 'Female', style: 'News', accent: 'American', description: 'Soft, professional and articulate tone for news and presentations.', tags: ['Soft', 'News', 'Articulate'] },
  { name: 'Laura', gender: 'Female', style: 'Commercial', accent: 'American', description: 'Upbeat, youthful and engaging style for modern brands.', tags: ['Upbeat', 'Youthful', 'Social'] },
  { name: 'Charlie', gender: 'Male', style: 'Conversational', accent: 'Australian', description: 'Casual, down-to-earth Australian voice with natural pacing.', tags: ['Casual', 'Australian', 'Friendly'] },
  { name: 'George', gender: 'Male', style: 'Storytelling', accent: 'British', description: 'Warm, classic British narrative voice with rich timbre.', tags: ['Warm', 'British', 'Storytelling'] },
  { name: 'Callum', gender: 'Male', style: 'Cinematic', accent: 'American', description: 'Intense and dramatic character voice for trailers and gaming.', tags: ['Intense', 'Characters', 'Dramatic'] },
  { name: 'River', gender: 'Non-binary', style: 'Editorial', accent: 'American', description: 'Clean, confident and gender-neutral voice for editorial content.', tags: ['Confident', 'Editorial', 'Modern'] },
  { name: 'Liam', gender: 'Male', style: 'Social', accent: 'American', description: 'Energetic, modern American voice for social media and reels.', tags: ['Youthful', 'Social', 'Vlog'] },
  { name: 'Charlotte', gender: 'Female', style: 'Luxury', accent: 'Swedish / Euro', description: 'Elegant, poised European accent for luxury and fashion spots.', tags: ['Elegant', 'Luxury', 'Fashion'] },
  { name: 'Alice', gender: 'Female', style: 'Corporate', accent: 'British', description: 'Crisp, confident British corporate tone with executive polish.', tags: ['Corporate', 'British', 'Direct'] },
  { name: 'Matilda', gender: 'Female', style: 'Audiobooks', accent: 'American', description: 'Warm, pleasant voice perfect for long-form listening and audiobooks.', tags: ['Friendly', 'Audiobooks', 'Warm'] },
  { name: 'Will', gender: 'Male', style: 'Conversational', accent: 'American', description: 'Relaxed, friendly voice great for interviews and testimonials.', tags: ['Relaxed', 'Casual', 'Podcast'] },
  { name: 'Jessica', gender: 'Female', style: 'Commercial', accent: 'American', description: 'Bright, charming and upbeat voice for commercials and demos.', tags: ['Bright', 'Commercial', 'Promo'] },
  { name: 'Eric', gender: 'Male', style: 'Cinematic', accent: 'American', description: 'Deep, resonant movie-trailer style voice with dramatic punch.', tags: ['Deep', 'Trailer', 'Dramatic'] },
  { name: 'Chris', gender: 'Male', style: 'Conversational', accent: 'American', description: 'Natural and conversational everyday tone for tech explainers.', tags: ['Casual', 'Natural', 'Explainer'] },
  { name: 'Brian', gender: 'Male', style: 'Narration', accent: 'American', description: 'Deep, resonant documentary narrator with gravitas.', tags: ['Deep', 'Narration', 'Documentary'] },
  { name: 'Daniel', gender: 'Male', style: 'News', accent: 'British', description: 'Authoritative, clear British broadcast voice for announcements.', tags: ['Broadcast', 'British', 'Formal'] },
  { name: 'Lily', gender: 'Female', style: 'Narration', accent: 'British', description: 'Soft, gentle British voice ideal for mindfulness and poetry.', tags: ['Soothing', 'British', 'Warm'] },
  { name: 'Bill', gender: 'Male', style: 'Storytelling', accent: 'American', description: 'Wise, trustworthy and mature American voice for brand history.', tags: ['Trustworthy', 'Documentary', 'Mature'] },
  // MiniMax voices
  { name: 'Wise_Counselor', gender: 'Male', style: 'Narration', accent: 'MiniMax HD', description: 'Deep, wise and reassuring counselor voice with expressive emotion support.', tags: ['MiniMax', 'Expressive', 'Deep'] },
  { name: 'English_Wiselady', gender: 'Female', style: 'Conversational', accent: 'MiniMax HD', description: 'Eloquent, clear female voice for presentations and stories.', tags: ['MiniMax', 'Eloquent', 'Warm'] },
  { name: 'English_Deep-VoicedGentleman', gender: 'Male', style: 'Cinematic', accent: 'MiniMax HD', description: 'Resonant and commanding male voice for trailers and audiobooks.', tags: ['MiniMax', 'Commanding', 'Trailer'] },
  { name: 'Wise_Woman', gender: 'Female', style: 'Storytelling', accent: 'MiniMax HD', description: 'Warm, mature narrative voice with natural emotional cadence.', tags: ['MiniMax', 'Emotional', 'Narrator'] },
  // Google Gemini voices
  { name: 'Kore', gender: 'Female', style: 'Conversational', accent: 'Google Gemini', description: 'Natural, dynamic voice with full inline audio tag support.', tags: ['Gemini', 'Natural', 'Tags'] },
  { name: 'Puck', gender: 'Male', style: 'Conversational', accent: 'Google Gemini', description: 'Lively, friendly male voice with excellent inflection.', tags: ['Gemini', 'Friendly', 'Lively'] },
  { name: 'Fenrir', gender: 'Male', style: 'Cinematic', accent: 'Google Gemini', description: 'Authoritative and steady voice for long-form reading.', tags: ['Gemini', 'Authoritative', 'Deep'] },
  { name: 'Aoede', gender: 'Female', style: 'Commercial', accent: 'Google Gemini', description: 'Bright, polished vocal tone for announcements and media.', tags: ['Gemini', 'Bright', 'Clear'] },
  // Inworld voices
  { name: 'Craig (en)', gender: 'Male', style: 'Conversational', accent: 'Inworld', description: 'Ultra-low latency conversational voice for interactive agents.', tags: ['Inworld', 'Fast', 'Casual'] },
  { name: 'Edward (en)', gender: 'Male', style: 'News', accent: 'Inworld', description: 'Clear, articulate voice for snappy explainers and dialogues.', tags: ['Inworld', 'Articulate', 'News'] },
  // xAI voices
  { name: 'eve', gender: 'Female', style: 'Conversational', accent: 'xAI', description: 'Smooth, natural streaming-tag enabled conversational voice.', tags: ['xAI', 'Smooth', 'Modern'] },
  { name: 'sal', gender: 'Male', style: 'Conversational', accent: 'xAI', description: 'Energetic, modern delivery with fast response time.', tags: ['xAI', 'Energetic', 'Podcast'] },
];

export interface CustomVoiceItem {
  id: string;
  name: string;
  voiceId: string;
  provider?: string;
  source?: 'clone' | 'design' | string;
  createdAt?: string;
  audioUrl?: string;
}

export interface VoicePickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: string;
  onSelectVoice: (voiceName: string) => void;
  onPreviewVoice: (voiceName: string) => void;
  isPlayingPreview?: string | null;
  customVoices?: CustomVoiceItem[];
}

export const VoicePickerPopover: React.FC<VoicePickerPopoverProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
  onPreviewVoice,
  isPlayingPreview,
  customVoices = [],
}) => {
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'Female' | 'Male'>('all');
  const [styleFilter, setStyleFilter] = useState<string>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('crenord_favorite_voices');
      return saved ? JSON.parse(saved) : ['Rachel', 'George', 'Aria'];
    } catch {
      return ['Rachel', 'George', 'Aria'];
    }
  });

  const toggleFavorite = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = favorites.includes(name)
      ? favorites.filter((f) => f !== name)
      : [...favorites, name];
    setFavorites(updated);
    try {
      localStorage.setItem('crenord_favorite_voices', JSON.stringify(updated));
    } catch {}
  };

  const filteredVoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return VOICES_CATALOG.filter((voice) => {
      if (genderFilter !== 'all' && voice.gender !== genderFilter) return false;
      if (styleFilter !== 'all' && voice.style.toLowerCase() !== styleFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        voice.name.toLowerCase().includes(q) ||
        voice.description.toLowerCase().includes(q) ||
        voice.accent.toLowerCase().includes(q) ||
        voice.style.toLowerCase().includes(q) ||
        voice.tags.some((t) => t.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      const aFav = favorites.includes(a.name) ? 1 : 0;
      const bFav = favorites.includes(b.name) ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;
      return a.name.localeCompare(b.name);
    });
  }, [search, genderFilter, styleFilter, favorites]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-modals)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="type-h3 text-[var(--text-primary)] font-semibold">Select Voice</h3>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
              Choose from 20+ studio voice personalities
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-3.5 space-y-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-1)]">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, accent or style..."
              className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[13px] text-[var(--text-primary)] pl-9 pr-3 py-1.5 rounded-[var(--radius-inputs)] outline-hidden transition-all"
              autoFocus
            />
          </div>

          {/* Gender & Style Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-[11px]">
            <span className="text-[var(--text-tertiary)] font-medium shrink-0">Filter:</span>
            {(['all', 'Female', 'Male'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenderFilter(g)}
                className={`px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer shrink-0 ${
                  genderFilter === g
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                }`}
              >
                {g === 'all' ? 'All Genders' : g}
              </button>
            ))}

            <div className="h-3 w-[1px] bg-[var(--border-subtle)] shrink-0 mx-1" />

            {(['all', 'Narration', 'Commercial', 'Conversational'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyleFilter(s)}
                className={`px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer shrink-0 ${
                  styleFilter === s
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                }`}
              >
                {s === 'all' ? 'All Styles' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Voice List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] p-1">
          {/* My Custom Voices */}
          {customVoices.length > 0 && (
            <div className="p-2 space-y-1 bg-[var(--bg-1)] mb-1 rounded-md">
              <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider px-1">
                My Custom Voices ({customVoices.length})
              </div>
              {customVoices
                .filter((cv) => !search || cv.name.toLowerCase().includes(search.toLowerCase()))
                .map((cv) => {
                  const isSelected = selectedVoice === cv.voiceId || selectedVoice === cv.name;
                  return (
                    <div
                      key={cv.id}
                      onClick={() => {
                        onSelectVoice(cv.voiceId || cv.name);
                        onClose();
                      }}
                      className={`p-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] border border-[var(--accent)]/40'
                          : 'hover:bg-[var(--bg-3)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                          {cv.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                              {cv.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-500/20 shrink-0">
                              {cv.source === 'clone' ? 'Cloned' : 'Designed'}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--text-tertiary)] font-mono truncate">
                            ID: {cv.voiceId}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {cv.audioUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewVoice(cv.audioUrl!);
                            }}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-4)]"
                          >
                            <Play size={12} className="ml-0.5" />
                          </button>
                        )}
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center ml-1">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {filteredVoices.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)] text-[13px]">
              No voices found matching "{search}".
            </div>
          ) : (
            filteredVoices.map((voice) => {
              const isSelected = selectedVoice === voice.name;
              const isFav = favorites.includes(voice.name);
              const isPlaying = isPlayingPreview === voice.name;

              return (
                <div
                  key={voice.name}
                  onClick={() => {
                    onSelectVoice(voice.name);
                    onClose();
                  }}
                  className={`p-3 rounded-lg flex items-center justify-between gap-3 transition-colors cursor-pointer group ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] border border-[var(--accent)]/40'
                      : 'hover:bg-[var(--bg-3)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar circle */}
                    <div
                      className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-bold text-[13px] ${
                        isSelected
                          ? 'bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/50'
                          : 'bg-[var(--bg-3)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      {voice.name.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                          {voice.name}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.2 rounded bg-[var(--bg-3)] text-[var(--text-tertiary)] border border-[var(--border-subtle)] shrink-0">
                          {voice.accent}
                        </span>
                        <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">
                          {voice.style}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                        {voice.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Preview Button */}
                    <button
                      type="button"
                      title="Preview sample sentence"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewVoice(voice.name);
                      }}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        isPlaying
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-4)]'
                      }`}
                    >
                      {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                    </button>

                    {/* Favorite star */}
                    <button
                      type="button"
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={(e) => toggleFavorite(voice.name, e)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        isFav
                          ? 'text-amber-400'
                          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-4)]'
                      }`}
                    >
                      <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
                    </button>

                    {/* Selected check */}
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center ml-1">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
