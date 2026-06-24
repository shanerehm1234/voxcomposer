import { useEffect, useRef, useState } from 'react';
import { decodeVoxLink, encodeVoxLink, VOX_EVENTS, type DeviceStatusPayload } from '@voxcomposer/shared';
import { masterWsUrl } from './client.js';
import { getMasterConfig } from './master.js';

const RESCAN_MS = 5000;
const RETRY_MS = 3000;

export interface MasterStatus {
  /** Whether the Vox-Link socket to the Master is currently open. */
  connected: boolean;
  /** Latest `device_status` per device ID, as reported by the Master. */
  devices: Map<string, DeviceStatusPayload>;
}

/**
 * Keep a persistent Vox-Link WebSocket open to the Master (config from
 * Settings, see voxlink/master.ts) and track live `device_status` reports —
 * so the sidebar reflects what's actually on the network instead of demo
 * telemetry. Reconnects with a fixed backoff if the Master drops or was never
 * reachable; re-issues `device_scan` periodically since the Master only
 * reports devices it's heard from recently (HELLO-driven liveness).
 */
export function useMasterStatus(): MasterStatus {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Map<string, DeviceStatusPayload>>(new Map());
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let rescanTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      const { host, port } = getMasterConfig();
      try {
        ws = new WebSocket(masterWsUrl(host, Number(port) || 80));
      } catch {
        retryTimer = setTimeout(connect, RETRY_MS);
        return;
      }

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        ws?.send(encodeVoxLink(VOX_EVENTS.deviceScan));
        rescanTimer = setInterval(() => ws?.send(encodeVoxLink(VOX_EVENTS.deviceScan)), RESCAN_MS);
      };
      ws.onmessage = (e) => {
        const msg = decodeVoxLink(typeof e.data === 'string' ? e.data : '');
        if (!msg || msg.event !== VOX_EVENTS.deviceStatus) return;
        const p = msg.payload as DeviceStatusPayload;
        if (!p?.deviceId) return;
        const next = new Map(devicesRef.current);
        next.set(p.deviceId, p);
        setDevices(next);
      };
      const onDown = () => {
        if (cancelled) return;
        setConnected(false);
        clearInterval(rescanTimer);
        retryTimer = setTimeout(connect, RETRY_MS);
      };
      ws.onerror = onDown;
      ws.onclose = onDown;
    };

    connect();
    return () => {
      cancelled = true;
      clearInterval(rescanTimer);
      clearTimeout(retryTimer);
      ws?.close();
    };
    // Reconnects only on mount; Settings changes apply on next reconnect cycle
    // (the retry loop picks up a new getMasterConfig() each attempt anyway).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected, devices };
}
