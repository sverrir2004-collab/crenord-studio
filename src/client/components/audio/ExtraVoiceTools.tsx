import React, { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { Button } from '../ui/Button.tsx';
import { Dropzone } from '../ui/Dropzone.tsx';
import { fetchWithAuth } from '../../lib/firebase.ts';

/**
 * Voice tools added with the C-batches: music models, video to sound effects, voice changer,
 * stem separation (Demucs), talking photo (Flashtalk) and audio to video (LTX 2.3).
 * Every panel is self-contained: it uploads its own files, starts its own job and shows the result
 * right where you work, so nothing depends on the history list.
 */

// ---------- shared helpers ----------

interface Uploaded {
  url: string;
  name: string;
  type: string;
  duration: number | null;
}

async function uploadFile(file: File): Promise<Uploaded> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithAuth('/api/uploads', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  const dur = typeof data.duration === 'number' && !isNaN(data.duration) ? Math.round(data.duration * 10) / 10 : null;
  return { url: data.url, name: file.name, type: data.type || '', duration: dur };
}

async function postJob(body: Record<string, any>): Promise<any> {
  const res = await fetchWithAuth('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'The job could not be started');
  return data.job;
}

/** Polls the job list until the job has finished. */
function useJob(jobId: string | null) {
  const [job, setJob] = useState<any>(null);
  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetchWithAuth('/api/jobs?limit=30');
        if (res.ok) {
          const data = await res.json();
          const found = (data.jobs || []).find((j: any) => j.id === jobId);
          if (found && !stop) {
            setJob(found);
            if (found.status === 'succeeded' || found.status === 'failed' || found.status === 'canceled') return;
          }
        }
      } catch {}
      if (!stop) setTimeout(tick, 4000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);
  return job;
}

const cardCls = 'p-4 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-4';
const labelCls = 'text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5';
const inputCls =
  'w-full bg-[var(--bg-3)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[14px] text-[var(--text-primary)] p-3 rounded-[var(--radius-buttons)] outline-hidden';
const hintCls = 'text-[11px] text-[var(--text-tertiary)]';

function Header({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="type-h2 text-[18px] text-[var(--text-primary)] font-semibold">{title}</h2>
      <p className="text-[13px] text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string; note?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`text-left px-3 py-2 rounded-[var(--radius-buttons)] border cursor-pointer transition-colors ${
            value === o.id
              ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-primary)]'
              : 'bg-[var(--bg-3)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
          }`}
        >
          <span className="block text-[12px] font-semibold">{o.label}</span>
          {o.note && <span className="block text-[10px] text-[var(--text-tertiary)] leading-tight">{o.note}</span>}
        </button>
      ))}
    </div>
  );
}

/** A file slot: dropzone while empty, a small row with Remove when filled. */
function FileSlot({
  title,
  accept,
  maxSizeMb,
  caption,
  value,
  onChange,
  onError,
}: {
  title: string;
  accept: string;
  maxSizeMb: number;
  caption: string;
  value: Uploaded | null;
  onChange: (f: Uploaded | null) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async (file: File) => {
    setBusy(true);
    try {
      onChange(await uploadFile(file));
    } catch (e: any) {
      onError(e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <span className={labelCls}>{title}</span>
      {value ? (
        <div className="p-3 bg-[var(--bg-3)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{value.name}</p>
            <p className="text-[10px] text-[var(--text-secondary)]">{value.duration ? `${value.duration}s` : 'Ready'}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer"
            aria-label="Remove file"
          >
            <X size={16} />
          </button>
        </div>
      ) : busy ? (
        <div className="p-6 text-center text-[12px] text-[var(--text-secondary)] flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Uploading...
        </div>
      ) : (
        <Dropzone accept={accept} maxSizeMb={maxSizeMb} onFileSelect={pick} label={`Drop file`} caption={caption} />
      )}
    </div>
  );
}

/** Shows the progress and the result of a job in place. */
function JobResult({ job }: { job: any }) {
  if (!job) return null;
  if (job.status === 'failed') {
    return (
      <div className="p-3 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-[13px] text-[var(--danger)]">
        {job.error || 'The job failed.'}
      </div>
    );
  }
  if (job.status !== 'succeeded') {
    return (
      <div className="p-3 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-secondary)] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" />
        {job.status === 'queued' ? 'Waiting in line at the model...' : 'Working on it...'}
      </div>
    );
  }
  const outputs: any[] = job.outputs || [];
  if (outputs.length === 0) {
    return <div className="text-[13px] text-[var(--text-secondary)]">Finished, but the model returned no files.</div>;
  }
  return (
    <div className="space-y-2">
      {outputs.map((o, i) => (
        <div key={o.assetId || i} className="p-3 bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
              {o.title || (o.stem ? `Stem: ${o.stem}` : o.type === 'video' ? 'Video' : `Result ${i + 1}`)}
            </span>
            <a
              href={o.url}
              download
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline shrink-0"
            >
              <Download size={13} /> Download
            </a>
          </div>
          {o.type === 'video' ? (
            <video src={o.url} controls className="w-full rounded-md max-h-[320px] bg-black" />
          ) : (
            <audio src={o.url} controls className="w-full" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Start button + estimated price + job result, shared by all panels. */
function useRunner(onSubmitted?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const run = async (body: Record<string, any>) => {
    setBusy(true);
    setError(null);
    setJobId(null);
    try {
      const created = await postJob(body);
      setJobId(created.id);
      onSubmitted?.();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const working = busy || Boolean(jobId && job && job.status !== 'succeeded' && job.status !== 'failed') || Boolean(jobId && !job);
  return { run, working, error, setError, job };
}

function Footer({
  label,
  working,
  disabled,
  reason,
  cost,
  error,
  job,
  onClick,
}: {
  label: string;
  working: boolean;
  disabled: boolean;
  reason?: string;
  cost: string;
  error: string | null;
  job: any;
  onClick: () => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <Button variant="primary" size={44} disabled={disabled || working} onClick={onClick} className="w-full text-[14px] font-semibold">
        {working ? 'Working...' : label}
      </Button>
      <p className="text-center text-[12px] text-[var(--text-tertiary)]">{reason && disabled ? reason : cost}</p>
      {error && (
        <div className="p-3 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-[13px] text-[var(--danger)]">
          {error}
        </div>
      )}
      <JobResult job={job} />
    </div>
  );
}

// ---------- MUSIC ----------

type MusicModelKey = 'music_sonilo' | 'music_minimax_26' | 'music_cassette' | 'music_eleven';

const MUSIC_MODELS: Array<{ id: MusicModelKey; label: string; note: string; min: number; max: number; vocals: boolean }> = [
  { id: 'music_sonilo', label: 'Sonilo', note: 'Cheap, instrumental, up to 10 min', min: 10, max: 600, vocals: false },
  { id: 'music_minimax_26', label: 'MiniMax 2.6', note: 'Songs with vocals and lyrics', min: 10, max: 180, vocals: true },
  { id: 'music_cassette', label: 'CassetteAI', note: 'Fast, 10 to 180 s', min: 10, max: 180, vocals: false },
  { id: 'music_eleven', label: 'ElevenLabs', note: 'Top quality, $0.80/min', min: 10, max: 120, vocals: true },
];

export const MusicPanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [model, setModel] = useState<MusicModelKey>('music_sonilo');
  const [prompt, setPrompt] = useState('Minimalist dark corporate synthwave with driving modern pulse');
  const [duration, setDuration] = useState(30);
  const [instrumental, setInstrumental] = useState(true);
  const [lyrics, setLyrics] = useState('');
  const [writeLyrics, setWriteLyrics] = useState(true);
  const [tracks, setTracks] = useState(1);
  const { run, working, error, job } = useRunner(onSubmitted);

  const cfg = MUSIC_MODELS.find((m) => m.id === model)!;
  const dur = Math.min(cfg.max, Math.max(cfg.min, duration));
  const cost =
    model === 'music_sonilo'
      ? 0.005 * Math.max(10, dur) * tracks
      : model === 'music_minimax_26'
      ? 0.15
      : model === 'music_cassette'
      ? 0.03
      : (dur / 60) * 0.8;

  const start = () =>
    run({
      tool: 'audio.music',
      modelKey: model,
      input: {
        prompt,
        duration: dur,
        music_length_ms: dur * 1000,
        force_instrumental: cfg.vocals ? instrumental : true,
        is_instrumental: cfg.vocals ? instrumental : true,
        lyrics: cfg.vocals && !instrumental && !writeLyrics ? lyrics : undefined,
        lyrics_optimizer: cfg.vocals && !instrumental ? writeLyrics : undefined,
        num_samples: model === 'music_sonilo' ? tracks : undefined,
        output_format: 'mp3_44100_128',
      },
    });

  return (
    <div className="space-y-4">
      <Header title="Music" text="Make background music or full songs. Pick the model first, the rest adapts." />
      <div className={cardCls}>
        <div>
          <span className={labelCls}>Model</span>
          <Segmented
            value={model}
            onChange={(v) => {
              setModel(v);
              const c = MUSIC_MODELS.find((m) => m.id === v)!;
              setDuration((d) => Math.min(c.max, Math.max(c.min, d)));
            }}
            options={MUSIC_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note }))}
          />
        </div>

        <div>
          <label className={labelCls}>Describe the music</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Chill lofi beats with warm piano and vinyl crackle"
            className={inputCls}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[var(--text-secondary)]">Length: {dur} seconds</span>
            <span className={hintCls}>
              {cfg.min}s to {cfg.max}s
            </span>
          </div>
          <input
            type="range"
            min={cfg.min}
            max={Math.min(cfg.max, model === 'music_sonilo' ? 300 : cfg.max)}
            step={5}
            value={dur}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        {model === 'music_sonilo' && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-primary)]">Number of tracks</span>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTracks(n)}
                  className={`w-8 h-8 rounded text-[12px] font-mono border cursor-pointer ${
                    tracks === n
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {cfg.vocals && (
          <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
            <label className="flex items-center justify-between cursor-pointer">
              <span>
                <span className="text-[13px] font-medium text-[var(--text-primary)] block">Instrumental only</span>
                <span className={hintCls}>No singing</span>
              </span>
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
            </label>
            {!instrumental && model === 'music_minimax_26' && (
              <>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>
                    <span className="text-[13px] font-medium text-[var(--text-primary)] block">Write lyrics for me</span>
                    <span className={hintCls}>The model writes lyrics from your description</span>
                  </span>
                  <input type="checkbox" checked={writeLyrics} onChange={(e) => setWriteLyrics(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
                </label>
                {!writeLyrics && (
                  <div>
                    <label className={labelCls}>Lyrics</label>
                    <textarea
                      value={lyrics}
                      onChange={(e) => setLyrics(e.target.value)}
                      rows={6}
                      placeholder={'[Verse]\nYour lines here\n[Chorus]\nYour chorus here'}
                      className={inputCls}
                    />
                    <p className={hintCls}>Tags like [Verse], [Chorus], [Bridge], [Outro] are supported.</p>
                  </div>
                )}
              </>
            )}
            {!instrumental && model === 'music_eleven' && <p className={hintCls}>ElevenLabs writes its own vocals from your description.</p>}
          </div>
        )}
      </div>

      <Footer
        label="Generate music"
        working={working}
        disabled={!prompt.trim() || (model === 'music_minimax_26' && !instrumental && !writeLyrics && !lyrics.trim())}
        reason={!prompt.trim() ? 'Describe the music first' : 'Write the lyrics or switch on "Write lyrics for me"'}
        cost={`Estimated cost: about $${cost.toFixed(3)}`}
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};

// ---------- SOUND EFFECTS FROM VIDEO ----------

export const VideoSfxPanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [video, setVideo] = useState<Uploaded | null>(null);
  const [model, setModel] = useState<'sfx_sonilo_video' | 'sfx_mirelo_15'>('sfx_sonilo_video');
  const [prompt, setPrompt] = useState('');
  const [samples, setSamples] = useState(1);
  const { run, working, error, setError, job } = useRunner(onSubmitted);

  const sec = video?.duration || 10;
  const cost = model === 'sfx_sonilo_video' ? 0.005 * sec : 0.02 * samples;

  const start = () =>
    run({
      tool: 'audio.sfx',
      modelKey: model,
      input: {
        video_url: video!.url,
        prompt: prompt.trim() || undefined,
        text_prompt: prompt.trim() || undefined,
        duration: model === 'sfx_mirelo_15' ? Math.min(sec, 30) : sec,
        num_samples: model === 'sfx_mirelo_15' ? samples : undefined,
      },
    });

  return (
    <div className={cardCls}>
      <Header title="Sound effects from a video" text="Upload a clip and the model adds fitting sound effects that match the action." />
      <FileSlot
        title="Video"
        accept="video/*"
        maxSizeMb={200}
        caption="MP4 or MOV. Keep it under 60 seconds"
        value={video}
        onChange={setVideo}
        onError={setError}
      />
      <div>
        <span className={labelCls}>Model</span>
        <Segmented
          value={model}
          onChange={setModel}
          options={[
            { id: 'sfx_sonilo_video', label: 'Sonilo', note: 'Auto from video' },
            { id: 'sfx_mirelo_15', label: 'Mirelo 1.5', note: 'Several alternatives' },
          ]}
        />
      </div>
      <div>
        <label className={labelCls}>Hint (optional)</label>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Footsteps on gravel, light wind" className={inputCls} />
      </div>
      {model === 'sfx_mirelo_15' && (
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[var(--text-primary)]">Alternatives</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSamples(n)}
                className={`w-8 h-8 rounded text-[12px] font-mono border cursor-pointer ${
                  samples === n ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      {video && video.duration && video.duration > 60 && <p className={hintCls}>This clip is longer than 60 seconds. Long clips can fail or cost more.</p>}
      <Footer
        label="Make sound effects"
        working={working}
        disabled={!video}
        reason="Upload a video first"
        cost={`Estimated cost: about $${cost.toFixed(3)}`}
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};

// ---------- VOICE CHANGER ----------

const CHANGER_VOICES = ['Aurora', 'Blade', 'Britney', 'Carl', 'Cliff', 'Richard', 'Rico', 'Siobhan', 'Vicky'];

export const VoiceChangerPanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [source, setSource] = useState<Uploaded | null>(null);
  const [voice, setVoice] = useState('Aurora');
  const [ownVoice, setOwnVoice] = useState<Uploaded | null>(null);
  const [useOwn, setUseOwn] = useState(false);
  const [hq, setHq] = useState(false);
  const { run, working, error, setError, job } = useRunner(onSubmitted);

  const start = () =>
    run({
      tool: 'audio.voice_change',
      modelKey: 'voice_changer',
      input: {
        source_audio_url: source!.url,
        target_voice: useOwn ? undefined : voice,
        target_voice_audio_url: useOwn ? ownVoice?.url : undefined,
        high_quality_audio: hq,
        duration: source?.duration || undefined,
      },
    });

  return (
    <div className="space-y-4">
      <Header title="Voice changer" text="Keep what is said and how it is said, but change who is saying it." />
      <div className={cardCls}>
        <FileSlot
          title="1. Original recording"
          accept="audio/*,video/*"
          maxSizeMb={50}
          caption="MP3, WAV or M4A with one speaker"
          value={source}
          onChange={setSource}
          onError={setError}
        />
        <div>
          <span className={labelCls}>2. New voice</span>
          <div className="grid grid-cols-3 gap-1.5">
            {CHANGER_VOICES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setVoice(v);
                  setUseOwn(false);
                }}
                className={`h-9 rounded-[var(--radius-buttons)] text-[12px] font-medium border cursor-pointer ${
                  !useOwn && voice === v
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                    : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between cursor-pointer pt-1">
          <span>
            <span className="text-[13px] font-medium text-[var(--text-primary)] block">Use my own voice sample</span>
            <span className={hintCls}>A short clean clip of the voice you want</span>
          </span>
          <input type="checkbox" checked={useOwn} onChange={(e) => setUseOwn(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
        </label>
        {useOwn && (
          <FileSlot
            title="Voice sample"
            accept="audio/*"
            maxSizeMb={25}
            caption="10 to 30 seconds of one person talking"
            value={ownVoice}
            onChange={setOwnVoice}
            onError={setError}
          />
        )}
        <label className="flex items-center justify-between cursor-pointer">
          <span>
            <span className="text-[13px] font-medium text-[var(--text-primary)] block">High quality</span>
            <span className={hintCls}>48 kHz, takes a bit longer</span>
          </span>
          <input type="checkbox" checked={hq} onChange={(e) => setHq(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
        </label>
      </div>
      <Footer
        label="Change voice"
        working={working}
        disabled={!source || (useOwn && !ownVoice)}
        reason={!source ? 'Upload the recording first' : 'Upload your voice sample or switch it off'}
        cost="Estimated cost: about $0.03"
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};

// ---------- SPLIT AUDIO (DEMUCS) ----------

const STEMS = [
  { id: 'vocals', label: 'Vocals' },
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'other', label: 'Other' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'piano', label: 'Piano' },
];

export const SeparatePanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [source, setSource] = useState<Uploaded | null>(null);
  const [stems, setStems] = useState<string[]>(['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']);
  const { run, working, error, setError, job } = useRunner(onSubmitted);

  const toggle = (id: string) => setStems((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const start = () =>
    run({
      tool: 'audio.separate',
      modelKey: 'tool_demucs',
      input: {
        audio_url: source!.url,
        stems,
        model: 'htdemucs_6s',
        output_format: 'mp3',
        title: source!.name.replace(/\.[^.]+$/, ''),
        duration: source?.duration || undefined,
      },
    });

  return (
    <div className="space-y-4">
      <Header title="Split audio" text="Separate a song or a video's sound into vocals, drums, bass and more." />
      <div className={cardCls}>
        <FileSlot
          title="Audio or video"
          accept="audio/*,video/*"
          maxSizeMb={200}
          caption="MP3, WAV, M4A or a video file"
          value={source}
          onChange={setSource}
          onError={setError}
        />
        <div>
          <span className={labelCls}>Parts to keep</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStems(['vocals'])}
              className="px-2.5 py-1 rounded-full text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              Only vocals
            </button>
            <button
              type="button"
              onClick={() => setStems(['drums', 'bass', 'other', 'guitar', 'piano'])}
              className="px-2.5 py-1 rounded-full text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              Music without vocals
            </button>
            <button
              type="button"
              onClick={() => setStems(STEMS.map((s) => s.id))}
              className="px-2.5 py-1 rounded-full text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              Everything
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            {STEMS.map((s) => (
              <label
                key={s.id}
                className={`flex items-center gap-2 px-3 h-9 rounded-[var(--radius-buttons)] border text-[12px] cursor-pointer ${
                  stems.includes(s.id)
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                    : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                <input type="checkbox" checked={stems.includes(s.id)} onChange={() => toggle(s.id)} className="accent-[var(--accent)]" />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <Footer
        label="Split audio"
        working={working}
        disabled={!source || stems.length === 0}
        reason={!source ? 'Upload a file first' : 'Pick at least one part'}
        cost="Estimated cost: about $0.03"
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};

// ---------- TALKING PHOTO (FLASHTALK) ----------

export const TalkingPhotoPanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [photo, setPhoto] = useState<Uploaded | null>(null);
  const [audio, setAudio] = useState<Uploaded | null>(null);
  const { run, working, error, setError, job } = useRunner(onSubmitted);
  const cost = 0.05 * (audio?.duration || 10);

  const start = () =>
    run({
      tool: 'audio.lipsync',
      modelKey: 'lipsync_flashtalk',
      input: { image_url: photo!.url, audio_url: audio!.url, duration: audio?.duration || 10 },
    });

  return (
    <div className="space-y-4">
      <Header title="Talking photo" text="Make a still photo of a face speak your recording." />
      <div className={cardCls}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FileSlot title="1. Face photo" accept="image/*" maxSizeMb={20} caption="A clear, front-facing photo" value={photo} onChange={setPhoto} onError={setError} />
          <FileSlot title="2. Speech" accept="audio/*" maxSizeMb={50} caption="WAV or MP3 speech" value={audio} onChange={setAudio} onError={setError} />
        </div>
      </div>
      <Footer
        label="Make it talk"
        working={working}
        disabled={!photo || !audio}
        reason={!photo ? 'Upload the face photo' : 'Upload the speech recording'}
        cost={`Estimated cost: about $${cost.toFixed(2)}`}
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};

// ---------- AUDIO TO VIDEO (LTX 2.3) ----------

export const AudioToVideoPanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [audio, setAudio] = useState<Uploaded | null>(null);
  const [image, setImage] = useState<Uploaded | null>(null);
  const [prompt, setPrompt] = useState('A person speaking to the camera, natural motion');
  const [size, setSize] = useState('landscape_16_9');
  const { run, working, error, setError, job } = useRunner(onSubmitted);
  const cost = 0.1 * (audio?.duration || 10);

  const start = () =>
    run({
      tool: 'audio.lipsync',
      modelKey: 'vid_ltx_23_audio2video',
      input: {
        prompt,
        audio_url: audio!.url,
        image_url: image?.url,
        video_size: size,
        duration: audio?.duration || 10,
      },
    });

  return (
    <div className="space-y-4">
      <Header title="Audio to video" text="Turn a recording into a video that moves with the sound. Add a start image to control the look." />
      <div className={cardCls}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FileSlot title="1. Audio" accept="audio/*" maxSizeMb={50} caption="Speech, music or any sound" value={audio} onChange={setAudio} onError={setError} />
          <FileSlot title="2. Start image (optional)" accept="image/*" maxSizeMb={20} caption="Sets the first frame" value={image} onChange={setImage} onError={setError} />
        </div>
        <div>
          <label className={labelCls}>Describe the video</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className={inputCls} />
        </div>
        <div>
          <span className={labelCls}>Shape</span>
          <Segmented
            value={size}
            onChange={setSize}
            options={[
              { id: 'landscape_16_9', label: '16:9' },
              { id: 'portrait_16_9', label: '9:16' },
              { id: 'square_hd', label: '1:1' },
              { id: 'landscape_4_3', label: '4:3' },
            ]}
          />
        </div>
      </div>
      <Footer
        label="Make video"
        working={working}
        disabled={!audio || !prompt.trim()}
        reason={!audio ? 'Upload the audio first' : 'Describe the video'}
        cost={`Estimated cost: about $${cost.toFixed(2)}`}
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};


// ---------- MOTION TRANSFER (Kling 3 Motion Control) ----------

export const MotionTransferPanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [picture, setPicture] = useState<Uploaded | null>(null);
  const [movie, setMovie] = useState<Uploaded | null>(null);
  const [orientation, setOrientation] = useState<'image' | 'video'>('image');
  const [keepSound, setKeepSound] = useState(true);
  const [prompt, setPrompt] = useState('');
  const { run, working, error, setError, job } = useRunner(onSubmitted);
  const seconds = Math.max(1, Math.round(movie?.duration || 5));
  const cost = 0.168 * seconds;

  const start = () =>
    run({
      tool: 'video.edit',
      modelKey: 'vedit_kling_v3_motion',
      input: {
        image_url: picture!.url,
        video_url: movie!.url,
        character_orientation: orientation,
        keep_original_sound: keepSound,
        duration: seconds,
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      },
    });

  return (
    <div className="space-y-4">
      <Header title="Motion transfer" text="Make the person in your picture move exactly like the person in a video." />
      <div className={cardCls}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FileSlot title="1. Character picture" accept="image/*" maxSizeMb={20} caption="Who should move" value={picture} onChange={setPicture} onError={setError} />
          <FileSlot title="2. Movement video" accept="video/*" maxSizeMb={100} caption="The movement to copy (3 to 30 s)" value={movie} onChange={setMovie} onError={setError} />
        </div>
        <div>
          <span className={labelCls}>Which way should the character face?</span>
          <Segmented
            value={orientation}
            onChange={setOrientation}
            options={[
              { id: 'image', label: 'Follow the picture', note: 'Up to 10 s' },
              { id: 'video', label: 'Follow the video', note: 'Up to 30 s' },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={keepSound} onChange={(e) => setKeepSound(e.target.checked)} />
          Keep the sound from the movement video
        </label>
        <div>
          <span className={labelCls}>Extra description (optional)</span>
          <textarea className={inputCls} rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="For example: in a bright kitchen" />
        </div>
      </div>
      <Footer
        label="Transfer the motion"
        working={working}
        disabled={!picture || !movie}
        reason={!picture ? 'Upload the character picture' : 'Upload the movement video'}
        cost={`Estimated cost: about $${cost.toFixed(2)}`}
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};

// ---------- VIRTUAL TRY-ON (FASHN) ----------

export const TryOnPanel: React.FC<{ onSubmitted?: () => void }> = ({ onSubmitted }) => {
  const [person, setPerson] = useState<Uploaded | null>(null);
  const [garment, setGarment] = useState<Uploaded | null>(null);
  const [category, setCategory] = useState<'auto' | 'tops' | 'bottoms' | 'one-pieces'>('auto');
  const { run, working, error, setError, job } = useRunner(onSubmitted);

  const start = () =>
    run({
      tool: 'image.edit',
      modelKey: 'edit_tryon_fashn',
      input: { model_image: person!.url, image_url: person!.url, garment_image: garment!.url, category },
    });

  return (
    <div className="space-y-4">
      <Header title="Virtual try-on" text="Put a piece of clothing from one picture on the person in another." />
      <div className={cardCls}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FileSlot title="1. Person" accept="image/*" maxSizeMb={20} caption="Full or half body, facing the camera" value={person} onChange={setPerson} onError={setError} />
          <FileSlot title="2. Garment" accept="image/*" maxSizeMb={20} caption="The clothing, on a plain background" value={garment} onChange={setGarment} onError={setError} />
        </div>
        <div>
          <span className={labelCls}>Type of garment</span>
          <Segmented
            value={category}
            onChange={setCategory}
            options={[
              { id: 'auto', label: 'Auto' },
              { id: 'tops', label: 'Top' },
              { id: 'bottoms', label: 'Bottom' },
              { id: 'one-pieces', label: 'Dress / one-piece' },
            ]}
          />
        </div>
      </div>
      <Footer
        label="Try it on"
        working={working}
        disabled={!person || !garment}
        reason={!person ? 'Upload the person' : 'Upload the garment'}
        cost="Estimated cost: about $0.08"
        error={error}
        job={job}
        onClick={start}
      />
    </div>
  );
};

// ---------- Reference clip upload for models that copy a voice ----------

export const ReferenceClip: React.FC<{ onUrl: (url: string) => void }> = ({ onUrl }) => {
  const [clip, setClip] = useState<Uploaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <FileSlot
        title="Voice clip"
        accept="audio/*"
        maxSizeMb={20}
        caption="5 to 30 seconds of clear speech"
        value={clip}
        onChange={(f) => {
          setClip(f);
          onUrl(f ? f.url : '');
        }}
        onError={setErr}
      />
      {err && <p className="text-[11px] text-[var(--danger)]">{err}</p>}
    </div>
  );
};
