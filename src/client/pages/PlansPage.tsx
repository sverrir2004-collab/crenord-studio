import React, { useState, useEffect } from 'react';
import {
  PieChart,
  Calendar,
  AlertCircle,
  RotateCcw,
  TrendingUp,
  DollarSign,
  Filter,
} from 'lucide-react';
import { Table } from '../components/ui/Table.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Chip } from '../components/ui/Chip.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { Button } from '../components/ui/Button.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { UsageRow, DailyTotal } from '../types/media.ts';
import { useReviewState } from '../lib/useReviewState.ts';
import { fetchWithAuth } from '../lib/firebase.ts';

export const PlansPage: React.FC = () => {
  const [reviewState] = useReviewState();
  const [todaySpend, setTodaySpend] = useState<number>(0);
  const [dailyCap, setDailyCap] = useState<number>(3.0);
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [toolFilter, setToolFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fetchUsageData = async () => {
    setLoading(true);
    setHasError(false);
    try {
      const url = toolFilter !== 'all' ? `/api/usage?tool=${encodeURIComponent(toolFilter)}` : '/api/usage';
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error('Failed to load usage');
      const data = await res.json();
      setTodaySpend(typeof data.todaySpend === 'number' ? data.todaySpend : 0);
      setDailyCap(typeof data.dailyCap === 'number' ? data.dailyCap : 3.0);
      if (Array.isArray(data.dailyTotals)) {
        setDailyTotals(data.dailyTotals);
      }
      if (Array.isArray(data.rows)) {
        setUsageRows(data.rows);
      }
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageData();
  }, [toolFilter]);

  const hasDailyCap = dailyCap > 0;
  const activeCap = hasDailyCap ? dailyCap : 1;
  const spendPercent = hasDailyCap
    ? Math.min(100, Math.round((todaySpend / activeCap) * 100))
    : 0;

  const progressColor =
    spendPercent >= 100
      ? 'bg-[var(--danger)]'
      : spendPercent >= 80
      ? 'bg-[var(--warning)]'
      : 'bg-[var(--accent)]';

  // Loading State
  if (reviewState === 'loading' || loading) {
    return (
      <div className="space-y-6 pb-24">
        <Skeleton height={34} width={140} />
        <Skeleton height={140} rounded="lg" />
        <Skeleton height={220} rounded="lg" />
        <Skeleton height={320} rounded="lg" />
      </div>
    );
  }

  // Error State
  if (reviewState === 'error' || hasError) {
    return (
      <div className="py-12 space-y-6">
        <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--danger-soft)] border border-[var(--danger)] text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-[var(--danger)]" />
          <h2 className="type-h2 text-[var(--danger)]">Failed to load usage ledger</h2>
          <p className="type-caption text-[var(--danger)]/80 max-w-md mx-auto">
            Unable to fetch account spending records and cost limits.
          </p>
          <Button
            variant="danger"
            size={40}
            icon={<RotateCcw size={16} />}
            onClick={() => fetchUsageData()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="type-h1 text-[var(--text-primary)]">Plans & Usage</h1>
          <p className="type-caption text-[var(--text-secondary)]">
            Daily cost guard enforcement, model usage ledger and spending analytics.
          </p>
        </div>
      </div>

      {/* Today's Spend Banner Card */}
      <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              TODAY'S SPEND (COST GUARD)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold text-[var(--text-primary)] tabular-nums">
                ${todaySpend.toFixed(3)}
              </span>
              <span className="text-[14px] text-[var(--text-tertiary)]">
                {hasDailyCap ? `/ $${dailyCap.toFixed(2)} daily cap` : '/ No limit (unlimited)'}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="type-caption text-[var(--text-secondary)] block">Account Mode</span>
            <span className="text-[13px] font-semibold text-[var(--accent)]">
              Pro Studio (fal.ai backend)
            </span>
          </div>
        </div>

        {/* Cap Progress Bar */}
        {hasDailyCap ? (
          <div className="space-y-1.5">
            <div className="w-full h-2.5 rounded-full bg-[var(--bg-4)] overflow-hidden">
              <div
                className={`h-full ${progressColor} transition-all duration-300`}
                style={{ width: `${spendPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[var(--text-tertiary)] tabular-nums">
              <span>{spendPercent}% of daily limit used</span>
              <span>Resets at midnight UTC</span>
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-[var(--text-tertiary)]">
            Cost guard cap disabled. Spending billed directly against fal.ai prepaid balance.
          </div>
        )}
      </div>

      {/* 7-Day Daily Totals CSS Bar Chart */}
      <div className="p-6 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="type-h3 text-[var(--text-primary)]">Last 7 Days Spending</h2>
            <p className="type-caption text-[var(--text-secondary)]">
              Daily compute expenditures across generation and transform runs.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] font-medium">
            <Calendar size={14} className="text-[var(--accent)]" />
            <span>Past week</span>
          </div>
        </div>

        {/* CSS Bar Chart */}
        <div className="h-44 flex items-end justify-between gap-2 pt-6 pb-2 border-b border-[var(--border-subtle)]">
          {dailyTotals.map((col, idx) => (
            <div key={col.date || idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                ${col.amount.toFixed(2)}
              </span>
              <div className="w-full max-w-[40px] bg-[var(--bg-4)] rounded-t-[4px] overflow-hidden flex items-end">
                <div
                  className="w-full bg-[var(--accent)] group-hover:bg-[var(--accent-hover)] transition-all duration-300"
                  style={{ height: `${col.height}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors">
                {col.day}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Usage Table Section with Tool Filter */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="type-h2 text-[var(--text-primary)]">Usage Ledger</h2>
            <p className="type-caption text-[var(--text-secondary)]">
              Granular log of every generation, transform and inpainting job.
            </p>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'image', label: 'Image' },
              { id: 'video', label: 'Video' },
              { id: 'audio', label: 'Voice' },
              { id: 'clean', label: 'Clean' },
              { id: 'edit', label: 'Edit' },
            ].map((f) => (
              <Chip
                key={f.id}
                selected={toolFilter === f.id}
                onClick={() => setToolFilter(f.id)}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </div>

        {usageRows.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[var(--text-secondary)]">
            No ledger records for the selected filter.
          </div>
        ) : (
          <Table
            columns={[
              {
                header: 'Date',
                cell: (row) => (
                  <span className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                    {row.date || 'Today'}
                  </span>
                ),
              },
              { header: 'Tool', accessorKey: 'tool' },
              { header: 'Model', accessorKey: 'model' },
              {
                header: 'Cost',
                align: 'right',
                cell: (row) => (
                  <span className="font-semibold text-[var(--accent)] tabular-nums">
                    ${(row.estCostUsd || 0).toFixed(3)}
                  </span>
                ),
              },
              {
                header: 'Status',
                align: 'center',
                cell: (row) => (
                  <Badge
                    variant={
                      row.status === 'succeeded'
                        ? 'success'
                        : row.status === 'failed'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {row.status}
                  </Badge>
                ),
              },
            ]}
            data={usageRows}
            keyExtractor={(r) => r.id}
          />
        )}
      </div>
    </div>
  );
};
