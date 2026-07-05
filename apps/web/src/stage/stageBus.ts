import type { VoxShow } from '@voxcomposer/shared';

/**
 * A single mutable frame shared between the Timeline (producer) and the
 * StagePanel (consumer). The timeline's rAF loop publishes the draft show +
 * playhead here every frame; the stage runs its own rAF and reads it back.
 * Module-singleton on purpose (like the audio registry): both sides need
 * frame-rate access without React re-rendering at frame rate.
 */
export interface StageFrame {
  show: VoxShow;
  atMs: number;
  playing: boolean;
}

let frame: StageFrame | null = null;

export function publishStageFrame(show: VoxShow, atMs: number, playing: boolean): void {
  frame = { show, atMs, playing };
}

export function readStageFrame(): StageFrame | null {
  return frame;
}
