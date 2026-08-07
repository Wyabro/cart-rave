// sceneAblationWiring.test.js — PERF-PASS-1 Wave 3. `applySceneAblation` itself is unit-tested
// in debugParams.test.js; what this file guards is the WIRING, because the failure mode is
// silent: if a tier pass re-shows a block after the ablation call, the sweep cell measures
// ~0 ms and the cut reads as "worthless" when it was never applied. That would retire the
// best candidate on the board with a confident-looking number.
//
// Source asserts, not imports: effects.js/arena.js/main.js pull three + the whole scene stack,
// and the call sites are not exported. Same shape as effectsDispose.test.js.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const effectsSrc = read("../src/effects.js");
const arenaSrc = read("../src/arena.js");
// * BUNDLE-1 Lever B: initLevelManager's deps moved into orchestration/gameBoot.js.
const mainSrc = read("../src/orchestration/gameBoot.js");

/** Body of `export function applyRaveExtrasQuality(...)` up to the next top-level decl. */
function applyRaveExtrasQualityBody() {
  const start = effectsSrc.indexOf("export function applyRaveExtrasQuality(");
  expect(start).toBeGreaterThan(-1);
  const end = effectsSrc.indexOf("\nconst _crowdReactiveColor", start);
  expect(end).toBeGreaterThan(start);
  return effectsSrc.slice(start, end);
}

describe("scene ablation — effects.js call site", () => {
  it("runs inside applyRaveExtrasQuality", () => {
    expect(applyRaveExtrasQualityBody()).toMatch(/applySceneAblation\(/);
  });

  it("runs AFTER every visibility write in that function", () => {
    // * The whole point: the tier pass re-shows lasers/lights, so ablation must be last
    // * or the cut is silently undone on the very next tier apply.
    const body = applyRaveExtrasQualityBody();
    const ablateAt = body.indexOf("applySceneAblation(");
    const writes = [...body.matchAll(/\.visible\s*=/g)].map((m) => m.index);
    expect(writes.length).toBeGreaterThan(0);
    expect(ablateAt).toBeGreaterThan(Math.max(...writes));
  });

  it("maps every shell token the sweep uses", () => {
    const body = applyRaveExtrasQualityBody();
    for (const token of ["crowdcarts", "crowd", "stadium", "stagerig", "billboard", "bulbs"]) {
      expect(body).toMatch(new RegExp(`${token}:`));
    }
  });

  it("isolates the billboard lights from the group — ?ablate=billboardlights (Wave 5)", () => {
    // * The two billboard PointLights are the only lights no tier knob gates; the token
    // * must target the lights alone (not the group) so the cell prices the light-loop
    // * cost, not geometry. If the handle array ever empties, the probe silently measures
    // * ~0 and reads as "worthless" — the exact silent-un-ablate shape this file guards.
    const body = applyRaveExtrasQualityBody();
    expect(body).toMatch(/billboardlights:\s*billboardLightEntries\.map\(\(e\) => e\.light\)/);
  });

  it("non-vacuity: setRaveExtrasVisible really does re-show these blocks", () => {
    // * If this stops being a re-show, the ordering assert above guards nothing.
    const start = effectsSrc.indexOf("export function setRaveExtrasVisible(");
    expect(start).toBeGreaterThan(-1);
    const body = effectsSrc.slice(start, effectsSrc.indexOf("\n/**", start + 1));
    expect(body).toMatch(/\.visible\s*=\s*visible/);
  });
});

describe("scene ablation — arena.js pit lights", () => {
  /** The `applySceneAblation({...})` call inside initArena, whole. */
  function arenaAblationCall() {
    const initAt = arenaSrc.indexOf("export function initArena(");
    const callAt = arenaSrc.indexOf("applySceneAblation({", initAt);
    expect(initAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(initAt);
    const end = arenaSrc.indexOf("});", callAt);
    expect(end).toBeGreaterThan(callAt);
    return arenaSrc.slice(callAt, end);
  }

  it("`pitlights` hides all three pit/spindle lights, from inside initArena", () => {
    const pitlights = arenaAblationCall().split("pitfill:")[0];
    for (const light of ["spindleLight", "pitUplight", "pitRimFill"]) {
      expect(pitlights).toContain(light);
    }
  });

  it("`pitfill` is the two pit lights ONLY — the spindle must stay lit", () => {
    // * This token exists to price the cut Wyatt actually picked. If the spindle leaks
    // * into it, the cell re-measures `pitlights` under a second name and the shipped
    // * lever inherits a number that was never its own.
    const pitfill = arenaAblationCall().split("pitfill:")[1];
    expect(pitfill).toBeDefined();
    expect(pitfill).toContain("pitUplight");
    expect(pitfill).toContain("pitRimFill");
    expect(pitfill).not.toContain("spindleLight");
  });

  it("reuses the existing debugParams import rather than adding a module edge", () => {
    expect(arenaSrc).toMatch(
      /import \{ getDebugParams, applySceneAblation \} from "\.\/utils\/debugParams\.js";/,
    );
  });
});

describe("Classic applyQualityTier — PERF-PASS-1 arenaFillLights", () => {
  /** Body of `function applyQualityTier(knobs)` inside initArena. */
  function classicTierBody() {
    const start = arenaSrc.indexOf("function applyQualityTier(knobs) {");
    expect(start).toBeGreaterThan(-1);
    const end = arenaSrc.indexOf("\n  applyQualityTier(getQualityKnobs());", start);
    expect(end).toBeGreaterThan(start);
    return arenaSrc.slice(start, end);
  }

  it("gates the two pit lights on the knob", () => {
    const body = classicTierBody();
    expect(body).toMatch(/knobs\.arenaFillLights/);
    expect(body).toMatch(/pitUplight\.visible\s*=/);
    expect(body).toMatch(/pitRimFill\.visible\s*=/);
  });

  it("never touches the spindle accent — Wyatt kept it", () => {
    // * The shipped cut is two lights, not the three that were swept. If the spindle's
    // * visibility is ever written here, the lever silently becomes the unmeasured
    // * three-light cut and the record loses its pink/cyan identity at Low.
    expect(classicTierBody()).not.toMatch(/spindleLight\.visible\s*=/);
  });

  it("re-asserts ablation after the tier writes, not before", () => {
    const body = classicTierBody();
    const ablateAt = body.indexOf("applySceneAblation(");
    const writes = [...body.matchAll(/\.visible\s*=/g)].map((m) => m.index);
    expect(writes.length).toBeGreaterThan(0);
    expect(ablateAt).toBeGreaterThan(Math.max(...writes));
  });

  it("?ablate=recordbody swaps the record body to Standard — the Physical→Standard probe (Wave 5)", () => {
    // * The bracket for the Low ship lever (clearcoat lobe off the biggest screen-fill)
    // * must swap the material, not hide the mesh — hiding would overstate the cut.
    // * It is keyed on type so a live tier re-apply cannot double-clone the material.
    const body = classicTierBody();
    expect(body).toMatch(/ablate\.has\("recordbody"\)/);
    expect(body).toMatch(/MeshStandardMaterial/);
    expect(body).toMatch(/MeshPhysicalMaterial/);
    expect(body).toMatch(/p\.ablate\.has\("recordbody"\)/);
    // * The swap itself must not write .visible on any pit light or the spindle — those
    // * are the existing, measured cuts and must stay exactly what they are.
    expect(body).not.toMatch(/spindleLight\.visible\s*=/);
  });

  it("is exposed on the level result so main.js's tier hook can reach it", () => {
    // * main.js destructures applyQualityTier off the level result; Classic returns
    // * initArena's object verbatim via classicRecord.js. Line-ending agnostic on purpose —
    // * this file is checked out CRLF on Windows.
    const returnAt = arenaSrc.lastIndexOf("return {");
    expect(returnAt).toBeGreaterThan(-1);
    expect(arenaSrc.slice(returnAt, returnAt + 200)).toMatch(/applyQualityTier,/);
    // * ...and declared on the returned shape, or callers get an untyped hole.
    expect(arenaSrc).toMatch(/\*\s+applyQualityTier: \(knobs:/);
  });
});

describe("scene ablation — main.js re-show pairing", () => {
  it("onPreviewSwapComplete pairs setRaveExtrasVisible with the tier re-apply", () => {
    // * A bare setRaveExtrasVisible(true) re-shows everything the tier — and ?ablate= —
    // * had cut. The other two call sites already pair; this one did not.
    const start = mainSrc.indexOf("onPreviewSwapComplete: (levelId) => {");
    expect(start).toBeGreaterThan(-1);
    const body = mainSrc.slice(start, mainSrc.indexOf("\n    },", start));
    expect(body).toMatch(/setRaveExtrasVisible\(/);
    expect(body).toMatch(/applyRaveExtrasQuality\(/);
    expect(body.indexOf("applyRaveExtrasQuality(")).toBeGreaterThan(
      body.indexOf("setRaveExtrasVisible("),
    );
  });
});
