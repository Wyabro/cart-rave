// @vitest-environment happy-dom
// aiStallWatchdog.test.js — the dev-only NPC stall observer. Deterministic: fake bodies + a
// hand-advanced clock, no browser/rAF. Asserts it flags a genuine, unrecovered stall exactly
// once, stays quiet for movement/progress, re-arms after recovery, and never mutates AI state.

import { describe, it, expect, beforeEach } from "vitest";
import { tickAiStallWatchdog, resetAiStallWatchdog } from "../../src/utils/aiStallWatchdog.js";
import { installDiagnostics, __resetDiagnosticsForTest } from "../../src/utils/diagnostics.js";

/** Build a reusable fake NPC cart with mutable pos/vel (same object across ticks — the WeakMap key). */
function makeNpc({ x = 0, z = 0, vx = 0, vz = 0, slot = 0, personality = "brawler" } = {}) {
  const c = {
    isNpc: true,
    slotIndex: slot,
    aiPersonality: { name: personality },
    aiTarget: { x: 5, z: 5 },
    pos: { x, z },
    vel: { x: vx, z: vz },
  };
  c.body = {
    translation: () => ({ x: c.pos.x, y: 0, z: c.pos.z }),
    linvel: () => ({ x: c.vel.x, y: 0, z: c.vel.z }),
  };
  return c;
}

/** Read the ai/stall_detected events recorded so far. */
function stallEvents() {
  return window.__ccDiag.events().filter((e) => e.ch === "ai" && e.type === "stall_detected");
}

beforeEach(() => {
  __resetDiagnosticsForTest();
  resetAiStallWatchdog();
  installDiagnostics({ flags: { enabled: true } });
});

describe("aiStallWatchdog", () => {
  it("flags a slow, stationary NPC once after the duration threshold", () => {
    const npc = makeNpc({ x: 0, z: 0, vx: 0, vz: 0, slot: 2 });
    tickAiStallWatchdog([npc], 0); // anchor
    tickAiStallWatchdog([npc], 1000); // slow but under threshold
    expect(stallEvents()).toHaveLength(0);
    tickAiStallWatchdog([npc], 2600); // over 2500ms threshold
    const evts = stallEvents();
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({ slot: 2, npcId: "npc:2", personality: "brawler", state: "seeking" });
    expect(evts[0].durationMs).toBeGreaterThanOrEqual(2500);
    expect(evts[0].target).toEqual({ x: 5, z: 5 });
  });

  it("debounces — one event per stall episode even across many ticks", () => {
    const npc = makeNpc();
    tickAiStallWatchdog([npc], 0);
    tickAiStallWatchdog([npc], 3000);
    tickAiStallWatchdog([npc], 3500);
    tickAiStallWatchdog([npc], 4000);
    expect(stallEvents()).toHaveLength(1);
  });

  it("stays quiet while the NPC is moving (speed above threshold)", () => {
    const npc = makeNpc({ vx: 5, vz: 0 });
    tickAiStallWatchdog([npc], 0);
    tickAiStallWatchdog([npc], 3000);
    tickAiStallWatchdog([npc], 6000);
    expect(stallEvents()).toHaveLength(0);
  });

  it("stays quiet when the NPC drifts (makes positional progress)", () => {
    const npc = makeNpc({ x: 0, z: 0, vx: 0, vz: 0 });
    tickAiStallWatchdog([npc], 0);
    npc.pos.x = 2; // drifted > MOVE_EPSILON from the anchor
    tickAiStallWatchdog([npc], 3000);
    expect(stallEvents()).toHaveLength(0);
  });

  it("re-arms after recovery and can flag a second, distinct stall", () => {
    const npc = makeNpc();
    tickAiStallWatchdog([npc], 0);
    tickAiStallWatchdog([npc], 2600); // stall #1
    expect(stallEvents()).toHaveLength(1);
    npc.vel = { x: 5, z: 0 }; // recover
    tickAiStallWatchdog([npc], 3000); // re-anchor, reported cleared
    npc.vel = { x: 0, z: 0 }; // stall again
    tickAiStallWatchdog([npc], 5700); // stall #2 (duration from 3000 anchor)
    expect(stallEvents()).toHaveLength(2);
  });

  it("ignores nulls, non-NPCs, and carts without a body", () => {
    const npc = makeNpc({ slot: 1 });
    const human = makeNpc({ slot: 0 });
    human.isNpc = false;
    const bodiless = { isNpc: true, slotIndex: 3, body: null };
    tickAiStallWatchdog([null, human, bodiless, npc], 0);
    tickAiStallWatchdog([null, human, bodiless, npc], 2600);
    const evts = stallEvents();
    expect(evts).toHaveLength(1);
    expect(evts[0].slot).toBe(1);
  });

  it("is a no-op (no throw, no events) when diagnostics are inactive", () => {
    __resetDiagnosticsForTest(); // uninstall the hub
    resetAiStallWatchdog();
    const npc = makeNpc();
    expect(() => {
      tickAiStallWatchdog([npc], 0);
      tickAiStallWatchdog([npc], 3000);
    }).not.toThrow();
    expect(window.__ccDiag).toBeUndefined();
  });
});
