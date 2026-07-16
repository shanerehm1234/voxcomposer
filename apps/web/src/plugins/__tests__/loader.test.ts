import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definePlugin, type VoxPlugin } from '@voxcomposer/plugin-sdk';
import { pluginRegistry } from '../registry.js';
import {
  installPluginFromUrl,
  installedPluginSources,
  isExternalPlugin,
  loadInstalledPlugins,
  uninstallPlugin,
} from '../loader.js';

// A minimal in-memory localStorage so persistence is exercised in the node env.
const backing = new Map<string, string>();
beforeEach(() => {
  backing.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
  };
});

// Every plugin we register goes through the shared singleton — clean up so
// tests don't leak into each other.
const registered = new Set<string>();
afterEach(() => {
  for (const id of registered) if (pluginRegistry.has(id)) uninstallPlugin(id);
  registered.clear();
});

function fakePlugin(id: string): VoxPlugin {
  return definePlugin({
    id,
    name: 'Fake',
    version: '2.1.0',
    author: 'tester',
    description: 'a test plugin',
    trackType: id, // unique track type too, or the registry rejects it
    permissions: ['network'],
  });
}

/** An importer that yields the given module for any URL. */
function moduleWith(mod: Record<string, unknown>) {
  return vi.fn().mockResolvedValue(mod);
}

describe('installPluginFromUrl', () => {
  it('imports, registers, and persists a plugin', async () => {
    const p = fakePlugin('com.test.alpha');
    registered.add(p.id);
    const importer = moduleWith({ default: p });

    const result = await installPluginFromUrl('https://x/alpha.js', importer);

    expect(result).toBe(p);
    expect(pluginRegistry.has('com.test.alpha')).toBe(true);
    expect(isExternalPlugin('com.test.alpha')).toBe(true);
    expect(installedPluginSources()).toContainEqual({
      id: 'com.test.alpha',
      url: 'https://x/alpha.js',
    });
    // persisted
    expect(backing.get('vox.plugins.installed')).toContain('https://x/alpha.js');
  });

  it('rejects a URL that fails to import (wrapped, friendly message)', async () => {
    const importer = vi.fn().mockRejectedValue(new Error('404'));
    await expect(installPluginFromUrl('https://x/missing.js', importer)).rejects.toThrow(
      /Couldn.t load that plugin/,
    );
  });

  it('rejects a module with no default-exported plugin', async () => {
    const importer = moduleWith({ notDefault: 1 });
    await expect(installPluginFromUrl('https://x/bad.js', importer)).rejects.toThrow(
      /default-export a Vox Composer plugin/,
    );
  });

  it('rejects an empty URL without importing', async () => {
    const importer = vi.fn();
    await expect(installPluginFromUrl('   ', importer)).rejects.toThrow(/Enter a plugin URL/);
    expect(importer).not.toHaveBeenCalled();
  });

  it('refuses to shadow a built-in / already-registered id', async () => {
    const clash = fakePlugin('com.test.clash');
    pluginRegistry.register(clash); // pretend it's a built-in
    registered.add(clash.id);
    const importer = moduleWith({ default: fakePlugin('com.test.clash') });
    await expect(installPluginFromUrl('https://x/clash.js', importer)).rejects.toThrow(
      /clashes with a built-in/,
    );
  });

  it('is idempotent when re-installing the same URL', async () => {
    const p = fakePlugin('com.test.idem');
    registered.add(p.id);
    const importer = moduleWith({ default: p });
    await installPluginFromUrl('https://x/idem.js', importer);
    await installPluginFromUrl('https://x/idem.js', importer);
    expect(installedPluginSources().filter((s) => s.id === 'com.test.idem')).toHaveLength(1);
  });
});

describe('uninstallPlugin', () => {
  it('unregisters and forgets the URL', async () => {
    const p = fakePlugin('com.test.remove');
    const importer = moduleWith({ default: p });
    await installPluginFromUrl('https://x/remove.js', importer);
    expect(pluginRegistry.has('com.test.remove')).toBe(true);

    uninstallPlugin('com.test.remove');

    expect(pluginRegistry.has('com.test.remove')).toBe(false);
    expect(isExternalPlugin('com.test.remove')).toBe(false);
    expect(backing.get('vox.plugins.installed')).not.toContain('remove.js');
  });
});

describe('loadInstalledPlugins', () => {
  it('reloads persisted plugins and reports per-URL results', async () => {
    const good = fakePlugin('com.test.good');
    registered.add(good.id);
    // Seed the store with one good and one broken URL.
    backing.set(
      'vox.plugins.installed',
      JSON.stringify([{ url: 'https://x/good.js' }, { url: 'https://x/broken.js' }]),
    );
    const importer = vi.fn(async (url: string) => {
      if (url.includes('broken')) throw new Error('boom');
      return { default: good };
    });

    const results = await loadInstalledPlugins(importer);

    expect(pluginRegistry.has('com.test.good')).toBe(true);
    expect(results).toContainEqual({ url: 'https://x/good.js', id: 'com.test.good' });
    const broken = results.find((r) => r.url.includes('broken'));
    expect(broken?.error).toBeTruthy();
  });
});
