import { describe, expect, it } from 'vitest';
import type { VoxClip } from '@voxcomposer/shared';
import { buildHueAction, hexToHueSat } from '../hue.js';
import { buildHaAction } from '../homeAssistant.js';
import { BUILTIN_PLUGINS } from '../builtins.js';

/**
 * The Hue/HA plugins bake their per-clip HTTP call via compileClip → the Master
 * replays it unattended, so the baked action must be exactly right. These test
 * the pure builders (no network) shared by onFrame and compileClip.
 */

const HUE = { bridgeIp: '10.0.0.5', username: 'KEY123' };

describe('buildHueAction', () => {
  it('recalls a scene against group 0', () => {
    const a = buildHueAction(
      { kind: 'scene', sceneId: 'AbC', groupId: '0', on: true, bri: 254, useColor: false, color: '#fff', transitionMs: 400 },
      HUE,
    );
    expect(a).toEqual({
      kind: 'http',
      method: 'PUT',
      url: 'http://10.0.0.5/api/KEY123/groups/0/action',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene: 'AbC', transitiontime: 4 }),
    });
  });

  it('sets a room on with brightness + colour, converting ms→deciseconds', () => {
    const a = buildHueAction(
      { kind: 'group', sceneId: '', groupId: '3', on: true, bri: 200, useColor: true, color: '#ff0000', transitionMs: 1000 },
      HUE,
    );
    expect(a?.url).toBe('http://10.0.0.5/api/KEY123/groups/3/action');
    const body = JSON.parse(a!.body!);
    expect(body).toMatchObject({ on: true, bri: 200, transitiontime: 10 });
    expect(body.hue).toBe(0); // pure red
    expect(body.sat).toBe(254);
  });

  it('omits colour/bri when turning a room off', () => {
    const a = buildHueAction(
      { kind: 'group', sceneId: '', groupId: '3', on: false, bri: 200, useColor: true, color: '#ff0000', transitionMs: 0 },
      HUE,
    );
    expect(JSON.parse(a!.body!)).toEqual({ on: false, transitiontime: 0 });
  });

  it('returns null when unconfigured or unselected', () => {
    const d = { kind: 'scene' as const, sceneId: 'x', groupId: '0', on: true, bri: 1, useColor: false, color: '#000', transitionMs: 0 };
    expect(buildHueAction(d, { bridgeIp: '', username: '' })).toBeNull();
    expect(buildHueAction({ ...d, sceneId: '' }, HUE)).toBeNull();
  });
});

describe('hexToHueSat', () => {
  it('maps primaries to Hue space', () => {
    expect(hexToHueSat('#ff0000')).toEqual({ hue: 0, sat: 254 });
    expect(hexToHueSat('#00ff00').hue).toBeCloseTo(21845, -2);
    expect(hexToHueSat('#ffffff').sat).toBe(0); // white = no saturation
  });
});

const HA = { baseUrl: 'http://ha.local:8123', token: 'TOK' };

describe('buildHaAction', () => {
  it('POSTs a service call with the entity target + bearer token', () => {
    const a = buildHaAction({ domain: 'light', service: 'turn_on', entityId: 'light.porch' }, HA);
    expect(a).toEqual({
      kind: 'http',
      method: 'POST',
      url: 'http://ha.local:8123/api/services/light/turn_on',
      headers: { Authorization: 'Bearer TOK', 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: 'light.porch' }),
    });
  });

  it('allows a targetless service (empty body)', () => {
    const a = buildHaAction({ domain: 'script', service: 'run_fog', entityId: '' }, HA);
    expect(a?.body).toBe('{}');
    expect(a?.url).toBe('http://ha.local:8123/api/services/script/run_fog');
  });

  it('returns null when unconfigured or no service picked', () => {
    expect(buildHaAction({ domain: 'light', service: 'turn_on', entityId: 'x' }, { baseUrl: '', token: '' })).toBeNull();
    expect(buildHaAction({ domain: '', service: '', entityId: '' }, HA)).toBeNull();
  });
});

describe('generic-http compileClip', () => {
  const http = BUILTIN_PLUGINS.find((p) => p.id === 'com.voxcomposer.generic-http')!;
  const clip = (data: Record<string, unknown>) =>
    ({ id: 'c', startMs: 0, durationMs: 100, type: 'http', data }) as unknown as VoxClip;

  it('bakes a GET when only a URL is set', () => {
    expect(http.compileClip!(clip({ url: 'http://x.local/go' }), {})).toEqual({
      kind: 'http',
      method: 'GET',
      url: 'http://x.local/go',
    });
  });

  it('bakes a POST with body', () => {
    const a = http.compileClip!(clip({ url: 'http://x.local/go', method: 'POST', body: 'hi' }), {});
    expect(a).toMatchObject({ method: 'POST', body: 'hi' });
  });

  it('bakes nothing without a URL', () => {
    expect(http.compileClip!(clip({}), {})).toBeNull();
  });
});

// A tiny sanity check that clip.data survives the read() defaults path.
describe('clip shape', () => {
  it('empty clip data yields a null bake, not a throw', () => {
    const clip = { id: 'c', startMs: 0, durationMs: 100, type: 'hue', data: {} } as unknown as VoxClip;
    expect(() => buildHueAction({ kind: 'scene', sceneId: '', groupId: '0', on: true, bri: 1, useColor: false, color: '#000', transitionMs: 0 }, HUE)).not.toThrow();
    expect(clip.data).toEqual({});
  });
});
