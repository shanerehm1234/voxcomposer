import { useEffect, useRef, useState } from 'react';
import { triggerDeviceRescan, uploadDeviceEye } from '../audio/sync.js';
import { EYE_MAX_DIM, optimizeEyeGif } from '../gif/optimize.js';

interface GifEyeUploaderProps {
  /** The skull's LAN IP (from the Master's /status). Absent = can't upload. */
  deviceIp?: string;
  deviceName: string;
  /** Called after a successful upload so the caller can refresh its eye list. */
  onUploaded?: () => void;
}

interface Prepared {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  preview: string; // object URL of the optimized GIF
  width: number;
  height: number;
  frames: number;
  origKb: number;
  outKb: number;
  changed: boolean;
}

const kb = (n: number) => Math.round(n / 102.4) / 10;

/**
 * Drag in ANY GIF (any size, from anywhere) and drop it on a skull. It's decoded,
 * scaled to fit the skull's 240×240 eye, and re-encoded to a compact looping GIF
 * right in the browser — then pushed to the skull's SD `/eyes/` over the same
 * bridge the audio sync uses. The preview IS the optimized result, so it's WYSIWYG.
 */
export function GifEyeUploader({ deviceIp, deviceName, onUploaded }: GifEyeUploaderProps) {
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (prep?.preview) URL.revokeObjectURL(prep.preview); }, [prep]);

  const accept = async (file: File | null) => {
    setStatus('');
    if (!file) return;
    if (!/\.gif$/i.test(file.name) && file.type !== 'image/gif') {
      setStatus('That’s not a GIF — drop a .gif file.');
      return;
    }
    setBusy(true);
    setStatus('optimizing…');
    try {
      const input = new Uint8Array(await file.arrayBuffer());
      // Yield a frame so the "optimizing…" state paints before the sync work.
      await new Promise((r) => setTimeout(r, 0));
      const out = optimizeEyeGif(input);
      const blob = new Blob([out.bytes], { type: 'image/gif' });
      setPrep((old) => {
        if (old?.preview) URL.revokeObjectURL(old.preview);
        return {
          name: file.name,
          bytes: out.bytes,
          preview: URL.createObjectURL(blob),
          width: out.width,
          height: out.height,
          frames: out.frames,
          origKb: input.length,
          outKb: out.bytes.length,
          changed: out.changed,
        };
      });
      setStatus('');
    } catch (e) {
      setStatus(e instanceof Error ? `couldn’t read that GIF: ${e.message}` : 'couldn’t read that GIF');
    }
    setBusy(false);
  };

  const upload = async () => {
    if (!prep || !deviceIp) return;
    setBusy(true);
    setStatus('uploading…');
    try {
      await uploadDeviceEye(deviceIp, prep.name, prep.bytes);
      await triggerDeviceRescan(deviceIp);
      setStatus(`uploaded “${prep.name.replace(/\.[^.]+$/, '')}” ✓`);
      onUploaded?.();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'upload failed');
    }
    setBusy(false);
  };

  const onDrop = (e: React.DragEvent) => {
    // Stop the app's global window drop handler (audio/.vox import) from also
    // grabbing the GIF and firing a "can't import" error.
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    void accept(e.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`mt-2.5 rounded-lg border border-dashed p-2.5 transition-colors ${
        dragOver ? 'border-purple/70 bg-purple/10' : 'border-border/70 bg-bg/40'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {prep ? (
          <img
            src={prep.preview}
            alt="optimized eye preview"
            className="h-14 w-14 flex-none rounded-full border border-border/60 bg-black object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-border/50 bg-black/40 text-[10px] text-muted">
            GIF
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-text">Animated eye</div>
          <div className="truncate text-[11px] text-muted">
            {prep
              ? `${prep.name.replace(/\.[^.]+$/, '')} · ${prep.width}×${prep.height} · ${prep.frames}f · ${kb(prep.outKb)} KB`
              : `Drag a GIF here — any size, it auto-fits ${EYE_MAX_DIM}×${EYE_MAX_DIM}.`}
          </div>
          {prep?.changed && (
            <div className="text-[10px] text-muted">optimized from {kb(prep.origKb)} KB</div>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/gif,.gif"
        className="hidden"
        onChange={(e) => void accept(e.target.files?.[0] ?? null)}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-border/80 bg-bg3/40 px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          Choose GIF…
        </button>
        <button
          onClick={() => void upload()}
          disabled={!prep || !deviceIp || busy}
          className="rounded-md border border-purple/40 bg-purple/15 px-2.5 py-1.5 text-[11px] font-medium text-purple-l transition-colors hover:bg-purple/25 disabled:opacity-40"
        >
          {busy && status === 'uploading…' ? 'Uploading…' : `Upload to ${deviceName}`}
        </button>
      </div>

      {status && <p className="mt-1.5 text-[11px] text-muted">{status}</p>}
      {!deviceIp && (
        <p className="mt-1.5 text-[10px] text-muted">
          Connect the skull &amp; scan devices to upload — needs its LAN address.
        </p>
      )}
    </div>
  );
}
