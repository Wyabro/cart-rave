// @vitest-environment happy-dom
// FRIENDS-JOIN-1 — the join flow's structural guarantees.
//
// The 08-01 failure was not a netcode bug: creating a friends room opened an invite
// screen that never opened a socket, so the creator and the invited player held the same
// code in the same URL and were still in different rooms. These tests hold the two
// structures that fix stayed fixed — the middle screen is gone, and the JOIN field is
// wired in a way the menu's own keyboard nav cannot eat.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/bootstrap.js", async (importOriginal) => ({
  ...(await importOriginal()),
  // * update() bails before touching the lobby unless the world is up.
  isWorldBootstrapped: () => true,
}));

// * happy-dom resolves import.meta.url against the page origin, not a file:// URL —
// * vitest runs from the repo root, so read relative to cwd.
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("the invite screen is gone", () => {
  it("index.html no longer ships #cr-friends-screen or its controls", () => {
    for (const id of [
      "cr-friends-screen",
      "cr-friends-code",
      "cr-friends-link",
      "cr-friends-copy",
      "cr-friends-enter",
      "cr-friends-back",
    ]) {
      expect(indexHtml, `${id} must be deleted, not orphaned`).not.toContain(id);
    }
  });

  it("keeps the FRIENDS menu button itself", () => {
    expect(indexHtml).toContain('id="cr-friends"');
    expect(indexHtml).toContain('data-action="friends"');
  });
});

describe("the JOIN field", () => {
  it("ships the input, the GO control and an error line", () => {
    expect(indexHtml).toContain('id="cr-join-code"');
    expect(indexHtml).toContain('id="cr-join-go"');
    expect(indexHtml).toContain('id="cr-join-error"');
  });

  it("is not a .cr-cmd, so W/S selection cannot land on it", () => {
    // * initCommandList builds cmdButtons from `#cr-commandlist .cr-cmd`; a focusable
    // * text field in that array becomes a navigation stop.
    // * The command list alone — parsing further would drag index.html's inline
    // * bootstrap <script> into happy-dom and it would try to run.
    const start = indexHtml.indexOf('<nav class="cr-buttons');
    const end = indexHtml.indexOf("</nav>", start) + "</nav>".length;
    document.body.innerHTML = indexHtml.slice(start, end);
    const input = document.getElementById("cr-join-code");
    expect(input).not.toBeNull();
    expect(input.closest(".cr-cmd")).toBeNull();
    expect(input.classList.contains("cr-cmd")).toBe(false);
  });
});

describe("stranded-in-an-empty-room banner", () => {
  /** @type {typeof import("../src/hud.js")} */
  let HUD;
  let typedCode = false;

  /** One seated human plus three bots — the shape a mistyped code produces. */
  const aloneSlots = [
    { slotId: 0, kind: "human", connId: "me", name: "ME", isReady: false },
    { slotId: 1, kind: "npc", connId: null, name: "BOT1" },
    { slotId: 2, kind: "npc", connId: null, name: "BOT2" },
    { slotId: 3, kind: "npc", connId: null, name: "BOT3" },
  ];
  const withFriendSlots = [
    ...aloneSlots.slice(0, 1),
    { slotId: 1, kind: "human", connId: "pal", name: "PAL", isReady: false },
    ...aloneSlots.slice(2),
  ];

  const pump = (netSlots, youConnId = "me", phase = "lobby") =>
    HUD.update({
      youConnId,
      netSlots,
      roundState: { phase, scores: [0, 0, 0, 0] },
      matchHistoryLength: 0,
      menuVisible: false,
    });

  const statusText = () => document.querySelector(".hud-lobby-status")?.textContent;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["performance", "Date", "setTimeout", "clearTimeout"] });
    document.body.innerHTML = "";
    typedCode = false;
    HUD = await import("../src/hud.js");
    HUD.init({
      detectGameMode: () => "friends",
      joinedViaTypedCode: () => typedCode,
    });
  });

  it("stays on the waiting copy before the grace window elapses", () => {
    typedCode = true;
    pump(aloneSlots);
    vi.advanceTimersByTime(1000);
    pump(aloneSlots);
    expect(statusText()).toBe("WAITING FOR CHECKOUT…");
  });

  it("tells a typed-code joiner to check the code once nobody turns up", () => {
    typedCode = true;
    pump(aloneSlots);
    vi.advanceTimersByTime(5000);
    pump(aloneSlots);
    expect(statusText()).toBe("NOBODY HERE — CHECK THE CODE");
  });

  it("never shows it to a host who created the room and is waiting", () => {
    // * Same observable state — alone, seated, phase lobby — and the reason the flag
    // * exists at all. Telling the room's creator to check their own code is nonsense.
    typedCode = false;
    pump(aloneSlots);
    vi.advanceTimersByTime(5000);
    pump(aloneSlots);
    expect(statusText()).toBe("WAITING FOR CHECKOUT…");
  });

  it("clears the moment a second human appears", () => {
    typedCode = true;
    pump(aloneSlots);
    vi.advanceTimersByTime(5000);
    pump(aloneSlots);
    expect(statusText()).toBe("NOBODY HERE — CHECK THE CODE");
    pump(withFriendSlots);
    expect(statusText()).not.toBe("NOBODY HERE — CHECK THE CODE");
  });

  it("tints a remote custom-look human's Friends chips with the rendered cart color", () => {
    const slots = [
      { ...aloneSlots[0], color: "pink", lookHex: 0xff7a22 },
      ...aloneSlots.slice(1),
    ];
    pump(slots, "pal");

    const lane = document.querySelector(".hud-lobby-slot");
    expect(lane?.querySelector(".hud-lobby-emblem")?.style.color).toBe("#ff7a22");
    expect(lane?.querySelector(".hud-lobby-slotGlyph")?.style.color).toBe("#ff7a22");

    pump(slots, "pal", "running");
    const scoreBox = document.querySelector(".hud-scoreBox");
    expect(scoreBox?.style.getPropertyValue("--hud-glow")).toBe("#ff7a22");
    expect(scoreBox?.querySelector(".hud-scoreSlot")?.style.color).toBe("#ff7a22");
  });
});
