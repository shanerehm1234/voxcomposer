import { describe, expect, it } from 'vitest';
import { validateManifest } from '../manifest.js';

const valid = {
  id: 'com.wled.integration',
  name: 'WLED',
  version: '1.0.0',
  author: 'rehmlights',
  description: 'Drive WLED nodes',
  trackType: 'wled',
  permissions: ['network', 'devices'],
  color: '#00A2FF',
};

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    const m = validateManifest(valid);
    expect(m.id).toBe('com.wled.integration');
    expect(m.permissions).toContain('network');
  });

  it('defaults permissions to an empty array', () => {
    const m = validateManifest({ ...valid, permissions: undefined });
    expect(m.permissions).toEqual([]);
  });

  it('rejects a non reverse-DNS id', () => {
    expect(() => validateManifest({ ...valid, id: 'wled' })).toThrow();
  });

  it('rejects an unknown permission', () => {
    expect(() => validateManifest({ ...valid, permissions: ['root'] })).toThrow();
  });

  it('rejects a bad colour', () => {
    expect(() => validateManifest({ ...valid, color: 'blue' })).toThrow();
  });
});
