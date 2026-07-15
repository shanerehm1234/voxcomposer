import type { VoxClip, VoxShow } from '@voxcomposer/shared';
import { definePlugin } from '@voxcomposer/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createPluginAPI } from '../api.js';
import { PluginRegistry } from '../registry.js';

const fakePlugin = (over: Partial<Parameters<typeof definePlugin>[0]> = {}) =>
  definePlugin({
    id: 'com.example.test',
    name: 'Test',
    version: '1.0.0',
    author: 'rehmlights',
    description: 'test',
    trackType: 'test',
    permissions: ['network', 'show-read'],
    ...over,
  });

const emptyShow = (): VoxShow => ({
  version: '1.0.0',
  name: 'S',
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  duration: 1000,
  devices: [{ id: 'D1', name: 'Dev', type: 'custom', apiVersion: '1.0.0' }],
  tracks: [],
  metadata: {},
});

describe('PluginRegistry', () => {
  it('registers and indexes by id and track type', () => {
    const reg = new PluginRegistry();
    const p = fakePlugin();
    reg.register(p);
    expect(reg.get('com.example.test')).toBe(p);
    expect(reg.forTrackType('test')).toBe(p);
    expect(reg.list()).toHaveLength(1);
  });

  it('rejects duplicate ids and track-type clashes', () => {
    const reg = new PluginRegistry();
    reg.register(fakePlugin());
    expect(() => reg.register(fakePlugin())).toThrow(/already registered/);
    expect(() => reg.register(fakePlugin({ id: 'com.example.other' }))).toThrow(/already owned/);
  });

  it('rejects an invalid manifest', () => {
    const reg = new PluginRegistry();
    expect(() => reg.register(fakePlugin({ id: 'no-dots' }))).toThrow();
  });
});

describe('createPluginAPI', () => {
  it('enforces declared permissions', () => {
    const api = createPluginAPI(fakePlugin({ permissions: ['show-read'] }), {
      getShow: emptyShow,
    });
    expect(api.getCurrentShow().name).toBe('S');
    // No 'network' permission -> sendUDP rejects.
    return expect(api.sendUDP('h', 1, new Uint8Array())).rejects.toThrow(/network/);
  });

  it('rejects network when the Master is not connected', () => {
    const api = createPluginAPI(fakePlugin(), { getShow: emptyShow });
    return expect(api.sendUDP('h', 1, new Uint8Array())).rejects.toThrow(/not connected/);
  });

  it('relays through the Master when connected', async () => {
    const udp = vi.fn().mockResolvedValue(undefined);
    const api = createPluginAPI(fakePlugin(), {
      getShow: emptyShow,
      relay: { udp, osc: vi.fn(), mqtt: vi.fn(), http: vi.fn(), emit: vi.fn() },
    });
    await api.sendUDP('192.168.1.9', 21324, new Uint8Array([1, 2]));
    expect(udp).toHaveBeenCalledOnce();
  });

  it('routes an http:// sendHTTP through the Master relay', async () => {
    const http = vi.fn().mockResolvedValue(new Response('{}'));
    const api = createPluginAPI(fakePlugin(), {
      getShow: emptyShow,
      relay: { udp: vi.fn(), osc: vi.fn(), mqtt: vi.fn(), http, emit: vi.fn() },
    });
    await api.sendHTTP('http://10.0.0.5/api/KEY/groups');
    expect(http).toHaveBeenCalledOnce();
  });

  it('reads a device only with the devices permission', () => {
    const ok = createPluginAPI(fakePlugin({ permissions: ['devices'] }), { getShow: emptyShow });
    expect(ok.getDevice('D1')?.name).toBe('Dev');
    const denied = createPluginAPI(fakePlugin({ permissions: [] }), { getShow: emptyShow });
    expect(() => denied.getDevice('D1')).toThrow(/devices/);
  });

  it('summarizes a clip via the plugin (smoke)', () => {
    const p = fakePlugin({ summarizeClip: (c: VoxClip) => `clip ${c.id}` });
    expect(p.summarizeClip?.({ id: 'x', startMs: 0, durationMs: 1, type: 'test', data: {} })).toBe(
      'clip x',
    );
  });
});
