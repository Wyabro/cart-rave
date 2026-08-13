import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const menu = readFileSync(new URL("../src/ui/cart-rave-menu.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/ui/styles/cart-rave-menu.css", import.meta.url), "utf8");

describe("CHALLENGE-EXPAND-1 menu seams", () => {
  it("renders cadence shelves and keeps the six-card view live", () => {
    expect(menu).toContain('section.dataset.challengeType = type');
    expect(menu).toContain('sectionTitle.textContent = `${label} · ${items.length}`');
    expect(menu).toContain('challengeStore.getState().checkRotations();');
    expect(menu).toContain('challengesRestockTimerId = setInterval');
  });

  it("gives the shelves their own desktop and mobile grid rules", () => {
    expect(styles).toMatch(/\.cr-chal-section-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
    expect(styles).toMatch(/\.cr-chal-section-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});
