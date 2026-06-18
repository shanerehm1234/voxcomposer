import { z } from 'zod';

/** Current .vox format version. Bump per semver on schema changes. */
export const VOX_FORMAT_VERSION = '1.0.0';

/** Vox-Link API protocol version this build speaks. Versioned independently of the .vox format. */
export const VOX_LINK_API_VERSION = '1.0.0';

/** Non-negative integer milliseconds — the timeline's only unit of time. */
export const Millis = z.number().finite().nonnegative();

/** Semver string, loosely validated (major.minor.patch with optional pre-release). */
export const SemVer = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/, 'expected semver, e.g. "1.0.0"');

/** ISO 8601 timestamp. */
export const IsoTimestamp = z.string().datetime({ offset: true });

export type Millis = z.infer<typeof Millis>;
