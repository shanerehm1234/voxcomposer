import { z } from 'zod';
import { FixtureAssignment } from './fixture.js';
import { SemVer } from './primitives.js';

/** Hardware classes a paired Vox Remote can report as. */
export const VoxDeviceType = z.enum([
  'skull',
  'dmx',
  'relay',
  'sense',
  'audio',
  'pixel',
  'custom',
]);
export type VoxDeviceType = z.infer<typeof VoxDeviceType>;

/** Audio formats a device's firmware can play back natively. */
export const AudioFormat = z.enum(['wav', 'mp3', 'ogg', 'm4a']);
export type AudioFormat = z.infer<typeof AudioFormat>;

/** Playback spec a device's codec requires, for transcoding at sync time. */
export const DeviceAudioSpec = z.object({
  sampleRate: z.number().int().positive(),
  bitDepth: z.number().int().positive(),
  channels: z.union([z.literal(1), z.literal(2)]),
});
export type DeviceAudioSpec = z.infer<typeof DeviceAudioSpec>;

export const VoxDevice = z.object({
  /** MAC address of the remote — stable hardware identity. */
  id: z.string().min(1),
  /** User-assigned display name, e.g. "Skelly 1". */
  name: z.string().min(1),
  type: VoxDeviceType,
  /** Vox-Link API version this device firmware supports. */
  apiVersion: SemVer,
  /** Filenames present on this device's SD card, when last scanned. */
  inventory: z.array(z.string()).optional(),
  /**
   * Audio formats the firmware can play. Defaults to WAV — today the Ocular Vox
   * boards require uncompressed WAV (no real-time MP3 decode), so the composer
   * transcodes to WAV at sync time. A firmware that adds MP3 later just reports
   * `['wav','mp3']` here and conversion is skipped — a non-breaking upgrade path.
   */
  supportsFormats: z.array(AudioFormat).optional(),
  /** Codec requirement used when transcoding source audio for this device. */
  audioSpec: DeviceAudioSpec.optional(),
  /** DMX devices: which fixture this is and its patch address (see fixture.ts). */
  fixture: FixtureAssignment.optional(),
  /**
   * Pixel devices: how many LEDs this prop drives (a 35-pixel ring, a 150-px
   * strip…). Purely informational for previews — the remote's own WLED config
   * is the source of truth for the hardware. Set by hand today; will be
   * pulled from device telemetry once the protocol carries it.
   */
  pixelCount: z.number().int().min(1).max(2048).optional(),
  /**
   * Relay devices: how many outputs this box has (bench prototype 2; the
   * production VoxRelay will carry 4 or 8) and what each one switches —
   * "Fog machine", "Air horn"… Labels index from relay 1.
   */
  relayCount: z.number().int().min(1).max(8).optional(),
  relayLabels: z.array(z.string().max(24)).max(8).optional(),
  /**
   * The Vox Master itself: the backpack track types it hosts locally
   * ("relay","dmx","audio"), addressed to the Master's own MAC. Dragging this
   * device to the timeline creates one track per listed type. Absent on
   * ordinary single-function remotes.
   */
  onboard: z.array(z.string()).optional(),
});
export type VoxDevice = z.infer<typeof VoxDevice>;

/** A device's playable formats, defaulting to WAV-only when unspecified. */
export function deviceFormats(device: Pick<VoxDevice, 'supportsFormats'>): AudioFormat[] {
  return device.supportsFormats ?? ['wav'];
}
