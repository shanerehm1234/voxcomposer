import type { PluginConfig } from '@voxcomposer/plugin-sdk';

/**
 * Persistent, plugin-scoped configuration store. A plugin's setup (Hue bridge
 * key, HA host + token) is entered ONCE and lives here — global to the install,
 * keyed by plugin id, never per show or per clip. Backed by localStorage so it
 * survives reloads; an in-memory fallback keeps it working under SSR/tests.
 *
 * Config is credentials + endpoints, so it stays on this machine and is NOT
 * written into exported/shared .vox files — only the baked action URLs are.
 */
const PREFIX = 'vox.plugin.config.';

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const memory = new Map<string, PluginConfig>();

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function getPluginConfig(pluginId: string): PluginConfig {
  if (memory.has(pluginId)) return memory.get(pluginId)!;
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(PREFIX + pluginId);
      if (raw) {
        const parsed = JSON.parse(raw) as PluginConfig;
        memory.set(pluginId, parsed);
        return parsed;
      }
    } catch {
      /* corrupt entry — fall through to empty */
    }
  }
  const empty: PluginConfig = {};
  memory.set(pluginId, empty);
  return empty;
}

/** Merge a patch into a plugin's config, persist it, and notify subscribers. */
export function setPluginConfig(pluginId: string, patch: PluginConfig): PluginConfig {
  const next = { ...getPluginConfig(pluginId), ...patch };
  memory.set(pluginId, next);
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(PREFIX + pluginId, JSON.stringify(next));
    } catch {
      /* quota / private mode — keep the in-memory copy */
    }
  }
  listeners.get(pluginId)?.forEach((fn) => fn());
  return next;
}

/** Subscribe to changes for one plugin's config (for React setup/inspector UIs). */
export function subscribePluginConfig(pluginId: string, fn: Listener): () => void {
  let set = listeners.get(pluginId);
  if (!set) {
    set = new Set();
    listeners.set(pluginId, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}
