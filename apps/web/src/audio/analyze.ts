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
 * Decode already-read audio bytes. decodeAudioData detaches the buffer it is
 * given, so callers that still need the bytes must pass a copy.
 */
export async function decodeAudioBytes(bytes: ArrayBuffer): Promise<DecodedAudio> {
  const buffer = await audioContext().decodeAudioData(bytes);
  const mono = downmixToMono(buffer);
  return {
    buffer,
    durationMs: buffer.duration * 1000,
    peaks: computePeaks(mono, buffer.sampleRate),
  };
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
