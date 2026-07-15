import type { VoxShow } from '@voxcomposer/shared';
import { serializeShow } from '../vox/voxFile.js';
import { bakeShow } from '../plugins/bake.js';

/**
 * Connection config for the Vox Master, persisted in localStorage so the
 * Settings panel, "Test connection", and "Send to Master" all share it.
 * Defaults to the firmware's mDNS name on port 80; use localhost:8080 for the
 * local mock (apps/server).
 */
const HOST_KEY = 'vox.master.host';
const PORT_KEY = 'vox.master.port';

export interface MasterConfig {
  host: string;
  port: string;
}

export function getMasterConfig(): MasterConfig {
  return {
    host: localStorage.getItem(HOST_KEY) || 'voxmaster.local',
    port: localStorage.getItem(PORT_KEY) || '80',
  };
}

export function setMasterConfig(host: string, port: string): void {
  localStorage.setItem(HOST_KEY, host.trim());
  localStorage.setItem(PORT_KEY, String(Number(port) || 80));
}

export function masterHttpBase(c: MasterConfig = getMasterConfig()): string {
  return `http://${c.host}:${c.port}`;
}

export interface SendResult {
  ok: boolean;
  name?: string;
  slug?: string;
  clips?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Upload a show to the Master via its `POST /show` HTTP endpoint (the Master
 * validates + stores it as the active show). Returns the Master's summary.
 * This is the same delivery path the firmware's web UI uses.
 */
export async function sendShowToMaster(show: VoxShow): Promise<SendResult> {
  const url = `${masterHttpBase()}/show`;
  try {
    // Bake plugin clips (Hue/HA) into concrete HTTP actions the Master can
    // replay unattended. Only in the uploaded copy — never the on-disk .vox.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: serializeShow(bakeShow(show)),
    });
    if (!res.ok) return { ok: false, error: `Master returned HTTP ${res.status}` };
    const summary = (await res.json().catch(() => ({}))) as SendResult;
    return { ...summary, ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the Master — check the host in Settings' };
  }
}

/** Trigger playback of the active show on the Master (`POST /play`). */
export async function playOnMaster(): Promise<boolean> {
  try {
    const res = await fetch(`${masterHttpBase()}/play`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Play a sequence of library shows as a playlist (`POST /playlist/play`): the
 * Master sequences through them, looping the whole list if `loop`. `gapMs` is
 * the pause between shows (0 = the Master's current gap).
 */
export async function playPlaylistOnMaster(
  slugs: string[],
  loop = false,
  gapMs = 0,
): Promise<boolean> {
  if (slugs.length === 0) return false;
  try {
    const res = await fetch(`${masterHttpBase()}/playlist/play`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slugs, loop, gapMs }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface LibraryShow {
  slug: string;
  name: string;
  clips: number;
  durationMs: number;
  active: boolean;
}

/** List the shows saved in the Master's library (`GET /shows`) — used to populate the playlist editor. */
export async function listMasterShows(): Promise<LibraryShow[]> {
  try {
    const res = await fetch(`${masterHttpBase()}/shows`);
    if (!res.ok) return [];
    return (await res.json().catch(() => [])) as LibraryShow[];
  } catch {
    return [];
  }
}

/** Make a library show the active one (`POST /activate?slug=`) — Play then runs it. */
export async function activateMasterShow(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${masterHttpBase()}/activate?slug=${encodeURIComponent(slug)}`, {
      method: 'POST',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete a library show from the Master (`DELETE /show?slug=`). */
export async function deleteMasterShow(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${masterHttpBase()}/show?slug=${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Scheduler (vox_schedule on the Master — see VOXMASTER's docs/SCHEDULER.md) ---
// Same shape as the firmware's voxschedule::Schedule::serialize()/parse():
//   { version, playlists: [{name, showSlugs[], loop}],
//     entries: [{id, label, playlist, days[], startSec, endSec, enabled}] }
// `days` are lowercase 3-letter names ("sun".."sat").

export type ScheduleDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface SchedulePlaylist {
  name: string;
  showSlugs: string[];
  loop: boolean;
}

export interface ScheduleEntry {
  id: string;
  label: string;
  playlist: string;
  days: ScheduleDay[];
  startSec: number;
  endSec: number;
  enabled: boolean;
}

export interface VoxSchedule {
  version: string;
  playlists: SchedulePlaylist[];
  entries: ScheduleEntry[];
}

export function emptySchedule(): VoxSchedule {
  return { version: '1.0.0', playlists: [], entries: [] };
}

/** Fetch the schedule currently stored on the Master (`GET /schedule`); an empty schedule if none is stored yet. */
export async function getScheduleFromMaster(): Promise<VoxSchedule> {
  try {
    const res = await fetch(`${masterHttpBase()}/schedule`);
    if (!res.ok) return emptySchedule();
    return (await res.json().catch(() => emptySchedule())) as VoxSchedule;
  } catch {
    return emptySchedule();
  }
}

/** Push a schedule document to the Master (`POST /schedule`); the Master validates it before storing. */
export async function sendScheduleToMaster(
  schedule: VoxSchedule,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${masterHttpBase()}/schedule`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(schedule),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: (body as { error?: string }).error ?? `Master returned HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the Master — check the host in Settings' };
  }
}

/** Clear the schedule stored on the Master (`DELETE /schedule`). */
export async function clearScheduleOnMaster(): Promise<boolean> {
  try {
    const res = await fetch(`${masterHttpBase()}/schedule`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pause/resume the Master's resolver (`POST /schedule/override {"on":bool}`) — "play this now, ignore the schedule." */
export async function setScheduleOverride(on: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${masterHttpBase()}/schedule/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ on }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
