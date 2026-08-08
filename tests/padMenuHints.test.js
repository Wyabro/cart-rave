import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PAD-MENU-1: the four sub-screen hint rows (.cr-screen-hint) author both a
// keyboard and a gamepad variant in the markup and flip via data-mode, driven
// from the same input-mode hook as the main hint bar. Source-level checks keep
// the seam honest without booting cart-rave-menu.js (three.js, GLTF, …) — same
// pattern as gamepadLobbyNavWiring.test.js.
const menuSrc = readFileSync(new URL("../src/cart-rave-menu.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("PAD-MENU-1 sub-screen hint mode swap", () => {
  it("every .cr-screen-hint row authors matching kb and pad variants with a kb default", () => {
    const kb = (indexHtml.match(/data-hint-kb/g) ?? []).length;
    const pad = (indexHtml.match(/data-hint-pad/g) ?? []).length;
    expect(kb).toBeGreaterThanOrEqual(4);
    expect(pad).toBe(kb);
    expect(indexHtml.match(/class="cr-screen-hint" data-mode="kb"/g) ?? []).toHaveLength(4);
  });

  it("updateScreenHints rides the same input-mode hook as updateHintBar", () => {
    expect(menuSrc).toContain("function updateScreenHints()");
    const hook = menuSrc.match(/onInputModeChange\(\(\) => \{[^}]*\}\)/)?.[0] ?? "";
    expect(hook).toContain("updateHintBar()");
    expect(hook).toContain("updateScreenHints()");
  });
});
