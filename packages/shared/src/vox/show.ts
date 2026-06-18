import { z } from 'zod';
import { IsoTimestamp, Millis, SemVer } from './primitives.js';
import { VoxDevice } from './device.js';
import { VoxTrack } from './track.js';

export const VoxShowMetadata = z.object({
  author: z.string().optional(),
  description: z.string().optional(),
  venue: z.string().optional(),
});
export type VoxShowMetadata = z.infer<typeof VoxShowMetadata>;

export const VoxShow = z.object({
  /** .vox format version this file was written as. */
  version: SemVer,
  name: z.string().min(1),
  created: IsoTimestamp,
  modified: IsoTimestamp,
  /** Total show length in milliseconds. */
  duration: Millis,
  /** Optional, drives beat-sync features and beat-based snapping. */
  bpm: z.number().positive().optional(),
  devices: z.array(VoxDevice),
  tracks: z.array(VoxTrack),
  metadata: VoxShowMetadata.default({}),
});
export type VoxShow = z.infer<typeof VoxShow>;
