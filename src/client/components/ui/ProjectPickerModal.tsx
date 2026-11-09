import React, { useEffect, useState } from 'react';
import { Modal } from './Modal.tsx';
import { Button } from './Button.tsx';
import { fetchWithAuth } from '../../lib/firebase.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPick: (projectId: string, projectName: string) => void | Promise<void>;
}

/** Small picker: choose an existing project or create a new one, then call onPick. */
export const ProjectPickerModal: React.FC<Props> = ({ isOpen, onClose, onPick }) => {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetchWithAuth('/api/projects')
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d.projects)) setProjects(d.projects);
      })
      .catch(() => alive && setError('Could not load projects'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const pick = async (id: string, name: string) => {
    setBusy(true);
    try {
      await onPick(id, name);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.project?.id) throw new Error(data.error || 'Could not create project');
      setNewName('');
      await onPick(data.project.id, name);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add to project" maxWidth={420}>
      <div className="space-y-3">
        {loading ? (
          <p className="text-[13px] text-[var(--text-secondary)]">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="text-[13px] text-[var(--text-secondary)]">No projects yet. Create one below.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1.5">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => pick(p.id, p.name)}
                className="w-full text-left px-3 py-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[13px] text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="New project name"
            className="flex-1 bg-[var(--bg-3)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[13px] text-[var(--text-primary)] px-3 py-2 rounded-[var(--radius-buttons)] outline-hidden"
          />
          <Button variant="primary" size={36} disabled={busy || !newName.trim()} onClick={create}>
            Create
          </Button>
        </div>
        {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
      </div>
    </Modal>
  );
};
