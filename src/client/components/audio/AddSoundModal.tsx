import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  Mic,
  Music,
  Sparkles,
  Play,
  Pause,
  Film,
  Check,
  AlertCircle,
  Loader2,
  Sliders,
} from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { Dropzone } from '../ui/Dropzone.tsx';
import { fetchWithAuth } from '../../lib/firebase.ts';
import { MediaItem } from '../../types/media.ts';

export interface AddSoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetVideo: { id?: string; url: string; title?: string } | null;
  initialAudio?: { url: string; type: 'voice' | 'music' | 'sfx'; title?: string } | null;
  onSuccess?: (newAsset: any) => void;
}

export const AddSoundModal: React.FC<AddSoundModalProps> = ({
  isOpen,
  onClose,
  targetVideo,
  initialAudio,
  onSuccess,
}) => {
  const [audioAssets, setAudioAssets] = useState<MediaItem[]>([]);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [sfxUrl, setSfxUrl] = useState('');

  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [sfxVolume, setSfxVolume] = useState(0.8);
  const [replaceOriginal, setReplaceOriginal] = useState(false);

  // Lip Sync mode
  const [isLipSyncMode, setIsLipSyncMode] = useState(false);
  const [lipSyncModel, setLipSyncModel] = useState<'lipsync_syncso' | 'lipsync_kling'>('lipsync_syncso');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadedAudioName, setUploadedAudioName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleUploadAudio = async (file: File) => {
    setIsUploadingAudio(true);
    setUploadedAudioName(file.name);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetchWithAuth('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      setVoiceUrl(data.url);
    } catch (err: any) {
      setError(err.message || 'Audio upload failed');
    } finally {
      setIsUploadingAudio(false);
    }
  };

  // Fetch audio assets from library for picker
  useEffect(() => {
    if (!isOpen) return;
    const fetchAudios = async () => {
      try {
        const res = await fetchWithAuth('/api/assets?type=audio&limit=40');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.assets)) {
            setAudioAssets(data.assets);
          }
        }
      } catch {
        // Fall back gracefully
      }
    };
    fetchAudios();
  }, [isOpen]);

  useEffect(() => {
    if (initialAudio) {
      if (initialAudio.type === 'voice') setVoiceUrl(initialAudio.url);
      else if (initialAudio.type === 'music') setMusicUrl(initialAudio.url);
      else if (initialAudio.type === 'sfx') setSfxUrl(initialAudio.url);
    }
  }, [initialAudio]);

  if (!isOpen || !targetVideo) return null;

  const handleApply = async () => {
    setError(null);
    setIsProcessing(true);

    try {
      if (isLipSyncMode) {
        const audioInput = voiceUrl || musicUrl || sfxUrl;
        if (!audioInput) {
          throw new Error('Please select an audio track for lip sync.');
        }

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'audio.lipsync',
            modelKey: lipSyncModel,
            input: {
              video_url: targetVideo.url,
              audio_url: audioInput,
              duration: 5,
              assetId: targetVideo.id,
            },
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Lip sync submission failed');
        }

        const data = await res.json();
        onSuccess?.(data.job);
        onClose();
        return;
      }

      // Audio mixing (Server FFmpeg, cost 0)
      if (!voiceUrl && !musicUrl && !sfxUrl) {
        throw new Error('Please configure at least one audio track to mix.');
      }

      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'audio.mix',
          modelKey: 'audio_mix_local',
          input: {
            video_url: targetVideo.url,
            voice_url: voiceUrl || undefined,
            music_url: musicUrl || undefined,
            sfx_url: sfxUrl || undefined,
            replace_original: replaceOriginal,
            voice_volume: voiceVolume,
            music_volume: musicVolume,
            sfx_volume: sfxVolume,
            assetId: targetVideo.id,
            title: `${targetVideo.title || 'Video'} + Audio`,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to mix audio');
      }

      const data = await res.json();
      onSuccess?.(data.job?.outputs?.[0]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Sound to Video" maxWidth={560}>
      <div className="space-y-5">
        {/* Video Preview Header */}
        <div className="flex items-center gap-3 p-3 rounded-[var(--radius-cards)] bg-[var(--bg-3)] border border-[var(--border-subtle)]">
          <div className="w-16 h-12 rounded-lg bg-black overflow-hidden shrink-0 border border-[var(--border-strong)] flex items-center justify-center">
            <video src={targetVideo.url} className="w-full h-full object-cover" muted />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
              {targetVideo.title || 'Selected Video'}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              Mix voiceover, background music and sound effects with zero quality loss.
            </div>
          </div>
        </div>

        {/* Mode Toggle: Sound Mix vs AI Lip Sync */}
        <div className="flex rounded-[var(--radius-buttons)] bg-[var(--bg-3)] p-1 border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setIsLipSyncMode(false)}
            className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-all cursor-pointer ${
              !isLipSyncMode
                ? 'bg-[var(--bg-4)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Multi-Track Mix (Free)
          </button>
          <button
            type="button"
            onClick={() => setIsLipSyncMode(true)}
            className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-all cursor-pointer ${
              isLipSyncMode
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            AI Lip Sync (Sync.so / Kling)
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-[var(--radius-buttons)] bg-[var(--danger-soft)] border border-[var(--danger)] flex items-center gap-2 text-[12px] text-[var(--danger)]">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isLipSyncMode ? (
          <div className="space-y-4">
            {/* Block 1: Voiceover */}
            <div className="p-3.5 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
                  <Mic size={15} className="text-[var(--accent)]" />
                  <span>Voiceover</span>
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                  {Math.round(voiceVolume * 100)}%
                </span>
              </div>
              <Dropzone
                accept="audio/*,video/*"
                label={uploadedAudioName ? `Selected: ${uploadedAudioName}` : 'Upload audio or voice track'}
                caption={isUploadingAudio ? 'Uploading audio...' : 'or drop file here (up to 100 MB)'}
                onFileSelect={handleUploadAudio}
                className="py-2.5"
              />
              <div className="flex gap-2">
                <select
                  value={voiceUrl}
                  onChange={(e) => setVoiceUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">None / Custom URL</option>
                  {audioAssets.map((a) => (
                    <option key={a.id} value={a.url}>
                      {a.title} ({a.metadata?.voice || 'Voice'})
                    </option>
                  ))}
                </select>
                {voiceUrl && (
                  <button
                    type="button"
                    onClick={() => setVoiceUrl('')}
                    className="px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--danger)]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Or paste audio URL..."
                value={voiceUrl}
                onChange={(e) => setVoiceUrl(e.target.value)}
                className="w-full px-3 py-1 rounded bg-[var(--bg-0)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]"
              />
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">Volume:</span>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--accent)] cursor-pointer h-1.5 bg-[var(--bg-4)] rounded-lg"
                />
              </div>
            </div>

            {/* Block 2: Music */}
            <div className="p-3.5 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
                  <Music size={15} className="text-[#A855F7]" />
                  <span>Background Music</span>
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                  {Math.round(musicVolume * 100)}%
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  value={musicUrl}
                  onChange={(e) => setMusicUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">None / Custom URL</option>
                  {audioAssets.map((a) => (
                    <option key={a.id} value={a.url}>
                      {a.title}
                    </option>
                  ))}
                </select>
                {musicUrl && (
                  <button
                    type="button"
                    onClick={() => setMusicUrl('')}
                    className="px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--danger)]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Or paste music URL..."
                value={musicUrl}
                onChange={(e) => setMusicUrl(e.target.value)}
                className="w-full px-3 py-1 rounded bg-[var(--bg-0)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]"
              />
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">Volume:</span>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--accent)] cursor-pointer h-1.5 bg-[var(--bg-4)] rounded-lg"
                />
              </div>
            </div>

            {/* Block 3: Sound Effects */}
            <div className="p-3.5 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
                  <Sparkles size={15} className="text-[#F5A524]" />
                  <span>Sound Effect (SFX)</span>
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                  {Math.round(sfxVolume * 100)}%
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  value={sfxUrl}
                  onChange={(e) => setSfxUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">None / Custom URL</option>
                  {audioAssets.map((a) => (
                    <option key={a.id} value={a.url}>
                      {a.title}
                    </option>
                  ))}
                </select>
                {sfxUrl && (
                  <button
                    type="button"
                    onClick={() => setSfxUrl('')}
                    className="px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--danger)]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Or paste sound effect URL..."
                value={sfxUrl}
                onChange={(e) => setSfxUrl(e.target.value)}
                className="w-full px-3 py-1 rounded bg-[var(--bg-0)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]"
              />
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">Volume:</span>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={sfxVolume}
                  onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--accent)] cursor-pointer h-1.5 bg-[var(--bg-4)] rounded-lg"
                />
              </div>
            </div>

            {/* Option: Replace or Mix original audio */}
            <label className="flex items-center gap-2.5 p-3 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={replaceOriginal}
                onChange={(e) => setReplaceOriginal(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--accent)] accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[12px] text-[var(--text-secondary)]">
                Replace original video audio entirely (mute original track)
              </span>
            </label>
          </div>
        ) : (
          /* Lip Sync Mode Panel */
          <div className="p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-4">
            <div className="space-y-1">
              <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                AI Lip Sync Model
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                Synchronizes actor lip motion in the video to match the audio track.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLipSyncModel('lipsync_syncso')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  lipSyncModel === 'lipsync_syncso'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-3)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">Sync.so 1.9</div>
                <div className="text-[11px] text-[var(--accent)] mt-0.5">$0.10 / sec</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-1">
                  Flexible length, fast lip-motion sync.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLipSyncModel('lipsync_kling')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  lipSyncModel === 'lipsync_kling'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-3)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">Kling Lip Sync</div>
                <div className="text-[11px] text-[var(--accent)] mt-0.5">$0.14 / sec</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-1">
                  2-10s video, 720p/1080p, ultra-realistic.
                </div>
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[var(--text-primary)]">
                Select Voice Track to Sync:
              </label>
              <Dropzone
                accept="audio/*,video/*"
                label={uploadedAudioName ? `Selected: ${uploadedAudioName}` : 'Upload voice track'}
                caption={isUploadingAudio ? 'Uploading audio...' : 'or drop audio file (up to 100 MB)'}
                onFileSelect={handleUploadAudio}
                className="py-2.5"
              />
              <select
                value={voiceUrl}
                onChange={(e) => setVoiceUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
              >
                <option value="">Choose an audio asset...</option>
                {audioAssets.map((a) => (
                  <option key={a.id} value={a.url}>
                    {a.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
          <div className="text-[12px] text-[var(--text-secondary)]">
            Estimated Cost: <strong className="text-[var(--accent)]">{isLipSyncMode ? '≈ $0.50' : 'Free ($0.00)'}</strong>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size={32} onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size={32}
              onClick={handleApply}
              disabled={isProcessing}
              icon={isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            >
              {isProcessing ? 'Processing...' : isLipSyncMode ? 'Run Lip Sync' : 'Apply to Video'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
