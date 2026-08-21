// gunzip.test.js — SEC-GZIP-1 stream abort at the decompressed byte cap.
// The old `new Response(stream).text()` path buffered the full expansion first.

import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { GunzipCapError, gunzipBase64Utf8 } from "../../party/gunzip.ts";

function gzipB64(input) {
  return gzipSync(input).toString("base64");
}

describe("gunzipBase64Utf8", () => {
  it("returns utf-8 under the cap", async () => {
    const json = '{"phase":"running","label":"ok"}';
    expect(await gunzipBase64Utf8(gzipB64(json), 4_000_000)).toBe(json);
  });

  it("allows a payload whose decompressed size equals the cap", async () => {
    const raw = "a".repeat(256);
    expect(await gunzipBase64Utf8(gzipB64(raw), 256)).toBe(raw);
  });

  it("aborts when decompressed bytes exceed the cap", async () => {
    const bomb = Buffer.alloc(12_000_000, 0);
    const b64 = gzipB64(bomb);
    expect(b64.length).toBeLessThan(50_000);
    await expect(gunzipBase64Utf8(b64, 4_000_000)).rejects.toBeInstanceOf(GunzipCapError);
  });

  it("rejects one extra byte over a small cap", async () => {
    await expect(gunzipBase64Utf8(gzipB64("a".repeat(101)), 100)).rejects.toBeInstanceOf(
      GunzipCapError,
    );
  });

  it("rejects corrupt gzip", async () => {
    await expect(gunzipBase64Utf8(btoa("not-gzip"), 4_000_000)).rejects.toThrow();
  });
});
