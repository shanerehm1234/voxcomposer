import type { VoxPlugin } from '@voxcomposer/plugin-sdk';
import { pluginRegistry } from './registry.js';

/**
 * External plugin loading.
 *
 * A plugin the user installs "by URL" is a real ES module hosted anywhere
 * (their vox-plugin-* GitHub repo's built bundle, a CDN, a LAN box) whose
 * default export is a VoxPlugin. We import it at runtime, validate + register
 * it exactly like a built-in, and remember its URL so it comes back next launch.
 *
 * Plugins run trusted and in-process — same as the built-ins — so this is a
 * power-user feature. The bundle shares the host's React + SDK via the import
 * map in index.html (see public/vox-host-*.js), which is why we publish those
 * on the host global before anything can load a plugin.
 */

export interface PluginHost {
  React: unknown;
  jsxRuntime: unknown;
  sdk: unknown;
}

/** Publish the host's shared modules for externally-loaded plugin bundles. */
export function publishPluginHost(host: PluginHost): void {
  (globalThis as { __VOX_HOST__?: PluginHost }).__VOX_HOST__ = host;
}

/** How a URL becomes a module. Injectable so tests don't hit the network. */
export type ModuleImporter = (url: string) => Promise<Record<string, unknown>>;
const importModule: ModuleImporter = (url) => import(/* @vite-ignore */ url);

const STORAGE_KEY = 'vox.plugins.installed';

interface StoredInstall {
  url: string;
  /** Filled once the URL has loaded and we know which plugin it is. */
  id?: string;
}

/** Live map of external plugin id → the URL it was loaded from. */
const externalIds = new Map<string, string>();

function readStore(): StoredInstall[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredInstall[]).filter((s) => s && typeof s.url === 'string') : [];
  } catch {
    return [];
  }
}

function writeStore(list: StoredInstall[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — installs just won't persist */
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** External plugins currently installed (id + source URL), for the Settings list. */
export function installedPluginSources(): { id: string; url: string }[] {
  return [...externalIds].map(([id, url]) => ({ id, url }));
}

/** True if a plugin id came from an external install (vs. a built-in). */
export function isExternalPlugin(id: string): boolean {
  return externalIds.has(id);
}

/**
 * Install a plugin from a URL: import it, register it, and persist the URL.
 * Returns the plugin on success; throws a user-facing Error otherwise.
 * Idempotent — re-installing the same URL/plugin is a no-op success.
 */
export async function installPluginFromUrl(
  url: string,
  importer: ModuleImporter = importModule,
): Promise<VoxPlugin> {
  const clean = url.trim();
  if (!clean) throw new Error('Enter a plugin URL first.');

  let mod: Record<string, unknown>;
  try {
    mod = await importer(clean);
  } catch (e) {
    throw new Error(`Couldn't load that plugin (${errMsg(e)}). Check the URL is a built plugin .js.`);
  }

  const plugin = (mod.default ?? mod.plugin) as VoxPlugin | undefined;
  if (!plugin || typeof plugin !== 'object' || typeof plugin.id !== 'string') {
    throw new Error('That module doesn’t default-export a Vox Composer plugin.');
  }

  // Guard clashes: a built-in (or an already-installed different URL) owning
  // this id must not be silently shadowed.
  const existingUrl = externalIds.get(plugin.id);
  if (pluginRegistry.has(plugin.id) && existingUrl === undefined) {
    throw new Error(`Plugin id "${plugin.id}" clashes with a built-in and can’t be installed.`);
  }
  if (existingUrl !== undefined && existingUrl !== clean) {
    throw new Error(`Plugin "${plugin.id}" is already installed from a different URL.`);
  }

  if (!pluginRegistry.has(plugin.id)) {
    pluginRegistry.register(plugin); // validates the manifest; throws on a bad one
  }
  externalIds.set(plugin.id, clean);

  const store = readStore().filter((s) => s.url !== clean && s.id !== plugin.id);
  store.push({ url: clean, id: plugin.id });
  writeStore(store);
  return plugin;
}

/** Load every previously-installed plugin. Best-effort: one failure never
 *  blocks the others or the app. Returns a per-URL result for optional display. */
export async function loadInstalledPlugins(
  importer: ModuleImporter = importModule,
): Promise<{ url: string; id?: string; error?: string }[]> {
  const results: { url: string; id?: string; error?: string }[] = [];
  for (const rec of readStore()) {
    try {
      const p = await installPluginFromUrl(rec.url, importer);
      results.push({ url: rec.url, id: p.id });
    } catch (e) {
      results.push({ url: rec.url, error: errMsg(e) });
    }
  }
  return results;
}

/** Remove an installed external plugin: unregister it and forget its URL. */
export function uninstallPlugin(id: string): void {
  pluginRegistry.unregister(id);
  externalIds.delete(id);
  writeStore(readStore().filter((s) => s.id !== id));
}
