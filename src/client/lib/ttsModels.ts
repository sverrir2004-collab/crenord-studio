/**
 * Text to speech models shown in the model picker on the Voice page.
 * `family` decides which voices belong to the model (see voicesForModel).
 * Prices are per 1,000 characters unless `perSecond` is set.
 */
export type VoiceFamily = 'eleven' | 'minimax' | 'gemini' | 'inworld' | 'xai' | 'kokoro' | 'orpheus' | 'reference';

export interface TtsModelInfo {
  key: string;
  provider: string;
  name: string;
  tagline: string;
  per1k: number;
  perSecond?: boolean;
  swedish: boolean;
  maxChars: number;
  family: VoiceFamily;
  defaultVoice: string;
  tags: string[];
  badge?: string;
}

export const TTS_MODELS: TtsModelInfo[] = [
  { key: 'tts_eleven_v4', provider: 'ElevenLabs', name: 'ElevenLabs v4', badge: 'Best quality', tagline: 'Most expressive voice with style control.', per1k: 0.1, swedish: true, maxChars: 5000, family: 'eleven', defaultVoice: 'Rachel', tags: ['Expressive', 'Style', 'Seed'] },
  { key: 'tts_eleven_v4_turbo', provider: 'ElevenLabs', name: 'ElevenLabs v4 Turbo', badge: 'Fast', tagline: 'v4 voices at lower price and faster.', per1k: 0.05, swedish: true, maxChars: 5000, family: 'eleven', defaultVoice: 'Rachel', tags: ['Fast', 'Cheap'] },
  { key: 'tts_eleven_v3', provider: 'ElevenLabs', name: 'ElevenLabs v3', tagline: 'Balanced quality, supports audio tags.', per1k: 0.1, swedish: true, maxChars: 5000, family: 'eleven', defaultVoice: 'Rachel', tags: ['Tags', 'Balanced'] },
  { key: 'tts_multilingual_v2', provider: 'ElevenLabs', name: 'Multilingual v2', tagline: 'Stable across 29 languages.', per1k: 0.1, swedish: true, maxChars: 5000, family: 'eleven', defaultVoice: 'Rachel', tags: ['29 languages'] },
  { key: 'tts_turbo_v25', provider: 'ElevenLabs', name: 'Turbo v2.5', badge: 'Draft', tagline: 'Quick and cheap for drafts.', per1k: 0.05, swedish: true, maxChars: 5000, family: 'eleven', defaultVoice: 'Rachel', tags: ['Draft', 'Cheap'] },
  { key: 'tts_minimax_28_hd', provider: 'MiniMax', name: 'Speech 2.8 HD', badge: 'Emotions', tagline: 'Emotion, pitch and volume control.', per1k: 0.1, swedish: true, maxChars: 5000, family: 'minimax', defaultVoice: 'Wise_Woman', tags: ['Emotion', 'Pitch', 'Volume'] },
  { key: 'tts_minimax_28_turbo', provider: 'MiniMax', name: 'Speech 2.8 Turbo', tagline: 'Faster and cheaper MiniMax voices.', per1k: 0.06, swedish: true, maxChars: 5000, family: 'minimax', defaultVoice: 'Wise_Woman', tags: ['Emotion', 'Fast'] },
  { key: 'tts_gemini_31_flash', provider: 'Google', name: 'Gemini 3.1 Flash TTS', badge: 'Directable', tagline: 'Tell it how to speak in plain words.', per1k: 0.15, swedish: true, maxChars: 5000, family: 'gemini', defaultVoice: 'Kore', tags: ['Style prompt', 'Audio tags', '30 voices'] },
  { key: 'tts_xai', provider: 'xAI', name: 'xAI TTS v1', tagline: 'Natural voices with inline tags.', per1k: 0.015, swedish: false, maxChars: 5000, family: 'xai', defaultVoice: 'eve', tags: ['Tags', 'Cheap'] },
  { key: 'tts_inworld', provider: 'Inworld', name: 'TTS-1.5 Max', badge: 'Cheapest', tagline: 'Lowest price, up to 2,000 characters.', per1k: 0.01, swedish: false, maxChars: 2000, family: 'inworld', defaultVoice: 'Craig (en)', tags: ['Cheapest', 'Fast'] },
  { key: 'tts_kokoro', provider: 'Kokoro', name: 'Kokoro', tagline: 'Light English voices for very low cost.', per1k: 0.02, swedish: false, maxChars: 5000, family: 'kokoro', defaultVoice: 'af_heart', tags: ['English', 'Very cheap'] },
  { key: 'tts_orpheus', provider: 'Orpheus', name: 'Orpheus', tagline: 'Natural, emotive English with laugh and sigh tags.', per1k: 0.05, swedish: false, maxChars: 5000, family: 'orpheus', defaultVoice: 'tara', tags: ['English', 'Emotive'] },
  { key: 'tts_chatterbox', provider: 'Chatterbox', name: 'Chatterbox', badge: 'Clone', tagline: 'Copies a voice from a short clip.', per1k: 0.025, swedish: false, maxChars: 5000, family: 'reference', defaultVoice: 'Rachel', tags: ['Voice from clip'] },
  { key: 'tts_index_tts2', provider: 'Index TTS', name: 'Index TTS 2', badge: 'Clone', tagline: 'Voice from a clip, with emotion control.', per1k: 0.002, perSecond: true, swedish: false, maxChars: 5000, family: 'reference', defaultVoice: 'Rachel', tags: ['Voice from clip', 'Emotion'] },
];

export const ttsModelInfo = (key: string): TtsModelInfo =>
  TTS_MODELS.find((m) => m.key === key) || TTS_MODELS[0];

/** Cost estimate in USD for a script of `chars` characters. */
export function ttsCost(key: string, chars: number): number {
  const m = ttsModelInfo(key);
  if (m.perSecond) return Math.max(1, Math.round(chars / 15)) * m.per1k;
  return (chars / 1000) * m.per1k;
}
