import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  applyRaveGltfColorToCache,
  applyRaveGltfLeaderGlow,
  buildRaveGltfMaterialCache,
  setEmissiveTrimMul,
} from "../src/cartRaveGltf.js";
import { applyThemeColorToCache } from "../src/cartThemes.js";

// FIX-EMISSIVE — a cart with no pattern must render its trim dimmer, and STAY dimmer.
//
// A pattern is the only thing that currently reduces emissive area, so a `classic` cart shows
// full-area trim glow and reads blown out beside a patterned one. Classic is not a rare case:
// remote humans are always classic (patterns are not networked yet) and the NPC pool draws it 2/7.
//
// THIS CARD WAS ABORTED ONCE (08-04) AND THESE TESTS EXIST TO STOP THE SAME FAILURE. The first
// design threaded the trim through `intensityMul`, which is a per-call argument. The unguarded
// every-frame leader-glow loop in frameVisuals.js calls applyThemeColorToCache(cache, themeId,
// hex) with three arguments, so the mul defaults to 1 and the trim was erased within a frame.
// The fix puts the multiplier on the CACHE. Tests 3 and 4 are that regression.
//
// three.js is NOT stubbed in vitest (only Rapier is — vitest.config.js), so these assert real
// emissiveIntensity numbers rather than grepping for a chained call. The cache functions only
// read frameMats / frameBodyMats / accentMats, so a hand-built cache literal is enough — no GLTF.
//
// WHAT THESE CANNOT PROVE:
//   * Nothing about how it looks. No pixel is measured, and no bloom interaction is exercised —
//     Classic's ~15.9% construction-noise floor swamps a trim this size in `npm run compare`,
//     which is why this card ships on this seam plus a human look-check.
//   * Nothing about the leader-glow PEAK. The blend is base*(1-whiteMix) + glowIntensity*whiteMix
//     and glowIntensity is absolute, so classic and patterned converge at the white flash by
//     design. Test 3 pins the idle end, which is the end the trim owns.
//   * The two live wirings (match slots, KO respawn) are source assertions, not runtime — those
//     call sites live inside closures that would need the whole orchestration to instantiate.

const NEON = 0xff2ec4;

/** A cache shaped like the real one, around a real material. */
function makeCache(patternId, root) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  mat.emissive = new THREE.Color(0x000000);
  mat.emissiveIntensity = 1;
  const cache = {
    isRaveGltf: true,
    frameMats: [bodyMat, mat],
    frameBodyMats: [bodyMat],
    accentMats: [mat],
    frameGlowMats: [mat],
  };
  if (patternId !== undefined) setEmissiveTrimMul(cache, patternId, root);
  return { cache, mat, bodyMat };
}

describe("FIX-EMISSIVE — classic carts carry a dimmer trim", () => {
  it("1. resolves the multiplier from the pattern, and stamps the root so a rebuild survives", () => {
    const root = new THREE.Object3D();
    const { cache } = makeCache("classic", root);
    expect(cache.emissiveTrimMul).toBeLessThan(1);
    expect(root.userData.cartEmissiveTrimMul).toBe(cache.emissiveTrimMul);

    // A patterned cart must go back to exactly 1 — not "some other value".
    setEmissiveTrimMul(cache, "stripes", root);
    expect(cache.emissiveTrimMul).toBe(1);
    expect(root.userData.cartEmissiveTrimMul).toBe(1);

    // A missing/undefined pattern is classic. Match spawn relies on this: prepareRaveGltfCart is
    // called with no patternId, so the cart is born classic until the slots pass says otherwise.
    setEmissiveTrimMul(cache, undefined, root);
    expect(cache.emissiveTrimMul).toBeLessThan(1);
  });

  it("2. paints a strictly lower emissive intensity for classic than for patterned", () => {
    const classic = makeCache("classic");
    const patterned = makeCache("stripes");
    applyRaveGltfColorToCache(classic.cache, NEON);
    applyRaveGltfColorToCache(patterned.cache, NEON);
    expect(classic.mat.emissiveIntensity).toBeLessThan(patterned.mat.emissiveIntensity);
    expect(patterned.mat.emissiveIntensity).toBeGreaterThan(0);
  });

  it("3. keeps the trim through the leader glow — the exact regression that aborted this card", () => {
    // glowPulse 0 = idle leader. Before the fix this branch hardcoded intensityMul 1, so a
    // classic cart snapped to full brightness the moment it took the lead.
    const classic = makeCache("classic");
    const patterned = makeCache("stripes");
    applyRaveGltfLeaderGlow(classic.cache, NEON, 0, 99);
    applyRaveGltfLeaderGlow(patterned.cache, NEON, 0, 99);
    expect(classic.mat.emissiveIntensity).toBeLessThan(patterned.mat.emissiveIntensity);
  });

  it("4. survives a three-argument applyThemeColorToCache — the frameVisuals idle branch", () => {
    // This is the call that erased the previous design: no fourth argument, so intensityMul = 1.
    const { cache, mat } = makeCache("classic");
    const patterned = makeCache("stripes");
    applyThemeColorToCache(cache, "rave", NEON);
    applyThemeColorToCache(patterned.cache, "rave", NEON);
    expect(mat.emissiveIntensity).toBeLessThan(patterned.mat.emissiveIntensity);
  });

  it("5. rehydrates the trim when the material cache is rebuilt", () => {
    // frameVisuals and cartOrchestration both do `cache || (cache = buildCartMaterialCache(mesh))`,
    // and a KO respawn rebuilds outright. Without the userData stamp the cart pops back to full.
    const root = new THREE.Object3D();
    root.userData.isRaveGltf = true;
    setEmissiveTrimMul(null, "classic", root);
    const rebuilt = buildRaveGltfMaterialCache(root);
    expect(rebuilt.emissiveTrimMul).toBeLessThan(1);

    const plain = buildRaveGltfMaterialCache(new THREE.Object3D());
    expect(plain.emissiveTrimMul).toBe(1);
  });

  it("6. is neutral for a cache that never had a trim set", () => {
    // Legacy/procedural carts and any pre-existing cache must be untouched.
    const { cache, mat } = makeCache(undefined);
    expect(cache.emissiveTrimMul).toBeUndefined();
    applyRaveGltfColorToCache(cache, NEON);
    const untrimmed = mat.emissiveIntensity;

    const patterned = makeCache("stripes");
    applyRaveGltfColorToCache(patterned.cache, NEON);
    expect(untrimmed).toBe(patterned.mat.emissiveIntensity);
  });

  it("7. is wired into the live match path and the respawn path, not just the constructor", () => {
    // Source assertion on purpose. THIS IS THE ONE THAT MATTERS MOST: carts are built by
    // prepareRaveGltfCart with no patternId, so a suite that only exercised the constructor would
    // stay green while every cart in a real match was trimmed and no patterned cart recovered.
    const orchestration = readFileSync(
      new URL("../src/orchestration/cartOrchestration.js", import.meta.url),
      "utf8",
    );
    const slots = orchestration.slice(orchestration.indexOf("function updateCartMaterialsFromSlots"));
    expect(slots).toContain("resolveCartPatternForSlot");
    expect(slots.indexOf("setEmissiveTrimMul")).toBeGreaterThan(-1);

    const entities = readFileSync(new URL("../src/entities.js", import.meta.url), "utf8");
    expect(entities).toContain("setEmissiveTrimMul(materialCache, cart.cartPatternId, cart.mesh)");
  });

  it("8. gives the selected cart color a deep base and restores it after the white flash", () => {
    const { cache, bodyMat } = makeCache("classic");
    const raw = new THREE.Color().setHex(NEON);

    applyRaveGltfColorToCache(cache, NEON);
    expect(bodyMat.color.r).toBeCloseTo(raw.r * 0.72, 5);
    expect(bodyMat.color.g).toBeCloseTo(raw.g * 0.72, 5);
    expect(bodyMat.color.b).toBeCloseTo(raw.b * 0.72, 5);

    applyRaveGltfLeaderGlow(cache, NEON, 1, 99);
    expect(bodyMat.color.r).toBeCloseTo(1, 5);
    expect(bodyMat.color.g).toBeCloseTo(1, 5);
    expect(bodyMat.color.b).toBeCloseTo(1, 5);

    applyRaveGltfLeaderGlow(cache, NEON, 0, 99);
    expect(bodyMat.color.r).toBeCloseTo(raw.r * 0.72, 5);
    expect(bodyMat.color.g).toBeCloseTo(raw.g * 0.72, 5);
    expect(bodyMat.color.b).toBeCloseTo(raw.b * 0.72, 5);
  });

  it("9. keeps the patterned valley lift independent from the shared cart base", () => {
    const patterns = readFileSync(
      new URL("../src/cartPatterns.js", import.meta.url),
      "utf8",
    );
    expect(patterns).toContain("const PATTERN_OVERLAY_TINT_SCALE = 0.38;");
    expect(patterns).toContain("multiplyScalar(PATTERN_OVERLAY_TINT_SCALE);");
    expect(patterns).toContain("PATTERN_OVERLAY_TINT_SCALE * emissiveIntensity");
  });
});
