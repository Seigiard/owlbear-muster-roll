import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import { err, ok, type Result } from '@/core/result';

// Keeps String.fromCharCode under the engine's argument limit.
const BASE64_CHUNK_BYTES = 0x8000;

export type InflateFailure = 'invalid-data' | 'too-large';

// Text deflated and base64-encoded, as the `preset` record and `state` messages carry it.
export function deflateToBase64(text: string): string {
  return toBase64(deflateSync(strToU8(text)));
}

// `maxBytes` caps the inflated size, so a small message cannot grow to megabytes before a parse.
export function inflateFromBase64(data: string, maxBytes: number): Result<string, InflateFailure> {
  let bytes: Uint8Array;

  try {
    // With a fixed buffer fflate does not grow it, so output past `maxBytes` fills it to the end.
    bytes = inflateSync(fromBase64(data), { out: new Uint8Array(maxBytes + 1) });
  } catch {
    return err('invalid-data');
  }

  if (bytes.length > maxBytes) {
    return err('too-large');
  }

  try {
    return ok(strFromU8(bytes));
  } catch {
    return err('invalid-data');
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_BYTES));
  }

  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}
