import { fetchWithAuth } from './firebase.ts';
import type { MediaItem } from '../types/media.ts';

/** Shared actions for generated files: download, favourite, delete, projects, hand-off to other pages. */

function extOf(url: string, fallback: string) {
  try {
    const m = new URL(url, window.location.origin).pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return m ? m[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

function safeName(s: string) {
  return (s || 'crenord').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'crenord';
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

async function convertImage(blob: Blob, format: 'png' | 'jpg' | 'webp'): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  if (format === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0);
  const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert image'))), mime, 0.95)
  );
}

/**
 * Downloads a file to the computer (a real download, not a new tab).
 * Falls back to opening the file in a new tab if the browser blocks reading it.
 */
export async function downloadMedia(item: Pick<MediaItem, 'url' | 'title' | 'type' | 'id'>, format?: string): Promise<void> {
  if (!item.url) throw new Error('This file has no link yet');
  const base = safeName(item.title || item.id);
  try {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let blob = await res.blob();
    let ext = extOf(item.url, item.type === 'video' ? 'mp4' : item.type === 'audio' ? 'mp3' : 'png');
    if (item.type === 'image' && format && ['png', 'jpg', 'webp'].includes(format) && format !== ext) {
      blob = await convertImage(blob, format as 'png' | 'jpg' | 'webp');
      ext = format;
    }
    saveBlob(blob, `${base}.${ext}`);
  } catch {
    window.open(item.url, '_blank', 'noopener');
  }
}

export async function setFavorite(id: string, value: boolean): Promise<void> {
  const res = await fetchWithAuth(`/api/assets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isFavorite: value }),
  });
  if (!res.ok) throw new Error('Could not update favourite');
}

export async function deleteAsset(id: string): Promise<void> {
  const res = await fetchWithAuth(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Could not delete');
}

export async function addAssetToProject(projectId: string, assetId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/projects/${encodeURIComponent(projectId)}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetIds: [assetId] }),
  });
  if (!res.ok) throw new Error('Could not add to project');
}

export async function fetchAsset(id: string): Promise<any | null> {
  try {
    const res = await fetchWithAuth(`/api/assets/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.asset || null;
  } catch {
    return null;
  }
}

/** Where a result goes for a given action. Returns null when the action does not navigate. */
export function targetPath(action: string, item: Pick<MediaItem, 'id' | 'type' | 'prompt'>): string | null {
  const id = encodeURIComponent(item.id);
  const prompt = item.prompt ? `&prompt=${encodeURIComponent(item.prompt.slice(0, 1500))}` : '';
  switch (action) {
    case 'edit':
      return `/edit?asset=${id}`;
    case 'extend':
      return `/edit?asset=${id}&tool=extend`;
    case 'animate':
      return `/video?image=${id}${prompt}`;
    case 'clean':
      return `/clean?asset=${id}`;
    case 'reusePrompt':
    case 'reuseSettings':
      return item.type === 'video' ? `/video?${prompt.slice(1)}` : item.type === 'image' ? `/image?${prompt.slice(1)}` : `/audio?${prompt.slice(1)}`;
    default:
      return null;
  }
}
