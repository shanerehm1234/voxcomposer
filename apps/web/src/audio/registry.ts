import type { DecodedAudio } from './analyze.js';

/**
 * In-memory cache of decoded audio, keyed by clip id. This is deliberately a
 * module singleton (like an image cache): the timeline renderer reads peaks
 * from here every frame without prop-drilling, and playback reads the buffer.
 *
 * Media never leaves the browser — it lives here and (later) in IndexedDB for
 * persistence, plus on the local network's SD cards. It is NOT uploaded to the
 * server. See the project's media-stays-local decision.
 */
export interface AudioAsset {
  buffer: AudioBuffer;
  peaks: Float32Array;
  durationMs: number;
  /** Original filename, for display. */
  filename: string;
  /** Raw encoded audio, kept so duplicates can be re-persisted to IndexedDB. */
  blob: Blob;
}

const assets = new Map<string, AudioAsset>();

export function registerAsset(
  clipId: string,
  decoded: DecodedAudio,
  filename: string,
  blob: Blob,
): void {
  assets.set(clipId, {
    buffer: decoded.buffer,
    peaks: decoded.peaks,
    durationMs: decoded.durationMs,
    filename,
    blob,
  });
}

export function getAsset(clipId: string): AudioAsset | undefined {
  return assets.get(clipId);
}

export function getPeaks(clipId: string): Float32Array | undefined {
  return assets.get(clipId)?.peaks;
}

/** Copy an asset to a new clip id (for duplicate/paste). Returns the asset. */
export function copyAsset(fromClipId: string, toClipId: string): AudioAsset | undefined {
  const src = assets.get(fromClipId);
  if (!src) return undefined;
  assets.set(toClipId, src);
  return src;
}

export function removeAsset(clipId: string): void {
  assets.delete(clipId);
}
