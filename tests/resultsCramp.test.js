// @vitest-environment happy-dom
// resultsCramp.test.js — RESULTS-CRAMP-1: between 1101px and 1299px wide the base
// podium (4 x 12.5rem cols + 3 x 1.25rem gaps = 53.75rem) is wider than column 1,
// so the 4th block slides under the PLAY AGAIN / MAIN MENU buttons (measured at
// 1101x641: podium 645px into a ~499px column). The band fix shrinks the podium
// columns + gap so it fits its column. RESULTS-1 floors its desktop band at 1300px,
// so this window only ever saw the base rules.
//
// * Source asserts (same rig as onboardScroll.test.js): parse the REAL results.css +
//   tokens.css and mirror the browser arithmetic — fluid root font-size, panel
//   padding clamps, 4.5rem column gap, 27.5rem rail — to prove the band's podium
//   width fits the column's available width at sampled widths inside the band, and
//   that the pre-fix base podium did NOT.
// * DOM asserts (happy-dom): mirror the podium structure, inject the real stylesheet,
//   and confirm the media query is live in the 1101-1299 band and off outside it.
//
// WHAT THIS CANNOT SEE — happy-dom has zeroed layout, so no real pixel geometry is
// measured; the fit claim is carried by the same arithmetic the browser applies to
// the exact declarations shipped in results.css. The human verdict is the playtest.

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// * happy-dom resolves import.meta.url against the page origin, not a file:// URL —
// * vitest runs from the repo root, so read relative to cwd (friendsJoinFlow pattern).
const resultsCss = readFileSync(resolve(process.cwd(), "src/ui/styles/results.css"), "utf8");
const tokensCss = readFileSync(resolve(process.cwd(), "src/ui/styles/tokens.css"), "utf8");

// * Minimal CSS block walker: every style rule with its enclosing @media query
// * (null for top-level). Comments and non-media at-rules are skipped.
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

const RULES = collectRules(resultsCss);
const BASE_RULES = RULES.filter((r) => r.media === null);
const inCrampBand = (r) =>
  !!r.media &&
  /min-width\s*:\s*1101px/.test(r.media) &&
  /max-width\s*:\s*1299px/.test(r.media);
const CRAMP_RULES = RULES.filter(inCrampBand);

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

// * Later rules win per selector, mirroring cascade order within a media scope.
function cascadeFor(ruleList, selectors) {
  const merged = Object.fromEntries(selectors.map((s) => [s, {}]));
  for (const rule of ruleList) {
    if (merged[rule.selector]) Object.assign(merged[rule.selector], declarations(rule.body));
  }
  return merged;
}

const base = cascadeFor(BASE_RULES, [
  "#results-overlay .results-body",
  "#results-overlay .results-final",
  "#results-overlay .results-podium-col",
]);
const band = cascadeFor(CRAMP_RULES, [
  "#results-overlay .results-final",
  "#results-overlay .results-podium-col",
]);

// * tokens.css root scale: clamp(0.75rem, min(0.84vw, 1.5svh), 1rem) on a 16px
// * user root. Inside 1101-1299px this always floors at 12px.
const ROOT_MATCH = tokensCss.match(
  /html\s*\{[^}]*font-size:\s*clamp\(\s*([\d.]+)rem\s*,\s*min\(\s*([\d.]+)vw\s*,\s*([\d.]+)svh\s*\)\s*,\s*([\d.]+)rem\s*\)/s,
);
function rootFontPx(vw, vh) {
  expect(ROOT_MATCH).not.toBeNull();
  const floorRem = parseFloat(ROOT_MATCH[1]);
  const vwPct = parseFloat(ROOT_MATCH[2]);
  const svhPct = parseFloat(ROOT_MATCH[3]);
  const capRem = parseFloat(ROOT_MATCH[4]);
  const mid = Math.min((vwPct / 100) * vw, (svhPct / 100) * vh);
  return Math.min(capRem * 16, Math.max(floorRem * 16, mid));
}

const COL_GAP_REM = parseFloat(base["#results-overlay .results-body"]["column-gap"]); // 4.5
const RAIL_REM = parseFloat(
  base["#results-overlay .results-body"]["grid-template-columns"].match(/([\d.]+)rem$/)[1],
); // 27.5
const BASE_GAP_REM = parseFloat(base["#results-overlay .results-final"].gap); // 1.25
const BASE_COL_REM = parseFloat(base["#results-overlay .results-podium-col"].width); // 12.5
const BAND_GAP_REM = parseFloat(band["#results-overlay .results-final"].gap); // 0.75
const BAND_COL_REM = parseFloat(band["#results-overlay .results-podium-col"].width); // 9.25

// * Mirror the base desktop layout: column 1 of `minmax(0, 1fr) 27.5rem` with the
// * 4.5rem gutter and the panel's fluid padding, and the podium's intrinsic flex
// * width (4 columns + 3 gaps).
function fitAt(vw, vh) {
  const root = rootFontPx(vw, vh);
  const rem = (n) => n * root;
  const leftPad = Math.min(200, Math.max(24, 0.104 * vw));
  const rightPad = Math.min(180, Math.max(24, 0.094 * vw));
  const content = vw - leftPad - rightPad;
  const column1 = content - rem(COL_GAP_REM) - rem(RAIL_REM);
  const bandPodium = 4 * rem(BAND_COL_REM) + 3 * rem(BAND_GAP_REM);
  const basePodium = 4 * rem(BASE_COL_REM) + 3 * rem(BASE_GAP_REM);
  return { root, column1, bandPodium, basePodium };
}

describe("RESULTS-CRAMP-1 — the band exists with the exact bug-window guards", () => {
  it("covers 1101-1299px for fine pointer, taller than the 640px short-desktop band", () => {
    const bandMedia = [...new Set(CRAMP_RULES.map((r) => r.media))];
    expect(bandMedia.length).toBe(1);
    expect(bandMedia[0]).toMatch(/min-width\s*:\s*1101px/);
    expect(bandMedia[0]).toMatch(/max-width\s*:\s*1299px/);
    expect(bandMedia[0]).toMatch(/min-height\s*:\s*641px/);
    expect(bandMedia[0]).toMatch(/pointer\s*:\s*fine/);
  });

  it("shrinks the podium columns + gap inside the band", () => {
    expect(BAND_COL_REM).toBeLessThan(BASE_COL_REM);
    expect(BAND_GAP_REM).toBeLessThan(BASE_GAP_REM);
    expect(band["#results-overlay .results-podium-col"].width).toBe("9.25rem");
    expect(band["#results-overlay .results-final"].gap).toBe("0.75rem");
  });

  it("leaves the playtest-PASSed neighbour bands in place (RESULTS-1 >=1300, mobile-landscape <=1100)", () => {
    expect(
      RULES.some(
        (r) =>
          !!r.media &&
          /min-width\s*:\s*1300px/.test(r.media) &&
          r.body.includes("max-content"),
      ),
    ).toBe(true);
    expect(RULES.some((r) => !!r.media && /max-width\s*:\s*1100px/.test(r.media))).toBe(true);
  });
});

describe("RESULTS-CRAMP-1 — the band's podium fits its column (source-asserted arithmetic)", () => {
  it.each([1101, 1150, 1200, 1250, 1299])("fits at %ipx wide (root %ipx)", (vw) => {
    const { column1, bandPodium } = fitAt(vw, 800);
    expect(bandPodium).toBeLessThanOrEqual(column1);
  });

  it("would fail on the pre-fix base podium at the tightest width — the test catches the regression", () => {
    const { column1, basePodium, bandPodium } = fitAt(1101, 800);
    expect(basePodium).toBeGreaterThan(column1); // unfixed base overflowed the column
    expect(bandPodium).toBeLessThan(basePodium);
    expect(bandPodium).toBeLessThanOrEqual(column1);
  });
});

describe("RESULTS-CRAMP-1 — the media query is live (happy-dom, real stylesheet)", () => {
  const PODIUM_FIXTURE = `
<div id="results-overlay">
  <div class="results-panel">
    <div class="results-body">
      <div class="results-final">
        <div class="results-podium-col"></div>
        <div class="results-podium-col"></div>
        <div class="results-podium-col"></div>
        <div class="results-podium-col"></div>
      </div>
    </div>
  </div>
</div>
`;
  const QUERY = "(min-width: 1101px) and (max-width: 1299px) and (min-height: 641px)";

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = PODIUM_FIXTURE;
    const style = document.createElement("style");
    style.textContent = resultsCss;
    document.head.appendChild(style);
  });

  it("matches inside the band and not on either side of it", () => {
    window.happyDOM.setViewport({ width: 1200, height: 800 });
    expect(window.matchMedia(QUERY).matches).toBe(true);

    window.happyDOM.setViewport({ width: 1000, height: 800 });
    expect(window.matchMedia(QUERY).matches).toBe(false);

    window.happyDOM.setViewport({ width: 1400, height: 800 });
    expect(window.matchMedia(QUERY).matches).toBe(false);
  });

  it("resolves the band's narrower podium widths inside the band", () => {
    window.happyDOM.setViewport({ width: 1200, height: 800 });
    const col = getComputedStyle(document.querySelector(".results-podium-col"));
    const final = getComputedStyle(document.querySelector(".results-final"));
    // * happy-dom resolves rem against the default 16px root and cascades the
    // * @media band, so the shrink is visible here even with zeroed layout.
    expect(col.width).toBe("148px"); // 9.25rem at the 16px happy-dom root
    expect(final.gap).toBe("0.75rem"); // happy-dom returns gap in declared units
  });
});
