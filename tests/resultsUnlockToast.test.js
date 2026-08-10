// @vitest-environment happy-dom
// resultsUnlockToast.test.js — RESULTS-UNLOCK-TOAST-1: while the results overlay is up, the
// unlock toast (`.cr-unlock-toast`, body-level, bottom-centre anchored) sits on top of the
// podium — across the rank blocks at 1920, over PLAY AGAIN at 390x844. The fix is a placement
// rule scoped `#results-overlay[style*="display: flex"] ~ .cr-unlock-toast` that re-anchors the
// toast clear of the podium only while the overlay is actually visible; the base and --arena /
// --lifted in-match placements are untouched (the HUD-TOAST-Z-1 six stay closed).
//
// * Source asserts (same rig as resultsCramp.test.js): parse the REAL cart-rave-menu.css and
//   mirror the browser arithmetic — the results.css `.results-podium-block` height cap
//   (`min(var(--podium-h), 34vh)`, tallest design height 250) plus the cap above the block and
//   the panel bottom padding — to prove the results `bottom` clears the podium on the sampled
//   desktop heights, and that the coarse/narrow and short-desktop band lifts clear the bottom
//   actions stacks those bands use.
// * DOM asserts (happy-dom): mirror the overlay + toast siblings, inject the real stylesheet,
//   and confirm the attribute gate matches only while the overlay is displayed.
//
// WHAT THIS CANNOT SEE — happy-dom has zeroed layout, so no real pixel geometry is measured;
// the "clears the podium" claim is carried by the same arithmetic the browser applies to the
// exact declarations shipped in the two stylesheets. The human verdict is the playtest.

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// * happy-dom resolves import.meta.url against the page origin, not a file:// URL —
// * vitest runs from the repo root, so read relative to cwd (friendsJoinFlow pattern).
const menuCss = readFileSync(resolve(process.cwd(), "src/ui/styles/cart-rave-menu.css"), "utf8");
const resultsCss = readFileSync(resolve(process.cwd(), "src/ui/styles/results.css"), "utf8");

// * Minimal CSS block walker — every style rule with its enclosing @media query (null for
// * top-level). Comments and non-media at-rules are skipped. (resultsCramp rig.)
function collectRules(css) {
  const rules = [];
  const walk = (text, media) => {
    let i = 0;
    const len = text.length;
    while (i < len) {
      while (i < len && /\s/.test(text[i])) i++;
      if (i < len && text[i] === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        i = end === -1 ? len : end + 2;
        continue;
      }
      if (i >= len) break;
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < len && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@media")) {
        walk(body, head.replace(/^@media\s+/, ""));
      } else if (!head.startsWith("@")) {
        rules.push({ media, selector: head.replace(/\s+/g, " "), body });
      }
      i = j;
    }
  };
  walk(css, null);
  return rules;
}

const RULES = collectRules(menuCss);
const RESULTS_SELECTOR = '#results-overlay[style*="display: flex"] ~ .cr-unlock-toast';

// * Same-result cascade: later rules win per selector within a media scope.
function declarations(body) {
  const decls = {};
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (prop && val) decls[prop] = val;
  }
  return decls;
}
function bottomFor(ruleList) {
  let bottom;
  for (const r of ruleList) {
    if (r.selector === RESULTS_SELECTOR) bottom = declarations(r.body).bottom;
  }
  return bottom;
}

const BASE_BOTTOM = declarations(
  RULES.find((r) => r.media === null && r.selector === ".cr-unlock-toast").body,
).bottom;
const ARENA_BOTTOM = declarations(
  RULES.find((r) => r.media === null && r.selector === ".cr-unlock-toast--arena").body,
).bottom;
const LIFTED_BOTTOM = declarations(
  RULES.find((r) => r.media === null && r.selector === ".cr-unlock-toast.cr-unlock-toast--lifted")
    .body,
).bottom;
const TOP_RESULTS_BOTTOM = bottomFor(RULES.filter((r) => r.media === null));

const COARSE_RESULTS = RULES.filter(
  (r) =>
    !!r.media &&
    r.selector === RESULTS_SELECTOR &&
    /(pointer:\s*coarse)|(max-width:\s*900px)/.test(r.media),
);
const COARSE_BOTTOM = bottomFor(COARSE_RESULTS);
const SHORT_DESK_RESULTS = RULES.filter(
  (r) =>
    !!r.media &&
    r.selector === RESULTS_SELECTOR &&
    /max-height:\s*640px/.test(r.media) &&
    /min-width:\s*769px/.test(r.media) &&
    /pointer:\s*fine/.test(r.media),
);
const SHORT_DESK_BOTTOM = bottomFor(SHORT_DESK_RESULTS);

// * The results.css `.results-podium-block` height formula: the tallest design block is 250px
// * (roundLifecycle PODIUM_HEIGHTS[0]), capped at 34vh, floored at 52px. Mirror it plus the cap
// * above the block (name + emblem + slot lines and their gaps) and the panel's fluid bottom
// * padding to get where the podium's top sits above the viewport bottom.
const REM = 16;
const PODIUM_DESIGN_PX = 250;
const BLOCK_CAP_VH = 34;
const capPx = (vh) =>
  0.6875 * REM + 1.0625 * REM + 0.8 * REM + 2 * Math.min(14, Math.max(4, vh * 0.01));
const panelPadBottomPx = (vh) => Math.min(40, Math.max(20, vh * 0.037));
const blockPx = (vh) => Math.max(52, Math.min(PODIUM_DESIGN_PX, (BLOCK_CAP_VH / 100) * vh));
const podiumTopPx = (vh) => panelPadBottomPx(vh) + blockPx(vh) + capPx(vh);
// * Evaluates a `max(calc(Nvh + Mrem), …)` lift declaration at a concrete viewport height.
const liftPx = (bottomDecl, vh) => {
  const vhVal = bottomDecl.match(/([\d.]+)vh/)?.[1];
  const rem = bottomDecl.match(/([\d.]+)rem/)?.[1];
  if (vhVal === undefined || rem === undefined) throw new Error(`cannot parse bottom: ${bottomDecl}`);
  return (parseFloat(vhVal) / 100) * vh + parseFloat(rem) * REM;
};
// * First rem addend of a `max(12.5rem, …)`-style lift declaration, in px.
const remLiftPx = (bottomDecl) => {
  const rem = bottomDecl.match(/^max\(([\d.]+)rem/)?.[1];
  if (rem === undefined) throw new Error(`cannot parse bottom: ${bottomDecl}`);
  return parseFloat(rem) * REM;
};

describe("RESULTS-UNLOCK-TOAST-1 — the results placement rule exists and is scoped to the visible overlay", () => {
  it("is gated on the overlay's inline display:flex, and keeps the base/in-match rules byte-for-byte", () => {
    expect(RESULTS_SELECTOR).toMatch(
      /^#results-overlay\[style\*="display: flex"\] ~ \.cr-unlock-toast$/,
    );
    expect(TOP_RESULTS_BOTTOM).toBe("max(calc(34vh + 9rem), env(safe-area-inset-bottom, 0px) + 72px)");

    // * In-match / menu placement untouched — the HUD-TOAST-Z-1 six stay closed.
    expect(BASE_BOTTOM).toBe("max(24px, env(safe-area-inset-bottom, 0px) + 16px)");
    expect(ARENA_BOTTOM).toBe("max(88px, env(safe-area-inset-bottom, 0px) + 72px)");
    expect(LIFTED_BOTTOM).toBe("max(var(--cr-toast-lift, 88px), env(safe-area-inset-bottom, 0px) + 72px)");
  });

  it("only re-anchors — it never touches z-index, left, or the --show transform", () => {
    const rule = RULES.find((r) => r.media === null && r.selector === RESULTS_SELECTOR);
    const body = declarations(rule.body);
    expect(body["z-index"]).toBeUndefined();
    expect(body.left).toBeUndefined();
    expect(body.transform).toBeUndefined();
  });

  it("the coarse/narrow and short-desktop bands carry their own lifts under the same gate", () => {
    expect(COARSE_BOTTOM).toBe("max(10.5rem, env(safe-area-inset-bottom, 0px) + 8.5rem)");
    expect(SHORT_DESK_BOTTOM).toBe("max(9.5rem, env(safe-area-inset-bottom, 0px) + 7.5rem)");
    // * Same gate as the top-level rule, not a fork of the anchor — exactly one rule per band.
    expect(COARSE_RESULTS.map((r) => r.selector)).toEqual([RESULTS_SELECTOR]);
    expect(SHORT_DESK_RESULTS.map((r) => r.selector)).toEqual([RESULTS_SELECTOR]);
    expect(COARSE_RESULTS[0].media).toMatch(/(pointer:\s*coarse)|(max-width:\s*900px)/);
    expect(SHORT_DESK_RESULTS[0].media).toMatch(/max-height:\s*640px/);
  });
});

describe("RESULTS-UNLOCK-TOAST-1 — the results lift clears the podium (source-asserted arithmetic)", () => {
  it("is tied to the real block cap in results.css (canary)", () => {
    // * The 34vh lift tracks the actual .results-podium-block formula; if that cap ever
    // * changes, this test names the toast instead of sailing past a frozen snapshot.
    expect(resultsCss).toContain("34vh");
    expect(resultsCss).toMatch(/min\(\s*1\s*,\s*34vh\s*\/\s*250px\s*\)/);
  });

  it.each([600, 641, 720, 768, 900, 1080, 1440])("clears the podium top at %ipx height", (vh) => {
    // * The 34vh cap is shared with the block height, so the lift tracks the podium exactly in
    // * the regime where the blocks are short (34vh < 250px) and clears with room to spare in
    // * the empty band above the blocks in the tall regime.
    expect(liftPx(TOP_RESULTS_BOTTOM, vh)).toBeGreaterThan(podiumTopPx(vh) + 16);
  });

  it("the coarse/narrow lift clears the portrait actions stack", () => {
    // * Portrait actions: safe-area-bottom (34) + panel pad + 2 x 44px buttons + gap. The
    // * toast is allowed over the scrollable receipt, so clearing this is the whole bar.
    const actionsStackPx = 34 + 8 + 44 + 8 + 44;
    expect(remLiftPx(COARSE_BOTTOM)).toBeGreaterThan(actionsStackPx + 16);
    // * Same for a phone with no safe-area inset.
    expect(remLiftPx(COARSE_BOTTOM)).toBeGreaterThan(8 + 8 + 44 + 8 + 44 + 16);
  });

  it("the short-desktop lift clears the sticky actions stack", () => {
    // * Short fine-pointer desktop: actions are sticky at the bottom (results.css row 3).
    expect(remLiftPx(SHORT_DESK_BOTTOM)).toBeGreaterThan(8 + 40 + 44 + 8 + 44);
  });
});

describe("RESULTS-UNLOCK-TOAST-1 — the attribute gate is live (happy-dom, real stylesheet)", () => {
  const FIXTURE = `
<div id="results-overlay" style="display: flex; pointer-events: none;"></div>
<div class="cr-unlock-toast">Green Mirror shades unlocked!</div>
`;
  const GATE = RESULTS_SELECTOR;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = FIXTURE;
    const style = document.createElement("style");
    style.textContent = menuCss;
    document.head.appendChild(style);
  });

  it("targets the toast only while the overlay is displayed", () => {
    const overlay = document.getElementById("results-overlay");
    const toast = document.querySelector(".cr-unlock-toast");

    // * Overlay visible (roundLifecycle writes display:flex) — the toast is re-anchored.
    expect(document.querySelector(GATE)).toBe(toast);
    expect(toast.matches(GATE)).toBe(true);

    // * Overlay hidden (roundLifecycle writes display:none) — the rule drops out.
    overlay.style.display = "none";
    expect(document.querySelector(GATE)).toBeNull();
    expect(toast.matches(GATE)).toBe(false);

    // * And comes back when the overlay returns.
    overlay.style.display = "flex";
    expect(document.querySelector(GATE)).toBe(toast);
    expect(toast.matches(GATE)).toBe(true);
  });

  it("keeps the base placement when the overlay was never shown", () => {
    const toast = document.querySelector(".cr-unlock-toast");
    const overlay = document.getElementById("results-overlay");
    overlay.style.display = "none";
    window.happyDOM.setViewport({ width: 390, height: 844 });
    // * The gate is inert with the overlay hidden — no results lift leaks into the in-match
    // * surface. (happy-dom has zeroed layout, so the base bottom value itself is asserted at
    // * the source level in the first describe block, not here.)
    expect(document.querySelector(GATE)).toBeNull();
    expect(toast.matches(GATE)).toBe(false);
  });
});
