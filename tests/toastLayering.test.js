import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// HUD-TOAST-Z-1 — the session-flow toast must sit above every full-screen surface it can fire
// over, and must not be placed by its callers.
//
// `#cr-unlock-toast` is a body-level singleton that used to sit at z-index 12000. `#hud` is
// `position: fixed; inset: 0; z-index: 20000` — a STACKING CONTEXT — so every HUD child won
// regardless of its own z-index and in-game toasts were drawn under the boost slab. The same
// path carries live multiplayer messages (host migration, weak-host, host-stalled), so this was
// not a diagnostics-only defect.
//
// WHAT THESE ASSERTIONS CANNOT PROVE — read this before trusting a green run:
//   * Nothing about readability. No pixel is measured. The toast could be 2px tall and pass.
//   * Nothing about the measured lift. vitest/jsdom returns all-zero rects from
//     getBoundingClientRect, so measureBottomStripLift() always takes its `lift === 0` branch
//     here. Only the CSS fallback path is exercised, never the arithmetic.
//   * Nothing about stacking contexts — the largest blind spot, and the same failure class as
//     the original bug. If anyone later puts `transform`, `filter`, `opacity < 1`, `will-change`,
//     `contain` or `isolation` on <body> or on a new wrapper around the toast, 26500 silently
//     stops meaning what it says and all four assertions below still pass.
// The real verdict is a human playtest across the solo / friends-lobby / quickplay-lobby /
// paused / narrow-window cases.
//
// Source assertions, same approach and same reasoning as tests/classicPitWalls.test.js: Rapier
// and the DOM are both stubbed in unit tests, and these are one-line properties that are trivially
// dropped when the surrounding code is edited later.

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const menuJs = read("src/ui/cart-rave-menu.js");
const menuCss = read("src/ui/styles/cart-rave-menu.css");

/**
 * First z-index value declared after `selector` in `src`.
 * Parsed from the real file rather than hard-coded so that an unrelated bump to a NEIGHBOUR —
 * say someone raises .hud-lobby — fails this test and names the toast, instead of sailing past a
 * frozen snapshot.
 */
function zIndexAfter(src, selector, label) {
  const at = src.indexOf(selector);
  expect(at, `selector missing: ${selector}`).toBeGreaterThan(-1);
  const match = /z-index:\s*(\d+)/.exec(src.slice(at));
  expect(match, `no z-index after ${selector}`).not.toBeNull();
  return { label, value: Number(match[1]) };
}

describe("HUD-TOAST-Z-1 — toast layering", () => {
  it("orders the toast above every full-screen surface it can fire over, and below the rotate gate", () => {
    const layers = [
      zIndexAfter(read("src/ui/styles/hud.css"), "#hud {", "#hud"),
      zIndexAfter(read("src/ui/styles/hud.css"), ".hud-lobby {", ".hud-lobby"),
      zIndexAfter(read("src/ui/styles/results.css"), "#results-overlay", "#results-overlay"),
      zIndexAfter(read("src/ui/styles/pauseOverlay.css"), "#esc-overlay", "#esc-overlay"),
      zIndexAfter(menuCss, ".cr-unlock-toast {", ".cr-unlock-toast"),
      zIndexAfter(read("src/ui/rotatePrompt.js"), "#rotate-prompt {", "#rotate-prompt"),
    ];
    // The toast is pointer-events:none, so painting over a modal can never swallow a click —
    // that is what makes "above the pause overlay" safe here and unsafe for anything interactive.
    const order = layers.map((l) => l.label).join(" < ");
    expect(order).toBe(
      "#hud < .hud-lobby < #results-overlay < #esc-overlay < .cr-unlock-toast < #rotate-prompt",
    );
    for (let i = 1; i < layers.length; i += 1) {
      expect(
        layers[i].value,
        `${layers[i].label} (${layers[i].value}) must sit above ${layers[i - 1].label} (${layers[i - 1].value})`,
      ).toBeGreaterThan(layers[i - 1].value);
    }
  });

  it("keeps a safe fallback offset when the measurement yields nothing", () => {
    // If getBoundingClientRect ever returns zeros for real — #hud not yet mounted, a headless
    // quirk — the toast must land on the known-good --arena offset, never back down onto the slab.
    const rule = menuCss.slice(menuCss.indexOf(".cr-unlock-toast.cr-unlock-toast--lifted"));
    expect(rule).toContain("var(--cr-toast-lift, 88px)");
    expect(rule).toContain("env(safe-area-inset-bottom, 0px) + 72px");
  });

  it("toggles both toast modifiers instead of adding them", () => {
    // The toast element is a singleton reused for the life of the page. A bare `add` is exactly
    // how it acquires a permanently-wrong offset, and it is one word away at all times.
    for (const modifier of ["cr-unlock-toast--lifted", "cr-unlock-toast--arena"]) {
      expect(menuJs, `${modifier} must be toggled`).toContain(`classList.toggle('${modifier}'`);
      expect(
        menuJs.includes(`classList.add('${modifier}'`),
        `${modifier} must never be added unconditionally`,
      ).toBe(false);
    }
    // The inline lift must be removed, not merely overwritten, or a later menu toast inherits
    // the last round's value.
    expect(menuJs).toContain("removeProperty('--cr-toast-lift')");
  });

  it("leaves placement inside showUnlockToast — the bridge still forwards two arguments", () => {
    // Canary, in the spirit of classicPitWalls' backstop-cylinder check. The bug's proximate
    // cause was that this bridge never forwarded a variant; "fix" it by threading placement
    // through the callers and six modules have to know about HUD geometry. If this line grows a
    // third argument, someone has taken that turn and should read HUD-TOAST-Z-1 first.
    expect(menuJs).toMatch(
      /showToast\(message, durationMs = 5000\)\s*\{\s*showUnlockToast\(message, durationMs\);\s*\}/,
    );
  });
});
