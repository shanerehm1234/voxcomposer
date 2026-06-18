import { useCallback, useState } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Maximum undo depth (the brief asks for at least 50). */
const MAX_HISTORY = 100;

export interface History<T> {
  state: T;
  /** Commit a new state, pushing the previous onto the undo stack. */
  commit: (next: T) => void;
  /** Replace the present without touching history (e.g. external reset). */
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * A small past/present/future undo stack. The timeline commits a new VoxShow
 * once per discrete edit (on pointer-up of a drag, on delete, etc.), so undo
 * granularity matches user actions rather than animation frames.
 */
export function useHistory<T>(initial: T): History<T> {
  const [hist, setHist] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });

  const commit = useCallback((next: T) => {
    setHist((h) => ({
      past: [...h.past, h.present].slice(-MAX_HISTORY),
      present: next,
      future: [],
    }));
  }, []);

  const set = useCallback((next: T) => {
    setHist((h) => ({ ...h, present: next }));
  }, []);

  const undo = useCallback(() => {
    setHist((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1]!;
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHist((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0]!;
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
  }, []);

  return {
    state: hist.present,
    commit,
    set,
    undo,
    redo,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
  };
}
