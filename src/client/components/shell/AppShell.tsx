import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Image as ImageIcon,
  Film,
  Edit2,
  Mic,
  Eraser,
  FolderOpen,
  FolderKanban,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Activity,
  HelpCircle,
  Plus,
  LogOut,
  User,
  PieChart,
  X,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { JobItem } from '../../types/media.ts';
import { Badge } from '../ui/Badge.tsx';
import { useReviewState, ReviewState } from '../../lib/useReviewState.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { fetchWithAuth } from '../../lib/firebase.ts';

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showJobsPanel, setShowJobsPanel] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [reviewState, setReviewState] = useReviewState();
  const [usage, setUsage] = useState<{ spentToday: number; dailyCap: number }>({
    spentToday: 0,
    dailyCap: 3.0,
  });
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [firestoreHealth, setFirestoreHealth] = useState<{
    firestore: boolean;
    firestoreCode?: string;
    firestoreMessage?: string;
    isChecking?: boolean;
  }>({
    firestore: true,
  });

  const location = useLocation();
  const navigate = useNavigate();

  const isReviewMode = new URLSearchParams(location.search).get('review') === '1';

  const newMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const jobsPanelRef = useRef<HTMLDivElement>(null);

  // Health check handler that fetches /api/health and updates the database banner
  const checkFirestoreHealth = async (force = false) => {
    try {
      setFirestoreHealth((prev) => ({ ...prev, isChecking: true }));
      const res = await fetch(force ? '/api/health?force=true' : '/api/health');
      if (res.ok) {
        const data = await res.json();
        setFirestoreHealth({
          firestore: Boolean(data.firestore),
          firestoreCode: data.firestoreCode,
          firestoreMessage: data.firestoreMessage,
          isChecking: false,
        });
      }
    } catch {
      setFirestoreHealth((prev) => ({ ...prev, isChecking: false }));
    }
  };

  // Re-check database health every 30 seconds
  useEffect(() => {
    checkFirestoreHealth();
    const timer = setInterval(() => {
      checkFirestoreHealth();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Fetch real usage from /api/usage and real jobs from /api/jobs
  useEffect(() => {
    let isMounted = true;

    const fetchStatusData = async () => {
      try {
        const [usageRes, jobsRes] = await Promise.all([
          fetchWithAuth('/api/usage'),
          fetchWithAuth('/api/jobs?limit=15'),
        ]);

        if (usageRes.ok && isMounted) {
          const uData = await usageRes.json();
          setUsage({
            spentToday: typeof uData.spentToday === 'number' ? uData.spentToday : 0,
            dailyCap: typeof uData.dailyCap === 'number' ? uData.dailyCap : 3.0,
          });
        }

        if (jobsRes.ok && isMounted) {
          const jData = await jobsRes.json();
          if (Array.isArray(jData.jobs)) {
            setJobs(jData.jobs);
          }
        }
      } catch {
        // Fall back gracefully
      }
    };

    fetchStatusData();
    const interval = setInterval(fetchStatusData, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close menus on outside click and Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (jobsPanelRef.current && !jobsPanelRef.current.contains(e.target as Node)) {
        setShowJobsPanel(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNewMenu(false);
        setShowUserMenu(false);
        setShowJobsPanel(false);
        setShowHelpModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // User display metadata
  const userEmail = user?.email || 'bjarkasonsverrir@gmail.com';
  const userName = user?.displayName || userEmail.split('@')[0];
  const userInitials = (
    user?.displayName
      ? user.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
      : userEmail.slice(0, 2).toUpperCase()
  );

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await logout();
    navigate('/login');
  };

  // Today progress computation
  const hasDailyCap = typeof usage.dailyCap === 'number' && usage.dailyCap > 0;
  const activeDailyCap = hasDailyCap ? usage.dailyCap : 1;
  const spendPercent = hasDailyCap
    ? Math.min(100, Math.round((usage.spentToday / activeDailyCap) * 100))
    : 0;
  const progressColor =
    spendPercent >= 100
      ? 'bg-[var(--danger)]'
      : spendPercent >= 80
      ? 'bg-[var(--warning)]'
      : 'bg-[var(--accent)]';

  const mainNavItems = [
    { to: '/', label: 'Home', icon: <Home size={20} strokeWidth={1.75} /> },
    { to: '/image', label: 'Image', icon: <ImageIcon size={20} strokeWidth={1.75} /> },
    { to: '/video', label: 'Video', icon: <Film size={20} strokeWidth={1.75} /> },
    { to: '/edit', label: 'Edit', icon: <Edit2 size={20} strokeWidth={1.75} /> },
    { to: '/audio', label: 'Voice', icon: <Mic size={20} strokeWidth={1.75} /> },
    { to: '/clean', label: 'Clean', icon: <Eraser size={20} strokeWidth={1.75} /> },
  ];

  const libraryNavItems = [
    { to: '/assets', label: 'Assets', icon: <FolderOpen size={20} strokeWidth={1.75} /> },
    { to: '/projects', label: 'Projects', icon: <FolderKanban size={20} strokeWidth={1.75} /> },
  ];

  const runningJobCount = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-[var(--bg-0)] text-[var(--text-primary)]"
      style={{
        '--sidebar-width': collapsed ? '72px' : '264px',
      } as React.CSSProperties}
    >
      {/* ===================== SIDEBAR ===================== */}
      <aside
        className={`hidden md:flex flex-col shrink-0 h-full bg-[var(--bg-1)] border-r border-[var(--border-subtle)] transition-all duration-200 z-30 ${
          collapsed ? 'w-[72px]' : 'w-[264px]'
        }`}
      >
        {/* Header (64px) with Wordmark and Collapse Button */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            {/* Logo mark 28px */}
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-[13px] font-black text-white tracking-tighter">CN</span>
            </div>
            {!collapsed && (
              <span className="wordmark truncate">
                CRENORD
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer transition-colors"
          >
            {collapsed ? <ChevronRight size={16} strokeWidth={1.75} /> : <ChevronLeft size={16} strokeWidth={1.75} />}
          </button>
        </div>

        {/* 'New Generation' Split Button (Height 44, bg-2, border, radius 12) */}
        <div className="p-3 shrink-0" ref={newMenuRef}>
          <div className="relative">
            <div className="flex h-11 w-full rounded-[var(--radius-buttons)] bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all duration-150 overflow-hidden">
              <button
                type="button"
                onClick={() => navigate('/image')}
                className={`flex-1 flex items-center justify-center gap-2 text-[14px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer transition-colors ${
                  collapsed ? 'px-2' : 'px-3'
                }`}
              >
                <Plus size={18} strokeWidth={2} className="text-[var(--accent)] shrink-0" />
                {!collapsed && <span className="truncate">New Generation</span>}
              </button>
              <button
                type="button"
                onClick={() => setShowNewMenu(!showNewMenu)}
                aria-label="New creation options"
                className="w-9 border-l border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] cursor-pointer"
              >
                <ChevronDown size={15} strokeWidth={1.75} />
              </button>
            </div>

            {/* Split Menu Dropdown */}
            {showNewMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-48 py-1 bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-buttons)] shadow-[var(--shadow-popover)] z-50">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMenu(false);
                    navigate('/image');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-3)] text-left cursor-pointer"
                >
                  <ImageIcon size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
                  <span>New image</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMenu(false);
                    navigate('/video');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-3)] text-left cursor-pointer"
                >
                  <Film size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
                  <span>New video</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMenu(false);
                    navigate('/edit');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-3)] text-left cursor-pointer"
                >
                  <Edit2 size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
                  <span>Edit a file</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMenu(false);
                    navigate('/audio');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-3)] text-left cursor-pointer"
                >
                  <Mic size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
                  <span>Voice & audio</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMenu(false);
                    navigate('/clean');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-3)] text-left cursor-pointer"
                >
                  <Eraser size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
                  <span>Clean a file</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items (height 40, radius 12, icon 20, 14/500) */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 h-10 px-3 rounded-[var(--radius-buttons)] text-[14px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--bg-4)] text-[var(--text-primary)] ring-1 ring-[rgba(61,107,255,0.6)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)]'
                } ${collapsed ? 'justify-center px-0' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}

          {/* Library Divider */}
          <div className="pt-3 pb-1">
            <div className="border-t border-[var(--border-subtle)] my-2" />
            {!collapsed ? (
              <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] select-none">
                LIBRARY
              </span>
            ) : (
              <div className="w-4 h-[1px] bg-[var(--border-subtle)] mx-auto my-1" />
            )}
          </div>

          {libraryNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 h-10 px-3 rounded-[var(--radius-buttons)] text-[14px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--bg-4)] text-[var(--text-primary)] ring-1 ring-[rgba(61,107,255,0.6)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)]'
                } ${collapsed ? 'justify-center px-0' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Section: Today Card & User Row */}
        <div className="p-3 border-t border-[var(--border-subtle)] shrink-0 space-y-3">
          {/* Today Card */}
          {!collapsed ? (
            <div className="p-3 rounded-[var(--radius-cards)] bg-[var(--bg-2)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium text-[var(--text-secondary)]">Today</span>
                <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                  ${usage.spentToday.toFixed(2)}
                  {hasDailyCap ? ` / $${usage.dailyCap.toFixed(2)}` : ' (No cap)'}
                </span>
              </div>
              {/* 4px Progress Bar if dailyCap set */}
              {hasDailyCap && (
                <div className="w-full h-1 bg-[var(--bg-4)] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${progressColor} transition-all duration-300`}
                    style={{ width: `${spendPercent}%` }}
                  />
                </div>
              )}
              <div className="flex justify-end">
                <NavLink
                  to="/plans"
                  className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                >
                  Usage
                </NavLink>
              </div>
            </div>
          ) : (
            <div
              className="flex justify-center"
              title={`Today: $${usage.spentToday.toFixed(2)}${hasDailyCap ? ` / $${usage.dailyCap.toFixed(2)}` : ' (No cap)'}`}
            >
              <div className="w-8 h-8 rounded-full bg-[var(--bg-2)] border border-[var(--border-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--accent)]">
                {hasDailyCap ? `${spendPercent}%` : '$'}
              </div>
            </div>
          )}

          {/* User Row (avatar 32px, name, email caption) with Popover */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={`w-full flex items-center gap-2.5 p-1.5 rounded-[var(--radius-buttons)] hover:bg-[var(--bg-3)] transition-colors cursor-pointer text-left ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              {/* 32px Avatar */}
              <div className="w-8 h-8 rounded-full bg-[var(--bg-4)] border border-[var(--border-strong)] flex items-center justify-center text-[12px] font-bold text-[var(--text-primary)] shrink-0">
                {userInitials}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                    {userName}
                  </div>
                  <div className="type-caption text-[var(--text-secondary)] truncate">
                    {userEmail}
                  </div>
                </div>
              )}
            </button>

            {/* User Popover: Profile, Usage, Sign out */}
            {showUserMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-56 py-1 bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-buttons)] shadow-[var(--shadow-popover)] z-50">
                <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                    PRIVATE STUDIO
                  </span>
                  <p className="text-[12px] text-[var(--text-primary)] font-medium truncate mt-0.5">
                    {userEmail}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/plans');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)] text-left cursor-pointer"
                >
                  <PieChart size={15} strokeWidth={1.75} />
                  <span>Usage & Limits</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--danger)] hover:bg-[var(--danger-soft)] text-left cursor-pointer border-t border-[var(--border-subtle)]"
                >
                  <LogOut size={15} strokeWidth={1.75} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ===================== MAIN CONTENT AREA ===================== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Firestore In-Memory Warning Banner */}
        {!firestoreHealth.firestore && (
          <div className="w-full bg-[#e11d48] text-white px-4 py-2 text-[12px] font-medium flex items-center justify-between shrink-0 z-50 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <span>Database is not connected - results will be lost on restart</span>
              <span className="text-[11px] text-white/90 font-mono">
                Reason: {firestoreHealth.firestoreCode || 'UNKNOWN'}
              </span>
              {firestoreHealth.firestoreMessage && (
                <span className="text-[11px] text-white/80 max-w-[900px] leading-snug">
                  {firestoreHealth.firestoreMessage}
                </span>
              )}
              {firestoreHealth.firestoreCode === 'PERMISSION_DENIED' && (
                <span className="text-[11px] text-white/80 max-w-[900px] leading-snug">
                  Login worked but Firestore rules reject the server account. Publish the rules from firestore.rules in the
                  Firebase console (Firestore, Rules) and make sure the server e-mail in the rules matches SERVER_DB_EMAIL.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => checkFirestoreHealth(true)}
              disabled={firestoreHealth.isChecking}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 active:bg-white/40 disabled:opacity-50 text-white rounded text-[11px] font-medium transition-colors cursor-pointer shrink-0 ml-4"
            >
              {firestoreHealth.isChecking ? 'Checking...' : 'Check again'}
            </button>
          </div>
        )}
        {/* Floating Cluster Top Right: Jobs (Activity) & Help Buttons */}
        <div className="absolute top-4 right-6 z-40 flex items-center gap-2 pointer-events-auto">
          {/* Jobs Button (40px circle) with Activity count badge */}
          <div className="relative" ref={jobsPanelRef}>
            <button
              type="button"
              onClick={() => setShowJobsPanel(!showJobsPanel)}
              aria-label="Jobs activity"
              title="Recent Jobs"
              className={`relative w-10 h-10 rounded-full bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-sm ${
                showJobsPanel ? 'border-[var(--accent)] text-[var(--accent)]' : ''
              }`}
            >
              <Activity size={18} strokeWidth={1.75} />
              {runningJobCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center tabular-nums animate-pulse">
                  {runningJobCount}
                </span>
              )}
            </button>

            {/* Jobs Panel (360px popover with last 5 jobs) */}
            {showJobsPanel && (
              <div className="absolute top-full right-0 mt-2 w-[360px] bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-cards)] shadow-[var(--shadow-popover)] overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-180">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-1)]">
                  <div className="flex items-center gap-2">
                    <Activity size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
                    <span className="type-h3 text-[var(--text-primary)]">Jobs</span>
                  </div>
                  <span className="type-caption text-[var(--text-secondary)] tabular-nums">
                    {jobs.length} recent
                  </span>
                </div>

                <div className="divide-y divide-[var(--border-subtle)] max-h-[380px] overflow-y-auto p-1">
                  {jobs.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-[var(--text-tertiary)]">
                      No active or recent jobs
                    </div>
                  ) : (
                    jobs.map((job) => {
                      const costVal = job.estCostUsd ?? job.cost ?? 0;
                      const thumbUrl = job.outputs?.[0]?.url;
                      return (
                        <div
                          key={job.id}
                          className="p-3 hover:bg-[var(--bg-3)]/60 rounded-[var(--radius-buttons)] transition-colors space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {/* Thumbnail */}
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt=""
                                  className="w-8 h-8 rounded-md object-cover shrink-0 border border-[var(--border-subtle)]"
                                />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-md border border-[var(--border-subtle)] shrink-0 flex items-center justify-center bg-[var(--bg-3)]"
                                >
                                  <Activity size={14} className="text-[var(--text-tertiary)]" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                                  {job.modelLabel || job.modelKey}
                                </div>
                                <div className="type-caption text-[var(--text-secondary)]">
                                  {job.tool}
                                </div>
                              </div>
                            </div>

                            {/* Status Chip */}
                            <Badge
                              variant={
                                job.status === 'succeeded'
                                  ? 'success'
                                  : job.status === 'running'
                                  ? 'accent'
                                  : job.status === 'queued'
                                  ? 'warning'
                                  : 'danger'
                              }
                            >
                              {job.status === 'running'
                                ? 'Running'
                                : job.status === 'queued'
                                ? 'Queued'
                                : job.status === 'succeeded'
                                ? 'Done'
                                : 'Failed'}
                            </Badge>
                          </div>

                          {/* Running Progress Bar */}
                          {job.status === 'running' && (
                            <div className="w-full space-y-1">
                              <div className="w-full h-1 bg-[var(--bg-4)] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[var(--accent)] transition-all duration-300"
                                  style={{ width: `${job.progress || 60}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[11px] text-[var(--text-tertiary)] tabular-nums">
                                <span>{job.elapsedSeconds || 5}s elapsed</span>
                                <span>{job.progress || 60}%</span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] tabular-nums pt-0.5">
                            <span>
                              {job.createdAt
                                ? new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Recent'}
                            </span>
                            <span className="font-medium text-[var(--accent)]">
                              ${costVal.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Help Button (40px circle) */}
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            aria-label="Studio Help"
            title="Help & Documentation"
            className="w-10 h-10 rounded-full bg-[var(--bg-2)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-sm"
          >
            <HelpCircle size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Scrollable Main Area (max width 1200) */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-8 pb-44">
          <div className="max-w-[1200px] mx-auto min-h-full">
            {children}
          </div>
        </main>
      </div>

      {/* ===================== MOBILE BOTTOM TAB BAR ===================== */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[var(--bg-1)] border-t border-[var(--border-subtle)] flex items-center justify-around px-2"
      >
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`
          }
        >
          <Home size={18} />
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/image"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`
          }
        >
          <ImageIcon size={18} />
          <span>Image</span>
        </NavLink>
        <NavLink
          to="/video"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`
          }
        >
          <Film size={18} />
          <span>Video</span>
        </NavLink>
        <NavLink
          to="/edit"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`
          }
        >
          <Edit2 size={18} />
          <span>Edit</span>
        </NavLink>
        <NavLink
          to="/audio"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`
          }
        >
          <Mic size={18} />
          <span>Voice</span>
        </NavLink>
        <NavLink
          to="/clean"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`
          }
        >
          <Eraser size={18} />
          <span>Clean</span>
        </NavLink>
        <NavLink
          to="/assets"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`
          }
        >
          <FolderOpen size={18} />
          <span>More</span>
        </NavLink>
      </nav>

      {/* ===================== DESIGN REVIEW TOGGLE (?review=1) ===================== */}
      {isReviewMode && (
        <div
          data-design-review="true"
          className="fixed bottom-4 right-4 z-50 flex items-center p-1 bg-[var(--bg-3)] border border-[var(--border-strong)] rounded-full shadow-[var(--shadow-popover)]"
        >
          {(['filled', 'empty', 'loading', 'error'] as ReviewState[]).map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => setReviewState(state)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium capitalize transition-all cursor-pointer ${
                reviewState === state
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {state}
            </button>
          ))}
        </div>
      )}

      {/* ===================== HELP MODAL ===================== */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--modal-backdrop)]"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-[520px] bg-[var(--bg-2)] border border-[var(--border-strong)] rounded-[var(--radius-modals)] shadow-[var(--shadow-popover)] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--accent)] flex items-center justify-center text-white text-[11px] font-black">
                  CN
                </div>
                <h2 className="type-h2 text-[var(--text-primary)]">CRENORD Studio Guide</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-3)]"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="space-y-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">
              <p>
                Welcome to <strong className="text-[var(--text-primary)]">CRENORD</strong>, your private AI studio designed specifically for high-converting commercial media generation and editing.
              </p>
              <div className="rounded-[var(--radius-buttons)] bg-[var(--bg-3)] p-3 space-y-1.5 border border-[var(--border-subtle)]">
                <div className="font-semibold text-[var(--text-primary)]">Studio Rules & Cost Guard</div>
                <div>• Default mode is <strong>Draft</strong> (cheapest model, fast turnaround).</div>
                <div>• Switch to <strong>Final</strong> for 4K / maximum fidelity models.</div>
                <div>• Jobs pass server cost verification before submission to fal.ai.</div>
              </div>
              <p>
                Use the signature bottom PromptBar across any creation page to generate media. Keyboard shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]">Enter</kbd> to submit, <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]">Shift+Enter</kbd> for newline, and <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-3)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]">Esc</kbd> to close drawers.
              </p>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 rounded-[var(--radius-buttons)] bg-[var(--accent)] text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
