import type { VoxDevice, VoxShow } from '@voxcomposer/shared';
import type { OscArg, PluginPermission, VoxPlugin, VoxPluginAPI } from '@voxcomposer/plugin-sdk';
import { getPluginConfig, setPluginConfig } from './config.js';

/**
 * Transport used to relay a plugin's network requests through the Vox Master.
 * The browser cannot open raw sockets or reach no-CORS LAN gear, so UDP / OSC /
 * MQTT / HTTP all go through the Master's `/relay/*` endpoints. When no Master
 * is configured, network methods reject with a clear "Master not connected".
 */
export interface MasterRelay {
  udp(host: string, port: number, data: Uint8Array): Promise<void>;
  osc(host: string, port: number, address: string, args: OscArg[]): Promise<void>;
  mqtt(broker: string, topic: string, payload: string): Promise<void>;
  /**
   * Proxy an HTTP request through the Master (its `POST /relay/http`), for
   * targets the browser can't reach directly (a Hue bridge / Home Assistant send
   * no CORS headers). Returns the upstream Response verbatim.
   */
  http(url: string, init?: RequestInit): Promise<Response>;
  emit(event: string, payload: unknown): void;
}

export interface PluginHostDeps {
  /** Snapshot accessor for the current show. */
  getShow: () => VoxShow;
  /** Optional Master relay; when absent, network methods reject. */
  relay?: MasterRelay;
}

/**
 * Build the {@link VoxPluginAPI} handed to a specific plugin. Each method
 * enforces the permission the plugin declared in its manifest, so a plugin
 * without `network` can't send, one without `show-read` can't read the show, etc.
 */
export function createPluginAPI(plugin: VoxPlugin, deps: PluginHostDeps): VoxPluginAPI {
  const has = (p: PluginPermission) => plugin.permissions.includes(p);
  const require = (p: PluginPermission) => {
    if (!has(p)) throw new Error(`Plugin "${plugin.id}" lacks the "${p}" permission.`);
  };
  const relay = () => {
    if (!deps.relay) throw new Error('Vox Master not connected.');
    return deps.relay;
  };

  return {
    async sendUDP(host, port, data) {
      require('network');
      return relay().udp(host, port, data);
    },
    async sendOSC(host, port, address, args) {
      require('network');
      return relay().osc(host, port, address, args);
    },
    async sendMQTT(broker, topic, payload) {
      require('network');
      return relay().mqtt(broker, topic, payload);
    },
    async sendHTTP(url, init) {
      require('network');
      // http:// targets are usually LAN devices with no CORS headers (a Hue
      // bridge, Home Assistant) — the browser can't reach them, so route through
      // the Master relay when we have one. https targets (e.g. Hue's cloud
      // discovery) send CORS and can't use the http-only relay, so fetch direct.
      if (deps.relay && /^http:\/\//i.test(url)) {
        return deps.relay.http(url, init);
      }
      return fetch(url, init);
    },
    getCurrentShow() {
      require('show-read');
      return deps.getShow();
    },
    getDevice(deviceId: string): VoxDevice | undefined {
      require('devices');
      return deps.getShow().devices.find((d) => d.id === deviceId);
    },
    emitToMaster(event, payload) {
      require('master');
      relay().emit(event, payload);
    },
    getConfig() {
      return getPluginConfig(plugin.id);
    },
    setConfig(patch) {
      setPluginConfig(plugin.id, patch);
    },
    log(...args: unknown[]) {
      console.log(`%c[plugin ${plugin.id}]`, 'color:#AFA9EC', ...args);
    },
  };
}
