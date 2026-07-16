// Host plugin-SDK bridge for externally-loaded plugins.
//
// A plugin's `import { definePlugin } from "@voxcomposer/plugin-sdk"` resolves
// here (via the import map in index.html). Re-exporting the host's own SDK copy
// keeps one source of truth for definePlugin/validateManifest and their types,
// so an external bundle never has to vendor the SDK.
const host = globalThis.__VOX_HOST__;
if (!host || !host.sdk) {
  throw new Error(
    'Vox Composer host SDK not ready — a plugin imported "@voxcomposer/plugin-sdk" too early.',
  );
}
const S = host.sdk;

export const definePlugin = S.definePlugin;
export const validateManifest = S.validateManifest;
export const VoxPluginManifestSchema = S.VoxPluginManifestSchema;
export const PluginPermissionSchema = S.PluginPermissionSchema;
export const PERMISSION_LABELS = S.PERMISSION_LABELS;
