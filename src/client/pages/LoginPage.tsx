import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui/Button.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useReviewState } from '../lib/useReviewState.ts';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isOwner, loading, error, login } = useAuth();
  const [reviewState] = useReviewState();

  // If already authenticated as owner, redirect to home
  React.useEffect(() => {
    if (user && isOwner) {
      navigate('/');
    }
  }, [user, isOwner, navigate]);

  const handleGoogleSignIn = async () => {
    try {
      await login();
      navigate('/');
    } catch {
      // Error is stored in AuthContext and rendered below
    }
  };

  if (reviewState === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] p-4">
        <div className="w-full max-w-[400px] p-8 rounded-[var(--radius-modals)] bg-[var(--bg-2)] border border-[var(--border-strong)] shadow-[var(--shadow-popover)] space-y-6 text-center">
          <Skeleton height={28} width={120} className="mx-auto" />
          <Skeleton height={34} width={180} className="mx-auto" />
          <Skeleton height={44} className="w-full rounded-[var(--radius-buttons)]" />
          <Skeleton height={16} width={100} className="mx-auto" />
        </div>
      </div>
    );
  }

  const errorMessage = reviewState === 'error' ? 'This account is not allowed.' : error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] p-4">
      {/* Centred Card (400px, bg-2, radius 20, padding 32) */}
      <div className="w-full max-w-[400px] p-8 rounded-[var(--radius-modals)] bg-[var(--bg-2)] border border-[var(--border-strong)] shadow-[var(--shadow-popover)] space-y-6 text-center animate-in fade-in zoom-in-95 duration-180">
        {/* Wordmark: CRENORD in uppercase, weight 600, letter-spacing 0.14em, 16px */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--accent)] flex items-center justify-center text-white text-[11px] font-black tracking-tighter">
            CN
          </div>
          <span className="wordmark">CRENORD</span>
        </div>

        {/* H1 'Sign in' */}
        <div>
          <h1 className="type-h1 text-[var(--text-primary)]">Sign in</h1>
          <p className="type-caption text-[var(--text-secondary)] mt-1">
            Sign in to access your media generation tools
          </p>
        </div>

        {/* Not-owner state error */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3 rounded-[var(--radius-buttons)] bg-[var(--danger-soft)] border border-[var(--danger)] text-left flex items-start gap-2.5"
          >
            <ShieldAlert size={18} className="text-[var(--danger)] shrink-0 mt-0.5" />
            <div>
              <div className="text-[13px] font-semibold text-[var(--danger)]">Access Denied</div>
              <p className="text-[12px] text-[var(--danger)]/90 mt-0.5">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Secondary button 'Continue with Google' */}
        <div className="space-y-3">
          <Button
            variant="secondary"
            size={44}
            className="w-full font-medium"
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            }
            onClick={handleGoogleSignIn}
          >
            Continue with Google
          </Button>
        </div>

        {/* Caption 'Private studio' */}
        <div className="pt-2 border-t border-[var(--border-subtle)]">
          <p className="type-caption text-[var(--text-tertiary)] uppercase tracking-wider text-[11px]">
            Private studio
          </p>
        </div>
      </div>
    </div>
  );
};
