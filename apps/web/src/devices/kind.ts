import type { VoxDeviceType } from '@voxcomposer/shared';

/**
 * Map a remote's self-reported hardware `kind` (from its Vox-Link HELLO,
 * relayed by the Master) to the Composer's device type and a friendly
 * default name. Remotes with older firmware send no kind — fall back to the
 * historic "has an IP → probably a VoxPixel" guess rather than mislabelling.
 */

const KNOWN_TYPES: VoxDeviceType[] = ['skull', 'dmx', 'relay', 'sense', 'audio', 'pixel', 'custom'];

export function kindToType(kind: string | undefined, ip: string | undefined): VoxDeviceType {
  if (kind && (KNOWN_TYPES as string[]).includes(kind)) return kind as VoxDeviceType;
  return ip ? 'pixel' : 'custom';
}

const KIND_LABEL: Record<string, string> = {
  relay: 'VoxRelay',
  pixel: 'VoxPixel',
  skull: 'OcularVox',
  dmx: 'VoxDMX',
  audio: 'VoxAudio',
  sense: 'VoxSense',
};

/** Product label for a kind, e.g. "VoxRelay"; generic for unknowns. */
export function kindLabel(kind: string | undefined, ip: string | undefined): string {
  if (kind && KIND_LABEL[kind]) return KIND_LABEL[kind];
  return ip ? 'VoxPixel' : 'Vox-Link remote';
}

/** Friendly default device name, e.g. "VoxRelay 65:10". */
export function defaultDeviceName(d: { deviceId: string; ip?: string; kind?: string }): string {
  const suffix = d.deviceId.split(':').slice(-2).join(':');
  return `${kindLabel(d.kind, d.ip)} ${suffix}`;
}
