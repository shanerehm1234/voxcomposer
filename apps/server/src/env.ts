/** Server configuration, read once from the environment with local defaults. */
export const env = {
  port: Number(process.env.PORT ?? 8080),
  /** Where transcoded WAVs are cached on local disk (keyed by hash + spec). */
  cacheDir: process.env.VOX_CACHE_DIR ?? '.cache/audio',
  /** ffmpeg binary, on PATH by default. */
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  /** Comma-separated allowed CORS origins; '*' in dev. */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /** Optional Vox Master base URL for live preview / sync relay. */
  masterUrl: process.env.VOX_MASTER_URL,
} as const;
