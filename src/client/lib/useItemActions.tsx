import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MediaItem } from '../types/media.ts';
import { Toast } from '../components/ui/Toast.tsx';
import { ProjectPickerModal } from '../components/ui/ProjectPickerModal.tsx';
import { addAssetToProject, deleteAsset, downloadMedia, setFavorite, targetPath } from './assetActions.ts';

/**
 * One place that makes the buttons on result cards and in the details drawer work.
 * Use:  const act = useItemActions();
 *       <ResultCard item={act.decorate(item)} onAction={(a) => act.handle(a, item)} onFavoriteToggle={() => act.handle('favorite', item)} />
 *       <DetailsDrawer ... onAction={(a, p) => act.handleFromDrawer(a, p)} />
 *       {act.ui}
 */
export function useItemActions(options?: { onDeleted?: (id: string) => void; onAddSound?: (item: MediaItem) => void }) {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; variant: 'info' | 'success' | 'danger' } | null>(null);
  const [projectFor, setProjectFor] = useState<MediaItem | null>(null);

  const say = (message: string, variant: 'info' | 'success' | 'danger' = 'success') => setToast({ message, variant });

  const handle = useCallback(
    async (action: string, item: MediaItem, extra?: any) => {
      if (!item) return;
      // Placeholders for running jobs have no saved file yet.
      const isPlaceholder = item.id.includes('_placeholder_') || item.id.includes('_out_');
      try {
        switch (action) {
          case 'download': {
            if (!item.url) return say('Nothing to download yet', 'info');
            say('Downloading...', 'info');
            await downloadMedia(item, extra?.format);
            return;
          }
          case 'favorite': {
            if (isPlaceholder) return say('Save it first: wait until the file is ready', 'info');
            const next = !(favorites[item.id] ?? item.isFavorite ?? false);
            setFavorites((f) => ({ ...f, [item.id]: next }));
            try {
              await setFavorite(item.id, next);
            } catch (e) {
              setFavorites((f) => ({ ...f, [item.id]: !next }));
              throw e;
            }
            return;
          }
          case 'addToProject':
            if (isPlaceholder) return say('Wait until the file is ready', 'info');
            setProjectFor(item);
            return;
          case 'delete': {
            if (isPlaceholder) return;
            if (!window.confirm('Delete this file? It disappears from your Assets.')) return;
            await deleteAsset(item.id);
            setHidden((h) => new Set(h).add(item.id));
            options?.onDeleted?.(item.id);
            say('Deleted');
            return;
          }
          case 'addSound':
            options?.onAddSound?.(item);
            return;
          default: {
            if (isPlaceholder && ['edit', 'extend', 'animate', 'clean'].includes(action)) {
              return say('Wait until the file is ready', 'info');
            }
            const path = targetPath(action, item);
            if (path) navigate(path);
          }
        }
      } catch (e: any) {
        say(e?.message || 'Something went wrong', 'danger');
      }
    },
    [favorites, navigate, options]
  );

  const handleFromDrawer = (action: string, payload?: any) => {
    if (!payload) return;
    const item: MediaItem = payload.item || payload;
    return handle(action, item, payload.format ? { format: payload.format } : undefined);
  };

  const decorate = (item: MediaItem): MediaItem =>
    favorites[item.id] === undefined ? item : { ...item, isFavorite: favorites[item.id] };

  const isHidden = (id: string) => hidden.has(id);

  const ui = (
    <>
      <ProjectPickerModal
        isOpen={Boolean(projectFor)}
        onClose={() => setProjectFor(null)}
        onPick={async (projectId, name) => {
          if (!projectFor) return;
          await addAssetToProject(projectId, projectFor.id);
          say(`Added to ${name}`);
        }}
      />
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </>
  );

  return { handle, handleFromDrawer, decorate, isHidden, ui };
}
