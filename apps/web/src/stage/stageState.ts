import type { VoxShow } from '@voxcomposer/shared';
import { paramsFromClipData, type PixelParams } from '../pixel/engine.js';
import { effectiveAnimation } from '../pixel/wled.js';

/**
 * Pure "what should the stage look like at time T" resolver — the simulator's
 * equivalent of livePreview's resolveActiveClipStates, but shaped for drawing
 * a virtual stage instead of for the wire. Kept free of canvas and registry
 * imports so it's unit-testable; the jaw envelope comes in via `JawSampler`
 * (the real one reads the decoded-audio peak cache, tests inject a stub).
 */

/** Returns jaw-open 0..1 for a clip at an offset, or null if no audio is decoded. */
export type JawSampler = (clipId: string, offsetMs: number) => number | null;

export interface SkullVisual {
  kind: 'skull';
  deviceId: string;
  name: string;
  /** 0 (closed) .. 1 (fully open). */
  jawOpen: number;
  talking: boolean;
  audioFilename: string | null;
  /** null = no eyes clip active (render dark/idle sockets). */
  eyes: { animation: string; color: string; lookX: number; lookY: number } | null;
  /** Each axis -1..1, 0 = centred. */
  neck: { pan: number; tilt: number; roll: number };
}

export interface PixelVisual {
  kind: 'pixel';
  deviceId: string;
  name: string;
  /** LED count for the drawing (device.pixelCount, or a sensible default). */
  count: number;
  /** Full effect-engine params (see pixel/engine.ts); `params.animation` is
   *  always an engine effect — WLED effects arrive pre-mapped — and `label`
   *  names the real effect (e.g. "WLED · Breathe") for the caption. */
  active: { label: string; params: PixelParams } | null;
}

export interface RelayVisual {
  kind: 'relay';
  deviceId: string;
  name: string;
  /** Always RELAY_CHANNELS entries, channel numbers 1-based. */
  channels: { channel: number; on: boolean }[];
}

export interface DmxVisual {
  kind: 'dmx';
  deviceId: string;
  name: string;
  /** Only channels an active clip is driving, fade already applied. */
  channels: { channel: number; value: number }[];
}

export interface AudioVisual {
  kind: 'audio';
  deviceId: string;
  name: string;
  playing: { filename: string; level: number } | null;
}

export type DeviceVisual = SkullVisual | PixelVisual | RelayVisual | DmxVisual | AudioVisual;

export interface StageState {
  atMs: number;
  visuals: DeviceVisual[];
}

/** VoxRelay hardware has 4 independent relay outputs. */
export const RELAY_CHANNELS = 4;

// --- helpers -----------------------------------------------------------------

function num(data: Record<string, unknown>, key: string, fallback: number): number {
  const v = data[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(data: Record<string, unknown>, key: string, fallback: string): string {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

const active = (atMs: number, c: { startMs: number; durationMs: number }): boolean =>
  atMs >= c.startMs && atMs < c.startMs + c.durationMs;

/** Linear fade-in/out envelope over a clip, 0..1. */
export function fadeEnvelope(
  offsetMs: number,
  durationMs: number,
  fadeInMs: number,
  fadeOutMs: number,
): number {
  let env = 1;
  if (fadeInMs > 0 && offsetMs < fadeInMs) env = Math.min(env, offsetMs / fadeInMs);
  const tail = durationMs - offsetMs;
  if (fadeOutMs > 0 && tail < fadeOutMs) env = Math.min(env, Math.max(0, tail / fadeOutMs));
  return Math.max(0, Math.min(1, env));
}

/**
 * Deterministic synthetic jaw flap for clips with no decoded audio on hand
 * (e.g. a show file whose WAVs weren't imported). Two incommensurate sines
 * make it read as "talking" rather than metronomic.
 */
export function synthJaw(offsetMs: number): number {
  const a = Math.sin(offsetMs * 0.021);
  const b = Math.sin(offsetMs * 0.0127 + 1.7);
  return Math.max(0, Math.min(1, 0.45 + 0.45 * a * b));
}

/** Linearly interpolate a servo keyframe envelope at `offsetMs`, 0..1. */
export function sampleKeyframes(
  keyframes: { timeMs: number; value: number }[],
  offsetMs: number,
): number {
  if (keyframes.length === 0) return 0.5;
  const first = keyframes[0]!;
  if (offsetMs <= first.timeMs) return first.value;
  for (let i = 1; i < keyframes.length; i++) {
    const prev = keyframes[i - 1]!;
    const next = keyframes[i]!;
    if (offsetMs <= next.timeMs) {
      const span = next.timeMs - prev.timeMs;
      const t = span > 0 ? (offsetMs - prev.timeMs) / span : 1;
      return prev.value + (next.value - prev.value) * t;
    }
  }
  return keyframes[keyframes.length - 1]!.value;
}

// --- the resolver --------------------------------------------------------------

export function resolveStageState(
  show: VoxShow,
  atMs: number,
  sampleJaw: JawSampler,
): StageState {
  // One visual per device, seeded idle, then filled in from active clips.
  const skulls = new Map<string, SkullVisual>();
  const pixels = new Map<string, PixelVisual>();
  const relays = new Map<string, RelayVisual>();
  const dmxs = new Map<string, DmxVisual>();
  const audios = new Map<string, AudioVisual>();
  const order: DeviceVisual[] = [];

  for (const d of show.devices) {
    switch (d.type) {
      case 'skull': {
        const v: SkullVisual = {
          kind: 'skull',
          deviceId: d.id,
          name: d.name,
          jawOpen: 0,
          talking: false,
          audioFilename: null,
          eyes: null,
          neck: { pan: 0, tilt: 0, roll: 0 },
        };
        skulls.set(d.id, v);
        order.push(v);
        break;
      }
      case 'pixel': {
        const v: PixelVisual = {
          kind: 'pixel',
          deviceId: d.id,
          name: d.name,
          count: d.pixelCount ?? 12,
          active: null,
        };
        pixels.set(d.id, v);
        order.push(v);
        break;
      }
      case 'relay': {
        const v: RelayVisual = {
          kind: 'relay',
          deviceId: d.id,
          name: d.name,
          channels: Array.from({ length: d.relayCount ?? RELAY_CHANNELS }, (_, i) => ({
            channel: i + 1,
            on: false,
          })),
        };
        relays.set(d.id, v);
        order.push(v);
        break;
      }
      case 'dmx': {
        const v: DmxVisual = { kind: 'dmx', deviceId: d.id, name: d.name, channels: [] };
        dmxs.set(d.id, v);
        order.push(v);
        break;
      }
      case 'audio': {
        const v: AudioVisual = { kind: 'audio', deviceId: d.id, name: d.name, playing: null };
        audios.set(d.id, v);
        order.push(v);
        break;
      }
      default:
        // sense/custom have no stage presence (yet).
        break;
    }
  }

  for (const track of show.tracks) {
    for (const clip of track.clips) {
      if (!active(atMs, clip)) continue;
      const offset = atMs - clip.startMs;
      const data = clip.data as Record<string, unknown>;
      // Audio clips carry their own routing in data.deviceId; everything else
      // routes by the owning track's device.
      const targetId =
        clip.type === 'audio' ? str(data, 'deviceId', track.deviceId) : track.deviceId;

      switch (clip.type) {
        case 'audio': {
          const volume = num(data, 'volume', 1);
          const env =
            fadeEnvelope(offset, clip.durationMs, num(data, 'fadeInMs', 0), num(data, 'fadeOutMs', 0)) *
            Math.max(0, Math.min(1, volume));
          const filename = str(data, 'filename', 'audio');
          const skull = skulls.get(targetId);
          if (skull) {
            skull.talking = true;
            skull.audioFilename = filename;
            if (data.jawSync !== false) {
              const sampled = sampleJaw(clip.id, offset);
              skull.jawOpen = Math.max(skull.jawOpen, (sampled ?? synthJaw(offset)) * env);
            }
          }
          const audio = audios.get(targetId);
          if (audio) audio.playing = { filename, level: env };
          break;
        }
        case 'eyes': {
          const skull = skulls.get(targetId);
          if (skull) {
            skull.eyes = {
              animation: str(data, 'animation', 'idle'),
              color: str(data, 'color', '#AFA9EC'),
              lookX: num(data, 'lookX', 0),
              lookY: num(data, 'lookY', 0),
            };
          }
          break;
        }
        case 'servo':
        case 'neck': {
          const skull = skulls.get(targetId);
          if (!skull) break;
          const keyframes = Array.isArray(data.keyframes)
            ? (data.keyframes as { timeMs: number; value: number }[])
            : [];
          const value = sampleKeyframes(keyframes, offset) * 2 - 1; // 0..1 → -1..1
          const axis = str(data, 'axis', 'pan');
          if (axis === 'tilt') skull.neck.tilt = value;
          else if (axis === 'roll') skull.neck.roll = value;
          else skull.neck.pan = value; // 'pan' and legacy 'default'
          break;
        }
        case 'pixel': {
          const pixel = pixels.get(targetId);
          if (pixel) {
            // One effect source: a set wledFx wins over the basic animation,
            // exactly as the remote treats it (see pixel/wled.ts).
            const params = paramsFromClipData(data);
            const wledFx = typeof data.wledFx === 'number' ? data.wledFx : undefined;
            const eff = effectiveAnimation(params.animation, wledFx);
            // Brightness fade at the clip's ends (matches livePreview).
            const fade = fadeEnvelope(offset, clip.durationMs, num(data, 'fadeInMs', 0), num(data, 'fadeOutMs', 0));
            pixel.active = {
              label: eff.label,
              params: { ...params, animation: eff.animation, brightness: Math.round(params.brightness * fade) },
            };
          }
          break;
        }
        case 'relay': {
          const relay = relays.get(targetId);
          if (!relay) break;
          const channel = Math.max(1, num(data, 'channel', 1));
          const slot = relay.channels.find((c) => c.channel === channel);
          if (!slot) break;
          const action = str(data, 'action', 'pulse');
          if (action === 'on') slot.on = true;
          else if (action === 'off') slot.on = false;
          else slot.on = offset < num(data, 'durationMs', clip.durationMs); // pulse
          break;
        }
        case 'dmx': {
          const dmx = dmxs.get(targetId);
          if (!dmx) break;
          const fadeMs = num(data, 'fadeMs', 0);
          const fade = fadeMs > 0 && offset < fadeMs ? offset / fadeMs : 1;
          const put = (channel: number, target: number) => {
            const value = Math.round(target * fade);
            const existing = dmx.channels.find((c) => c.channel === channel);
            if (existing) existing.value = Math.max(existing.value, value);
            else dmx.channels.push({ channel, value });
          };
          // A compiled fixture look (`levels`) supersedes the single pair.
          const levels = Array.isArray(data.levels)
            ? (data.levels as { channel: number; value: number }[])
            : null;
          if (levels && levels.length > 0) for (const l of levels) put(l.channel, l.value);
          else put(num(data, 'channel', 1), num(data, 'value', 0));
          break;
        }
        default:
          // Plugin clips have no stage visual (their effect happens off-stage).
          break;
      }
    }
  }

  for (const d of dmxs.values()) d.channels.sort((a, b) => a.channel - b.channel);
  return { atMs, visuals: order };
}
