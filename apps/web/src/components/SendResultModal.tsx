export interface DeviceAudioResult {
  device: string;
  done: number;
  failed: number;
  total: number;
  error?: string;
}

export interface SendReport {
  status: 'sending' | 'syncing' | 'done' | 'error';
  showName: string;
  clips?: number;
  durationMs?: number;
  /** Name of the skull currently being audio-synced (status === 'syncing'). */
  syncingName?: string;
  audio?: DeviceAudioResult[];
  /** True once the uploaded show has been made the Master's active show. */
  activated?: boolean;
  error?: string;
}

/**
 * Confirmation dialog for "Send to Vox Master": shows exactly what went over —
 * the show + clip count, then per-skull audio sync results — with a live
 * progress state and a success/failure check. Replaces the old fire-and-forget
 * toast so it's clear what was sent and whether it worked.
 */
export function SendResultModal({
  report,
  onClose,
  onPlay,
}: {
  report: SendReport;
  onClose: () => void;
  onPlay?: () => void;
}) {
  const busy = report.status === 'sending' || report.status === 'syncing';
  const title =
    report.status === 'error'
      ? 'Send failed'
      : report.status === 'done'
        ? 'Sent to Vox Master'
        : 'Sending to Vox Master…';
  const dur = report.durationMs ? `${(report.durationMs / 1000).toFixed(1)}s` : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/70 bg-bg2 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <StatusIcon status={report.status} />
          <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        </div>

        <div className="rounded-lg border border-border/60 bg-bg/40 p-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-text">{report.showName || 'Untitled show'}</span>
            {report.clips != null && (
              <span className="text-[12px] text-muted">
                {report.clips} clip{report.clips === 1 ? '' : 's'}
                {dur ? ` · ${dur}` : ''}
              </span>
            )}
          </div>
          {report.error && <div className="mt-1 text-[12px] text-red-400">{report.error}</div>}
          {report.activated && (
            <div className="mt-1 text-[12px] text-teal-l">✓ Now the active show on the Master</div>
          )}
        </div>

        {/* Audio sync per skull */}
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
            Audio sync
          </div>
          {report.status === 'sending' && <Line muted>Uploading show…</Line>}
          {report.status === 'syncing' && (
            <Line muted>Syncing audio to {report.syncingName ?? 'skull'}…</Line>
          )}
          {(report.audio ?? []).length === 0 && report.status === 'done' && (
            <Line muted>No audio to sync (or no skulls online).</Line>
          )}
          {(report.audio ?? []).map((a) => (
            <div key={a.device} className="flex items-center justify-between py-0.5 text-[13px]">
              <span className="text-text">{a.device}</span>
              <span className={a.failed || a.error ? 'text-amber-500' : 'text-teal-l'}>
                {a.error
                  ? a.error
                  : a.total === 0
                    ? 'up to date'
                    : `${a.done} synced${a.failed ? `, ${a.failed} failed` : ''}`}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border/70 bg-bg3/40 px-4 py-1.5 text-[13px] font-medium text-text transition-colors hover:bg-bg3/70 disabled:opacity-40"
          >
            {busy ? 'Working…' : report.status === 'done' ? 'Done' : 'Close'}
          </button>
          {report.status === 'done' && onPlay && (
            <button
              onClick={onPlay}
              className="rounded-lg border border-purple/50 bg-purple/20 px-4 py-1.5 text-[13px] font-medium text-purple-l transition-colors hover:bg-purple/30"
            >
              ▶ Play now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <div className={`py-0.5 text-[13px] ${muted ? 'text-muted' : 'text-text'}`}>{children}</div>;
}

function StatusIcon({ status }: { status: SendReport['status'] }) {
  if (status === 'done')
    return <span className="grid h-6 w-6 place-items-center rounded-full bg-teal/20 text-teal-l">✓</span>;
  if (status === 'error')
    return <span className="grid h-6 w-6 place-items-center rounded-full bg-red-500/20 text-red-400">!</span>;
  return (
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-purple/30 border-t-purple-l" />
  );
}
