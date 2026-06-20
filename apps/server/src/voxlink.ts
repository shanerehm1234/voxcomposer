import {
  decodeVoxLink,
  encodeVoxLink,
  PreviewFramePayload,
  VOX_EVENTS,
  VOX_LINK_API_VERSION,
  VOX_LINK_WS_PATH,
} from '@voxcomposer/shared';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { MockMaster, type MasterEmit, type VoxMaster } from './master.js';

/**
 * Attach the Vox-Link WebSocket endpoint. This is the SAME raw-WS, JSON
 * `{ event, payload }` protocol the ESP-IDF VoxMaster firmware serves, so the
 * editor connects to either the real Master (by IP) or this mock identically.
 *
 * Each connection gets a Master instance (the mock until hardware is wired).
 */
export function attachVoxLink(
  server: HttpServer,
  makeMaster: () => VoxMaster = () => new MockMaster(),
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: VOX_LINK_WS_PATH });

  wss.on('connection', (ws: WebSocket) => {
    const master = makeMaster();
    const send = (event: string, payload: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(encodeVoxLink(event, payload));
    };
    const emit: MasterEmit = {
      deviceStatus: (p) => send(VOX_EVENTS.deviceStatus, p),
      deviceInventory: (p) => send(VOX_EVENTS.deviceInventory, p),
      previewAck: (p) => send(VOX_EVENTS.previewAck, p),
    };

    // Greet so the editor can confirm it reached a Vox-Link peer + its API version.
    send('hello', { service: 'voxmaster-mock', voxLinkApi: VOX_LINK_API_VERSION });

    ws.on('message', (raw) => {
      const msg = decodeVoxLink(raw.toString());
      if (!msg) return;
      switch (msg.event) {
        case VOX_EVENTS.deviceScan:
          master.scanDevices(emit);
          break;
        case VOX_EVENTS.previewFrame: {
          const parsed = PreviewFramePayload.safeParse(msg.payload);
          if (parsed.success) master.relayPreviewFrame(parsed.data, emit);
          break;
        }
        case VOX_EVENTS.previewStop:
        case VOX_EVENTS.showStop:
          master.stop();
          break;
      }
    });

    ws.on('close', () => master.stop());
  });

  return wss;
}
