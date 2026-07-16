import { masterHttpBase } from '../voxlink/master.js';
import type { MasterRelay } from './api.js';
import { encodeOsc } from './osc.js';

/**
 * The concrete {@link MasterRelay} backed by the configured Vox Master. The
 * browser can't open raw sockets or reach no-CORS LAN gear, so each transport
 * goes through a Master endpoint:
 *   - `http`  → `POST /relay/http` (transparent proxy; Hue bridge / Home Assistant)
 *   - `udp`   → `POST /relay/udp`  (Art-Net, WLED realtime, raw datagrams)
 *   - `osc`   → encoded here, sent over the UDP relay (OSC is OSC-over-UDP)
 *   - `mqtt`  → `POST /relay/mqtt` (Master does a one-shot QoS-0 publish)
 */
export function makeMasterRelay(): MasterRelay {
  const udp: MasterRelay['udp'] = async (host, port, data) => {
    // The Master sends the datagram for us. Payload is base64 so it's binary-safe.
    let bin = '';
    for (const b of data) bin += String.fromCharCode(b);
    const res = await fetch(`${masterHttpBase()}/relay/udp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, data: btoa(bin) }),
    });
    if (!res.ok) throw new Error(`UDP relay failed: HTTP ${res.status}`);
  };

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
    udp,
    // OSC is just an OSC-encoded UDP datagram — build it and reuse the UDP relay.
    async osc(host, port, address, args) {
      await udp(host, port, encodeOsc(address, args));
    },
    // MQTT is a stateful TCP protocol the browser can't speak; the Master does a
    // transient connect → publish (QoS 0) → disconnect. `broker` is host or
    // host:port (default 1883); optional user:pass may prefix it (user:pass@host).
    async mqtt(broker, topic, payload) {
      const res = await fetch(`${masterHttpBase()}/relay/mqtt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker, topic, payload }),
      });
      if (!res.ok) {
        const info = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(info.error ?? `MQTT relay failed: HTTP ${res.status}`);
      }
    },
    emit: () => {
      /* no-op until the Master event channel is wired */
    },
  };
}
