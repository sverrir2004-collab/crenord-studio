import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FolderPlus,
  Sparkles,
  Layers,
  Crop,
  Check,
  Scissors,
  FileVideo,
  AlertCircle,
  RotateCcw,
  Film,
  Image as ImageIcon,
  Loader2,
  SlidersHorizontal,
  ArrowLeftRight,
  Settings2,
  X,
  HelpCircle,
} from 'lucide-react';
import { Segmented } from '../components/ui/Segmented.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Dropzone } from '../components/ui/Dropzone.tsx';
import { BeforeAfterSlider } from '../components/ui/BeforeAfterSlider.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { AssetPickerModal } from '../components/ui/AssetPickerModal.tsx';
import { CostBanner } from '../components/ui/CostBanner.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';
import { MotionTransferPanel } from '../components/audio/ExtraVoiceTools.tsx';

export interface VersionItem {
  id: string;
  assetId: string;
  label: string;
  time: string;
  url: string;
  parentAssetId?: string | null;
  toolUsed?: string;
  type: 'image' | 'video';
}

type ImageToolId = 'ai-edit' | 'bg-replace' | 'bg-remove' | 'upscale' | 'resize-ads';
type VideoToolId = 'motion' | 'vedit' | 'extend' | 'vupscale' | 'trim' | 'reformat';
type ToolId = ImageToolId | VideoToolId;

interface ToolConfig {
  id: ToolId;
  name: string;
  category: 'ai' | 'free';
  help: string;
  badge: string;
  badgeVariant: 'default' | 'accent' | 'success' | 'warning';
  icon: React.ReactNode;
}

export const EditPage: React.FC = () => {
  const [reviewState] = useReviewState();
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [zoom, setZoom] = useState(100);
  const [showCompare, setShowCompare] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Asset Picker Modal
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Cost guard blocking banner
  const [costBlockedMessage, setCostBlockedMessage] = useState<string>('');

  // Versions History Strip
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [activeVersionIndex, setActiveVersionIndex] = useState<number>(-1);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);

  // Active Tool Selection with LocalStorage persistence
  const [activeTool, setActiveTool] = useState<ToolId>(() => {
    try {
      const saved = localStorage.getItem('crenord_last_tool_image');
      if (saved) return saved as ToolId;
    } catch {}
    return 'ai-edit';
  });

  // Collapsible Advanced section inside active tool settings
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Collapsible Model section
  const [showModelChange, setShowModelChange] = useState(false);

  // Mobile Bottom Sheet for Settings
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);

  // Tool inputs
  const [aiPrompt, setAiPrompt] = useState('');
  const [selectedScene, setSelectedScene] = useState('Marble counter');
  const [customScenePrompt, setCustomScenePrompt] = useState('');
  const [upscaleFactor, setUpscaleFactor] = useState<'2x' | '4x'>('2x');
  const [adSizes, setAdSizes] = useState<Set<string>>(new Set(['9:16', '1:1', '4:5', '16:9']));
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 5]);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [reformatTarget, setReformatTarget] = useState<string>('1:1');
  const [extendPrompt, setExtendPrompt] = useState('');
  const [extendDuration, setExtendDuration] = useState<number>(5);
  const [videoEditPrompt, setVideoEditPrompt] = useState('');
  const [videoEditModel, setVideoEditModel] = useState<'vedit_grok_video' | 'vedit_kling_o3'>('vedit_grok_video');

  const activeVersion = activeVersionIndex >= 0 && activeVersionIndex < versions.length
    ? versions[activeVersionIndex]
    : null;

  const originalVersion = versions.length > 0 ? versions[0] : null;

  const scenePresets = [
    'Marble counter',
    'Studio white',
    'Wooden table',
    'Outdoor garden',
    'Kitchen morning',
    'Bathroom shelf',
    'Neon night',
    'Seasonal',
  ];

  const quickIdeas = [
    'Add golden hour rim light',
    'Change color to matte black',
    'Place on sand podium',
    'Add soft studio fog',
  ];

  // Tool Definitions
  const imageTools: ToolConfig[] = [
    {
      id: 'ai-edit',
      name: 'AI Edit',
      category: 'ai',
      help: 'Prompt & inpaint modifications',
      badge: '~$0.07',
      badgeVariant: 'accent',
      icon: <Sparkles size={16} strokeWidth={1.75} />,
    },
    {
      id: 'bg-replace',
      name: 'Replace background',
      category: 'ai',
      help: 'Swap scene, preserve subject',
      badge: '~$0.07',
      badgeVariant: 'accent',
      icon: <Layers size={16} strokeWidth={1.75} />,
    },
    {
      id: 'bg-remove',
      name: 'Remove background',
      category: 'ai',
      help: 'Clean transparent cutout',
      badge: '~$0.03',
      badgeVariant: 'accent',
      icon: <Scissors size={16} strokeWidth={1.75} />,
    },
    {
      id: 'upscale',
      name: 'Upscale',
      category: 'ai',
      help: '2x or 4x high-res boost',
      badge: '~$0.05',
      badgeVariant: 'accent',
      icon: <Maximize2 size={16} strokeWidth={1.75} />,
    },
    {
      id: 'resize-ads',
      name: 'Resize for ads',
      category: 'free',
      help: 'Smart crop 9:16, 1:1, 4:5, 16:9',
      badge: 'Free',
      badgeVariant: 'success',
      icon: <Crop size={16} strokeWidth={1.75} />,
    },
  ];

  const videoTools: ToolConfig[] = [
    {
      id: 'motion',
      name: 'Motion transfer',
      category: 'ai',
      help: 'Make my character move like a video',
      badge: '~$0.17/s',
      badgeVariant: 'accent',
      icon: <Film size={16} strokeWidth={1.75} />,
    },
    {
      id: 'vedit',
      name: 'AI Video Edit',
      category: 'ai',
      help: 'Style and scene video changes',
      badge: videoEditModel === 'vedit_grok_video' ? '~$0.05/s' : '~$0.17/s',
      badgeVariant: 'accent',
      icon: <Sparkles size={16} strokeWidth={1.75} />,
    },
    {
      id: 'extend',
      name: 'Extend video',
      category: 'ai',
      help: 'Add seamless +5s continuation',
      badge: '~$0.08/s',
      badgeVariant: 'accent',
      icon: <Film size={16} strokeWidth={1.75} />,
    },
    {
      id: 'vupscale',
      name: 'Video upscaler',
      category: 'ai',
      help: 'Enhance video resolution 2x',
      badge: '~$0.05',
      badgeVariant: 'accent',
      icon: <Maximize2 size={16} strokeWidth={1.75} />,
    },
    {
      id: 'trim',
      name: 'Trim',
      category: 'free',
      help: 'Cut clip start & duration',
      badge: 'Free',
      badgeVariant: 'success',
      icon: <Scissors size={16} strokeWidth={1.75} />,
    },
    {
      id: 'reformat',
      name: 'Reformat',
      category: 'free',
      help: 'Convert aspect ratio & format',
      badge: 'Free',
      badgeVariant: 'success',
      icon: <FileVideo size={16} strokeWidth={1.75} />,
    },
  ];

  const currentTools = mediaType === 'image' ? imageTools : videoTools;

  // Handle switching mediaType (image vs video)
  const handleSwitchMediaType = (type: 'image' | 'video') => {
    setMediaType(type);
    try {
      const saved = localStorage.getItem(`crenord_last_tool_${type}`);
      if (saved) {
        setActiveTool(saved as ToolId);
        return;
      }
    } catch {}
    setActiveTool(type === 'image' ? 'ai-edit' : 'vedit');
  };

  // Tool selection handler
  const handleSelectTool = (toolId: ToolId) => {
    setActiveTool(toolId);
    setShowAdvanced(false);
    setShowModelChange(false);
    try {
      localStorage.setItem(`crenord_last_tool_${mediaType}`, toolId);
    } catch {}
  };

  // Initialize with an uploaded or selected file
  const handleSelectMedia = (asset: { id?: string; url: string; type: 'image' | 'video'; title?: string; metadata?: any }) => {
    const vOriginal: VersionItem = {
      id: `ver_${Date.now()}`,
      assetId: asset.id || `asset_init_${Date.now()}`,
      label: 'Original',
      time: 'Source',
      url: asset.url,
      type: asset.type,
      parentAssetId: null,
      toolUsed: 'Original',
    };
    setVersions([vOriginal]);
    setActiveVersionIndex(0);
    setMediaType(asset.type);
    setShowCompare(false);

    if (asset.type === 'video') {
      let dur: number | null = null;
      const raw = asset.metadata?.duration;
      if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
        dur = Math.round(raw * 10) / 10;
      } else if (typeof raw === 'string') {
        const p = parseFloat(raw.replace('s', '').trim());
        if (!isNaN(p) && p > 0) dur = Math.round(p * 10) / 10;
      }
      setVideoDuration(dur);
      if (dur && dur > 0) {
        setTrimRange([0, dur]);
      }
    } else {
      setVideoDuration(null);
    }
  };

  const handleUploadFile = async (file: File) => {
    setIsProcessing(true);
    setProcessingStatus('Uploading media...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetchWithAuth('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Upload failed');
        return;
      }

      let dur: number | null = null;
      if (typeof data.duration === 'number' && !isNaN(data.duration) && data.duration > 0) {
        dur = Math.round(data.duration * 10) / 10;
      }
      setVideoDuration(dur);
      if (dur && dur > 0) {
        setTrimRange([0, dur]);
      }

      handleSelectMedia({
        id: data.assetId,
        url: data.url,
        type: data.type || (file.type.startsWith('video/') ? 'video' : 'image'),
        title: file.name,
        metadata: { duration: dur },
      });
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Poll background job until completion and add version
  const pollJobToCompletion = async (jobId: string, label: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        const job = data.job;

        if (job.status === 'succeeded') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          setProcessingStatus('');

          const output = job.outputs?.[0];
          if (output && output.url) {
            setVersions((prev) => {
              const newVer: VersionItem = {
                id: `ver_${Date.now()}`,
                assetId: output.assetId || `asset_${Date.now()}`,
                label: `v${prev.length} ${label}`,
                time: 'Just now',
                url: output.url,
                type: output.type || mediaType,
                parentAssetId: activeVersion?.assetId || null,
                toolUsed: label,
              };
              const updated = [...prev, newVer];
              setActiveVersionIndex(updated.length - 1);
              return updated;
            });
            setShowCompare(false);
          }
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          setIsProcessing(false);
          setProcessingStatus('');
          alert(job.error || 'Operation failed on server');
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2500);
  };

  // 1. AI Edit Apply
  const handleApplyAiEdit = async () => {
    if (!activeVersion || !aiPrompt.trim()) return;
    setIsProcessing(true);
    setProcessingStatus('Running AI Edit...');
    setCostBlockedMessage('');

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'image.edit',
          modelKey: 'edit_gpt',
          input: {
            prompt: aiPrompt.trim(),
            imageUrl: activeVersion.url,
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.blockedByCostGuard) {
          setCostBlockedMessage(data.reason || data.error);
        } else {
          alert(data.error || 'AI Edit request failed');
        }
        setIsProcessing(false);
        return;
      }

      if (data.job?.status === 'succeeded' && data.job?.outputs?.[0]) {
        const out = data.job.outputs[0];
        setVersions((prev) => {
          const newVer: VersionItem = {
            id: `ver_${Date.now()}`,
            assetId: out.assetId,
            label: `v${prev.length} AI Edit`,
            time: 'Just now',
            url: out.url,
            type: 'image',
            parentAssetId: activeVersion.assetId,
            toolUsed: 'AI Edit',
          };
          const updated = [...prev, newVer];
          setActiveVersionIndex(updated.length - 1);
          return updated;
        });
        setIsProcessing(false);
      } else if (data.job?.id) {
        pollJobToCompletion(data.job.id, 'AI Edit');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // 2. Replace Background Apply
  const handleApplyReplaceBg = async () => {
    if (!activeVersion) return;
    setIsProcessing(true);
    setProcessingStatus(`Replacing background with ${selectedScene}...`);
    setCostBlockedMessage('');

    const extraDetail = customScenePrompt.trim() ? `, ${customScenePrompt.trim()}` : '';
    const templatePrompt = `Keep the foreground product/subject completely unchanged without any alterations. Place the product on ${selectedScene.toLowerCase()}${extraDetail}, commercial high-end advertising photography, photorealistic, 8k, cinematic lighting.`;

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'image.replaceBackground',
          modelKey: 'replace_bg_gpt',
          input: {
            prompt: templatePrompt,
            imageUrl: activeVersion.url,
            assetId: activeVersion.assetId,
            scene: selectedScene,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.blockedByCostGuard) {
          setCostBlockedMessage(data.reason || data.error);
        } else {
          alert(data.error || 'Replace background failed');
        }
        setIsProcessing(false);
        return;
      }

      if (data.job?.status === 'succeeded' && data.job?.outputs?.[0]) {
        const out = data.job.outputs[0];
        setVersions((prev) => {
          const newVer: VersionItem = {
            id: `ver_${Date.now()}`,
            assetId: out.assetId,
            label: `v${prev.length} ${selectedScene}`,
            time: 'Just now',
            url: out.url,
            type: 'image',
            parentAssetId: activeVersion.assetId,
            toolUsed: selectedScene,
          };
          const updated = [...prev, newVer];
          setActiveVersionIndex(updated.length - 1);
          return updated;
        });
        setIsProcessing(false);
      } else if (data.job?.id) {
        pollJobToCompletion(data.job.id, selectedScene);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // 3. Remove Background Apply
  const handleApplyRemoveBg = async () => {
    if (!activeVersion) return;
    setIsProcessing(true);
    setProcessingStatus('Extracting transparent cutout with Bria...');
    setCostBlockedMessage('');

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'image.removeBackground',
          modelKey: 'bg_guided',
          input: {
            imageUrl: activeVersion.url,
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.blockedByCostGuard) {
          setCostBlockedMessage(data.reason || data.error);
        } else {
          alert(data.error || 'Remove background failed');
        }
        setIsProcessing(false);
        return;
      }

      if (data.job?.status === 'succeeded' && data.job?.outputs?.[0]) {
        const out = data.job.outputs[0];
        setVersions((prev) => {
          const newVer: VersionItem = {
            id: `ver_${Date.now()}`,
            assetId: out.assetId,
            label: `v${prev.length} Cutout`,
            time: 'Just now',
            url: out.url,
            type: 'image',
            parentAssetId: activeVersion.assetId,
            toolUsed: 'Remove BG',
          };
          const updated = [...prev, newVer];
          setActiveVersionIndex(updated.length - 1);
          return updated;
        });
        setIsProcessing(false);
      } else if (data.job?.id) {
        pollJobToCompletion(data.job.id, 'Cutout');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // 4. Resize for Ads Apply (Server Sharp, Cost 0)
  const handleApplyResizeAds = async () => {
    if (!activeVersion || adSizes.size === 0) return;
    setIsProcessing(true);
    setProcessingStatus('Creating ad sizes with Server Sharp...');

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'image.resize',
          modelKey: 'resize_sharp',
          input: {
            imageUrl: activeVersion.url,
            formats: Array.from(adSizes),
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Resize failed');
        setIsProcessing(false);
        return;
      }

      if (data.job?.outputs && data.job.outputs.length > 0) {
        setVersions((prev) => {
          const newVers: VersionItem[] = data.job.outputs.map((out: any, idx: number) => ({
            id: `ver_${Date.now()}_${idx}`,
            assetId: out.assetId,
            label: `v${prev.length + idx} Ad ${out.format}`,
            time: 'Just now',
            url: out.url,
            type: 'image' as const,
            parentAssetId: activeVersion.assetId,
            toolUsed: `Resize ${out.format}`,
          }));
          const updated = [...prev, ...newVers];
          setActiveVersionIndex(updated.length - 1);
          return updated;
        });
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 5. Video Trim Apply (Server FFmpeg, Cost 0)
  const handleApplyTrimVideo = async () => {
    if (!activeVersion) return;
    setIsProcessing(true);
    const duration = trimRange[1] - trimRange[0];
    setProcessingStatus(`Trimming video to ${Math.round(duration * 10) / 10}s with Server FFmpeg...`);

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'video.trim',
          modelKey: 'trim_ffmpeg',
          input: {
            videoUrl: activeVersion.url,
            startSec: trimRange[0],
            durationSec: duration,
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Trim failed');
        setIsProcessing(false);
        return;
      }

      if (data.job?.outputs?.[0]) {
        const out = data.job.outputs[0];
        setVersions((prev) => {
          const newVer: VersionItem = {
            id: `ver_${Date.now()}`,
            assetId: out.assetId,
            label: `v${prev.length} Trimmed (${out.duration || `${duration}s`})`,
            time: 'Just now',
            url: out.url,
            type: 'video',
            parentAssetId: activeVersion.assetId,
            toolUsed: 'Trim',
          };
          const updated = [...prev, newVer];
          setActiveVersionIndex(updated.length - 1);
          return updated;
        });
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 6. Video Reformat Apply (Server FFmpeg, Cost 0)
  const handleApplyReformatVideo = async () => {
    if (!activeVersion) return;
    setIsProcessing(true);
    setProcessingStatus(`Reformatting video to ${reformatTarget} with Server FFmpeg...`);

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'video.reformat',
          modelKey: 'reformat_ffmpeg',
          input: {
            videoUrl: activeVersion.url,
            format: reformatTarget,
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Reformat failed');
        setIsProcessing(false);
        return;
      }

      if (data.job?.outputs?.[0]) {
        const out = data.job.outputs[0];
        setVersions((prev) => {
          const newVer: VersionItem = {
            id: `ver_${Date.now()}`,
            assetId: out.assetId,
            label: `v${prev.length} Format ${reformatTarget}`,
            time: 'Just now',
            url: out.url,
            type: 'video',
            parentAssetId: activeVersion.assetId,
            toolUsed: `Reformat ${reformatTarget}`,
          };
          const updated = [...prev, newVer];
          setActiveVersionIndex(updated.length - 1);
          return updated;
        });
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 7. Video Upscale Apply (fal.ai Video Upscaler)
  const handleApplyVideoUpscale = async () => {
    if (!activeVersion) return;
    setIsProcessing(true);
    setProcessingStatus('Upscaling video with fal-ai/video-upscaler...');

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'video.upscale',
          modelKey: 'vup_fal_video',
          input: {
            videoUrl: activeVersion.url,
            scale: 2,
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.blockedByGuard) {
          setCostBlockedMessage(data.error);
        } else {
          alert(data.error || 'Video upscale failed');
        }
        setIsProcessing(false);
        return;
      }

      if (data.job?.id) {
        pollJobToCompletion(data.job.id, 'Video Upscale 2x');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // 8. Extend Video Apply (MiniMax H3 Max)
  const handleApplyExtendVideo = async () => {
    if (!activeVersion || !extendPrompt.trim()) return;
    setIsProcessing(true);
    setProcessingStatus('Extending video with MiniMax H3 Max...');

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'video.edit',
          modelKey: 'vedit_minimax_extend',
          input: {
            videoUrl: activeVersion.url,
            prompt: extendPrompt.trim(),
            duration: extendDuration,
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.blockedByGuard) {
          setCostBlockedMessage(data.error);
        } else {
          alert(data.error || 'Video extension failed');
        }
        setIsProcessing(false);
        return;
      }

      if (data.job?.id) {
        pollJobToCompletion(data.job.id, 'Extend Video');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // 9. AI Video Edit Apply (Grok Imagine / Kling O3)
  const handleApplyVideoEdit = async () => {
    if (!activeVersion || !videoEditPrompt.trim()) return;
    setIsProcessing(true);
    const modelName = videoEditModel === 'vedit_grok_video' ? 'Grok Imagine Video' : 'Kling O3 Edit';
    setProcessingStatus(`Editing video with ${modelName}...`);

    try {
      const res = await fetchWithAuth('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'video.edit',
          modelKey: videoEditModel,
          input: {
            videoUrl: activeVersion.url,
            prompt: videoEditPrompt.trim(),
            duration: 5,
            assetId: activeVersion.assetId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.blockedByGuard) {
          setCostBlockedMessage(data.error);
        } else {
          alert(data.error || 'Video edit failed');
        }
        setIsProcessing(false);
        return;
      }

      if (data.job?.id) {
        pollJobToCompletion(data.job.id, 'AI Video Edit');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // Undo and Redo move through version history
  const handleUndo = () => {
    if (activeVersionIndex > 0) {
      setActiveVersionIndex((prev) => prev - 1);
    }
  };

  const handleRedo = () => {
    if (activeVersionIndex < versions.length - 1) {
      setActiveVersionIndex((prev) => prev + 1);
    }
  };

  const toggleAdSize = (size: string) => {
    setAdSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
  };

  // Active Tool metadata
  const activeToolConfig = currentTools.find((t) => t.id === activeTool) || currentTools[0];

  // Primary action button props depending on activeTool
  const getToolActionProps = () => {
    switch (activeTool) {
      case 'ai-edit':
        return {
          label: 'Apply edit',
          cost: 'Estimated cost: $0.07',
          disabled: isProcessing || !aiPrompt.trim(),
          disabledReason: !aiPrompt.trim() ? 'Describe the change first' : '',
          onClick: handleApplyAiEdit,
          model: 'GPT Image 2 Edit',
          canChangeModel: false,
        };
      case 'bg-replace':
        return {
          label: 'Replace background',
          cost: 'Estimated cost: $0.07',
          disabled: isProcessing,
          disabledReason: '',
          onClick: handleApplyReplaceBg,
          model: 'GPT Image 2 Edit (Background)',
          canChangeModel: false,
        };
      case 'bg-remove':
        return {
          label: 'Remove background',
          cost: 'Estimated cost: $0.03',
          disabled: isProcessing,
          disabledReason: '',
          onClick: handleApplyRemoveBg,
          model: 'Bria Guided 2.2',
          canChangeModel: false,
        };
      case 'upscale':
        return {
          label: upscaleFactor === '2x' ? 'Upscale 2x' : 'Upscale 4x',
          cost: 'Commercial license pending',
          disabled: true,
          disabledReason: 'Model license confirmation pending',
          onClick: () => {},
          model: 'Clarity Upscaler',
          canChangeModel: false,
        };
      case 'resize-ads':
        return {
          label: 'Create all sizes',
          cost: 'Free (0 credits)',
          disabled: isProcessing || adSizes.size === 0,
          disabledReason: adSizes.size === 0 ? 'Select at least one format' : '',
          onClick: handleApplyResizeAds,
          model: 'Server Sharp (Native)',
          canChangeModel: false,
        };
      case 'vedit':
        return {
          label: 'Apply edit',
          cost: videoEditModel === 'vedit_grok_video' ? 'Estimated cost: ≈ $0.05/s' : 'Estimated cost: ≈ $0.17/s',
          disabled: isProcessing || !videoEditPrompt.trim(),
          disabledReason: !videoEditPrompt.trim() ? 'Describe the video change first' : '',
          onClick: handleApplyVideoEdit,
          model: videoEditModel === 'vedit_grok_video' ? 'Grok Imagine Video' : 'Kling O3 Pro',
          canChangeModel: true,
        };
      case 'extend':
        return {
          label: 'Extend video',
          cost: 'Estimated cost: $0.40 (+5s)',
          disabled: isProcessing || !extendPrompt.trim(),
          disabledReason: !extendPrompt.trim() ? 'Describe continuation first' : '',
          onClick: handleApplyExtendVideo,
          model: 'MiniMax H3 Max Turbo',
          canChangeModel: false,
        };
      case 'vupscale':
        return {
          label: 'Upscale 2x',
          cost: 'Estimated cost: $0.05',
          disabled: isProcessing,
          disabledReason: '',
          onClick: handleApplyVideoUpscale,
          model: 'fal-ai/video-upscaler',
          canChangeModel: false,
        };
      case 'trim':
        return {
          label: 'Trim',
          cost: 'Free (0 credits)',
          disabled: isProcessing || (mediaType === 'video' && videoDuration === null),
          disabledReason: videoDuration === null ? 'Specify video length first' : '',
          onClick: handleApplyTrimVideo,
          model: 'Server FFmpeg (Native)',
          canChangeModel: false,
        };
      case 'reformat':
        return {
          label: 'Reformat',
          cost: 'Free (0 credits)',
          disabled: isProcessing,
          disabledReason: '',
          onClick: handleApplyReformatVideo,
          model: 'Server FFmpeg (Native)',
          canChangeModel: false,
        };
      default:
        return {
          label: 'Apply',
          cost: 'Free',
          disabled: false,
          disabledReason: '',
          onClick: () => {},
          model: 'Auto',
          canChangeModel: false,
        };
    }
  };

  const actionProps = getToolActionProps();

  // Loading Review State
  if (reviewState === 'loading') {
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between">
          <Skeleton height={34} width={120} />
          <Skeleton height={40} width={160} rounded="md" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_320px] gap-6 h-[540px]">
          <Skeleton height="100%" rounded="lg" />
          <Skeleton height="100%" rounded="lg" />
          <Skeleton height="100%" rounded="lg" />
        </div>
        <Skeleton height={48} rounded="lg" />
      </div>
    );
  }

  // Error Review State
  if (reviewState === 'error') {
    return (
      <div className="py-12 space-y-6">
        <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-[var(--danger)]" />
          <h2 className="type-h2 text-[var(--danger)]">Failed to load media workspace</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to process media transform layers. Please reload or choose another file.
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

  // Empty State: Only Dropzone and "Choose from library" button (Rail & Settings hidden)
  if (reviewState === 'empty' || versions.length === 0 || !activeVersion) {
    return (
      <div className="space-y-6 pb-24">
        {/* Top Header */}
        <div className="pb-3 border-b border-[var(--border-subtle)] space-y-1">
          <div className="flex items-center justify-between">
            <h1 className="type-h1 text-[var(--text-primary)]">Edit</h1>
            <Segmented
              options={[
                { value: 'image', label: 'Image' },
                { value: 'video', label: 'Video' },
              ]}
              value={mediaType}
              onChange={(v) => handleSwitchMediaType(v as 'image' | 'video')}
            />
          </div>
          <p className="text-[13px] text-[var(--text-secondary)]">
            1. Choose a tool &nbsp;•&nbsp; 2. Adjust &nbsp;•&nbsp; 3. Apply
          </p>
        </div>

        {/* Empty Canvas: Dropzone + Choose from library */}
        <div className="max-w-2xl mx-auto py-10 space-y-4">
          <Dropzone
            label={`Upload ${mediaType} to edit`}
            caption={
              mediaType === 'image'
                ? 'Drop an image (PNG, JPG, WebP up to 25 MB), or choose directly from your studio library'
                : 'Drop a video (MP4, WebM up to 500 MB), or choose directly from your studio library'
            }
            onFileSelect={handleUploadFile}
            onChooseFromAssets={() => setShowAssetPicker(true)}
          />

          <div className="flex justify-center">
            <Button
              variant="secondary"
              size={40}
              icon={<FolderPlus size={16} />}
              onClick={() => setShowAssetPicker(true)}
            >
              Choose from library
            </Button>
          </div>
        </div>

        <AssetPickerModal
          isOpen={showAssetPicker}
          onClose={() => setShowAssetPicker(false)}
          onSelect={(asset) => handleSelectMedia(asset)}
          filterType={mediaType}
        />
      </div>
    );
  }

  // Active Workspace Layout
  return (
    <div className="space-y-4 pb-24">
      {/* Cost Banner if blocked */}
      {costBlockedMessage && <CostBanner message={costBlockedMessage} />}

      {/* Top Header */}
      <div className="pb-3 border-b border-[var(--border-subtle)] space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="type-h1 text-[var(--text-primary)]">Edit</h1>
            <button
              type="button"
              onClick={() => {
                setVersions([]);
                setActiveVersionIndex(-1);
              }}
              className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer"
            >
              Change media
            </button>
          </div>
          <Segmented
            options={[
              { value: 'image', label: 'Image' },
              { value: 'video', label: 'Video' },
            ]}
            value={mediaType}
            onChange={(v) => handleSwitchMediaType(v as 'image' | 'video')}
          />
        </div>
        <p className="text-[13px] text-[var(--text-secondary)]">
          1. Choose a tool &nbsp;•&nbsp; 2. Adjust &nbsp;•&nbsp; 3. Apply
        </p>
      </div>

      {/* Mobile Tool Rail (Horizontal Chips) */}
      <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-2 no-scrollbar">
        {currentTools.map((t) => {
          const isSelected = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                handleSelectTool(t.id);
                setIsMobileSettingsOpen(true);
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                  : 'bg-[var(--bg-2)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
              }`}
            >
              {t.icon}
              <span>{t.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                t.category === 'free'
                  ? 'bg-[var(--success-soft)] text-[var(--success)]'
                  : 'bg-[var(--bg-3)] text-[var(--text-tertiary)]'
              }`}>
                {t.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main 3-Column Workspace on Desktop: Left Rail (200px) + Centre Canvas + Right Panel (320px) */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_320px] gap-4 min-h-[540px]">
        {/* ================= 1. LEFT TOOL RAIL (Desktop: 200px) ================= */}
        <aside className="hidden lg:flex flex-col bg-[var(--bg-1)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] p-3 space-y-4 select-none shrink-0">
          {/* AI Tools Group */}
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold px-2">
              AI tools
            </div>
            <div className="space-y-1">
              {currentTools
                .filter((t) => t.category === 'ai')
                .map((tool) => {
                  const isSelected = activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleSelectTool(tool.id)}
                      className={`w-full p-2 rounded-[var(--radius-buttons)] border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]/50'
                          : 'bg-[var(--bg-2)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-3)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[var(--text-primary)]">
                          <span className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}>
                            {tool.icon}
                          </span>
                          <span>{tool.name}</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-3)] text-[var(--text-secondary)] tabular-nums">
                          {tool.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)] line-clamp-1 leading-snug">
                        {tool.help}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Free Tools Group */}
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold px-2">
              Free tools (no AI cost)
            </div>
            <div className="space-y-1">
              {currentTools
                .filter((t) => t.category === 'free')
                .map((tool) => {
                  const isSelected = activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleSelectTool(tool.id)}
                      className={`w-full p-2 rounded-[var(--radius-buttons)] border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]/50'
                          : 'bg-[var(--bg-2)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-3)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5 font-semibold text-[13px] text-[var(--text-primary)]">
                          <span className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}>
                            {tool.icon}
                          </span>
                          <span>{tool.name}</span>
                        </div>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--success-soft)] text-[var(--success)]">
                          Free
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)] line-clamp-1 leading-snug">
                        {tool.help}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>
        </aside>

        {activeTool === 'motion' ? (
          <div className="lg:col-span-2">
            <MotionTransferPanel />
          </div>
        ) : (
          <>
        {/* ================= 2. CENTRE CANVAS ================= */}
        <div className="relative rounded-[var(--radius-cards)] border border-[var(--border-subtle)] overflow-hidden flex flex-col items-center justify-center p-4 bg-[var(--bg-1)] select-none min-h-[460px]">
          {/* Checkerboard Pattern */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(45deg, #202430 25%, transparent 25%), linear-gradient(-45deg, #202430 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #202430 75%), linear-gradient(-45deg, transparent 75%, #202430 75%)`,
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
            }}
          />

          {/* Processing Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
              <Loader2 size={32} className="text-[var(--accent)] animate-spin" />
              <div className="type-h3 text-[var(--text-primary)]">Processing Media</div>
              <p className="type-caption text-[var(--text-secondary)] max-w-xs">
                {processingStatus || 'Applying edits...'}
              </p>
            </div>
          )}

          {/* Floating Canvas Toolbar Pill */}
          <div className="absolute top-3 z-20 flex items-center gap-1 p-1 bg-[var(--bg-2)]/90 border border-[var(--border-strong)] rounded-full shadow-[var(--shadow-popover)]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              aria-label="Zoom out"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-semibold text-[var(--text-primary)] tabular-nums px-1">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(200, z + 25))}
              aria-label="Zoom in"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
            >
              <ZoomIn size={14} />
            </button>
            <div className="w-[1px] h-3.5 bg-[var(--border-subtle)] mx-0.5" />
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] rounded cursor-pointer"
            >
              Fit
            </button>
            <div className="w-[1px] h-3.5 bg-[var(--border-subtle)] mx-0.5" />
            <button
              type="button"
              onClick={handleUndo}
              disabled={activeVersionIndex <= 0}
              title="Undo version"
              aria-label="Undo version"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] disabled:opacity-30 cursor-pointer"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={activeVersionIndex >= versions.length - 1}
              title="Redo version"
              aria-label="Redo version"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] disabled:opacity-30 cursor-pointer"
            >
              <Redo2 size={14} />
            </button>
            {originalVersion && (
              <>
                <div className="w-[1px] h-3.5 bg-[var(--border-subtle)] mx-0.5" />
                <button
                  type="button"
                  onClick={() => setShowCompare(!showCompare)}
                  className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    showCompare
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)]'
                  }`}
                >
                  <ArrowLeftRight size={12} />
                  <span>Compare</span>
                </button>
              </>
            )}
          </div>

          {/* Active Canvas Media Display */}
          <div
            className="relative z-10 transition-transform duration-150 max-w-full flex items-center justify-center"
            style={{ transform: `scale(${zoom / 100})` }}
          >
            {showCompare && originalVersion ? (
              <div className="w-[480px] max-w-full">
                <BeforeAfterSlider
                  beforeUrl={originalVersion.url}
                  afterUrl={activeVersion.url}
                  beforeLabel="Original"
                  afterLabel={activeVersion.label}
                  aspectRatio="1/1"
                />
              </div>
            ) : (
              <div className="w-[460px] max-w-full aspect-square rounded-[var(--radius-cards)] border border-[var(--border-strong)] shadow-lg flex items-center justify-center overflow-hidden bg-black/40">
                {activeVersion.type === 'video' ? (
                  <video
                    src={activeVersion.url}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={activeVersion.url}
                    alt={activeVersion.label}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            )}
          </div>

          {/* Mobile open settings button */}
          <div className="flex lg:hidden mt-3 z-20">
            <Button
              variant="secondary"
              size={32}
              icon={<Settings2 size={14} />}
              onClick={() => setIsMobileSettingsOpen(true)}
            >
              Adjust & Apply ({activeToolConfig.name})
            </Button>
          </div>
        </div>

        {/* ================= 3. RIGHT PANEL (Desktop: 320px) ================= */}
        <aside className="hidden lg:flex flex-col justify-between bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-cards)] p-4 overflow-y-auto space-y-4 select-none shrink-0">
          <div className="space-y-3.5">
            {/* Header: Tool Name */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent)]">{activeToolConfig.icon}</span>
                <span className="text-[14px] font-bold text-[var(--text-primary)]">
                  {activeToolConfig.name}
                </span>
              </div>
              <Badge variant={activeToolConfig.badgeVariant}>
                {activeToolConfig.badge}
              </Badge>
            </div>

            {/* 1. Main Field First (Prompt or Choice) */}
            <div className="space-y-2">
              {activeTool === 'ai-edit' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Edit Prompt
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Add subtle warm rim light, make product matte black"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full p-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
                  />
                  <div className="flex flex-wrap gap-1">
                    {quickIdeas.map((idea) => (
                      <button
                        key={idea}
                        type="button"
                        onClick={() => setAiPrompt(idea)}
                        className="px-2 py-0.5 rounded-full bg-[var(--bg-3)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
                      >
                        + {idea}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTool === 'bg-replace' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Scene Preset
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {scenePresets.map((scene) => (
                      <button
                        key={scene}
                        type="button"
                        onClick={() => setSelectedScene(scene)}
                        className={`p-1.5 rounded text-[11px] font-medium border text-left cursor-pointer truncate transition-colors ${
                          selectedScene === scene
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)] font-semibold'
                            : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-4)]'
                        }`}
                      >
                        {scene}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTool === 'bg-remove' && (
                <div className="p-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Transparent Cutout
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    Automatically extracts subject and creates transparent PNG with full sub-pixel edge refinement.
                  </p>
                </div>
              )}

              {activeTool === 'upscale' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Upscale Resolution
                  </label>
                  <Segmented
                    options={[
                      { value: '2x', label: '2x (2048px)' },
                      { value: '4x', label: '4x (4096px)' },
                    ]}
                    value={upscaleFactor}
                    onChange={(v) => setUpscaleFactor(v as '2x' | '4x')}
                    size="sm"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    Enhance fine details, textures, and typography without artifacts.
                  </p>
                </div>
              )}

              {activeTool === 'resize-ads' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Select Ad Formats
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['9:16', '1:1', '4:5', '16:9'].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => toggleAdSize(sz)}
                        className={`p-2 rounded text-[12px] font-medium border flex items-center justify-between cursor-pointer transition-colors ${
                          adSizes.has(sz)
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)] font-semibold'
                            : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-4)]'
                        }`}
                      >
                        <span>{sz}</span>
                        {adSizes.has(sz) && <Check size={14} strokeWidth={2.5} />}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    Uses native server Sharp to pad or smart-crop instantaneously.
                  </p>
                </div>
              )}

              {activeTool === 'vedit' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Video Edit Instruction
                  </label>
                  <textarea
                    rows={3}
                    value={videoEditPrompt}
                    onChange={(e) => setVideoEditPrompt(e.target.value)}
                    placeholder="Describe scene modifications, styling, or elements to change..."
                    className="w-full p-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
                  />
                </div>
              )}

              {activeTool === 'extend' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Continuation Description
                  </label>
                  <textarea
                    rows={3}
                    value={extendPrompt}
                    onChange={(e) => setExtendPrompt(e.target.value)}
                    placeholder="Describe what happens in the next 5 seconds..."
                    className="w-full p-2.5 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
                  />
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <span>Duration:</span>
                    <span className="px-2 py-0.5 rounded bg-[var(--bg-3)] font-semibold text-[var(--accent)]">
                      +5s continuation
                    </span>
                  </div>
                </div>
              )}

              {activeTool === 'vupscale' && (
                <div className="p-3 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                    2x Video Enhancer
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    Upscales video by 2x resolution with spatial and temporal coherence via fal-ai/video-upscaler.
                  </p>
                </div>
              )}

              {activeTool === 'trim' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Trim Clip Range
                  </label>
                  {videoDuration === null ? (
                    <div className="space-y-1">
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Enter video length in seconds:
                      </span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        placeholder="e.g. 10.0"
                        className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            const rounded = Math.round(val * 10) / 10;
                            setVideoDuration(rounded);
                            setTrimRange([0, rounded]);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-primary)]">
                        <span>Start: {trimRange[0]}s</span>
                        <span>End: {trimRange[1]}s</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, Math.ceil(videoDuration))}
                        step={0.1}
                        value={trimRange[1]}
                        onChange={(e) =>
                          setTrimRange([trimRange[0], Math.max(trimRange[0] + 0.5, Number(e.target.value))])
                        }
                        className="w-full accent-[var(--accent)] cursor-pointer"
                      />
                      <div className="text-[11px] text-[var(--text-secondary)] text-right tabular-nums">
                        Clip duration: {Math.round((trimRange[1] - trimRange[0]) * 10) / 10}s
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTool === 'reformat' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Target Format & Aspect
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {['9:16', '1:1', '16:9', '4:5', 'WebM'].map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setReformatTarget(f)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
                          reformatTarget === f
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)] font-semibold'
                            : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-4)]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Model (Collapsed to one line with a Change link) */}
            <div className="p-2 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] border border-[var(--border-subtle)] space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Model:
                  </span>
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    {actionProps.model}
                  </span>
                </div>
                {actionProps.canChangeModel && (
                  <button
                    type="button"
                    onClick={() => setShowModelChange(!showModelChange)}
                    className="text-[var(--accent)] hover:underline text-[11px] font-medium cursor-pointer shrink-0 ml-2"
                  >
                    Change
                  </button>
                )}
              </div>

              {/* Collapsed model picker options if change is clicked */}
              {showModelChange && activeTool === 'vedit' && (
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                  <button
                    type="button"
                    onClick={() => setVideoEditModel('vedit_grok_video')}
                    className={`w-full p-1.5 rounded text-[11px] text-left border flex items-center justify-between cursor-pointer ${
                      videoEditModel === 'vedit_grok_video'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-2)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span>Grok Imagine (Fast, $0.05/s)</span>
                    {videoEditModel === 'vedit_grok_video' && <Check size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoEditModel('vedit_kling_o3')}
                    className={`w-full p-1.5 rounded text-[11px] text-left border flex items-center justify-between cursor-pointer ${
                      videoEditModel === 'vedit_kling_o3'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-2)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span>Kling O3 Pro (Cinematic, $0.168/s)</span>
                    {videoEditModel === 'vedit_kling_o3' && <Check size={12} />}
                  </button>
                </div>
              )}
            </div>

            {/* 3. Advanced Section (Closed by default) */}
            <div className="border border-[var(--border-subtle)] rounded-[var(--radius-buttons)] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-3 py-2 flex items-center justify-between text-left bg-[var(--bg-3)] hover:bg-[var(--bg-4)] text-[12px] font-medium text-[var(--text-secondary)] transition-colors cursor-pointer"
              >
                <span>Advanced options</span>
                {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {showAdvanced && (
                <div className="p-3 bg-[var(--bg-2)] space-y-2 border-t border-[var(--border-subtle)] text-[11px]">
                  {activeTool === 'bg-replace' && (
                    <div className="space-y-1">
                      <span className="text-[var(--text-secondary)]">Custom background prompt additions:</span>
                      <input
                        type="text"
                        placeholder="e.g. sunset lighting, bokeh background"
                        value={customScenePrompt}
                        onChange={(e) => setCustomScenePrompt(e.target.value)}
                        className="w-full p-1.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  )}

                  {activeTool === 'ai-edit' && (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• Inpainting masks are generated automatically based on your prompt.</p>
                      <p>• Output is generated at native original aspect ratio.</p>
                    </div>
                  )}

                  {activeTool === 'bg-remove' && (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• Output format: 32-bit transparent PNG.</p>
                      <p>• Background shadows: automatically softened.</p>
                    </div>
                  )}

                  {activeTool === 'resize-ads' && (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• Canvas scaling: intelligent letterbox with dominant boundary color.</p>
                      <p>• Preserves 100% color profile (sRGB / Display P3).</p>
                    </div>
                  )}

                  {activeTool === 'vedit' && (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• Grok Imagine processes up to the first 8 seconds of source footage.</p>
                      <p>• Audio track is preserved where supported by container.</p>
                    </div>
                  )}

                  {activeTool === 'extend' && (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• MiniMax H3 Max Turbo extends motion continuity smoothly.</p>
                      <p>• Output container: MP4 H.264.</p>
                    </div>
                  )}

                  {activeTool === 'trim' && (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• Fast keyframe trimming via server FFmpeg with stream copy.</p>
                    </div>
                  )}

                  {activeTool === 'reformat' && (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• Video bitrate: High profile auto-adjusted to container limits.</p>
                    </div>
                  )}

                  {activeTool === 'upscale' || activeTool === 'vupscale' ? (
                    <div className="space-y-1 text-[var(--text-secondary)]">
                      <p>• Neural super-resolution with edge reconstruction.</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* 4. Bottom Sticky Action Area */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2 shrink-0">
            {/* Cost Line */}
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[var(--text-secondary)]">Estimated cost:</span>
              <span className={`font-semibold font-mono ${
                actionProps.cost.includes('Free') ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'
              }`}>
                {actionProps.cost.replace('Estimated cost: ', '')}
              </span>
            </div>

            {/* Primary Action Button */}
            <Button
              variant="primary"
              size={40}
              className="w-full font-semibold"
              onClick={actionProps.onClick}
              disabled={actionProps.disabled}
            >
              {actionProps.label}
            </Button>

            {/* Disabled Reason in small text */}
            {actionProps.disabledReason && (
              <p className="text-[11px] text-[var(--text-tertiary)] text-center leading-tight">
                {actionProps.disabledReason}
              </p>
            )}

            {/* Save & Download secondary links */}
            <div className="flex items-center justify-between pt-1 text-[11px]">
              <button
                type="button"
                onClick={() => alert(`Version ${activeVersion.label} saved in Assets.`)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <FolderPlus size={13} />
                <span>Save to Assets</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeVersion.url) window.open(activeVersion.url, '_blank');
                }}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <Download size={13} />
                <span>Download</span>
              </button>
            </div>
          </div>
        </aside>
          </>
        )}
      </div>

      {/* ================= 4. VERSIONS STRIP AT THE BOTTOM ================= */}
      <div className="rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] overflow-hidden select-none">
        {/* Collapsed Thin Bar Header: "Versions (3)" */}
        <button
          type="button"
          onClick={() => setIsVersionsOpen(!isVersionsOpen)}
          className="w-full px-4 py-2.5 flex items-center justify-between bg-[var(--bg-2)] hover:bg-[var(--bg-3)] transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">
              Versions ({versions.length})
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              • Active: {activeVersion?.label || 'Original'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {originalVersion && versions.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCompare(!showCompare);
                }}
                className={`text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  showCompare ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Before / After
              </span>
            )}
            <div className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span className="text-[11px]">{isVersionsOpen ? 'Hide' : 'Show'}</span>
              {isVersionsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </div>
          </div>
        </button>

        {/* Expanded Versions Horizontal Scroll List */}
        {isVersionsOpen && (
          <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-1)]">
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {versions.map((ver, idx) => {
                const isActive = idx === activeVersionIndex;
                return (
                  <button
                    key={ver.id}
                    type="button"
                    onClick={() => {
                      setActiveVersionIndex(idx);
                      setShowCompare(false);
                    }}
                    className={`h-14 px-3 rounded-[var(--radius-buttons)] border flex items-center gap-2.5 transition-all cursor-pointer shrink-0 ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--bg-4)] ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-2)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-md border border-[var(--border-subtle)] shrink-0 overflow-hidden bg-black/40 flex items-center justify-center">
                      {ver.url ? (
                        ver.type === 'video' ? (
                          <Film size={18} className="text-[var(--text-secondary)]" />
                        ) : (
                          <img src={ver.url} alt={ver.label} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <ImageIcon size={18} className="text-[var(--text-secondary)]" />
                      )}
                    </div>
                    <div className="text-left min-w-[70px]">
                      <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                        {ver.label}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        {ver.time}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ================= 5. MOBILE BOTTOM SHEET SETTINGS DRAWER ================= */}
      {isMobileSettingsOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--bg-2)] border-t border-[var(--border-strong)] rounded-t-[20px] p-4 max-h-[80vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 font-bold text-[14px] text-[var(--text-primary)]">
                <span className="text-[var(--accent)]">{activeToolConfig.icon}</span>
                <span>{activeToolConfig.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileSettingsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-3)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mobile Tool Inputs */}
            <div className="space-y-3">
              {activeTool === 'ai-edit' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-[var(--text-primary)]">Edit Prompt</label>
                  <textarea
                    rows={2}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Add subtle warm rim light"
                    className="w-full p-2.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
                  />
                </div>
              )}

              {activeTool === 'bg-replace' && (
                <div className="grid grid-cols-2 gap-1.5">
                  {scenePresets.map((scene) => (
                    <button
                      key={scene}
                      type="button"
                      onClick={() => setSelectedScene(scene)}
                      className={`p-2 rounded text-[11px] font-medium border text-left ${
                        selectedScene === scene
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                          : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {scene}
                    </button>
                  ))}
                </div>
              )}

              {activeTool === 'resize-ads' && (
                <div className="grid grid-cols-2 gap-1.5">
                  {['9:16', '1:1', '4:5', '16:9'].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => toggleAdSize(sz)}
                      className={`p-2 rounded text-[12px] font-medium border flex items-center justify-between ${
                        adSizes.has(sz)
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                          : 'bg-[var(--bg-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      <span>{sz}</span>
                      {adSizes.has(sz) && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}

              {activeTool === 'vedit' && (
                <textarea
                  rows={2}
                  value={videoEditPrompt}
                  onChange={(e) => setVideoEditPrompt(e.target.value)}
                  placeholder="Describe video edits..."
                  className="w-full p-2.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
                />
              )}

              {activeTool === 'extend' && (
                <textarea
                  rows={2}
                  value={extendPrompt}
                  onChange={(e) => setExtendPrompt(e.target.value)}
                  placeholder="Describe continuation..."
                  className="w-full p-2.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]"
                />
              )}
            </div>

            {/* Mobile Bottom Sticky Primary Action */}
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--text-secondary)]">Estimated cost:</span>
                <span className="font-semibold font-mono text-[var(--text-primary)]">
                  {actionProps.cost.replace('Estimated cost: ', '')}
                </span>
              </div>
              <Button
                variant="primary"
                size={40}
                className="w-full"
                onClick={() => {
                  actionProps.onClick();
                  setIsMobileSettingsOpen(false);
                }}
                disabled={actionProps.disabled}
              >
                {actionProps.label}
              </Button>
              {actionProps.disabledReason && (
                <p className="text-[11px] text-[var(--text-tertiary)] text-center">
                  {actionProps.disabledReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Asset Picker Modal */}
      <AssetPickerModal
        isOpen={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        onSelect={(asset) => handleSelectMedia(asset)}
        filterType={mediaType}
      />
    </div>
  );
};
