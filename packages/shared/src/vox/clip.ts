import { z } from 'zod';
import { Millis } from './primitives.js';

/**
 * A single jaw-sync keyframe. Produced by RMS-analysing an audio clip and
 * exported alongside it so the skull remote can drive the servo.
 */
export const JawKeyframe = z.object({
  timeMs: Millis,
  /** Normalised jaw-open amount, 0 (closed) .. 1 (fully open). */
  value: z.number().min(0).max(1),
});
export type JawKeyframe = z.infer<typeof JawKeyframe>;

// --- Type-specific clip payloads --------------------------------------------
// These describe the expected shape of VoxClip.data per clip type. VoxClip
// keeps `data` as a passthrough record (below) so unknown plugin payloads and
// forward-compatible fields always survive a round-trip; use these schemas to
// validate/parse a clip's data when a feature needs the concrete shape.

export const AudioSourceFormat = z.enum(['wav', 'mp3', 'ogg', 'm4a']);
export type AudioSourceFormat = z.infer<typeof AudioSourceFormat>;

export const AudioClipData = z.object({
  filename: z.string().min(1),
  deviceId: z.string().min(1),
  /** Linear gain, 0 .. 1. */
  volume: z.number().min(0).max(1).default(1),
  /** Fade-in / fade-out durations in ms (0 = no fade). */
  fadeInMs: Millis.default(0),
  fadeOutMs: Millis.default(0),
  jawSync: z.boolean().default(false),
  /** Precomputed jaw envelope; present once analysed. */
  jawKeyframes: z.array(JawKeyframe).optional(),
  /**
   * Format of the imported source file. MP3/OGG/M4A are accepted as first-class
   * input (decoded in-browser for the waveform); if the target device only
   * supports WAV, the server transcodes at sync time.
   */
  sourceFormat: AudioSourceFormat.optional(),
  /** SHA-256 of the source bytes — the cache key for transcoded output. */
  sourceHash: z.string().optional(),
});
export type AudioClipData = z.infer<typeof AudioClipData>;

export const DmxClipData = z.object({
  universe: z.number().int().nonnegative(),
  channel: z.number().int().min(1).max(512),
  value: z.number().int().min(0).max(255),
  fadeMs: Millis.default(0),
});
export type DmxClipData = z.infer<typeof DmxClipData>;

export const RelayClipData = z.object({
  channel: z.number().int().nonnegative(),
  action: z.enum(['on', 'off', 'pulse']),
  /** Pulse width; only meaningful when action === 'pulse'. */
  durationMs: Millis.optional(),
});
export type RelayClipData = z.infer<typeof RelayClipData>;

/** Servo / neck motion as an explicit keyframe envelope, 0 .. 1 per axis. */
export const ServoClipData = z.object({
  axis: z.string().default('default'),
  keyframes: z.array(z.object({ timeMs: Millis, value: z.number().min(0).max(1) })),
});
export type ServoClipData = z.infer<typeof ServoClipData>;

export const PluginClipData = z.object({
  pluginId: z.string().min(1),
  payload: z.record(z.unknown()),
});
export type PluginClipData = z.infer<typeof PluginClipData>;

// --- The clip itself ---------------------------------------------------------

export const VoxClip = z.object({
  id: z.string().min(1),
  /** Position on the timeline, in milliseconds from show start. */
  startMs: Millis,
  durationMs: Millis,
  /** Matches the owning track's type (or a plugin track type). */
  type: z.string().min(1),
  /** Type-specific payload. Passthrough preserves unknown/plugin fields. */
  data: z.record(z.unknown()),
});
export type VoxClip = z.infer<typeof VoxClip>;
