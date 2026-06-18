import { z } from 'zod';
import { VoxClip } from './clip.js';

/**
 * Built-in track types. Plugin tracks use the string id the plugin registers,
 * so this is a loose enum: known values are validated, custom plugin types pass
 * through as arbitrary strings.
 */
export const KnownTrackType = z.enum(['audio', 'dmx', 'relay', 'servo', 'neck', 'plugin']);
export type KnownTrackType = z.infer<typeof KnownTrackType>;

export const VoxTrack = z.object({
  id: z.string().min(1),
  /** References VoxDevice.id. */
  deviceId: z.string().min(1),
  /** Built-in type or a plugin-registered track type id. */
  type: z.string().min(1),
  label: z.string(),
  clips: z.array(VoxClip),
});
export type VoxTrack = z.infer<typeof VoxTrack>;
