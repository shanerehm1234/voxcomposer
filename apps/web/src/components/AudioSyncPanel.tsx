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
        <div className="mt-2 flex flex-col gap-0.5">
          {items.map((i) => (
            <span key={i.clipId} className="font-mono text-[10px] text-muted">
              {i.target} — {i.status}
              {i.error ? ` (${i.error})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
