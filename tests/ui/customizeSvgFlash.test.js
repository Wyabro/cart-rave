import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// CUSTOMIZE-SVG-FLASH-PT-1 — Customize must not paint the legacy cartoon SVG
// while the 3D CartPreview chunk is still loading. Wyatt FAIL 08-17: the SVG
// flashed on open (close was already clean). SVG stays only after load/init
// throws.
//
// Source assertions: cart-rave-menu.js is a DOM + Three module with no harness.

const menu = readFileSync(new URL("../../src/ui/cart-rave-menu.js", import.meta.url), "utf8");

function sliceFn(src, name, nextName) {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(`function ${nextName}(`);
  expect(start, `missing ${name}`).toBeGreaterThan(-1);
  expect(end, `missing ${nextName} after ${name}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("CUSTOMIZE-SVG-FLASH-PT-1 — no SVG placeholder on open", () => {
  it("renderCustomizePreview paints makeCartSVG only after CartPreview failed", () => {
    const body = sliceFn(menu, "renderCustomizePreview", "captureOverlayOpener");
    expect(body).toMatch(/if\s*\(\s*!cartPreviewFailed\s*\)\s*return/);
    expect(body).toMatch(/makeCartSVG/);
  });

  it("mountCartPreview does not paint SVG while the chunk loads", () => {
    const body = sliceFn(menu, "mountCartPreview", "wireCustomHueSlider");
    expect(body).not.toMatch(/makeCartSVG/);
    expect(body).toMatch(/cartPreviewFailed\s*=\s*true/);
    expect(body).toMatch(/if \(isCustomizeScreenOpen\(\)\) renderCustomizePreview\(\)/);
  });
});
