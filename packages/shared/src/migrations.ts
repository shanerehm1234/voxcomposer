import { VOX_FORMAT_VERSION } from './vox/primitives.js';
import { VoxShow } from './vox/show.js';

/**
 * A migration upgrades a show document from one format version to the next.
 * `from`/`to` are exact semver strings; the runner chains them in order.
 * Migrations operate on loosely-typed JSON because the input predates the
 * current schema — only the final result is validated against {@link VoxShow}.
 */
export interface VoxMigration {
  from: string;
  to: string;
  describe: string;
  migrate: (doc: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered chain of migrations. Append new entries here when the format version
 * bumps; never edit a released migration in place.
 *
 * Example (left as a template — no migrations needed yet at 1.0.0):
 *   { from: '1.0.0', to: '1.1.0', describe: 'add per-clip mute flag',
 *     migrate: (d) => ({ ...d, version: '1.1.0' }) }
 */
export const MIGRATIONS: readonly VoxMigration[] = [];

export interface MigrationResult {
  show: VoxShow;
  /** True when one or more migrations were applied. */
  migrated: boolean;
  fromVersion: string;
  toVersion: string;
  /** Human-readable descriptions of each migration applied, in order. */
  applied: string[];
}

/**
 * Validate and, if necessary, upgrade a raw parsed `.vox` document to the
 * current format version. Throws if the document is structurally invalid after
 * migration. Surfaces what changed so the UI can show "Updated v1.0 → v1.1".
 */
export function loadShow(raw: unknown): MigrationResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Not a .vox document: expected a JSON object.');
  }
  let doc = { ...(raw as Record<string, unknown>) };
  const fromVersion = typeof doc.version === 'string' ? doc.version : 'unknown';
  const applied: string[] = [];

  // Apply any migration whose `from` matches the document's current version,
  // chaining until no further migration applies.
  let progressed = true;
  while (progressed) {
    progressed = false;
    const current = doc.version;
    for (const m of MIGRATIONS) {
      if (m.from === current) {
        doc = m.migrate(doc);
        doc.version = m.to;
        applied.push(`${m.from} → ${m.to}: ${m.describe}`);
        progressed = true;
        break;
      }
    }
  }

  const show = VoxShow.parse(doc);
  return {
    show,
    migrated: applied.length > 0,
    fromVersion,
    toVersion: show.version,
    applied,
  };
}

export { VOX_FORMAT_VERSION };
