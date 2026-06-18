import { loadShow, type MigrationResult, type VoxShow } from '@voxcomposer/shared';

/** Serialize a show to pretty-printed, human-readable .vox JSON. */
export function serializeShow(show: VoxShow): string {
  return JSON.stringify(show, null, 2);
}

/** Trigger a browser download of the show as a `<name>.vox` file. */
export function downloadShow(show: VoxShow): void {
  const json = serializeShow(show);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(show.name)}.vox`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
