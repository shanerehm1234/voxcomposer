import { z } from 'zod';
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
});
export type VoxDevice = z.infer<typeof VoxDevice>;

/** A device's playable formats, defaulting to WAV-only when unspecified. */
export function deviceFormats(device: Pick<VoxDevice, 'supportsFormats'>): AudioFormat[] {
  return device.supportsFormats ?? ['wav'];
}
