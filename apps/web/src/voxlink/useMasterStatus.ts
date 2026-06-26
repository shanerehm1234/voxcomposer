import { useEffect, useRef, useState } from 'react';
import { decodeVoxLink, encodeVoxLink, VOX_EVENTS, type DeviceStatusPayload } from '@voxcomposer/shared';
import { masterWsUrl } from './client.js';
import { getMasterConfig, masterHttpBase } from './master.js';

/** How often to ping the Master for liveness + re-scan its device list. */
const HEARTBEAT_MS = 4000;
/** Give up on a single liveness ping after this long (caps detection latency). */
const PROBE_TIMEOUT_MS = 3500;

export interface MasterStatus {
  /** Whether the Master is currently reachable (active heartbeat, see below). */
  connected: boolean;
  /** Latest `device_status` per device ID, as reported by the Master. */
  devices: Map<string, DeviceStatusPayload>;
}

/**
 * Liveness probe: a no-cors GET to the Master's /status. We can't *read* the
 * response cross-origin (no CORS needed for this — that's the point), but the
 * fetch RESOLVING means the Master answered and REJECTING (network error /
 * timeout / abort) means it didn't. That's all we need for a heartbeat, and
 * unlike the WebSocket's own open/close events it works regardless of how many
 * remotes are attached and — critically — detects a yanked-power Master in
 * seconds instead of waiting minutes for a TCP timeout on a socket the browser
 * still believes is open.
 */
async function masterIsAlive(httpBase: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${httpBase}/status`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Track whether the Master is reachable and what remotes it reports. Drives
 * `connected` from the active heartbeat above (NOT the WebSocket's open state,
 * which lies after a hard disconnect). The WebSocket is kept open only to read
 * live `device_status` frames; when the heartbeat says the Master is gone, the
 * socket is torn down and the device list cleared so the sidebar stops showing
 * stale "online" devices.
 */
export function useMasterStatus(): MasterStatus {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Map<string, DeviceStatusPayload>>(new Map());
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

    const openWs = () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      const { host, port } = getMasterConfig();
      try {
        ws = new WebSocket(masterWsUrl(host, Number(port) || 80));
      } catch {
        ws = null;
        return;
      }
      ws.onopen = () => ws?.send(encodeVoxLink(VOX_EVENTS.deviceScan));
      ws.onmessage = (e) => {
        const msg = decodeVoxLink(typeof e.data === 'string' ? e.data : '');
        if (!msg || msg.event !== VOX_EVENTS.deviceStatus) return;
        const p = msg.payload as DeviceStatusPayload;
        if (!p?.deviceId) return;
        const next = new Map(devicesRef.current);
        next.set(p.deviceId, p);
        setDevices(next);
      };
      // onerror/onclose are intentionally unhandled — the heartbeat is the
      // source of truth for connectivity, and it'll reopen the socket on the
      // next tick if the Master is still there.
    };

    const closeWs = () => {
      if (!ws) return;
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      ws = null;
    };

    const tick = async () => {
      if (cancelled) return;
      const alive = await masterIsAlive(masterHttpBase(getMasterConfig()));
      if (cancelled) return;
      if (alive) {
        setConnected(true);
        openWs();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(encodeVoxLink(VOX_EVENTS.deviceScan));
        }
      } else {
        setConnected(false);
        setDevices(new Map());
        closeWs();
      }
    };

    void tick();
    timer = setInterval(() => void tick(), HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      closeWs();
    };
    // Mount-only; Settings changes are picked up on the next tick since
    // getMasterConfig() is re-read each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected, devices };
}
