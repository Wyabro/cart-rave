// @vitest-environment node
//
// CHUNK-DEFER-1 L6 — eager menu graph must not static-import deferred cold targets
// (netcode / cartRaveGltf). One static edge re-eager them into modulepreload.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

/** @param {string} rel */
function readSrc(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

/** Static import line of netcode.js (not netcode/load, not comments). */
const STATIC_NETCODE_IMPORT =
  /^\s*import\b[^;]*from\s+["'](?:\.\.\/)*netcode\.js["']/m;

/** Static import of cartRaveGltf.js */
const STATIC_GLTF_IMPORT =
  /^\s*import\b[^;]*from\s+["'](?:\.\.\/)*cartRaveGltf\.js["']/m;

const EAGER_MUST_NOT_STATIC_NETCODE = [
  "src/main.js",
  "src/bootstrap.js",
  "src/orchestration/gameSession.js",
  "src/orchestration/menuPlayEntry.js",
  "src/orchestration/cartIdentity.js",
  "src/ui/cart-rave-menu.js",
  "src/ui/menuCartShowcase.js",
];

const EAGER_MUST_NOT_STATIC_GLTF = [
  "src/main.js",
  "src/bootstrap.js",
  "src/ui/cart-rave-menu.js",
  "src/ui/menuCartShowcase.js",
];

describe("CHUNK-DEFER-1 L6 import edges (source)", () => {
  it("eager menu files do not static-import netcode.js", () => {
    for (const rel of EAGER_MUST_NOT_STATIC_NETCODE) {
      const src = readSrc(rel);
      expect(src, rel).not.toMatch(STATIC_NETCODE_IMPORT);
    }
  });

  it("eager menu files do not static-import cartRaveGltf.js", () => {
    for (const rel of EAGER_MUST_NOT_STATIC_GLTF) {
      const src = readSrc(rel);
      expect(src, rel).not.toMatch(STATIC_GLTF_IMPORT);
    }
  });

  it("netcode load latch exists and dynamic-imports netcode", () => {
    const rel = "src/netcode/load.js";
    expect(existsSync(resolve(ROOT, rel))).toBe(true);
    const src = readSrc(rel);
    expect(src).toMatch(/import\s*\(\s*["']\.\.\/netcode\.js["']\s*\)/);
    expect(src).toMatch(/export\s+function\s+ensureNetcode/);
    expect(src).not.toMatch(STATIC_NETCODE_IMPORT);
  });

  it("main owns preparePlayNetworking ordering comment + call", () => {
    const src = readSrc("src/main.js");
    expect(src).toMatch(/function\s+preparePlayNetworking\s*\(/);
    expect(src).toMatch(/await\s+ensureGameSystems\s*\(/);
    expect(src).toMatch(/await\s+ensureNetcode\s*\(/);
    expect(src).toMatch(/registerGameCallbacks\s*\(/);
  });
});
