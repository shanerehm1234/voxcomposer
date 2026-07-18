import type { VoxShow } from '@voxcomposer/shared';
import { getAsset } from './registry.js';
import { decodeAudioBytes } from './analyze.js';
import { encodeWavFromBuffer } from './wav.js';

/**
 * Audio sync — make sure the WAV files a show references are actually on each
 * OcularVox device's SD card, transcoding + uploading the missing ones. See
 * docs/AUDIO_SYNC.md. Playback + the C3<->RP2040 file transport already exist;
 * this is the diff-and-push layer.
 *
 * The pure functions (deviceAudioName / neededAudio / missingAudio) have no
 * browser deps and are unit-tested. The rest talk to a device's C3 web API.
 */

/**
 * The device-side filename for an audio clip. The OcularVox boards play PCM WAV,
 * so any source (mp3/ogg/…) is transcoded to WAV and stored under its basename
 * with a `.wav` extension. `growl.mp3` and `/media/growl.wav` both → `growl.wav`.
 */
export function deviceAudioName(filename: string): string {
  const base = filename
    .replace(/^.*[/\\]/, '') // strip any path
    .replace(/\.[^.]+$/, ''); // strip extension
  return `${base || 'audio'}.wav`;
}

/** The distinct device audio names a show needs on a given device. */
export function neededAudio(show: VoxShow, deviceId: string): string[] {
  const names = new Set<string>();
  for (const track of show.tracks) {
    if (track.type !== 'audio' || track.deviceId !== deviceId) continue;
    for (const clip of track.clips) {
      if (clip.type !== 'audio') continue;
      const fn = (clip.data as { filename?: string }).filename;
      if (fn) names.add(deviceAudioName(fn));
    }
  }
  return [...names];
}

/** Names in `needed` not already present on the device (case-insensitive). */
export function missingAudio(needed: string[], present: string[]): string[] {
  const have = new Set(present.map((n) => n.toLowerCase()));
  return needed.filter((n) => !have.has(n.toLowerCase()));
}

// --- browser + live pieces ---------------------------------------------------

/**
 * Standard reflected CRC-32 (poly 0xEDB88320, init 0xFFFFFFFF, final complement)
 * — byte-for-byte identical to the OcularVox RP2040's crc32_step, so an upload's
 * `&crc=` is verified on the card (FILE_CLOSE rejects a mismatch).
 */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]!;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

/** Decode any source audio and re-encode as mono 16-bit WAV bytes for the SD. */
export async function transcodeToWav(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const decoded = await decodeAudioBytes(bytes);
  return encodeWavFromBuffer(decoded.buffer, { mono: true });
}

/** List the `/audio` files on an OcularVox device's SD via its C3 web API. */
export async function fetchDeviceAudio(deviceIp: string): Promise<string[]> {
  // No Content-Type header on purpose: it keeps this a CORS "simple request" so
  // the browser skips the preflight OPTIONS (the C3 only answers GET/POST). The
  // C3 ignores the content type and just reads the body. Response CORS headers
  // come from the device's guard() (esp32c3/main/web.c).
  const res = await fetch(`http://${deviceIp}/api/files`, {
    method: 'POST',
    body: JSON.stringify({ dir: '/audio' }),
  });
  if (!res.ok) throw new Error(`listing /audio failed: HTTP ${res.status}`);
  const j = (await res.json()) as { files?: { n: string }[] };
  return (j.files ?? []).map((f) => f.n);
}

/**
 * Upload WAV bytes to `/audio/<name>` on a device (see the C3 `POST /api/upload`
 * endpoint in AUDIO_SYNC.md — streams over the bridge to the RP2040 SD).
 */
export async function uploadDeviceAudio(deviceIp: string, name: string, wav: ArrayBuffer): Promise<void> {
  const crc = crc32(new Uint8Array(wav));
  const path = encodeURIComponent(`/audio/${name}`);
  const res = await fetch(`http://${deviceIp}/api/upload?path=${path}&crc=${crc}`, {
    method: 'POST',
    body: wav,
  });
  if (!res.ok) throw new Error(`uploading ${name} failed: HTTP ${res.status}`);
}

/**
 * List the `/eyes` directory on an OcularVox's SD, returning full filenames
 * (with extensions) so the caller can tell animated `.gif` eyes from procedural
 * `.eye` sets — the device inventory only carries basenames. Same C3 endpoint
 * the audio list uses.
 */
export async function fetchDeviceEyes(deviceIp: string): Promise<string[]> {
  const res = await fetch(`http://${deviceIp}/api/files`, {
    method: 'POST',
    body: JSON.stringify({ dir: '/eyes' }),
  });
  if (!res.ok) throw new Error(`listing /eyes failed: HTTP ${res.status}`);
  const j = (await res.json()) as { files?: { n: string }[] };
  return (j.files ?? []).map((f) => f.n);
}

/** The skull decoder's hard cap — a GIF eye must be no larger than this on
 *  either axis (the 240x240 round LCD / the 128KB decode canvas). */
export const MAX_EYE_GIF_DIM = 240;

/** Read a GIF's logical-screen size from its header (bytes 6-9, little-endian)
 *  without decoding it. Returns null if the bytes aren't a GIF. */
export function gifDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 10) return null;
  const sig = String.fromCharCode(...bytes.slice(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { width: bytes[6]! | (bytes[7]! << 8), height: bytes[8]! | (bytes[9]! << 8) };
}

/** The animated (`.gif`) eye names on a device, without extension — these match
 *  the names the eye clip picker and the skull's inventory use. */
export function animatedEyeNames(eyeFiles: string[]): string[] {
  return eyeFiles
    .filter((n) => /\.gif$/i.test(n))
    .map((n) => n.replace(/\.[^.]+$/, ''));
}

/**
 * Upload an animated eye `.gif` to `/eyes/<name>.gif` on a device (the same
 * crc-checked `POST /api/upload` bridge the audio sync uses). The RP2040 picks
 * it up on the next SD rescan and lists it as a selectable animated eye.
 */
export async function uploadDeviceEye(deviceIp: string, name: string, gif: ArrayBuffer): Promise<void> {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_') || 'eye';
  const crc = crc32(new Uint8Array(gif));
  const path = encodeURIComponent(`/eyes/${base}.gif`);
  const res = await fetch(`http://${deviceIp}/api/upload?path=${path}&crc=${crc}`, {
    method: 'POST',
    body: gif,
  });
  if (!res.ok) throw new Error(`uploading ${base}.gif failed: HTTP ${res.status}`);
}

/**
 * Ask the device to re-index its SD card (OcularVox `rescan` command) after an
 * upload, so newly-pushed files show on the OLED browser without a reboot.
 * Best-effort — playback + the file list already read the card live.
 */
export async function triggerDeviceRescan(deviceIp: string): Promise<void> {
  await fetch(`http://${deviceIp}/api/cmd`, {
    method: 'POST',
    body: JSON.stringify({ action: 'rescan' }),
  }).catch(() => {});
}

export interface SyncItem {
  clipId: string;
  source: string; // clip's source filename
  target: string; // device WAV name
  status: 'pending' | 'transcoding' | 'uploading' | 'done' | 'error';
  error?: string;
}

/**
 * Compute + run the sync for one device: for each of the show's audio clips
 * whose WAV isn't on the device yet, transcode its media and upload it. Calls
 * `onProgress` after each state change so a UI can render live. Returns the
 * final item list. `deviceIp` is the device's current LAN IP (from /status).
 */
export async function syncDeviceAudio(
  show: VoxShow,
  deviceId: string,
  deviceIp: string,
  onProgress?: (items: SyncItem[]) => void,
): Promise<SyncItem[]> {
  const present = await fetchDeviceAudio(deviceIp);
  const have = new Set(present.map((n) => n.toLowerCase()));

  // One item per audio clip whose target WAV is missing (deduped by target).
  const items: SyncItem[] = [];
  const seen = new Set<string>();
  for (const track of show.tracks) {
    if (track.type !== 'audio' || track.deviceId !== deviceId) continue;
    for (const clip of track.clips) {
      if (clip.type !== 'audio') continue;
      const source = (clip.data as { filename?: string }).filename ?? '';
      if (!source) continue;
      const target = deviceAudioName(source);
      if (have.has(target.toLowerCase()) || seen.has(target.toLowerCase())) continue;
      seen.add(target.toLowerCase());
      items.push({ clipId: clip.id, source, target, status: 'pending' });
    }
  }
  onProgress?.(items);

  for (const item of items) {
    try {
      const asset = getAsset(item.clipId);
      if (!asset) throw new Error('audio not in the media library');
      item.status = 'transcoding';
      onProgress?.(items);
      const wav = await transcodeToWav(await asset.blob.arrayBuffer());
      item.status = 'uploading';
      onProgress?.(items);
      await uploadDeviceAudio(deviceIp, item.target, wav);
      item.status = 'done';
    } catch (e) {
      item.status = 'error';
      item.error = e instanceof Error ? e.message : String(e);
    }
    onProgress?.(items);
  }
  // Re-index the card so the skull's OLED browser picks up the new files.
  if (items.some((i) => i.status === 'done')) await triggerDeviceRescan(deviceIp);
  return items;
}
