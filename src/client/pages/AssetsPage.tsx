import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  Search,
  Star,
  Download,
  FolderPlus,
  Trash2,
  X,
  AlertCircle,
  RotateCcw,
  Check,
  Film,
  Image as ImageIcon,
  SlidersHorizontal,
  FolderKanban,
} from 'lucide-react';
import { Button } from '../components/ui/Button.tsx';
import { Chip } from '../components/ui/Chip.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { useItemActions } from '../lib/useItemActions.tsx';
import { ResultCard } from '../components/ui/ResultCard.tsx';
import { DetailsDrawer } from '../components/ui/DetailsDrawer.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Dropzone } from '../components/ui/Dropzone.tsx';
import { MediaItem, ProjectItem } from '../types/media.ts';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';

export const AssetsPage: React.FC = () => {
  const navigate = useNavigate();
  const [reviewState] = useReviewState();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const act = useItemActions({
    onDeleted: (id) => {
      setItems((prev) => prev.filter((it) => it.id !== id));
      setSelectedItem(null);
    },
  });

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'generated' | 'uploaded' | 'edited' | 'cleaned'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [gridSize, setGridSize] = useState<'S' | 'M' | 'L'>('M');

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTargetAsset, setExportTargetAsset] = useState<MediaItem | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    new Set(['9:16', '1:1', '4:5', '16:9'])
  );
  const [isExporting, setIsExporting] = useState(false);

  // Projects for Add To Project modal
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Fetch real assets from API
  const fetchAssets = async () => {
    setLoading(true);
    setHasError(false);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (favoritesOnly) params.append('isFavorite', 'true');
      if (search.trim()) params.append('search', search.trim());
      if (sortOrder !== 'newest') params.append('sort', sortOrder);

      const res = await fetchWithAuth(`/api/assets?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch assets');
      const data = await res.json();
      if (Array.isArray(data.assets)) {
        setItems(data.assets);
      }
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [typeFilter, sourceFilter, favoritesOnly, sortOrder]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAssets();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Selection toggle
  const toggleSelect = (id: string, select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (select) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Toggle Favorite
  const toggleFavorite = async (id: string) => {
    const target = items.find((it) => it.id === id);
    if (!target) return;
    const newFav = !target.isFavorite;

    // Optimistic update
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, isFavorite: newFav } : it))
    );

    try {
      await fetchWithAuth(`/api/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: newFav }),
      });
    } catch {
      // Revert if failed
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, isFavorite: !newFav } : it))
      );
    }
  };

  // Bulk Soft Delete
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);

    // Optimistic delete
    setItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
    setSelectedIds(new Set());

    try {
      await fetchWithAuth('/api/assets/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      fetchAssets();
    }
  };

  // Bulk Add to Project
  const handleOpenAddToProject = async () => {
    try {
      const res = await fetchWithAuth('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjectsList(data.projects || []);
        if (data.projects && data.projects.length > 0) {
          setSelectedProjectId(data.projects[0].id);
        }
      }
    } catch {}
    setShowProjectModal(true);
  };

  const handleConfirmAddToProject = async () => {
    if (!selectedProjectId || selectedIds.size === 0) return;
    try {
      const res = await fetchWithAuth('/api/assets/bulk-assign-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          projectId: selectedProjectId,
        }),
      });
      if (res.ok) {
        alert('Assets added to project successfully.');
        setSelectedIds(new Set());
        setShowProjectModal(false);
      }
    } catch (err: any) {
      alert(`Failed to add to project: ${err.message}`);
    }
  };

  // Real File Upload
  const handleFileUpload = async (file: File) => {
    setShowUploadModal(false);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetchWithAuth('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      await fetchAssets();
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
      setLoading(false);
    }
  };

  // Real Export Formats (sharp / ffmpeg zip)
  const handleOpenExportModal = (item?: MediaItem) => {
    const target = item || items.find((it) => selectedIds.has(it.id)) || items[0];
    if (!target) {
      alert('Please select an asset to export');
      return;
    }
    setExportTargetAsset(target);
    setShowExportModal(true);
  };

  const handleTriggerExport = async () => {
    if (!exportTargetAsset) return;
    setIsExporting(true);

    try {
      const res = await fetchWithAuth(`/api/assets/${exportTargetAsset.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formats: Array.from(selectedFormats) }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportTargetAsset.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_formats.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleFormat = (ratio: string) => {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(ratio)) next.delete(ratio);
      else next.add(ratio);
      return next;
    });
  };

  const gridColsClass = {
    S: 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3',
    M: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4',
    L: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6',
  }[gridSize];

  // Loading State
  if (reviewState === 'loading' || loading) {
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between">
          <Skeleton height={34} width={160} />
          <Skeleton height={40} width={120} rounded="md" />
        </div>
        <Skeleton height={48} className="w-full rounded-[var(--radius-buttons)]" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} height={220} rounded="lg" />
          ))}
        </div>
      </div>
    );
  }

  // Error State
  if (reviewState === 'error' || hasError) {
    return (
      <div className="py-12 space-y-6">
        <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-[var(--danger)]" />
          <h2 className="type-h2 text-[var(--danger)]">Failed to load asset library</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to connect to the studio assets database.
          </p>
          <Button
            variant="danger"
            size={40}
            icon={<RotateCcw size={16} />}
            onClick={() => fetchAssets()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      {/* Header: Title + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="type-h1 text-[var(--text-primary)]">Assets</h1>
          <p className="type-caption text-[var(--text-secondary)]">
            Media library with non-AI resizing, export bundles, and campaign organization.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size={40}
            icon={<SlidersHorizontal size={14} />}
            onClick={() => handleOpenExportModal()}
          >
            Export Formats
          </Button>
          <Button
            variant="primary"
            size={40}
            icon={<UploadCloud size={16} />}
            onClick={() => setShowUploadModal(true)}
          >
            Upload Media
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <input
              type="text"
              placeholder="Search assets by title, model, or prompt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Type Segmented */}
          <Segmented
            options={[
              { value: 'all', label: 'All' },
              { value: 'image', label: 'Images' },
              { value: 'video', label: 'Videos' },
              { value: 'audio', label: 'Voice' },
            ]}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as any)}
            size="sm"
          />

          {/* Sort Selector */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="h-9 px-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] outline-none cursor-pointer"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Name</option>
          </select>

          {/* Favorites Filter */}
          <button
            type="button"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`h-9 px-3 rounded-[var(--radius-buttons)] border text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              favoritesOnly
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Star size={14} className={favoritesOnly ? 'fill-[var(--accent)]' : ''} />
            <span>Starred</span>
          </button>

          {/* Size Control: S, M, L */}
          <div className="flex items-center gap-1 bg-[var(--bg-3)] p-1 rounded-md border border-[var(--border-subtle)]">
            {(['S', 'M', 'L'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setGridSize(s)}
                className={`w-7 h-7 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                  gridSize === s
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Source Sub-filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--border-subtle)]">
          <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mr-2">
            Source:
          </span>
          {[
            { id: 'all', label: 'All Sources' },
            { id: 'generated', label: 'Generated' },
            { id: 'edited', label: 'Edited' },
            { id: 'cleaned', label: 'Cleaned' },
            { id: 'uploaded', label: 'Uploaded' },
          ].map((src) => (
            <Chip
              key={src.id}
              selected={sourceFilter === src.id}
              onClick={() => setSourceFilter(src.id as any)}
            >
              {src.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Main Grid or Empty State */}
      {items.length === 0 ? (
        <div className="py-20">
          <EmptyState
            icon={<UploadCloud size={28} className="text-[var(--accent)]" />}
            title="No assets found"
            description="Generate images, animate videos, or upload campaign assets to build your studio library."
            actionLabel="Upload Media"
            onAction={() => setShowUploadModal(true)}
          />
        </div>
      ) : (
        <div className={`grid ${gridColsClass}`}>
          {items.map((item) => (
            <ResultCard
              key={item.id}
              item={item}
              status="done"
              isSelected={selectedIds.has(item.id)}
              onSelect={(sel) => toggleSelect(item.id, sel)}
              onFavoriteToggle={() => toggleFavorite(item.id)}
              onOpenDetails={() => setSelectedItem(item)}
              onAction={(action) => {
                if (action === 'export') handleOpenExportModal(item);
                else if (action === 'delete') {
                  setSelectedIds(new Set([item.id]));
                  handleDeleteSelected();
                } else act.handle(action, item);
              }}
            />
          ))}
        </div>
      )}

      {/* Floating Selection Bar for Bulk Actions */}
      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions bar"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-full bg-[var(--bg-2)]/95 backdrop-blur border border-[var(--border-strong)] shadow-[var(--shadow-popover)] flex items-center gap-4 animate-in fade-in slide-in-from-bottom-3 duration-150"
        >
          <div className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums pl-1">
            {selectedIds.size} selected
          </div>

          <div className="h-4 w-[1px] bg-[var(--border-strong)]" />

          {/* Bulk Download */}
          <button
            type="button"
            onClick={() => {
              items
                .filter((it) => selectedIds.has(it.id) && it.url)
                .forEach((it) => {
                  const a = document.createElement('a');
                  a.href = it.url!;
                  a.download = it.title || 'asset';
                  a.target = '_blank';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-[var(--bg-3)] text-[12px] font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <Download size={14} />
            <span>Download</span>
          </button>

          {/* Bulk Add to Project */}
          <button
            type="button"
            onClick={handleOpenAddToProject}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-[var(--bg-3)] text-[12px] font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <FolderPlus size={14} />
            <span>Add to project</span>
          </button>

          {/* Bulk Soft Delete */}
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--danger-soft)] hover:bg-[var(--danger)] text-[12px] font-medium text-[var(--danger)] hover:text-white transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Export Formats Modal: uses sharp or ffmpeg on server, returns .zip */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Ad Aspect Formats"
        description="Select the standard commercial aspect ratios. The server uses sharp or ffmpeg (no AI, cost 0) and bundles a .zip."
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size={32}
              onClick={() => setShowExportModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size={32}
              disabled={isExporting || selectedFormats.size === 0}
              onClick={handleTriggerExport}
            >
              {isExporting ? 'Generating ZIP...' : 'Export Selected (.zip)'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { ratio: '9:16', label: 'Story & Reels', desc: '1080 x 1920' },
              { ratio: '1:1', label: 'Square Feed', desc: '1080 x 1080' },
              { ratio: '4:5', label: 'Portrait Feed', desc: '1080 x 1350' },
              { ratio: '16:9', label: 'Landscape Banner', desc: '1920 x 1080' },
            ].map((fmt) => {
              const isSelected = selectedFormats.has(fmt.ratio);
              return (
                <div
                  key={fmt.ratio}
                  onClick={() => toggleFormat(fmt.ratio)}
                  className={`p-3 rounded-[var(--radius-buttons)] border flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                      : 'bg-[var(--bg-3)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <div>
                    <span className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">
                      {fmt.ratio}
                    </span>
                    <div className="type-caption text-[var(--text-secondary)]">{fmt.label}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{fmt.desc}</div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center ${
                      isSelected ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border-strong)]'
                    }`}
                  >
                    {isSelected && <Check size={12} strokeWidth={2.5} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Assets to CRENORD"
        description="Supported formats: JPG, PNG, WEBP, MP4, MOV, WEBM (Images up to 25 MB, Videos up to 500 MB)"
      >
        <Dropzone onFileSelect={handleFileUpload} />
      </Modal>

      {/* Add to Project Modal */}
      <Modal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        title="Add to Project"
        description="Select a campaign project to assign the selected assets."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" size={32} onClick={() => setShowProjectModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size={32}
              disabled={!selectedProjectId}
              onClick={handleConfirmAddToProject}
            >
              Add Assets
            </Button>
          </div>
        }
      >
        {projectsList.length === 0 ? (
          <div className="text-center py-6 text-[13px] text-[var(--text-secondary)]">
            No projects found. Create one in the Projects page first.
          </div>
        ) : (
          <div className="space-y-2">
            {projectsList.map((p) => (
              <label
                key={p.id}
                className={`p-3 rounded-[var(--radius-buttons)] border flex items-center justify-between cursor-pointer transition-colors ${
                  selectedProjectId === p.id
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                    : 'bg-[var(--bg-3)] border-[var(--border-subtle)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FolderKanban size={16} className="text-[var(--accent)]" />
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">
                    {p.name}
                  </span>
                </div>
                <input
                  type="radio"
                  name="projectSelect"
                  checked={selectedProjectId === p.id}
                  onChange={() => setSelectedProjectId(p.id)}
                  className="accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
        )}
      </Modal>

      {/* Details Drawer */}
      <DetailsDrawer
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        onAction={act.handleFromDrawer}
      />
      {act.ui}
    </div>
  );
};
