import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Music,
  Sparkles,
  Volume2,
  Play,
  Pause,
  Download,
  ThumbsUp,
  ThumbsDown,
  Film,
  Plus,
  Trash2,
  Languages,
  Check,
  AlertCircle,
  FileText,
  RotateCcw,
  SlidersHorizontal,
  FileCode,
  Users,
  UserCheck,
  History,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Star,
  Scissors,
} from 'lucide-react';
import { Button } from '../components/ui/Button.tsx';
import { Dropzone } from '../components/ui/Dropzone.tsx';
import { AddSoundModal } from '../components/audio/AddSoundModal.tsx';
import { TtsModelPicker } from '../components/audio/TtsModelPicker.tsx';
import { ttsModelInfo, ttsCost } from '../lib/ttsModels.ts';
import { VoicePickerPopover, VOICES_CATALOG, VoiceData, voicesForModel } from '../components/audio/VoicePickerPopover.tsx';
import { AudioMiniPlayer } from '../components/audio/AudioMiniPlayer.tsx';
import {
  MusicPanel,
  VideoSfxPanel,
  VoiceChangerPanel,
  SeparatePanel,
  TalkingPhotoPanel,
  AudioToVideoPanel,
  ReferenceClip,
} from '../components/audio/ExtraVoiceTools.tsx';
import { buildCues, toSrt, toVtt } from '../lib/captions.ts';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';

// ISO 639-1 languages
export const VOICE_LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'it', name: 'Italian (Italiano)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'pl', name: 'Polish (Polski)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'ko', name: 'Korean (한국어)' },
  { code: 'zh', name: 'Chinese (中文)' },
  { code: 'nl', name: 'Dutch (Nederlands)' },
  { code: 'tr', name: 'Turkish (Türkçe)' },
  { code: 'sv', name: 'Swedish (Svenska)' },
  { code: 'id', name: 'Indonesian (Bahasa Indonesia)' },
  { code: 'fil', name: 'Filipino (Tagalog)' },
  { code: 'uk', name: 'Ukrainian (Українська)' },
  { code: 'el', name: 'Greek (Ελληνικά)' },
  { code: 'cs', name: 'Czech (Čeština)' },
  { code: 'fi', name: 'Finnish (Suomi)' },
  { code: 'ro', name: 'Romanian (Română)' },
  { code: 'da', name: 'Danish (Dansk)' },
  { code: 'bg', name: 'Bulgarian (Български)' },
  { code: 'ms', name: 'Malay (Bahasa Melayu)' },
  { code: 'hu', name: 'Hungarian (Magyar)' },
  { code: 'no', name: 'Norwegian (Norsk)' },
  { code: 'vi', name: 'Vietnamese (Tiếng Việt)' },
  { code: 'ar', name: 'Arabic (العربية)' },
];

export type VoiceTool =
  | 'tts'
  | 'dialogue'
  | 'sfx'
  | 'music'
  | 'stt'
  | 'dubbing'
  | 'lipsync'
  | 'voice_change'
  | 'separate'
  | 'voices';

export interface DialogueLine {
  id: string;
  speaker: string;
  voice: string;
  text: string;
}

/** Left rail: three simple groups, in the order people work. */
const RAIL_GROUPS: Array<{
  title: string;
  items: Array<{ id: VoiceTool; label: string; icon: any; caption: string }>;
}> = [
  {
    title: 'Speech',
    items: [
      { id: 'tts', label: 'Text to speech', icon: Mic, caption: 'Voiceover & narration' },
      { id: 'dialogue', label: 'Dialogue', icon: Users, caption: 'Several speakers' },
      { id: 'voice_change', label: 'Voice changer', icon: Volume2, caption: 'Swap the speaker' },
      { id: 'voices', label: 'Voices', icon: UserCheck, caption: 'Library, clone, design' },
    ],
  },
  {
    title: 'Sound',
    items: [
      { id: 'sfx', label: 'Sound effects', icon: Sparkles, caption: 'From text or from video' },
      { id: 'music', label: 'Music', icon: Music, caption: 'Tracks and songs' },
      { id: 'separate', label: 'Split audio', icon: Scissors, caption: 'Vocals, drums, bass' },
    ],
  },
  {
    title: 'Video audio',
    items: [
      { id: 'stt', label: 'Speech to text', icon: FileText, caption: 'Transcript & captions' },
      { id: 'dubbing', label: 'Dubbing', icon: Languages, caption: 'Translate the voice' },
      { id: 'lipsync', label: 'Lip sync', icon: Film, caption: 'Video, photo or audio' },
    ],
  },
];

export const AudioPage: React.FC = () => {
  const [reviewState] = useReviewState();

  // Active Tool persistence in localStorage
  const [activeTool, setActiveTool] = useState<VoiceTool>(() => {
    try {
      const saved = localStorage.getItem('crenord_audio_tool');
      if (
        saved === 'tts' ||
        saved === 'dialogue' ||
        saved === 'sfx' ||
        saved === 'music' ||
        saved === 'stt' ||
        saved === 'dubbing' ||
        saved === 'lipsync' ||
        saved === 'voice_change' ||
        saved === 'separate' ||
        saved === 'voices'
      ) {
        return saved;
      }
      // Migrate old subtab values
      const oldSubtab = localStorage.getItem('crenord_audio_subtab');
      if (oldSubtab === 'voiceover') return 'tts';
      if (oldSubtab === 'transcript') return 'stt';
    } catch {}
    return 'tts';
  });

  const handleSelectTool = (tool: VoiceTool) => {
    setActiveTool(tool);
    try {
      localStorage.setItem('crenord_audio_tool', tool);
    } catch {}
  };

  // Right Panel Tab: 'settings' or 'history'
  const [rightPanelTab, setRightPanelTab] = useState<'settings' | 'history'>('settings');
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // App & Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [audioItems, setAudioItems] = useState<any[]>([]);
  const [videoAssets, setVideoAssets] = useState<any[]>([]);

  // Audio Playback & Mini-Player
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activePlayingItem, setActivePlayingItem] = useState<any | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Ratings & AddSoundModal
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, 'positive' | 'negative' | null>>({});
  const [soundModalTarget, setSoundModalTarget] = useState<{ isOpen: boolean; video: any; audio: any }>({
    isOpen: false,
    video: null,
    audio: null,
  });

  // Voice Picker Popover State
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
  const [previewPlayingVoice, setPreviewPlayingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Draft vs Final Tier Switch (Header)
  const [genTier, setGenTier] = useState<'draft' | 'final'>('draft');

  // Text-to-Speech Settings
  const [selectedVoice, setSelectedVoice] = useState('Rachel');
  const [selectedModel, setSelectedModel] = useState<string>('tts_turbo_v25');

  // When the model changes, make sure the chosen voice belongs to it.
  useEffect(() => {
    const info = ttsModelInfo(selectedModel);
    const list = voicesForModel(info.family);
    if (list.length === 0) return;
    if (!list.some((v) => v.name === selectedVoice) && !customVoices.some((c) => c.voiceId === selectedVoice || c.name === selectedVoice)) {
      setSelectedVoice(list.some((v) => v.name === info.defaultVoice) ? info.defaultVoice : list[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [speed, setSpeed] = useState(1.0);
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [styleExaggeration, setStyleExaggeration] = useState(0.0);
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true);
  const [outputFormat, setOutputFormat] = useState<'mp3' | 'mp3_high' | 'wav' | 'opus'>('mp3');

  // Custom Cloned and Designed Voices
  const [customVoices, setCustomVoices] = useState<any[]>([]);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);

  // Clone Voice Form
  const [cloneVoiceName, setCloneVoiceName] = useState('');
  const [cloneAudioUrl, setCloneAudioUrl] = useState('');
  const [cloneConsentConfirmed, setCloneConsentConfirmed] = useState(false);

  // Design Voice Form
  const [designVoiceName, setDesignVoiceName] = useState('');
  const [designPrompt, setDesignPrompt] = useState('');
  const [designPreviewText, setDesignPreviewText] = useState('Welcome to this newly designed voice. How do I sound?');

  // Model-specific settings
  // MiniMax Speech 2.8 HD
  const [minimaxEmotion, setMinimaxEmotion] = useState<'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'calm'>('neutral');
  const [minimaxVol, setMinimaxVol] = useState(1.0);
  const [minimaxPitch, setMinimaxPitch] = useState(0);

  // Google Gemini 3.1 Flash
  const [geminiStyleInstructions, setGeminiStyleInstructions] = useState('');
  const [geminiTemperature, setGeminiTemperature] = useState(0.7);

  // Inworld TTS-1.5 Max
  const [inworldSampleRate, setInworldSampleRate] = useState(48000);

  // Chatterbox TTS
  const [chatterboxExaggeration, setChatterboxExaggeration] = useState(0.5);
  const [chatterboxAudioUrl, setChatterboxAudioUrl] = useState('');

  // Index TTS 2.0
  const [indexTtsAudioUrl, setIndexTtsAudioUrl] = useState('');
  const [indexTtsEmotions, setIndexTtsEmotions] = useState({
    happy: 0.0,
    sad: 0.0,
    angry: 0.0,
    fear: 0.0,
    disgust: 0.0,
    surprise: 0.0,
    calm: 0.5,
    neutral: 0.5,
  });

  // Collapsible Advanced Settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [customSeed, setCustomSeed] = useState('');
  const [applyTextNormalization, setApplyTextNormalization] = useState(true);
  const [multiLangActive, setMultiLangActive] = useState(false);
  const [multiLanguages, setMultiLanguages] = useState<string[]>(['en', 'es', 'fr']);

  // Reset sliders to default helper
  const handleResetDefaults = () => {
    setSpeed(1.0);
    setStability(0.5);
    setSimilarityBoost(0.75);
    setStyleExaggeration(0.0);
    setUseSpeakerBoost(true);
    setMinimaxEmotion('neutral');
    setMinimaxVol(1.0);
    setMinimaxPitch(0);
    setGeminiStyleInstructions('');
    setGeminiTemperature(0.7);
    setInworldSampleRate(48000);
    setChatterboxExaggeration(0.5);
    setIndexTtsEmotions({
      happy: 0.0,
      sad: 0.0,
      angry: 0.0,
      fear: 0.0,
      disgust: 0.0,
      surprise: 0.0,
      calm: 0.5,
      neutral: 0.5,
    });
  };

  // Switch model recommendation when Draft/Final is toggled
  const handleToggleTier = (tier: 'draft' | 'final') => {
    setGenTier(tier);
    if (tier === 'draft') {
      setSelectedModel('tts_turbo_v25');
    } else {
      setSelectedModel('tts_eleven_v4');
    }
  };

  // Tool 1: Text to Speech (TTS)
  const [ttsScript, setTtsScript] = useState('');
  const ttsTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Tool 2: Dialogue
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([
    { id: '1', speaker: 'Narrator', voice: 'George', text: 'Every great brand starts with a bold vision.' },
    { id: '2', speaker: 'Founder', voice: 'Rachel', text: 'And with CRENORD, executing that vision takes seconds, not weeks.' },
  ]);
  const [dialogueStability, setDialogueStability] = useState<number>(0.5);

  // Tool 3: Sound Effects (SFX)
  const [sfxPrompt, setSfxPrompt] = useState('Deep cinematic bass drop with metallic shimmer');
  const [sfxDuration, setSfxDuration] = useState(4);
  const [sfxLoop, setSfxLoop] = useState(false);

  // Tool 4: Music
  const [musicPrompt, setMusicPrompt] = useState('Minimalist dark corporate synthwave with driving modern pulse');
  const [musicDurationSec, setMusicDurationSec] = useState(30);
  const [forceInstrumental, setForceInstrumental] = useState(true);

  // Tool 5: Speech to Text (STT) & Captions
  const [sttSourceUrl, setSttSourceUrl] = useState('');
  const [sttSourceType, setSttSourceType] = useState<'video' | 'audio' | null>(null);
  const [sttDuration, setSttDuration] = useState<number | null>(null);
  const [sttFileName, setSttFileName] = useState('');
  const [sttLanguage, setSttLanguage] = useState('auto');
  const [transcriptResult, setTranscriptResult] = useState<{ text: string; words?: any[]; language?: string } | null>(null);
  const [isBurningCaptions, setIsBurningCaptions] = useState(false);

  // Tool 6: Dubbing
  const [dubSourceUrl, setDubSourceUrl] = useState('');
  const [dubSourceType, setDubSourceType] = useState<'video' | 'audio' | null>(null);
  const [dubDuration, setDubDuration] = useState<number | null>(null);
  const [dubFileName, setDubFileName] = useState('');
  const [dubTargetLang, setDubTargetLang] = useState('es');
  const [dubNumSpeakers, setDubNumSpeakers] = useState<number | undefined>(undefined);

  // Tool 7: Lip Sync
  const [lipsyncVideoUrl, setLipsyncVideoUrl] = useState('');
  const [lipsyncVideoFileName, setLipsyncVideoFileName] = useState('');
  const [lipsyncVideoDuration, setLipsyncVideoDuration] = useState<number | null>(null);
  const [lipsyncAudioUrl, setLipsyncAudioUrl] = useState('');
  const [lipsyncAudioFileName, setLipsyncAudioFileName] = useState('');
  const [lipsyncModel, setLipsyncModel] = useState<'lipsync_syncso' | 'lipsync_kling'>('lipsync_syncso');
  const [lipsyncMode, setLipsyncMode] = useState<'video' | 'photo' | 'audio2video'>('video');
  const [sttModel, setSttModel] = useState<'stt_scribe_v2' | 'stt_wizper'>('stt_scribe_v2');

  // Tool 8: Voice Changer (Unconnected)
  const [voiceChangeSourceUrl, setVoiceChangeSourceUrl] = useState('');

  // Tool 9: Voices Library
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryGender, setLibraryGender] = useState<'all' | 'Female' | 'Male'>('all');
  const [libraryStyle, setLibraryStyle] = useState<string>('all');

  // Direct Upload handler
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const handleDirectUpload = async (
    file: File,
    target: 'stt' | 'dub' | 'lipsync_video' | 'lipsync_audio' | 'voice_change'
  ) => {
    setUploadingTarget(target);
    setErrorBanner(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetchWithAuth('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      const dur = typeof data.duration === 'number' && !isNaN(data.duration) ? Math.round(data.duration * 10) / 10 : null;

      if (target === 'stt') {
        setSttSourceUrl(data.url);
        setSttSourceType(data.type === 'video' ? 'video' : 'audio');
        setSttDuration(dur);
        setSttFileName(file.name);
      } else if (target === 'dub') {
        setDubSourceUrl(data.url);
        setDubSourceType(data.type === 'video' ? 'video' : 'audio');
        setDubDuration(dur);
        setDubFileName(file.name);
      } else if (target === 'lipsync_video') {
        setLipsyncVideoUrl(data.url);
        setLipsyncVideoDuration(dur);
        setLipsyncVideoFileName(file.name);
      } else if (target === 'lipsync_audio') {
        setLipsyncAudioUrl(data.url);
        setLipsyncAudioFileName(file.name);
      } else if (target === 'voice_change') {
        setVoiceChangeSourceUrl(data.url);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'File upload failed');
    } finally {
      setUploadingTarget(null);
    }
  };

  // Fetch audio and video assets on mount
  const fetchAudioFeed = async () => {
    try {
      const [resAudio, resVideo] = await Promise.all([
        fetchWithAuth('/api/assets?type=audio&limit=30'),
        fetchWithAuth('/api/assets?type=video&limit=20'),
      ]);

      if (resAudio.ok) {
        const data = await resAudio.json();
        if (Array.isArray(data.assets)) setAudioItems(data.assets);
      }
      if (resVideo.ok) {
        const data = await resVideo.json();
        if (Array.isArray(data.assets)) setVideoAssets(data.assets);
      }
    } catch {}
  };

  // Fetch custom voices from /api/voices
  const fetchCustomVoices = async () => {
    try {
      const res = await fetchWithAuth('/api/voices');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.voices)) {
          setCustomVoices(data.voices);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchAudioFeed();
    fetchCustomVoices();
    const interval = setInterval(() => {
      fetchAudioFeed();
      fetchCustomVoices();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Submit Clone Voice (MiniMax)
  const handleCloneVoice = async () => {
    if (!cloneVoiceName.trim()) {
      setErrorBanner('Please provide a name for the cloned voice.');
      return;
    }
    if (!cloneAudioUrl.trim()) {
      setErrorBanner('Please upload or provide an audio sample URL.');
      return;
    }
    if (!cloneConsentConfirmed) {
      setErrorBanner('You must certify that you have the rights to clone this voice.');
      return;
    }

    setIsSubmittingVoice(true);
    setErrorBanner(null);
    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'audio.voiceClone',
          modelKey: 'voice_clone_minimax',
          input: {
            name: cloneVoiceName.trim(),
            voice_name: cloneVoiceName.trim(),
            audio_url: cloneAudioUrl.trim(),
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to initiate voice clone.');
      }

      setShowCloneModal(false);
      setCloneVoiceName('');
      setCloneAudioUrl('');
      setCloneConsentConfirmed(false);
      await fetchAudioFeed();
      await fetchCustomVoices();
      setRightPanelTab('history');
    } catch (err: any) {
      setErrorBanner(err.message || 'Voice cloning failed');
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  // Submit Design Voice (MiniMax)
  const handleDesignVoice = async () => {
    if (!designVoiceName.trim()) {
      setErrorBanner('Please provide a name for the designed voice.');
      return;
    }
    if (!designPrompt.trim()) {
      setErrorBanner('Please enter a description prompt for the voice.');
      return;
    }

    setIsSubmittingVoice(true);
    setErrorBanner(null);
    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'audio.voiceDesign',
          modelKey: 'voice_design_minimax',
          input: {
            name: designVoiceName.trim(),
            voice_name: designVoiceName.trim(),
            prompt: designPrompt.trim(),
            preview_text: designPreviewText.trim(),
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to initiate voice design.');
      }

      setShowDesignModal(false);
      setDesignVoiceName('');
      setDesignPrompt('');
      await fetchAudioFeed();
      await fetchCustomVoices();
      setRightPanelTab('history');
    } catch (err: any) {
      setErrorBanner(err.message || 'Voice design failed');
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  // Delete Custom Voice
  const handleDeleteCustomVoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchWithAuth(`/api/voices/${id}`, { method: 'DELETE' });
      setCustomVoices((prev) => prev.filter((v) => v.id !== id));
    } catch {}
  };

  // Tag insertion into TTS Script
  const insertTtsTag = (tag: string) => {
    if (!ttsTextareaRef.current) return;
    const el = ttsTextareaRef.current;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const current = ttsScript;
    const updated = current.substring(0, start) + tag + ' ' + current.substring(end);
    setTtsScript(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length + 1, start + tag.length + 1);
    }, 10);
  };

  // Preview voice sample sentence
  const handlePreviewVoice = async (voiceName: string) => {
    if (previewPlayingVoice === voiceName) {
      previewAudioRef.current?.pause();
      setPreviewPlayingVoice(null);
      return;
    }

    try {
      setPreviewPlayingVoice(voiceName);
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'audio.tts',
          modelKey: 'tts_turbo_v25',
          input: {
            text: `Hello, this is ${voiceName} speaking with ElevenLabs voice synthesis on CRENORD.`,
            voice: voiceName,
            stability: 0.5,
          },
        }),
      });

      if (res.ok) {
        fetchAudioFeed();
      }
    } catch {
      setPreviewPlayingVoice(null);
    }
  };

  // Live Playback Control
  const togglePlayAudio = (url: string, id: string, itemData?: any) => {
    if (playingId === id) {
      audioPlayerRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(url);
    audioPlayerRef.current = audio;
    setPlayingId(id);
    setActivePlayingItem(itemData || { id, url });

    audio.onended = () => {
      setPlayingId(null);
    };

    audio.play().catch(() => {
      setPlayingId(null);
    });
  };

  // Feedback (Thumbs Up / Down)
  const handleFeedback = async (jobId: string, rating: 'positive' | 'negative') => {
    const current = feedbackRatings[jobId];
    const newRating = current === rating ? null : rating;
    setFeedbackRatings((prev) => ({ ...prev, [jobId]: newRating }));

    try {
      await fetchWithAuth(`/api/jobs/${jobId}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      });
    } catch {}
  };

  // Dialogue Line Add / Remove
  const addDialogueLine = () => {
    const newId = String(Date.now());
    const nextSpeaker = dialogueLines.length % 2 === 0 ? 'Charlie' : 'Sarah';
    setDialogueLines((prev) => [
      ...prev,
      { id: newId, speaker: `Speaker ${prev.length + 1}`, voice: nextSpeaker, text: '' },
    ]);
  };

  const removeDialogueLine = (id: string) => {
    if (dialogueLines.length <= 1) return;
    setDialogueLines((prev) => prev.filter((l) => l.id !== id));
  };

  // Transcript export helper
  const handleExportTranscript = (format: 'txt' | 'srt' | 'vtt' | 'json') => {
    if (!transcriptResult) return;
    let content = '';
    let mimeType = 'text/plain';
    let filename = `transcript.${format}`;

    if (format === 'txt') {
      content = transcriptResult.text;
    } else if (format === 'srt') {
      content = toSrt(buildCues(transcriptResult.words, transcriptResult.text));
    } else if (format === 'vtt') {
      content = toVtt(buildCues(transcriptResult.words, transcriptResult.text));
      filename = 'transcript.vtt';
    } else if (format === 'json') {
      content = JSON.stringify(transcriptResult, null, 2);
      mimeType = 'application/json';
      filename = 'transcript.json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Burn captions onto video
  const handleBurnCaptions = async () => {
    if (!sttSourceUrl || !transcriptResult) return;
    setIsBurningCaptions(true);
    try {
      const srtContent = toSrt(buildCues(transcriptResult.words, transcriptResult.text));
      await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'audio.burn_captions',
          modelKey: 'audio_burn_captions',
          input: {
            video_url: sttSourceUrl,
            srt_content: srtContent,
            title: 'Video with Burned Captions',
          },
        }),
      });
      await fetchAudioFeed();
      setRightPanelTab('history');
    } catch {}
    setIsBurningCaptions(false);
  };

  // Live Cost Estimate Calculation
  const getToolCost = (): number => {
    if (activeTool === 'tts') {
      const chars = ttsScript.length || 0;
      const multiplier = multiLangActive ? multiLanguages.length : 1;
      return Math.round(ttsCost(selectedModel, chars) * multiplier * 1000) / 1000;
    }
    if (activeTool === 'dialogue') {
      const chars = dialogueLines.reduce((acc, l) => acc + l.text.length, 0);
      return Math.round(chars * 0.0001 * 1000) / 1000;
    }
    if (activeTool === 'sfx') {
      return 0.05;
    }
    if (activeTool === 'music') {
      return Math.round((musicDurationSec / 60) * 0.8 * 100) / 100;
    }
    if (activeTool === 'dubbing') {
      if (dubDuration && dubDuration > 0) {
        return Math.max(0.01, Math.round((dubDuration / 60) * 0.9 * 100) / 100);
      }
      return 0.9;
    }
    if (activeTool === 'stt') {
      if (sttDuration && sttDuration > 0) {
        return Math.max(0.001, Math.round((sttDuration / 60) * (sttModel === 'stt_wizper' ? 0.006 : 0.008) * 1000) / 1000);
      }
      return sttModel === 'stt_wizper' ? 0.006 : 0.008;
    }
    if (activeTool === 'lipsync') {
      const rate = lipsyncModel === 'lipsync_kling' ? 0.14 : 0.10;
      if (lipsyncVideoDuration && lipsyncVideoDuration > 0) {
        return Math.round(lipsyncVideoDuration * rate * 100) / 100;
      }
      return 0.5;
    }
    return 0;
  };

  // Action Button Configuration
  const getActionProps = () => {
    switch (activeTool) {
      case 'tts': {
        const isEmpty = !ttsScript.trim();
        let disabled = isGenerating || isEmpty;
        let disabledReason = isEmpty ? 'Enter your text script first' : '';
        if (selectedModel === 'tts_index_tts2' && !indexTtsAudioUrl.trim()) {
          disabled = true;
          disabledReason = 'Index TTS 2.0 requires reference audio URL';
        }
        return {
          label: isGenerating ? 'Generating speech...' : 'Generate speech',
          cost: `Estimated cost: ≈ $${getToolCost().toFixed(3)}`,
          disabled,
          disabledReason,
        };
      }
      case 'dialogue': {
        const hasText = dialogueLines.some((l) => l.text.trim().length > 0);
        return {
          label: isGenerating ? 'Generating dialogue...' : 'Generate dialogue',
          cost: `Estimated cost: ≈ $${getToolCost().toFixed(3)}`,
          disabled: isGenerating || !hasText,
          disabledReason: !hasText ? 'Enter dialogue lines for speakers' : '',
        };
      }
      case 'sfx': {
        const isEmpty = !sfxPrompt.trim();
        return {
          label: isGenerating ? 'Creating effect...' : 'Generate sound effect',
          cost: 'Estimated cost: $0.050',
          disabled: isGenerating || isEmpty,
          disabledReason: isEmpty ? 'Describe the sound effect first' : '',
        };
      }
      case 'music': {
        const isEmpty = !musicPrompt.trim();
        return {
          label: isGenerating ? 'Generating music...' : 'Generate music',
          cost: `Estimated cost: ≈ $${getToolCost().toFixed(2)}`,
          disabled: isGenerating || isEmpty,
          disabledReason: isEmpty ? 'Describe the music piece' : '',
        };
      }
      case 'stt': {
        const hasSource = Boolean(sttSourceUrl);
        return {
          label: isGenerating ? 'Transcribing...' : 'Transcribe media',
          cost: `Estimated cost: ≈ $${getToolCost().toFixed(3)}`,
          disabled: isGenerating || !hasSource,
          disabledReason: !hasSource ? 'Upload or select a file to transcribe' : '',
        };
      }
      case 'dubbing': {
        const hasSource = Boolean(dubSourceUrl);
        return {
          label: isGenerating ? 'Dubbing media...' : 'Dub media',
          cost: `Estimated cost: ≈ $${getToolCost().toFixed(2)}`,
          disabled: isGenerating || !hasSource,
          disabledReason: !hasSource ? 'Upload or select a video or audio file to dub' : '',
        };
      }
      case 'lipsync': {
        const ready = Boolean(lipsyncVideoUrl) && Boolean(lipsyncAudioUrl);
        return {
          label: isGenerating ? 'Generating lip sync...' : 'Generate lip sync',
          cost: `Estimated cost: ≈ $${getToolCost().toFixed(2)}`,
          disabled: isGenerating || !ready,
          disabledReason: !lipsyncVideoUrl
            ? 'Upload target video'
            : !lipsyncAudioUrl
            ? 'Upload audio speech track'
            : '',
        };
      }
      case 'voice_change':
      default:
        return {
          label: 'Not connected yet',
          cost: 'Pending integration',
          disabled: true,
          disabledReason: 'Voice clone model awaiting verified fal schema',
        };
    }
  };

  const actionProps = getActionProps();

  // Execution Handler
  const handleGenerate = async () => {
    if (activeTool === 'voice_change' || activeTool === 'voices') return;

    setErrorBanner(null);
    setIsGenerating(true);

    try {
      if (activeTool === 'tts') {
        if (!ttsScript.trim()) throw new Error('Please enter text script.');

        const buildTtsInput = (langCode?: string) => {
          const base: Record<string, any> = {
            text: ttsScript,
            prompt: ttsScript,
            voice: selectedVoice,
            voice_id: selectedVoice,
          };
          if (selectedModel.startsWith('tts_eleven')) {
            base.stability = stability;
            base.similarity_boost = similarityBoost;
            base.speed = speed;
            if (selectedModel === 'tts_eleven_v4') base.style = styleExaggeration;
            base.use_speaker_boost = useSpeakerBoost;
            base.output_format = outputFormat;
            if (customSeed) base.seed = parseInt(customSeed, 10);
            base.apply_text_normalization = applyTextNormalization;
            if (langCode && langCode !== 'auto') base.language_code = langCode;
          } else if (selectedModel.startsWith('tts_minimax')) {
            base.speed = speed;
            base.emotion = minimaxEmotion;
            base.vol = minimaxVol;
            base.pitch = minimaxPitch;
          } else if (selectedModel === 'tts_gemini_31_flash') {
            if (geminiStyleInstructions.trim()) base.style_instructions = geminiStyleInstructions.trim();
            base.temperature = geminiTemperature;
          } else if (selectedModel === 'tts_inworld') {
            base.sample_rate_hertz = inworldSampleRate;
          } else if (selectedModel === 'tts_kokoro') {
            base.speed = speed;
          } else if (selectedModel === 'tts_f5') {
            if (!chatterboxAudioUrl.trim()) throw new Error('F5-TTS needs a voice clip. Upload one first.');
            base.audio_url = chatterboxAudioUrl.trim();
          } else if (selectedModel === 'tts_xai') {
            if (langCode && langCode !== 'auto') base.language = langCode;
          } else if (selectedModel === 'tts_chatterbox') {
            base.exaggeration = chatterboxExaggeration;
            if (chatterboxAudioUrl.trim()) base.audio_url = chatterboxAudioUrl.trim();
          } else if (selectedModel === 'tts_index_tts2') {
            if (!indexTtsAudioUrl.trim()) throw new Error('Index TTS 2.0 requires reference audio URL/clip.');
            base.audio_url = indexTtsAudioUrl.trim();
            base.emotions = indexTtsEmotions;
          }
          return base;
        };

        if (multiLangActive && multiLanguages.length > 0) {
          for (const lang of multiLanguages) {
            await fetchWithAuth('/api/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tool: 'audio.tts',
                modelKey: selectedModel,
                input: buildTtsInput(lang),
              }),
            });
          }
        } else {
          const res = await fetchWithAuth('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tool: 'audio.tts',
              modelKey: selectedModel,
              input: buildTtsInput(selectedLanguage !== 'auto' ? selectedLanguage : undefined),
            }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Voice generation failed');
          }
        }
      } else if (activeTool === 'dialogue') {
        const validInputs = dialogueLines.map((l) => ({ text: l.text, voice: l.voice }));
        if (validInputs.every((i) => !i.text.trim())) throw new Error('Enter text for dialogue lines.');

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'audio.dialogue',
            modelKey: 'tts_dialogue',
            input: {
              inputs: validInputs,
              stability: dialogueStability,
              use_speaker_boost: true,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Dialogue generation failed');
        }
      } else if (activeTool === 'sfx') {
        if (!sfxPrompt.trim()) throw new Error('Please describe the sound effect.');

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'audio.sfx',
            modelKey: 'sfx_eleven_v2',
            input: {
              text: sfxPrompt,
              duration_seconds: sfxDuration,
              loop: sfxLoop,
              output_format: outputFormat === 'opus' ? 'mp3_44100_128' : outputFormat,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Sound effect generation failed');
        }
      } else if (activeTool === 'music') {
        if (!musicPrompt.trim()) throw new Error('Please describe the music.');

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'audio.music',
            modelKey: 'music_eleven',
            input: {
              prompt: musicPrompt,
              music_length_ms: musicDurationSec * 1000,
              force_instrumental: forceInstrumental,
              output_format: 'mp3_44100_128',
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Music generation failed');
        }
      } else if (activeTool === 'dubbing') {
        if (!dubSourceUrl) throw new Error('Upload or select media to dub.');
        const isVideo = dubSourceType === 'video' || dubSourceUrl.includes('.mp4') || dubSourceUrl.includes('video');

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'audio.dub',
            modelKey: 'dubbing_eleven',
            input: {
              video_url: isVideo ? dubSourceUrl : undefined,
              audio_url: !isVideo ? dubSourceUrl : undefined,
              duration: dubDuration || undefined,
              target_lang: dubTargetLang,
              source_lang: selectedLanguage !== 'auto' ? selectedLanguage : undefined,
              num_speakers: dubNumSpeakers,
              highest_resolution: true,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Dubbing failed');
        }
      } else if (activeTool === 'lipsync') {
        if (!lipsyncVideoUrl || !lipsyncAudioUrl) throw new Error('Target video and speech audio required.');

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'audio.lipsync',
            modelKey: lipsyncModel,
            input: {
              video_url: lipsyncVideoUrl,
              audio_url: lipsyncAudioUrl,
              duration: lipsyncVideoDuration || undefined,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Lip-sync failed');
        }
      } else if (activeTool === 'stt') {
        if (!sttSourceUrl) throw new Error('Upload or select media to transcribe.');
        const isVideo = sttSourceType === 'video' || sttSourceUrl.includes('.mp4') || sttSourceUrl.includes('video');

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'audio.stt',
            modelKey: sttModel,
            input: {
              video_url: isVideo ? sttSourceUrl : undefined,
              audio_url: !isVideo ? sttSourceUrl : undefined,
              duration: sttDuration || undefined,
              language_code: sttLanguage !== 'auto' ? sttLanguage : undefined,
              language: sttLanguage !== 'auto' ? sttLanguage : undefined,
              tag_audio_events: sttModel === 'stt_scribe_v2' ? true : undefined,
              diarize: sttModel === 'stt_scribe_v2' ? true : undefined,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Transcription failed');

        if (data.job?.status === 'succeeded' && data.job?.outputs?.[0]) {
          const out = data.job.outputs[0];
          setTranscriptResult({
            text: out.text || '',
            words: out.words,
            language: out.language || (sttLanguage !== 'auto' ? sttLanguage : undefined),
          });
        }
      }

      await fetchAudioFeed();
      // Automatically switch to history tab so creator immediately sees the result
      setRightPanelTab('history');
    } catch (err: any) {
      setErrorBanner(err.message || 'Operation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Called by the self-contained tool panels after they start a job
  const afterSubmit = () => {
    fetchAudioFeed();
  };

  // Find active voice object
  const modelVoices = voicesForModel(ttsModelInfo(selectedModel).family);
  const activeVoiceObj = VOICES_CATALOG.find((v) => v.name === selectedVoice) || VOICES_CATALOG[0];

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-[var(--bg-0)]">
      {/* 1. TOP BAR: Title, Draft | Final switch and subtle guidance */}
      <div className="shrink-0 px-6 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4 bg-[var(--bg-1)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] border border-[var(--accent)]/30 shrink-0">
            <Mic size={17} strokeWidth={2} />
          </div>
          <div>
            <h1 className="type-h1 text-[18px] text-[var(--text-primary)] font-semibold leading-tight">
              Voice Studio
            </h1>
            <p className="text-[12px] text-[var(--text-secondary)] hidden sm:block">
              Speech synthesis, dialogue, music, sound effects and video dubbing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Draft | Final Switcher */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-2)] p-1 rounded-[var(--radius-buttons)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => handleToggleTier('draft')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                genTier === 'draft'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Draft ($0.05)
            </button>
            <button
              type="button"
              onClick={() => handleToggleTier('final')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                genTier === 'final'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Final ($0.10)
            </button>
          </div>

          {/* Mobile Settings Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileSettingsOpen(true)}
            className="xl:hidden p-2 rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Open Settings"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Mobile Horizontal Tool Scroller */}
      <div className="flex md:hidden overflow-x-auto gap-1.5 p-2 border-b border-[var(--border-subtle)] bg-[var(--bg-1)] no-scrollbar shrink-0">
        {RAIL_GROUPS.flatMap((g) => g.items).map((i) => ({ id: i.id, label: i.label, icon: i.icon, disabled: false })).map((item) => {
          const Icon = item.icon;
          const isActive = activeTool === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => handleSelectTool(item.id as VoiceTool)}
              className={`px-3 py-1.5 rounded-[var(--radius-buttons)] text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed text-[var(--text-tertiary)]'
                  : isActive
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* MAIN STUDIO THREE-COLUMN / TWO-COLUMN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================= 1. LEFT TOOL RAIL (~200px) ================= */}
        <aside className="hidden md:flex w-[200px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-1)] flex-col justify-between py-3 overflow-y-auto">
          <div className="space-y-1 px-2.5">
            {RAIL_GROUPS.map((group, gi) => (
              <React.Fragment key={group.title}>
                <div className={gi === 0 ? '' : 'pt-3'}>
                  <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                    {group.title}
                  </span>
                </div>
                {group.items.map((t) => {
                  const Icon = t.icon;
                  const isSelected = activeTool === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTool(t.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold border-l-2 border-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-2)]'
                      }`}
                    >
                      <Icon size={16} className={`mt-0.5 shrink-0 ${isSelected ? 'text-[var(--accent)]' : ''}`} />
                      <div className="min-w-0">
                        <div className="text-[13px] leading-tight truncate">{t.label}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">{t.caption}</div>
                      </div>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div className="px-3 pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)]">
            ElevenLabs Engine &bull; fal.ai
          </div>
        </aside>

        {/* ================= 2. CENTRE WORK AREA ================= */}
        <main className="flex-1 flex flex-col p-6 overflow-y-auto min-w-0 max-w-4xl mx-auto space-y-5">
          {errorBanner && (
            <div className="p-3 bg-[var(--danger)]/15 border border-[var(--danger)]/30 rounded-[var(--radius-cards)] text-[13px] text-[var(--danger)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-[12px] underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* TOOL: TEXT TO SPEECH */}
          {activeTool === 'tts' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div>
                <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">Text to speech</h2>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Generate human-quality voiceovers with pacing, emotion, and nuance.
                </p>
              </div>

              {/* Model and voice, always visible (also on smaller screens) */}
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                <div>
                  <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Model</span>
                  <TtsModelPicker value={selectedModel} onChange={setSelectedModel} />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Voice</span>
                  {ttsModelInfo(selectedModel).family === 'reference' ? (
                    <div className="h-[calc(100%-1.25rem)] p-3 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-buttons)] text-[11px] text-[var(--text-tertiary)]">
                      Uses a voice clip you upload in Settings
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsVoicePickerOpen(true)}
                      className="w-full h-[calc(100%-1.25rem)] min-h-[64px] p-3 text-left bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-[var(--radius-buttons)] cursor-pointer transition-colors"
                    >
                      <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{activeVoiceObj.name}</div>
                      <div className="text-[11px] text-[var(--accent)]">Change ({modelVoices.length} voices)</div>
                    </button>
                  )}
                </div>
              </div>

              {/* Big writing box */}
              <div className="flex-1 flex flex-col min-h-[300px] bg-[var(--bg-2)] border border-[var(--border-subtle)] focus-within:border-[var(--accent)] rounded-[var(--radius-cards)] p-4 relative shadow-sm transition-all">
                <textarea
                  ref={ttsTextareaRef}
                  value={ttsScript}
                  onChange={(e) => setTtsScript(e.target.value)}
                  placeholder="Type or paste your voiceover script here... (e.g., In the heart of Stockholm, an innovative vision takes shape. Meet CRENORD.)"
                  className="w-full flex-1 bg-transparent text-[15px] leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-hidden resize-none min-h-[220px]"
                />

                {/* Lower metadata counter & live cost */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)]">
                  <div className="tabular-nums">
                    <span className="font-medium text-[var(--text-primary)]">{ttsScript.length}</span>
                    <span className="text-[var(--text-tertiary)]"> / {ttsModelInfo(selectedModel).maxChars.toLocaleString('en-US')} characters</span>
                  </div>
                  <div className="font-semibold text-[var(--accent)] tabular-nums">
                    ≈ ${getToolCost().toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Tag Insertion Hint Chips */}
              <div className="flex items-center gap-2 flex-wrap text-[12px]">
                <span className="text-[var(--text-tertiary)] font-medium">Insert tag:</span>
                {[
                  { label: '[pause]', tag: '[pause]' },
                  { label: '[whisper]', tag: '[whisper]' },
                  { label: '[laugh]', tag: '[laugh]' },
                  { label: '[sigh]', tag: '[sigh]' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => insertTtsTag(item.tag)}
                    className="px-2.5 py-1 bg-[var(--bg-2)] hover:bg-[var(--bg-3)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-mono transition-colors cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Primary Action Button */}
              <div className="space-y-1.5 pt-2">
                <Button
                  variant="primary"
                  size={44}
                  disabled={actionProps.disabled}
                  onClick={handleGenerate}
                  className="w-full text-[14px] font-semibold tracking-wide shadow-md"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating speech...
                    </span>
                  ) : (
                    'Generate speech'
                  )}
                </Button>
                {actionProps.disabledReason && (
                  <p className="text-center text-[12px] text-[var(--text-tertiary)]">
                    {actionProps.disabledReason}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TOOL: DIALOGUE */}
          {activeTool === 'dialogue' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">Dialogue</h2>
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Create conversational multi-character audio scripts in one pass.
                  </p>
                </div>
                <Button variant="secondary" size={32} onClick={addDialogueLine}>
                  <Plus size={14} className="mr-1.5" />
                  Add line
                </Button>
              </div>

              <div className="space-y-3">
                {dialogueLines.map((line, idx) => (
                  <div
                    key={line.id}
                    className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[var(--bg-3)] text-[11px] font-bold text-[var(--text-secondary)] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={line.speaker}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDialogueLines((prev) =>
                              prev.map((l) => (l.id === line.id ? { ...l, speaker: val } : l))
                            );
                          }}
                          placeholder="Speaker name"
                          className="bg-transparent text-[13px] font-semibold text-[var(--text-primary)] border-b border-transparent focus:border-[var(--accent)] outline-hidden w-28"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={line.voice}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDialogueLines((prev) =>
                              prev.map((l) => (l.id === line.id ? { ...l, voice: val } : l))
                            );
                          }}
                          className="bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] px-2.5 py-1 rounded-[var(--radius-buttons)] outline-hidden"
                        >
                          {VOICES_CATALOG.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name} ({v.accent})
                            </option>
                          ))}
                        </select>

                        {dialogueLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDialogueLine(line.id)}
                            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      value={line.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDialogueLines((prev) =>
                          prev.map((l) => (l.id === line.id ? { ...l, text: val } : l))
                        );
                      }}
                      placeholder="Write dialogue line here..."
                      rows={2}
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[13px] text-[var(--text-primary)] p-2.5 rounded-[var(--radius-buttons)] outline-hidden resize-none"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-between text-[12px] text-[var(--text-secondary)]">
                <div>{dialogueLines.length} lines total</div>
                <div className="font-semibold text-[var(--accent)]">
                  ≈ ${getToolCost().toFixed(3)}
                </div>
              </div>

              <div className="space-y-1.5">
                <Button
                  variant="primary"
                  size={44}
                  disabled={actionProps.disabled}
                  onClick={handleGenerate}
                  className="w-full text-[14px] font-semibold"
                >
                  {isGenerating ? 'Generating dialogue...' : 'Generate dialogue'}
                </Button>
                {actionProps.disabledReason && (
                  <p className="text-center text-[12px] text-[var(--text-tertiary)]">
                    {actionProps.disabledReason}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TOOL: SOUND EFFECTS */}
          {activeTool === 'sfx' && (
            <div className="space-y-4">
              <div>
                <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">Sound effects</h2>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Describe any sound effect for product commercials, UI cues, and cinematic impacts.
                </p>
              </div>

              <div className="p-4 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-4">
                <div>
                  <label className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                    Sound Prompt
                  </label>
                  <textarea
                    value={sfxPrompt}
                    onChange={(e) => setSfxPrompt(e.target.value)}
                    placeholder="Describe sound effect... (e.g., Heavy brass hit with reverb trail for trailer intro)"
                    rows={3}
                    className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[14px] text-[var(--text-primary)] p-3 rounded-[var(--radius-buttons)] outline-hidden"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[var(--text-secondary)]">Duration: {sfxDuration}s</span>
                    <span className="text-[var(--text-tertiary)]">1s to 22s</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={22}
                    value={sfxDuration}
                    onChange={(e) => setSfxDuration(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--accent)]"
                  />
                  <div className="flex gap-2">
                    {[2, 4, 8, 15].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSfxDuration(d)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer ${
                          sfxDuration === d
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                  <div>
                    <span className="text-[13px] font-medium text-[var(--text-primary)] block">Seamless loop</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">Optimize audio for continuous looping</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={sfxLoop}
                    onChange={(e) => setSfxLoop(e.target.checked)}
                    className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <Button
                  variant="primary"
                  size={44}
                  disabled={actionProps.disabled}
                  onClick={handleGenerate}
                  className="w-full text-[14px] font-semibold"
                >
                  {isGenerating ? 'Creating effect...' : 'Generate sound effect'}
                </Button>
                <p className="text-center text-[12px] text-[var(--text-tertiary)]">
                  Fixed price: $0.050 per effect &bull; ElevenLabs Sound FX v2
                </p>
              </div>
            </div>
          )}

          {/* TOOL: MUSIC */}
          {activeTool === 'sfx' && <VideoSfxPanel onSubmitted={afterSubmit} />}

          {activeTool === 'music' && <MusicPanel onSubmitted={afterSubmit} />}

          {activeTool === 'separate' && <SeparatePanel onSubmitted={afterSubmit} />}

          {/* TOOL: SPEECH TO TEXT (TRANSCRIPT & CAPTIONS) */}
          {activeTool === 'stt' && (
            <div className="space-y-5">
              <div>
                <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">Speech to text & captions</h2>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Transcribe video or audio with high precision, export subtitles, or burn captions directly into the video.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'stt_scribe_v2', label: 'ElevenLabs Scribe', note: 'Word timing and speakers' },
                  { id: 'stt_wizper', label: 'Whisper (Wizper)', note: 'Cheaper, good for Swedish' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSttModel(m.id as 'stt_scribe_v2' | 'stt_wizper')}
                    className={`text-left px-3 py-2 rounded-[var(--radius-buttons)] border cursor-pointer transition-colors ${
                      sttModel === m.id
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-3)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="block text-[12px] font-semibold">{m.label}</span>
                    <span className="block text-[10px] text-[var(--text-tertiary)] leading-tight">{m.note}</span>
                  </button>
                ))}
              </div>

              {/* Big dropzone / Loaded Player */}
              {!sttSourceUrl ? (
                <div className="space-y-3">
                  <Dropzone
                    accept="video/*,audio/*"
                    maxSizeMb={100}
                    onFileSelect={(f: File) => handleDirectUpload(f, 'stt')}
                    label="Drop a video or audio file to transcribe"
                    caption="MP4, MOV, WEBM, MP3, WAV, M4A up to 100MB"
                  />
                  {videoAssets.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto py-1 text-[12px]">
                      <span className="text-[var(--text-tertiary)] shrink-0">Or choose video:</span>
                      {videoAssets.slice(0, 4).map((va) => (
                        <button
                          key={va.id}
                          type="button"
                          onClick={() => {
                            setSttSourceUrl(va.url);
                            setSttSourceType('video');
                            setSttFileName(va.title || 'Selected Video');
                          }}
                          className="px-2.5 py-1 bg-[var(--bg-2)] hover:bg-[var(--bg-3)] border border-[var(--border-subtle)] rounded-[var(--radius-buttons)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] truncate max-w-[140px] cursor-pointer"
                        >
                          {va.title || 'Video'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                        {sttSourceType === 'video' ? <Film size={20} /> : <FileText size={20} />}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate max-w-sm">
                          {sttFileName || 'Uploaded media file'}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {sttSourceType === 'video' ? 'Video media' : 'Audio track'}{' '}
                          {sttDuration ? `• ${sttDuration}s` : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size={32}
                      onClick={() => {
                        setSttSourceUrl('');
                        setSttFileName('');
                        setSttDuration(null);
                        setTranscriptResult(null);
                      }}
                    >
                      <Trash2 size={14} className="text-[var(--danger)]" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
                    <label className="text-[12px] font-medium text-[var(--text-secondary)]">Language:</label>
                    <select
                      value={sttLanguage}
                      onChange={(e) => setSttLanguage(e.target.value)}
                      className="bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] px-2.5 py-1 rounded-[var(--radius-buttons)]"
                    >
                      {VOICE_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="space-y-1.5">
                <Button
                  variant="primary"
                  size={44}
                  disabled={actionProps.disabled}
                  onClick={handleGenerate}
                  className="w-full text-[14px] font-semibold"
                >
                  {isGenerating ? 'Transcribing...' : 'Transcribe media'}
                </Button>
                {actionProps.disabledReason && (
                  <p className="text-center text-[12px] text-[var(--text-tertiary)]">
                    {actionProps.disabledReason}
                  </p>
                )}
              </div>

              {/* Transcript Result Box */}
              {transcriptResult && (
                <div className="p-4 bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-cards)] space-y-3.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Check size={16} className="text-[var(--success)]" />
                      Transcription Result
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-3)] text-[var(--text-secondary)]">
                      Language: {transcriptResult.language || 'Detected'}
                    </span>
                  </div>

                  <textarea
                    value={transcriptResult.text}
                    onChange={(e) => setTranscriptResult({ ...transcriptResult, text: e.target.value })}
                    rows={6}
                    className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[13px] text-[var(--text-primary)] p-3 rounded-[var(--radius-buttons)] outline-hidden leading-relaxed"
                  />

                  {/* Export Options & Burn Captions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="text-[var(--text-tertiary)]">Export:</span>
                      {(['srt', 'vtt', 'txt', 'json'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => handleExportTranscript(fmt)}
                          className="px-2 py-1 bg-[var(--bg-3)] hover:bg-[var(--bg-4)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-mono rounded border border-[var(--border-subtle)] cursor-pointer"
                        >
                          .{fmt}
                        </button>
                      ))}
                    </div>

                    {sttSourceType === 'video' && (
                      <Button
                        variant="secondary"
                        size={32}
                        disabled={isBurningCaptions}
                        onClick={handleBurnCaptions}
                        className="text-[12px]"
                      >
                        <FileCode size={13} className="mr-1.5 text-[var(--accent)]" />
                        {isBurningCaptions ? 'Burning captions...' : 'Burn captions into video'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TOOL: DUBBING */}
          {activeTool === 'dubbing' && (
            <div className="space-y-4">
              <div>
                <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">Dubbing</h2>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Translate spoken dialogue into 29+ languages while keeping original voices, timing and background music.
                </p>
              </div>

              {!dubSourceUrl ? (
                <Dropzone
                  accept="video/*,audio/*"
                  maxSizeMb={100}
                  onFileSelect={(f: File) => handleDirectUpload(f, 'dub')}
                  label="Drop a video or audio file to dub"
                  caption="MP4, MOV, MP3, WAV up to 100MB"
                />
              ) : (
                <div className="p-4 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                        <Languages size={20} />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate max-w-sm">
                          {dubFileName || 'Uploaded media file'}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {dubSourceType === 'video' ? 'Video media' : 'Audio track'}{' '}
                          {dubDuration ? `• ${dubDuration}s` : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size={32}
                      onClick={() => {
                        setDubSourceUrl('');
                        setDubFileName('');
                        setDubDuration(null);
                      }}
                    >
                      <Trash2 size={14} className="text-[var(--danger)]" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Language and Speaker Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)]">
                <div>
                  <label className="text-[12px] font-semibold text-[var(--text-secondary)] block mb-1.5">
                    Target Language
                  </label>
                  <select
                    value={dubTargetLang}
                    onChange={(e) => setDubTargetLang(e.target.value)}
                    className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] p-2 rounded-[var(--radius-buttons)]"
                  >
                    {VOICE_LANGUAGES.filter((l) => l.code !== 'auto').map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-[var(--text-secondary)] block mb-1.5">
                    Speaker Count
                  </label>
                  <select
                    value={dubNumSpeakers || ''}
                    onChange={(e) => setDubNumSpeakers(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                    className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] p-2 rounded-[var(--radius-buttons)]"
                  >
                    <option value="">Auto-detect speakers</option>
                    <option value="1">1 Speaker</option>
                    <option value="2">2 Speakers</option>
                    <option value="3">3 Speakers</option>
                    <option value="4">4+ Speakers</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <Button
                  variant="primary"
                  size={44}
                  disabled={actionProps.disabled}
                  onClick={handleGenerate}
                  className="w-full text-[14px] font-semibold"
                >
                  {isGenerating ? 'Dubbing media...' : 'Dub media'}
                </Button>
                <p className="text-center text-[12px] text-[var(--text-tertiary)]">
                  {actionProps.disabledReason || `Estimated cost: ≈ $${getToolCost().toFixed(2)} ($0.90 / min)`}
                </p>
              </div>
            </div>
          )}

          {/* TOOL: LIP SYNC */}
          {activeTool === 'lipsync' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'video', label: 'Video lip sync', note: 'Match a video to new speech' },
                  { id: 'photo', label: 'Talking photo', note: 'Make a still face speak' },
                  { id: 'audio2video', label: 'Audio to video', note: 'Create a video from sound' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setLipsyncMode(m.id as 'video' | 'photo' | 'audio2video')}
                    className={`text-left px-3 py-2 rounded-[var(--radius-buttons)] border cursor-pointer transition-colors ${
                      lipsyncMode === m.id
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-3)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="block text-[12px] font-semibold">{m.label}</span>
                    <span className="block text-[10px] text-[var(--text-tertiary)] leading-tight">{m.note}</span>
                  </button>
                ))}
              </div>

              {lipsyncMode === 'photo' && <TalkingPhotoPanel onSubmitted={afterSubmit} />}
              {lipsyncMode === 'audio2video' && <AudioToVideoPanel onSubmitted={afterSubmit} />}
              {lipsyncMode === 'video' && (
                <div className="space-y-4">
              <div>
                <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">Lip sync</h2>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Synchronize an actor's lips in a video to match any speech audio track.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Target Video */}
                <div className="space-y-2">
                  <span className="text-[12px] font-semibold text-[var(--text-secondary)] block">
                    1. Target Video (Actor face)
                  </span>
                  {!lipsyncVideoUrl ? (
                    <Dropzone
                      accept="video/*"
                      maxSizeMb={100}
                      onFileSelect={(f: File) => handleDirectUpload(f, 'lipsync_video')}
                      label="Drop video file"
                      caption="MP4 or MOV with clear face"
                    />
                  ) : (
                    <div className="p-3 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] flex items-center justify-between">
                      <div className="truncate">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                          {lipsyncVideoFileName || 'Video file selected'}
                        </p>
                        <p className="text-[10px] text-[var(--text-secondary)]">
                          {lipsyncVideoDuration ? `${lipsyncVideoDuration}s` : 'Ready'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLipsyncVideoUrl('')}
                        className="text-[var(--danger)] text-[12px] cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Audio Speech */}
                <div className="space-y-2">
                  <span className="text-[12px] font-semibold text-[var(--text-secondary)] block">
                    2. Speech Track (Voiceover)
                  </span>
                  {!lipsyncAudioUrl ? (
                    <Dropzone
                      accept="audio/*"
                      maxSizeMb={50}
                      onFileSelect={(f: File) => handleDirectUpload(f, 'lipsync_audio')}
                      label="Drop audio file"
                      caption="MP3, WAV, M4A speech"
                    />
                  ) : (
                    <div className="p-3 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] flex items-center justify-between">
                      <div className="truncate">
                        <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                          {lipsyncAudioFileName || 'Audio track selected'}
                        </p>
                        <p className="text-[10px] text-[var(--text-secondary)]">Ready</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLipsyncAudioUrl('')}
                        className="text-[var(--danger)] text-[12px] cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Model Choice */}
              <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] flex items-center justify-between">
                <div>
                  <span className="text-[13px] font-semibold text-[var(--text-primary)] block">Lip Sync Model</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">Choose performance & speed tier</span>
                </div>
                <div className="flex rounded-[var(--radius-buttons)] bg-[var(--bg-3)] p-1 border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setLipsyncModel('lipsync_syncso')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                      lipsyncModel === 'lipsync_syncso' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    SyncSO ($0.10/s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLipsyncModel('lipsync_kling')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                      lipsyncModel === 'lipsync_kling' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Kling ($0.14/s)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <Button
                  variant="primary"
                  size={44}
                  disabled={actionProps.disabled}
                  onClick={handleGenerate}
                  className="w-full text-[14px] font-semibold"
                >
                  {isGenerating ? 'Generating lip sync...' : 'Generate lip sync'}
                </Button>
                {actionProps.disabledReason && (
                  <p className="text-center text-[12px] text-[var(--text-tertiary)]">
                    {actionProps.disabledReason}
                  </p>
                )}
              </div>
                </div>
              )}
            </div>
          )}

          {activeTool === 'voice_change' && <VoiceChangerPanel onSubmitted={afterSubmit} />}

          {/* TOOL: VOICES (STUDIO LIBRARY) */}
          {activeTool === 'voices' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">Voice Library</h2>
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Curated roster of 20+ studio-grade voices plus your custom cloned & designed voices.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative w-full sm:w-52">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Search voices..."
                      className="w-full bg-[var(--bg-2)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[12px] text-[var(--text-primary)] pl-8 pr-3 py-1.5 rounded-[var(--radius-buttons)] outline-hidden"
                    />
                  </div>
                  <Button variant="secondary" size={32} onClick={() => setShowCloneModal(true)}>
                    <Plus size={14} className="mr-1.5" />
                    Clone a voice
                  </Button>
                  <Button variant="primary" size={32} onClick={() => setShowDesignModal(true)}>
                    <Sparkles size={14} className="mr-1.5" />
                    Design a voice
                  </Button>
                </div>
              </div>

              {/* My Custom Voices Section */}
              {customVoices.length > 0 && (
                <div className="space-y-2.5 p-3.5 bg-[var(--bg-1)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider">
                        My Custom Voices ({customVoices.length})
                      </h3>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        Saved in your Firestore database &bull; Ready for MiniMax Speech 2.8 HD
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {customVoices
                      .filter((cv) => !librarySearch || cv.name.toLowerCase().includes(librarySearch.toLowerCase()))
                      .map((cv) => {
                        const isSelected = selectedVoice === cv.voiceId || selectedVoice === cv.name;
                        return (
                          <div
                            key={cv.id}
                            className={`p-3.5 bg-[var(--bg-2)] border rounded-[var(--radius-cards)] flex flex-col justify-between gap-2.5 transition-all ${
                              isSelected
                                ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40 shadow-sm'
                                : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-[12px]">
                                    {cv.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                                      {cv.name}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-tertiary)] font-mono truncate">
                                      ID: {cv.voiceId?.slice(0, 16)}...
                                    </div>
                                  </div>
                                </div>
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-500/20 shrink-0">
                                  {cv.source === 'clone' ? 'Cloned ($0.05)' : 'Designed'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                              {cv.audioUrl ? (
                                <button
                                  type="button"
                                  onClick={() => handlePreviewVoice(cv.audioUrl)}
                                  className="px-2 py-1 text-[11px] rounded-[var(--radius-buttons)] bg-[var(--bg-3)] hover:bg-[var(--bg-4)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Play size={11} />
                                  <span>Audition</span>
                                </button>
                              ) : (
                                <span />
                              )}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteCustomVoice(cv.id, e)}
                                  title="Delete custom voice"
                                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVoice(cv.voiceId || cv.name);
                                    setSelectedModel('tts_minimax_28_hd');
                                    handleSelectTool('tts');
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-[var(--radius-buttons)] transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-[var(--accent)] text-white'
                                      : 'bg-[var(--bg-3)] hover:bg-[var(--accent)] text-[var(--text-primary)] hover:text-white'
                                  }`}
                                >
                                  {isSelected ? 'Active Voice' : 'Use in TTS'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Grid of Voices */}
              <div>
                <h3 className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2.5">
                  Studio Voice Catalog
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {VOICES_CATALOG.filter((v) => {
                  if (!librarySearch) return true;
                  const q = librarySearch.toLowerCase();
                  return (
                    v.name.toLowerCase().includes(q) ||
                    v.style.toLowerCase().includes(q) ||
                    v.accent.toLowerCase().includes(q) ||
                    v.tags.some((t) => t.toLowerCase().includes(q))
                  );
                }).map((voice) => {
                  const isSelected = selectedVoice === voice.name;
                  const isPlaying = previewPlayingVoice === voice.name;

                  return (
                    <div
                      key={voice.name}
                      className={`p-4 bg-[var(--bg-2)] border rounded-[var(--radius-cards)] flex flex-col justify-between gap-3 transition-all ${
                        isSelected
                          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40 shadow-sm'
                          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-[12px] text-[var(--text-primary)]">
                              {voice.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-[14px] text-[var(--text-primary)] leading-tight">
                                {voice.name}
                              </div>
                              <div className="text-[11px] text-[var(--text-tertiary)]">
                                {voice.accent} &bull; {voice.gender}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-3)] text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {voice.style}
                          </span>
                        </div>

                        <p className="text-[12px] text-[var(--text-secondary)] line-clamp-2">
                          {voice.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => handlePreviewVoice(voice.name)}
                          className="px-2.5 py-1 text-[11px] rounded-[var(--radius-buttons)] bg-[var(--bg-3)] hover:bg-[var(--bg-4)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                          <span>Preview</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVoice(voice.name);
                            handleSelectTool('tts');
                          }}
                          className={`px-3 py-1 text-[11px] font-semibold rounded-[var(--radius-buttons)] transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--bg-3)] hover:bg-[var(--accent)] text-[var(--text-primary)] hover:text-white'
                          }`}
                        >
                          {isSelected ? 'Active Voice' : 'Use for Speech'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* ================= 3. RIGHT PANEL (320px) ================= */}
        <aside className="hidden xl:flex w-[320px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-1)] flex-col h-full overflow-hidden">
          {/* Right Panel Tabs: Settings vs History */}
          <div className="flex items-center border-b border-[var(--border-subtle)] p-2 gap-1 bg-[var(--bg-1)]">
            <button
              type="button"
              onClick={() => setRightPanelTab('settings')}
              className={`flex-1 py-1.5 text-[12px] font-semibold rounded-[var(--radius-buttons)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                rightPanelTab === 'settings'
                  ? 'bg-[var(--bg-3)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <SlidersHorizontal size={14} />
              <span>Settings</span>
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('history')}
              className={`flex-1 py-1.5 text-[12px] font-semibold rounded-[var(--radius-buttons)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                rightPanelTab === 'history'
                  ? 'bg-[var(--bg-3)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <History size={14} />
              <span>History</span>
              {audioItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[var(--bg-4)] text-[10px] text-[var(--text-secondary)] tabular-nums">
                  {audioItems.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: SETTINGS */}
          {rightPanelTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* a) Voice Card */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">
                  Active Voice
                </label>
                <div
                  onClick={() => setIsVoicePickerOpen(true)}
                  className="p-3 bg-[var(--bg-2)] hover:bg-[var(--bg-3)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-[var(--radius-cards)] flex items-center justify-between transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-[13px] shrink-0">
                      {activeVoiceObj.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] text-[var(--text-primary)] flex items-center gap-1.5">
                        <span>{activeVoiceObj.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-3)] text-[var(--text-tertiary)]">
                          {activeVoiceObj.accent}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        {activeVoiceObj.style} &bull; {activeVoiceObj.tags.join(', ')}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--accent)] font-medium shrink-0 ml-2 group-hover:underline">
                    Change
                  </span>
                </div>
              </div>

              {/* b) Model Select */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">
                    Model
                  </label>
                  {/* Swedish language support badge */}
                  {ttsModelInfo(selectedModel).swedish ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Swedish: yes
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      No Swedish
                    </span>
                  )}
                </div>
                <TtsModelPicker value={selectedModel} onChange={setSelectedModel} />
              </div>

              {/* c) Language Select */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">
                  Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2.5 rounded-[var(--radius-buttons)] outline-hidden"
                >
                  {VOICE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* d) Model-Specific Settings */}

              {/* Kokoro and Orpheus */}
              {selectedModel === 'tts_kokoro' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-2">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--text-secondary)] font-medium">Speed: {speed.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.5" max="2" step="0.05" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} className="w-full accent-[var(--accent)]" />
                  <p className="text-[11px] text-[var(--text-tertiary)]">English only. Very low cost, good for quick drafts.</p>
                </div>
              )}
              {selectedModel === 'tts_orpheus' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)]">
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    English only. Add expression in the text with tags such as &lt;laugh&gt;, &lt;sigh&gt;, &lt;chuckle&gt; or &lt;gasp&gt;.
                  </p>
                </div>
              )}
              {ttsModelInfo(selectedModel).family === 'reference' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)]">
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    This model has no ready voices. It copies the voice from a short audio clip. Upload one below.
                  </p>
                  <div className="mt-3">
                    <ReferenceClip
                      onUrl={(u) => {
                        if (selectedModel === 'tts_index_tts2') setIndexTtsAudioUrl(u);
                        else setChatterboxAudioUrl(u);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* MiniMax Speech 2.8 HD Controls */}
              {selectedModel.startsWith('tts_minimax') && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[var(--text-primary)]">MiniMax Emotion & Modulation</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMinimaxEmotion('happy');
                        setMinimaxVol(1.0);
                        setMinimaxPitch(0);
                        setSpeed(1.0);
                      }}
                      className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)] font-medium block">
                      Emotion
                    </label>
                    <select
                      value={minimaxEmotion}
                      onChange={(e) => setMinimaxEmotion(e.target.value as any)}
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2 rounded outline-hidden capitalize"
                    >
                      {['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'neutral'].map((em) => (
                        <option key={em} value={em}>
                          {em.charAt(0).toUpperCase() + em.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Speed: {speed.toFixed(2)}x</span>
                      <span className="text-[var(--text-tertiary)]">0.5x - 2.0x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Volume: {minimaxVol.toFixed(1)}</span>
                      <span className="text-[var(--text-tertiary)]">0.1 - 2.0</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={2.0}
                      step={0.1}
                      value={minimaxVol}
                      onChange={(e) => setMinimaxVol(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Pitch: {minimaxPitch > 0 ? `+${minimaxPitch}` : minimaxPitch}</span>
                      <span className="text-[var(--text-tertiary)]">-12 to +12</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={minimaxPitch}
                      onChange={(e) => setMinimaxPitch(parseInt(e.target.value, 10))}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>

                  <div className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-3)] p-2.5 rounded border border-[var(--border-subtle)] leading-relaxed">
                    💡 MiniMax supports audio tags like <code className="text-emerald-400">&lt;laughter&gt;</code>, <code className="text-emerald-400">&lt;cough&gt;</code>, and pause tag <code className="text-emerald-400">&lt;break time="1s"/&gt;</code> directly in prompt text.
                  </div>
                </div>
              )}

              {/* Gemini 3.1 Flash TTS Controls */}
              {selectedModel === 'tts_gemini_31_flash' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[var(--text-primary)]">Gemini Style & Controls</span>
                    <button
                      type="button"
                      onClick={() => {
                        setGeminiStyleInstructions('');
                        setGeminiTemperature(1.0);
                      }}
                      className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)] font-medium block">
                      Style instructions
                    </label>
                    <textarea
                      rows={2}
                      value={geminiStyleInstructions}
                      onChange={(e) => setGeminiStyleInstructions(e.target.value)}
                      placeholder="e.g. Enthusiastic podcaster, whispery narrator, calm audiobook reader..."
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2 rounded outline-hidden resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Temperature: {geminiTemperature.toFixed(2)}</span>
                      <span className="text-[var(--text-tertiary)]">0.0 - 2.0</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={2.0}
                      step={0.05}
                      value={geminiTemperature}
                      onChange={(e) => setGeminiTemperature(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>

                  <div className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-3)] p-2.5 rounded border border-[var(--border-subtle)] leading-relaxed">
                    💡 Gemini TTS supports multi-speaker dialogue format, emotion prompts, and SSML pause tags.
                  </div>
                </div>
              )}

              {/* Inworld TTS Controls */}
              {selectedModel === 'tts_inworld' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3.5">
                  <span className="text-[12px] font-bold text-[var(--text-primary)] block">Inworld Audio Settings</span>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)] font-medium block">
                      Sample Rate
                    </label>
                    <select
                      value={inworldSampleRate}
                      onChange={(e) => setInworldSampleRate(parseInt(e.target.value, 10))}
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2 rounded outline-hidden"
                    >
                      <option value={16000}>16 kHz</option>
                      <option value={22050}>22.05 kHz</option>
                      <option value={24000}>24 kHz</option>
                      <option value={44100}>44.1 kHz</option>
                      <option value={48000}>48 kHz (High)</option>
                    </select>
                  </div>
                  <div className="text-[11px] text-amber-300 bg-amber-500/10 p-2.5 rounded border border-amber-500/20 leading-relaxed">
                    ⚠️ Maximum 2,000 characters per generation. Cheapest TTS on fal ($0.01/1k chars). No Swedish support.
                  </div>
                </div>
              )}

              {/* xAI TTS Controls */}
              {selectedModel === 'tts_xai' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3.5">
                  <span className="text-[12px] font-bold text-[var(--text-primary)] block">xAI Settings</span>
                  <div className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-3)] p-2.5 rounded border border-[var(--border-subtle)] leading-relaxed">
                    xAI TTS supports up to 15,000 characters with streaming tag support. Voices: <code className="text-emerald-400">eve</code>, <code className="text-emerald-400">sal</code>. Note: English only (No Swedish).
                  </div>
                </div>
              )}

              {/* Chatterbox TTS Controls */}
              {selectedModel === 'tts_chatterbox' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3.5">
                  <span className="text-[12px] font-bold text-[var(--text-primary)] block">Chatterbox Voice Clone from Clip</span>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Exaggeration: {chatterboxExaggeration.toFixed(2)}</span>
                      <span className="text-[var(--text-tertiary)]">0.0 - 1.0</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={chatterboxExaggeration}
                      onChange={(e) => setChatterboxExaggeration(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)] font-medium block">
                      Reference Audio Clip URL (Optional)
                    </label>
                    <input
                      type="url"
                      value={chatterboxAudioUrl}
                      onChange={(e) => setChatterboxAudioUrl(e.target.value)}
                      placeholder="https://... audio sample to clone style"
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2 rounded outline-hidden"
                    />
                  </div>
                </div>
              )}

              {/* Index TTS 2 Controls */}
              {selectedModel === 'tts_index_tts2' && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[var(--text-primary)]">Index TTS 2 Reference & Emotions</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIndexTtsEmotions({
                          happy: 0,
                          sad: 0,
                          angry: 0,
                          fear: 0,
                          disgust: 0,
                          surprise: 0,
                          calm: 0,
                          neutral: 1.0,
                        });
                      }}
                      className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)] font-medium flex items-center justify-between">
                      <span>Reference Audio URL <span className="text-red-400">*</span></span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">Required</span>
                    </label>
                    <input
                      type="url"
                      required
                      value={indexTtsAudioUrl}
                      onChange={(e) => setIndexTtsAudioUrl(e.target.value)}
                      placeholder="https://... target reference voice audio"
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2 rounded outline-hidden"
                    />
                  </div>

                  <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)] block">
                      8 Emotion Sliders (0.0 to 1.0)
                    </span>
                    {(['happy', 'sad', 'angry', 'fear', 'disgust', 'surprise', 'calm', 'neutral'] as const).map((em) => (
                      <div key={em} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--text-secondary)] capitalize">{em}</span>
                          <span className="text-[var(--text-tertiary)] font-mono">{(indexTtsEmotions[em] || 0).toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={0.0}
                          max={1.0}
                          step={0.05}
                          value={indexTtsEmotions[em] || 0}
                          onChange={(e) =>
                            setIndexTtsEmotions((prev) => ({
                              ...prev,
                              [em]: parseFloat(e.target.value),
                            }))
                          }
                          className="w-full accent-[var(--accent)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ElevenLabs Controls */}
              {selectedModel.startsWith('tts_eleven') && (
                <div className="p-3.5 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[var(--text-primary)]">Voice Settings</span>
                    <button
                      type="button"
                      onClick={handleResetDefaults}
                      className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Reset to default
                    </button>
                  </div>

                  {/* Speed Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Speed: {speed.toFixed(2)}x</span>
                      <span className="text-[var(--text-tertiary)]">0.5x - 2.0x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                      <span>Slower</span>
                      <span>Faster</span>
                    </div>
                  </div>

                  {/* Stability Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Stability: {(stability * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={stability}
                      onChange={(e) => setStability(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                      <span>More variable</span>
                      <span>More stable</span>
                    </div>
                  </div>

                  {/* Similarity Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)] font-medium">Similarity: {(similarityBoost * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={similarityBoost}
                      onChange={(e) => setSimilarityBoost(parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                      <span>Low</span>
                      <span>High</span>
                    </div>
                  </div>

                  {/* Style Exaggeration (for v4 and models that support style) */}
                  {selectedModel === 'tts_eleven_v4' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[var(--text-secondary)] font-medium">Style exaggeration</span>
                        <span className="text-[var(--text-tertiary)]">{(styleExaggeration * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.0}
                        max={1.0}
                        step={0.05}
                        value={styleExaggeration}
                        onChange={(e) => setStyleExaggeration(parseFloat(e.target.value))}
                        className="w-full accent-[var(--accent)]"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                        <span>None</span>
                        <span>Exaggerated</span>
                      </div>
                    </div>
                  )}

                  {/* Speaker Boost Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[12px] text-[var(--text-secondary)] font-medium">Speaker boost</span>
                    <input
                      type="checkbox"
                      checked={useSpeakerBoost}
                      onChange={(e) => setUseSpeakerBoost(e.target.checked)}
                      className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* e) Output Format Select */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">
                  Output Format
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-[var(--bg-2)] p-1 rounded-[var(--radius-buttons)] border border-[var(--border-subtle)]">
                  {(['mp3', 'mp3_high', 'wav', 'opus'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setOutputFormat(fmt)}
                      className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                        outputFormat === fmt
                          ? 'bg-[var(--accent)] text-white font-semibold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {fmt === 'mp3' ? 'MP3' : fmt === 'mp3_high' ? 'MP3 High' : fmt === 'wav' ? 'WAV' : 'Opus'}
                    </button>
                  ))}
                </div>
              </div>

              {/* f) Collapsible Advanced Section */}
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="w-full flex items-center justify-between text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1 cursor-pointer"
                >
                  <span>Advanced</span>
                  {showAdvancedSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showAdvancedSettings && (
                  <div className="mt-3 space-y-3 p-3 bg-[var(--bg-2)] rounded-[var(--radius-cards)] border border-[var(--border-subtle)]">
                    <div>
                      <label className="text-[11px] text-[var(--text-secondary)] block mb-1">
                        Seed (Optional reproducibility)
                      </label>
                      <input
                        type="text"
                        value={customSeed}
                        onChange={(e) => setCustomSeed(e.target.value.replace(/\D/g, ''))}
                        placeholder="Random seed (e.g., 42)"
                        className="w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] px-2.5 py-1.5 rounded-[var(--radius-buttons)]"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[var(--text-secondary)]">Text normalization</span>
                      <input
                        type="checkbox"
                        checked={applyTextNormalization}
                        onChange={(e) => setApplyTextNormalization(e.target.checked)}
                        className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text-secondary)]">Multi-language batch</span>
                        <input
                          type="checkbox"
                          checked={multiLangActive}
                          onChange={(e) => setMultiLangActive(e.target.checked)}
                          className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                      {multiLangActive && (
                        <div className="text-[11px] text-[var(--text-tertiary)]">
                          Generates versions across English, Spanish and French concurrently.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HISTORY */}
          {rightPanelTab === 'history' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {audioItems.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-tertiary)] text-[12px]">
                  No audio generated yet. Your results will appear here automatically.
                </div>
              ) : (
                audioItems.map((item) => {
                  const isPlaying = playingId === item.id;
                  const rating = feedbackRatings[item.id];

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-[var(--radius-cards)] space-y-2.5 transition-all shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => togglePlayAudio(item.url, item.id, item)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                              isPlaying
                                ? 'bg-[var(--accent)] text-white'
                                : 'bg-[var(--bg-3)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-white'
                            }`}
                          >
                            {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                          </button>

                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                              {item.title || item.metadata?.voice || 'Voice Track'}
                            </p>
                            <p className="text-[10px] text-[var(--text-secondary)] truncate">
                              {item.metadata?.voice ? `${item.metadata.voice} • ` : ''}
                              {item.sourceTool || 'Audio'}
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 tabular-nums">
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)] text-[11px]">
                        <div className="flex items-center gap-1">
                          {/* Thumbs up / down */}
                          <button
                            type="button"
                            onClick={() => handleFeedback(item.id, 'positive')}
                            className={`p-1 rounded hover:bg-[var(--bg-3)] transition-colors cursor-pointer ${
                              rating === 'positive' ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'
                            }`}
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFeedback(item.id, 'negative')}
                            className={`p-1 rounded hover:bg-[var(--bg-3)] transition-colors cursor-pointer ${
                              rating === 'negative' ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'
                            }`}
                          >
                            <ThumbsDown size={12} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSoundModalTarget({
                                isOpen: true,
                                video: videoAssets[0] || null,
                                audio: {
                                  url: item.url,
                                  type: item.tags?.includes('music') ? 'music' : item.tags?.includes('sfx') ? 'sfx' : 'voice',
                                  title: item.title,
                                },
                              });
                            }}
                            className="text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                          >
                            <Film size={11} />
                            <span>Use in video</span>
                          </button>

                          <a
                            href={item.url}
                            download={`crenord_${item.id}.mp3`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            title="Download"
                          >
                            <Download size={13} />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </aside>
      </div>

      {/* FIXED BOTTOM MINI-PLAYER WHILE AUDIO IS PLAYING */}
      <AudioMiniPlayer
        item={activePlayingItem}
        isPlaying={Boolean(playingId)}
        onTogglePlay={() => {
          if (activePlayingItem) {
            togglePlayAudio(activePlayingItem.url, activePlayingItem.id, activePlayingItem);
          }
        }}
        onClose={() => {
          audioPlayerRef.current?.pause();
          setPlayingId(null);
          setActivePlayingItem(null);
        }}
        onUseInVideo={
          activePlayingItem
            ? () => {
                setSoundModalTarget({
                  isOpen: true,
                  video: videoAssets[0] || null,
                  audio: {
                    url: activePlayingItem.url,
                    type: activePlayingItem.tags?.includes('music')
                      ? 'music'
                      : activePlayingItem.tags?.includes('sfx')
                      ? 'sfx'
                      : 'voice',
                    title: activePlayingItem.title,
                  },
                });
              }
            : undefined
        }
        audioRef={audioPlayerRef}
      />

      {/* VOICE PICKER POPOVER MODAL */}
      <VoicePickerPopover
        voices={modelVoices.length ? modelVoices : VOICES_CATALOG}
        isOpen={isVoicePickerOpen}
        onClose={() => setIsVoicePickerOpen(false)}
        selectedVoice={selectedVoice}
        onSelectVoice={(name) => setSelectedVoice(name)}
        onPreviewVoice={handlePreviewVoice}
        isPlayingPreview={previewPlayingVoice}
        customVoices={customVoices}
      />

      {/* MOBILE SETTINGS SLIDE-OVER DRAWER */}
      {mobileSettingsOpen && (
        <div className="fixed inset-0 z-50 flex xl:hidden bg-black/60 backdrop-blur-xs">
          <div
            className="w-full max-w-sm ml-auto bg-[var(--bg-1)] h-full flex flex-col p-4 space-y-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <span className="type-h3 text-[16px] text-[var(--text-primary)] font-semibold">Settings</span>
              <button
                type="button"
                onClick={() => setMobileSettingsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Render Settings controls inside mobile sheet */}
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">
                  Active Voice
                </label>
                <div
                  onClick={() => setIsVoicePickerOpen(true)}
                  className="p-3 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] flex items-center justify-between cursor-pointer"
                >
                  <span className="font-semibold text-[13px] text-[var(--text-primary)]">{activeVoiceObj.name}</span>
                  <span className="text-[12px] text-[var(--accent)]">Change</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">
                  Model
                </label>
                <TtsModelPicker value={selectedModel} onChange={setSelectedModel} />
                <div className="mt-1">
                  {ttsModelInfo(selectedModel).swedish ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Swedish: yes
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      No Swedish
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">
                  Speed ({speed.toFixed(2)}x)
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">
                  Stability ({(stability * 100).toFixed(0)}%)
                </label>
                <input
                  type="range"
                  min={0.0}
                  max={1.0}
                  step={0.05}
                  value={stability}
                  onChange={(e) => setStability(parseFloat(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">
                  Output Format
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-[var(--bg-2)] p-1 rounded-[var(--radius-buttons)] border border-[var(--border-subtle)]">
                  {(['mp3', 'mp3_high', 'wav', 'opus'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setOutputFormat(fmt)}
                      className={`py-1 text-[11px] font-medium rounded ${
                        outputFormat === fmt ? 'bg-[var(--accent)] text-white font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                variant="primary"
                size={40}
                onClick={() => setMobileSettingsOpen(false)}
                className="w-full mt-4"
              >
                Apply & Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CLONE VOICE MODAL (MiniMax) */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-[var(--bg-1)] border border-[var(--border-strong)] rounded-[var(--radius-cards)] p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="type-h3 text-[16px] font-semibold text-[var(--text-primary)]">Clone Voice (MiniMax)</h3>
                <p className="text-[11px] text-[var(--text-secondary)]">One-time fee: $0.05 per clone</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCloneModal(false)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-3 rounded-[var(--radius-cards)] text-[11px] space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <span>⚠️</span> 7-Day Temporary Storage Notice
              </div>
              <div>
                Voice clones created with MiniMax on fal.ai expire after 7 days if not converted or saved into a permanent voice provider.
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--text-secondary)] block mb-1">
                  Voice Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. My Podcast Host Voice"
                  value={cloneVoiceName}
                  onChange={(e) => setCloneVoiceName(e.target.value)}
                  className="w-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2.5 rounded-[var(--radius-buttons)] outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-secondary)] block mb-1">
                  Reference Audio URL *
                </label>
                <input
                  type="url"
                  placeholder="https://... clean voice sample recording (MP3 or WAV)"
                  value={cloneAudioUrl}
                  onChange={(e) => setCloneAudioUrl(e.target.value)}
                  className="w-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2.5 rounded-[var(--radius-buttons)] outline-hidden"
                />
                <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">
                  Best results with 10-60 seconds of clean, background-noise-free speech.
                </span>
              </div>

              {/* Mandatory Consent Checkbox */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer bg-[var(--bg-2)] p-2.5 rounded border border-[var(--border-subtle)]">
                  <input
                    type="checkbox"
                    checked={cloneConsentConfirmed}
                    onChange={(e) => setCloneConsentConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[var(--accent)] cursor-pointer"
                  />
                  <span className="text-[11px] text-[var(--text-primary)] font-medium leading-relaxed">
                    I have the right to clone this voice. I certify that I own or have explicit written permission to use and clone this voice audio.
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                variant="secondary"
                size={32}
                onClick={() => setShowCloneModal(false)}
                disabled={isSubmittingVoice}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size={32}
                onClick={handleCloneVoice}
                disabled={isSubmittingVoice || !cloneVoiceName.trim() || !cloneAudioUrl.trim() || !cloneConsentConfirmed}
              >
                {isSubmittingVoice ? 'Cloning ($0.05)...' : 'Clone Voice ($0.05)'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DESIGN VOICE MODAL (MiniMax) */}
      {showDesignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-[var(--bg-1)] border border-[var(--border-strong)] rounded-[var(--radius-cards)] p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="type-h3 text-[16px] font-semibold text-[var(--text-primary)]">Design a Voice (MiniMax)</h3>
                <p className="text-[11px] text-[var(--text-secondary)]">Describe any persona from scratch ($30 / million chars)</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDesignModal(false)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--text-secondary)] block mb-1">
                  Voice Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nordic Storyteller"
                  value={designVoiceName}
                  onChange={(e) => setDesignVoiceName(e.target.value)}
                  className="w-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2.5 rounded-[var(--radius-buttons)] outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-secondary)] block mb-1">
                  Voice Prompt Description *
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. A middle-aged calm deep Scandinavian narrator with a warm resonance and steady pacing..."
                  value={designPrompt}
                  onChange={(e) => setDesignPrompt(e.target.value)}
                  className="w-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2.5 rounded-[var(--radius-buttons)] outline-hidden resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-secondary)] block mb-1">
                  Preview Text (Audition sample)
                </label>
                <textarea
                  rows={2}
                  placeholder="Sample sentence to speak in the audition audio..."
                  value={designPreviewText}
                  onChange={(e) => setDesignPreviewText(e.target.value)}
                  className="w-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] p-2.5 rounded-[var(--radius-buttons)] outline-hidden resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                variant="secondary"
                size={32}
                onClick={() => setShowDesignModal(false)}
                disabled={isSubmittingVoice}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size={32}
                onClick={handleDesignVoice}
                disabled={isSubmittingVoice || !designVoiceName.trim() || !designPrompt.trim()}
              >
                {isSubmittingVoice ? 'Designing...' : 'Design & Generate Voice (~$0.015)'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ADD SOUND MODAL (FOR VIDEO MIXING) */}
      <AddSoundModal
        isOpen={soundModalTarget.isOpen}
        onClose={() => setSoundModalTarget({ isOpen: false, video: null, audio: null })}
        targetVideo={soundModalTarget.video}
        initialAudio={soundModalTarget.audio}
        onSuccess={() => {
          fetchAudioFeed();
          setRightPanelTab('history');
        }}
      />
    </div>
  );
};
