import { describe, expect, it } from 'vitest';
import { compileLook, FixtureProfile } from '../vox/fixture.js';

const profile = {
  channels: [
    { role: 'PAN', offset: 1, default: 127 },
    { role: 'TILT', offset: 2, default: 127 },
    { role: 'DIMMER', offset: 10, default: 255 },
    { role: 'COLOR_WHEEL', offset: 3 },
  ],
};

describe('compileLook', () => {
  it('maps roles to absolute channels from the start address', () => {
    expect(compileLook(profile, 1, { PAN: 32, DIMMER: 200 })).toEqual([
      { channel: 1, value: 32 },
      { channel: 10, value: 200 },
    ]);
    expect(compileLook(profile, 101, { PAN: 32, COLOR_WHEEL: 29 })).toEqual([
      { channel: 101, value: 32 },
      { channel: 103, value: 29 },
    ]);
  });

  it('skips roles the profile does not have and clamps values', () => {
    expect(compileLook(profile, 1, { STROBE: 10, TILT: 999 })).toEqual([
      { channel: 2, value: 255 },
    ]);
  });

  it('drops channels beyond 512', () => {
    expect(compileLook(profile, 510, { DIMMER: 100, PAN: 5 })).toEqual([
      { channel: 510, value: 5 },
    ]);
  });

  it('parses a real vibe-profile/1 document', () => {
    const doc = {
      schema: 'vibe-profile/1',
      id: 'adj/test',
      name: 'Test Spot',
      manufacturer: 'ADJ',
      mode: '16 CH',
      fixture_type: 'FIXTURE_TYPE_LED_WHEEL',
      footprint: 15,
      channels: [{ role: 'PAN', offset: 1, default: 127 }],
      color_wheel: [{ value: 0, name: 'Open' }],
      meta: { source: 'gdtf' }, // unknown key must survive (passthrough)
    };
    const parsed = FixtureProfile.parse(doc);
    expect(parsed.name).toBe('Test Spot');
    expect((parsed as Record<string, unknown>).meta).toEqual({ source: 'gdtf' });
  });
});
