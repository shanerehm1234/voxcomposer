import { loadShow, type MigrationResult, type VoxShow } from '@voxcomposer/shared';
import { getAsset } from '../audio/registry.js';
import { createZip, readZip, type ZipEntry } from './zip.js';

/** Serialize a show to pretty-printed, human-readable .vox JSON. */
export function serializeShow(show: VoxShow): string {
  return JSON.stringify(show, null, 2);
}

/** Trigger a browser download of the show as a `<name>.vox` file. */
export function downloadShow(show: VoxShow): void {
  const blob = new Blob([serializeShow(show)], { type: 'application/json' });
  triggerDownload(blob, `${safeName(show.name)}.vox`);
}

export interface SaveResult {
  /** Where the save actually went. 'dialog' = user chose a folder (desktop
   *  shell or the browser File System Access picker); 'download' = fell back to
   *  a plain download into the browser's default folder. */
  method: 'dialog' | 'download';
  /** True if the user dismissed the save dialog (nothing was written). */
  cancelled?: boolean;
  /** The chosen path/filename, when the platform reveals it. */
  path?: string;
}

/**
 * Save the show as a `.vox`, preferring a real "choose a folder" dialog over a
 * silent download. Three tiers, in order:
 *  1. Desktop shell: POST to the `/__save` asset-server route, which raises a
 *     native OS "Save As" dialog and writes the file (see apps/desktop main.rs).
 *  2. Browser with the File System Access API (Chrome/Edge): `showSaveFilePicker`.
 *  3. Anything else: a plain download into the default folder (prior behavior).
 * The desktop route replies with a distinctive JSON envelope so we can tell it
 * apart from a dev server's 404 / index.html fallback and degrade correctly.
 */
export async function saveShow(show: VoxShow): Promise<SaveResult> {
  const filename = `${safeName(show.name)}.vox`;
  const data = serializeShow(show);

  // 1. Desktop shell native dialog.
  try {
    const res = await fetch(`/__save?name=${encodeURIComponent(filename)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: data,
    });
    const env = (await res.json().catch(() => null)) as
      | { saved?: boolean; cancelled?: boolean; path?: string }
      | null;
    if (env && env.saved) return { method: 'dialog', path: env.path };
    if (env && env.cancelled) return { method: 'dialog', cancelled: true };
    // No recognizable envelope => not the desktop shell; fall through.
  } catch {
    // Route unreachable => not the desktop shell; fall through.
  }

  // 2. Browser File System Access API.
  const showSaveFilePicker = (
    window as unknown as {
      showSaveFilePicker?: (opts: unknown) => Promise<{
        name: string;
        createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
      }>;
    }
  ).showSaveFilePicker;
  if (typeof showSaveFilePicker === 'function') {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Vox show', accept: { 'application/json': ['.vox'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return { method: 'dialog', path: handle.name };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { method: 'dialog', cancelled: true };
      }
      // Other errors: fall through to a plain download.
    }
  }

  // 3. Plain download.
  downloadShow(show);
  return { method: 'download' };
}

/** Trigger a browser download of an arbitrary blob. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download a full show package: a `.zip` containing the `.vox` JSON plus every
 * referenced audio file (pulled from the in-memory registry). Lets a user share
 * a complete show, audio and all. Returns the number of audio files included.
 */
export async function downloadShowPackage(show: VoxShow): Promise<number> {
  const entries: ZipEntry[] = [
    { name: `${safeName(show.name)}.vox`, data: new TextEncoder().encode(serializeShow(show)) },
  ];

  const added = new Set<string>();
  for (const track of show.tracks) {
    if (track.type !== 'audio') continue;
    for (const clip of track.clips) {
      const asset = getAsset(clip.id);
      if (!asset || added.has(asset.filename)) continue;
      added.add(asset.filename);
      entries.push({
        name: `audio/${asset.filename}`,
        data: new Uint8Array(await asset.blob.arrayBuffer()),
      });
    }
  }

  const blob = createZip(entries);
  triggerDownload(blob, `${safeName(show.name)}.zip`);
  return added.size;
}

/**
 * Parse a dropped/opened .vox File, validating and auto-migrating it through
 * the shared {@link loadShow} pipeline. Throws on malformed input.
 */
export async function readShowFile(file: File): Promise<MigrationResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  return loadShow(parsed);
}

export interface ShowPackage {
  result: MigrationResult;
  /** Audio files bundled alongside the show, keyed by filename. */
  audio: { filename: string; blob: Blob }[];
}

/**
 * Read a show package `.zip` (as written by {@link downloadShowPackage}): the
 * `.vox` JSON plus its `audio/` files. Validates + migrates the show via
 * {@link loadShow}. Throws on a malformed archive or missing show.
 */
export async function readShowPackage(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<ShowPackage> {
  const entries = await readZip(input);
  const voxEntry = entries.find((e) => e.name.toLowerCase().endsWith('.vox'));
  if (!voxEntry) throw new Error('No .vox show found in package.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(voxEntry.data));
  } catch {
    throw new Error('The package contains an invalid .vox file.');
  }
  const result = loadShow(parsed);

  const audio = entries
    .filter((e) => e.name.startsWith('audio/') && !e.name.endsWith('/'))
    .map((e) => ({
      filename: e.name.slice('audio/'.length),
      blob: new Blob([e.data as BlobPart]),
    }));

  return { result, audio };
}

/** True if a file looks like a show package (zip) rather than a bare .vox. */
export function isShowPackage(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
}

/** Parse already-read .vox bytes (JSON), validating + migrating via loadShow. */
export function parseShowBytes(bytes: ArrayBuffer): MigrationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Not a valid .vox file (expected JSON).');
  }
  return loadShow(parsed);
}

/** Detect a zip by its local-file-header magic ("PK\x03\x04"). */
export function looksLikeZip(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

function safeName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 64) || 'show'
  );
}
