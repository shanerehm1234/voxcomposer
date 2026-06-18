import { z } from 'zod';
import type { VoxPluginManifest } from './types.js';

export const PluginPermissionSchema = z.enum([
  'network',
  'devices',
  'show-read',
  'show-write',
  'master',
]);

export const VoxPluginManifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/i, 'expected reverse-DNS id, e.g. "com.wled.integration"'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'expected semver'),
  author: z.string().min(1),
  description: z.string().default(''),
  trackType: z.string().min(1),
  permissions: z.array(PluginPermissionSchema).default([]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb')
    .optional(),
});

/**
 * Validate the static manifest fields of a plugin object. Throws (via zod) on
 * an invalid manifest; returns the normalised manifest on success. The host
 * should call this before registering an untrusted plugin and before showing
 * the permissions prompt.
 */
export function validateManifest(input: unknown): VoxPluginManifest {
  return VoxPluginManifestSchema.parse(input);
}

/** Human-readable description of what a permission grants, for the install UI. */
export const PERMISSION_LABELS: Record<string, string> = {
  network: 'Send network commands (UDP/OSC/MQTT/HTTP) via the Master',
  devices: 'Read paired device information',
  'show-read': 'Read the current show',
  'show-write': 'Edit clips on its own track',
  master: 'Send custom events to the Master',
};
