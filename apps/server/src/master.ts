import type {
  DeviceInventoryPayload,
  DeviceStatusPayload,
  PreviewAckPayload,
  PreviewFramePayload,
} from '@voxcomposer/shared';

/**
 * A Vox Master station: relays preview frames + commands to remotes over
 * Vox-Link and reports device status back. `emit` sends a server→client event
 * to the connected editor.
 */
export interface VoxMaster {
  scanDevices(emit: MasterEmit): void;
  relayPreviewFrame(frame: PreviewFramePayload, emit: MasterEmit): void;
  stop(): void;
}

export interface MasterEmit {
  deviceStatus(p: DeviceStatusPayload): void;
  deviceInventory(p: DeviceInventoryPayload): void;
  previewAck(p: PreviewAckPayload): void;
}

/**
 * Stand-in Master used until a real device's WebSocket interface is wired. It
 * simulates a small rig responding to scans and preview frames so live preview
 * is demonstrable without hardware. Replace with a RealMaster that connects to
 * env.masterUrl when the firmware interface is known.
 */
export class MockMaster implements VoxMaster {
  private devices = [
    { id: 'SK:01', files: ['skelly1_intro.wav', 'skelly1_punchline.wav'] },
    { id: 'SK:02', files: ['skelly2_reply.wav'] },
    { id: 'SK:03', files: ['door_creak.wav'] },
    { id: 'FOG:1', files: [] as string[] },
    // A VoxPixel Remote (WLED) reports its IP in its HELLO, same as real hardware.
    { id: '68:25:DD:31:F8:3C', files: [] as string[], ip: '192.168.1.224' },
  ];

  scanDevices(emit: MasterEmit): void {
    for (const d of this.devices) {
      emit.deviceStatus({
        deviceId: d.id,
        online: true,
        rssi: -50 - Math.floor(Math.random() * 25),
        ...('ip' in d ? { ip: d.ip } : {}),
      });
      emit.deviceInventory({ deviceId: d.id, files: d.files });
    }
  }

  relayPreviewFrame(frame: PreviewFramePayload, emit: MasterEmit): void {
    // A real Master would forward this over Vox-Link; the mock just acks each
    // addressed device so the editor shows them "responding".
    const seen = new Set<string>();
    for (const state of frame.states) {
      if (seen.has(state.deviceId)) continue;
      seen.add(state.deviceId);
      emit.previewAck({ deviceId: state.deviceId, timestamp: frame.timestamp });
    }
  }

  stop(): void {
    /* nothing to tear down for the mock */
  }
}
