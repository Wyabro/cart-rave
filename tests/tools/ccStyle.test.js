// ccStyle.test.js — the Command Center's shared visual layer.
//
// These four generated surfaces (dashboard · architecture · playtest console · capture
// contact sheets) had NO automated coverage: `npm run arch -- --check` digest-gates the
// JSON only and explicitly skips the gitignored HTML, so `npm run qa` was green no matter
// what the CSS said. The two failures that actually bite are both silent — an undefined
// `var(--token)` renders as nothing (invisible text on a dark page), and a freestyle hex
// drifts a surface away from the others one rule at a time (CC-TOKEN-1).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ROOT_TOKENS,
  BASE_CSS,
  CHROME_CSS,
  CC_SURFACES,
  crossNav,
  esc,
} from "../../tools/lib/ccStyle.mjs";
import { esc as montageEsc } from "../../tools/lib/montage.mjs";

/**
 * Read a generator with every comment removed.
 *
 * Both block (`/* … *\/`, used for CSS section headers) and line (`//`) comments are
 * stripped, because these files document the exact defects being asserted against —
 * archHtml's header cites the `#e0e0ec` it removed, states.mjs's prose quotes the game's
 * `var(--ease-slap)`. Scanning raw text reports the write-up as the offence.
 */
function readCode(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Token names defined in the shared `:root` block. */
const DEFINED = new Set([...ROOT_TOKENS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

/**
 * Custom properties a page legitimately defines for itself rather than sharing.
 * `--accent` is set inline per element from the cart hues; the three `--chrome-*`/
 * `--measure` knobs are CHROME_CSS's documented per-surface overrides.
 */
const PAGE_LOCAL = new Set([
  "--accent",
  "--measure",
  "--chrome-gap",
  "--chrome-pad",
  "--title-glow",
]);

const SHARED_CSS = `${ROOT_TOKENS}\n${BASE_CSS}\n${CHROME_CSS}`;

/** The CSS a generator contributes on top of the shared blocks, comments stripped. */
const PAGE_CSS = {
  "archHtml.mjs": readCode("../../tools/lib/archHtml.mjs"),
  "playtestConsoleHtml.mjs": readCode("../../tools/lib/playtestConsoleHtml.mjs"),
  "montage.mjs": readCode("../../tools/lib/montage.mjs"),
  "dashboard.mjs": readCode("../../tools/dashboard.mjs"),
  "states.mjs": readCode("../../tools/states.mjs"),
};

describe("Command Center design tokens", () => {
  it("every var(--token) a surface references is defined", () => {
    const unresolved = [];
    for (const [file, src] of Object.entries({ shared: SHARED_CSS, ...PAGE_CSS })) {
      for (const m of src.matchAll(/var\((--[\w-]+)/g)) {
        const name = m[1];
        if (DEFINED.has(name) || PAGE_LOCAL.has(name)) continue;
        unresolved.push(`${file}: ${name}`);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("no generator hardcodes a colour outside the token block", () => {
    // * Allowed: pure black/white contrast absolutes (a token for #fff prevents no
    // * drift), and archHtml's CART_ACCENTS, which mirrors the cart hues in
    // * src/config.js — that array must track the GAME palette, not this one.
    const ABSOLUTES = /^#(fff|000|ffffff|000000)$/i;
    const offenders = [];
    for (const [file, src] of Object.entries(PAGE_CSS)) {
      src.split("\n").forEach((line, i) => {
        if (/CART_ACCENTS/.test(line)) return;
        for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
          if (ABSOLUTES.test(m[0])) continue;
          offenders.push(`${file}:${i + 1} ${m[0]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("an rgba() tint agrees with the token it is tinting", () => {
    // * The CC-TOKEN-1 headline defect: `stroke:var(--cyan); fill:rgba(0,243,255,.12)`
    // * in one rule, two different cyans. Alpha washes stay hand-expanded by this file's
    // * convention, so the triplet has to be checked rather than shared.
    const hexOf = (name) => {
      const m = ROOT_TOKENS.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
      expect(m, `${name} missing from ROOT_TOKENS`).toBeTruthy();
      return m[1];
    };
    const rgbOf = (hex) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

    const known = new Map(
      ["--neon", "--cyan", "--violet", "--good", "--bad", "--warn", "--dim"].map((n) => [
        rgbOf(hexOf(n)).replace(/\s/g, ""),
        n,
      ]),
    );
    // Triplets that are close to a token but not equal to it are the drift signal.
    const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 40);
    const tokenRgb = [...known.keys()].map((k) => k.split(",").map(Number));

    const offenders = [];
    for (const [file, src] of Object.entries(PAGE_CSS)) {
      for (const m of src.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)) {
        const rgb = [m[1], m[2], m[3]].map(Number);
        const key = rgb.join(",");
        if (known.has(key)) continue; // exact token tint
        if (rgb[0] === rgb[1] && rgb[1] === rgb[2]) continue; // neutral wash
        if (!tokenRgb.some((t) => near(rgb, t))) continue; // a genuinely new hue
        offenders.push(`${file}: rgba(${key}) is near a token but not equal to it`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Command Center card treatment", () => {
  it("no card wears a thick asymmetric coloured edge", () => {
    // * CC-STRIPE-1. The side-stripe card had spread to four surfaces at three widths
    // * (3px, 4px, 5px) plus a 5px absolutely-positioned <div> in archHtml. A hairline
    // * all round says the same thing without the decorative asymmetry. A 1px
    // * border-left is a divider, not a stripe, so the floor is 2px.
    const offenders = [];
    for (const [file, src] of Object.entries(PAGE_CSS)) {
      for (const m of src.matchAll(/border-(left|right|top|bottom):\s*([2-9]|\d\d)px/g)) {
        offenders.push(`${file}: border-${m[1]}:${m[2]}px`);
      }
      if (/scard-stripe/.test(src)) offenders.push(`${file}: scard-stripe element`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Command Center label hierarchy", () => {
  it("micro-caps are reserved for section heads, the nav and state badges", () => {
    // * CC-LABEL-1: nine rules all resolved to uppercase + letterspaced + var(--dim),
    // * so nothing outranked anything. This allowlist IS the convention — adding a
    // * selector to it should be a deliberate call, not a side effect of a styling pass.
    const ALLOWED = [
      "h2.sec", // true section head
      "details.ref summary", // disclosure title
      ".rules h2", // console's one section head
      ".nav-links", // chrome nav
      ".card-status", // state badge, not a label
      ".card-rig", // "2 PC" rig badge — state, same rank as .card-status
      ".stlabel", // capture-sheet state chip
      ".q-badge", // dashboard state badge
      ".tier-id", // monospace id token
      ".mission-head", // display type
      ".touch-lbl", // arch map legend
      "h2", // montage/states section heads
      "h4", // panel sub-heads (.eg-col, .digrid)
      ".kick", // arch section head (rule-line divider)
      ".map-toolbar-title", // flow-map panel head
      ".fstep b", // flow-step title
      ".pri", // priority badge
      ".ph", // phase badge
    ];
    const offenders = [];
    for (const [file, src] of Object.entries({ shared: SHARED_CSS, ...PAGE_CSS })) {
      for (const m of src.matchAll(/([^{}\n]+)\{([^{}]*text-transform:\s*uppercase[^{}]*)\}/g)) {
        const selector = m[1].trim().split("\n").pop().trim();
        if (ALLOWED.some((a) => selector.includes(a))) continue;
        offenders.push(`${file}: ${selector}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the five field labels are sentence case", () => {
    for (const rule of [
      /\.k \{[^}]*\}/,
      /\bth \{[^}]*\}/,
    ]) {
      const m = SHARED_CSS.match(rule);
      expect(m, `rule not found: ${rule}`).toBeTruthy();
      expect(m[0]).not.toMatch(/text-transform:\s*uppercase/);
    }
    // * Playtest console keeps a single field label (.note-label); meta/evidence chrome was removed.
    const console_ = PAGE_CSS["playtestConsoleHtml.mjs"];
    const m = console_.match(/\.card\s+\.note-label\s*\{[^}]*\}/);
    expect(m, "rule not found: .card .note-label").toBeTruthy();
    expect(m[0]).not.toMatch(/text-transform:\s*uppercase/);
  });
});

describe("CC-ESC-1 — one HTML-escaper for every generated surface", () => {
  it("escapes all five reserved characters, apostrophe included", () => {
    expect(esc(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("montage's esc is the exact same function as ccStyle's, not a lookalike copy", () => {
    // A wrapper would pass a behaviour test like the one above and still silently
    // re-diverge later; reference identity is what actually rules that out.
    expect(montageEsc).toBe(esc);
  });
});

describe("Command Center cross-surface nav", () => {
  it("renders one entry per surface, with the active one unlinked", () => {
    const html = crossNav("playtest");
    for (const s of CC_SURFACES) expect(html).toContain(s.label);
    expect(html).toMatch(/<a class="active" aria-current="page">/);
    expect((html.match(/<a /g) ?? []).length).toBe(CC_SURFACES.length);
  });

  it("uses inline SVG icons in one stroke voice, not emoji", () => {
    // * CC-ICON-1: emoji are rendered by the OS, so the nav read differently on every
    // * machine. currentColor is what makes the icons inherit hover/active for free.
    const html = crossNav("architecture");
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect((html.match(/<svg /g) ?? []).length).toBe(CC_SURFACES.length);
    for (const s of CC_SURFACES) {
      expect(s.icon, s.id).toMatch(/stroke="currentColor"/);
      expect(s.icon, s.id).toMatch(/viewBox="0 0 16 16"/);
      expect(s.icon, s.id).toMatch(/stroke-width="1\.6"/);
      // Decorative: the adjacent text label already names the surface.
      expect(s.icon, s.id).toMatch(/aria-hidden="true"/);
    }
  });
});
