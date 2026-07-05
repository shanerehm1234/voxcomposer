import { useSyncExternalStore } from 'react';
import { decodeAudioBytes } from '../audio/analyze.js';
import { detectFormatByName, hashBytes, isAcceptedAudioName } from '../audio/format.js';
import {
  deleteMediaRecord,
  loadAllAudio,
  loadAllMedia,
  saveMedia,
  type StoredMedia,
} from '../storage/db.js';

/**
 * The media library: file-level audio the user has imported, independent of
 * any clip. Module singleton (same pattern as the audio registry) persisted in
 * IndexedDB; `useMediaLibrary()` subscribes components to it. Media never
 * leaves the browser — it goes from here to the timeline, and eventually to
 * remotes' SD cards over the local network, never to a server.
 */

export type MediaFile = StoredMedia;

/** Custom drag mime carrying a media id from the library to the timeline. */
export const MEDIA_DRAG_TYPE = 'application/x-vox-media';

let items: MediaFile[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function sorted(list: MediaFile[]): MediaFile[] {
  return [...list].sort((a, b) => b.addedAt - a.addedAt);
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  items = sorted(await loadAllMedia());
  emit();
  // Backfill: audio imported before the library existed (or restored from a
  // saved session) lives in the per-clip audio store. Fold anything the
  // library doesn't already have into it, so the Media tab always shows
  // everything the user ever imported. Hash-keyed, so duplicates are free.
  try {
    const clipAudio = await loadAllAudio();
    const files: File[] = [];
    const seen = new Set<string>();
    for (const a of clipAudio) {
      const key = `${a.filename}:${a.blob.size}`;
      if (seen.has(key)) continue; // same file on several clips — hash would dedupe, skip the decode
      seen.add(key);
      files.push(new File([a.blob], a.filename, { type: a.blob.type }));
    }
    if (files.length > 0) await importMediaFiles(files);
  } catch {
    /* backfill is best-effort */
  }
}

export function getMedia(id: string): MediaFile | undefined {
  return items.find((m) => m.id === id);
}

/** ~200-point envelope for the card thumbnail, from the full-rate peaks. */
function thumbPeaks(peaks: Float32Array, points = 200): number[] {
  if (peaks.length <= points) return Array.from(peaks);
  const out = new Array<number>(points);
  const bucket = peaks.length / points;
  for (let i = 0; i < points; i++) {
    let max = 0;
    const from = Math.floor(i * bucket);
    const to = Math.min(peaks.length, Math.ceil((i + 1) * bucket));
    for (let j = from; j < to; j++) max = Math.max(max, peaks[j]!);
    out[i] = max;
  }
  return out;
}

export interface ImportOutcome {
  added: MediaFile[];
  duplicates: string[];
  failed: string[];
}

/** Import audio files into the library (decode → hash → dedupe → persist). */
export async function importMediaFiles(files: File[]): Promise<ImportOutcome> {
  await ensureLoaded();
  const outcome: ImportOutcome = { added: [], duplicates: [], failed: [] };
  for (const file of files) {
    if (!isAcceptedAudioName(file.name)) {
      outcome.failed.push(file.name);
      continue;
    }
    try {
      const bytes = await file.arrayBuffer();
      const id = await hashBytes(bytes);
      if (items.some((m) => m.id === id)) {
        outcome.duplicates.push(file.name);
        continue;
      }
      const decoded = await decodeAudioBytes(bytes);
      const record: MediaFile = {
        id,
        filename: file.name,
        format: detectFormatByName(file.name, file.type),
        durationMs: decoded.durationMs,
        sizeBytes: file.size,
        addedAt: Date.now(),
        peaks: thumbPeaks(decoded.peaks),
        blob: new Blob([bytes], { type: file.type || 'application/octet-stream' }),
      };
      await saveMedia(record);
      items = sorted([...items, record]);
      outcome.added.push(record);
    } catch {
      outcome.failed.push(file.name);
    }
  }
  if (outcome.added.length > 0) emit();
  return outcome;
}

/**
 * Add already-read bytes to the library (used when audio lands directly on
 * the timeline, so the Media tab always reflects everything imported).
 * Silently dedupes; never throws — library bookkeeping must not break a drop.
 */
export async function addBytesToLibrary(bytes: ArrayBuffer, filename: string, mime: string): Promise<void> {
  try {
    await importMediaFiles([new File([bytes], filename, { type: mime })]);
  } catch {
    /* non-fatal */
  }
}

export async function deleteMedia(id: string): Promise<void> {
  await deleteMediaRecord(id);
  items = items.filter((m) => m.id !== id);
  emit();
}

// --- React subscription --------------------------------------------------------

const getSnapshot = (): MediaFile[] => items;

export function useMediaLibrary(): MediaFile[] {
  void ensureLoaded();
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getSnapshot);
}

// --- Preview playback ------------------------------------------------------------
// One shared <audio> element so only one preview plays at a time and the card
// buttons stay dead simple (play toggles; starting another stops the first).

let previewEl: HTMLAudioElement | null = null;
let previewId: string | null = null;
let previewUrl: string | null = null;
const previewListeners = new Set<() => void>();

function emitPreview(): void {
  for (const l of previewListeners) l();
}

function stopPreviewInternal(): void {
  if (previewEl) {
    previewEl.pause();
    previewEl.src = '';
  }
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  previewId = null;
}

export function stopPreview(): void {
  stopPreviewInternal();
  emitPreview();
}

export function togglePreview(id: string): void {
  if (previewId === id) {
    stopPreview();
    return;
  }
  const media = getMedia(id);
  if (!media) return;
  stopPreviewInternal();
  previewEl ??= new Audio();
  previewUrl = URL.createObjectURL(media.blob);
  previewEl.src = previewUrl;
  previewEl.onended = stopPreview;
  void previewEl.play().catch(stopPreview);
  previewId = id;
  emitPreview();
}

export function usePreviewingId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      previewListeners.add(cb);
      return () => previewListeners.delete(cb);
    },
    () => previewId,
  );
}
