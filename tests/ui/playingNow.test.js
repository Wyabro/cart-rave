// QP-PLAYING-1 — menu pill hide/show + markup seam.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyPlayingNowPill,
  formatPlayingNowLabel,
  parsePlayingCount,
} from "../../src/ui/playingNow.js";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const menuSrc = readFileSync(new URL("../../src/ui/cart-rave-menu.js", import.meta.url), "utf8");

describe("parsePlayingCount", () => {
  it("floors a positive n and treats everything else as 0", () => {
    expect(parsePlayingCount({ n: 3 })).toBe(3);
    expect(parsePlayingCount({ n: 3.9 })).toBe(3);
    expect(parsePlayingCount({ n: 0 })).toBe(0);
    expect(parsePlayingCount({ n: -1 })).toBe(0);
    expect(parsePlayingCount({ n: "3" })).toBe(0);
    expect(parsePlayingCount(null)).toBe(0);
    expect(parsePlayingCount({})).toBe(0);
  });
});

describe("applyPlayingNowPill", () => {
  it("shows N PLAYING NOW and hides at 0 without rewriting the same label", () => {
    const el = { hidden: true, textContent: "" };
    applyPlayingNowPill(el, 3);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("3 PLAYING NOW");
    expect(formatPlayingNowLabel(3)).toBe("3 PLAYING NOW");

    const before = el.textContent;
    applyPlayingNowPill(el, 3);
    expect(el.textContent).toBe(before);

    applyPlayingNowPill(el, 0);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });
});

describe("QUICKPLAY markup", () => {
  it("keeps ONLINE and adds a hidden playing pill next to the label", () => {
    expect(html).toMatch(
      /id="cr-quickplay"[\s\S]*cr-btn-label">QUICKPLAY[\s\S]*id="cr-cmd-playing"[\s\S]*cr-cmd-qual">ONLINE/,
    );
    expect(html).toContain('aria-live="polite"');
  });

  it("starts the poll with the menu and stops it on hide", () => {
    expect(menuSrc).toContain("startPlayingNowPoll()");
    expect(menuSrc).toContain("stopPlayingNowPoll()");
    expect(menuSrc).toContain("PLAYING_COUNT_PATH");
  });
});
