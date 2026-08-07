// @vitest-environment happy-dom
// onboardScroll.test.js — ONBOARD-SCROLL-1: focusing the HOW TO PLAY pager arrows
// creates a page scrollbar.
//
// * Source asserts (same rig as onboardFirstRun.test.js): pin the two rules that
//   carry the fix in src/cart-rave-menu.css — the overlay clips at the viewport and
//   the focused pager button's ring stays inside the button.
// * DOM asserts (happy-dom): mirror the overlay structure from index.html, inject the
//   REAL stylesheet, focus a .cr-howto-page button, and check the computed styles that
//   stop the ring from painting past the overlay.
//
// WHAT THIS CANNOT SEE — read before trusting a green run:
//   ▸ happy-dom has zeroed layout, so it cannot measure real scrollbar geometry. The
//     "no document scrollbar" claim is carried by two invariants: the overlay is
//     position:fixed with overflow:hidden (so nothing it contains can grow the
//     document's scrollable area), and the focused ring is drawn at outline-offset
//     <= 0 (so it never bleeds past the overlay edge to trigger a scroll).
//   ▸ It cannot prove a real browser paints no scrollbar — the human verdict is the
//     playtest on prod.
//   ▸ The base `html, body { overflow: hidden }` rule makes a document-level
//     scrollHeight check vacuous, so it is deliberately NOT the assertion here.

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// * happy-dom rewrites import.meta.url to a non-file scheme, so resolve from cwd.
const css = readFileSync(`${process.cwd()}/src/cart-rave-menu.css`, "utf8");

// * Overlay structure that matters: the selectors the fix targets are #cr-howto-screen
// * and .cr-howto-page:focus-visible. Mirrors index.html's cr-howto-screen nesting.
const FIXTURE = `
<div id="cr-howto-screen" style="display:flex;">
  <div class="cr-screen cr-screen--panels cr-howto-panel">
    <div class="cr-screen-panels cr-howto-body">
      <div class="cr-howto-deck">
        <div class="cr-howto-pager">
          <button class="cr-howto-page" id="cr-howto-prev" type="button">◂</button>
          <button class="cr-howto-page" id="cr-howto-next" type="button">▸</button>
        </div>
      </div>
    </div>
  </div>
</div>
`;

describe("ONBOARD-SCROLL-1 — the fix is present in the shipped stylesheet", () => {
  it("clips the overlay so nothing it contains can grow the document scroll area", () => {
    // * The overlay's box is the whole viewport; overflow:hidden means a ring painted
    // * outside a child cannot push the document past 100% height. The base rule is a
    // * comma-grouped selector (shared with challenges/settings), hence [^{]*.
    expect(css).toMatch(/#cr-howto-screen[^{]*\{[^}]*position:\s*fixed/s);
    expect(css).toMatch(/#cr-howto-screen\s*\{[^}]*overflow:\s*hidden/s);
  });

  it("keeps the pager ring inside the button (outline-offset <= 0) without deleting it", () => {
    // * The ring stays load-bearing for keyboard/pad nav — gamepadNav walks the
    // * focusables — so the fix narrows the ring instead of removing it.
    const ring = css.match(/\.cr-howto-page:focus-visible\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(ring).toMatch(/outline:\s*2px\s+solid/);
    expect(ring).toMatch(/outline-offset:\s*-\d+px/);
  });
});

describe("ONBOARD-SCROLL-1 — a focused pager button stays inside the overlay (happy-dom)", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = FIXTURE;
    // * The real shipped stylesheet, not a copy — so this test tracks the source.
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  });

  it("focuses the button and keeps the ring inside a scroll-closed overlay", () => {
    const screen = document.getElementById("cr-howto-screen");
    const next = document.getElementById("cr-howto-next");

    next.focus();

    // * Focusability is load-bearing (gamepadNav walks the pager buttons) — the fix
    // * must not have broken it.
    expect(document.activeElement).toBe(next);

    const screenStyle = getComputedStyle(screen);
    // * A fixed, overflow:hidden overlay cannot grow the document's scrollable area.
    expect(screenStyle.position).toBe("fixed");
    expect(screenStyle.overflow).toBe("hidden");

    // * happy-dom cannot evaluate the :focus-visible pseudo-class on a focused element
    // * (computed outline comes back empty), so pin the ring rule straight from the
    // * injected real stylesheet: the ring is kept (2px) but drawn at outline-offset
    // * <= 0, so it cannot bleed past the button — and therefore past the overlay —
    // * to trigger a scroll.
    const ringRule = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .find((rule) => rule.selectorText === ".cr-howto-page:focus-visible");
    expect(ringRule).toBeTruthy();
    // * (happy-dom mangles the outline shorthand in cssRules, so the "ring is kept"
    // * half — outline: 2px solid — is pinned at the source level instead.)
    const offset = parseFloat(ringRule.style.getPropertyValue("outline-offset"));
    expect(Number.isNaN(offset)).toBe(false);
    expect(offset).toBeLessThanOrEqual(0);
  });
});
