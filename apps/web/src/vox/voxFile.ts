import { loadShow, type MigrationResult, type VoxShow } from '@voxcomposer/shared';
import { getAsset } from '../audio/registry.js';
import { createZip, type ZipEntry } from './zip.js';

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

function safeName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 64) || 'show'
  );
}
