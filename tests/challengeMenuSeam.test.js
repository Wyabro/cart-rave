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
    // * CHAL-MENU-REBUILD-1: the store subscribe must be gated on panel visibility —
    // * the bare form rebuilds the hidden shelf on every mid-round progress event.
    expect(menu).not.toContain('challengeStore.subscribe(renderChallengesPanel)');
  });

  it("keeps normal phones one-column but packs narrow portrait shelves two-up", () => {
    expect(styles).toMatch(/\.cr-chal-section-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
    expect(styles).toMatch(/\.cr-chal-section-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(styles).toMatch(/@media \(max-width: 480px\) and \(orientation: portrait\)\s*\{[\s\S]*?\.cr-challenges-panel \.cr-chal-section-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
    expect(styles).toMatch(/@media \(max-width: 480px\) and \(orientation: portrait\)\s*\{[\s\S]*?\.cr-challenges-panel \.cr-screen-actions\s*\{\s*grid-row:\s*3/);
  });
});
