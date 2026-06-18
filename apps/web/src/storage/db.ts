import type { VoxShow } from '@voxcomposer/shared';

/**
 * Tiny dependency-free IndexedDB wrapper for local persistence. Keeps the
 * current show and any imported audio blobs on-device so work survives a
 * reload — and reinforces the "media stays local, never on the server" rule.
 */

const DB_NAME = 'voxcomposer';
const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_AUDIO = 'audio';
const SHOW_KEY = 'currentShow';

export interface StoredAudio {
  clipId: string;
  filename: string;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_AUDIO)) db.createObjectStore(STORE_AUDIO);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveShow(show: VoxShow): Promise<void> {
  await tx(STORE_META, 'readwrite', (s) => s.put(show, SHOW_KEY));
}

export async function loadShowFromDb(): Promise<VoxShow | null> {
  try {
    const show = await tx<VoxShow | undefined>(STORE_META, 'readonly', (s) => s.get(SHOW_KEY));
    return show ?? null;
  } catch {
    return null;
  }
}

export async function saveAudioBlob(clipId: string, filename: string, blob: Blob): Promise<void> {
  await tx(STORE_AUDIO, 'readwrite', (s) => s.put({ clipId, filename, blob }, clipId));
}

export async function loadAllAudio(): Promise<StoredAudio[]> {
  try {
    return await tx<StoredAudio[]>(STORE_AUDIO, 'readonly', (s) => s.getAll());
  } catch {
    return [];
  }
}

/** Wipe all persisted state (used by the "reset demo" action). */
export async function clearAll(): Promise<void> {
  await tx(STORE_META, 'readwrite', (s) => s.clear());
  await tx(STORE_AUDIO, 'readwrite', (s) => s.clear());
}
