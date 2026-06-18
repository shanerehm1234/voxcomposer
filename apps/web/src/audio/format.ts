import type { AudioSourceFormat } from '@voxcomposer/shared';

/** Audio file types accepted on import. MP3 is the common case; WAV is what the
 * Ocular Vox boards ultimately play (transcoded server-side at sync time). */
export const ACCEPTED_AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a'] as const;

/** `accept` attribute value for audio file inputs. */
export const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.m4a';

/** True if the file looks like an audio file we can import. */
export function isAcceptedAudio(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_AUDIO_EXT.some((ext) => name.endsWith(ext));
}

/** Determine the source format from a file's name/MIME. */
export function detectFormat(file: File): AudioSourceFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith('.mp3') || file.type === 'audio/mpeg') return 'mp3';
  if (name.endsWith('.ogg') || file.type === 'audio/ogg') return 'ogg';
  if (
    name.endsWith('.m4a') ||
    file.type === 'audio/mp4' ||
    file.type === 'audio/x-m4a' ||
    file.type === 'audio/aac'
  ) {
    return 'm4a';
  }
  return 'wav';
}

/**
 * SHA-256 of the file bytes (first 32 hex chars), used as the cache key for the
 * server-side WAV transcode so re-syncing an unchanged file never reconverts.
 */
export async function hashFile(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    return '';
  }
}
