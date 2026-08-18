// MENU-ARROW-1 — one keyboard rule on the main menu: arrows move focus,
// Enter activates the focused control. Source asserts because cart-rave-menu.js
// is a DOM module with no harness (same pattern as arenaBrowse / padMenuHints).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const menuSrc = readFileSync(new URL("../../src/ui/cart-rave-menu.js", import.meta.url), "utf8");

/** Body of a nested `function name(...) { ... }` in the menu module. */
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

describe("MENU-ARROW-1 — one keyboard rule", () => {
  it("onMenuNavKeydown does not handle movement keys", () => {
    const body = fnBody(menuSrc, "onMenuNavKeydown");
    expect(body).not.toBe("");
    expect(body).not.toMatch(/ArrowLeft/);
    expect(body).not.toMatch(/ArrowRight/);
    expect(body).not.toMatch(/ArrowUp/);
    expect(body).not.toMatch(/ArrowDown/);
    expect(body).not.toMatch(/case "w"/);
    expect(body).not.toMatch(/case "s"/);
    expect(body).not.toMatch(/pageArena/);
  });

  it("Enter on a focused button is not stolen for the command list", () => {
    const body = fnBody(menuSrc, "onMenuNavKeydown");
    expect(body).toMatch(/focused\.matches\("button, a, \[role='button'\]"\)/);
    const enterArm = body.slice(body.indexOf('case "Enter"'));
    const steal = enterArm.slice(0, enterArm.indexOf("activateMenuSelection"));
    expect(steal).toMatch(/break/);
  });

  it("keyboard hint advertises arrows for navigate and does not claim arena paging", () => {
    const body = fnBody(menuSrc, "updateHintBar");
    expect(body).toMatch(/WASD \/ ARROWS&nbsp; NAVIGATE/);
    expect(body).not.toMatch(/ARENA/);
    expect(body).toMatch(/LB \/ RB&nbsp; PANEL/);
  });
});
