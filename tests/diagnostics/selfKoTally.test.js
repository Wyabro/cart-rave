// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  installDiagnostics,
  __resetDiagnosticsForTest,
  noteSelfKo,
  resetSelfKoTally,
  snapshotSelfKoTally,
  __resetSelfKoTallyForTest,
} from "../../src/utils/diagnostics.js";
import { setActiveAiDifficulty } from "../../src/aiDifficulty.js";

function npcSelf(overrides = {}) {
  return {
    victimSlotIndex: 2,
    attackerSlotIndex: null,
    isKill: false,
    cause: "self",
    zone: "outer_edge",
    victimKind: "npc",
    victimAiName: "aggressor",
    isSuddenDeath: false,
    fallX: 15,
    fallZ: 0,
    ...overrides,
  };
}

describe("selfKoTally", () => {
  beforeEach(() => {
    __resetDiagnosticsForTest();
    __resetSelfKoTallyForTest();
    setActiveAiDifficulty("medium");
  });

  it("no-ops when diag is off", () => {
    noteSelfKo(npcSelf());
    expect(snapshotSelfKoTally().npcSelf).toBe(0);
  });

  it("counts NPC self vs ram-KO and splits zone / personality / phase", () => {
    installDiagnostics({ flags: { enabled: true } });
    resetSelfKoTally({ levelId: "classicRecord" });

    noteSelfKo(npcSelf());
    noteSelfKo(npcSelf({ zone: "center_hole", victimAiName: "lurker", fallX: 0 }));
    noteSelfKo(npcSelf({
      isKill: true,
      attackerSlotIndex: 0,
      cause: "outer_edge",
      victimAiName: "chaotic",
    }));
    noteSelfKo(npcSelf({ isSuddenDeath: true, victimAiName: "scavenger" }));
    noteSelfKo({
      ...npcSelf(),
      victimKind: "human",
      victimAiName: null,
    });

    const snap = snapshotSelfKoTally();
    expect(snap.levelId).toBe("classicRecord");
    expect(snap.difficulty).toBe("medium");
    expect(snap.npcSelf).toBe(3);
    expect(snap.npcKilled).toBe(1);
    expect(snap.npcDeaths).toBe(4);
    expect(snap.humanSelf).toBe(1);
    expect(snap.byZone).toEqual({
      center_hole: 1,
      corner_void: 0,
      outer_edge: 2,
      other: 0,
    });
    expect(snap.byPersonality).toEqual({
      aggressor: 1,
      lurker: 1,
      scavenger: 1,
      chaotic: 0,
      other: 0,
    });
    expect(snap.byPhase).toEqual({ running: 2, suddenDeath: 1 });
    expect(snap.sample).toHaveLength(3);
  });

  it("resets on a new round", () => {
    installDiagnostics({ flags: { enabled: true } });
    resetSelfKoTally({ levelId: "backrooms" });
    noteSelfKo(npcSelf({ zone: "corner_void" }));
    resetSelfKoTally({ levelId: "zanzibar" });
    const snap = snapshotSelfKoTally();
    expect(snap.levelId).toBe("zanzibar");
    expect(snap.npcSelf).toBe(0);
    expect(snap.byZone.corner_void).toBe(0);
  });
});
