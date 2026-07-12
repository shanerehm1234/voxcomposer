import { useCallback, useEffect, useState } from 'react';
import {
  activateMasterShow,
  deleteMasterShow,
  listMasterShows,
  playOnMaster,
  playPlaylistOnMaster,
  type LibraryShow,
} from '../voxlink/master.js';
import { IconCheck, IconLoop, IconPlay, IconRefresh, IconSchedule } from './icons.js';

interface ShowsViewProps {
  master: { connected: boolean; host: string };
  onNotify: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Browse the show library stored on the connected Vox Master: which .vox shows
 * are on the hub, which one is active, and activate / play / delete them
 * without walking over to the touchscreen. Read-through of the Master's
 * /shows + /activate + /show endpoints.
 */
export function ShowsView({ master, onNotify }: ShowsViewProps) {
  const [shows, setShows] = useState<LibraryShow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  // Ordered playlist selection (order = play order). An array, not a Set, so
  // the sequence the user clicks in is the sequence that plays.
  const [queue, setQueue] = useState<string[]>([]);
  const [loopQueue, setLoopQueue] = useState(false);

  const toggleQueued = (slug: string) =>
    setQueue((q) => (q.includes(slug) ? q.filter((s) => s !== slug) : [...q, slug]));

  const playQueue = async () => {
    const ok = await playPlaylistOnMaster(queue, loopQueue);
    onNotify(
      ok ? `Playing ${queue.length} shows as a playlist${loopQueue ? ' (looping)' : ''}` : 'Could not start the playlist',
      ok ? 'success' : 'error',
    );
  };

  const refresh = useCallback(async () => {
    if (!master.connected) {
      setShows([]);
      return;
    }
    setLoading(true);
    const list = await listMasterShows();
    setShows(list);
    // Drop any queued slugs that no longer exist on the Master.
    setQueue((q) => q.filter((slug) => list.some((s) => s.slug === slug)));
    setLoading(false);
  }, [master.connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onActivate = async (s: LibraryShow) => {
    setBusySlug(s.slug);
    const ok = await activateMasterShow(s.slug);
    setBusySlug(null);
    onNotify(ok ? `“${s.name}” is now the active show` : 'Could not activate', ok ? 'success' : 'error');
    if (ok) void refresh();
  };

  const onPlay = async (s: LibraryShow) => {
    setBusySlug(s.slug);
    const okA = s.active ? true : await activateMasterShow(s.slug);
    const ok = okA && (await playOnMaster());
    setBusySlug(null);
    onNotify(ok ? `Playing “${s.name}” on the Master` : 'Could not start playback', ok ? 'success' : 'error');
    if (ok) void refresh();
  };

  const onDelete = async (s: LibraryShow) => {
    if (!window.confirm(`Delete “${s.name}” from the Master? This can't be undone.`)) return;
    setBusySlug(s.slug);
    const ok = await deleteMasterShow(s.slug);
    setBusySlug(null);
    onNotify(ok ? `Deleted “${s.name}”` : 'Could not delete', ok ? 'success' : 'error');
    if (ok) void refresh();
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto px-6 py-6">
      <header className="mb-5 flex items-center gap-3">
        <IconSchedule className="h-5 w-5 text-purple-l" />
        <div>
          <h1 className="text-lg font-semibold text-text">Show Library</h1>
          <p className="text-[12px] text-muted">
            {master.connected ? `On ${master.host}` : 'Not connected to a Vox Master'}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={!master.connected}
          title="Refresh"
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border/80 bg-bg3/40 px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      {master.connected && queue.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-purple/40 bg-purple/10 px-4 py-2.5">
          <span className="text-[13px] font-medium text-text">
            {queue.length} show{queue.length === 1 ? '' : 's'} queued
          </span>
          <button
            onClick={() => setLoopQueue((v) => !v)}
            title="Loop the whole playlist"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              loopQueue
                ? 'border-purple/50 bg-purple/25 text-purple-l'
                : 'border-border/80 bg-bg3/40 text-muted hover:text-text'
            }`}
          >
            <IconLoop className="h-3.5 w-3.5" /> Loop
          </button>
          <button
            onClick={() => void playQueue()}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-purple/40 bg-purple/20 px-3 py-1.5 text-[12px] font-medium text-purple-l transition-colors hover:bg-purple/30"
          >
            <IconPlay className="h-3.5 w-3.5" /> Play as playlist
          </button>
          <button
            onClick={() => setQueue([])}
            className="rounded-lg border border-border/80 bg-bg3/40 px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-text"
          >
            Clear
          </button>
        </div>
      )}

      {!master.connected ? (
        <div className="rounded-xl border border-border/60 bg-bg2/40 p-8 text-center text-[13px] text-muted">
          Connect to a Vox Master in <span className="text-text">Settings</span> to see its show library.
        </div>
      ) : shows.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-bg2/40 p-8 text-center text-[13px] text-muted">
          {loading ? 'Loading…' : 'No shows on the Master yet.'}
          {!loading && (
            <div className="mt-1.5">
              Send one with <span className="text-text">Export → Send to Vox Master</span>.
            </div>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shows.map((s) => (
            <li
              key={s.slug}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                s.active ? 'border-purple/40 bg-purple/10' : 'border-border/60 bg-bg2/40'
              }`}
            >
              <button
                onClick={() => toggleQueued(s.slug)}
                title={queue.includes(s.slug) ? 'Remove from playlist' : 'Add to playlist (order = click order)'}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums transition-colors ${
                  queue.includes(s.slug)
                    ? 'border-purple/50 bg-purple/25 text-purple-l'
                    : 'border-border/70 bg-bg3/30 text-transparent hover:text-muted'
                }`}
              >
                {queue.includes(s.slug) ? queue.indexOf(s.slug) + 1 : '+'}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-text">{s.name}</span>
                  {s.active && (
                    <span className="flex items-center gap-1 rounded-md bg-purple/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-l">
                      <IconCheck className="h-3 w-3" /> Active
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] tabular-nums text-muted">
                  {s.clips} clip{s.clips === 1 ? '' : 's'} · {fmtDuration(s.durationMs)}
                </div>
              </div>

              <button
                onClick={() => void onPlay(s)}
                disabled={busySlug === s.slug}
                title="Activate and play on the Master"
                className="flex items-center gap-1.5 rounded-lg border border-purple/40 bg-purple/15 px-2.5 py-1.5 text-[12px] font-medium text-purple-l transition-colors hover:bg-purple/25 disabled:opacity-40"
              >
                <IconPlay className="h-3.5 w-3.5" /> Play
              </button>
              <button
                onClick={() => void onActivate(s)}
                disabled={busySlug === s.slug || s.active}
                title="Make this the active show"
                className="rounded-lg border border-border/80 bg-bg3/40 px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
              >
                Activate
              </button>
              <button
                onClick={() => void onDelete(s)}
                disabled={busySlug === s.slug}
                title="Delete from the Master"
                className="rounded-lg border border-border/80 bg-bg3/40 px-2 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-red-400 disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
