// * Pins the selector parser behind `npm run states` (FIGHT-VERIFY-1 Phase B). The sweep
// * enumerates hover/press/focus rules from the LIVE CSSOM rather than a hand-written list,
// * so a parser bug does not fail loudly — it silently drops selectors from the sweep and
// * every remaining check still goes green. These cases are therefore the REAL selector
// * strings from src/**/*.css, not invented ones, plus the two functional-pseudo forms the
// * repo does not have yet (see the note on `:is(a, b)` below).
import { describe, it, expect } from "vitest";
import {
  parseRuleSelectors,
  parseStateSelector,
  scanCompound,
  splitCompounds,
  splitSelectorList,
} from "../tools/lib/selectors.mjs";

describe("splitSelectorList", () => {
  it("splits a plain list", () => {
    expect(splitSelectorList(".cr-btn:hover, .cr-reroll:hover")).toEqual([
      ".cr-btn:hover",
      ".cr-reroll:hover",
    ]);
  });

  it("keeps the loadingScreen.css ring rule's ten selectors intact", () => {
    // src/ui/loadingScreen.css:577-578 — the unscoped gamepad ring. Five state halves and
    // five .gamepad-focused twins in one rule.
    const text =
      'button:focus-visible, a:focus-visible, [role="button"]:focus-visible, input:focus-visible, select:focus-visible,'
      + " button.gamepad-focused, a.gamepad-focused, [role=\"button\"].gamepad-focused, input.gamepad-focused, select.gamepad-focused";
    expect(splitSelectorList(text)).toHaveLength(10);
    const { parsed, skipped } = parseRuleSelectors(text);
    expect(parsed).toHaveLength(5);
    expect(skipped).toHaveLength(5);
    expect(parsed.map((p) => p.queryBase)).toEqual(["button", "a", '[role="button"]', "input", "select"]);
  });

  // * NOT live in this repo as of 2026-07-31 — the plan asserted `cart-rave-menu.css:529` and
  // * `:1771` were comma-in-`:not()` cases and they are not (they are chained single-argument
  // * `:not()`s, covered separately below). These are synthetic, and they are here so the
  // * depth-aware split cannot be "simplified" away by a later author who greps the CSS,
  // * finds no commas inside parens, and concludes the guard is dead weight.
  it("does not split commas nested inside a functional pseudo", () => {
    expect(splitSelectorList(":is(.a, .b):hover, .c:active")).toEqual([":is(.a, .b):hover", ".c:active"]);
    expect(splitSelectorList(".x:not(.a, .b):hover")).toEqual([".x:not(.a, .b):hover"]);
  });

  it("does not split a comma inside an attribute value", () => {
    expect(splitSelectorList('[data-k="a,b"]:hover, .c:hover')).toEqual(['[data-k="a,b"]:hover', ".c:hover"]);
  });
});

describe("splitCompounds", () => {
  it("splits on descendant whitespace", () => {
    expect(splitCompounds("#results-overlay .results-btn:hover")).toEqual([
      { combinator: "", text: "#results-overlay" },
      { combinator: " ", text: ".results-btn:hover" },
    ]);
  });

  it("splits on child/sibling combinators with or without surrounding space", () => {
    expect(splitCompounds("a>b").map((c) => c.combinator)).toEqual(["", ">"]);
    expect(splitCompounds("a > b").map((c) => c.text)).toEqual(["a", "b"]);
    expect(splitCompounds("a ~ b + c").map((c) => c.combinator)).toEqual(["", "~", "+"]);
  });

  it("ignores combinator characters nested inside parens and quotes", () => {
    expect(splitCompounds(':is(a > b):hover')).toHaveLength(1);
    expect(splitCompounds('[data-k="a>b"]:hover')).toHaveLength(1);
  });
});

describe("scanCompound", () => {
  it("treats a functional pseudo as one opaque token", () => {
    const { head, parts } = scanCompound(".cr-level-btn:hover:not(.cr-level-btn--disabled)");
    expect(head).toBe(".cr-level-btn");
    expect(parts.map((p) => p.raw)).toEqual([":hover", ":not(.cr-level-btn--disabled)"]);
  });

  it("classifies :: as a pseudo-element and the legacy single colon too", () => {
    expect(scanCompound(".a::before").parts[0].kind).toBe("element");
    expect(scanCompound(".a:before").parts[0].kind).toBe("element");
    expect(scanCompound(".a:hover").parts[0].kind).toBe("class");
  });
});

describe("parseStateSelector — real rules from src/**/*.css", () => {
  it("cart-rave-menu.css:178 — the simplest form", () => {
    const p = parseStateSelector(".cr-kbm-toast-close:hover");
    expect(p).toMatchObject({
      state: "hover",
      queryBase: ".cr-kbm-toast-close",
      fullBase: ".cr-kbm-toast-close",
      descendantDelta: false,
      pseudoElement: null,
    });
  });

  it("cart-rave-menu.css:529 — chained :not() survives stripping", () => {
    // The plan called this a comma-in-:not() case. It is not; it is one argument. What DOES
    // matter is that stripping `:hover` must not disturb the `:not()` that follows it.
    const p = parseStateSelector(".cr-level-btn:hover:not(.cr-level-btn--disabled)");
    expect(p.queryBase).toBe(".cr-level-btn:not(.cr-level-btn--disabled)");
    expect(p.state).toBe("hover");
  });

  it("cart-rave-menu.css:1771 — two chained :not()s", () => {
    const p = parseStateSelector(".cr-customize-tab:hover:not(.active):not(.cr-customize-tab--soon)");
    expect(p.queryBase).toBe(".cr-customize-tab:not(.active):not(.cr-customize-tab--soon)");
  });

  it("cart-rave-menu.css:3405 — the delta lands on a DESCENDANT, not the hovered node", () => {
    // This is the case a self-or-::before fingerprint gets wrong. `.cr-btn.cr-cmd:hover` is
    // byte-identical to its rest state on purpose (`:3406-3416`), so the main menu's primary
    // control only proves it reacts through `.cr-btn-label`.
    const p = parseStateSelector(".cr-cmd:hover .cr-btn-label");
    expect(p.queryBase).toBe(".cr-cmd");
    expect(p.fullBase).toBe(".cr-cmd .cr-btn-label");
    expect(p.declaredOn).toBe(".cr-btn-label");
    expect(p.descendantDelta).toBe(true);
  });

  it("cart-rave-menu.css:3411 — two classes on one compound", () => {
    expect(parseStateSelector(".cr-btn.cr-cmd:focus-visible")).toMatchObject({
      state: "focus-visible",
      queryBase: ".cr-btn.cr-cmd",
      descendantDelta: false,
    });
  });

  it("results.css:519 — a pseudo-element is recorded and dropped from the query", () => {
    const p = parseStateSelector("#results-overlay .results-btn:focus-visible::before");
    expect(p.queryBase).toBe("#results-overlay .results-btn");
    expect(p.fullBase).toBe("#results-overlay .results-btn");
    expect(p.pseudoElement).toBe("::before");
    expect(p.descendantDelta).toBe(false);
  });

  it("hud.css:823 — id-scoped descendant", () => {
    expect(parseStateSelector("#hud .hud-mute-btn:hover").queryBase).toBe("#hud .hud-mute-btn");
  });

  it("pauseOverlay.css:138 — three-deep descendant chain", () => {
    expect(parseStateSelector("#esc-overlay .esc-actions .esc-btn:hover").queryBase).toBe(
      "#esc-overlay .esc-actions .esc-btn",
    );
  });

  it("loadingScreen.css:577 — a bare element selector leaves an empty head, not an empty string", () => {
    expect(parseStateSelector("button:focus-visible").queryBase).toBe("button");
    expect(parseStateSelector(":focus-visible").queryBase).toBe("*");
  });

  it("returns null for a selector with no state pseudo", () => {
    expect(parseStateSelector("button.gamepad-focused")).toBeNull();
    expect(parseStateSelector(".cr-cmd.is-selected .cr-btn-label")).toBeNull();
  });

  it("does not treat :hover inside :not() as a drivable state", () => {
    expect(parseStateSelector(".a:not(:hover)")).toBeNull();
    const p = parseStateSelector(".a:not(:hover):active");
    expect(p.state).toBe("active");
    expect(p.queryBase).toBe(".a:not(:hover)");
  });

  it("flags a selector carrying two different states", () => {
    const p = parseStateSelector(".a:hover .b:active");
    expect(p.multiState).toBe(true);
    expect(p.states).toEqual(["hover", "active"]);
    expect(p.queryBase).toBe(".a .b");
  });
});
