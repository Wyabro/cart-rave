// @vitest-environment happy-dom
// menuShortWin.test.js — MENU-SHORTWIN-1: main-menu command list slides under
// the hint bar on short desktop windows (CrazyGames iframe 1077×606).
//
// * Source asserts: parse the REAL cart-rave-menu.css and pin the short-desktop
//   band that reclaims px title/hero spacing. Cmd padding and the hint bar stay.
//
// WHAT THIS CANNOT SEE — read before trusting a green run:
//   ▸ happy-dom has zeroed layout, so it cannot measure SETTINGS vs the hint bar
//     in pixels. The geometry verdict is MENU-SHORTWIN-PT-1 at 1077×606.
//   ▸ It cannot prove Road Rage / Russo One metrics. Do not invent a row-height
//     budget here (that is a false green).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const menuCss = readFileSync(resolve(process.cwd(), "src/ui/styles/cart-rave-menu.css"), "utf8");

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

const RULES = collectRules(menuCss);
const inShortWinBand = (r) =>
  !!r.media &&
  /min-width\s*:\s*1025px/.test(r.media) &&
  /max-height\s*:\s*640px/.test(r.media);
const SHORT = RULES.filter(inShortWinBand);

describe("MENU-SHORTWIN-1 — short-desktop band exists with the CrazyGames guards", () => {
  it("covers min-width 1025px and max-height 640px (1077×606 in, 907×510 out)", () => {
    const media = [...new Set(SHORT.map((r) => r.media))];
    expect(media.length).toBeGreaterThanOrEqual(1);
    expect(media[0]).toMatch(/min-width\s*:\s*1025px/);
    expect(media[0]).toMatch(/max-height\s*:\s*640px/);
    expect(media[0]).not.toMatch(/max-width/);
  });

  it("tightens hero padding-top and title-stack margin", () => {
    const hero = SHORT.filter((r) => r.selector === ".cr-hero")
      .map((r) => declarations(r.body))
      .reduce((acc, d) => Object.assign(acc, d), {});
    const title = SHORT.filter((r) => r.selector === ".cr-hero .cr-title-stack")
      .map((r) => declarations(r.body))
      .reduce((acc, d) => Object.assign(acc, d), {});
    expect(hero["padding-top"]).toBe("12px");
    expect(title.margin).toBe("4px 0 8px");
  });

  it("does not shrink .cr-cmd padding and does not hide the hint bar or tagline", () => {
    const cmdPad = SHORT.filter((r) => /(^|,)\s*\.cr-cmd\s*($|,)/.test(r.selector));
    expect(cmdPad).toHaveLength(0);
    const hintHide = SHORT.filter((r) => r.selector.includes(".cr-hintbar")).filter((r) =>
      /display\s*:\s*none/.test(r.body),
    );
    expect(hintHide).toHaveLength(0);
    const tagHide = SHORT.filter((r) => r.selector.includes(".cr-tagline")).filter((r) =>
      /display\s*:\s*none/.test(r.body),
    );
    expect(tagHide).toHaveLength(0);
  });
});
