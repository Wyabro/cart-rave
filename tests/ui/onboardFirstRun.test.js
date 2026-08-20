// onboardFirstRun.test.js — ONBOARD-FLAG-1: the first-run HOW TO PLAY "seen" flag.
//
// * Source asserts, same rig as arenaBrowse.test.js / toastLayering.test.js: cart-rave-menu.js
// * is a ~2.4k-line DOM module with no test harness, so these pin the STRUCTURE that makes the
// * behaviour possible rather than the behaviour itself.
// *
// * WHAT THIS CANNOT SEE — read before trusting a green run:
// *   ▸ It never opens the overlay and never touches localStorage. A refactor that keeps the
// *     write inside openHowToScreen but breaks the attract lifecycle passes here and fails
// *     in a browser.
// *   ▸ It cannot prove the flag is READ correctly on the next launch.
// *   ▸ The real verdict is ONBOARD-FLAG-PT-1 on prod, which is why that card exists.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../../src/ui/cart-rave-menu.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/ui/styles/cart-rave-menu.css", import.meta.url), "utf8");
const animations = readFileSync(new URL("../../src/animations.js", import.meta.url), "utf8");

/** Body of a top-level `function name(...) { ... }` in the menu module. */
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

/** Body of an object method `name() { ... }` in the menu API. */
function methodBody(src, name) {
  const start = src.indexOf(`${name}() {`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

const WRITE = /storageSet\(\s*STORAGE_KEYS\.howtoSeen/;

describe("ONBOARD-FLAG-1 — howtoSeen is stamped on open, not on arm", () => {
  it("does not write the flag while applying the attract state", () => {
    const body = fnBody(menu, "applyHowToAttract");
    expect(body).not.toBe("");
    // * Attraction is only an invitation; treating it as a view loses the tutorial unseen.
    expect(body).not.toMatch(WRITE);
    // * The seen flag and current URL are re-read on each presentation.
    expect(body).toMatch(/storageGet\(\s*STORAGE_KEYS\.howtoSeen/);
    expect(body).toMatch(/URLSearchParams/);
    expect(body).toMatch(/classList\.toggle\("cr-cmd--howto-attract"/);
  });

  it("writes the flag inside openHowToScreen", () => {
    const body = fnBody(menu, "openHowToScreen");
    expect(body).not.toBe("");
    expect(body).toMatch(WRITE);
  });

  it("writes it AFTER both early returns, so a bail cannot mark it seen", () => {
    const body = fnBody(menu, "openHowToScreen");
    const write = body.search(WRITE);
    const missingElementGuard = body.indexOf("if (!howtoScreen) return;");
    // * The phase guard is the subtle one: the timer can fire while a round is starting, and
    // * openHowToScreen bails without rendering. A write above it re-creates the original bug
    // * for that path — flag set, overlay never shown.
    const phaseGuard = body.indexOf('phase === "running"');

    expect(missingElementGuard).toBeGreaterThan(-1);
    expect(phaseGuard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(missingElementGuard);
    expect(write).toBeGreaterThan(phaseGuard);
  });

  it("is the only write site in the module", () => {
    // * Two writers would let one of them drift back to arm time unnoticed.
    expect(menu.match(new RegExp(WRITE.source, "g"))).toHaveLength(1);
  });

  it("clears attraction only after openHowToScreen's early-return guards", () => {
    const body = fnBody(menu, "openHowToScreen");
    const clear = body.indexOf("clearHowToAttract()");
    expect(clear).toBeGreaterThan(body.indexOf("if (!howtoScreen) return;"));
    expect(clear).toBeGreaterThan(body.indexOf('phase === "running"'));
  });
});

describe("ONBOARD-ATTRACT-1 — first-run guidance never takes over the menu", () => {
  it("applies on animated and quit-to-menu presentations", () => {
    expect(methodBody(menu, "show")).toMatch(/applyHowToAttract\(\)/);
    expect(methodBody(menu, "revealShell")).toMatch(/applyHowToAttract\(\)/);
  });

  it("stands down when the menu hides", () => {
    expect(methodBody(menu, "hide")).toMatch(/clearHowToAttract\(\)/);
  });

  it("does not let menu entrance wipe command-row skew", () => {
    // * animateMenuCardEnter writes translateY/scale on the row and leaves the
    // * label's counter-skew, so SOLO…SETTINGS lean left. fadeIn is opacity-only.
    const body = fnBody(menu, "playMenuEntrance");
    expect(body).not.toMatch(/animateMenuCardEnter\(\s*cmdRows/);
    expect(body).toMatch(/removeProperty\("transform"\)/);
    expect(body).toMatch(/fadeIn\(\s*row/);
  });

  it("uses a tracked smooth loop while reduced motion keeps only the static glow", () => {
    const start = fnBody(animations, "animateHowToAttract");
    expect(start).toMatch(/--cr-howto-beat/);
    expect(start).toMatch(/duration:\s*680/);
    expect(start).toMatch(/loop:\s*true/);
    expect(start).toMatch(/ease:\s*"inOutSine"/);
    expect(fnBody(menu, "animLoop")).not.toMatch(/--cr-howto-beat/);
    expect(fnBody(menu, "applyHowToAttract")).toMatch(/animateHowToAttract/);
    expect(fnBody(menu, "clearHowToAttract")).toMatch(/stopHowToAttract/);
    expect(css).toMatch(/\.cr-cmd--howto-attract \.cr-btn-label\s*\{[^}]*--cr-howto-beat[^}]*text-shadow:/s);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.cr-cmd--howto-attract \.cr-btn-label\s*\{[^}]*transform:\s*skewX\(8deg\) !important/);
  });
});

// ONBOARD-SLIDES-1 — the wall of text became a five-slide deck, which put the flag above
// at risk in a new way: `howtoSeen` is still stamped on OPEN, so if the focused primary
// button closed the overlay the way it used to, a first-run player's single most likely
// keypress would spend their only tutorial on 1 rule out of 5. The primary paging instead
// of closing is what makes stamp-on-open still honest, so it is pinned here.
describe("ONBOARD-SLIDES-1 — the deck cannot be skipped by the default action", () => {
  it("reopens on the first slide, never where the player left off", () => {
    // * Reopening on AISLE 4 would mean a player who bailed once can never see 1-3 again
    // * without clearing site data — the flag stops the auto-open from ever returning.
    const body = fnBody(menu, "openHowToScreen");
    expect(body).toMatch(/showHowToSlide\(\s*0\b/);
  });

  it("renders the controls chips for the live input mode on open", () => {
    // * WASD/SHIFT/SPACE is wrong copy on a phone when the player opens the guide there.
    expect(fnBody(menu, "openHowToScreen")).toMatch(/renderHowToControls\(/);
    expect(menu).toMatch(/HOWTO_CONTROLS\s*=\s*\{/);
    for (const mode of ["keyboard", "gamepad", "touch"]) {
      expect(menu).toMatch(new RegExp(`${mode}:\\s*\\[`));
    }
  });

  it("wires the primary to page forward and only close on the last slide", () => {
    const body = fnBody(menu, "initHowToScreen");
    expect(body).not.toBe("");
    // * The pre-slides listener closed unconditionally. Left in place beside the new
    // * handler, a NEXT click would page AND dismiss — so assert the close is guarded.
    const done = body.slice(body.indexOf("howtoDoneBtn?.addEventListener"));
    expect(done).toMatch(/howtoSlideIndex\s*<\s*howtoSlides\.length\s*-\s*1/);
    expect(done).toMatch(/pageHowTo\(1\)/);
    expect(done).toMatch(/closeHowToScreen\(\{ userDismissed: true \}\)/);
  });

  it("clamps at both ends — a tutorial must not wrap 5 back to 1", () => {
    // * pageArena's wrap-around is right for arenas and wrong here: looping to AISLE 1
    // * reads as "there is more content", so the deck ends instead.
    const body = fnBody(menu, "showHowToSlide");
    expect(body).not.toBe("");
    expect(body).toMatch(/Math\.max\(\s*0\s*,\s*Math\.min\(/);
    expect(body).not.toMatch(/%\s*howtoSlides\.length/);
  });
});

// ONBOARD-ART-1 — art is a drop-in directory, not a code wave. `import.meta.glob` sees
// `src/assets/howto/<token>.webp` at build time, and hydrateHowToArt() sets `data-art`
// only when a file resolved behind the slot's token; every art rule in the CSS keys on
// that attribute. Dropping a file therefore needs no HTML/CSS edit, and a slot with no
// file stays exactly as dark as the shipped deck.
describe("ONBOARD-ART-1 — the drop-in art rig", () => {
  it("discovers the art by token-constrained glob and hydrates at init, not per slide", () => {
    expect(menu).toMatch(/import\.meta\.glob\(\s*["']\.\.\/assets\/howto\//);
    expect(menu).toMatch(/assets\/howto\/\{drive,boost,ram,hud,cargo\}\.\{webp,still\.webp\}/);
    expect(menu).toMatch(/howtoArt\.get/);
    expect(fnBody(menu, "initHowToScreen")).toMatch(/hydrateHowToArt\(\)/);
    // * Hydrating inside showHowToSlide would reflow the column layout mid-reveal.
    expect(fnBody(menu, "showHowToSlide")).not.toMatch(/hydrateHowToArt/);
  });

  it("sets data-art only on the branch where a token resolved", () => {
    const body = fnBody(menu, "hydrateHowToArt");
    expect(body).not.toBe("");
    // * The miss path must skip the slot untouched — writing data-art there would turn
    // * the CSS gate back into today's all-or-nothing switch.
    expect(body).toMatch(/if \(!art\s*\|\|\s*!\(art\.motion\s*\|\|\s*art\.still\)\) continue;/);
    expect(body).toMatch(/dataset\.art\s*=\s*["']1["']/);
  });

  it("swaps to the still when reduced motion is on and one exists, else falls back", () => {
    const body = fnBody(menu, "startHowToArtForSlide");
    expect(body).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(body).toMatch(/art\.still/);
    // * The playback helper owns still-only and missing-still behavior now; integration
    // * must pass both URLs rather than collapsing them before the verdict window.
    expect(body).toMatch(/motionUrl:\s*art\.motion/);
    expect(body).toMatch(/stillUrl:\s*art\.still/);
  });

  it("gates every art rule on the data-art attribute", () => {
    // * The old ART SLOTS OFF block hid every slot with a bare display:none and
    // * re-collapsed the two-column rules. Both must now key on data-art, or a
    // * framed-but-artless slot reserves an empty 28rem column.
    expect(css).toMatch(/\.cr-howto-slide-media:not\(\[data-art\]\)\s*\{\s*display:\s*none;\s*\}/);
    expect(css).toMatch(/\.cr-howto-slide:has\(\.cr-howto-slide-media\[data-art\]\)/);
    expect(css).toMatch(/\.cr-howto-slide:has\(\.cr-howto-slide-media--hud\[data-art\]\)/);
    // * The paired all-or-nothing override (media + --hud back to one column) is gone;
    // * the phone bands' single-column rules are intentionally left alone.
    expect(css).not.toMatch(/\.cr-howto-slide:has\(\.cr-howto-slide-media\),[\s\S]{0,80}\.cr-howto-slide:has\(\.cr-howto-slide-media--hud\)/);
    // * Every :has() gate — desktop, phone and landscape bands — keys on the art
    // * attribute. A bare :has(.cr-howto-slide-media) would re-open the empty-column
    // * trap AND lose to the rekeyed desktop rule on specificity, which on a phone
    // * squeezed an art slide into `286px 0px` columns (copy column invisible).
    expect(css).not.toMatch(/cr-howto-slide-media\)/);
  });
});

describe("ONBOARD-WEBP-1 — visible playback and fallback integration", () => {
  it("routes visible slides through the bounded playback controller", () => {
    expect(menu).toMatch(/import\s*\{\s*startHowToArtPlayback\s*\}\s*from\s*["']\.\/howToArtPlayback\.js["']/);
    expect(fnBody(menu, "showHowToSlide")).toMatch(/startHowToArtForSlide\(shown\)/);
    expect(fnBody(menu, "closeHowToScreen")).toMatch(/stopHowToArtPlayback\(\)/);
  });

  it("reserves resolved art layout without mounting hidden images", () => {
    const body = fnBody(menu, "hydrateHowToArt");
    expect(body).toMatch(/art\.motion\s*\|\|\s*art\.still/);
    expect(body).toMatch(/dataset\.art\s*=\s*["']1["']/);
    expect(body).not.toMatch(/createElement\(["']img["']\)/);
    expect(body).not.toMatch(/append\(img\)/);
  });

  it("records one bounded verdict with the existing diagnostics seam", () => {
    const body = fnBody(menu, "startHowToArtForSlide");
    expect(body).toMatch(/startHowToArtPlayback\(/);
    expect(body).toMatch(/recordDiagEvent\(["']ui["']\s*,\s*["']howto_art["']/);
    expect(body).toMatch(/status:\s*verdict\.status/);
    expect(body).toMatch(/reason:\s*verdict\.reason/);
  });
});
