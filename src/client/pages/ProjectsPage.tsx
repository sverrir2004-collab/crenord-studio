import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Search,
  MoreVertical,
  AlertCircle,
  RotateCcw,
  Edit2,
  Trash2,
  Check,
} from 'lucide-react';
import { Button } from '../components/ui/Button.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { ProjectItem } from '../types/media.ts';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const [reviewState] = useReviewState();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  // New Project Form State
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedPalette, setSelectedPalette] = useState<[string, string, string, string]>([
    '#101217',
    '#1a202d',
    '#222938',
    '#141720',
  ]);

  // Rename State
  const [renamingProject, setRenamingProject] = useState<ProjectItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const colorPalettes: [string, string, string, string][] = [
    ['#101217', '#1a202d', '#222938', '#141720'],
    ['#0d1117', '#172132', '#1b2336', '#121824'],
    ['#13171f', '#202635', '#161920', '#1c202a'],
    ['#0f131a', '#1e2430', '#19202c', '#0a0e14'],
  ];

  const fetchProjects = async () => {
    setLoading(true);
    setHasError(false);
    try {
      const res = await fetchWithAuth('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      if (Array.isArray(data.projects)) {
        setProjects(data.projects);
      }
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const filteredProjects = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
  });

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetchWithAuth('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
          collageColors: selectedPalette,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create project');
      }

      const data = await res.json();
      setProjects((prev) => [data.project, ...prev]);
      setShowNewModal(false);
      setNewName('');
      setNewDesc('');
    } catch (err: any) {
      alert(`Creation error: ${err.message}`);
    }
  };

  const handleRenameProject = async () => {
    if (!renamingProject || !renameValue.trim()) return;
    try {
      const res = await fetchWithAuth(`/api/projects/${renamingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      if (!res.ok) throw new Error('Rename failed');

      setProjects((prev) =>
        prev.map((p) => (p.id === renamingProject.id ? { ...p, name: renameValue.trim() } : p))
      );
      setRenamingProject(null);
    } catch (err: any) {
      alert(`Rename error: ${err.message}`);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const res = await fetchWithAuth(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');

      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Loading State
  if (reviewState === 'loading' || loading) {
    return (
      <div className="space-y-8 pb-24">
        <div className="flex items-center justify-between">
          <Skeleton height={34} width={140} />
          <Skeleton height={40} width={140} rounded="md" />
        </div>
        <Skeleton height={40} width={300} rounded="md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={260} rounded="lg" />
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
          <h2 className="type-h2 text-[var(--danger)]">Failed to load projects</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to connect to the project repository.
          </p>
          <Button
            variant="danger"
            size={40}
            icon={<RotateCcw size={16} />}
            onClick={() => fetchProjects()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-28">
      {/* Header: H1 'Projects' + New Project Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="type-h1 text-[var(--text-primary)]">Projects</h1>
          <p className="type-caption text-[var(--text-secondary)]">
            Group assets into branded marketing campaigns and creative tracks.
          </p>
        </div>
        <Button
          variant="primary"
          size={40}
          icon={<Plus size={16} />}
          onClick={() => setShowNewModal(true)}
        >
          New Project
        </Button>
      </div>

      {/* Search Input */}
      <div className="max-w-md relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-4 rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {/* Main Grid or Empty State */}
      {projects.length === 0 ? (
        <div className="py-20">
          <EmptyState
            icon={<FolderKanban size={28} className="text-[var(--accent)]" />}
            title="No projects yet"
            description="Create your first project to bundle creative assets into structured client campaigns."
            actionLabel="New Project"
            onAction={() => setShowNewModal(true)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredProjects.map((p) => {
            const colors = p.collageColors || ['#101217', '#1a202d', '#222938', '#141720'];
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="group p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all cursor-pointer flex flex-col justify-between space-y-4 hover:shadow-[var(--shadow-card)]"
              >
                {/* 2x2 Collage Thumbnail Header */}
                <div className="w-full aspect-[16/10] rounded-[var(--radius-buttons)] overflow-hidden grid grid-cols-2 grid-rows-2 gap-1 p-1 bg-[var(--bg-3)] border border-[var(--border-subtle)]">
                  <div className="rounded-[4px]" style={{ background: colors[0] }} />
                  <div className="rounded-[4px]" style={{ background: colors[1] }} />
                  <div className="rounded-[4px]" style={{ background: colors[2] }} />
                  <div className="rounded-[4px]" style={{ background: colors[3] }} />
                </div>

                {/* Info & Meta */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title="Rename project"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingProject(p);
                          setRenameValue(p.name);
                        }}
                        className="p-1 rounded hover:bg-[var(--bg-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        title="Delete project"
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="p-1 rounded hover:bg-[var(--danger-soft)] text-[var(--text-secondary)] hover:text-[var(--danger)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="type-caption text-[var(--text-secondary)] line-clamp-2">
                    {p.description || 'Campaign asset library'}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] pt-2 border-t border-[var(--border-subtle)] tabular-nums">
                  <span>{p.assetCount} assets</span>
                  <span>{new Date(p.updatedAt || p.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Create New Project"
        description="Set up a new campaign library to organize generated assets."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" size={32} onClick={() => setShowNewModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size={32}
              disabled={!newName.trim()}
              onClick={handleCreateProject}
            >
              Create Project
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--text-primary)]">
              Project Name
            </label>
            <input
              type="text"
              placeholder="e.g. Autumn Perfume Campaign 2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full h-10 px-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--text-primary)]">
              Description (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Campaign creative brief, formats required..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full p-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-[var(--text-primary)]">
              Cover Theme Palette
            </label>
            <div className="grid grid-cols-4 gap-2">
              {colorPalettes.map((palette, idx) => {
                const isSelected = selectedPalette[0] === palette[0] && selectedPalette[1] === palette[1];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPalette(palette)}
                    className={`h-12 rounded-[var(--radius-buttons)] overflow-hidden grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5 border cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div style={{ background: palette[0] }} />
                    <div style={{ background: palette[1] }} />
                    <div style={{ background: palette[2] }} />
                    <div style={{ background: palette[3] }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal
        isOpen={Boolean(renamingProject)}
        onClose={() => setRenamingProject(null)}
        title="Rename Project"
        description="Update the project title."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" size={32} onClick={() => setRenamingProject(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size={32}
              disabled={!renameValue.trim()}
              onClick={handleRenameProject}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-[var(--text-primary)]">
            Project Name
          </label>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full h-10 px-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </Modal>
    </div>
  );
};
