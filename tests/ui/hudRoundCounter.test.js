// @vitest-environment happy-dom
// RD-COUNTER-1: RD n latches on distinct running startedAtMs, not matchHistory.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/bootstrap.js", async (importOriginal) => ({
  ...(await importOriginal()),
  isWorldBootstrapped: () => true,
}));

const HUD = await import("../../src/hud.js");

function rdText() {
  return document.querySelector(".hud-timer-rd")?.textContent ?? "";
}

function updateRunning(startedAtMs) {
  HUD.update({
    youConnId: "you",
    netSlots: [],
    roundState: { phase: "running", startedAtMs, totalRoundMs: 150000 },
    menuVisible: false,
  });
}

describe("RD-COUNTER-1: HUD RD label from observed running rounds", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    HUD.init({
      detectGameMode: () => "solo",
      getIsTouchDevice: () => false,
    });
  });

  it("counts the first running startedAtMs as RD 1", () => {
    updateRunning(1000);
    expect(rdText()).toBe("RD 1");
  });

  it("does not increment on later frames of the same round", () => {
    updateRunning(1000);
    updateRunning(1000);
    expect(rdText()).toBe("RD 1");
  });

  it("increments once when a new running startedAtMs arrives", () => {
    updateRunning(1000);
    updateRunning(2000);
    expect(rdText()).toBe("RD 2");
  });

  it("increments on lobby→running with no local countdown", () => {
    HUD.update({
      youConnId: "you",
      netSlots: [],
      roundState: { phase: "lobby", startedAtMs: 0 },
      menuVisible: false,
    });
    updateRunning(3000);
    expect(rdText()).toBe("RD 1");
  });

  it("retainCurrentRound keeps RD 1 when a counted round gets a new startedAtMs", () => {
    updateRunning(1000);
    expect(rdText()).toBe("RD 1");
    HUD.retainCurrentRound();
    updateRunning(2000);
    expect(rdText()).toBe("RD 1");
  });

  it("a new startedAtMs without retain still advances to RD 2", () => {
    updateRunning(1000);
    updateRunning(2000);
    expect(rdText()).toBe("RD 2");
  });

  it("retain on count 0 still lands first GO on RD 1", () => {
    HUD.retainCurrentRound();
    updateRunning(1000);
    expect(rdText()).toBe("RD 1");
  });

  it("after a count-0 retain, the next startedAtMs without retain is RD 2", () => {
    HUD.retainCurrentRound();
    updateRunning(1000);
    updateRunning(2000);
    expect(rdText()).toBe("RD 2");
  });
});
