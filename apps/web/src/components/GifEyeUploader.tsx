import { useEffect, useRef, useState } from 'react';
import {
  MAX_EYE_GIF_DIM,
  gifDimensions,
  triggerDeviceRescan,
  uploadDeviceEye,
} from '../audio/sync.js';

interface GifEyeUploaderProps {
  /** The skull's LAN IP (from the Master's /status). Absent = can't upload. */
  deviceIp?: string;
  deviceName: string;
  /** Called after a successful upload so the caller can refresh its eye list. */
  onUploaded?: () => void;
}

/**
 * Pick an animated `.gif` and push it to a skull's SD `/eyes/` folder, so it
 * becomes a selectable animated eye (a flame / sparkle / flag instead of an
 * eyeball). Previews the chosen GIF inline — the browser plays it natively, so
 * you see exactly what the skull will show.
 */
export function GifEyeUploader({ deviceIp, deviceName, onUploaded }: GifEyeUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when it changes / unmounts (no leaked blobs).
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const tooBig = !!dims && (dims.width > MAX_EYE_GIF_DIM || dims.height > MAX_EYE_GIF_DIM);

  const pick = async (f: File | null) => {
    setStatus('');
    setFile(f);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return f ? URL.createObjectURL(f) : ''; });
    if (!f) { setDims(null); return; }
    // Read just the header to catch oversized GIFs before uploading a dud the
    // skull would silently reject.
    const head = new Uint8Array(await f.slice(0, 10).arrayBuffer());
    const d = gifDimensions(head);
    setDims(d);
    if (d && (d.width > MAX_EYE_GIF_DIM || d.height > MAX_EYE_GIF_DIM)) {
      setStatus(`${d.width}×${d.height} is too big — resize to ${MAX_EYE_GIF_DIM}×${MAX_EYE_GIF_DIM} or smaller.`);
    } else if (!d) {
      setStatus('That doesn’t look like a GIF.');
    }
  };

  const upload = async () => {
    if (!file || !deviceIp || tooBig) return;
    setBusy(true);
    setStatus('uploading…');
    try {
      await uploadDeviceEye(deviceIp, file.name, await file.arrayBuffer());
      await triggerDeviceRescan(deviceIp);
      setStatus(`uploaded “${file.name.replace(/\.[^.]+$/, '')}” ✓`);
      onUploaded?.();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'upload failed');
    }
    setBusy(false);
  };

  const name = file?.name.replace(/\.[^.]+$/, '') ?? '';

  return (
    <div className="mt-2.5 rounded-lg border border-dashed border-border/70 bg-bg/40 p-2.5">
      <div className="flex items-center gap-2.5">
        {preview ? (
          <img
            src={preview}
            alt="animated eye preview"
            className="h-14 w-14 flex-none rounded-full border border-border/60 bg-black object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-border/50 bg-black/40 text-[10px] text-muted">
            GIF
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-text">Animated eye (.gif)</div>
          <div className="truncate text-[11px] text-muted">
            {file
              ? `${name}${dims ? ` · ${dims.width}×${dims.height}` : ''}`
              : 'Flame, sparkle, flag — plays where the eyeball goes.'}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/gif,.gif"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0] ?? null)}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-border/80 bg-bg3/40 px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          Choose GIF…
        </button>
        <button
          onClick={() => void upload()}
          disabled={!file || !deviceIp || busy || tooBig}
          className="rounded-md border border-purple/40 bg-purple/15 px-2.5 py-1.5 text-[11px] font-medium text-purple-l transition-colors hover:bg-purple/25 disabled:opacity-40"
        >
          {busy ? 'Uploading…' : `Upload to ${deviceName}`}
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
