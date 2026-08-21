// gunzip.ts — stream-decompress a client gzip-base64 F8 body.
//
// SEC-GZIP-1: never buffer the full output. A ~260KB gzip bomb can expand to
// gigabytes; abort when decompressed bytes pass maxBytes (Worker is 128MB).

/** Thrown when decompressed output would exceed the byte cap. */
export class GunzipCapError extends Error {
  constructor() {
    super("gunzip_too_large");
    this.name = "GunzipCapError";
  }
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode gzip-base64 to UTF-8. Stops reading (and cancels the stream) as soon
 * as decompressed bytes exceed `maxBytes`. Exact cap is allowed.
 */
export async function gunzipBase64Utf8(b64: string, maxBytes: number): Promise<string> {
  const bytes = b64ToBytes(b64);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new GunzipCapError();
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
    try {
      reader.releaseLock();
    } catch {
      /* lock already released */
    }
  }
}
