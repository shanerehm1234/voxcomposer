import {
  FixtureIndex,
  FixtureProfile,
  type FixtureIndexEntry,
} from '@voxcomposer/shared';

/**
 * Client for the Vibrary — the rehmlights fixture-profile library shared with
 * the VIBE controller (240+ GDTF-derived moving heads / washes / spots).
 * Everything fetched is cached in localStorage so browsing works offline
 * after the first load, per the app's offline-first rule.
 */

const BASE_URL = 'https://raw.githubusercontent.com/shanerehm1234/rehmlights-profiles/main';
const INDEX_KEY = 'vox.vibrary.index';
const PROFILE_KEY = (id: string) => `vox.vibrary.profile.${id}`;

let indexMemo: FixtureIndexEntry[] | null = null;
const profileMemo = new Map<string, FixtureProfile>();

function readCache<T>(key: string, parse: (raw: unknown) => T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The fixture list, network-first with cache fallback (and memoised). */
export async function loadFixtureIndex(): Promise<FixtureIndexEntry[]> {
  if (indexMemo) return indexMemo;
  try {
    const res = await fetch(`${BASE_URL}/index.json`);
    if (res.ok) {
      const parsed = FixtureIndex.parse(await res.json());
      indexMemo = parsed.fixtures;
      try {
        localStorage.setItem(INDEX_KEY, JSON.stringify(parsed));
      } catch {
        /* cache full — browsing still works this session */
      }
      return indexMemo;
    }
  } catch {
    /* offline — fall through to cache */
  }
  const cached = readCache(INDEX_KEY, (r) => FixtureIndex.parse(r));
  indexMemo = cached?.fixtures ?? [];
  return indexMemo;
}

/** One full profile by Vibrary id, cache-first (profiles are immutable-ish). */
export async function loadFixtureProfile(id: string): Promise<FixtureProfile | null> {
  const memo = profileMemo.get(id);
  if (memo) return memo;
  const cached = readCache(PROFILE_KEY(id), (r) => FixtureProfile.parse(r));
  if (cached) {
    profileMemo.set(id, cached);
    return cached;
  }
  try {
    const res = await fetch(`${BASE_URL}/sources/${id}.json`);
    if (!res.ok) return null;
    const profile = FixtureProfile.parse(await res.json());
    profileMemo.set(id, profile);
    try {
      localStorage.setItem(PROFILE_KEY(id), JSON.stringify(profile));
    } catch {
      /* cache full */
    }
    return profile;
  } catch {
    return null;
  }
}

/** Import a profile JSON the user picked from disk (offline fallback). */
export function importProfileJson(text: string): FixtureProfile {
  const profile = FixtureProfile.parse(JSON.parse(text));
  profileMemo.set(profile.id, profile);
  try {
    localStorage.setItem(PROFILE_KEY(profile.id), JSON.stringify(profile));
  } catch {
    /* cache full */
  }
  return profile;
}
