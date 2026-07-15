/** Resolution of the stored waveform peak envelope. */
export const PEAKS_PER_SEC = 120;

let sharedCtx: AudioContext | null = null;

/** A lazily-created, shared AudioContext (decoding + later playback). */
export function audioContext(): AudioContext {
  sharedCtx ??= new AudioContext();
  return sharedCtx;
}

export interface DecodedAudio {
  buffer: AudioBuffer;
  durationMs: number;
  /** Normalised (0..1) peak amplitude envelope at {@link PEAKS_PER_SEC}. */
  peaks: Float32Array;
}

/**
 * Decode a dropped/imported audio File and compute its waveform envelope.
 *
 * NOTE: jaw/mouth movement is NOT computed here — the OcularVox skull boards run
 * their own onboard FFT on the audio. The composer's only audio job is to play
 * the right file on cue; we just need the waveform for the timeline display.
 */
export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  return decodeAudioBytes(await file.arrayBuffer());
}

/**
 * Max time we allow the platform decoder to run before giving up. WebKitGTK's
 * decodeAudioData (used by the Linux desktop build) routes through GStreamer
 * and can HANG — never resolving OR rejecting — when a codec path is missing,
 * which would otherwise leave the import spinner up forever. A hard timeout
 * turns that hang into a normal rejection the import's error path can handle.
 */
const DECODE_TIMEOUT_MS = 8000;

/**
 * Decode already-read audio bytes into a playable buffer + waveform envelope.
 *
 * Fast path: parse PCM/float WAV ourselves (see {@link parseWavPcm}). That's
 * the format the OcularVox boards play, and decoding it directly sidesteps the
 * webview's decodeAudioData entirely — the source of the "Analyzing audio…"
 * hang on the Linux desktop app. Anything else falls back to the platform
 * decoder, guarded by a timeout so it can never wedge the UI again.
 *
 * decodeAudioData detaches the buffer it is given, so callers that still need
 * the bytes must pass a copy.
 */
export async function decodeAudioBytes(bytes: ArrayBuffer): Promise<DecodedAudio> {
  const wav = tryDecodeWav(bytes);
  if (wav) return finishDecoded(wav);

  const buffer = await withTimeout(audioContext().decodeAudioData(bytes), DECODE_TIMEOUT_MS);
  return finishDecoded(buffer);
}

function finishDecoded(buffer: AudioBuffer): DecodedAudio {
  const mono = downmixToMono(buffer);
  return {
    buffer,
    durationMs: buffer.duration * 1000,
    peaks: computePeaks(mono, buffer.sampleRate),
  };
}

/** Reject if `p` hasn't settled within `ms` (see DECODE_TIMEOUT_MS). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`audio decode timed out after ${ms}ms (unsupported codec in this webview?)`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Decode PCM/float WAV bytes into an AudioBuffer without the platform decoder.
 * createBuffer() is a synchronous memory op (no GStreamer), so this can't hang.
 * Returns null if the bytes aren't a WAV we can parse — the caller then falls
 * back to decodeAudioData.
 */
function tryDecodeWav(bytes: ArrayBuffer): AudioBuffer | null {
  const parsed = parseWavPcm(bytes);
  if (!parsed) return null;
  const { channelData, sampleRate } = parsed;
  const buffer = audioContext().createBuffer(channelData.length, channelData[0]!.length, sampleRate);
  for (let ch = 0; ch < channelData.length; ch++) buffer.getChannelData(ch).set(channelData[ch]!);
  return buffer;
}

/**
 * Parse a PCM or IEEE-float WAV into per-channel Float32 samples. Pure (no
 * AudioContext) so it's unit-testable. Supports 8/16/24/32-bit PCM and 32/64-bit
 * float — the formats a haunt's WAVs realistically use. Returns null for a
 * non-WAV or a compressed WAV (e.g. ADPCM), so the caller can fall back.
 */
export function parseWavPcm(
  bytes: ArrayBuffer,
): { channelData: Float32Array[]; sampleRate: number } | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes);
  const tag = (o: number) =>
    String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let fmt: { audioFormat: number; channels: number; sampleRate: number; bits: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;
  // Walk the RIFF chunks (they're word-aligned) to find `fmt ` and `data`.
  let off = 12;
  while (off + 8 <= bytes.byteLength) {
    const id = tag(off);
    const size = view.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = Math.min(size, bytes.byteLength - body);
    }
    off = body + size + (size & 1);
  }
  if (!fmt || dataOffset < 0 || fmt.channels < 1) return null;

  const { audioFormat, channels, sampleRate, bits } = fmt;
  const isFloat = audioFormat === 3;
  const isPcm = audioFormat === 1;
  // 0xFFFE = WAVE_FORMAT_EXTENSIBLE; treat as PCM/float by bit depth below.
  if (!isPcm && !isFloat && audioFormat !== 0xfffe) return null;
  const bytesPerSample = bits >> 3;
  if (bytesPerSample < 1) return null;
  const frameSize = bytesPerSample * channels;
  const frames = Math.floor(dataLength / frameSize);
  if (frames < 1) return null;

  const channelData: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(frames));
  // 0xFFFE (EXTENSIBLE) carries the real format in a SubFormat GUID we don't
  // parse; the overwhelmingly common case is integer PCM, so assume that.
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const p = dataOffset + i * frameSize + ch * bytesPerSample;
      channelData[ch]![i] = readSample(view, p, bits, isFloat);
    }
  }
  return { channelData, sampleRate };
}

/** One sample -> normalised float in [-1, 1). */
function readSample(view: DataView, p: number, bits: number, isFloat: boolean): number {
  if (isFloat) return bits === 64 ? view.getFloat64(p, true) : view.getFloat32(p, true);
  switch (bits) {
    case 8:
      return (view.getUint8(p) - 128) / 128; // 8-bit WAV is unsigned
    case 16:
      return view.getInt16(p, true) / 32768;
    case 24: {
      let v = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getUint8(p + 2) << 16);
      if (v & 0x800000) v -= 0x1000000; // sign-extend 24 -> 32
      return v / 8388608;
    }
    case 32:
      return view.getInt32(p, true) / 2147483648;
    default:
      return 0;
  }
}

/** Average all channels into one Float32Array for analysis. */
function downmixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i]! += data[i]!;
  }
  for (let i = 0; i < length; i++) out[i]! /= channels;
  return out;
}

/** Max-abs amplitude per bucket, normalised so the loudest peak is 1. */
export function computePeaks(samples: Float32Array, sampleRate: number): Float32Array {
  const bucketCount = Math.max(1, Math.ceil((samples.length / sampleRate) * PEAKS_PER_SEC));
  const bucketSize = samples.length / bucketCount;
  const peaks = new Float32Array(bucketCount);
  let max = 0;
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(samples.length, Math.floor((b + 1) * bucketSize));
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]!);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
    if (peak > max) max = peak;
  }
  if (max > 0) for (let b = 0; b < bucketCount; b++) peaks[b]! /= max;
  return peaks;
}
