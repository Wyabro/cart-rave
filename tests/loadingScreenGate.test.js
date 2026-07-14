// @vitest-environment happy-dom
// happy-dom: loadingScreen.js builds real DOM overlays and uses matchMedia/rAF.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  withModeEntryLoading,
  whenModeEntryHidden,
  initLoadingScreen,
} from "../src/ui/loadingScreen.js";

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
