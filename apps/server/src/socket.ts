import {
  PreviewFramePayload,
  VOX_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@voxcomposer/shared';
import type { Server, Socket } from 'socket.io';
import { MockMaster, type MasterEmit, type VoxMaster } from './master.js';

type VoxServer = Server<ClientToServerEvents, ServerToClientEvents>;
type VoxSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Wire the live-preview protocol: the editor sends preview frames + scans, the
 * Master relays to remotes and reports status back. Each connected editor gets
 * a Master instance (the mock for now).
 */
export function attachSocketHandlers(io: VoxServer, makeMaster: () => VoxMaster = () => new MockMaster()): void {
  io.on('connection', (socket: VoxSocket) => {
    const master = makeMaster();
    const emit: MasterEmit = {
      deviceStatus: (p) => socket.emit(VOX_EVENTS.deviceStatus, p),
      deviceInventory: (p) => socket.emit(VOX_EVENTS.deviceInventory, p),
      previewAck: (p) => socket.emit(VOX_EVENTS.previewAck, p),
    };

    socket.on(VOX_EVENTS.deviceScan, () => master.scanDevices(emit));

    socket.on(VOX_EVENTS.previewFrame, (raw) => {
      const parsed = PreviewFramePayload.safeParse(raw);
      if (parsed.success) master.relayPreviewFrame(parsed.data, emit);
    });

    socket.on(VOX_EVENTS.previewStop, () => master.stop());
    socket.on(VOX_EVENTS.showStop, () => master.stop());
    socket.on('disconnect', () => master.stop());
  });
}
