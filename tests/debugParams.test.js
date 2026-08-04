// @vitest-environment happy-dom
// debugParams.test.js — URL debug-flag parsing (utils/debugParams.js): defaults, bookmark
// expansion, implied flags (harness/freeze), bloom pipeline + live-tune params, and the
// guarantee that the retired ?rtmode fork stays retired (ignored, no key on the result).
// The module caches its parse of window.location.search, so every case loads a fresh
// module instance against a URL set via history.replaceState.

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * @param {string} [search] e.g. "?bloompipe=hdr" (empty = no params)
 * @returns {Promise<typeof import("../src/utils/debugParams.js")>}
 */
async function load(search = "") {
  window.history.replaceState(null, "", `/${search}`);
  vi.resetModules();
  return import("../src/utils/debugParams.js");
}

beforeEach(() => {
  localStorage.clear();
});

describe("debugParams — defaults (no params)", () => {
  it("returns the production defaults", async () => {
    const { getDebugParams } = await load();
    const p = getDebugParams();
    expect(p.bloomPipe).toBe("display");
    expect(p.bloomTune).toBeNull();
    expect(p.floor).toBe("og");
    expect(p.bloom).toBe("v2");
    expect(p.preset).toBeNull();
    expect(p.level).toBeNull();
    expect(p.cam).toBeNull();
    expect(p.shot).toBeNull();
    expect(p.freeze).toBe(false);
    expect(p.harness).toBe(false);
    expect(p.hideHud).toBe(false);
    expect(p.blackmon).toBe(false);
    expect(p.postmin).toBe(false);
    expect(p.ablate.size).toBe(0);
  });

  it("caches the parse — repeat calls return the same object", async () => {
    const { getDebugParams } = await load("?preset=low");
    expect(getDebugParams()).toBe(getDebugParams());
  });
});

describe("debugParams — bloom pipeline", () => {
  it("?bloompipe=hdr selects the legacy split", async () => {
    const { getDebugParams } = await load("?bloompipe=hdr");
    expect(getDebugParams().bloomPipe).toBe("hdr");
  });

  it("unknown ?bloompipe values fall back to display", async () => {
    const { getDebugParams } = await load("?bloompipe=banana");
    expect(getDebugParams().bloomPipe).toBe("display");
  });

  it("retired ?rtmode is ignored: no rtmode key, pipeline untouched", async () => {
    const { getDebugParams } = await load("?rtmode=bloomfix");
    const p = getDebugParams();
    expect(p).not.toHaveProperty("rtmode");
    expect(p).not.toHaveProperty("rtmodeExplicit");
    expect(p.bloomPipe).toBe("display");
  });

  it("?bloomthr/bloomstr live-tune: numeric keys land, junk is dropped", async () => {
    const { getDebugParams } = await load("?bloomthr=0.5&bloomstr=0.3&bloomrad=abc");
    const tune = getDebugParams().bloomTune;
    expect(tune).not.toBeNull();
    expect(tune.threshold).toBe(0.5);
    expect(tune.strength).toBe(0.3);
    expect(tune.radius).toBeUndefined();
    expect(tune.smoothWidth).toBeUndefined();
  });

  it("bloomTune is null when no tune params are present", async () => {
    const { getDebugParams } = await load("?bloompipe=hdr");
    expect(getDebugParams().bloomTune).toBeNull();
  });
});

describe("debugParams — bookmarks, level aliases, camera", () => {
  it("?shot=classic expands to level + cam pose", async () => {
    const { getDebugParams } = await load("?shot=classic");
    const p = getDebugParams();
    expect(p.shot).toBe("classic");
    expect(p.level).toBe("classicRecord");
    expect(p.cam).toEqual({ x: 0, y: 14, z: 22, lx: 0, ly: 0.5, lz: 0 });
  });

  it("unknown ?shot is dropped (no bookmark, shot null)", async () => {
    const { getDebugParams } = await load("?shot=nosuchpose");
    const p = getDebugParams();
    expect(p.shot).toBeNull();
    expect(p.level).toBeNull();
  });

  it("level aliases map to canonical ids", async () => {
    for (const [alias, canonical] of [
      ["classic", "classicRecord"],
      ["sundial", "zanzibar"],
      ["storerooms", "backrooms"],
    ]) {
      const { getDebugParams } = await load(`?level=${alias}`);
      expect(getDebugParams().level).toBe(canonical);
    }
  });

  it("?cam=x,y,z defaults look-at to origin; malformed cam is null", async () => {
    const three = await load("?cam=1,2,3");
    expect(three.getDebugParams().cam).toEqual({ x: 1, y: 2, z: 3, lx: 0, ly: 0, lz: 0 });
    const bad = await load("?cam=1,2");
    expect(bad.getDebugParams().cam).toBeNull();
  });

  it("an explicit cam implies freeze and locks the debug camera", async () => {
    const { getDebugParams, isDebugCameraLocked } = await load("?cam=1,2,3");
    expect(getDebugParams().freeze).toBe(true);
    expect(isDebugCameraLocked()).toBe(true);
  });
});

describe("debugParams — ablation and implied harness", () => {
  it("?ablate tokenizes on comma/plus/space and implies harness", async () => {
    const { getDebugParams } = await load("?ablate=bloom%2Bvhs,%20arcade");
    const p = getDebugParams();
    expect([...p.ablate].sort()).toEqual(["arcade", "bloom", "vhs"]);
    expect(p.harness).toBe(true);
  });

  it("?postmin ablates the whole postFX stack", async () => {
    const { getDebugParams } = await load("?postmin=1");
    const p = getDebugParams();
    expect(p.postmin).toBe(true);
    for (const key of ["bloom", "arcade", "fxaa", "vhs"]) {
      expect(p.ablate.has(key)).toBe(true);
    }
    expect(p.harness).toBe(true);
  });

  it("?hud=0 hides menu chrome and implies harness", async () => {
    const { getDebugParams } = await load("?hud=0");
    const p = getDebugParams();
    expect(p.hideHud).toBe(true);
    expect(p.harness).toBe(true);
  });

  it("?preset validates the tier — junk becomes null", async () => {
    const ok = await load("?preset=high");
    expect(ok.getDebugParams().preset).toBe("high");
    const junk = await load("?preset=ultra");
    expect(junk.getDebugParams().preset).toBeNull();
  });
});

describe("debugParams — applySceneAblation (PERF-PASS-1 cost-menu probe)", () => {
  /** Fresh duck-typed stand-ins for the scene blocks each token owns. */
  const targets = () => ({
    crowdcarts: { visible: true },
    crowd: [{ visible: true }, { visible: true }],
    stadium: { visible: true },
    pitlights: [{ visible: true }, { visible: true }, { visible: true }],
  });

  const hidden = (t) => [
    t.crowdcarts.visible,
    ...t.crowd.map((n) => n.visible),
    t.stadium.visible,
    ...t.pitlights.map((n) => n.visible),
  ];

  it("hides only the named token's target", async () => {
    const { applySceneAblation } = await load("?ablate=crowdcarts");
    const t = targets();
    const { ablated } = applySceneAblation(t);
    expect(ablated).toEqual(["crowdcarts"]);
    expect(t.crowdcarts.visible).toBe(false);
    expect(t.crowd.every((n) => n.visible)).toBe(true);
    expect(t.stadium.visible).toBe(true);
    expect(t.pitlights.every((n) => n.visible)).toBe(true);
  });

  it("hides every element of an array target", async () => {
    const { applySceneAblation } = await load("?ablate=pitlights");
    const t = targets();
    expect(applySceneAblation(t).ablated).toEqual(["pitlights"]);
    expect(t.pitlights.map((n) => n.visible)).toEqual([false, false, false]);
  });

  it("?ablate=all hides every target", async () => {
    const { applySceneAblation } = await load("?ablate=all");
    const t = targets();
    const { ablated } = applySceneAblation(t);
    expect(ablated.sort()).toEqual(["crowd", "crowdcarts", "pitlights", "stadium"]);
    expect(hidden(t).some(Boolean)).toBe(false);
  });

  it("?ablate=none and unknown tokens hide nothing", async () => {
    for (const search of ["?ablate=none", "?ablate=nosuchblock"]) {
      const { applySceneAblation } = await load(search);
      const t = targets();
      expect(applySceneAblation(t).ablated).toEqual([]);
      expect(hidden(t).every(Boolean)).toBe(true);
    }
  });

  it("?ablate=none still implies harness — the baseline must boot like every other cell", async () => {
    // * A baseline URL without ?ablate= takes a different boot path (harness warms the
    // * world ASAP), so its frame times are not comparable to the ablated cells.
    const { getDebugParams } = await load("?ablate=none");
    expect(getDebugParams().harness).toBe(true);
  });

  it("skips null/missing targets without reporting them as ablated", async () => {
    const { applySceneAblation } = await load("?ablate=all");
    const { ablated } = applySceneAblation({
      stagerig: null,
      billboard: undefined,
      bulbs: [],
      stadium: { visible: true },
    });
    expect(ablated).toEqual(["stadium"]);
  });

  it("post-FX tokens do not hide scene blocks, and vice versa", async () => {
    const { applySceneAblation, applyPostFxAblation } = await load("?ablate=bloom");
    const t = targets();
    expect(applySceneAblation(t).ablated).toEqual([]);
    expect(hidden(t).every(Boolean)).toBe(true);

    const scene = await load("?ablate=crowdcarts");
    const bloomPass = { enabled: true };
    expect(scene.applyPostFxAblation({ bloomPass }).ablated).toEqual([]);
    expect(bloomPass.enabled).toBe(true);
    expect(applyPostFxAblation).toBeTypeOf("function");
  });

  it("a re-show followed by ablation stays hidden — the order the call sites rely on", async () => {
    const { applySceneAblation } = await load("?ablate=crowdcarts");
    const t = targets();
    // * setRaveExtrasVisible(true) → applyRaveExtrasQuality(...) → ablation last.
    t.crowdcarts.visible = true;
    applySceneAblation(t);
    expect(t.crowdcarts.visible).toBe(false);
  });

  it("returns an empty result for a null target map", async () => {
    const { applySceneAblation } = await load("?ablate=all");
    expect(applySceneAblation(null).ablated).toEqual([]);
  });
});

describe("debugParams — boot side effects", () => {
  it("persists the URL level under the frozen cartRaveLevel key", async () => {
    const { applyDebugBootSideEffects } = await load("?level=sundial");
    applyDebugBootSideEffects();
    expect(localStorage.getItem("cartRaveLevel")).toBe("zanzibar");
  });

  it("harness-ish flags suppress the first-run HOW TO PLAY overlay", async () => {
    const { applyDebugBootSideEffects } = await load("?shot=storerooms");
    applyDebugBootSideEffects();
    expect(localStorage.getItem("cartRaveHowToSeen")).toBe("1");
  });

  it("a clean URL writes neither key", async () => {
    const { applyDebugBootSideEffects } = await load();
    applyDebugBootSideEffects();
    expect(localStorage.getItem("cartRaveLevel")).toBeNull();
    expect(localStorage.getItem("cartRaveHowToSeen")).toBeNull();
  });
});
