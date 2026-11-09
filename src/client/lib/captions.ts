/**
 * Builds subtitle cues (SRT / VTT) from the word or segment list returned by the transcript models.
 * Scribe returns words with start and end times; Wizper returns whole segments.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

type Word = { text?: string; start?: number; end?: number; type?: string };

const MAX_WORDS = 8;
const MAX_SECONDS = 5;

export function buildCues(words: Word[] | undefined, fallbackText = ''): Cue[] {
  const items = (words || []).filter(
    (w) =>
      w &&
      typeof w.text === 'string' &&
      w.text.trim() &&
      (w.type === undefined || w.type === 'word' || w.type === 'segment') &&
      Number.isFinite(Number(w.start)) &&
      Number.isFinite(Number(w.end))
  );

  if (items.length === 0) {
    const text = fallbackText.trim();
    return text ? [{ start: 0, end: Math.max(3, Math.min(30, text.split(/\s+/).length / 2.5)), text }] : [];
  }

  // Segments are already cues
  if (items.every((w) => w.type === 'segment')) {
    return items.map((w) => ({ start: Number(w.start), end: Math.max(Number(w.end), Number(w.start) + 0.5), text: String(w.text).trim() }));
  }

  const cues: Cue[] = [];
  let cur: { start: number; end: number; words: string[] } | null = null;
  const flush = () => {
    if (cur && cur.words.length) {
      cues.push({ start: cur.start, end: Math.max(cur.end, cur.start + 0.5), text: cur.words.join(' ') });
    }
    cur = null;
  };

  for (const w of items) {
    const start = Number(w.start);
    const end = Number(w.end);
    const text = String(w.text).trim();
    if (!cur) cur = { start, end, words: [] };
    cur.words.push(text);
    cur.end = end;
    const sentenceEnd = /[.!?…]$/.test(text);
    if (cur.words.length >= MAX_WORDS || cur.end - cur.start >= MAX_SECONDS || (sentenceEnd && cur.words.length >= 3)) {
      flush();
    }
  }
  flush();
  return cues;
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, '0');
}

function stamp(t: number, sep: ',' | '.') {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}
