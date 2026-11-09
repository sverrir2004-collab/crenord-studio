import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchAsset } from '../lib/assetActions.ts';
import { createPortal } from 'react-dom';
import {
  Eraser,
  Paintbrush,
  RotateCcw,
  Undo2,
  Check,
  Download,
  FolderPlus,
  Edit2,
  AlertCircle,
  Plus,
  Archive,
  UploadCloud,
  Film,
  Clock,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  Play,
} from 'lucide-react';
import JSZip from 'jszip';
import { Segmented } from '../components/ui/Segmented.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Dropzone } from '../components/ui/Dropzone.tsx';
import { BeforeAfterSlider } from '../components/ui/BeforeAfterSlider.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Table } from '../components/ui/Table.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { AssetPickerModal, PickableAsset } from '../components/ui/AssetPickerModal.tsx';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';

type CleanStep = 'upload' | 'choose' | 'process' | 'done';
type RemoveTarget = 'text' | 'watermarks' | 'something_else';
type DrawingTool = 'brush' | 'rectangle' | 'eraser';
type DrawingMaskMode = 'remove' | 'keep';

interface BatchItem {
  id: string;
  name: string;
  type: 'Image' | 'Video';
  url: string;
  status: 'Queued' | 'Processing' | 'Done' | 'Failed';
  size: string;
  resultUrl?: string;
  error?: string;
}

export const CleanPage: React.FC = () => {
  const navigate = useNavigate();
  const [reviewState] = useReviewState();
  const [mediaType, setMediaType] = useState<'video' | 'image'>('video');
  const [cleanStep, setCleanStep] = useState<CleanStep>('upload');
  const [isBatchMode, setIsBatchMode] = useState(false);

  // Single file source state
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('sample_media.mp4');
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [lastFinishedJobId, setLastFinishedJobId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 1. What to remove target (Chips: Subtitles and text / Logo or watermark / Object)
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget>('text');
  const [customObjectName, setCustomObjectName] = useState('');

  // 2. Auto detect vs Select myself (Switch)
  const [cleanMode, setCleanMode] = useState<'auto' | 'manual'>('auto');

  // Video Clean Model
  const [videoCleanModel, setVideoCleanModel] = useState<
    'vclean_prompt' | 'vclean_mask' | 'vclean_void' | 'vclean_ffmpeg_delogo'
  >('vclean_prompt');
  const [showMethodPopover, setShowMethodPopover] = useState(false);

  // Advanced settings state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [voidInferenceSteps, setVoidInferenceSteps] = useState(30);
  const [voidGuidanceScale, setVoidGuidanceScale] = useState(1);
  const [voidStrength, setVoidStrength] = useState(1);
  const [voidNumFrames, setVoidNumFrames] = useState(85);
  const [voidSafetyChecker, setVoidSafetyChecker] = useState(true);
  const [voidBgPrompt, setVoidBgPrompt] = useState('clean plain background, no text');
  const [briaPreserveAudio, setBriaPreserveAudio] = useState(true);
  const [briaAutoTrim, setBriaAutoTrim] = useState(true);
  const [briaCodec, setBriaCodec] = useState('mp4_h264');

  // Quality feedback state (Good / Not good)
  const [jobRating, setJobRating] = useState<'good' | 'not_good' | null>(null);
  const [isSavingRating, setIsSavingRating] = useState(false);

  // Compare mode: Test on first 4 seconds
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [isTesting4s, setIsTesting4s] = useState(false);
  const [compareModel, setCompareModel] = useState<
    'vclean_prompt' | 'vclean_mask' | 'vclean_void' | 'vclean_ffmpeg_delogo'
  >('vclean_void');
  const [compareResults, setCompareResults] = useState<{
    modelA: { key: string; label: string; cost: number; resultUrl?: string; jobId?: string; status: 'running' | 'done' | 'failed'; error?: string };
    modelB: { key: string; label: string; cost: number; resultUrl?: string; jobId?: string; status: 'running' | 'done' | 'failed'; error?: string };
  } | null>(null);

  // Manual drawing toolbar & canvas state
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('brush');
  const [drawingMaskMode, setDrawingMaskMode] = useState<DrawingMaskMode>('remove');
  const [brushSize, setBrushSize] = useState<number>(36);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const keepMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [hasDrawnMask, setHasDrawnMask] = useState(false);
  const [hasDrawnKeepMask, setHasDrawnKeepMask] = useState(false);

  // Mandatory rights checkbox
  const [confirmedRights, setConfirmedRights] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Asset picker modal
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetPickerForBatch, setAssetPickerForBatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Batch queue state
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([
    { id: 'b1', name: 'perfume_campaign_final.mp4', type: 'Video', status: 'Queued', size: '18 MB', url: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=800' },
    { id: 'b2', name: 'skincare_ad_watermark.png', type: 'Image', status: 'Queued', size: '3.4 MB', url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800' },
    { id: 'b3', name: 'tiktok_reels_subtitle.mp4', type: 'Video', status: 'Queued', size: '22 MB', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800' },
  ]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Methods supporting keep mask
  const supportsKeepArea =
    mediaType === 'image' || (mediaType === 'video' && videoCleanModel === 'vclean_void');

  // Video model cost calculation
  const getVideoModelCost = (key: string, dur: number | null): number => {
    const d = dur && dur > 0 ? dur : 0;
    switch (key) {
      case 'vclean_prompt':
      case 'vclean_mask':
        return 0.14 * Math.max(1, Math.round(d));
      case 'vclean_void':
        return 0.15 * Math.max(1, Math.round(d));
      case 'vclean_ffmpeg_delogo':
        return 0.0;
      default:
        return 0.14 * Math.max(1, Math.round(d));
    }
  };

  // Live estimated cost
  const calculatedCostUsd =
    mediaType === 'video'
      ? getVideoModelCost(videoCleanModel, sourceDuration)
      : cleanMode === 'manual'
      ? 0.04
      : 0.07;

  // Sync canvas dimensions
  const resizeCanvases = useCallback(() => {
    if (!mediaContainerRef.current || !displayCanvasRef.current) return;
    const rect = mediaContainerRef.current.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w === 0 || h === 0) return;

    const displayCanvas = displayCanvasRef.current;
    if (displayCanvas.width !== w || displayCanvas.height !== h) {
      displayCanvas.width = w;
      displayCanvas.height = h;
    }

    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
    }
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas.width !== w || maskCanvas.height !== h) {
      maskCanvas.width = w;
      maskCanvas.height = h;
      const ctx = maskCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
      }
    }

    if (!keepMaskCanvasRef.current) {
      keepMaskCanvasRef.current = document.createElement('canvas');
    }
    const keepCanvas = keepMaskCanvasRef.current;
    if (keepCanvas.width !== w || keepCanvas.height !== h) {
      keepCanvas.width = w;
      keepCanvas.height = h;
      const ctx = keepCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
      }
    }
  }, []);

  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases, cleanStep, mediaType, sourceUrl, cleanMode]);

  // Polling effect for active cleaning job
  useEffect(() => {
    if (cleanStep !== 'process' || !activeJobId) return;

    const timer = setInterval(async () => {
      setElapsedSeconds((prev) => prev + 3);

      try {
        const res = await fetchWithAuth(`/api/jobs/${activeJobId}`);
        if (!res.ok) return;

        const data = await res.json();
        const job = data.job;

        if (job) {
          if (job.status === 'succeeded') {
            const outUrl = job.outputs?.[0]?.url;
            if (outUrl) {
              setResultUrl(outUrl);
              setCleanStep('done');
              setActiveJobId(null);
            }
          } else if (job.status === 'failed') {
            setHasError(true);
            setErrorMessage(job.error || 'Auto detection had difficulty isolating this element.');
            setCleanStep('done');
            setActiveJobId(null);
          }
        }
      } catch (err: any) {
        console.error('Job check failed:', err);
      }
    }, 3000);

    pollingRef.current = timer;
    return () => clearInterval(timer);
  }, [cleanStep, activeJobId]);

  // Canvas drawing & snapshot handlers
  const saveSnapshotForUndo = () => {
    if (!displayCanvasRef.current) return;
    const ctx = displayCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
    setUndoStack((prev) => [...prev.slice(-20), imgData]);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (cleanMode !== 'manual') return;
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    saveSnapshotForUndo();
    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawingTool === 'rectangle') {
      setRectStart({ x, y });
    } else {
      if (drawingMaskMode === 'remove') setHasDrawnMask(true);
      else setHasDrawnKeepMask(true);
      drawBrushStroke(x, y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || cleanMode !== 'manual') return;
    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawingTool === 'rectangle' && rectStart) {
      // Redraw display canvas from last undo snapshot to preview current rectangle
      const dCtx = canvas.getContext('2d');
      if (dCtx && undoStack.length > 0) {
        dCtx.putImageData(undoStack[undoStack.length - 1], 0, 0);
      } else if (dCtx) {
        dCtx.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (dCtx) {
        dCtx.globalCompositeOperation = 'source-over';
        dCtx.fillStyle =
          drawingMaskMode === 'remove' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(47, 191, 113, 0.45)';
        dCtx.strokeStyle =
          drawingMaskMode === 'remove' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(47, 191, 113, 0.9)';
        dCtx.lineWidth = 2;
        const rx = Math.min(rectStart.x, x);
        const ry = Math.min(rectStart.y, y);
        const rw = Math.abs(x - rectStart.x);
        const rh = Math.abs(y - rectStart.y);
        dCtx.fillRect(rx, ry, rw, rh);
        dCtx.strokeRect(rx, ry, rw, rh);
      }
    } else {
      drawBrushStroke(x, y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = displayCanvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (drawingTool === 'rectangle' && rectStart && canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rx = Math.min(rectStart.x, x);
      const ry = Math.min(rectStart.y, y);
      const rw = Math.abs(x - rectStart.x);
      const rh = Math.abs(y - rectStart.y);

      if (rw > 3 && rh > 3) {
        if (drawingMaskMode === 'remove') setHasDrawnMask(true);
        else setHasDrawnKeepMask(true);

        const targetMask =
          drawingMaskMode === 'remove' ? maskCanvasRef.current : keepMaskCanvasRef.current;
        if (targetMask) {
          const mCtx = targetMask.getContext('2d');
          if (mCtx) {
            mCtx.globalCompositeOperation = 'source-over';
            mCtx.fillStyle = '#FFFFFF';
            mCtx.fillRect(rx, ry, rw, rh);
          }
        }
      }
      setRectStart(null);
    }

    setIsDrawing(false);
  };

  const drawBrushStroke = (x: number, y: number) => {
    const displayCanvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const keepCanvas = keepMaskCanvasRef.current;
    if (!displayCanvas || !maskCanvas || !keepCanvas) return;

    const dCtx = displayCanvas.getContext('2d');
    const mCtx = maskCanvas.getContext('2d');
    const kCtx = keepCanvas.getContext('2d');
    if (!dCtx || !mCtx || !kCtx) return;

    if (drawingTool === 'brush') {
      dCtx.globalCompositeOperation = 'source-over';
      dCtx.fillStyle =
        drawingMaskMode === 'remove' ? 'rgba(239, 68, 68, 0.55)' : 'rgba(47, 191, 113, 0.55)';
      dCtx.beginPath();
      dCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      dCtx.fill();

      if (drawingMaskMode === 'remove') {
        mCtx.globalCompositeOperation = 'source-over';
        mCtx.fillStyle = '#FFFFFF';
        mCtx.beginPath();
        mCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        mCtx.fill();
      } else {
        kCtx.globalCompositeOperation = 'source-over';
        kCtx.fillStyle = '#FFFFFF';
        kCtx.beginPath();
        kCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        kCtx.fill();
      }
    } else if (drawingTool === 'eraser') {
      dCtx.globalCompositeOperation = 'destination-out';
      dCtx.beginPath();
      dCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      dCtx.fill();

      mCtx.globalCompositeOperation = 'source-over';
      mCtx.fillStyle = '#000000';
      mCtx.beginPath();
      mCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      mCtx.fill();

      kCtx.globalCompositeOperation = 'source-over';
      kCtx.fillStyle = '#000000';
      kCtx.beginPath();
      kCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      kCtx.fill();
    }
  };

  const handleUndo = () => {
    if (!displayCanvasRef.current || undoStack.length === 0) return;
    const dCtx = displayCanvasRef.current.getContext('2d');
    if (!dCtx) return;

    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    dCtx.putImageData(prev, 0, 0);
  };

  const handleClearMask = () => {
    if (!displayCanvasRef.current || !maskCanvasRef.current || !keepMaskCanvasRef.current) return;
    const dCtx = displayCanvasRef.current.getContext('2d');
    const mCtx = maskCanvasRef.current.getContext('2d');
    const kCtx = keepMaskCanvasRef.current.getContext('2d');
    if (dCtx) dCtx.clearRect(0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
    if (mCtx) {
      mCtx.fillStyle = '#000000';
      mCtx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
    if (kCtx) {
      kCtx.fillStyle = '#000000';
      kCtx.fillRect(0, 0, keepMaskCanvasRef.current.width, keepMaskCanvasRef.current.height);
    }
    setUndoStack([]);
    setHasDrawnMask(false);
    setHasDrawnKeepMask(false);
  };

  const exportMaskBlob = async (which: 'remove' | 'keep' = 'remove'): Promise<Blob> => {
    const canvas = which === 'remove' ? maskCanvasRef.current : keepMaskCanvasRef.current;
    if (!canvas) throw new Error('Mask canvas unavailable');
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to export mask binary'));
      }, 'image/png');
    });
  };

  // Upload single file (Step 1 -> Step 2)
  const handleUploadSingleMedia = async (file: File) => {
    if (!file) return;
    const isVid = file.type.startsWith('video/');
    setMediaType(isVid ? 'video' : 'image');
    setSourceName(file.name);
    setHasError(false);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetchWithAuth('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      setSourceUrl(data.url);
      setCleanStep('choose'); // Automatically advance to Step 2

      if (isVid) {
        if (typeof data.duration === 'number' && !isNaN(data.duration) && data.duration > 0) {
          setSourceDuration(Math.round(data.duration * 10) / 10);
        } else {
          setSourceDuration(null);
        }
      }
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    }
  };

  // Arrived from "Clean" on a result: load that file as the source.
  const [searchParams, setSearchParams] = useSearchParams();
  const assetFromLink = searchParams.get('asset');
  useEffect(() => {
    if (!assetFromLink) return;
    let alive = true;
    fetchAsset(assetFromLink).then((a) => {
      if (!alive || !a?.url) return;
      handleSelectAsset({ id: a.id, url: a.url, type: a.type === 'video' ? 'video' : 'image', title: a.title, metadata: a.metadata } as any);
      setSearchParams({}, { replace: true });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetFromLink]);

  // Asset picker selection
  const handleSelectAsset = (asset: PickableAsset) => {
    if (assetPickerForBatch) {
      setBatchQueue((prev) => [
        ...prev,
        {
          id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: asset.title || 'asset_media',
          type: asset.type === 'video' ? 'Video' : 'Image',
          url: asset.url,
          status: 'Queued',
          size: 'Uploaded',
        },
      ]);
    } else {
      setSourceUrl(asset.url);
      setSourceName(asset.title || 'selected_asset');
      const isVideo = asset.type === 'video';
      setMediaType(isVideo ? 'video' : 'image');
      setCleanStep('choose'); // Automatically advance to Step 2
      setHasError(false);

      if (isVideo) {
        let dur: number | null = null;
        const raw = asset.metadata?.duration;
        if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
          dur = Math.round(raw * 10) / 10;
        } else if (typeof raw === 'string') {
          const parsed = parseFloat(raw.replace('s', '').trim());
          if (!isNaN(parsed) && parsed > 0) {
            dur = Math.round(parsed * 10) / 10;
          }
        }
        setSourceDuration(dur);
      }
    }
    setShowAssetPicker(false);
  };

  const getDrawnMaskBoundingBox = (): { x: number; y: number; w: number; h: number } | null => {
    if (!maskCanvasRef.current) return null;
    const canvas = maskCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let hasPixels = false;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        if (data[idx] > 128) {
          hasPixels = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasPixels) return null;

    const normX = minX / canvas.width;
    const normY = minY / canvas.height;
    const normW = Math.max(0.02, (maxX - minX) / canvas.width);
    const normH = Math.max(0.02, (maxY - minY) / canvas.height);

    return {
      x: Math.round(normX * 1280),
      y: Math.round(normY * 720),
      w: Math.round(normW * 1280),
      h: Math.round(normH * 720),
    };
  };

  const handleRateJob = async (rating: 'good' | 'not_good') => {
    const targetId = lastFinishedJobId || activeJobId;
    if (!targetId) return;
    setIsSavingRating(true);
    try {
      const res = await fetchWithAuth(`/api/jobs/${targetId}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        setJobRating(rating);
      }
    } catch (err) {
      console.error('Failed to save rating:', err);
    } finally {
      setIsSavingRating(false);
    }
  };

  // Start processing single Clean job
  const handleStartProcessing = async () => {
    if (!confirmedRights) {
      alert('You must confirm ownership or permission before proceeding.');
      return;
    }
    if (!sourceUrl) {
      alert('Please upload or select media to clean first.');
      return;
    }

    if (mediaType === 'video' && videoCleanModel === 'vclean_mask') {
      alert(
        'This schema is unverified: before enabling it please paste https://fal.ai/models/bria/bria_video_eraser/erase/mask/llms.txt.'
      );
      return;
    }

    if (mediaType === 'video' && videoCleanModel === 'vclean_ffmpeg_delogo' && !hasDrawnMask) {
      alert('Please select or paint the logo rectangle on the video canvas first for delogo.');
      return;
    }

    if (mediaType === 'video' && (!sourceDuration || sourceDuration <= 0)) {
      alert('Please specify the video length in seconds before proceeding.');
      return;
    }

    setHasError(false);
    setErrorMessage(null);
    setCleanStep('process');
    setElapsedSeconds(0);
    setJobRating(null);

    try {
      let maskUrl: string | undefined;

      if (cleanMode === 'manual' || (mediaType === 'video' && videoCleanModel === 'vclean_void' && hasDrawnMask)) {
        const maskBlob = await exportMaskBlob('remove');
        const formData = new FormData();
        formData.append('file', maskBlob, 'clean_mask.png');

        const uploadRes = await fetchWithAuth('/api/uploads', {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) throw new Error('Failed to upload painted mask');
        const uploadData = await uploadRes.json();
        maskUrl = uploadData.url;
      }

      // Build prompt for auto detection based on removeTarget
      let builtPrompt = 'text and subtitles';
      if (removeTarget === 'watermarks') {
        builtPrompt = 'watermarks, logos and copyright stamps';
      } else if (removeTarget === 'something_else') {
        builtPrompt = customObjectName ? customObjectName : 'unwanted foreground objects';
      }

      let tool: string;
      let modelKey: string;
      const jobInput: Record<string, any> = {
        confirmedRights: true,
      };

      if (mediaType === 'image') {
        tool = 'image.clean';
        if (cleanMode === 'manual') {
          modelKey = 'clean_img_mask';
          jobInput.imageUrl = sourceUrl;
          jobInput.maskUrl = maskUrl;
        } else {
          modelKey = 'clean_img_auto';
          jobInput.imageUrl = sourceUrl;
          jobInput.prompt = `Remove all ${builtPrompt} from this image, keep everything else completely unchanged.`;
        }
      } else {
        tool = 'video.clean';
        modelKey = videoCleanModel;
        jobInput.videoUrl = sourceUrl;
        jobInput.duration = sourceDuration || 0;

        if (videoCleanModel === 'vclean_prompt') {
          const promptText =
            removeTarget === 'text'
              ? 'text and subtitles'
              : removeTarget === 'watermarks'
              ? 'logo and watermark'
              : (customObjectName || 'objects');
          jobInput.prompt = promptText;
          jobInput.preserve_audio = briaPreserveAudio;
          jobInput.auto_trim = briaAutoTrim;
          jobInput.output_container_and_codec = briaCodec;
        } else if (videoCleanModel === 'vclean_void') {
          jobInput.prompt = voidBgPrompt || 'clean plain background, no text';
          jobInput.mask_prompt =
            removeTarget === 'text'
              ? 'text, subtitles, captions'
              : removeTarget === 'watermarks'
              ? 'logo and watermark'
              : (customObjectName || 'objects');
          jobInput.num_inference_steps = voidInferenceSteps;
          jobInput.guidance_scale = voidGuidanceScale;
          jobInput.strength = voidStrength;
          jobInput.num_frames = voidNumFrames;
          jobInput.enable_safety_checker = voidSafetyChecker;
          if (maskUrl) {
            jobInput.quad_mask_video_url = maskUrl;
          }
        } else if (videoCleanModel === 'vclean_ffmpeg_delogo') {
          const box = getDrawnMaskBoundingBox() || { x: 20, y: 20, w: 140, h: 60 };
          jobInput.delogoRect = box;
        }
      }

      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool,
          modelKey,
          input: jobInput,
          confirmedRights: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server rejected job');
      }

      setActiveJobId(data.job.id);
      setLastFinishedJobId(data.job.id);
    } catch (err: any) {
      setHasError(true);
      setErrorMessage(err.message || 'Cleaning failed');
      setCleanStep('choose');
    }
  };

  // Compare mode: Test on first 4 seconds
  const handleTestOnFirst4Seconds = async () => {
    if (!confirmedRights) {
      alert('You must confirm ownership or permission before proceeding.');
      return;
    }
    if (!sourceUrl) {
      alert('Please upload or select media to clean first.');
      return;
    }

    const modelAKey = videoCleanModel;
    const modelBKey =
      compareModel === videoCleanModel
        ? videoCleanModel === 'vclean_prompt'
          ? 'vclean_void'
          : 'vclean_prompt'
        : compareModel;

    if (modelAKey === 'vclean_mask' || modelBKey === 'vclean_mask') {
      alert('Bria Video Eraser mask mode has an unverified schema and cannot be tested.');
      return;
    }

    setIsTesting4s(true);
    setIsCompareMode(true);
    setHasError(false);
    setErrorMessage(null);

    const costA = getVideoModelCost(modelAKey, 4);
    const costB = getVideoModelCost(modelBKey, 4);

    const labelMap: Record<string, string> = {
      vclean_prompt: 'Bria Video Eraser - Fast text and logo removal',
      vclean_mask: 'Bria Video Eraser - Fixed area mask',
      vclean_void: 'VOID Video Inpainting - Hard cases, moving objects',
      vclean_ffmpeg_delogo: 'Free option, no AI - Fixed small logo only',
    };

    setCompareResults({
      modelA: { key: modelAKey, label: labelMap[modelAKey], cost: costA, status: 'running' },
      modelB: { key: modelBKey, label: labelMap[modelBKey], cost: costB, status: 'running' },
    });

    const buildVideoInput = (mKey: string) => {
      const input: Record<string, any> = {
        videoUrl: sourceUrl,
        duration: 4,
        test4s: true,
        confirmedRights: true,
      };
      if (mKey === 'vclean_prompt') {
        input.prompt =
          removeTarget === 'text'
            ? 'text and subtitles'
            : removeTarget === 'watermarks'
            ? 'logo and watermark'
            : (customObjectName || 'objects');
        input.preserve_audio = briaPreserveAudio;
        input.auto_trim = briaAutoTrim;
        input.output_container_and_codec = briaCodec;
      } else if (mKey === 'vclean_void') {
        input.prompt = voidBgPrompt || 'clean plain background, no text';
        input.mask_prompt =
          removeTarget === 'text'
            ? 'text, subtitles, captions'
            : removeTarget === 'watermarks'
            ? 'logo and watermark'
            : (customObjectName || 'objects');
        input.num_inference_steps = voidInferenceSteps;
        input.guidance_scale = voidGuidanceScale;
        input.strength = voidStrength;
        input.num_frames = voidNumFrames;
        input.enable_safety_checker = voidSafetyChecker;
      } else if (mKey === 'vclean_ffmpeg_delogo') {
        input.delogoRect = getDrawnMaskBoundingBox() || { x: 20, y: 20, w: 140, h: 60 };
      }
      return input;
    };

    try {
      const [resA, resB] = await Promise.all([
        fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'video.clean',
            modelKey: modelAKey,
            input: buildVideoInput(modelAKey),
            confirmedRights: true,
          }),
        }),
        fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'video.clean',
            modelKey: modelBKey,
            input: buildVideoInput(modelBKey),
            confirmedRights: true,
          }),
        }),
      ]);

      const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);

      const pollJob = async (jobId: string) => {
        let attempts = 0;
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 3000));
          attempts++;
          const chk = await fetchWithAuth(`/api/jobs/${jobId}`);
          if (chk.ok) {
            const d = await chk.json();
            if (d.job?.status === 'succeeded') {
              return { status: 'done' as const, url: d.job?.outputs?.[0]?.url };
            }
            if (d.job?.status === 'failed') {
              return { status: 'failed' as const, error: d.job?.error };
            }
          }
        }
        return { status: 'failed' as const, error: 'Timed out' };
      };

      if (dataA.job?.id) {
        pollJob(dataA.job.id).then((r) => {
          setCompareResults((prev) =>
            prev
              ? {
                  ...prev,
                  modelA: { ...prev.modelA, status: r.status, resultUrl: r.url, error: r.error },
                }
              : null
          );
        });
      }

      if (dataB.job?.id) {
        pollJob(dataB.job.id).then((r) => {
          setCompareResults((prev) =>
            prev
              ? {
                  ...prev,
                  modelB: { ...prev.modelB, status: r.status, resultUrl: r.url, error: r.error },
                }
              : null
          );
        });
      }
    } catch (err: any) {
      alert(`Compare test failed: ${err.message}`);
      setIsCompareMode(false);
      setIsTesting4s(false);
    }
  };

  const handleSelectFromCompare = (chosenKey: string) => {
    setVideoCleanModel(chosenKey as any);
    setIsCompareMode(false);
    setIsTesting4s(false);
    setCompareResults(null);
  };

  const handleCancel = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setActiveJobId(null);
    setCleanStep('choose');
  };

  // Batch queue processing with at most 2 concurrent jobs
  const handleProcessBatch = async () => {
    if (!confirmedRights) {
      alert('You must confirm ownership or permission before starting batch clean.');
      return;
    }
    if (batchQueue.length === 0) return;

    setIsProcessingBatch(true);
    const queue = [...batchQueue];
    const CONCURRENCY_LIMIT = 2;
    let nextIndex = 0;

    const processItem = async (index: number) => {
      const item = queue[index];
      if (!item || item.status === 'Done') return;

      setBatchQueue((prev) =>
        prev.map((it, i) => (i === index ? { ...it, status: 'Processing' } : it))
      );

      try {
        const isVid = item.type === 'Video';
        const tool = isVid ? 'video.clean' : 'image.clean';
        const modelKey = isVid ? 'vclean_prompt' : 'clean_img_auto';
        const input: Record<string, any> = {
          confirmedRights: true,
          prompt: 'text, watermarks, subtitles and logos',
        };
        if (isVid) {
          input.videoUrl = item.url;
          input.duration = 5;
        } else {
          input.imageUrl = item.url;
        }

        const res = await fetchWithAuth('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, modelKey, input, confirmedRights: true }),
        });

        if (!res.ok) throw new Error('Submission failed');
        const jobData = await res.json();
        const jId = jobData.job.id;

        let attempts = 0;
        let finished = false;
        while (!finished && attempts < 40) {
          await new Promise((r) => setTimeout(r, 3000));
          attempts++;
          const checkRes = await fetchWithAuth(`/api/jobs/${jId}`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const j = checkData.job;
            if (j.status === 'succeeded') {
              finished = true;
              const rUrl = j.outputs?.[0]?.url || item.url;
              setBatchQueue((prev) =>
                prev.map((it, i) => (i === index ? { ...it, status: 'Done', resultUrl: rUrl } : it))
              );
            } else if (j.status === 'failed') {
              finished = true;
              setBatchQueue((prev) =>
                prev.map((it, i) => (i === index ? { ...it, status: 'Failed', error: j.error } : it))
              );
            }
          }
        }
      } catch (err: any) {
        setBatchQueue((prev) =>
          prev.map((it, i) => (i === index ? { ...it, status: 'Failed', error: err.message } : it))
        );
      }
    };

    const runNext = async (): Promise<void> => {
      if (nextIndex >= queue.length) return;
      const cur = nextIndex++;
      await processItem(cur);
      await runNext();
    };

    const initialWorkers = [];
    for (let w = 0; w < Math.min(CONCURRENCY_LIMIT, queue.length); w++) {
      initialWorkers.push(runNext());
    }
    await Promise.all(initialWorkers);
    setIsProcessingBatch(false);
  };

  // Download all batch files as .zip using JSZip
  const handleDownloadAllZip = async () => {
    const completedItems = batchQueue.filter((it) => it.status === 'Done' && it.resultUrl);
    if (completedItems.length === 0) {
      alert('No finished files available to download yet.');
      return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('crenord_cleaned_media') || zip;

      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        try {
          const resp = await fetch(item.resultUrl!);
          const blob = await resp.blob();
          const cleanFileName = `clean_${item.name}`;
          folder.file(cleanFileName, blob);
        } catch {}
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const dlUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `crenord_cleaned_batch_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);
    } catch (err: any) {
      alert(`Failed to create zip: ${err.message}`);
    } finally {
      setIsZipping(false);
    }
  };

  // Determine disabled reason for primary button
  const getDisabledReason = (): string | null => {
    if (!confirmedRights) return 'Confirm ownership or permission to proceed';
    if (!sourceUrl) return 'Upload or choose media first';
    if (cleanMode === 'manual' && !hasDrawnMask) {
      return 'Paint over or draw a rectangle around what you want removed';
    }
    if (mediaType === 'video' && videoCleanModel === 'vclean_ffmpeg_delogo' && !hasDrawnMask) {
      return 'Draw over the logo rectangle on the preview first';
    }
    if (mediaType === 'video' && (!sourceDuration || sourceDuration <= 0)) {
      return 'Specify video length in seconds';
    }
    return null;
  };

  const disabledReason = getDisabledReason();
  const isRemoveDisabled = disabledReason !== null;

  // Review state loading
  if (reviewState === 'loading') {
    return (
      <div className="space-y-6 pb-24">
        <Skeleton height={34} width={120} />
        <Skeleton height={40} width={220} rounded="md" />
        <Skeleton height={500} rounded="lg" />
      </div>
    );
  }

  const isErrorState = reviewState === 'error' || hasError;

  return (
    <div className="space-y-6 pb-28">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadSingleMedia(file);
        }}
      />
      <input
        ref={batchFileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          const newItems: BatchItem[] = Array.from(files).slice(0, 30).map((f) => ({
            id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: f.name,
            type: f.type.startsWith('video/') ? 'Video' : 'Image',
            url: URL.createObjectURL(f),
            status: 'Queued',
            size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
          }));
          setBatchQueue((prev) => [...prev, ...newItems].slice(0, 30));
        }}
      />

      {/* TOP HEADER: Title "Clean", Video | Image switch, and Step Bar "1 Upload - 2 Select - 3 Download". Nothing else. */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-4">
          <h1 className="type-h1 text-[var(--text-primary)]">Clean</h1>
          <Segmented
            options={[
              { value: 'video', label: 'Video' },
              { value: 'image', label: 'Image' },
            ]}
            value={mediaType}
            onChange={(v) => {
              setMediaType(v as 'video' | 'image');
              handleClearMask();
            }}
          />
        </div>

        {/* Minimalist 3-Step Bar: "1 Upload - 2 Select - 3 Download" */}
        <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-tertiary)]">
          <button
            type="button"
            onClick={() => {
              setIsBatchMode(false);
              setCleanStep('upload');
            }}
            className={`transition-colors cursor-pointer ${
              cleanStep === 'upload' && !isBatchMode
                ? 'text-[var(--accent)] font-semibold'
                : sourceUrl
                ? 'text-[var(--text-primary)] hover:text-[var(--accent)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            1 Upload
          </button>
          <span>—</span>
          <button
            type="button"
            onClick={() => {
              if (sourceUrl) {
                setIsBatchMode(false);
                setCleanStep('choose');
              }
            }}
            disabled={!sourceUrl}
            className={`transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40 ${
              cleanStep === 'choose' && !isBatchMode
                ? 'text-[var(--accent)] font-semibold'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            2 Select
          </button>
          <span>—</span>
          <button
            type="button"
            onClick={() => {
              if (resultUrl) {
                setIsBatchMode(false);
                setCleanStep('done');
              }
            }}
            disabled={!resultUrl && cleanStep !== 'process'}
            className={`transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40 ${
              (cleanStep === 'done' || cleanStep === 'process') && !isBatchMode
                ? 'text-[var(--accent)] font-semibold'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            3 Download
          </button>
        </div>
      </header>

      {/* BATCH MODE VIEW */}
      {isBatchMode ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsBatchMode(false)}
                  className="text-[12px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                >
                  ← Back to single file
                </button>
              </div>
              <h2 className="type-h2 text-[var(--text-primary)] mt-1">Batch Processing</h2>
              <p className="type-caption text-[var(--text-secondary)]">
                Clean text, watermarks and logos across up to 30 files at once.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                size={32}
                icon={<Plus size={14} />}
                onClick={() => batchFileInputRef.current?.click()}
              >
                Add files
              </Button>
              <Button
                variant="secondary"
                size={32}
                onClick={() => {
                  setAssetPickerForBatch(true);
                  setShowAssetPicker(true);
                }}
              >
                From Assets
              </Button>
              <Button
                variant="primary"
                size={32}
                disabled={isProcessingBatch || batchQueue.length === 0}
                onClick={handleProcessBatch}
              >
                {isProcessingBatch ? 'Processing...' : 'Clean all'}
              </Button>
              <Button
                variant="secondary"
                size={32}
                icon={<Archive size={14} />}
                disabled={isZipping || !batchQueue.some((it) => it.status === 'Done')}
                onClick={handleDownloadAllZip}
              >
                {isZipping ? 'Bundling zip...' : 'Download all'}
              </Button>
            </div>
          </div>

          <div className="p-3 rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-subtle)] flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmedRights}
                onChange={(e) => setConfirmedRights(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-strong)] accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[12px] text-[var(--text-secondary)]">
                I own this media or have permission to edit it
              </span>
            </label>
            <span className="type-caption text-[var(--text-tertiary)] tabular-nums">
              {batchQueue.length}/30 files
            </span>
          </div>

          <Table
            columns={[
              {
                header: 'Thumbnail',
                cell: (row) => (
                  <div className="w-10 h-10 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center text-[10px] text-[var(--text-tertiary)] font-bold">
                    {row.url ? (
                      row.type === 'Video' ? (
                        <Film size={18} className="text-[var(--accent)]" />
                      ) : (
                        <img src={row.url} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      row.type
                    )}
                  </div>
                ),
              },
              { header: 'File Name', accessorKey: 'name' },
              { header: 'Type', accessorKey: 'type' },
              { header: 'Size', accessorKey: 'size' },
              {
                header: 'Status',
                align: 'center',
                cell: (row) => (
                  <Badge
                    variant={
                      row.status === 'Done'
                        ? 'success'
                        : row.status === 'Processing'
                        ? 'accent'
                        : row.status === 'Failed'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {row.status}
                  </Badge>
                ),
              },
              {
                header: 'Action',
                align: 'right',
                cell: (row) =>
                  row.resultUrl ? (
                    <a
                      href={row.resultUrl}
                      download={`clean_${row.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-[var(--accent)] hover:underline font-medium cursor-pointer"
                    >
                      Download
                    </a>
                  ) : null,
              },
            ]}
            data={batchQueue}
            keyExtractor={(r) => r.id}
          />
        </div>
      ) : isCompareMode && compareResults ? (
        /* COMPARE MODE VIEW: Side-by-Side 4-Second Test Results */
        <div className="max-w-4xl mx-auto space-y-6 py-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
            <div>
              <h2 className="type-h2 text-[var(--text-primary)]">
                Compare Methods (First 4 Seconds)
              </h2>
              <p className="type-caption text-[var(--text-secondary)]">
                Side-by-side 4-second preview so you can verify quality before running the full video.
              </p>
            </div>
            <Button
              variant="secondary"
              size={32}
              onClick={() => {
                setIsCompareMode(false);
                setIsTesting4s(false);
                setCompareResults(null);
              }}
            >
              Back to select
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Model A */}
            <div className="p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Method A: {compareResults.modelA.key === 'vclean_prompt' ? 'Bria Video Eraser' : compareResults.modelA.key === 'vclean_void' ? 'VOID Inpainting' : 'Free no AI'}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--accent)] tabular-nums">
                    Test: ${compareResults.modelA.cost.toFixed(3)}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-tertiary)] line-clamp-1">
                  {compareResults.modelA.label}
                </div>
                <div className="w-full aspect-video rounded-[var(--radius-buttons)] bg-[var(--bg-1)] border border-[var(--border-strong)] overflow-hidden flex items-center justify-center relative">
                  {compareResults.modelA.status === 'running' ? (
                    <div className="flex flex-col items-center gap-2 text-center p-4">
                      <div className="w-8 h-8 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent)] animate-spin" />
                      <span className="text-[12px] text-[var(--text-secondary)]">Processing 4s test...</span>
                    </div>
                  ) : compareResults.modelA.status === 'failed' ? (
                    <div className="text-[12px] text-[var(--danger)] p-4 text-center">
                      Failed: {compareResults.modelA.error || 'Error during test'}
                    </div>
                  ) : compareResults.modelA.resultUrl ? (
                    <video
                      src={compareResults.modelA.resultUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[12px] text-[var(--text-tertiary)]">No preview</span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                  Full video ({sourceDuration || 0}s) cost: ≈ ${getVideoModelCost(compareResults.modelA.key, sourceDuration).toFixed(3)}
                </div>
              </div>
              <Button
                variant="primary"
                size={40}
                className="w-full mt-2"
                disabled={compareResults.modelA.status !== 'done'}
                onClick={() => handleSelectFromCompare(compareResults.modelA.key)}
              >
                Choose this method
              </Button>
            </div>

            {/* Model B */}
            <div className="p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Method B: {compareResults.modelB.key === 'vclean_prompt' ? 'Bria Video Eraser' : compareResults.modelB.key === 'vclean_void' ? 'VOID Inpainting' : 'Free no AI'}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--accent)] tabular-nums">
                    Test: ${compareResults.modelB.cost.toFixed(3)}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-tertiary)] line-clamp-1">
                  {compareResults.modelB.label}
                </div>
                <div className="w-full aspect-video rounded-[var(--radius-buttons)] bg-[var(--bg-1)] border border-[var(--border-strong)] overflow-hidden flex items-center justify-center relative">
                  {compareResults.modelB.status === 'running' ? (
                    <div className="flex flex-col items-center gap-2 text-center p-4">
                      <div className="w-8 h-8 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent)] animate-spin" />
                      <span className="text-[12px] text-[var(--text-secondary)]">Processing 4s test...</span>
                    </div>
                  ) : compareResults.modelB.status === 'failed' ? (
                    <div className="text-[12px] text-[var(--danger)] p-4 text-center">
                      Failed: {compareResults.modelB.error || 'Error during test'}
                    </div>
                  ) : compareResults.modelB.resultUrl ? (
                    <video
                      src={compareResults.modelB.resultUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[12px] text-[var(--text-tertiary)]">No preview</span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                  Full video ({sourceDuration || 0}s) cost: ≈ ${getVideoModelCost(compareResults.modelB.key, sourceDuration).toFixed(3)}
                </div>
              </div>
              <Button
                variant="primary"
                size={40}
                className="w-full mt-2"
                disabled={compareResults.modelB.status !== 'done'}
                onClick={() => handleSelectFromCompare(compareResults.modelB.key)}
              >
                Choose this method
              </Button>
            </div>
          </div>
        </div>
      ) : cleanStep === 'upload' || !sourceUrl ? (
        /* STEP 1: UPLOAD (Empty State) */
        <div className="max-w-[760px] mx-auto space-y-6 py-6">
          {/* One large dropzone in the middle */}
          <Dropzone
            label={`Drop a ${mediaType === 'video' ? 'video' : 'image'} here, or choose from library`}
            caption="Clean subtitles, watermarks, stamps and unwanted objects seamlessly."
            onFileSelect={handleUploadSingleMedia}
            onChooseFromAssets={() => {
              setAssetPickerForBatch(false);
              setShowAssetPicker(true);
            }}
          />

          {/* Below it three small example cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {[
              {
                id: 'text' as const,
                title: 'Remove subtitles',
                desc: 'Erase hardcoded captions & titles',
              },
              {
                id: 'watermarks' as const,
                title: 'Remove logo or watermark',
                desc: 'Clean brand stamps & logos',
              },
              {
                id: 'something_else' as const,
                title: 'Remove an object',
                desc: 'Patch distractions & people',
              },
            ].map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setRemoveTarget(card.id);
                  fileInputRef.current?.click();
                }}
                className="p-3.5 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] text-left hover:border-[var(--border-strong)] transition-all cursor-pointer group space-y-1.5"
              >
                <div className="w-full aspect-[16/9] rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center relative">
                  <span className="text-[11px] font-medium text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors">
                    Click to upload
                  </span>
                </div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                  {card.title}
                </div>
                <p className="type-caption text-[var(--text-secondary)] text-[11px] leading-relaxed">
                  {card.desc}
                </p>
              </button>
            ))}
          </div>

          {/* Text link at bottom */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setIsBatchMode(true)}
              className="text-[12px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
            >
              Process many files (batch) →
            </button>
          </div>
        </div>
      ) : cleanStep === 'process' ? (
        /* PROCESSING: One calm progress ring with elapsed time and a Cancel button */
        <div className="py-24 flex flex-col items-center justify-center space-y-6 max-w-sm mx-auto text-center">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-[var(--border-subtle)] border-t-[var(--accent)] animate-spin" />
            <Eraser size={22} className="text-[var(--accent)] absolute" />
          </div>
          <div className="space-y-1.5">
            <h2 className="type-h2 text-[var(--text-primary)]">Cleaning Media...</h2>
            <div className="flex items-center justify-center gap-1.5 text-[12px] text-[var(--text-tertiary)] pt-1">
              <Clock size={14} />
              <span className="tabular-nums">Elapsed: {elapsedSeconds}s</span>
            </div>
          </div>
          <Button variant="secondary" size={32} onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      ) : cleanStep === 'done' ? (
        /* STEP 3: DOWNLOAD */
        <div className="max-w-3xl mx-auto space-y-6 py-4">
          {/* Failed jobs show plain-language message with Try again and Select myself */}
          {isErrorState && (
            <div
              role="alert"
              className="p-4 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] flex flex-wrap items-center justify-between gap-3 text-[13px] text-[var(--danger)]"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle size={20} className="shrink-0 text-[var(--danger)]" />
                <div>
                  <strong>{errorMessage || 'Auto detection had difficulty isolating this element.'}</strong>
                  <div className="text-[12px] opacity-90 mt-0.5">
                    Try selecting or painting the area manually for cleaner isolation.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size={32}
                  onClick={() => {
                    setCleanMode('manual');
                    setHasError(false);
                    setErrorMessage(null);
                    setCleanStep('choose');
                  }}
                >
                  Select myself
                </Button>
                <Button
                  variant="danger"
                  size={32}
                  icon={<RotateCcw size={14} />}
                  onClick={() => {
                    setHasError(false);
                    setErrorMessage(null);
                    handleStartProcessing();
                  }}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Large before/after slider */}
          <div className="rounded-[var(--radius-cards)] overflow-hidden border border-[var(--border-subtle)]">
            <BeforeAfterSlider
              beforeUrl={sourceUrl || undefined}
              afterUrl={resultUrl || undefined}
              isVideo={mediaType === 'video'}
              beforeLabel="Before"
              afterLabel="After"
              aspectRatio="16/9"
            />
          </div>

          {/* Action Row: Primary Download button, secondary buttons & thumbs up/down */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            {/* Small thumbs up/down */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--text-secondary)] font-medium">Result:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isSavingRating}
                  onClick={() => handleRateJob('good')}
                  className={`p-1.5 rounded-[var(--radius-buttons)] text-[12px] border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    jobRating === 'good'
                      ? 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)] font-semibold'
                      : 'bg-[var(--bg-2)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                  title="Good result"
                >
                  <ThumbsUp size={14} />
                  <span>Good</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingRating}
                  onClick={() => handleRateJob('not_good')}
                  className={`p-1.5 rounded-[var(--radius-buttons)] text-[12px] border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    jobRating === 'not_good'
                      ? 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)] font-semibold'
                      : 'bg-[var(--bg-2)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                  title="Not good"
                >
                  <ThumbsDown size={14} />
                  <span>Not good</span>
                </button>
              </div>
            </div>

            {/* Secondary actions & Clear Primary Download */}
            <div className="flex flex-wrap items-center gap-2.5 ml-auto">
              <Button
                variant="secondary"
                size={40}
                onClick={() => {
                  setCleanStep('choose');
                  setResultUrl(null);
                }}
              >
                Try another method
              </Button>
              <Button
                variant="secondary"
                size={40}
                icon={<Edit2 size={15} />}
                onClick={() => {
                  if (resultUrl) {
                    navigate(`/edit?assetUrl=${encodeURIComponent(resultUrl)}&type=${mediaType}`);
                  } else {
                    navigate('/edit');
                  }
                }}
              >
                Send to Edit
              </Button>
              <Button
                variant="secondary"
                size={40}
                onClick={() => {
                  setCleanStep('upload');
                  setSourceUrl(null);
                  setResultUrl(null);
                  handleClearMask();
                }}
              >
                Start over
              </Button>
              <Button
                variant="primary"
                size={40}
                icon={<Download size={16} />}
                onClick={() => {
                  if (!resultUrl) return;
                  const a = document.createElement('a');
                  a.href = resultUrl;
                  a.download = `cleaned_${sourceName}`;
                  a.target = '_blank';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                Download
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* STEP 2: SELECT (One big preview in the middle and a slim panel on the right 300px) */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* CENTRE: BIG PREVIEW */}
          <div className="space-y-3">
            {/* Short instruction line above the preview when Select myself is active */}
            {cleanMode === 'manual' && (
              <div className="flex items-center justify-between text-[12px] font-medium text-[var(--text-secondary)] px-1">
                <span>Paint over what you want gone</span>
                {hasDrawnMask && (
                  <span className="text-[11px] text-[var(--success)] font-medium">Area marked</span>
                )}
              </div>
            )}

            {/* Preview Box & Drawing Canvas */}
            <div className="relative rounded-[var(--radius-cards)] overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-1)] flex flex-col items-center justify-center">
              {/* Select myself Toolbar on top of the preview */}
              {cleanMode === 'manual' && (
                <div className="w-full bg-[var(--bg-2)]/90 border-b border-[var(--border-subtle)] px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-30">
                  {/* Mode tabs: Remove (red) vs Keep (green) */}
                  <div className="flex items-center gap-1 bg-[var(--bg-3)] p-0.5 rounded-[var(--radius-buttons)] border border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setDrawingMaskMode('remove')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        drawingMaskMode === 'remove'
                          ? 'bg-red-500/20 text-red-400 font-semibold border border-red-500/30'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Remove
                    </button>
                    {supportsKeepArea && (
                      <button
                        type="button"
                        onClick={() => setDrawingMaskMode('keep')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                          drawingMaskMode === 'keep'
                            ? 'bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        title="Protected keep area"
                      >
                        Keep
                      </button>
                    )}
                  </div>

                  {/* Tool items: Brush, Rectangle, Eraser, Undo, Clear, Size slider */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDrawingTool('brush')}
                        className={`p-1.5 rounded cursor-pointer ${
                          drawingTool === 'brush'
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        title="Brush tool"
                      >
                        <Paintbrush size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawingTool('rectangle')}
                        className={`p-1.5 rounded cursor-pointer ${
                          drawingTool === 'rectangle'
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        title="Rectangle selection tool"
                      >
                        <Square size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawingTool('eraser')}
                        className={`p-1.5 rounded cursor-pointer ${
                          drawingTool === 'eraser'
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        title="Eraser tool"
                      >
                        <Eraser size={14} />
                      </button>
                    </div>

                    <div className="h-4 w-[1px] bg-[var(--border-subtle)]" />

                    {/* Size Slider for Brush */}
                    {drawingTool === 'brush' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{brushSize}px</span>
                        <input
                          type="range"
                          min={6}
                          max={96}
                          value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-16 accent-[var(--accent)] cursor-pointer"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={undoStack.length === 0}
                        onClick={handleUndo}
                        className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                        title="Undo"
                      >
                        <Undo2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={handleClearMask}
                        className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer"
                        title="Clear mask"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Media element container */}
              <div
                ref={mediaContainerRef}
                className="relative w-full aspect-video flex items-center justify-center bg-[var(--bg-0)] overflow-hidden"
              >
                {sourceUrl ? (
                  mediaType === 'video' ? (
                    <video
                      ref={videoPlayerRef}
                      src={sourceUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-contain pointer-events-none"
                      onLoadedMetadata={(e) => {
                        const dur = (e.target as HTMLVideoElement).duration;
                        if (dur && !isNaN(dur)) setSourceDuration(Math.round(dur * 10) / 10);
                      }}
                    />
                  ) : (
                    <img
                      src={sourceUrl}
                      alt="Source"
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center text-[var(--text-tertiary)] gap-2">
                    <UploadCloud size={32} />
                    <span className="text-[13px]">No media loaded</span>
                  </div>
                )}

                {/* Drawing Canvas overlay */}
                {cleanMode === 'manual' && (
                  <canvas
                    ref={displayCanvasRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="absolute inset-0 w-full h-full cursor-crosshair z-20"
                  />
                )}
              </div>
            </div>

            {/* Video time bar under preview showing clip, 4s test range, clip length & real estimated cost */}
            {mediaType === 'video' && (
              <div className="p-3 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      Clip length: {sourceDuration ? `${sourceDuration}s` : 'Detecting...'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const val = prompt('Enter video duration in seconds:', String(sourceDuration || 5));
                        if (val) {
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed) && parsed > 0) setSourceDuration(Math.round(parsed * 10) / 10);
                        }
                      }}
                      className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Adjust
                    </button>
                  </div>
                  <span className="text-[12px] font-semibold text-[var(--accent)] tabular-nums">
                    Est. cost: {videoCleanModel === 'vclean_ffmpeg_delogo' ? 'Free ($0)' : `≈ $${calculatedCostUsd.toFixed(2)}`}
                  </span>
                </div>

                {/* Timeline visual bar with marked 4s test range */}
                <div className="relative w-full h-3 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] overflow-hidden">
                  {/* Marked first 4s range */}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-[var(--accent-soft)] border-r-2 border-[var(--accent)]"
                    style={{
                      width: sourceDuration && sourceDuration > 0 ? `${Math.min(100, (4 / sourceDuration) * 100)}%` : '40%',
                    }}
                    title="First 4 seconds test range"
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                  <span>0s (First 4s marked for test)</span>
                  <span>{sourceDuration || 0}s full clip</span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SLIM PANEL (300px) */}
          <aside className="w-full lg:w-[300px] bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] p-4 space-y-5">
            {/* a) What to remove: three big chips */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">
                What to remove
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  { id: 'text' as const, label: 'Subtitles and text' },
                  { id: 'watermarks' as const, label: 'Logo or watermark' },
                  { id: 'something_else' as const, label: 'Object' },
                ].map((chip) => {
                  const isSelected = removeTarget === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setRemoveTarget(chip.id)}
                      className={`px-3 py-2 rounded-[var(--radius-buttons)] text-left text-[12px] font-medium border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-primary)] font-semibold'
                          : 'bg-[var(--bg-3)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <span>{chip.label}</span>
                      {isSelected && <Check size={14} className="text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>

              {/* Object chip shows a text field "Describe it" */}
              {removeTarget === 'something_else' && (
                <div className="pt-1.5 space-y-1">
                  <input
                    type="text"
                    value={customObjectName}
                    onChange={(e) => setCustomObjectName(e.target.value)}
                    placeholder="Describe it (e.g. microphone on desk)"
                    className="w-full h-8 px-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}

              {/* Under the chips: Switch "Auto detect | Select myself" */}
              <div className="pt-2">
                <Segmented
                  options={[
                    { value: 'auto', label: 'Auto detect' },
                    { value: 'manual', label: 'Select myself' },
                  ]}
                  value={cleanMode}
                  onChange={(v) => {
                    setCleanMode(v as 'auto' | 'manual');
                    if (v === 'auto') handleClearMask();
                  }}
                  className="w-full"
                />
              </div>
            </div>

            {/* d) Method (Video only): One recommended method line with Change link & popover */}
            {mediaType === 'video' && (
              <div className="space-y-1.5 pt-3 border-t border-[var(--border-subtle)]">
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">
                  Method
                </label>
                <div className="p-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] space-y-1 relative">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {videoCleanModel === 'vclean_prompt'
                        ? 'Bria Video Eraser'
                        : videoCleanModel === 'vclean_mask'
                        ? 'Bria mask mode'
                        : videoCleanModel === 'vclean_void'
                        ? 'VOID Inpainting'
                        : 'Free no AI'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMethodPopover(!showMethodPopover)}
                      className="text-[11px] font-semibold text-[var(--accent)] hover:underline ml-2 cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {videoCleanModel === 'vclean_prompt'
                      ? 'Fast text and logo removal — about $0.14 per second'
                      : videoCleanModel === 'vclean_mask'
                      ? 'Fixed area, e.g. subtitle band or logo — about $0.14 per second'
                      : videoCleanModel === 'vclean_void'
                      ? 'Hard cases, moving objects — price on fal (≈$0.15/s)'
                      : 'Small fixed logo only, lower quality — Free ($0)'}
                  </div>
                </div>
              </div>
            )}

            {/* f) Advanced (closed by default) */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] uppercase tracking-wider cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal size={13} />
                  <span>Advanced</span>
                </div>
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showAdvanced && (
                <div className="mt-2.5 p-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] space-y-2.5 text-[11px]">
                  {mediaType === 'video' && videoCleanModel === 'vclean_void' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)]">Steps</label>
                          <input
                            type="number"
                            value={voidInferenceSteps}
                            onChange={(e) => setVoidInferenceSteps(Number(e.target.value))}
                            className="w-full h-6 px-1.5 mt-0.5 rounded bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)]">Guidance</label>
                          <input
                            type="number"
                            step="0.1"
                            value={voidGuidanceScale}
                            onChange={(e) => setVoidGuidanceScale(Number(e.target.value))}
                            className="w-full h-6 px-1.5 mt-0.5 rounded bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)]">Strength</label>
                          <input
                            type="number"
                            step="0.1"
                            value={voidStrength}
                            onChange={(e) => setVoidStrength(Number(e.target.value))}
                            className="w-full h-6 px-1.5 mt-0.5 rounded bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)]">Frames</label>
                          <input
                            type="number"
                            value={voidNumFrames}
                            onChange={(e) => setVoidNumFrames(Number(e.target.value))}
                            className="w-full h-6 px-1.5 mt-0.5 rounded bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-[var(--text-secondary)]">Background prompt</label>
                        <input
                          type="text"
                          value={voidBgPrompt}
                          onChange={(e) => setVoidBgPrompt(e.target.value)}
                          className="w-full h-6 px-1.5 mt-0.5 rounded bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          checked={voidSafetyChecker}
                          onChange={(e) => setVoidSafetyChecker(e.target.checked)}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-[10px] text-[var(--text-secondary)]">Safety checker</span>
                      </label>
                    </>
                  ) : mediaType === 'video' && videoCleanModel === 'vclean_prompt' ? (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={briaPreserveAudio}
                          onChange={(e) => setBriaPreserveAudio(e.target.checked)}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-[11px] text-[var(--text-secondary)]">Preserve original audio</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={briaAutoTrim}
                          onChange={(e) => setBriaAutoTrim(e.target.checked)}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-[11px] text-[var(--text-secondary)]">Auto-trim edges</span>
                      </label>
                      <div>
                        <label className="text-[10px] text-[var(--text-secondary)]">Output Codec</label>
                        <input
                          type="text"
                          value={briaCodec}
                          onChange={(e) => setBriaCodec(e.target.value)}
                          className="w-full h-6 px-1.5 mt-0.5 rounded bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-[10px] text-[var(--text-secondary)]">Image Clean Model</span>
                      <div className="text-[11px] text-[var(--text-primary)] font-medium">
                        {cleanMode === 'manual' ? 'LaMa Mask Inpainting' : 'Fal Flux Clean Auto'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* e) Sticky Bottom of Panel: Rights Checkbox, Cost line, Primary Button & 4s Test */}
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3 sticky bottom-0 bg-[var(--bg-2)] pb-1">
              {/* Rights checkbox */}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmedRights}
                  onChange={(e) => setConfirmedRights(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-[var(--border-strong)] accent-[var(--accent)] cursor-pointer shrink-0"
                />
                <span className="text-[11px] text-[var(--text-secondary)] leading-tight">
                  I own this media or have permission to edit it
                </span>
              </label>

              {/* Cost line */}
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] tabular-nums">
                <span>Estimated cost:</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {videoCleanModel === 'vclean_ffmpeg_delogo' && mediaType === 'video'
                    ? 'Free ($0)'
                    : `≈ $${calculatedCostUsd.toFixed(2)}`}
                </span>
              </div>

              {/* One primary button "Remove" */}
              <div className="space-y-1.5">
                <Button
                  variant="primary"
                  size={40}
                  className="w-full font-semibold"
                  disabled={isRemoveDisabled}
                  onClick={handleStartProcessing}
                >
                  Remove
                </Button>

                {/* Small disabled reason if any */}
                {disabledReason && (
                  <p className="text-[10px] text-[var(--warning)] leading-tight text-center">
                    {disabledReason}
                  </p>
                )}

                {/* Secondary link "Test on first 4 seconds first" (Video only) */}
                {mediaType === 'video' && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      disabled={isTesting4s || !confirmedRights || !sourceUrl}
                      onClick={handleTestOnFirst4Seconds}
                      className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline disabled:opacity-40 cursor-pointer"
                    >
                      {isTesting4s ? 'Testing 4 seconds...' : 'Test on first 4 seconds first'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* METHOD SELECTION POPOVER MODAL (PORTAL) */}
      {showMethodPopover &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setShowMethodPopover(false)}
          >
            <div
              className="bg-[var(--bg-1)] border border-[var(--border-strong)] rounded-[var(--radius-cards)] p-5 max-w-md w-full shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                <h3 className="type-h3 text-[15px] font-semibold text-[var(--text-primary)]">
                  Select Video Cleaning Method
                </h3>
                <button
                  type="button"
                  onClick={() => setShowMethodPopover(false)}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2.5">
                {/* 1. Bria Video Eraser, prompt mode */}
                <button
                  type="button"
                  onClick={() => {
                    setVideoCleanModel('vclean_prompt');
                    setShowMethodPopover(false);
                  }}
                  className={`w-full p-3 rounded-[var(--radius-buttons)] text-left border transition-all cursor-pointer ${
                    videoCleanModel === 'vclean_prompt'
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                      : 'bg-[var(--bg-2)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[12px] font-semibold text-[var(--text-primary)]">
                    <div className="flex items-center gap-1.5">
                      <span>Bria Video Eraser</span>
                      <span className="px-1 py-0.2 rounded text-[9px] bg-[var(--accent)] text-white">Recommended</span>
                    </div>
                    <span className="text-[11px] text-[var(--accent)] font-semibold">≈ $0.14/s</span>
                  </div>
                  <p className="type-caption text-[var(--text-secondary)] text-[11px] mt-1">
                    Fast text and logo removal.
                  </p>
                </button>

                {/* 2. Bria mask mode */}
                <button
                  type="button"
                  onClick={() => {
                    setVideoCleanModel('vclean_mask');
                    setShowMethodPopover(false);
                    alert(
                      'This schema is unverified: before enabling it please paste https://fal.ai/models/bria/bria_video_eraser/erase/mask/llms.txt.'
                    );
                  }}
                  className={`w-full p-3 rounded-[var(--radius-buttons)] text-left border transition-all cursor-pointer ${
                    videoCleanModel === 'vclean_mask'
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                      : 'bg-[var(--bg-2)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[12px] font-semibold text-[var(--text-primary)]">
                    <span>Bria mask mode</span>
                    <span className="text-[11px] text-[var(--accent)] font-semibold">≈ $0.14/s</span>
                  </div>
                  <p className="type-caption text-[var(--text-secondary)] text-[11px] mt-1">
                    Fixed area, e.g. subtitle band or logo.
                  </p>
                </button>

                {/* 3. VOID */}
                <button
                  type="button"
                  onClick={() => {
                    setVideoCleanModel('vclean_void');
                    setShowMethodPopover(false);
                  }}
                  className={`w-full p-3 rounded-[var(--radius-buttons)] text-left border transition-all cursor-pointer ${
                    videoCleanModel === 'vclean_void'
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                      : 'bg-[var(--bg-2)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[12px] font-semibold text-[var(--text-primary)]">
                    <span>VOID Video Inpainting</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">price on fal (≈$0.15/s)</span>
                  </div>
                  <p className="type-caption text-[var(--text-secondary)] text-[11px] mt-1">
                    Hard cases, moving objects.
                  </p>
                </button>

                {/* 4. Free no AI */}
                <button
                  type="button"
                  onClick={() => {
                    setVideoCleanModel('vclean_ffmpeg_delogo');
                    setCleanMode('manual');
                    setShowMethodPopover(false);
                  }}
                  className={`w-full p-3 rounded-[var(--radius-buttons)] text-left border transition-all cursor-pointer ${
                    videoCleanModel === 'vclean_ffmpeg_delogo'
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                      : 'bg-[var(--bg-2)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[12px] font-semibold text-[var(--text-primary)]">
                    <span>Free no AI</span>
                    <span className="text-[11px] text-[var(--success)] font-semibold">Free ($0)</span>
                  </div>
                  <p className="type-caption text-[var(--text-secondary)] text-[11px] mt-1">
                    Small fixed logo only, lower quality.
                  </p>
                </button>
              </div>

              <div className="pt-2 text-right">
                <Button variant="secondary" size={32} onClick={() => setShowMethodPopover(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Asset Picker Modal */}
      <AssetPickerModal
        isOpen={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        filterType={mediaType}
        onSelect={handleSelectAsset}
      />
    </div>
  );
};
