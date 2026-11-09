/**
 * Helpers that read the result JSON of the models connected in batches C01 to C15.
 * Used by reconcileJobWithFal in jobs.ts.
 */

type AnyObj = Record<string, any>;

function urlOf(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return typeof v.url === 'string' ? v.url : '';
}

/**
 * Every audio file in a result, main file first.
 * - single object:  { audio: { url } } or { audio_file: { url } } (CassetteAI)
 * - Sonilo:         { audio: { url }, audios: [{ url }, ...] }  (all tracks)
 * - Mirelo:         { audio: [{ url }, ...] }                   (list of samples)
 */
export function collectAudioFiles(data: AnyObj): Array<{ url: string }> {
  const out: Array<{ url: string }> = [];
  const seen = new Set<string>();
  const add = (v: any) => {
    const u = urlOf(v);
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push({ url: u });
    }
  };
  if (Array.isArray(data.audio)) data.audio.forEach(add);
  else add(data.audio);
  if (Array.isArray(data.audios)) data.audios.forEach(add);
  add(data.audio_file);
  if (!Array.isArray(data.audio_url)) add(data.audio_url);
  return out;
}

const STEM_NAMES = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'];

/** Demucs: one file per stem. */
export function collectStemFiles(data: AnyObj): Array<{ name: string; url: string }> {
  const out: Array<{ name: string; url: string }> = [];
  for (const name of STEM_NAMES) {
    const u = urlOf(data[name]);
    if (u) out.push({ name, url: u });
  }
  return out;
}

/**
 * Wizper returns chunks [{ timestamp: [start, end], text }].
 * They are mapped to segment entries so the transcript view can build SRT and VTT from them.
 */
export function chunksToWords(chunks: any): Array<{ text: string; start: number; end: number; type: string }> {
  if (!Array.isArray(chunks)) return [];
  const out: Array<{ text: string; start: number; end: number; type: string }> = [];
  for (const c of chunks) {
    const ts = Array.isArray(c?.timestamp) ? c.timestamp : [];
    const start = Number(ts[0]);
    const end = Number(ts[1]);
    const text = String(c?.text ?? '').trim();
    if (!text) continue;
    out.push({
      text,
      start: Number.isFinite(start) ? start : 0,
      end: Number.isFinite(end) ? end : Number.isFinite(start) ? start + 3 : 3,
      type: 'segment',
    });
  }
  return out;
}
