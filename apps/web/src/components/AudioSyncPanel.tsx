import { useState } from 'react';
import type { VoxShow } from '@voxcomposer/shared';
import {
  fetchDeviceAudio,
  missingAudio,
  neededAudio,
  syncDeviceAudio,
  type SyncItem,
} from '../audio/sync.js';

interface SyncDevice {
  id: string;
  name: string;
  type: string;
  ip?: string;
  connection?: string;
}

/**
 * Per-skull audio sync: which of the show's audio files are already on each
 * OcularVox's SD, and a one-click push of the missing ones (transcoded to WAV).
 * Shown in the Devices view. See docs/AUDIO_SYNC.md.
 */
export function AudioSyncPanel({
  show,
  devices,
  onNotify,
}: {
  show: VoxShow;
  devices: SyncDevice[];
  onNotify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}) {
  const targets = devices.filter((d) => d.type === 'skull' && neededAudio(show, d.id).length > 0);
  if (targets.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border/70 bg-bg2/50 p-5">
      <h2 className="mb-1 text-sm font-semibold text-text">Audio sync</h2>
      <p className="mb-3 text-[12px] text-muted">
        Push this show’s audio onto each skull’s SD card (transcoded to WAV). Playback pulls it from
        the card on cue.
      </p>
      <div className="flex flex-col gap-2">
        {targets.map((d) => (
          <DeviceRow key={d.id} show={show} dev={d} onNotify={onNotify} />
        ))}
      </div>
    </section>
  );
}

/** A determinate progress bar across the whole sync — each file counts its
 *  phase (transcode → upload → done) so the bar moves smoothly, not in jumps. */
function SyncProgress({ items }: { items: SyncItem[] }) {
  const WEIGHT: Record<SyncItem['status'], number> = {
    pending: 0,
    transcoding: 0.35,
    uploading: 0.7,
    done: 1,
    error: 1,
  };
  const total = items.length;
  const progress = items.reduce((sum, i) => sum + WEIGHT[i.status], 0) / Math.max(1, total);
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const complete = done + failed === total;
  const pct = Math.round(progress * 100);
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] text-muted">
        <span>
          {complete ? (failed ? `${done} synced, ${failed} failed` : 'Synced ✓') : 'Syncing…'}
        </span>
        <span className="font-mono tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg3/60">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: failed ? '#E0794B' : '#7C6DF2',
          }}
        />
      </div>
    </div>
  );
}

function DeviceRow({
  show,
  dev,
  onNotify,
}: {
  show: VoxShow;
  dev: SyncDevice;
  onNotify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}) {
  const needed = neededAudio(show, dev.id);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<SyncItem[]>([]);
  const offline = dev.connection !== 'online' || !dev.ip;

  const check = async () => {
    if (!dev.ip) return;
    setStatus('checking…');
    try {
      const missing = missingAudio(needed, await fetchDeviceAudio(dev.ip));
      setStatus(missing.length === 0 ? 'all present ✓' : `${missing.length} missing: ${missing.join(', ')}`);
    } catch {
      setStatus('couldn’t reach the device');
    }
  };

  const sync = async () => {
    if (!dev.ip) return;
    setBusy(true);
    setItems([]);
    try {
      const result = await syncDeviceAudio(show, dev.id, dev.ip, (i) => setItems([...i]));
      const done = result.filter((i) => i.status === 'done').length;
      const errs = result.filter((i) => i.status === 'error');
      if (result.length === 0) onNotify(`${dev.name}: already up to date`, 'info');
      else if (errs.length) onNotify(`${dev.name}: ${done} synced, ${errs.length} failed`, 'error');
      else onNotify(`${dev.name}: synced ${done} file${done === 1 ? '' : 's'}`, 'success');
    } catch {
      onNotify(`${dev.name}: sync failed`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-bg/40 p-3">
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-text">{dev.name}</span>
        <span className="text-[11px] text-muted">
          {needed.length} audio file{needed.length === 1 ? '' : 's'} needed
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={check}
            disabled={offline}
            className="rounded-md border border-border/70 bg-bg/50 px-2.5 py-1 text-[12px] text-text transition-colors hover:border-purple/50 disabled:opacity-40"
          >
            Check
          </button>
          <button
            onClick={sync}
            disabled={offline || busy}
            className="rounded-md border border-purple/50 bg-purple/15 px-2.5 py-1 text-[12px] font-medium text-purple-l transition-colors hover:bg-purple/25 disabled:opacity-40"
          >
            {busy ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>
      {offline && <p className="mt-1 text-[11px] text-muted">Device offline — connect it to sync.</p>}
      {status && <p className="mt-1 text-[11px] text-muted">{status}</p>}
      {items.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          <SyncProgress items={items} />
          <div className="mt-1 flex flex-col gap-0.5">
            {items.map((i) => (
              <span key={i.clipId} className="font-mono text-[10px] text-muted">
                {i.target} — {i.status}
                {i.error ? ` (${i.error})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
