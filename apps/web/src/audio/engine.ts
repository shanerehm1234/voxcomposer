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

      const data = clip.data as Record<string, unknown>;
      const v = Number(data.volume ?? 1);
      const volume = Number.isFinite(v) ? v : 1;
      const fadeInMs = Math.max(0, Number(data.fadeInMs ?? 0));
      const fadeOutMs = Math.max(0, Number(data.fadeOutMs ?? 0));

      const src = ctx.createBufferSource();
      src.buffer = asset.buffer;
      const gain = ctx.createGain();

      // Timeline time -> audio-clock time.
      const at = (timelineMs: number) => t0 + (timelineMs - fromMs) / 1000;

      // Fade in (clamped to "now" when the playhead starts mid-fade).
      if (fadeInMs > 0) {
        const fadeInEnd = clip.startMs + fadeInMs;
        const startGain = fromMs >= fadeInEnd ? volume : volume * (offsetSec / (fadeInMs / 1000) || 0);
        gain.gain.setValueAtTime(Math.min(volume, startGain), Math.max(whenSec, ctx.currentTime));
        if (fromMs < fadeInEnd) gain.gain.linearRampToValueAtTime(volume, at(fadeInEnd));
      } else {
        gain.gain.setValueAtTime(volume, Math.max(whenSec, ctx.currentTime));
      }

      // Fade out, anchored before the clip end.
      if (fadeOutMs > 0) {
        const fadeOutStart = Math.max(clip.startMs, clipEnd - fadeOutMs);
        gain.gain.setValueAtTime(volume, Math.max(at(fadeOutStart), ctx.currentTime));
        gain.gain.linearRampToValueAtTime(0.0001, at(clipEnd));
      }

      src.connect(gain).connect(ctx.destination);
      src.start(whenSec, offsetSec);
      // Stop at the clip's end so a clip shorter than its file doesn't run over.
      const stopSec = at(clipEnd);
      if (stopSec > whenSec) src.stop(stopSec);
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
