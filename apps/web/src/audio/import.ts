import type { VoxClip } from '@voxcomposer/shared';
import { saveAudioBlob } from '../storage/db.js';
import { newClipId } from '../timeline/edits.js';
import { decodeAudioBytes } from './analyze.js';
import { detectFormatByName, hashBytes } from './format.js';
import { registerAsset } from './registry.js';

/**
 * Build an audio clip from already-read bytes: hashes, persists, decodes, and
 * registers the asset, returning the clip ready to add to a track.
 *
 * Reads the bytes ONCE — drag-dropped files become unreadable if accessed again
 * after the drop, so the caller must read `file.arrayBuffer()` synchronously in
 * the drop handler and pass the bytes here.
 */
export async function buildAudioClip(
  bytes: ArrayBuffer,
  filename: string,
  mime: string,
  deviceId: string,
  startMs: number,
): Promise<VoxClip> {
  const sourceHash = await hashBytes(bytes); // does not detach
  const blob = new Blob([bytes], { type: mime || '' }); // copies the bytes now
  const decoded = await decodeAudioBytes(bytes); // detaches bytes (blob already copied)

  const clipId = newClipId();
  registerAsset(clipId, decoded, filename, blob);
  void saveAudioBlob(clipId, filename, blob);

  return {
    id: clipId,
    startMs: Math.max(0, startMs),
    durationMs: Math.round(decoded.durationMs),
    type: 'audio',
    data: {
      filename,
      deviceId,
      volume: 1,
      jawSync: true,
      jawMode: 'FFT auto',
      fadeInMs: 0,
      fadeOutMs: 0,
      sourceFormat: detectFormatByName(filename, mime),
      sourceHash,
    },
  };
}
