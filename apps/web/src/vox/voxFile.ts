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
