// @vitest-environment happy-dom
// FRIENDS-LEVEL-1 — Friends host arena pick: hello-stamped default level must not beat store.

import { beforeEach, describe, expect, it } from "vitest";
import {
  __netcodeTestHooks as hooks,
  adoptFriendsHostLevelFromStore,
  isFriendsHostHello,
} from "../src/netcode.js";
import { settingsStore } from "../src/stores/settingsStore.js";

beforeEach(() => {
  hooks.resetNetState();
  settingsStore.getState().setSelectedLevelId("classicRecord");
  // * Friends room (not quickplay/solo prefix).
  window.history.replaceState({}, "", "/?room=ABCD12");
});

describe("FRIENDS-LEVEL-1 host level latch", () => {
  it("adoptFriendsHostLevelFromStore overwrites a hello-stamped latch with the host store pick", () => {
    hooks.setHostStateForTest({ isHost: true });
    // * Simulate MSG.hello adopting the room's default level before host logic runs.
    hooks.setAuthoritativeRoomLevelForTest("classicRecord");
    expect(hooks.getAuthoritativeRoomLevelForTest()).toBe("classicRecord");

    settingsStore.getState().setSelectedLevelId("backrooms");
    const ran = adoptFriendsHostLevelFromStore();
    expect(ran).toBe(true);
    expect(hooks.getAuthoritativeRoomLevelForTest()).toBe("backrooms");
  });

  it("adoptFriendsHostLevelFromStore no-ops for non-host", () => {
    hooks.setHostStateForTest({ isHost: false });
    hooks.setAuthoritativeRoomLevelForTest("classicRecord");
    settingsStore.getState().setSelectedLevelId("backrooms");
    expect(adoptFriendsHostLevelFromStore()).toBe(false);
    expect(hooks.getAuthoritativeRoomLevelForTest()).toBe("classicRecord");
  });

  it("adoptFriendsHostLevelFromStore no-ops for quickplay", () => {
    window.history.replaceState({}, "", "/?room=quickplay");
    hooks.setHostStateForTest({ isHost: true });
    hooks.setAuthoritativeRoomLevelForTest("classicRecord");
    settingsStore.getState().setSelectedLevelId("backrooms");
    expect(adoptFriendsHostLevelFromStore()).toBe(false);
    expect(hooks.getAuthoritativeRoomLevelForTest()).toBe("classicRecord");
  });

  it("adoptFriendsHostLevelFromStore does not stamp an empty store pick over the existing latch", () => {
    hooks.setHostStateForTest({ isHost: true });
    hooks.setAuthoritativeRoomLevelForTest("classicRecord");
    settingsStore.getState().setSelectedLevelId("");
    const ran = adoptFriendsHostLevelFromStore();
    // * adoptRoomLevelAsHost("") no-ops on the falsy trimmed string (see
    // * adoptAuthoritativeRoomLevel's early return) — the function itself still ran.
    expect(ran).toBe(true);
    expect(hooks.getAuthoritativeRoomLevelForTest()).toBe("classicRecord");
    expect(hooks.getAuthoritativeRoomLevelForTest()).not.toBe("");
  });

  describe("isFriendsHostHello predicate", () => {
    it("true when mode is friends and hostId matches youConnId", () => {
      expect(isFriendsHostHello("friends", "abc", "abc")).toBe(true);
    });

    it("false when hostId does not match youConnId", () => {
      expect(isFriendsHostHello("friends", "abc", "def")).toBe(false);
    });

    it("false when mode is not friends", () => {
      expect(isFriendsHostHello("quickplay", "abc", "abc")).toBe(false);
    });

    it("false when hostId/youConnId are undefined", () => {
      expect(isFriendsHostHello("friends", undefined, undefined)).toBe(false);
    });

    it("false when hostId/youConnId are both empty strings", () => {
      expect(isFriendsHostHello("friends", "", "")).toBe(false);
    });
  });
});
