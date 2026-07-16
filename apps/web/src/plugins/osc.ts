import type { OscArg } from '@voxcomposer/plugin-sdk';

/**
 * Encode an OSC 1.0 message. OSC rides on UDP, so a plugin's `sendOSC` just
 * builds the packet here and hands the bytes to the existing UDP relay — no
 * separate Master endpoint needed.
 *
 * Supported arg types (matching OscArg = number | string | boolean):
 *   integer number → int32 'i', non-integer number → float32 'f',
 *   string → 's', boolean → 'T'/'F' (tag only, no data bytes).
 * Everything is big-endian and 4-byte aligned per the spec.
 */
export function encodeOsc(address: string, args: OscArg[]): Uint8Array {
  const parts: Uint8Array[] = [oscString(address)];

  let tags = ',';
  const data: Uint8Array[] = [];
  for (const arg of args) {
    if (typeof arg === 'boolean') {
      tags += arg ? 'T' : 'F'; // boolean tags carry no data
    } else if (typeof arg === 'string') {
      tags += 's';
      data.push(oscString(arg));
    } else if (Number.isInteger(arg)) {
      tags += 'i';
      data.push(oscInt32(arg));
    } else {
      tags += 'f';
      data.push(oscFloat32(arg));
    }
  }
  parts.push(oscString(tags), ...data);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** OSC-string: UTF-8 bytes, at least one NUL terminator, padded to 4 bytes. */
function oscString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const len = pad4(bytes.length + 1); // +1 guarantees a terminating NUL
  const out = new Uint8Array(len);
  out.set(bytes, 0);
  return out;
}

function oscInt32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n | 0, false); // big-endian
  return b;
}

function oscFloat32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, n, false);
  return b;
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}
