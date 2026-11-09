import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Image as ImageIcon,
  Film,
  Edit2,
  Mic,
  Eraser,
  FolderOpen,
  ArrowRight,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { PromptBar } from '../components/ui/PromptBar.tsx';
import { Chip } from '../components/ui/Chip.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { ResultCard } from '../components/ui/ResultCard.tsx';
import { DetailsDrawer } from '../components/ui/DetailsDrawer.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { Button } from '../components/ui/Button.tsx';
import { MediaItem } from '../types/media.ts';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [reviewState] = useReviewState();
  const [homeTool, setHomeTool] = useState<'Image' | 'Video'>('Image');
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [recentItems, setRecentItems] = useState<MediaItem[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    const fetchRecentAssets = async () => {
      try {
        const res = await fetchWithAuth('/api/assets?limit=8');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data.assets)) {
            setRecentItems(data.assets);
          }
        }
      } catch {
        // Fall back gracefully
      }
    };
    fetchRecentAssets();
    return () => {
      isMounted = false;
    };
  }, []);

  const presets = [
    'Product on marble',
    'Clean studio white',
    'Lifestyle scene',
    'Product in motion',
    'Seasonal campaign',
    'Flat lay',
  ];

  const taskCards = [
    {
      title: 'Create image',
      description: 'Generate commercial product & lifestyle photos',
      icon: <ImageIcon size={22} strokeWidth={1.75} className="text-[var(--accent)]" />,
      onClick: () => navigate('/image'),
    },
    {
      title: 'Create video',
      description: 'Animate products and text with motion models',
      icon: <Film size={22} strokeWidth={1.75} className="text-[var(--accent)]" />,
      onClick: () => navigate('/video'),
    },
    {
      title: 'Edit',
      description: 'Resize for ads, upscale and replace backgrounds',
      icon: <Edit2 size={22} strokeWidth={1.75} className="text-[var(--accent)]" />,
      onClick: () => navigate('/edit'),
    },
    {
      title: 'Voice',
      description: 'ElevenLabs voiceover, dialogue, SFX & dubbing',
      icon: <Mic size={22} strokeWidth={1.75} className="text-[var(--accent)]" />,
      onClick: () => navigate('/audio'),
    },
    {
      title: 'Clean',
      description: 'Remove watermarks, logos and text with AI',
      icon: <Eraser size={22} strokeWidth={1.75} className="text-[var(--accent)]" />,
      onClick: () => navigate('/clean'),
    },
    {
      title: 'Assets',
      description: 'Organize files, export formats and view library',
      icon: <FolderOpen size={22} strokeWidth={1.75} className="text-[var(--accent)]" />,
      onClick: () => navigate('/assets'),
    },
  ];

  const handlePromptSubmit = (payload: { prompt: string }) => {
    const targetPath = homeTool === 'Image' ? '/image' : '/video';
    navigate(`${targetPath}?prompt=${encodeURIComponent(payload.prompt)}`);
  };

  const handlePresetClick = (preset: string) => {
    setSelectedPreset(preset);
  };

  // Loading State
  if (reviewState === 'loading') {
    return (
      <div className="max-w-[960px] mx-auto py-8 space-y-12">
        <div className="text-center space-y-4">
          <Skeleton height={56} width={500} className="mx-auto" />
          <Skeleton height={80} className="w-full max-w-[920px] mx-auto rounded-[28px]" />
        </div>
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={32} width={120} rounded="full" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={130} rounded="lg" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton height={24} width={180} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={180} rounded="lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (reviewState === 'error') {
    return (
      <div className="max-w-[960px] mx-auto py-12 space-y-6">
        <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-[var(--danger)]" />
          <h2 className="type-h2 text-[var(--danger)]">Failed to load studio recommendations</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to connect to the studio service. Please check your connection or retry.
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
  if (reviewState === 'empty') {
    return (
      <div className="max-w-[960px] mx-auto py-12">
        <EmptyState
          icon={<ImageIcon size={28} />}
          title="What will you create today?"
          description="Your studio canvas is ready. Start by generating your first image or video."
          actionLabel="Create an Image"
          onAction={() => navigate('/image')}
          secondaryActionLabel="Explore Video"
          onSecondaryAction={() => navigate('/video')}
        />
      </div>
    );
  }

  // Filled State (Standard)
  return (
    <div className="max-w-[960px] mx-auto py-6 space-y-12">
      {/* Display Heading (56/60, 700, -0.025em) */}
      <div className="text-center space-y-4 pt-4">
        <h1 className="type-display text-[var(--text-primary)]">
          What will you create today?
        </h1>
      </div>

      {/* Centred PromptBar with Image | Video switch */}
      <div className="space-y-4">
        <PromptBar
          isCentered
          defaultTool={homeTool}
          tool={homeTool === 'Image' ? 'image.create' : 'video.create'}
          initialPrompt={selectedPreset ? `Editorial ad shot: ${selectedPreset}` : ''}
          pageExtras={
            <Segmented
              options={[
                { value: 'Image', label: 'Image' },
                { value: 'Video', label: 'Video' },
              ]}
              value={homeTool}
              onChange={(v) => setHomeTool(v as 'Image' | 'Video')}
              size="sm"
            />
          }
          onSubmit={handlePromptSubmit}
        />

        {/* Presets Row of Chips */}
        <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
          {presets.map((preset) => (
            <Chip
              key={preset}
              selected={selectedPreset === preset}
              onClick={() => handlePresetClick(preset)}
            >
              {preset}
            </Chip>
          ))}
        </div>
      </div>

      {/* Five Task Cards */}
      <div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {taskCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.onClick}
              className="p-4 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-3)] transition-all duration-150 text-left flex flex-col justify-between h-[130px] group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-[var(--radius-buttons)] bg-[var(--bg-3)] group-hover:bg-[var(--bg-4)] border border-[var(--border-subtle)] flex items-center justify-center">
                {card.icon}
              </div>
              <div>
                <div className="type-h3 text-[var(--text-primary)] leading-tight group-hover:text-[var(--accent)] transition-colors">
                  {card.title}
                </div>
                <div className="type-caption text-[var(--text-secondary)] text-[11px] line-clamp-1 mt-0.5">
                  {card.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Row of 8 Tiles with 'View all' link */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="type-h2 text-[var(--text-primary)]">Recent Creations</h2>
          <button
            type="button"
            onClick={() => navigate('/assets')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            <span>View all</span>
            <ArrowRight size={14} strokeWidth={1.75} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {recentItems.map((item) => (
            <div key={item.id} className="relative">
              <ResultCard
                item={item}
                onOpenDetails={() => setSelectedItem(item)}
                onAction={(action) => {
                  if (action === 'reusePrompt') {
                    setSelectedPreset(item.prompt || '');
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Details Drawer */}
      <DetailsDrawer
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
};
