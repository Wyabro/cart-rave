import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const menu = readFileSync(new URL("../src/cart-rave-menu.js", import.meta.url), "utf8");
const input = readFileSync(new URL("../src/input.js", import.meta.url), "utf8");

describe("main-menu mute keyboard ownership", () => {
  it("leaves M to the shared input handler instead of toggling it a second time", () => {
    expect(menu).not.toContain("toggleMenuMute");
    expect(menu).not.toMatch(/case\s+["']m["']\s*:\s*case\s+["']M["']/);
    expect(input).toMatch(/if\s*\(e\.code\s*===\s*["']KeyM["']\)/);
  });
});
