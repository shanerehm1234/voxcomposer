import type { VoxPlugin, VoxPluginAPI } from '@voxcomposer/plugin-sdk';
import type { VoxShow } from '@voxcomposer/shared';
import { createPluginAPI, type MasterRelay } from './api.js';
import { makeMasterRelay } from './masterRelay.js';

/**
 * Runtime host for the loaded plugins: owns the single {@link VoxPluginAPI}
 * instance handed to each plugin (for setup, inspector and playback), plus the
 * live show snapshot and the optional Master relay. Centralising it here means
 * when the Socket.io relay is wired, only `setPluginRelay` changes — every
 * plugin surface picks it up.
 */
let liveShow: VoxShow | null = null;
// Default to the Master-backed relay: http:// calls to a Hue bridge / Home
// Assistant can't go direct from the browser (no CORS), so they proxy through
// the configured Master. setPluginRelay can replace it (e.g. a socket relay).
let relay: MasterRelay | undefined = makeMasterRelay();
const apiCache = new Map<string, VoxPluginAPI>();

const EMPTY_SHOW = { version: '1', name: '', duration: 0, tracks: [], devices: [] } as unknown as VoxShow;

/** Keep the host's view of the current show current (call on show changes). */
export function setPluginShow(show: VoxShow): void {
  liveShow = show;
}

/** Attach/replace the Master relay used for network calls; rebuilds the apis. */
export function setPluginRelay(next?: MasterRelay): void {
  relay = next;
  apiCache.clear();
}

/** The stable {@link VoxPluginAPI} for a plugin (cached, permission-enforced). */
export function getPluginApi(plugin: VoxPlugin): VoxPluginAPI {
  let api = apiCache.get(plugin.id);
  if (!api) {
    api = createPluginAPI(plugin, { getShow: () => liveShow ?? EMPTY_SHOW, relay });
    apiCache.set(plugin.id, api);
  }
  return api;
}
