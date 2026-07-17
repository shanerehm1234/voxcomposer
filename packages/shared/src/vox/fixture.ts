import { z } from 'zod';

/**
 * DMX fixture profiles — the `vibe-profile/1` JSON format served by the
 * rehmlights profile library ("the Vibrary", 240+ GDTF-derived fixtures,
 * shared with the VIBE controller). A profile maps semantic roles ("PAN",
 * "DIMMER", "COLOR_WHEEL") to relative channel offsets so users program
 * looks ("point left, dim 80%, blue, gobo 2") instead of channel numbers.
 */

export const FixtureChannel = z.object({
  /** Semantic role, e.g. "PAN", "TILT", "DIMMER", "COLOR_WHEEL". Open set. */
  role: z.string().min(1),
  /** 1-based channel offset within the fixture's footprint. */
  offset: z.number().int().min(1),
  /** Power-on/neutral value for the channel, when the profile knows one. */
  default: z.number().int().min(0).max(255).optional(),
});
export type FixtureChannel = z.infer<typeof FixtureChannel>;

export const WheelSlot = z.object({
  value: z.number().int().min(0).max(255),
  name: z.string(),
});
export type WheelSlot = z.infer<typeof WheelSlot>;

export const FixtureProfile = z
  .object({
    schema: z.literal('vibe-profile/1'),
    id: z.string().min(1),
    name: z.string().min(1),
    manufacturer: z.string(),
    mode: z.string(),
    fixture_type: z.string(),
    /** Channels this fixture occupies from its start address. */
    footprint: z.number().int().min(1),
    channels: z.array(FixtureChannel),
    color_wheel: z.array(WheelSlot).optional(),
    gobo_wheel: z.array(WheelSlot).optional(),
  })
  .passthrough(); // forward-compat: future schema additions survive a round-trip
export type FixtureProfile = z.infer<typeof FixtureProfile>;

/** One entry of the Vibrary's index.json (`rehmlights-index/1`). */
export const FixtureIndexEntry = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  manufacturer: z.string(),
  mode: z.string(),
  footprint: z.number().int(),
  url: z.string(),
});
export type FixtureIndexEntry = z.infer<typeof FixtureIndexEntry>;

export const FixtureIndex = z.object({
  schema: z.literal('rehmlights-index/1'),
  count: z.number().int(),
  fixtures: z.array(FixtureIndexEntry),
});
export type FixtureIndex = z.infer<typeof FixtureIndex>;

/**
 * A DMX device's fixture patch: which profile it is and where it lives on
 * the wire. Stored on the VoxDevice so every clip on that device can be
 * authored as a look.
 */
export const FixtureAssignment = z.object({
  profileId: z.string().min(1),
  universe: z.number().int().nonnegative().default(0),
  /** DMX start address, 1-based. */
  startChannel: z.number().int().min(1).max(512).default(1),
});
export type FixtureAssignment = z.infer<typeof FixtureAssignment>;

/** A look: semantic role → value 0..255 (e.g. { DIMMER: 200, PAN: 32 }). */
export type FixtureLook = Record<string, number>;

/** A compiled wire level. `fade:false` marks a channel that must SNAP (never
 *  slew through intermediate values) even when the clip has a fadeMs — a color
 *  or gobo wheel slot, a shutter/strobe value, a control/speed channel. Absent
 *  `fade` means the Master may ramp it (default true). */
export interface CompiledLevel {
  channel: number;
  value: number;
  fade?: boolean;
}

/**
 * Roles that select a discrete state rather than a continuous magnitude —
 * fading these would step through wrong wheel slots / strobe rates, so they
 * SNAP. Everything else (PAN/TILT/DIMMER/FOCUS/ZOOM/IRIS/RGB…) is left to fade
 * so a moving head sweeps smoothly between cues.
 */
const SNAP_ROLES = new Set([
  'COLOR_WHEEL',
  'COLOR_WHEEL_2',
  'GOBO_WHEEL',
  'GOBO_WHEEL_2',
  'SHUTTER',
  'STROBE',
  'PRISM',
  'CONTROL',
  'FUNCTION',
  'MACRO',
  'RESET',
  'LAMP',
  'PAN_TILT_SPEED',
  'SPEED',
]);

/**
 * Compile a look into absolute wire levels. Roles the profile doesn't have are
 * skipped; channels past 512 are dropped. Each level is tagged with whether it
 * may fade (continuous roles) or must snap (wheels/shutter/control). Pure — the
 * Composer compiles at edit time and stores the result on the clip, so the
 * Master and the VoxDMX remote never need fixture awareness, only the flag.
 */
export function compileLook(
  profile: Pick<FixtureProfile, 'channels'>,
  startChannel: number,
  look: FixtureLook,
): CompiledLevel[] {
  const out: CompiledLevel[] = [];
  for (const ch of profile.channels) {
    const value = look[ch.role];
    if (value === undefined) continue;
    const channel = startChannel + ch.offset - 1;
    if (channel < 1 || channel > 512) continue;
    const level: CompiledLevel = { channel, value: Math.max(0, Math.min(255, Math.round(value))) };
    if (SNAP_ROLES.has(ch.role)) level.fade = false;
    out.push(level);
  }
  return out.sort((a, b) => a.channel - b.channel);
}
