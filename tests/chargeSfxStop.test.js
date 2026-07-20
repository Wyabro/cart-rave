// chargeSfxStop.test.js — stopAllSfx nuclear path for orphaned chargeUp loops.

import { describe, it, expect, vi, beforeEach } from "vitest";

const stopMock = vi.fn();
vi.mock("howler", () => ({
  Howl: class {
    constructor() {
      this._state = "loaded";
    }
    state() { return this._state; }
    load() {}
    play() { return 42; }
    stop(...args) { stopMock(...args); }
    volume() { return 1; }
    fade() {}
    once() {}
    unload() {}
  },
  Howler: { mute: vi.fn(), volume: vi.fn() },
}));

import { registerSfx, playSfx, stopSfx, stopAllSfx } from "../src/audioManager.js";

describe("chargeUp stop helpers", () => {
  beforeEach(() => {
    stopMock.mockClear();
    registerSfx("chargeUp", ["data:audio/wav;base64,AA=="], { pool: 2, loop: true });
  });

  it("stopSfx with id stops that instance only", () => {
    const id = playSfx("chargeUp");
    stopSfx("chargeUp", id);
    expect(stopMock).toHaveBeenCalledWith(id);
  });

  it("stopAllSfx stops every instance (no id)", () => {
    playSfx("chargeUp");
    playSfx("chargeUp");
    stopAllSfx("chargeUp");
    expect(stopMock).toHaveBeenCalledWith();
  });
});
