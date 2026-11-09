import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Plus,
  Copy,
  Trash2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Upload,
  X,
  Play,
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

export interface FeedVideoJob {
  id: string;
  uid: string;
  tool: string;
  modelKey: string;
  modelLabel?: string;
  falRequestId?: string | null;
  input: {
    prompt?: string;
    image_url?: string;
    imageUrl?: string;
    start_image_url?: string;
    end_image_url?: string;
    duration?: number | string;
    resolution?: string;
    aspect_ratio?: string;
    format?: string;
    generate_audio?: boolean;
    audio?: boolean;
    videoMode?: 'text-to-video' | 'image-to-video' | 'start-end';
  };
  estCostUsd: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress?: number;
  error?: string | null;
  outputs?: Array<{
    assetId: string;
    url: string;
    type: 'video';
    duration?: string;
    resolution?: string;
    format?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export const VideoPage: React.FC = () => {
  const { user } = useAuth();
  const [reviewState] = useReviewState();
  const [videoMode, setVideoMode] = useState<'text-to-video' | 'image-to-video' | 'start-end'>('text-to-video');
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  // Frame slots (72px) uploaded URLs
  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  const [endImageUrl, setEndImageUrl] = useState<string | null>(null);
  const [isUploadingStart, setIsUploadingStart] = useState(false);
  const [isUploadingEnd, setIsUploadingEnd] = useState(false);
  const startFileInputRef = useRef<HTMLInputElement>(null);
  const endFileInputRef = useRef<HTMLInputElement>(null);

  // Cost guard blocking state
  const [isCostBlocked, setIsCostBlocked] = useState(false);
  const [costBlockedMessage, setCostBlockedMessage] = useState<string>('');
  const [startImageError, setStartImageError] = useState<string | null>(null);
  const [videoModels, setVideoModels] = useState<Array<{ key: string; endpoint: string; label: string; inputKind?: string }>>([]);

  useEffect(() => {
    if (startImageUrl) {
      setStartImageError(null);
    }
  }, [startImageUrl]);

  useEffect(() => {
    setStartImageError(null);
  }, [videoMode]);

  // Fetch registered video models to check endpoints for image-to-video requirements
  useEffect(() => {
    fetchWithAuth('/api/models?tool=video.create')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.models)) setVideoModels(d.models);
      })
      .catch(() => {});
  }, []);

  // Feed of real jobs from Firestore / API
  const [jobs, setJobs] = useState<FeedVideoJob[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  // Elapsed timers and backoff tracking for running jobs
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

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
          const list: FeedVideoJob[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data() as FeedVideoJob;
            if (data.tool === 'video.create') {
              list.push({ ...data, id: doc.id });
            }
          });
          // Newest at the bottom
          list.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
          setJobs(list);
          setLoadingFeed(false);
        },
        () => {
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
          const filtered = data.jobs.filter((j: any) => j.tool === 'video.create');
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

  // 2. Poll active jobs (queued or running) every 3 seconds, backing off to 8s
  useEffect(() => {
    const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (activeJobs.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    // Determine poll interval: 3s initially, 8s if any active job has run for > 30s
    const maxElapsed = Math.max(...activeJobs.map((j) => elapsedTimes[j.id] || 0), 0);
    const intervalMs = maxElapsed > 30 ? 8000 : 3000;

    const interval = setInterval(async () => {
      // Increment elapsed seconds
      setElapsedTimes((prev) => {
        const next = { ...prev };
        activeJobs.forEach((j) => {
          next[j.id] = (next[j.id] || 0) + Math.round(intervalMs / 1000);
        });
        return next;
      });

      // Poll each active job
      for (const j of activeJobs) {
        try {
          const res = await fetchWithAuth(`/api/jobs/${j.id}`);
          if (res.ok) {
            const data = await res.json();
            const updated = data.job as FeedVideoJob;
            if (updated) {
              setJobs((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
              );
            }
          }
        } catch {
          // Ignore transient errors
        }
      }
    }, intervalMs);

    pollingRef.current = interval;

    return () => clearInterval(interval);
  }, [jobs, elapsedTimes]);

  // Handle uploading frame image through POST /api/uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, frameType: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (frameType === 'start') setIsUploadingStart(true);
    else setIsUploadingEnd(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetchWithAuth('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to upload reference frame');
        return;
      }

      if (frameType === 'start') {
        setStartImageUrl(data.url);
        setStartImageError('');
      } else {
        setEndImageUrl(data.url);
      }
    } catch (err: any) {
      alert(`Upload error: ${err.message || 'Network error'}`);
    } finally {
      if (frameType === 'start') setIsUploadingStart(false);
      else setIsUploadingEnd(false);
      e.target.value = '';
    }
  };

  // 3. Handle Submit from PromptBar
  const handleSubmitJob = async (payload: PromptBarSubmitPayload) => {
    setIsCostBlocked(false);
    setCostBlockedMessage('');
    setStartImageError('');

    // Determine target model key
    let targetModelKey = payload.modelKey;

    // If mode is text-to-video and default draft model was selected (which is HappyHorse image-to-video),
    // automatically select the verified text-to-video model vid_happy_horse_t2v
    if (videoMode === 'text-to-video' && targetModelKey === 'vid_draft') {
      targetModelKey = 'vid_happy_horse_t2v';
    } else if (videoMode === 'start-end' && targetModelKey === 'vid_draft') {
      // Start and end frame requires Seedance
      targetModelKey = 'vid_seedance_20_fast';
    }

    // 5) Image-to-video check: if model inputKind is image or endpoint contains image-to-video and no start image, do not call API
    const chosenModel = videoModels.find((m) => m.key === targetModelKey);
    const isImageToVideoModel =
      chosenModel?.inputKind === 'image' ||
      chosenModel?.endpoint?.includes('image-to-video') ||
      videoMode === 'image-to-video' ||
      videoMode === 'start-end';

    if (isImageToVideoModel && !startImageUrl) {
      setStartImageError('This model needs a start image. Add one, or switch to a text-to-video model.');
      return;
    }

    const durationNum = parseInt(payload.settings.duration, 10) || 5;

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: 'video.create',
          modelKey: targetModelKey,
          input: {
            prompt: payload.prompt,
            image_url: startImageUrl || undefined,
            start_image_url: startImageUrl || undefined,
            end_image_url: endImageUrl || undefined,
            duration: durationNum,
            resolution: payload.settings.resolution || '720p',
            aspect_ratio: payload.settings.format || '16:9',
            format: payload.settings.format || '16:9',
            generate_audio: payload.settings.audio ?? true,
            videoMode,
          },
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

      if (data.job) {
        setJobs((prev) => [...prev, data.job]);
      }
    } catch (err: any) {
      alert(`Submission error: ${err.message || 'Network request failed'}`);
    }
  };

  // Convert job outputs to MediaItem format for ResultCard / DetailsDrawer
  const getMediaItemsForJob = (job: FeedVideoJob): MediaItem[] => {
    const outputs = job.outputs || [];

    if (job.status === 'succeeded' && outputs.length > 0) {
      return outputs.map((out, idx) => ({
        id: out.assetId || `${job.id}_vid_${idx}`,
        type: 'video' as const,
        title: (job.input?.prompt || 'Generated Video').slice(0, 40),
        prompt: job.input?.prompt || 'Generated cinematic ad video',
        tool: 'Video',
        model: job.modelKey,
        format: out.format || job.input?.aspect_ratio || '16:9',
        resolution: out.resolution || job.input?.resolution || '720p',
        duration: out.duration || `${job.input?.duration || 4}s`,
        createdAt: new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cost: job.estCostUsd,
        gradient: 'linear-gradient(135deg, #101217 0%, #1c202a 100%)',
        url: out.url,
      }));
    }

    // Placeholder for running, queued, or failed
    return [
      {
        id: `${job.id}_placeholder`,
        type: 'video' as const,
        title: (job.input?.prompt || 'Rendering video').slice(0, 40),
        prompt: job.input?.prompt || 'Generated cinematic ad video',
        tool: 'Video',
        model: job.modelKey,
        format: job.input?.aspect_ratio || '16:9',
        resolution: job.input?.resolution || '720p',
        duration: `${job.input?.duration || 4}s`,
        createdAt: new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cost: job.estCostUsd,
        gradient: 'linear-gradient(135deg, #101217 0%, #1c202a 100%)',
      },
    ];
  };

  const handleDeleteGroup = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  // Loading Review State
  if (reviewState === 'loading' || loadingFeed) {
    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <Skeleton height={34} width={120} />
          <Skeleton height={40} width={340} rounded="md" />
        </div>
        <div className="p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <span className="type-caption text-[var(--text-secondary)]">
            Rendering... usually 1 to 3 minutes
          </span>
        </div>
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="p-5 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-4">
              <Skeleton height={20} width={360} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((j) => (
                  <Skeleton key={j} height={260} rounded="lg" />
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
          <h2 className="type-h2 text-[var(--danger)]">Video rendering engine error</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to communicate with the video model queue. Please check model capacity and retry.
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
        <div className="sticky top-0 z-20 flex items-center justify-between py-4 bg-[var(--bg-0)] border-b border-[var(--border-subtle)]">
          <h1 className="type-h1 text-[var(--text-primary)]">Video</h1>
          <Segmented
            options={[
              { value: 'text-to-video', label: 'Text to video' },
              { value: 'image-to-video', label: 'Image to video' },
              { value: 'start-end', label: 'Start & end frame' },
            ]}
            value={videoMode}
            onChange={(v) => setVideoMode(v as any)}
          />
        </div>

        {/* Frame Slots (72px) when in Image to video or Start & End frame mode */}
        {(videoMode === 'image-to-video' || videoMode === 'start-end') && (
          <div className="p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] flex items-center gap-4">
            <input
              type="file"
              ref={startFileInputRef}
              onChange={(e) => handleFileUpload(e, 'start')}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={endFileInputRef}
              onChange={(e) => handleFileUpload(e, 'end')}
              accept="image/*"
              className="hidden"
            />

            {/* Start Frame Slot (72px) */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block">
                Start Frame
              </span>
              <div className="relative w-[72px] h-[72px]">
                <button
                  type="button"
                  onClick={() => startFileInputRef.current?.click()}
                  disabled={isUploadingStart}
                  className="w-[72px] h-[72px] rounded-[var(--radius-buttons)] border border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] bg-[var(--bg-3)] flex flex-col items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer overflow-hidden"
                >
                  {isUploadingStart ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                  ) : startImageUrl ? (
                    <img src={startImageUrl} alt="Start frame" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload size={18} />
                      <span className="text-[10px] mt-1">Upload</span>
                    </>
                  )}
                </button>
                {startImageUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStartImageUrl(null);
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--bg-4)] text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center justify-center border border-[var(--border-subtle)] cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* End Frame Slot (72px) */}
            {videoMode === 'start-end' && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block">
                  End Frame
                </span>
                <div className="relative w-[72px] h-[72px]">
                  <button
                    type="button"
                    onClick={() => endFileInputRef.current?.click()}
                    disabled={isUploadingEnd}
                    className="w-[72px] h-[72px] rounded-[var(--radius-buttons)] border border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] bg-[var(--bg-3)] flex flex-col items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer overflow-hidden"
                  >
                    {isUploadingEnd ? (
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                    ) : endImageUrl ? (
                      <img src={endImageUrl} alt="End frame" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Upload size={18} />
                        <span className="text-[10px] mt-1">Upload</span>
                      </>
                    )}
                  </button>
                  {endImageUrl && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEndImageUrl(null);
                      }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--bg-4)] text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center justify-center border border-[var(--border-subtle)] cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="text-[12px] text-[var(--text-secondary)] pl-2">
              Upload initial frame(s) to interpolate motion and physics smoothly.
            </div>
          </div>
        )}

        <div className="py-16">
          <EmptyState
            icon={<Film size={28} className="text-[var(--accent)]" />}
            title="No videos generated yet"
            description="Write a prompt and render dynamic commercial videos and product motions."
            actionLabel="Render sample video"
            onAction={() =>
              handleSubmitJob({
                prompt: 'Watch movement kinetic rotation slow motion, 60fps',
                modelKey: 'vid_happy_horse_t2v',
                modelLabel: 'HappyHorse T2V',
                mode: 'draft',
                variants: 1,
                settings: {
                  format: '16:9',
                  resolution: '720p',
                  quality: 'Standard',
                  duration: '5s',
                  audio: true,
                  seed: '',
                },
              })
            }
          />
        </div>

        <PromptBar
          defaultTool="Video"
          tool="video.create"
          videoMode={videoMode}
          onSubmit={handleSubmitJob}
          isCostBlocked={isCostBlocked}
          costBlockedMessage={costBlockedMessage}
          errorMessage={startImageError}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-36">
      {/* Sticky Header: H1 'Video' and Segmented control */}
      <div className="sticky top-0 z-20 flex items-center justify-between py-4 bg-[var(--bg-0)] border-b border-[var(--border-subtle)]">
        <h1 className="type-h1 text-[var(--text-primary)]">Video</h1>
        <Segmented
          options={[
            { value: 'text-to-video', label: 'Text to video' },
            { value: 'image-to-video', label: 'Image to video' },
            { value: 'start-end', label: 'Start & end frame' },
          ]}
          value={videoMode}
          onChange={(v) => setVideoMode(v as any)}
        />
      </div>

      {/* Frame Slots (72px) above PromptBar when in Image to video or Start & End frame mode */}
      {(videoMode === 'image-to-video' || videoMode === 'start-end') && (
        <div className="p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] flex items-center gap-4">
          <input
            type="file"
            ref={startFileInputRef}
            onChange={(e) => handleFileUpload(e, 'start')}
            accept="image/*"
            className="hidden"
          />
          <input
            type="file"
            ref={endFileInputRef}
            onChange={(e) => handleFileUpload(e, 'end')}
            accept="image/*"
            className="hidden"
          />

          {/* Start Frame Slot (72px) */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block">
              Start Frame
            </span>
            <div className="relative w-[72px] h-[72px]">
              <button
                type="button"
                onClick={() => startFileInputRef.current?.click()}
                disabled={isUploadingStart}
                className="w-[72px] h-[72px] rounded-[var(--radius-buttons)] border border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] bg-[var(--bg-3)] flex flex-col items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer overflow-hidden"
              >
                {isUploadingStart ? (
                  <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                ) : startImageUrl ? (
                  <img src={startImageUrl} alt="Start frame" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Upload size={18} />
                    <span className="text-[10px] mt-1">Upload</span>
                  </>
                )}
              </button>
              {startImageUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStartImageUrl(null);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--bg-4)] text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center justify-center border border-[var(--border-subtle)] cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* End Frame Slot (72px) if start-end mode */}
          {videoMode === 'start-end' && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block">
                End Frame
              </span>
              <div className="relative w-[72px] h-[72px]">
                <button
                  type="button"
                  onClick={() => endFileInputRef.current?.click()}
                  disabled={isUploadingEnd}
                  className="w-[72px] h-[72px] rounded-[var(--radius-buttons)] border border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] bg-[var(--bg-3)] flex flex-col items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer overflow-hidden"
                >
                  {isUploadingEnd ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                  ) : endImageUrl ? (
                    <img src={endImageUrl} alt="End frame" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload size={18} />
                      <span className="text-[10px] mt-1">Upload</span>
                    </>
                  )}
                </button>
                {endImageUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEndImageUrl(null);
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--bg-4)] text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center justify-center border border-[var(--border-subtle)] cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="text-[12px] text-[var(--text-secondary)] pl-2">
            Upload the initial reference frame. The AI video model interpolates motion and physics smoothly.
          </div>
        </div>
      )}

      {/* Generation Groups (Newest at bottom, persisted in Firestore) */}
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
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="text-[14px] font-medium text-[var(--text-primary)] line-clamp-2 select-text">
                    {job.input.prompt || 'Kinetic commercial video generation'}
                  </p>
                  <div className="flex items-center gap-3 type-caption text-[var(--text-secondary)] flex-wrap">
                    <span className="font-medium text-[var(--text-primary)]">{job.modelKey}</span>
                    <span>•</span>
                    <span>{job.input.resolution || '720p'}</span>
                    <span>•</span>
                    <span>{job.input.duration || 4}s</span>
                    <span>•</span>
                    <span className="tabular-nums">
                      {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-[var(--accent)] tabular-nums">
                      ${job.estCostUsd.toFixed(3)}
                    </span>
                    {isRunning && (
                      <>
                        <span>•</span>
                        <span className="text-[var(--text-tertiary)]">
                          {job.status === 'queued' ? 'Queued in fal.ai...' : `Rendering (${elapsed}s elapsed)... usually 1 to 3 minutes`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    title="Reuse prompt"
                    onClick={() =>
                      handleSubmitJob({
                        prompt: job.input.prompt || '',
                        modelKey: job.modelKey,
                        modelLabel: job.modelKey,
                        mode: 'draft',
                        variants: 1,
                        settings: {
                          format: job.input.aspect_ratio || '16:9',
                          resolution: job.input.resolution || '720p',
                          quality: 'Standard',
                          duration: `${job.input.duration || 4}s`,
                          audio: job.input.generate_audio ?? true,
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
                    title="Render another variant"
                    onClick={() =>
                      handleSubmitJob({
                        prompt: job.input.prompt || '',
                        modelKey: job.modelKey,
                        modelLabel: job.modelKey,
                        mode: 'draft',
                        variants: 1,
                        settings: {
                          format: job.input.aspect_ratio || '16:9',
                          resolution: job.input.resolution || '720p',
                          quality: 'Standard',
                          duration: `${job.input.duration || 4}s`,
                          audio: job.input.generate_audio ?? true,
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
                  {job.error || 'Video generation failed on fal.ai queue. Please verify your prompt or fal balance.'}
                </div>
              )}

              {/* Video Tiles Grid */}
              <div
                className={`grid gap-4 ${
                  items.length === 1
                    ? 'grid-cols-1 sm:grid-cols-2 max-w-lg'
                    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                }`}
              >
                {items.map((item) => (
                  <ResultCard
                    key={item.id}
                    item={item}
                    status={isRunning ? 'running' : isFailed ? 'failed' : 'done'}
                    progress={job.progress || (job.status === 'running' ? 50 : 15)}
                    elapsedSeconds={elapsed}
                    onOpenDetails={() => setSelectedItem(item)}
                    onAction={(act) => {
                      if (act === 'retry') {
                        handleSubmitJob({
                          prompt: job.input.prompt || '',
                          modelKey: job.modelKey,
                          modelLabel: job.modelKey,
                          mode: 'draft',
                          variants: 1,
                          settings: {
                            format: job.input.aspect_ratio || '16:9',
                            resolution: job.input.resolution || '720p',
                            quality: 'Standard',
                            duration: `${job.input.duration || 4}s`,
                            audio: job.input.generate_audio ?? true,
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
        defaultTool="Video"
        tool="video.create"
        videoMode={videoMode}
        onSubmit={handleSubmitJob}
        isCostBlocked={isCostBlocked}
        costBlockedMessage={costBlockedMessage}
        errorMessage={startImageError}
      />

      {/* Details Drawer with Video Player features */}
      <DetailsDrawer
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
};
