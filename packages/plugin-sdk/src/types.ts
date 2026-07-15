import type { VoxClip, VoxDevice, VoxShow } from '@voxcomposer/shared';
import type { ReactNode } from 'react';

/**
 * Permissions a plugin must declare in its manifest and the user approves on
 * install. They gate what the plugin's {@link VoxPluginAPI} is allowed to do.
 */
export type PluginPermission =
  | 'network' // relay UDP/OSC/MQTT/HTTP through the Master
  | 'devices' // read paired device info
  | 'show-read' // read the current show
  | 'show-write' // mutate clips on its own track
  | 'master'; // emit custom events to the Master

export type OscArg = number | string | boolean;

/**
 * A declarative side effect a plugin "bakes" for a clip via
 * {@link VoxPlugin.compileClip}. It is written into the exported .vox so the Vox
 * Master can replay it at cue time with no laptop present — this is what lets a
 * Hue/HA cue fire on a scheduled show running unattended. Keep it plain data:
 * no closures, no plugin code runs on the Master.
 */
export interface BakedHttpAction {
  kind: 'http';
  method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  /** Pre-serialized request body (e.g. JSON.stringify(...)). */
  body?: string;
}

export type BakedAction = BakedHttpAction;

/**
 * Plugin-scoped persistent configuration (bridge IP + key, HA host + token, …).
 * Set up ONCE by the user and stored globally by the host, keyed by plugin id —
 * never per-clip, never re-entered. Values are JSON-serializable.
 */
export type PluginConfig = Record<string, unknown>;

/**
 * Static description of a plugin. Distributed in the bundle and shown in the
 * install/permissions prompt.
 */
export interface VoxPluginManifest {
  /** Reverse-DNS id, e.g. "com.wled.integration". */
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  /**
   * The custom track-type id this plugin registers. Clips whose `type` equals
   * this route to the plugin for summaries, frames and inspector rendering.
   */
  trackType: string;
  /** Permissions required; the user approves these at install time. */
  permissions: PluginPermission[];
  /** Accent colour (hex) for this plugin's track + clips. Optional. */
  color?: string;
}

/**
 * The capability surface handed to a plugin at runtime.
 *
 * IMPORTANT: the browser cannot open raw sockets. `sendUDP`/`sendOSC`/`sendMQTT`
 * are **relay requests to the Vox Master** over the Socket.io connection — they
 * resolve once the Master accepts the request, not when the wire send completes.
 * They are unavailable (reject) unless the plugin holds the `network` permission.
 */
export interface VoxPluginAPI {
  /** Relay a UDP datagram via the Master. Requires `network`. */
  sendUDP(host: string, port: number, data: Uint8Array): Promise<void>;
  /** Relay an OSC message via the Master. Requires `network`. */
  sendOSC(host: string, port: number, address: string, args: OscArg[]): Promise<void>;
  /** Relay an MQTT publish via the Master. Requires `network`. */
  sendMQTT(broker: string, topic: string, payload: string): Promise<void>;
  /**
   * Perform an HTTP request. Runs from the browser when CORS allows; otherwise
   * relayed via the Master. Requires `network`.
   */
  sendHTTP(url: string, init?: RequestInit): Promise<Response>;

  /** The current show document (read-only snapshot). Requires `show-read`. */
  getCurrentShow(): VoxShow;
  /** Look up a paired device by id. Requires `devices`. */
  getDevice(deviceId: string): VoxDevice | undefined;

  /** Emit a custom event to the Master. Requires `master`. */
  emitToMaster(event: string, payload: unknown): void;

  /**
   * This plugin's persisted, global configuration (see {@link PluginConfig}).
   * Returns a snapshot; mutate via {@link setConfig}. No permission required —
   * config is plugin-scoped storage, not a capability.
   */
  getConfig(): PluginConfig;
  /** Merge a patch into this plugin's persisted config and save it. */
  setConfig(patch: PluginConfig): void;

  /** Write to the plugin console shown in Developer mode. */
  log(...args: unknown[]): void;
}

/** Context passed when a plugin renders into the inspector. */
export interface InspectorContext {
  /** Commit changed clip payload data back to the show (undoable). */
  onChange: (data: Record<string, unknown>) => void;
  /** This plugin's persisted global config (read-only snapshot). */
  config: PluginConfig;
  /** The plugin's runtime API — use `sendHTTP` to populate live lists. */
  api: VoxPluginAPI;
}

/**
 * Context for a plugin's one-time setup UI (pairing, tokens). Rendered from the
 * plugin's card in the Device manager, not per clip.
 */
export interface SetupContext {
  /** Current persisted config. */
  config: PluginConfig;
  /** Merge + persist a config patch (e.g. the paired bridge key). */
  save: (patch: PluginConfig) => void;
  /** The plugin's runtime API — use `sendHTTP` to discover/pair/fetch. */
  api: VoxPluginAPI;
}

/**
 * A Vox Composer plugin. Plugins run trusted, in-process: they may return real
 * React from {@link renderInspector}. The timeline itself is a Canvas renderer,
 * so plugins describe their clips for the canvas via {@link summarizeClip}
 * rather than returning React for the clip body.
 */
export interface VoxPlugin extends VoxPluginManifest {
  /** Called once when the plugin is registered. */
  onRegister?(api: VoxPluginAPI): void | Promise<void>;

  /**
   * Called in live preview when a clip on this plugin's track becomes active —
   * ONCE per activation (edge-triggered), not every frame, so an HTTP side
   * effect isn't hammered at frame rate. This is the live-preview path; for a
   * scheduled show running unattended on the Master, {@link compileClip} is used
   * instead (the Master can't run plugin JS). Build both from one helper.
   */
  onFrame?(timestamp: number, clip: VoxClip, api: VoxPluginAPI): void;

  /** One-line summary drawn on the clip body in the canvas timeline. */
  summarizeClip?(clip: VoxClip): string;

  /** React UI shown in the clip inspector for clips on this plugin's track. */
  renderInspector?(clip: VoxClip, ctx: InspectorContext): ReactNode;

  /**
   * React UI for the plugin's one-time setup (bridge pairing, HA token). Shown
   * on the plugin's card in the Device manager. Return `null` for no setup.
   * Whether the plugin still needs setup is reported by {@link isConfigured}.
   */
  renderSetup?(ctx: SetupContext): ReactNode;

  /**
   * Whether the plugin is fully set up given its persisted config. Drives the
   * "needs setup" badge and whether clips can be added. Defaults to always-true
   * when omitted.
   */
  isConfigured?(config: PluginConfig): boolean;

  /**
   * Bake a clip into a plain, serializable {@link BakedAction} to embed in the
   * exported .vox, so the Master can replay it unattended at cue time. Given the
   * plugin's global config so per-clip data need only hold the selection (which
   * room/entity), not the credentials. Return `null` to bake nothing.
   */
  compileClip?(clip: VoxClip, config: PluginConfig): BakedAction | null;
}
