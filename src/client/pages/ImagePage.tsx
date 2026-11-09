import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Copy,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Segmented } from '../components/ui/Segmented.tsx';
import { PromptBar, PromptBarSubmitPayload } from '../components/ui/PromptBar.tsx';
import { ResultCard } from '../components/ui/ResultCard.tsx';
import { DetailsDrawer } from '../components/ui/DetailsDrawer.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { Button } from '../components/ui/Button.tsx';
import { MediaItem } from '../types/media.ts';
import { useReviewState } from '../lib/useReviewState.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { db, fetchWithAuth } from '../lib/firebase.ts';
import { AssetPickerModal } from '../components/ui/AssetPickerModal.tsx';

export interface FeedJobItem {
  id: string;
  uid: string;
  tool: string;
  modelKey: string;
  modelLabel?: string;
  falRequestId?: string | null;
  input: {
    prompt: string;
    imageUrl?: string;
    scene?: string;
    variants?: number;
    resolution?: string;
    image_size?: string;
    format?: string;
    output_format?: string;
  };
  estCostUsd: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress?: number;
  error?: string | null;
  outputs?: Array<{
    assetId: string;
    url: string;
    type: 'image';
    width?: number;
    height?: number;
  }>;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export const ImagePage: React.FC = () => {
  const { user } = useAuth();
  const [reviewState] = useReviewState();
  const [mode, setMode] = useState<'text-to-image' | 'product-scene'>('text-to-image');
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  // Cost guard blocking state
  const [isCostBlocked, setIsCostBlocked] = useState(false);
  const [costBlockedMessage, setCostBlockedMessage] = useState<string>('');

  // Feed of real jobs from Firestore / API
  const [jobs, setJobs] = useState<FeedJobItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  // Product Scene 5-step state
  const [productPhotoUploaded, setProductPhotoUploaded] = useState(false);
  const [productPhotoUrl, setProductPhotoUrl] = useState<string | null>(null);
  const [productPhotoName, setProductPhotoName] = useState<string>('');
  const [uploadingProductPhoto, setUploadingProductPhoto] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedScene, setSelectedScene] = useState<string>('Marble counter');

  // Elapsed timers for running jobs
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});
  const pollingJobsRef = useRef<Set<string>>(new Set());

  const scenePresets = [
    { name: 'Marble counter', gradient: 'linear-gradient(135deg, #101217 0%, #1c202a 100%)' },
    { name: 'Studio white', gradient: 'linear-gradient(135deg, #161920 0%, #202635 100%)' },
    { name: 'Wooden table', gradient: 'linear-gradient(135deg, #13171f 0%, #1a1e29 100%)' },
    { name: 'Outdoor garden', gradient: 'linear-gradient(135deg, #0d1219 0%, #1a232f 100%)' },
    { name: 'Kitchen morning', gradient: 'linear-gradient(135deg, #141720 0%, #222938 100%)' },
    { name: 'Bathroom shelf', gradient: 'linear-gradient(135deg, #11141a 0%, #1d232e 100%)' },
    { name: 'Neon night', gradient: 'linear-gradient(135deg, #090e16 0%, #161d2d 100%)' },
    { name: 'Seasonal', gradient: 'linear-gradient(135deg, #0e1218 0%, #1e283b 100%)' },
  ];

  // 1. Initial Load & Real-Time Sync with Firestore
  useEffect(() => {
    if (!user) return;
    let unsubscribe: (() => void) | null = null;

    try {
      const q = query(
        collection(db, 'jobs'),
        where('uid', '==', user.uid)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: FeedJobItem[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data() as FeedJobItem;
            if (data.tool === 'image.create' || data.tool === 'image.replaceBackground') {
              list.push({ ...data, id: doc.id });
            }
          });
          // Newest at the bottom
          list.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
          setJobs(list);
          setLoadingFeed(false);
        },
        () => {
          // If Firestore listener fails or offline, fall back to /api/jobs
          fetchJobsViaApi();
        }
      );
    } catch {
      fetchJobsViaApi();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const fetchJobsViaApi = async () => {
    try {
      const res = await fetchWithAuth('/api/jobs?limit=50');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.jobs)) {
          const filtered = data.jobs.filter((j: any) => j.tool === 'image.create' || j.tool === 'image.replaceBackground');
          filtered.sort((a: any, b: any) => (a.createdAt > b.createdAt ? 1 : -1));
          setJobs(filtered);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoadingFeed(false);
    }
  };

  // 2. Poll active jobs (queued or running) every 3 seconds to reconcile with fal.ai
  useEffect(() => {
    const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (activeJobs.length === 0) return;

    activeJobs.forEach((j) => pollingJobsRef.current.add(j.id));

    const interval = setInterval(async () => {
      // Increment elapsed seconds for visual ring
      setElapsedTimes((prev) => {
        const next = { ...prev };
        activeJobs.forEach((j) => {
          next[j.id] = (next[j.id] || 0) + 3;
        });
        return next;
      });

      // Query GET /api/jobs/:id for each active job
      for (const j of activeJobs) {
        try {
          const res = await fetchWithAuth(`/api/jobs/${j.id}`);
          if (res.ok) {
            const data = await res.json();
            const updated = data.job as FeedJobItem;
            if (updated) {
              setJobs((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
              );
              if (updated.status === 'succeeded' || updated.status === 'failed') {
                pollingJobsRef.current.delete(updated.id);
              }
            }
          }
        } catch {
          // Ignore transient errors
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs]);

  // Upload product photo
  const handleUploadProductPhoto = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WebP).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('Product image exceeds the 25 MB limit.');
      return;
    }

    setUploadingProductPhoto(true);
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
      const data = await res.json();
      setProductPhotoUrl(data.url);
      setProductPhotoName(file.name);
      setProductPhotoUploaded(true);
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploadingProductPhoto(false);
    }
  };

  const handleSelectAssetPhoto = (asset: { url: string; title: string }) => {
    setProductPhotoUrl(asset.url);
    setProductPhotoName(asset.title || 'Selected asset');
    setProductPhotoUploaded(true);
    setShowAssetPicker(false);
  };

  // 3. Handle Submit from PromptBar
  const handleSubmitJob = async (payload: PromptBarSubmitPayload) => {
    setIsCostBlocked(false);
    setCostBlockedMessage('');

    try {
      const isProductScene = mode === 'product-scene';

      if (isProductScene && !productPhotoUrl) {
        alert('Please upload or select a product photo in Step 1 first.');
        return;
      }

      const tool = isProductScene ? 'image.replaceBackground' : 'image.create';
      const modelKey = isProductScene ? 'replace_bg_gpt' : payload.modelKey;

      const fullPrompt = isProductScene
        ? `Keep the foreground product completely unchanged without any alterations. Place the product on ${selectedScene.toLowerCase()}, ${payload.prompt ? payload.prompt : 'cinematic studio lighting, high-end commercial ad'}.`
        : payload.prompt;

      const bodyInput: any = {
        prompt: fullPrompt,
        variants: isProductScene ? 1 : payload.variants,
        resolution: payload.settings.resolution,
        format: payload.settings.format,
      };

      if (isProductScene) {
        bodyInput.imageUrl = productPhotoUrl;
        bodyInput.scene = selectedScene;
      }

      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool,
          modelKey,
          input: bodyInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.blockedByCostGuard) {
          setIsCostBlocked(true);
          setCostBlockedMessage(data.reason || data.error);
        } else {
          alert(`Creation failed: ${data.error || 'Server error'}`);
        }
        return;
      }

      // Add to local state immediately while polling reconciles
      if (data.job) {
        setJobs((prev) => [...prev, data.job]);
      }
    } catch (err: any) {
      alert(`Submission error: ${err.message || 'Network request failed'}`);
    }
  };

  // Convert job outputs to MediaItem format for ResultCard / DetailsDrawer
  const getMediaItemsForJob = (job: FeedJobItem): MediaItem[] => {
    const variantsCount = job.input.variants || 1;
    const outputs = job.outputs || [];
    const toolLabel = job.tool === 'image.replaceBackground' ? 'Product scene' : 'Image';

    if (job.status === 'succeeded' && outputs.length > 0) {
      return outputs.map((out, idx) => ({
        id: out.assetId || `${job.id}_out_${idx}`,
        type: 'image' as const,
        title: job.input.prompt.slice(0, 40),
        prompt: job.input.prompt,
        tool: toolLabel,
        model: job.modelKey,
        format: job.input.resolution || '1:1',
        resolution: job.input.resolution || 'auto_2K',
        createdAt: new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cost: job.estCostUsd / Math.max(1, outputs.length),
        gradient: 'linear-gradient(135deg, #101217 0%, #1c202a 100%)',
        url: out.url,
      }));
    }

    // Placeholders for running, queued, or failed
    return Array.from({ length: variantsCount }).map((_, idx) => ({
      id: `${job.id}_placeholder_${idx}`,
      type: 'image' as const,
      title: job.input.prompt.slice(0, 40),
      prompt: job.input.prompt,
      tool: toolLabel,
      model: job.modelKey,
      format: job.input.resolution || '1:1',
      resolution: job.input.resolution || 'auto_2K',
      createdAt: new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cost: job.estCostUsd / variantsCount,
      gradient: 'linear-gradient(135deg, #101217 0%, #1c202a 100%)',
    }));
  };

  // Delete generation group
  const handleDeleteGroup = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  // Loading Review State
  if (reviewState === 'loading' || loadingFeed) {
    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <Skeleton height={34} width={120} />
          <Skeleton height={40} width={220} rounded="md" />
        </div>
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="p-5 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-4">
              <Skeleton height={20} width={360} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} height={200} rounded="lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error Review State
  if (reviewState === 'error') {
    return (
      <div className="py-12 space-y-6">
        <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-[var(--danger)]" />
          <h2 className="type-h2 text-[var(--danger)]">Failed to load generation feed</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to fetch recent generations. Try reloading or submitting a new prompt.
          </p>
          <Button
            variant="danger"
            size={40}
            icon={<RotateCcw size={16} />}
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty State
  if (reviewState === 'empty' || jobs.length === 0) {
    return (
      <div className="space-y-8 pb-32">
        <div className="sticky top-0 z-20 flex items-center justify-between py-4 bg-[var(--bg-0)]/90 backdrop-blur-none border-b border-[var(--border-subtle)]">
          <h1 className="type-h1 text-[var(--text-primary)]">Image</h1>
          <Segmented
            options={[
              { value: 'text-to-image', label: 'Text to image' },
              { value: 'product-scene', label: 'Product scene' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as 'text-to-image' | 'product-scene')}
          />
        </div>
        <div className="py-16">
          <EmptyState
            icon={<Sparkles size={28} className="text-[var(--accent)]" />}
            title="No images generated yet"
            description="Write a prompt and hit generate to see your images appear here."
            actionLabel="Generate sample"
            onAction={() =>
              handleSubmitJob({
                prompt: 'Nordic minimalist perfume bottle on black granite',
                modelKey: 'img_draft',
                modelLabel: 'Seedream 5.0 Lite',
                mode: 'draft',
                variants: 1,
                settings: {
                  format: 'auto_2K',
                  resolution: 'auto_2K',
                  quality: 'Standard',
                  duration: '5s',
                  audio: false,
                  seed: '',
                },
              })
            }
          />
        </div>
        <PromptBar
          defaultTool="Image"
          tool="image.create"
          onSubmit={handleSubmitJob}
          isCostBlocked={isCostBlocked}
          costBlockedMessage={costBlockedMessage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-36">
      {/* Sticky Header: H1 'Image' and Segmented 'Text to image' | 'Product scene' */}
      <div className="sticky top-0 z-20 flex items-center justify-between py-4 bg-[var(--bg-0)] border-b border-[var(--border-subtle)]">
        <h1 className="type-h1 text-[var(--text-primary)]">Image</h1>
        <Segmented
          options={[
            { value: 'text-to-image', label: 'Text to image' },
            { value: 'product-scene', label: 'Product scene' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'text-to-image' | 'product-scene')}
        />
      </div>

      {/* Product Scene 5-Step Flow */}
      {mode === 'product-scene' && (
        <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-6">
          <div className="flex items-center justify-between">
            <span className="type-h3 text-[var(--text-primary)]">Product Scene Studio</span>
            <span className="type-caption text-[var(--text-secondary)]">5-step guided composition</span>
          </div>

          {/* Step 1: Add product photo */}
          <div className="space-y-2">
            <span className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              1. Add your product photo
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadProductPhoto(file);
              }}
            />
            {!productPhotoUploaded ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={uploadingProductPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-24 rounded-[var(--radius-buttons)] border-2 border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] bg-[var(--bg-3)] flex items-center justify-center gap-3 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <UploadCloud size={20} className="text-[var(--accent)]" />
                  <span>
                    {uploadingProductPhoto
                      ? 'Uploading product photo to fal storage...'
                      : 'Upload product photo with transparent or neutral background (PNG, JPG)'}
                  </span>
                </button>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-[var(--text-tertiary)]">Max 25 MB</span>
                  <button
                    type="button"
                    onClick={() => setShowAssetPicker(true)}
                    className="text-[12px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    Choose from Assets
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)]">
                {productPhotoUrl ? (
                  <img
                    src={productPhotoUrl}
                    alt="Product preview"
                    className="w-[72px] h-[72px] rounded-lg object-contain bg-[var(--bg-4)] border border-[var(--border-strong)]"
                  />
                ) : (
                  <div className="w-[72px] h-[72px] rounded-lg bg-[var(--bg-4)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent)]">
                    <Check size={28} strokeWidth={2} />
                  </div>
                )}
                <div className="space-y-1 min-w-0">
                  <span className="text-[13px] font-medium text-[var(--text-primary)] truncate block max-w-xs">
                    {productPhotoName || 'Product photo ready'}
                  </span>
                  <div className="flex items-center gap-3 text-[12px]">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Change photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProductPhotoUploaded(false);
                        setProductPhotoUrl(null);
                        setProductPhotoName('');
                      }}
                      className="text-[var(--danger)] hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Choose a scene (cards 120x140) */}
          <div className="space-y-2">
            <span className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              2. Choose a scene preset
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 overflow-x-auto pb-1">
              {scenePresets.map((scene) => {
                const isSelected = selectedScene === scene.name;
                return (
                  <button
                    key={scene.name}
                    type="button"
                    onClick={() => setSelectedScene(scene.name)}
                    className={`w-full h-[140px] rounded-[var(--radius-buttons)] p-2.5 flex flex-col justify-between text-left border transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                    style={{ background: scene.gradient }}
                  >
                    <span className="text-[11px] font-semibold text-[var(--text-primary)] leading-tight">
                      {scene.name}
                    </span>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center self-end">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Steps 3, 4 & 5 Guidance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)]">
            <div>
              <strong className="text-[var(--text-primary)] block mb-0.5">3. Details</strong>
              Add optional lighting notes or props in the prompt below.
            </div>
            <div>
              <strong className="text-[var(--text-primary)] block mb-0.5">4. Generate</strong>
              Hit the send button on the bottom PromptBar to render variants.
            </div>
            <div>
              <strong className="text-[var(--text-primary)] block mb-0.5">5. Results</strong>
              Results arrive below with direct Edit, Animate, and Clean actions.
            </div>
          </div>
        </div>
      )}

      {/* Scrolling Generations Feed (Newest at bottom, persisted in Firestore) */}
      <div className="space-y-8">
        {jobs.map((job) => {
          const items = getMediaItemsForJob(job);
          const isRunning = job.status === 'running' || job.status === 'queued';
          const isFailed = job.status === 'failed';
          const elapsed = elapsedTimes[job.id] || 0;

          return (
            <div
              key={job.id}
              className="p-5 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-4"
            >
              {/* Group Header: Prompt (2-line clamp), caption, actions */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="text-[14px] font-medium text-[var(--text-primary)] line-clamp-2 select-text">
                    {job.input.prompt}
                  </p>
                  <div className="flex items-center gap-3 type-caption text-[var(--text-secondary)]">
                    <span className="font-medium text-[var(--text-primary)]">
                      {job.modelLabel || job.modelKey}
                    </span>
                    <span>•</span>
                    <span>{job.input.resolution || 'auto_2K'}</span>
                    <span>•</span>
                    <span className="tabular-nums">
                      {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-[var(--accent)] tabular-nums">
                      ${job.estCostUsd.toFixed(3)}
                    </span>
                  </div>
                </div>

                {/* Group Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    title="Reuse prompt"
                    onClick={() =>
                      handleSubmitJob({
                        prompt: job.input.prompt,
                        modelKey: job.modelKey,
                        modelLabel: job.modelKey,
                        mode: 'draft',
                        variants: 1,
                        settings: {
                          format: job.input.resolution || 'auto_2K',
                          resolution: job.input.resolution || 'auto_2K',
                          quality: 'Standard',
                          duration: '5s',
                          audio: false,
                          seed: '',
                        },
                      })
                    }
                    className="p-1.5 rounded-md hover:bg-[var(--bg-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <Copy size={16} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title="Generate more"
                    onClick={() =>
                      handleSubmitJob({
                        prompt: job.input.prompt,
                        modelKey: job.modelKey,
                        modelLabel: job.modelKey,
                        mode: 'draft',
                        variants: 2,
                        settings: {
                          format: job.input.resolution || 'auto_2K',
                          resolution: job.input.resolution || 'auto_2K',
                          quality: 'Standard',
                          duration: '5s',
                          audio: false,
                          seed: '',
                        },
                      })
                    }
                    className="p-1.5 rounded-md hover:bg-[var(--bg-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <Plus size={16} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title="Delete generation group"
                    onClick={() => handleDeleteGroup(job.id)}
                    className="p-1.5 rounded-md hover:bg-[var(--danger-soft)] text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {/* Error message banner if failed */}
              {isFailed && (
                <div className="p-3 rounded-[var(--radius-buttons)] bg-[var(--danger-soft)] border border-[var(--danger)] text-[12px] text-[var(--danger)]">
                  {job.error || 'Generation failed on fal.ai queue. Please verify your prompt or fal balance.'}
                </div>
              )}

              {/* Variants Grid (1, 2 or 4) */}
              <div
                className={`grid gap-4 ${
                  items.length === 1
                    ? 'grid-cols-1 sm:grid-cols-2 max-w-md'
                    : items.length === 2
                    ? 'grid-cols-2 max-w-2xl'
                    : 'grid-cols-2 sm:grid-cols-4'
                }`}
              >
                {items.map((item) => (
                  <ResultCard
                    key={item.id}
                    item={item}
                    status={isRunning ? 'running' : isFailed ? 'failed' : 'done'}
                    progress={job.progress || (job.status === 'running' ? 65 : 20)}
                    elapsedSeconds={elapsed}
                    onOpenDetails={() => setSelectedItem(item)}
                    onAction={(act) => {
                      if (act === 'retry') {
                        handleSubmitJob({
                          prompt: job.input.prompt,
                          modelKey: job.modelKey,
                          modelLabel: job.modelKey,
                          mode: 'draft',
                          variants: job.input.variants || 1,
                          settings: {
                            format: job.input.resolution || 'auto_2K',
                            resolution: job.input.resolution || 'auto_2K',
                            quality: 'Standard',
                            duration: '5s',
                            audio: false,
                            seed: '',
                          },
                        });
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Signature Floating PromptBar */}
      <PromptBar
        defaultTool="Image"
        tool="image.create"
        onSubmit={handleSubmitJob}
        isCostBlocked={isCostBlocked}
        costBlockedMessage={costBlockedMessage}
        initialPrompt={
          mode === 'product-scene'
            ? `Product placed on ${selectedScene.toLowerCase()}, soft studio lighting, high-end commercial ad`
            : ''
        }
      />

      {/* Details Drawer */}
      <DetailsDrawer
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
      />

      {/* Asset Picker Modal for choosing product photo from user's assets */}
      <AssetPickerModal
        isOpen={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        filterType="image"
        onSelect={handleSelectAssetPhoto}
      />
    </div>
  );
};
