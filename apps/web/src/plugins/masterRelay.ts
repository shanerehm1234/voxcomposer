import { masterHttpBase } from '../voxlink/master.js';
import type { MasterRelay } from './api.js';

/**
 * The concrete {@link MasterRelay} backed by the configured Vox Master. Its
 * `http` proxies to the Master's `POST /relay/http`, which performs the request
 * on the LAN and streams the upstream response back verbatim — so a plugin
 * reaching a Hue bridge / Home Assistant works despite the browser's CORS wall.
 *
 * UDP/OSC/MQTT relays aren't wired yet (no plugin needs them today); they reject
 * with a clear message rather than pretending to send.
 */
export function makeMasterRelay(): MasterRelay {
  return {
    async http(url, init) {
      const headers: Record<string, string> = {};
      if (init?.headers) new Headers(init.headers).forEach((v, k) => (headers[k] = v));
      const body =
        typeof init?.body === 'string' ? init.body : init?.body != null ? String(init.body) : undefined;
      const spec = {
        method: (init?.method ?? 'GET').toUpperCase(),
        url,
        headers,
        ...(body != null ? { body } : {}),
      };
      return fetch(`${masterHttpBase()}/relay/http`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      });
    },
    udp: () => Promise.reject(new Error('UDP relay not available yet')),
    osc: () => Promise.reject(new Error('OSC relay not available yet')),
    mqtt: () => Promise.reject(new Error('MQTT relay not available yet')),
    emit: () => {
      /* no-op until the Master event channel is wired */
    },
  };
}
