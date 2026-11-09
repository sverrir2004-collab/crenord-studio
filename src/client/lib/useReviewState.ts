import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export type ReviewState = 'filled' | 'empty' | 'loading' | 'error';

let globalReviewState: ReviewState = 'filled';
const listeners = new Set<(state: ReviewState) => void>();

export function setGlobalReviewState(state: ReviewState) {
  globalReviewState = state;
  listeners.forEach((listener) => listener(state));
}

export function useReviewState(): [ReviewState, (state: ReviewState) => void] {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const paramState = searchParams.get('state') as ReviewState | null;

  const [state, setState] = useState<ReviewState>(
    paramState && ['filled', 'empty', 'loading', 'error'].includes(paramState)
      ? paramState
      : globalReviewState
  );

  useEffect(() => {
    const handleUpdate = (newState: ReviewState) => {
      setState(newState);
    };
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const updateState = (newState: ReviewState) => {
    setGlobalReviewState(newState);
  };

  return [state, updateState];
}
