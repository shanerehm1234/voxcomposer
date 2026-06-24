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
  /** LAN IP, when the remote reports one (e.g. VoxPixel/WLED) — absent otherwise. */
  ip: z.string().optional(),
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

/**
 * The Vox-Link wire envelope. Every message on the WebSocket between the Vox
 * Composer and the Vox Master is JSON `{ event, payload }`. This is the raw-WS
 * framing the ESP-IDF firmware serves (esp_http_server / httpd_ws); it is NOT
 * Socket.io. The default WebSocket path is `/voxlink`.
 */
export interface VoxLinkMessage {
  event: string;
  payload?: unknown;
}

export const VOX_LINK_WS_PATH = '/voxlink';

export function encodeVoxLink(event: string, payload?: unknown): string {
  return JSON.stringify({ event, payload });
}

/** Parse an incoming Vox-Link frame; returns null if it isn't a valid envelope. */
export function decodeVoxLink(raw: string): VoxLinkMessage | null {
  try {
    const msg = JSON.parse(raw) as VoxLinkMessage;
    return msg && typeof msg.event === 'string' ? msg : null;
  } catch {
    return null;
  }
}
