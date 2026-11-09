import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Plus,
  Edit2,
  Check,
  AlertCircle,
  RotateCcw,
  Activity,
  FolderOpen,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../components/ui/Button.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { ResultCard } from '../components/ui/ResultCard.tsx';
import { DetailsDrawer } from '../components/ui/DetailsDrawer.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { Table } from '../components/ui/Table.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { AssetPickerModal, PickableAsset } from '../components/ui/AssetPickerModal.tsx';
import { MediaItem, ProjectItem, JobItem } from '../types/media.ts';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reviewState] = useReviewState();

  const [project, setProject] = useState<ProjectItem | null>(null);
  const [assets, setAssets] = useState<MediaItem[]>([]);
  const [activity, setActivity] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [activeTab, setActiveTab] = useState<'assets' | 'activity'>('assets');
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  const fetchProjectData = async () => {
    if (!id) return;
    setLoading(true);
    setHasError(false);
    try {
      const res = await fetchWithAuth(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Project not found');
      const data = await res.json();
      setProject(data.project);
      setTitle(data.project.name);
      setAssets(data.assets || []);
      setActivity(data.activity || []);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  const handleSaveTitle = async () => {
    if (!title.trim() || !id) return;
    setIsEditingTitle(false);
    try {
      await fetchWithAuth(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: title.trim() }),
      });
    } catch (err: any) {
      alert(`Failed to rename: ${err.message}`);
    }
  };

  const handleAddAssetsToProject = async (chosen: PickableAsset) => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`/api/projects/${id}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: [chosen.id] }),
      });
      if (res.ok) {
        setShowAssetPicker(false);
        fetchProjectData();
      }
    } catch (err: any) {
      alert(`Add asset error: ${err.message}`);
    }
  };

  const handleRemoveAsset = async (assetId: string) => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`/api/projects/${id}/assets/${assetId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
      }
    } catch (err: any) {
      alert(`Remove error: ${err.message}`);
    }
  };

  // Loading State
  if (reviewState === 'loading' || loading) {
    return (
      <div className="space-y-6 pb-24">
        <Skeleton height={20} width={140} />
        <div className="flex items-center justify-between">
          <Skeleton height={34} width={280} />
          <div className="flex gap-2">
            <Skeleton height={40} width={110} rounded="md" />
            <Skeleton height={40} width={110} rounded="md" />
          </div>
        </div>
        <Skeleton height={40} width={200} rounded="md" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={220} rounded="lg" />
          ))}
        </div>
      </div>
    );
  }

  // Error State
  if (reviewState === 'error' || hasError || !project) {
    return (
      <div className="py-12 space-y-6">
        <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-[var(--danger)]" />
          <h2 className="type-h2 text-[var(--danger)]">Failed to load project details</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to connect to project storage or project was deleted.
          </p>
          <Button
            variant="danger"
            size={40}
            icon={<RotateCcw size={16} />}
            onClick={() => fetchProjectData()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      {/* Back Link */}
      <button
        type="button"
        onClick={() => navigate('/projects')}
        className="inline-flex items-center gap-1 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      >
        <ChevronLeft size={16} />
        <span>Back to Projects</span>
      </button>

      {/* Header: Title + Inline Rename + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 px-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--accent)] text-[18px] font-bold text-[var(--text-primary)] outline-none"
                autoFocus
              />
              <Button
                variant="primary"
                size={32}
                icon={<Check size={14} />}
                onClick={handleSaveTitle}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="type-h1 text-[var(--text-primary)]">{project.name}</h1>
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
                title="Rename Project"
              >
                <Edit2 size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size={40}
            icon={<Plus size={16} />}
            onClick={() => setShowAssetPicker(true)}
          >
            Add Assets
          </Button>
        </div>
      </div>

      {/* Sub-header meta */}
      <p className="type-caption text-[var(--text-secondary)] -mt-2">
        {project.description || 'Campaign asset library'} • {assets.length} assets • Updated{' '}
        {new Date(project.updatedAt || project.createdAt).toLocaleDateString()}
      </p>

      {/* Tab Switcher: Assets | Activity */}
      <div className="pt-2">
        <Segmented
          options={[
            { value: 'assets', label: `Assets (${assets.length})` },
            { value: 'activity', label: `Activity (${activity.length})` },
          ]}
          value={activeTab}
          onChange={(v) => setActiveTab(v as any)}
        />
      </div>

      {/* Tab 1: Assets Grid */}
      {activeTab === 'assets' && (
        assets.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={<FolderOpen size={28} className="text-[var(--accent)]" />}
              title="No assets in this project"
              description="Add assets from your studio library or generate new images and videos."
              actionLabel="Add Assets"
              onAction={() => setShowAssetPicker(true)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {assets.map((item) => (
              <div key={item.id} className="relative group">
                <ResultCard
                  item={item}
                  status="done"
                  onOpenDetails={() => setSelectedItem(item)}
                />
                <button
                  type="button"
                  title="Remove from project"
                  onClick={() => handleRemoveAsset(item.id)}
                  className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-[var(--bg-2)]/90 border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:border-[var(--danger)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-sm"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab 2: Activity Table */}
      {activeTab === 'activity' && (
        activity.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={<Activity size={28} className="text-[var(--accent)]" />}
              title="No activity recorded"
              description="Generation jobs and processing runs assigned to this project will appear here."
            />
          </div>
        ) : (
          <Table
            columns={[
              {
                header: 'Status',
                cell: (row) => (
                  <Badge
                    variant={
                      row.status === 'succeeded'
                        ? 'success'
                        : row.status === 'running'
                        ? 'accent'
                        : row.status === 'queued'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {row.status}
                  </Badge>
                ),
              },
              { header: 'Tool', accessorKey: 'tool' },
              { header: 'Model', accessorKey: 'modelKey' },
              {
                header: 'Time',
                cell: (row) => (
                  <span className="tabular-nums text-[12px] text-[var(--text-secondary)]">
                    {row.createdAt ? new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                  </span>
                ),
              },
              {
                header: 'Cost',
                align: 'right',
                cell: (row) => (
                  <span className="font-semibold text-[var(--accent)] tabular-nums">
                    ${(row.estCostUsd || 0).toFixed(3)}
                  </span>
                ),
              },
            ]}
            data={activity}
            keyExtractor={(r) => r.id}
          />
        )
      )}

      {/* Asset Picker Modal */}
      <AssetPickerModal
        isOpen={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        onSelect={handleAddAssetsToProject}
      />

      {/* Details Drawer */}
      <DetailsDrawer
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
};
