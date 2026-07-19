// Contract tests for the per-arena ambience system (src/ambience/arenaAmbience.js):
// * every quickplay arena must have a bed (a new arena can't ship silent),
// * the excitement meter's bump/decay/clamp math,
// * lifecycle: start/stop, the classic hype layer, SD tension idempotence.
// AudioManager is mocked — these are wiring contracts, not Howler behavior
// (that lives in audioManager.test.js).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/audioManager.js", () => ({
  registerAmbience: vi.fn(),
  playAmbience: vi.fn(),
  setAmbienceLevel: vi.fn(),
  stopAmbience: vi.fn(),
  stopAllAmbience: vi.fn(),
}));

import * as AudioManager from "../src/audioManager.js";
import {
  ARENA_AMBIENCE,
  ambienceKeysForArena,
  createExcitementMeter,
  initArenaAmbience,
  startArenaAmbience,
  stopArenaAmbience,
  bumpCrowdExcitement,
  setSuddenDeathTension,
} from "../src/ambience/arenaAmbience.js";
import { QUICKPLAY_ARENA_IDS } from "../shared/arenaPool.js";

afterEach(() => {
  stopArenaAmbience(); // clears the hype tick interval + module state between tests
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("arena coverage", () => {
  it("every quickplay arena has an ambience bed", () => {
    for (const id of QUICKPLAY_ARENA_IDS) {
      expect(ARENA_AMBIENCE[id]?.bed, `arena ${id} has no ambience bed`).toBeTruthy();
    }
  });

  it("ambienceKeysForArena lists bed (+ hype when present) and empty for unknown", () => {
    expect(ambienceKeysForArena("classicRecord")).toEqual(
      expect.arrayContaining([ARENA_AMBIENCE.classicRecord.bed]),
    );
    expect(ambienceKeysForArena("classicRecord")).toContain(
      ARENA_AMBIENCE.classicRecord.hype,
    );
    expect(ambienceKeysForArena("testArena")).toEqual([]);
    expect(ambienceKeysForArena(null)).toEqual([]);
  });

  it("registers every layer key (beds + hype + sd_tension) under sounds/ambience/", () => {
    const urls = [];
    initArenaAmbience((name) => {
      urls.push(name);
      return `https://game.test/sounds/${name}`;
    });
    const expected = new Set(
      Object.values(ARENA_AMBIENCE)
        .flatMap((a) => [a.bed, a.hype])
        .filter(Boolean)
        .concat("sd_tension"),
    );
    expect(AudioManager.registerAmbience).toHaveBeenCalledTimes(expected.size);
    for (const key of expected) {
      expect(urls).toContain(`ambience/${key}.opus`);
    }
  });
});

describe("createExcitementMeter", () => {
  it("bumps, clamps at 1, and reports the bumped level", () => {
    const meter = createExcitementMeter();
    expect(meter.bump(0.5, 0)).toBeCloseTo(0.5);
    expect(meter.bump(0.8, 0)).toBe(1);
  });

  it("decays by half after one half-life and floors to 0 eventually", () => {
    const meter = createExcitementMeter({ halfLifeMs: 1000 });
    meter.bump(0.8, 0);
    expect(meter.valueAt(1000)).toBeCloseTo(0.4, 5);
    expect(meter.valueAt(2000)).toBeCloseTo(0.2, 5);
    expect(meter.valueAt(60_000)).toBe(0);
  });

  it("never rises when time goes backwards (host clock jitter)", () => {
    const meter = createExcitementMeter({ halfLifeMs: 1000 });
    meter.bump(0.8, 0);
    const later = meter.valueAt(1000);
    expect(meter.valueAt(500)).toBeLessThanOrEqual(later);
  });

  it("reset zeroes the level", () => {
    const meter = createExcitementMeter();
    meter.bump(1, 0);
    meter.reset();
    expect(meter.valueAt(0)).toBe(0);
  });
});

describe("lifecycle", () => {
  beforeEach(() => {
    initArenaAmbience((name) => name);
    vi.clearAllMocks();
  });

  it("classic starts the bed plus a silent hype layer", () => {
    startArenaAmbience("classicRecord");
    expect(AudioManager.playAmbience).toHaveBeenCalledWith(
      "classic_crowd_bed",
      expect.objectContaining({ fadeMs: expect.any(Number) }),
    );
    expect(AudioManager.playAmbience).toHaveBeenCalledWith(
      "classic_crowd_hype",
      expect.objectContaining({ level: 0 }),
    );
  });

  it("single-bed arenas start only their bed; start always stops the previous arena first", () => {
    startArenaAmbience("backrooms");
    expect(AudioManager.stopAllAmbience).toHaveBeenCalled();
    expect(AudioManager.playAmbience).toHaveBeenCalledTimes(1);
    expect(AudioManager.playAmbience).toHaveBeenCalledWith("backrooms_bed", expect.anything());
  });

  it("unknown arenas (testArena) stay silent", () => {
    startArenaAmbience("testArena");
    expect(AudioManager.playAmbience).not.toHaveBeenCalled();
    startArenaAmbience(null);
    expect(AudioManager.playAmbience).not.toHaveBeenCalled();
  });

  it("crowd excitement drives the classic hype layer with a fast attack", () => {
    startArenaAmbience("classicRecord");
    bumpCrowdExcitement(0.5);
    expect(AudioManager.setAmbienceLevel).toHaveBeenCalledWith(
      "classic_crowd_hype",
      expect.closeTo(0.5, 5),
      expect.any(Number),
    );
  });

  it("crowd excitement is a no-op on arenas without a hype layer and after stop", () => {
    startArenaAmbience("zanzibar");
    bumpCrowdExcitement(0.5);
    expect(AudioManager.setAmbienceLevel).not.toHaveBeenCalled();
    startArenaAmbience("classicRecord");
    stopArenaAmbience();
    vi.clearAllMocks();
    bumpCrowdExcitement(0.5);
    expect(AudioManager.setAmbienceLevel).not.toHaveBeenCalled();
  });

  it("the hype decay tick keeps gliding the layer between bumps", () => {
    vi.useFakeTimers();
    startArenaAmbience("classicRecord");
    bumpCrowdExcitement(0.8);
    vi.clearAllMocks();
    vi.advanceTimersByTime(650);
    expect(AudioManager.setAmbienceLevel).toHaveBeenCalledWith(
      "classic_crowd_hype",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("SD tension is edge-idempotent and cleared by stopArenaAmbience", () => {
    setSuddenDeathTension(true);
    setSuddenDeathTension(true);
    expect(AudioManager.playAmbience).toHaveBeenCalledTimes(1);
    expect(AudioManager.playAmbience).toHaveBeenCalledWith("sd_tension", expect.anything());
    setSuddenDeathTension(false);
    setSuddenDeathTension(false);
    expect(AudioManager.stopAmbience).toHaveBeenCalledTimes(1);
    // stopArenaAmbience resets the latch: a later false must not double-stop.
    setSuddenDeathTension(true);
    stopArenaAmbience();
    vi.clearAllMocks();
    setSuddenDeathTension(false);
    expect(AudioManager.stopAmbience).not.toHaveBeenCalled();
  });
});
