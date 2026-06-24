import {
  decodeVoxLink,
  encodeVoxLink,
  VOX_EVENTS,
  VOX_LINK_WS_PATH,
  type DeviceStatusPayload,
  type PreviewAckPayload,
} from '@voxcomposer/shared';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachVoxLink } from '../voxlink.js';

describe('Vox-Link raw WebSocket relay (mock Master)', () => {
  let http: HttpServer;
  let url: string;

  beforeEach(async () => {
    http = createServer();
    attachVoxLink(http);
    await new Promise<void>((resolve) => http.listen(0, resolve));
    url = `ws://localhost:${(http.address() as AddressInfo).port}${VOX_LINK_WS_PATH}`;
  });

  afterEach(() => http.close());

  it('greets a new connection with a hello + API version', async () => {
    const ws = new WebSocket(url);
    const hello = await new Promise<Record<string, unknown>>((resolve) => {
      ws.on('message', (raw) => {
        const msg = decodeVoxLink(raw.toString());
        if (msg?.event === 'hello') resolve(msg.payload as Record<string, unknown>);
      });
    });
    expect(hello.voxLinkApi).toBe('1.0.0');
    ws.close();
  });

  it('answers device_scan with device_status for each remote', async () => {
    const ws = new WebSocket(url);
    const statuses = await new Promise<DeviceStatusPayload[]>((resolve) => {
      const got: DeviceStatusPayload[] = [];
      ws.on('message', (raw) => {
        const msg = decodeVoxLink(raw.toString());
        if (msg?.event === VOX_EVENTS.deviceStatus) {
          got.push(msg.payload as DeviceStatusPayload);
          if (got.length === 5) resolve(got);
        }
      });
      ws.on('open', () => ws.send(encodeVoxLink(VOX_EVENTS.deviceScan)));
    });
    expect(statuses.map((s) => s.deviceId).sort()).toEqual([
      '68:25:DD:31:F8:3C',
      'FOG:1',
      'SK:01',
      'SK:02',
      'SK:03',
    ]);
    ws.close();
  });

  it('acks a preview frame for the addressed device', async () => {
    const ws = new WebSocket(url);
    const ack = await new Promise<PreviewAckPayload>((resolve) => {
      ws.on('message', (raw) => {
        const msg = decodeVoxLink(raw.toString());
        if (msg?.event === VOX_EVENTS.previewAck) resolve(msg.payload as PreviewAckPayload);
      });
      ws.on('open', () =>
        ws.send(
          encodeVoxLink(VOX_EVENTS.previewFrame, {
            timestamp: 4321,
            states: [{ trackId: 't', deviceId: 'SK:02', clipId: 'c', type: 'audio', data: {} }],
          }),
        ),
      );
    });
    expect(ack).toEqual({ deviceId: 'SK:02', timestamp: 4321 });
    ws.close();
  });
});
