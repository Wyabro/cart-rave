// @vitest-environment happy-dom
// DIFF-FRIENDS-1 — Friends host AI difficulty: hello-stamped Easy must not beat store.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __netcodeTestHooks as hooks,
  adoptFriendsHostAiDifficultyFromStore,
  getActiveRoomAiDifficulty,
  hostSetRoomAiDifficulty,
  ensureHostAiDifficultyLatched,
} from "../src/netcode.js";
import { settingsStore } from "../src/stores/settingsStore.js";
import { getActiveAiDifficulty } from "../src/aiDifficulty.js";
import { MSG } from "../shared/protocol.js";

beforeEach(() => {
  hooks.resetNetState();
  settingsStore.getState().setAiDifficulty("medium");
  // * Friends room (not quickplay/solo prefix).
  window.history.replaceState({}, "", "/?room=ABCD12");
});

describe("DIFF-FRIENDS-1 host AI latch", () => {
  it("adoptFriendsHostAiDifficultyFromStore overwrites hello Easy with host store", () => {
    const sent = [];
    hooks.setPartySocketForTest({
      readyState: 1,
      send: (raw) => { sent.push(JSON.parse(String(raw))); },
    });
    hooks.setHostStateForTest({ isHost: true });
    // * Simulate MSG.hello adopting Party default.
    hooks.setAuthoritativeRoomAiDifficultyForTest("easy");
    expect(getActiveRoomAiDifficulty()).toBe("easy");

    settingsStore.getState().setAiDifficulty("hard");
    const ran = adoptFriendsHostAiDifficultyFromStore();
    expect(ran).toBe(true);
    expect(getActiveRoomAiDifficulty()).toBe("hard");
    expect(getActiveAiDifficulty()).toBe("hard");
    // * ensureHost would have no-op'd once latch was set — that is the bug class.
    ensureHostAiDifficultyLatched("friends");
    expect(getActiveRoomAiDifficulty()).toBe("hard");

    const hostRounds = sent.filter((m) => m.type === MSG.hostRound);
    expect(hostRounds.length).toBeGreaterThanOrEqual(1);
    expect(hostRounds[hostRounds.length - 1].aiDifficulty).toBe("hard");
  });

  it("adoptFriendsHostAiDifficultyFromStore no-ops for non-host", () => {
    hooks.setPartySocketForTest({ readyState: 1, send: vi.fn() });
    hooks.setHostStateForTest({ isHost: false });
    hooks.setAuthoritativeRoomAiDifficultyForTest("easy");
    settingsStore.getState().setAiDifficulty("hard");
    expect(adoptFriendsHostAiDifficultyFromStore()).toBe(false);
    expect(getActiveRoomAiDifficulty()).toBe("easy");
  });

  it("adoptFriendsHostAiDifficultyFromStore no-ops for quickplay", () => {
    window.history.replaceState({}, "", "/?room=quickplay");
    hooks.setPartySocketForTest({ readyState: 1, send: vi.fn() });
    hooks.setHostStateForTest({ isHost: true });
    hooks.setAuthoritativeRoomAiDifficultyForTest("easy");
    settingsStore.getState().setAiDifficulty("hard");
    expect(adoptFriendsHostAiDifficultyFromStore()).toBe(false);
    expect(getActiveRoomAiDifficulty()).toBe("easy");
  });

  it("hostSetRoomAiDifficulty writes store, latch, and hostRound", () => {
    const sent = [];
    hooks.setPartySocketForTest({
      readyState: 1,
      send: (raw) => { sent.push(JSON.parse(String(raw))); },
    });
    hooks.setHostStateForTest({ isHost: true });
    hooks.setAuthoritativeRoomAiDifficultyForTest("easy");

    expect(hostSetRoomAiDifficulty("hard")).toBe(true);
    expect(settingsStore.getState().aiDifficulty).toBe("hard");
    expect(getActiveRoomAiDifficulty()).toBe("hard");
    const last = sent.filter((m) => m.type === MSG.hostRound).at(-1);
    expect(last?.aiDifficulty).toBe("hard");
  });

  it("hostSetRoomAiDifficulty no-ops for guests", () => {
    hooks.setPartySocketForTest({ readyState: 1, send: vi.fn() });
    hooks.setHostStateForTest({ isHost: false });
    hooks.setAuthoritativeRoomAiDifficultyForTest("easy");
    settingsStore.getState().setAiDifficulty("medium");
    expect(hostSetRoomAiDifficulty("hard")).toBe(false);
    expect(settingsStore.getState().aiDifficulty).toBe("medium");
    expect(getActiveRoomAiDifficulty()).toBe("easy");
  });
});
