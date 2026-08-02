// assetCache.test.js — Cache-Control policy for ASSETS-binding paths (ASSET-CACHE-1)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assetCacheControlForPath } from "../shared/assetCache.js";

const HASHED = "public, max-age=31536000, immutable";
const FIXED = "public, max-age=3600, stale-while-revalidate=300";

describe("assetCacheControlForPath", () => {
  it("keeps hashed /assets/* one-year immutable", () => {
    expect(assetCacheControlForPath("/assets/index-Ab12CdEf.js")).toBe(HASHED);
    expect(assetCacheControlForPath("/assets/three-Xy9Z0a.css")).toBe(HASHED);
    expect(assetCacheControlForPath("/assets/chunk-abc123.js.map")).toBe(HASHED);
  });

  it("gives /models, /sounds, /draco, /fonts 1h + 5m SWR", () => {
    expect(assetCacheControlForPath("/models/cart.glb")).toBe(FIXED);
    expect(assetCacheControlForPath("/sounds/horn.wav")).toBe(FIXED);
    expect(assetCacheControlForPath("/draco/draco_decoder.wasm")).toBe(FIXED);
    expect(assetCacheControlForPath("/fonts/display.woff2")).toBe(FIXED);
  });

  it("recognizes fixed extensions outside those prefixes", () => {
    expect(assetCacheControlForPath("/favicon.ico")).toBe(FIXED);
    expect(assetCacheControlForPath("/icon.png")).toBe(FIXED);
    expect(assetCacheControlForPath("/site.webmanifest")).toBe(FIXED);
    expect(assetCacheControlForPath("/music.mp3")).toBe(FIXED);
  });

  it("returns null for unrelated routes", () => {
    expect(assetCacheControlForPath("/")).toBeNull();
    expect(assetCacheControlForPath("/parties/main/room")).toBeNull();
    expect(assetCacheControlForPath("/api/analytics")).toBeNull();
    expect(assetCacheControlForPath("/index.html")).toBeNull();
  });

  it("party/index.ts delegates policy selection to the helper", () => {
    const src = readFileSync(new URL("../party/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/assetCacheControlForPath/);
    expect(src).not.toMatch(/max-age=604800/);
  });
});
