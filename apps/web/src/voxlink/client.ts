import {
  decodeVoxLink,
  encodeVoxLink,
  VOX_EVENTS,
  VOX_LINK_WS_PATH,
  type DeviceStatusPayload,
} from '@voxcomposer/shared';

/** Build the Vox-Link WebSocket URL for a Master at `ip:port`. */
export function masterWsUrl(ip: string, port: number): string {
  return `ws://${ip}:${port}${VOX_LINK_WS_PATH}`;
}

export interface ConnectionResult {
  ok: boolean;
  /** Number of distinct remotes that reported in on the scan. */
  devices: number;
  apiVersion?: string;
  error?: string;
}

/**
 * One-shot connectivity test: open the Vox-Link socket, send `device_scan`, and
 * collect how many remotes respond. Works against the mock Master (apps/server)
 * and the real ESP-IDF firmware — same protocol.
 */
export function testMasterConnection(url: string, gatherMs = 1000): Promise<ConnectionResult> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve({ ok: false, devices: 0, error: 'Invalid address' });
      return;
    }

    const devices = new Set<string>();
    let apiVersion: string | undefined;
    let opened = false;
    let settled = false;

    const finish = (result: ConnectionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    // If we never even connect, fail after a few seconds.
    const failTimer = setTimeout(
      () => finish({ ok: false, devices: 0, error: 'No response — is the Master on?' }),
      4000,
    );

    ws.onopen = () => {
      opened = true;
      ws.send(encodeVoxLink(VOX_EVENTS.deviceScan));
      // Give remotes a moment to report, then call it good.
      setTimeout(() => finish({ ok: true, devices: devices.size, apiVersion }), gatherMs);
    };
    ws.onmessage = (e) => {
      const msg = decodeVoxLink(typeof e.data === 'string' ? e.data : '');
      if (!msg) return;
      if (msg.event === 'hello') {
        apiVersion = (msg.payload as { voxLinkApi?: string })?.voxLinkApi;
      } else if (msg.event === VOX_EVENTS.deviceStatus) {
        const id = (msg.payload as DeviceStatusPayload)?.deviceId;
        if (id) devices.add(id);
      }
    };
    ws.onerror = () => {
      if (!opened) finish({ ok: false, devices: 0, error: "Couldn't reach the Master" });
    };
    ws.onclose = () => {
      if (!opened) finish({ ok: false, devices: 0, error: "Couldn't reach the Master" });
    };
  });
}
