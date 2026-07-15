/**
 * Encode PCM audio into a 16-bit PCM WAV file — the reverse of parseWavPcm
 * (audio/analyze.ts). Used to transcode any decoded source (MP3/OGG/…) into the
 * device-ready WAV the OcularVox boards play, before pushing it to the SD card.
 * See docs/AUDIO_SYNC.md.
 */

/** Encode per-channel Float32 samples (−1..1) as a 16-bit PCM WAV. */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numCh = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * numCh * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // audio format = PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numCh * 2, true); // byte rate
  v.setUint16(32, numCh * 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);

  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = channels[ch]![i]!;
      s = s < -1 ? -1 : s > 1 ? 1 : s; // clamp
      // Asymmetric full-scale mapping (−1→−32768, +1→+32767).
      v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return buf;
}

/**
 * Encode a decoded AudioBuffer to WAV. Pass `mono: true` to average all channels
 * into one — smaller files, and plenty for the OcularVox's jaw FFT + playback.
 */
export function encodeWavFromBuffer(buffer: AudioBuffer, opts: { mono?: boolean } = {}): ArrayBuffer {
  if (opts.mono && buffer.numberOfChannels > 1) {
    const n = buffer.length;
    const mix = new Float32Array(n);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < n; i++) mix[i]! += data[i]! / buffer.numberOfChannels;
    }
    return encodeWav([mix], buffer.sampleRate);
  }
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  return encodeWav(channels, buffer.sampleRate);
}
