import { describe, expect, it } from 'vitest';
import { loadShow } from '../migrations.js';
import { VOX_FORMAT_VERSION } from '../vox/primitives.js';

function minimalShow() {
  const now = new Date().toISOString();
  return {
    version: VOX_FORMAT_VERSION,
    name: 'Test Show',
    created: now,
    modified: now,
    duration: 30_000,
    devices: [{ id: 'AA:BB:CC:DD:EE:FF', name: 'Skelly 1', type: 'skull', apiVersion: '1.0.0' }],
    tracks: [
      {
        id: 't1',
        deviceId: 'AA:BB:CC:DD:EE:FF',
        type: 'audio',
        label: 'Skelly 1 — Audio',
        clips: [
          {
            id: 'c1',
            startMs: 1000,
            durationMs: 4000,
            type: 'audio',
            data: { filename: 'intro.wav', deviceId: 'AA:BB:CC:DD:EE:FF', volume: 1, jawSync: true },
          },
        ],
      },
    ],
    metadata: { venue: 'Front Yard' },
  };
}

describe('loadShow', () => {
  it('accepts a valid current-version show without migrating', () => {
    const result = loadShow(minimalShow());
    expect(result.migrated).toBe(false);
    expect(result.show.name).toBe('Test Show');
    expect(result.show.tracks[0]?.clips[0]?.startMs).toBe(1000);
  });

  it('rejects a structurally invalid document', () => {
    expect(() => loadShow({ version: '1.0.0', name: '' })).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => loadShow(null)).toThrow(/Not a .vox document/);
  });
});
