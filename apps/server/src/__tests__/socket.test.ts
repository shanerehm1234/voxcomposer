import type { DeviceStatusPayload, PreviewAckPayload } from '@voxcomposer/shared';
import { VOX_EVENTS } from '@voxcomposer/shared';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachSocketHandlers } from '../socket.js';

describe('live-preview socket relay (mock Master)', () => {
  let http: HttpServer;
  let io: Server;
  let client: ClientSocket;
  let url: string;

  beforeEach(async () => {
    http = createServer();
    io = new Server(http);
    attachSocketHandlers(io);
    await new Promise<void>((resolve) => http.listen(0, resolve));
    const port = (http.address() as AddressInfo).port;
    url = `http://localhost:${port}`;
  });

  afterEach(() => {
    client?.close();
    io.close();
    http.close();
  });

  it('responds to a device scan with device_status for each remote', async () => {
    client = createClient(url, { transports: ['websocket'] });
    const statuses = await new Promise<DeviceStatusPayload[]>((resolve) => {
      const got: DeviceStatusPayload[] = [];
      client.on(VOX_EVENTS.deviceStatus, (p: DeviceStatusPayload) => {
        got.push(p);
        if (got.length === 4) resolve(got);
      });
      client.on('connect', () => client.emit(VOX_EVENTS.deviceScan, {}));
    });
    expect(statuses.map((s) => s.deviceId).sort()).toEqual(['FOG:1', 'SK:01', 'SK:02', 'SK:03']);
    expect(statuses.every((s) => s.online)).toBe(true);
  });

  it('acks a preview frame for each addressed device', async () => {
    client = createClient(url, { transports: ['websocket'] });
    const ack = await new Promise<PreviewAckPayload>((resolve) => {
      client.on(VOX_EVENTS.previewAck, (p: PreviewAckPayload) => resolve(p));
      client.on('connect', () =>
        client.emit(VOX_EVENTS.previewFrame, {
          timestamp: 1234,
          states: [{ trackId: 't', deviceId: 'SK:01', clipId: 'c', type: 'audio', data: {} }],
        }),
      );
    });
    expect(ack).toEqual({ deviceId: 'SK:01', timestamp: 1234 });
  });
});
