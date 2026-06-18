import { z } from 'zod';

/**
 * Vox-Link live-preview & control protocol carried over the local Socket.io
 * connection to the Vox Master. The wireless transport between Master and
 * remotes is referred to only as "Vox-Link" — never by its radio name.
 */

/** State of a single clip at a given preview frame, relayed to a device. */
export const ClipState = z.object({
  trackId: z.string(),
  deviceId: z.string(),
  clipId: z.string(),
  type: z.string(),
  /** Resolved, type-specific command payload for this instant. */
  data: z.record(z.unknown()),
});
export type ClipState = z.infer<typeof ClipState>;

// --- Client → Server (Master) ------------------------------------------------

export const PreviewFramePayload = z.object({
  timestamp: z.number().nonnegative(),
  states: z.array(ClipState),
});
export type PreviewFramePayload = z.infer<typeof PreviewFramePayload>;

export const ShowStartPayload = z.object({ showId: z.string() });
export type ShowStartPayload = z.infer<typeof ShowStartPayload>;

/** Client → Server event name → payload type. */
export interface ClientToServerEvents {
  preview_frame: (p: PreviewFramePayload) => void;
  preview_stop: (p: Record<string, never>) => void;
  show_start: (p: ShowStartPayload) => void;
  show_stop: (p: Record<string, never>) => void;
  device_scan: (p: Record<string, never>) => void;
}

// --- Server (Master) → Client ------------------------------------------------

export const DeviceStatusPayload = z.object({
  deviceId: z.string(),
  online: z.boolean(),
  /** Received signal strength indicator (dBm), when connected. */
  rssi: z.number(),
});
export type DeviceStatusPayload = z.infer<typeof DeviceStatusPayload>;

export const DeviceInventoryPayload = z.object({
  deviceId: z.string(),
  files: z.array(z.string()),
});
export type DeviceInventoryPayload = z.infer<typeof DeviceInventoryPayload>;

export const PreviewAckPayload = z.object({
  deviceId: z.string(),
  timestamp: z.number(),
});
export type PreviewAckPayload = z.infer<typeof PreviewAckPayload>;

/** Server → Client event name → payload type. */
export interface ServerToClientEvents {
  device_status: (p: DeviceStatusPayload) => void;
  device_inventory: (p: DeviceInventoryPayload) => void;
  preview_ack: (p: PreviewAckPayload) => void;
}

/** String constants for the event names, to avoid stringly-typed call sites. */
export const VOX_EVENTS = {
  previewFrame: 'preview_frame',
  previewStop: 'preview_stop',
  showStart: 'show_start',
  showStop: 'show_stop',
  deviceScan: 'device_scan',
  deviceStatus: 'device_status',
  deviceInventory: 'device_inventory',
  previewAck: 'preview_ack',
} as const;
