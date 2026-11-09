import React, { useState, useEffect } from 'react';
import { Film, Image as ImageIcon, Search } from 'lucide-react';
import { Modal } from './Modal.tsx';
import { fetchWithAuth } from '../../lib/firebase.ts';

export interface PickableAsset {
  id: string;
  url: string;
  type: 'image' | 'video';
  title: string;
  metadata?: any;
  createdAt: string;
}

export interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: PickableAsset) => void;
  filterType?: 'image' | 'video';
}

export const AssetPickerModal: React.FC<AssetPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  filterType,
}) => {
  const [assets, setAssets] = useState<PickableAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const loadAssets = async () => {
      setLoading(true);
      try {
        const query = filterType ? `?type=${filterType}` : '';
        const res = await fetchWithAuth(`/api/assets${query}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.assets)) {
            setAssets(data.assets);
          }
        }
      } catch {
        // Fall back gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAssets();
    return () => {
      isMounted = false;
    };
  }, [isOpen, filterType]);

  const filtered = assets.filter((a) => {
    if (filterType && a.type !== filterType) return false;
    if (!search.trim()) return true;
    return a.title?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose from Assets"
      description="Select an asset from your studio library to load into the workspace"
      maxWidth={680}
    >
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Grid of Assets */}
        {loading ? (
          <div className="py-12 text-center text-[var(--text-secondary)] text-[13px]">
            Loading assets from your library...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-secondary)] text-[13px]">
            No assets found in your library. Upload a file to get started.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[380px] overflow-y-auto pr-1">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => {
                  onSelect(asset);
                  onClose();
                }}
                className="group relative aspect-square rounded-[var(--radius-cards)] border border-[var(--border-subtle)] hover:border-[var(--accent)] overflow-hidden bg-[var(--bg-1)] cursor-pointer text-left transition-all"
              >
                {asset.url ? (
                  asset.type === 'video' ? (
                    <video
                      src={asset.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={asset.url}
                      alt={asset.title}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                    {asset.type === 'video' ? <Film size={24} /> : <ImageIcon size={24} />}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                  <span className="text-[11px] font-medium text-white truncate">
                    {asset.title || 'Untitled asset'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
