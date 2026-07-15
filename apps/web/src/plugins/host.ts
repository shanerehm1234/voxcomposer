import type { VoxPlugin, VoxPluginAPI } from '@voxcomposer/plugin-sdk';
import type { VoxShow } from '@voxcomposer/shared';
import { createPluginAPI, type MasterRelay } from './api.js';

/**
 * Runtime host for the loaded plugins: owns the single {@link VoxPluginAPI}
 * instance handed to each plugin (for setup, inspector and playback), plus the
 * live show snapshot and the optional Master relay. Centralising it here means
 * when the Socket.io relay is wired, only `setPluginRelay` changes — every
 * plugin surface picks it up.
 */
let liveShow: VoxShow | null = null;
let relay: MasterRelay | undefined;
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
