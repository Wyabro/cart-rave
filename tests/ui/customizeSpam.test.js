import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// CUSTOMIZE-SPAM-1 — keep-alive pause/resume. Rapid Customize open/close must
// not create a second WebGL context. Source asserts: cart-rave-menu.js has no harness.

const menu = readFileSync(new URL("../../src/ui/cart-rave-menu.js", import.meta.url), "utf8");

function sliceFn(src, name, nextName) {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(`function ${nextName}(`);
  expect(start, `missing ${name}`).toBeGreaterThan(-1);
  expect(end, `missing ${nextName} after ${name}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("CUSTOMIZE-SPAM-1 — keep-alive Customize preview", () => {
  it("mountCartPreview reuses a live instance and does not stack imports", () => {
    const body = sliceFn(menu, "mountCartPreview", "wireCustomHueSlider");
    expect(body).toMatch(/if \(cartPreview\)/);
    expect(body).toMatch(/cartPreview\.resume\(\)/);
    expect(body).toMatch(/syncCartPreviewLook\(false\)/);
    expect(body).toMatch(/if \(cartPreviewMountPromise\) return/);
    expect(body).toMatch(/const gen = \+\+cartPreviewMountGen/);
    expect(body).toMatch(/if \(gen !== cartPreviewMountGen\) return/);
    expect(body).toMatch(/customizePreviewMount/);
    expect(body).not.toMatch(/makeCartSVG/);
    expect(body).toMatch(/cartPreviewFailed\s*=\s*true/);
    expect(body).toMatch(/if \(isCustomizeScreenOpen\(\)\) renderCustomizePreview\(\)/);
  });

  it("keep-alive close pauses; exit close disposes both previews", () => {
    const body = sliceFn(menu, "closeCustomizeScreen", "initCustomizeScreen");
    expect(body).toMatch(/release\s*=\s*false/);
    expect(body).toMatch(/cartPreview\?\.pause\(\)/);
    expect(body).toMatch(/disposeCartPreview\(\)/);
    expect(body).toMatch(/releaseMenuCartPreview/);
    expect(body).toMatch(/if \(!release\)/);
    expect(body).toMatch(/setMenuCartPreviewSuspended\?\.\(false\)/);
  });

  it("menu-exit sites pass release: true", () => {
    expect(menu).toMatch(/cartrave:round-started[\s\S]*?closeCustomizeScreen\(\{\s*release:\s*true\s*\}\)/);
    expect(menu).toMatch(/hide\(\)\s*\{[\s\S]*?closeCustomizeScreen\(\{\s*release:\s*true\s*\}\)/);
    expect(menu).toMatch(/hide\(\)\s*\{[\s\S]*?releaseMenuCartPreview/);
  });
});
