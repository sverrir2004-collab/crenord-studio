/**
 * CRENORD Shared Studio Types
 */

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'audio';
  title: string;
  prompt?: string;
  model?: string;
  format?: '1:1' | '9:16' | '16:9' | '4:5' | string;
  resolution?: string;
  gradient?: string;
  createdAt: string;
  cost?: number;
  url?: string;
  isFavorite?: boolean;
  duration?: string;
  tool?: string;
  projectId?: string | null;
  parentAssetId?: string | null;
  metadata?: Record<string, any>;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  assetCount: number;
  collageColors?: [string, string, string, string];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface JobItem {
  id: string;
  uid?: string;
  tool: string;
  modelKey: string;
  modelLabel?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  estCostUsd: number;
  cost?: number;
  progress?: number;
  elapsedSeconds?: number;
  createdAt: string;
  updatedAt?: string;
  outputs?: Array<{
    assetId: string;
    url: string;
    type: string;
    format?: string;
    duration?: string;
  }>;
  error?: string | null;
  gradient?: string;
}

export interface UsageRow {
  id: string;
  date: string;
  tool: string;
  model: string;
  estCostUsd: number;
  status: 'succeeded' | 'failed' | 'canceled';
  createdAt?: string;
}

export interface DailyTotal {
  day: string;
  date: string;
  amount: number;
  height: number;
}
