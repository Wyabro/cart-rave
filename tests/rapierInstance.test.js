import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  supportsWasmSimd,
  initRapier,
  getRapierBuild,
  RAPIER,
} from "../src/physics/rapierInstance.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const rapierPkg = JSON.parse(
  readFileSync(new URL("../node_modules/@dimforge/rapier3d/package.json", import.meta.url), "utf8"),
);
const rapierSimdPkg = JSON.parse(
  readFileSync(new URL("../node_modules/@dimforge/rapier3d-simd/package.json", import.meta.url), "utf8"),
);

describe("rapierInstance", () => {
  it("exposes a boolean simd128 probe", () => {
    expect(typeof supportsWasmSimd()).toBe("boolean");
  });

  it("simd128 probe is a valid module when the runtime supports SIMD", () => {
    // * Happy-dom / modern V8 should accept the fixed probe (was always false when truncated).
    // * If the environment has no SIMD, validate returns false — still a boolean, not a throw.
    const ok = supportsWasmSimd();
    expect(ok === true || ok === false).toBe(true);
    // * Node 24+ and Chromium-based test envs support wasm SIMD.
    if (typeof WebAssembly !== "undefined") {
      expect(ok).toBe(true);
    }
  });

  it("initRapier resolves under the vitest stub and records a build", async () => {
    const mod = await initRapier();
    expect(mod).toBeTruthy();
    // * Stub is `export default {}` — module is empty but load path must succeed.
    expect(getRapierBuild() === "simd" || getRapierBuild() === "standard").toBe(true);
    expect(RAPIER).toBe(mod);
  });

  it("rapier and rapier-simd resolve to the same installed version", () => {
    expect(pkg.dependencies["@dimforge/rapier3d"]).toBe(pkg.dependencies["@dimforge/rapier3d-simd"]);
    expect(rapierPkg.version).toBe(rapierSimdPkg.version);
    expect(rapierPkg.version).toBe("0.20.0");
  });
});
