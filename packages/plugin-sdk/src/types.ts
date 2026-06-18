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

  /** Write to the plugin console shown in Developer mode. */
  log(...args: unknown[]): void;
}

/** Context passed when a plugin renders into the inspector. */
export interface InspectorContext {
  /** Commit changed clip payload data back to the show (undoable). */
  onChange: (data: Record<string, unknown>) => void;
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
   * Called for each preview/playback frame while a clip on this plugin's track
   * is active. This is where the plugin fires its side effects (e.g. an HTTP
   * call to a WLED node) via the api.
   */
  onFrame?(timestamp: number, clip: VoxClip, api: VoxPluginAPI): void;

  /** One-line summary drawn on the clip body in the canvas timeline. */
  summarizeClip?(clip: VoxClip): string;

  /** React UI shown in the clip inspector for clips on this plugin's track. */
  renderInspector?(clip: VoxClip, ctx: InspectorContext): ReactNode;
}
