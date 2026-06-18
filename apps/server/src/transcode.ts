import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from './env.js';

export interface TargetSpec {
  sampleRate: number;
  bitDepth: number;
  channels: 1 | 2;
}

/**
 * Cache filename for a transcode: source content hash + target spec. The same
 * source + spec always maps to the same WAV, so re-syncing an unchanged show
 * never reconverts.
 */
export function cacheKey(sourceHash: string, spec: TargetSpec): string {
  const safe = sourceHash.replace(/[^a-z0-9]/gi, '').slice(0, 40) || 'unknown';
  return `${safe}_${spec.sampleRate}_${spec.bitDepth}_${spec.channels}.wav`;
}

/** PCM codec for a given bit depth (16/24/32-bit little-endian). */
function pcmCodec(bitDepth: number): string {
  if (bitDepth === 24) return 'pcm_s24le';
  if (bitDepth === 32) return 'pcm_s32le';
  return 'pcm_s16le';
}

/**
 * Transcode encoded audio (MP3/OGG/M4A/WAV) to WAV at the target spec, caching
 * the result on local disk. Returns the cached WAV path. Runs ffmpeg as a child
 * process — media never leaves the local network.
 */
export async function transcodeToWav(
  input: Uint8Array,
  sourceHash: string,
  spec: TargetSpec,
): Promise<string> {
  await mkdir(env.cacheDir, { recursive: true });
  const outPath = join(env.cacheDir, cacheKey(sourceHash, spec));
  if (existsSync(outPath)) return outPath; // cache hit

  const inPath = join(tmpdir(), `vox-in-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await writeFile(inPath, input);

  await runFfmpeg([
    '-y',
    '-i', inPath,
    '-ar', String(spec.sampleRate),
    '-ac', String(spec.channels),
    '-c:a', pcmCodec(spec.bitDepth),
    '-f', 'wav',
    outPath,
  ]);

  return outPath;
}

/** Read a previously transcoded WAV back from cache. */
export async function readCached(path: string): Promise<Buffer> {
  return readFile(path);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (err) =>
      reject(new Error(`ffmpeg failed to start (is it installed?): ${err.message}`)),
    );
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`)),
    );
  });
}
