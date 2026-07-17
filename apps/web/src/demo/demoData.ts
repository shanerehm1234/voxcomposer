import type { AudioFormat, VoxDeviceType, VoxShow } from '@voxcomposer/shared';
import { VOX_FORMAT_VERSION } from '@voxcomposer/shared';
import { registerBuiltins } from '../plugins/builtins.js';

/** Runtime connection state for the left device panel (not part of .vox). */
export type DeviceConnection = 'online' | 'connecting' | 'offline';

export interface DemoDevice {
  id: string;
  name: string;
  type: VoxDeviceType;
  connection: DeviceConnection;
  /** Optional icon override (e.g. 'fog', 'motion') when the type icon is too generic. */
  iconHint?: string;
  rssi?: number;
  /** LAN IP as last reported by the Master (VoxPixel/WLED remotes) — enables
   *  the "open this remote's own web UI" affordance. */
  ip?: string;
  /** Carried through from the persisted VoxDevice so editing round-trips. */
  pixelCount?: number;
  relayCount?: number;
  relayLabels?: string[];
  onboard?: string[];
  fixture?: VoxShow['devices'][number]['fixture'];
  /** Vox-Link API/firmware version reported by the remote. */
  apiVersion?: string;
  firmware?: string;
  /** Battery percentage, when the device is battery-powered. */
  battery?: number;
  /** SD card usage, MB. */
  sdUsedMb?: number;
  sdTotalMb?: number;
  fileCount?: number;
  /** Human "last seen" label for offline devices. */
  lastSeen?: string;
  /** Audio formats this device plays natively (audio-capable devices only). */
  supportsFormats?: AudioFormat[];
  /** Playback spec its codec requires (drives WAV transcode at sync time). */
  audioSpec?: { sampleRate: number; bitDepth: number; channels: 1 | 2 };
}

export type MediaKind = 'voice' | 'ambient' | 'sfx';

export interface MediaItem {
  id: string;
  filename: string;
  kind: MediaKind;
  /** Imported source format — shown as a badge so users know what they loaded. */
  format: AudioFormat;
  durationMs: number;
  sizeKb: number;
  /** ids of devices this file is synced to. */
  syncedDeviceIds: string[];
}

export interface DemoState {
  show: VoxShow;
  devices: DemoDevice[];
  media: MediaItem[];
  showFiles: { name: string; active: boolean }[];
  master: { connected: boolean; ip: string };
}

/**
 * Demo mode: the hosted showcase (voxcomposer.app) and `?demo` boot with the
 * sample "Haunted Hallway" show so visitors see a dressed stage. A real
 * install boots empty — every device and file the user sees is real.
 */
export function isDemoMode(): boolean {
  return (
    new URLSearchParams(window.location.search).has('demo') ||
    window.location.hostname.endsWith('voxcomposer.app')
  );
}

/** The clean first-run state a real install boots into. */
export function makeEmptyState(): DemoState {
  registerBuiltins();
  const now = new Date().toISOString();
  return {
    show: {
      version: VOX_FORMAT_VERSION,
      name: 'New Show',
      created: now,
      modified: now,
      duration: 60_000,
      devices: [],
      tracks: [],
      metadata: {},
    },
    devices: [],
    media: [],
    showFiles: [],
    master: { connected: false, ip: 'voxmaster.local' },
  };
}

/**
 * Demo state: a fully-dressed sample show ("Haunted Hallway") so a first-time
 * visitor to voxcomposer.app sees the whole system working — animatronic skulls
 * with synced jaws + glowing eyes, pixel props, DMX, fog, and a smart-home
 * plugin — all on one designed timeline. Only used in demo mode (see
 * isDemoMode); a real install boots empty.
 */
export function makeDemoState(): DemoState {
  // Built-in plugins must be registered before the timeline renders plugin
  // tracks so it can resolve summaries/colours.
  registerBuiltins();
  const now = new Date().toISOString();
  const show: VoxShow = {
    version: VOX_FORMAT_VERSION,
    name: 'Haunted Hallway',
    created: now,
    modified: now,
    duration: 32_000,
    bpm: 120,
    devices: [
      { id: 'MA:STR', name: 'Master', type: 'audio', apiVersion: '1.0.0' },
      { id: 'HUE:1', name: 'Smart Lights', type: 'custom', apiVersion: '1.0.0' },
      {
        id: 'DMX:1',
        name: 'Moving Head',
        type: 'dmx',
        apiVersion: '1.0.0',
        // Patched to a real fixture from the Vibrary — clips program semantic
        // "looks" (pan/tilt/dimmer/colour) that compile to absolute channels.
        fixture: { profileId: 'adj/focus-spot-2x-16-ch', universe: 0, startChannel: 1 },
      },
      { id: 'WLED:1', name: 'Porch Pixels', type: 'pixel', apiVersion: '1.0.0' },
      { id: 'RING:1', name: 'Eye Ring', type: 'pixel', apiVersion: '1.0.0' },
      {
        id: 'SK:01',
        name: 'Skelly 1',
        type: 'skull',
        apiVersion: '1.0.0',
        inventory: ['Dragon', 'Cat', 'skelly1_intro.wav', 'skelly1_laugh.wav'],
      },
      {
        id: 'SK:02',
        name: 'Skelly 2',
        type: 'skull',
        apiVersion: '1.0.0',
        inventory: ['Owl', 'Goat', 'skelly2_reply.wav'],
      },
      { id: 'FOG:1', name: 'Fog Machine', type: 'relay', apiVersion: '1.0.0' },
    ],
    tracks: [
      {
        id: 't-ambient',
        deviceId: 'MA:STR',
        type: 'audio',
        label: 'Ambient',
        clips: [
          clip('c-ambient', 0, 32_000, 'audio', {
            filename: 'haunted_atmosphere_loop.wav',
            deviceId: 'MA:STR',
            volume: 0.7,
            jawSync: false,
          }),
        ],
      },
      {
        id: 't-hue',
        deviceId: 'HUE:1',
        type: 'hue', // Philips Hue plugin (built-in) — routed by deviceId, baked into the .vox
        label: 'Smart Lights',
        clips: [
          clip('c-hue-1', 0, 8_800, 'hue', {
            kind: 'group', groupId: '0', groupName: 'all lights', on: true,
            useColor: true, color: '#5B2A86', bri: 60, transitionMs: 2000,
          }),
          clip('c-hue-2', 9_000, 900, 'hue', {
            kind: 'group', groupId: '0', groupName: 'all lights', on: true,
            useColor: true, color: '#FFFFFF', bri: 254, transitionMs: 0,
          }),
          clip('c-hue-3', 20_000, 10_000, 'hue', {
            kind: 'scene', sceneId: 'spooky', sceneName: 'Blood Moon', on: true,
            useColor: true, color: '#8A0303', bri: 120, transitionMs: 1500,
          }),
        ],
      },
      {
        id: 't-dmx',
        deviceId: 'DMX:1',
        type: 'dmx',
        label: 'Moving Head',
        // Fixture "looks" (role→value), compiled to absolute channels via the
        // ADJ Focus Spot profile (PAN=1, TILT=2, COLOR_WHEEL=3, GOBO=4,
        // SHUTTER=9, DIMMER=10). The Master/remote just apply `levels`.
        clips: [
          clip('c-dmx-wash', 1_500, 6_500, 'dmx', {
            universe: 0, fadeMs: 1500,
            look: { DIMMER: 180, PAN: 60, TILT: 120, COLOR_WHEEL: 20, SHUTTER: 255 },
            levels: [{ channel: 1, value: 60 }, { channel: 2, value: 120 }, { channel: 3, value: 20 }, { channel: 9, value: 255 }, { channel: 10, value: 180 }],
          }),
          clip('c-dmx-strobe', 9_000, 1_200, 'dmx', {
            universe: 0, fadeMs: 0,
            look: { DIMMER: 255, SHUTTER: 90, PAN: 128, TILT: 128 },
            levels: [{ channel: 1, value: 128 }, { channel: 2, value: 128 }, { channel: 9, value: 90 }, { channel: 10, value: 255 }],
          }),
          clip('c-dmx-sweep', 15_000, 8_000, 'dmx', {
            universe: 0, fadeMs: 900,
            look: { DIMMER: 200, PAN: 200, TILT: 80, COLOR_WHEEL: 60, GOBO_WHEEL: 40, SHUTTER: 255 },
            levels: [{ channel: 1, value: 200 }, { channel: 2, value: 80 }, { channel: 3, value: 60 }, { channel: 4, value: 40 }, { channel: 9, value: 255 }, { channel: 10, value: 200 }],
          }),
        ],
      },
      {
        id: 't-wled',
        deviceId: 'WLED:1',
        type: 'pixel',
        label: 'Porch Pixels',
        clips: [
          clip('c-wled-1', 1_000, 7_000, 'pixel', { animation: 'glow', color: '#FF6A00', wledFx: 3 }),
          clip('c-wled-2', 9_000, 1_400, 'pixel', { animation: 'lightning', color: '#FFFFFF', wledFx: 7 }),
          clip('c-wled-3', 22_000, 9_000, 'pixel', { animation: 'chase', color: '#39FF14', wledFx: 28 }),
        ],
      },
      {
        id: 't-ring',
        deviceId: 'RING:1',
        type: 'pixel',
        label: 'Eye Ring',
        clips: [
          clip('c-ring-1', 1_500, 5_000, 'pixel', { animation: 'glow', color: '#1030FF', brightness: 200 }),
          clip('c-ring-2', 9_100, 1_100, 'pixel', { animation: 'flash', color: '#FF2A2A', brightness: 255 }),
          clip('c-ring-3', 16_000, 6_000, 'pixel', { animation: 'twinkle', color: '#8B6DFF', brightness: 170 }),
          clip('c-ring-4', 24_000, 6_000, 'pixel', { animation: 'chase', color: '#39FF14', brightness: 190 }),
        ],
      },
      {
        id: 't-sk1-eyes',
        deviceId: 'SK:01',
        type: 'eyes',
        label: 'Skelly 1 · Eyes',
        clips: [
          clip('c-sk1-eye-1', 2_500, 6_500, 'eyes', { eye: 'Dragon', animation: 'glow', color: '#FF2A2A' }),
          clip('c-sk1-eye-2', 12_000, 4_000, 'eyes', { eye: 'Dragon', animation: 'angry', color: '#FF0000', lookX: 0.4 }),
          clip('c-sk1-eye-3', 20_000, 5_000, 'eyes', { eye: 'Dragon', animation: 'flicker', color: '#FF6A00' }),
        ],
      },
      {
        id: 't-sk1-voice',
        deviceId: 'SK:01',
        type: 'audio',
        label: 'Skelly 1 · Voice',
        clips: [
          clip('c-sk1-v1', 3_000, 8_400, 'audio', {
            filename: 'skelly1_intro.wav', deviceId: 'SK:01', volume: 1, jawSync: true,
            jawMode: 'FFT auto', neck: { pan: 'wander', tilt: 'wander', roll: 'nod', speed: 'talk+' },
          }),
          clip('c-sk1-v2', 20_500, 3_600, 'audio', {
            filename: 'skelly1_laugh.wav', deviceId: 'SK:01', volume: 1, jawSync: true, jawMode: 'FFT auto',
          }),
        ],
      },
      {
        id: 't-sk2-eyes',
        deviceId: 'SK:02',
        type: 'eyes',
        label: 'Skelly 2 · Eyes',
        clips: [
          clip('c-sk2-eye-1', 10_000, 5_500, 'eyes', { eye: 'Owl', animation: 'glow', color: '#30A0FF' }),
          clip('c-sk2-eye-2', 24_000, 5_000, 'eyes', { eye: 'Owl', animation: 'scan', color: '#39FF14' }),
        ],
      },
      {
        id: 't-sk2-voice',
        deviceId: 'SK:02',
        type: 'audio',
        label: 'Skelly 2 · Voice',
        clips: [
          clip('c-sk2-v1', 11_000, 7_000, 'audio', {
            filename: 'skelly2_reply.wav', deviceId: 'SK:02', volume: 1, jawSync: true,
            jawMode: 'FFT auto', neck: { pan: 'wander', tilt: 'still', roll: 'still', speed: 'talk' },
          }),
        ],
      },
      {
        id: 't-fog',
        deviceId: 'FOG:1',
        type: 'relay',
        label: 'Fog',
        clips: [
          clip('c-fog-1', 2_000, 900, 'relay', { channel: 1, action: 'pulse', durationMs: 900 }),
          clip('c-fog-2', 23_500, 1_200, 'relay', { channel: 1, action: 'pulse', durationMs: 1200 }),
        ],
      },
    ],
    metadata: { author: 'Vox Composer', venue: 'Haunted Hallway' },
  };

  return {
    show,
    devices: [
      // prettier-ignore
      { id: 'SK:01', name: 'Skelly 1', type: 'skull', connection: 'online', rssi: -52, apiVersion: '1.0.0', firmware: 'net 1.2.11', battery: 88, sdUsedMb: 2.1, sdTotalMb: 32, fileCount: 4, supportsFormats: ['wav'], audioSpec: { sampleRate: 44100, bitDepth: 16, channels: 2 } },
      // prettier-ignore
      { id: 'SK:02', name: 'Skelly 2', type: 'skull', connection: 'online', rssi: -58, apiVersion: '1.0.0', firmware: 'net 1.2.11', battery: 64, sdUsedMb: 1.4, sdTotalMb: 32, fileCount: 3, supportsFormats: ['wav'], audioSpec: { sampleRate: 44100, bitDepth: 16, channels: 2 } },
      // prettier-ignore
      { id: 'HUE:1', name: 'Smart Lights', type: 'custom', iconHint: 'dmx', connection: 'online', apiVersion: '1.0.0', firmware: 'Hue plugin' },
      // prettier-ignore
      { id: 'WLED:1', name: 'Porch Pixels', type: 'pixel', connection: 'online', rssi: -55, ip: '192.168.1.42', apiVersion: '1.0.0', firmware: 'voxpixel 1.0.0', pixelCount: 60 },
      // prettier-ignore
      { id: 'RING:1', name: 'Eye Ring', type: 'pixel', connection: 'online', rssi: -60, ip: '192.168.1.43', apiVersion: '1.0.0', firmware: 'voxpixel 1.0.0', pixelCount: 24 },
      // prettier-ignore
      { id: 'FOG:1', name: 'Fog Machine', type: 'relay', iconHint: 'fog', connection: 'online', rssi: -49, apiVersion: '1.0.0', firmware: 'voxrelay 1.1.4', relayCount: 2 },
      // prettier-ignore
      { id: 'DMX:1', name: 'Moving Head', type: 'dmx', connection: 'online', rssi: -47, apiVersion: '1.0.0', firmware: 'ADJ Focus Spot 2X', fixture: { profileId: 'adj/focus-spot-2x-16-ch', universe: 0, startChannel: 1 } },
      // prettier-ignore
      { id: 'SEN:1', name: 'Entry Sensor', type: 'sense', iconHint: 'motion', connection: 'offline', apiVersion: '1.0.0', firmware: 'voxsense 1.1.0', battery: 12, lastSeen: 'yesterday' },
    ],
    media: [
      { id: 'm1', filename: 'skelly1_intro.wav', kind: 'voice', format: 'wav', durationMs: 8400, sizeKb: 723, syncedDeviceIds: ['SK:01'] },
      { id: 'm2', filename: 'skelly1_laugh.wav', kind: 'voice', format: 'wav', durationMs: 3600, sizeKb: 310, syncedDeviceIds: ['SK:01'] },
      { id: 'm3', filename: 'skelly2_reply.mp3', kind: 'voice', format: 'mp3', durationMs: 7000, sizeKb: 112, syncedDeviceIds: ['SK:02'] },
      { id: 'm4', filename: 'haunted_atmosphere_loop.mp3', kind: 'ambient', format: 'mp3', durationMs: 32000, sizeKb: 512, syncedDeviceIds: ['MA:STR'] },
      { id: 'm5', filename: 'thunder_crack.wav', kind: 'sfx', format: 'wav', durationMs: 2100, sizeKb: 180, syncedDeviceIds: [] },
      { id: 'm6', filename: 'door_creak.ogg', kind: 'sfx', format: 'ogg', durationMs: 1800, sizeKb: 47, syncedDeviceIds: [] },
      { id: 'm7', filename: 'organ_sting.m4a', kind: 'sfx', format: 'm4a', durationMs: 3300, sizeKb: 76, syncedDeviceIds: [] },
    ],
    showFiles: [
      { name: 'Haunted Hallway.vox', active: true },
      { name: 'Cemetery Gate.vox', active: false },
      { name: 'Jump Scare.vox', active: false },
    ],
    master: { connected: true, ip: 'voxmaster.local' },
  };
}

function clip(
  id: string,
  startMs: number,
  durationMs: number,
  type: string,
  data: Record<string, unknown>,
) {
  return { id, startMs, durationMs, type, data };
}
