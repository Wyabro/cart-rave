// cladRepeat.test.js — CLAD-REPEAT-1: stand cladding must render the same
// world-space motif on every deck radius.
//
// The fix scales each deck's cladding-cylinder UVs by (cladR, wallH) relative
// to deck 0 while keeping ONE shared panelTex/cladMat, so the stadium merge
// still collapses the cladding to a single draw call. Source-assert shape
// (same as effectsDispose.test.js — the scaling lives inline in effects.js and
// exporting it purely for this test would trip knip's unused-export gate).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const effectsSrc = readFileSync(new URL("../../src/effects/crowd.js", import.meta.url), "utf8");

/** Body of the cladding UV-scale block up to the mesh creation that follows. */
function cladUvScaleSource() {
  const start = effectsSrc.indexOf("const uvScaleX = cladR / refCladR;");
  expect(start).toBeGreaterThan(-1);
  const end = effectsSrc.indexOf("const clad = new THREE.Mesh(cladGeo, cladMat);", start);
  expect(end).toBeGreaterThan(start);
  return effectsSrc.slice(start, end);
}

describe("cladding repeat normalization", () => {
  it("keeps the authored repeat(24, 3) on a single shared panel texture", () => {
    expect(effectsSrc).toMatch(/panelTex\.repeat\.set\(24, 3\)/);
    // * One texture + one material: per-deck clones would split the merged draw.
    expect(effectsSrc.match(/const cladMat = new THREE\.MeshStandardMaterial/g) ?? []).toHaveLength(1);
    expect(effectsSrc.match(/panelTex\.clone\(/g) ?? []).toHaveLength(0);
  });

  it("normalizes each deck's cladding UVs by radius and wall height vs deck 0", () => {
    const body = cladUvScaleSource();
    expect(body).toMatch(/const uvScaleX = cladR \/ refCladR;/);
    expect(body).toMatch(/const uvScaleY = wallH \/ refWallH;/);
    // * Both axes applied per vertex, not just X.
    expect(body).toMatch(/uv\.setXY\(i, uv\.getX\(i\) \* uvScaleX, uv\.getY\(i\) \* uvScaleY\);/);
  });

  it("the reference dimensions are deck 0's, computed once before the loop", () => {
    const refBlock = effectsSrc.slice(
      effectsSrc.indexOf("const refCladR = decks[0].r1 + 0.55;"),
      effectsSrc.indexOf("const refCladR = decks[0].r1 + 0.55;") + 200,
    );
    expect(refBlock).toMatch(/const refCladR = decks\[0\]\.r1 \+ 0\.55;/);
    expect(refBlock).toMatch(/const refWallH = Math\.max\(2\.5, \(decks\[0\]\.r1 - decks\[0\]\.r0\) \* CROWD_RAKE \+ 1\.8\);/);
  });

  it("deck 0 (d === 0) keeps identity scale — authored look unchanged", () => {
    const body = cladUvScaleSource();
    // * The guard must skip the UV rewrite for deck 0 only.
    expect(body).toMatch(/if \(d !== 0\) \{/);
    expect(body).toMatch(/uv\.needsUpdate = true;/);
  });
});
