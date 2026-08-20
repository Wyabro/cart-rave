// QP-PLAYING-1 — public Quickplay occupancy walk + GET /api/playing limiter.
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_QUICKPLAY_SHARDS,
  isQuickplayRoom,
  listQuickplayShardNames,
} from "../../shared/roomCodes.js";
import {
  PLAYING_MAX_PER_WINDOW,
  allowPlayingCount,
  resetPlayingCountLimitForTests,
  setPlayingShardNamesOverride,
  sumQuickplayPlaying,
} from "../../party/beaconLimit.ts";

afterEach(() => {
  resetPlayingCountLimitForTests();
  setPlayingShardNamesOverride(null);
});

function fakeNs(counts, queried) {
  return {
    idFromName: (name) => name,
    get: (id) => ({
      playingCount: async () => {
        queried.push(id);
        return counts.get(id) ?? 0;
      },
    }),
  };
}

describe("listQuickplayShardNames", () => {
  it("emits shard 1 then numbered overflow up to the cap", () => {
    const names = listQuickplayShardNames();
    expect(names[0]).toBe("quickplay");
    expect(names[1]).toBe("quickplay2");
    expect(names).toHaveLength(MAX_QUICKPLAY_SHARDS);
    expect(names.at(-1)).toBe(`quickplay${MAX_QUICKPLAY_SHARDS}`);
    for (const name of names) expect(isQuickplayRoom(name)).toBe(true);
  });
});

describe("sumQuickplayPlaying", () => {
  it("sums leftover overflow while shard 1 is empty", async () => {
    const queried = [];
    const counts = new Map([
      ["quickplay", 0],
      ["quickplay2", 3],
    ]);
    expect(await sumQuickplayPlaying(fakeNs(counts, queried))).toBe(3);
    expect(queried).toEqual(listQuickplayShardNames());
  });

  it("does not query friends or harness rooms", async () => {
    const queried = [];
    const counts = new Map([
      ["KALE7", 4],
      ["quickplay__harness", 4],
    ]);
    expect(await sumQuickplayPlaying(fakeNs(counts, queried))).toBe(0);
    expect(queried).not.toContain("KALE7");
    expect(queried.some((name) => String(name).includes("__"))).toBe(false);
  });

  it("treats a throwing shard as 0 and keeps the rest", async () => {
    const ns = {
      idFromName: (name) => name,
      get: (id) => ({
        playingCount: async () => {
          if (id === "quickplay") throw new Error("boom");
          if (id === "quickplay2") return 2;
          return 0;
        },
      }),
    };
    expect(await sumQuickplayPlaying(ns)).toBe(2);
  });
});

describe("allowPlayingCount", () => {
  it("allows up to the window cap and then rejects", () => {
    const now = 1_000_000;
    for (let i = 0; i < PLAYING_MAX_PER_WINDOW; i += 1) {
      expect(allowPlayingCount("203.0.113.9", now)).toBe(true);
    }
    expect(allowPlayingCount("203.0.113.9", now)).toBe(false);
    expect(allowPlayingCount("203.0.113.10", now)).toBe(true);
  });
});
