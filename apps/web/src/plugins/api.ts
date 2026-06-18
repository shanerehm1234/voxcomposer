import type { VoxDevice, VoxShow } from '@voxcomposer/shared';
import type { OscArg, PluginPermission, VoxPlugin, VoxPluginAPI } from '@voxcomposer/plugin-sdk';

/**
 * Transport used to relay a plugin's network requests to the Vox Master over
 * the local Socket.io connection. The browser cannot open raw sockets, so UDP /
 * OSC / MQTT all go through here. Wired to the real socket later; until then a
 * plugin gets a clear "Master not connected" rejection.
 */
export interface MasterRelay {
  udp(host: string, port: number, data: Uint8Array): Promise<void>;
  osc(host: string, port: number, address: string, args: OscArg[]): Promise<void>;
  mqtt(broker: string, topic: string, payload: string): Promise<void>;
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
      // HTTP can go direct from the browser when CORS permits.
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
    log(...args: unknown[]) {
      // eslint-disable-next-line no-console
      console.log(`%c[plugin ${plugin.id}]`, 'color:#AFA9EC', ...args);
    },
  };
}
