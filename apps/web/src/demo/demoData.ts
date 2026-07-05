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
 * Demo state mirroring the design mockup ("Haunted Hallway 2025"). Only used
 * in demo mode (see isDemoMode) — a real install never sees these devices.
 */
export function makeDemoState(): DemoState {
  // Built-in plugins must be registered before the timeline renders plugin
  // tracks so it can resolve summaries/colours.
  registerBuiltins();
  const now = new Date().toISOString();
  const show: VoxShow = {
    version: VOX_FORMAT_VERSION,
    name: 'Haunted Hallway 2025',
    created: now,
    modified: now,
    duration: 30_000,
    bpm: 120,
    devices: [
      { id: 'MA:STR', name: 'Master', type: 'audio', apiVersion: '1.0.0' },
      { id: 'WLED:1', name: 'Porch Pixels', type: 'pixel', apiVersion: '1.0.0' },
      { id: 'RING:1', name: 'Eye Ring', type: 'pixel', apiVersion: '1.0.0' },
      {
        id: 'SK:01',
        name: 'Skelly 1',
        type: 'skull',
        apiVersion: '1.0.0',
        inventory: ['skelly1_intro.wav', 'skelly1_punchline.wav', 'skelly1_laugh.wav'],
      },
      { id: 'SK:02', name: 'Skelly 2', type: 'skull', apiVersion: '1.0.0' },
      { id: 'DMX:1', name: 'Front lights', type: 'dmx', apiVersion: '1.0.0' },
      { id: 'FOG:1', name: 'Fog machine', type: 'relay', apiVersion: '1.0.0' },
    ],
    tracks: [
      {
        id: 't-ambient',
        deviceId: 'MA:STR',
        type: 'audio',
        label: 'Ambient',
        clips: [
          clip('c-ambient', 0, 26_000, 'audio', {
            filename: 'haunted_atmosphere_loop.wav',
            deviceId: 'MA:STR',
            volume: 0.8,
            jawSync: false,
          }),
        ],
      },
      {
        id: 't-dmx',
        deviceId: 'DMX:1',
        type: 'dmx',
        label: 'DMX Lights',
        clips: [
          clip('c-wash', 1_000, 6_500, 'dmx', { universe: 0, channel: 1, value: 102, fadeMs: 1000 }),
          clip('c-flash', 8_200, 1_400, 'dmx', { universe: 0, channel: 5, value: 255, fadeMs: 0 }),
        ],
      },
      {
        id: 't-skelly1',
        deviceId: 'SK:01',
        type: 'audio',
        label: 'Skelly 1',
        clips: [
          clip('c-skelly1-intro', 1_000, 8_400, 'audio', {
            filename: 'skelly1_intro.wav',
            deviceId: 'SK:01',
            volume: 1,
            jawSync: true,
            jawMode: 'FFT auto',
            neck: { pan: 'wander', tilt: 'wander', roll: 'wander', speed: 'talk+' },
          }),
        ],
      },
      { id: 't-skelly2', deviceId: 'SK:02', type: 'audio', label: 'Skelly 2', clips: [] },
      {
        id: 't-fog',
        deviceId: 'FOG:1',
        type: 'relay',
        label: 'Relay — Fog',
        clips: [clip('c-fog', 600, 900, 'relay', { channel: 1, action: 'pulse', durationMs: 900 })],
      },
      {
        id: 't-wled',
        deviceId: 'WLED:1',
        type: 'pixel',
        label: 'Porch Pixels',
        clips: [
          // wledFx/palette/speed are the Phase-2 fields — the Master relays them
          // verbatim to the VoxPixel remote, which applies them via WLED's own
          // effect engine. No direct device IP involved; routing is by deviceId.
          clip('c-wled-1', 800, 4000, 'pixel', {
            animation: 'glow',
            color: '#FF6A00',
            wledFx: 3,
          }),
          clip('c-wled-2', 8200, 1600, 'pixel', {
            animation: 'flash',
            color: '#FFFFFF',
            wledFx: 7,
          }),
        ],
      },
      {
        id: 't-ring',
        deviceId: 'RING:1',
        type: 'pixel',
        label: 'Eye Ring',
        clips: [
          clip('c-ring-1', 1000, 5000, 'pixel', { animation: 'glow', color: '#1030FF', brightness: 200 }),
          clip('c-ring-2', 8200, 1400, 'pixel', { animation: 'flash', color: '#FF2A2A', brightness: 255 }),
          clip('c-ring-3', 22000, 6000, 'pixel', { animation: 'chase', color: '#39FF14', brightness: 180 }),
        ],
      },
    ],
    metadata: { author: 'Vox Composer', venue: 'Haunted Hallway' },
  };

  return {
    show,
    devices: [
      // prettier-ignore
      { id: 'SK:01', name: 'Skelly 1', type: 'skull', connection: 'online', rssi: -52, apiVersion: '1.0.0', firmware: 'vox-skull 2.4.1', battery: 88, sdUsedMb: 2.1, sdTotalMb: 32, fileCount: 3, supportsFormats: ['wav'], audioSpec: { sampleRate: 44100, bitDepth: 16, channels: 2 } },
      // prettier-ignore
      { id: 'SK:02', name: 'Skelly 2', type: 'skull', connection: 'online', rssi: -58, apiVersion: '1.0.0', firmware: 'vox-skull 2.4.1', battery: 64, sdUsedMb: 1.4, sdTotalMb: 32, fileCount: 2, supportsFormats: ['wav'], audioSpec: { sampleRate: 44100, bitDepth: 16, channels: 2 } },
      // prettier-ignore
      { id: 'SK:03', name: 'Skelly 3', type: 'skull', connection: 'online', rssi: -61, apiVersion: '1.0.0', firmware: 'vox-skull 2.4.0', battery: 41, sdUsedMb: 3.0, sdTotalMb: 32, fileCount: 4, supportsFormats: ['wav'], audioSpec: { sampleRate: 44100, bitDepth: 16, channels: 2 } },
      // prettier-ignore
      { id: 'FOG:1', name: 'Fog machine', type: 'relay', iconHint: 'fog', connection: 'online', rssi: -49, apiVersion: '1.0.0', firmware: 'vox-relay 1.8.2' },
      // prettier-ignore
      { id: 'DMX:1', name: 'Front lights', type: 'dmx', connection: 'offline', apiVersion: '0.9.4', firmware: 'vox-dmx 1.2.0', lastSeen: '2h ago' },
      // prettier-ignore
      { id: 'SEN:1', name: 'Entry sensor', type: 'sense', iconHint: 'motion', connection: 'offline', apiVersion: '1.0.0', firmware: 'vox-sense 1.1.0', battery: 12, lastSeen: 'yesterday' },
    ],
    media: [
      { id: 'm1', filename: 'skelly1_intro.wav', kind: 'voice', format: 'wav', durationMs: 8400, sizeKb: 723, syncedDeviceIds: ['SK:01'] },
      { id: 'm2', filename: 'skelly1_punchline.mp3', kind: 'voice', format: 'mp3', durationMs: 5200, sizeKb: 84, syncedDeviceIds: ['SK:01'] },
      { id: 'm3', filename: 'skelly1_laugh.mp3', kind: 'voice', format: 'mp3', durationMs: 3600, sizeKb: 58, syncedDeviceIds: ['SK:01'] },
      { id: 'm4', filename: 'skelly2_reply.mp3', kind: 'voice', format: 'mp3', durationMs: 7000, sizeKb: 112, syncedDeviceIds: ['SK:02'] },
      { id: 'm5', filename: 'haunted_atmosphere_loop.mp3', kind: 'ambient', format: 'mp3', durationMs: 26000, sizeKb: 412, syncedDeviceIds: ['MA:STR'] },
      { id: 'm6', filename: 'thunder_crack.wav', kind: 'sfx', format: 'wav', durationMs: 2100, sizeKb: 180, syncedDeviceIds: [] },
      { id: 'm7', filename: 'door_creak.ogg', kind: 'sfx', format: 'ogg', durationMs: 1800, sizeKb: 47, syncedDeviceIds: ['SK:03'] },
      { id: 'm8', filename: 'organ_sting.m4a', kind: 'sfx', format: 'm4a', durationMs: 3300, sizeKb: 76, syncedDeviceIds: [] },
    ],
    showFiles: [
      { name: 'Scene_01.vox', active: true },
      { name: 'Scene_02.vox', active: false },
      { name: 'Intro_scare.vox', active: false },
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
