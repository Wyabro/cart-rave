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
const mainSrc = read("../src/main.js");

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

  it("non-vacuity: setRaveExtrasVisible really does re-show these blocks", () => {
    // * If this stops being a re-show, the ordering assert above guards nothing.
    const start = effectsSrc.indexOf("export function setRaveExtrasVisible(");
    expect(start).toBeGreaterThan(-1);
    const body = effectsSrc.slice(start, effectsSrc.indexOf("\n/**", start + 1));
    expect(body).toMatch(/\.visible\s*=\s*visible/);
  });
});

describe("scene ablation — arena.js pit lights", () => {
  it("hides all three pit/spindle lights, from inside initArena", () => {
    const initAt = arenaSrc.indexOf("export function initArena(");
    const callAt = arenaSrc.indexOf("applySceneAblation({ pitlights:", initAt);
    expect(initAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(initAt);
    const call = arenaSrc.slice(callAt, arenaSrc.indexOf("\n", callAt));
    for (const light of ["spindleLight", "pitUplight", "pitRimFill"]) {
      expect(call).toContain(light);
    }
  });

  it("reuses the existing debugParams import rather than adding a module edge", () => {
    expect(arenaSrc).toMatch(
      /import \{ getDebugParams, applySceneAblation \} from "\.\/utils\/debugParams\.js";/,
    );
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
