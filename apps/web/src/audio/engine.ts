import type { VoxShow } from '@voxcomposer/shared';
import { audioContext } from './analyze.js';
import { getAsset } from './registry.js';

/**
 * Minimal local audio preview. Schedules each audio clip's decoded buffer on
 * the Web Audio clock relative to the playhead, so Space-to-play actually plays
 * the show. Local only — nothing streams over Vox-Link or to any server.
 */

let activeSources: AudioBufferSourceNode[] = [];

/** Start preview playback of `show` from `fromMs` on the timeline. */
export function startPlayback(show: VoxShow, fromMs: number): void {
  stopPlayback();
  const ctx = audioContext();
  void ctx.resume();
  const t0 = ctx.currentTime; // audio-clock time that maps to fromMs

  for (const track of show.tracks) {
    if (track.type !== 'audio') continue;
    for (const clip of track.clips) {
      const asset = getAsset(clip.id);
      if (!asset) continue;

      const clipEnd = clip.startMs + clip.durationMs;
      if (clipEnd <= fromMs) continue; // already finished before the playhead

      const whenSec = t0 + Math.max(0, (clip.startMs - fromMs) / 1000);
      const offsetSec = Math.max(0, (fromMs - clip.startMs) / 1000);
      if (offsetSec >= asset.buffer.duration) continue;

      const src = ctx.createBufferSource();
      src.buffer = asset.buffer;
      const gain = ctx.createGain();
      const volume = Number((clip.data as Record<string, unknown>).volume ?? 1);
      gain.gain.value = Number.isFinite(volume) ? volume : 1;
      src.connect(gain).connect(ctx.destination);
      src.start(whenSec, offsetSec);
      src.onended = () => {
        activeSources = activeSources.filter((s) => s !== src);
      };
      activeSources.push(src);
    }
  }
}

/** Stop all currently-scheduled preview audio. */
export function stopPlayback(): void {
  for (const src of activeSources) {
    try {
      src.onended = null;
      src.stop();
    } catch {
      // already stopped
    }
  }
  activeSources = [];
}
