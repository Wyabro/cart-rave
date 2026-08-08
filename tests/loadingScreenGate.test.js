// @vitest-environment happy-dom
// happy-dom: loadingScreen.js builds real DOM overlays and uses matchMedia/rAF.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  withModeEntryLoading,
  whenModeEntryHidden,
  initLoadingScreen,
  shouldBootRevealMenu,
  LOAD_TIPS,
} from "../src/ui/loadingScreen.js";

describe("shouldBootRevealMenu", () => {
  afterEach(() => {
    document.getElementById("cr-root")?.remove();
  });

  it("returns false when #cr-root is missing", () => {
    expect(shouldBootRevealMenu(null)).toBe(false);
    expect(shouldBootRevealMenu()).toBe(false);
  });

  it("returns false when #cr-root is display:none (play already hid menu)", () => {
    const root = document.createElement("div");
    root.id = "cr-root";
    root.style.display = "none";
    document.body.appendChild(root);
    expect(shouldBootRevealMenu(root)).toBe(false);
  });

  it("returns true when #cr-root is visible (empty display)", () => {
    const root = document.createElement("div");
    root.id = "cr-root";
    document.body.appendChild(root);
    expect(shouldBootRevealMenu(root)).toBe(true);
  });
});

// * LOAD-PROGRESS-1: the mode-entry meter used to sit at 15% for 11.5s of a cold arena
// * build, then jump to 88 — and on the world-warm-but-arena-stale path it stepped
// * BACKWARDS (levels/index.js:154 writes 90, bootstrap.js:463 then writes 88). The fix
// * ports the boot splash's floor + ambient ticker (index.html:597-608) to this overlay.
describe("loadingScreen — progress floor + ambient ticker", () => {
  let originalRaf;
  let originalSetInterval;
  let originalClearInterval;
  let originalMatchMedia;
  /** @type {Set<number>} */
  let liveIntervals;

  const pctText = () => document.querySelector("#cr-mode-load .cr-load__pct")?.textContent ?? "";
  const subtitleText = () =>
    document.querySelector("#cr-mode-load .cr-load__subtitle")?.textContent ?? "";

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);

    // * Take the reduced-motion dismissal path so the overlay closes synchronously. None
    // * of these cases is about the exit animation, and the 280ms fade is real wall clock
    // * on a shared CI runner — where a neighbouring pool's flood test has no headroom
    // * under the default 5s timeout. The fade itself stays covered by the
    // * whenModeEntryHidden gate below, which still runs it.
    originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: /prefers-reduced-motion/.test(String(query)),
      media: String(query),
      addEventListener() {},
      removeEventListener() {},
    });

    // * Track interval IDENTITY, not a spy's call count: "cleared" has to mean the exact
    // * interval that was created, or a leak that re-registers reads as clean.
    liveIntervals = new Set();
    originalSetInterval = window.setInterval;
    originalClearInterval = window.clearInterval;
    window.setInterval = (...args) => {
      const id = originalSetInterval.apply(window, args);
      liveIntervals.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      liveIntervals.delete(id);
      return originalClearInterval.call(window, id);
    };

    performance.clearMarks?.();
    initLoadingScreen();
  });

  afterEach(() => {
    for (const id of liveIntervals) originalClearInterval.call(window, id);
    window.setInterval = originalSetInterval;
    window.clearInterval = originalClearInterval;
    window.matchMedia = originalMatchMedia;
    globalThis.requestAnimationFrame = originalRaf;
    performance.clearMarks?.();
  });

  it("keeps the higher value when a lower report follows (90 then 88)", async () => {
    await withModeEntryLoading(
      async (report) => {
        report(90, "Colliders ready…");
        expect(pctText()).toBe("90%");
        report(88, "Warming physics…");
        expect(pctText()).toBe("90%");
        // * The bar is floored; the status line is not. Swallowing the label too would
        // * mute the only copy that path emits.
        expect(subtitleText()).toBe("Warming physics…");
      },
      { levelId: "classic", minVisibleMs: 0 },
    );
  }, 10000);

  it("clears the ambient ticker when the task throws, not only on success", async () => {
    const boom = new Error("play bootstrap exploded");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        withModeEntryLoading(
          async () => {
            // * Guards against a vacuous pass: there must be a live ticker to clear.
            expect(liveIntervals.size).toBe(1);
            throw boom;
          },
          { levelId: "classic", minVisibleMs: 0 },
        ),
      ).rejects.toBe(boom);
    } finally {
      errSpy.mockRestore();
    }
    expect([...liveIntervals]).toEqual([]);
  }, 10000);

  it("ignores stale boot marks on a second play entry", async () => {
    // * `performance` marks live for the whole page, so by the second play entry all
    // * four anchors are already stamped from the FIRST one. Replaying them would pin
    // * the meter at 85 through a real arena rebuild — worse than the original bug.
    for (const m of ["world-init-start", "idle-shader-start", "idle-shader-end", "world-ready"]) {
      performance.mark(`cr:${m}`);
    }
    let atTaskStart = "";
    await withModeEntryLoading(
      async () => {
        atTaskStart = pctText();
      },
      { levelId: "classic", minVisibleMs: 0, backfillBootMarks: () => false },
    );
    expect(Number.parseInt(atTaskStart, 10)).toBeLessThan(85);
  }, 10000);

  it("does backfill those marks while a world bootstrap is in flight", async () => {
    // * Positive control for the test above — without it, a backfill that silently
    // * stopped working would make "does not jump" pass for the wrong reason.
    performance.mark("cr:world-init-start");
    performance.mark("cr:world-ready");
    let atTaskStart = "";
    await withModeEntryLoading(
      async () => {
        atTaskStart = pctText();
      },
      { levelId: "classic", minVisibleMs: 0, backfillBootMarks: () => true },
    );
    expect(Number.parseInt(atTaskStart, 10)).toBe(85);
  }, 10000);

  // * LOAD-TIPS-1: first paint must be a gameplay tip (not flavor). Progress labels
  // * may overwrite mid-task — seed before any report.
  it("seeds the subtitle with a LOAD_TIPS line on show", async () => {
    let seeded = "";
    await withModeEntryLoading(
      async () => {
        seeded = subtitleText();
      },
      { levelId: "classic", minVisibleMs: 0 },
    );
    expect(LOAD_TIPS).toContain(seeded);
  }, 10000);
});

// * whenModeEntryHidden() is the gate the solo countdown holds on so it can't begin
// * ticking behind the loading overlay ("loading ends before the round starts").
describe("loadingScreen — whenModeEntryHidden gate", () => {
  let originalRaf;

  beforeEach(() => {
    // * yieldForPaint() awaits rAF; make it resolve promptly so the loader progresses
    // * under real timers (the fade/min-visible floors still use setTimeout).
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
    initLoadingScreen();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
  });

  it("resolves immediately when no mode-entry overlay is showing", async () => {
    let resolved = false;
    whenModeEntryHidden().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("stays pending while the overlay is up, then resolves once it dismisses", async () => {
    let gateResolved = false;
    /** @type {Promise<void>} */
    let gate;

    await withModeEntryLoading(
      async () => {
        // Inside the task the overlay is visible — the gate must NOT be resolved yet
        // (this is exactly when the solo game-start fires and registers the wait).
        gate = whenModeEntryHidden();
        gate.then(() => {
          gateResolved = true;
        });
        await Promise.resolve();
        expect(gateResolved).toBe(false);
      },
      { levelId: "classic" },
    );

    // withModeEntryLoading only resolves after the overlay has fully dismissed, so the
    // gate registered mid-task must be resolved by now.
    await gate;
    expect(gateResolved).toBe(true);
  }, 10000);
});
