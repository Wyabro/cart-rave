// connectionReaper.test.js — pure stale-id selection for silent conns + pickers.

import { describe, expect, it } from "vitest";
import {
  PICKER_TIMEOUT_MS,
  REAP_TIMEOUT_MS,
} from "../party/constants.ts";
import {
  listSilentConnectionsToReap,
  listStalePendingPickers,
} from "../party/connectionReaper.ts";

describe("listSilentConnectionsToReap", () => {
  it("returns empty for empty connection lists", () => {
    expect(
      listSilentConnectionsToReap([], new Map(), new Set(), 100_000),
    ).toEqual([]);
  });

  it("reaps a connection silent longer than REAP_TIMEOUT_MS", () => {
    const lastSeen = new Map([["a", 0]]);
    expect(
      listSilentConnectionsToReap(["a"], lastSeen, new Set(), REAP_TIMEOUT_MS + 1),
    ).toEqual(["a"]);
  });

  it("keeps a fresh connection", () => {
    const now = 50_000;
    const lastSeen = new Map([["a", now - 100]]);
    expect(
      listSilentConnectionsToReap(["a"], lastSeen, new Set(), now),
    ).toEqual([]);
  });

  it("skips pending pickers even when silent", () => {
    const lastSeen = new Map([["p", 0]]);
    expect(
      listSilentConnectionsToReap(
        ["p"],
        lastSeen,
        new Set(["p"]),
        REAP_TIMEOUT_MS + 1,
      ),
    ).toEqual([]);
  });

  it("treats missing lastSeen as epoch 0 (reap-eligible)", () => {
    expect(
      listSilentConnectionsToReap(["ghost"], new Map(), new Set(), REAP_TIMEOUT_MS + 1),
    ).toEqual(["ghost"]);
  });
});

describe("listStalePendingPickers", () => {
  it("returns empty when none are stale", () => {
    const at = new Map([["p", 1000]]);
    expect(
      listStalePendingPickers(["p"], at, 1000 + PICKER_TIMEOUT_MS),
    ).toEqual([]);
  });

  it("lists pickers past PICKER_TIMEOUT_MS", () => {
    const at = new Map([["p", 0]]);
    expect(
      listStalePendingPickers(["p"], at, PICKER_TIMEOUT_MS + 1),
    ).toEqual(["p"]);
  });

  it("treats missing joinedAt as epoch 0", () => {
    expect(
      listStalePendingPickers(["p"], new Map(), PICKER_TIMEOUT_MS + 1),
    ).toEqual(["p"]);
  });
});
