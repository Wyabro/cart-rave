// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { startHowToArtPlayback } from "../../src/ui/howToArtPlayback.js";

function makeSlot() {
  const slot = document.createElement("div");
  const callout = document.createElement("span");
  callout.className = "cr-howto-callout";
  slot.append(callout);
  document.body.append(slot);
  return { slot, callout };
}

function makeScheduler() {
  const pending = [];
  return {
    schedule: vi.fn((callback) => {
      pending.push(callback);
      return pending.length;
    }),
    cancel: vi.fn(),
    runNext() {
      const callback = pending.shift();
      expect(callback).toBeTypeOf("function");
      callback();
    },
    pending,
  };
}

function start(overrides = {}) {
  const { slot, callout } = makeSlot();
  const timer = makeScheduler();
  const onVerdict = vi.fn();
  const stop = startHowToArtPlayback({
    slot,
    token: "drive",
    motionUrl: "/drive.webp",
    stillUrl: "/drive.still.webp",
    reducedMotion: false,
    sampleFrame: vi.fn()
      .mockReturnValueOnce("frame-a")
      .mockReturnValueOnce("frame-a")
      .mockReturnValueOnce("frame-b"),
    schedule: timer.schedule,
    cancelSchedule: timer.cancel,
    now: vi.fn(() => 100),
    onVerdict,
    ...overrides,
  });
  const img = slot.querySelector("img");
  return { slot, callout, img, timer, onVerdict, stop };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("HOW TO PLAY animated WebP playback", () => {
  it("keeps motion after a visible frame changes", () => {
    const run = start();
    run.img.dispatchEvent(new Event("load"));
    run.timer.runNext();
    run.timer.runNext();

    const live = run.slot.querySelector("img");
    expect(live).not.toBe(run.img);
    expect(live.src).toContain("/drive.webp");
    expect(live.isConnected).toBe(true);
    expect(run.img.isConnected).toBe(false);
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      token: "drive",
      status: "playing",
      reason: "frame-change",
      samples: 3,
    }));
    expect(run.callout.isConnected).toBe(true);

    run.stop();
    expect(run.slot.querySelector("img")).toBeNull();
  });

  it("swaps frozen motion to the paired still after five unchanged samples", () => {
    const run = start({ sampleFrame: vi.fn(() => "same-frame") });
    run.img.dispatchEvent(new Event("load"));
    for (let i = 0; i < 4; i += 1) run.timer.runNext();

    expect(run.img.src).toContain("/drive.still.webp");
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "no-frame-change",
      samples: 5,
    }));
  });

  it("uses the still when the motion image fails to load", () => {
    const run = start();
    run.img.dispatchEvent(new Event("error"));

    expect(run.img.src).toContain("/drive.still.webp");
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "motion-load-error",
      samples: 0,
    }));
  });

  it("collapses to text when both motion and still fail to load", () => {
    const run = start();
    run.img.dispatchEvent(new Event("error"));
    run.img.dispatchEvent(new Event("error"));

    expect(run.img.isConnected).toBe(false);
    expect(run.slot.dataset.art).toBeUndefined();
    expect(run.onVerdict).toHaveBeenCalledTimes(1);
  });

  it("bypasses motion and sampling for reduced-motion users", () => {
    const run = start({ reducedMotion: true });

    expect(run.img.src).toContain("/drive.still.webp");
    expect(run.timer.schedule).not.toHaveBeenCalled();
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "reduced-motion",
      samples: 0,
    }));
  });

  it("cancels an in-flight verdict when the player leaves the slide", () => {
    const run = start({ sampleFrame: vi.fn(() => "same-frame") });
    run.img.dispatchEvent(new Event("load"));
    run.stop();
    run.timer.runNext();

    expect(run.onVerdict).not.toHaveBeenCalled();
    expect(run.img.isConnected).toBe(false);
  });

  it("does not judge frame progress while the slide is hidden", () => {
    let visible = false;
    const sampleFrame = vi.fn(() => "same-frame");
    const run = start({ isVisible: () => visible, sampleFrame });
    run.img.dispatchEvent(new Event("load"));

    run.timer.runNext();
    expect(sampleFrame).not.toHaveBeenCalled();
    expect(run.onVerdict).not.toHaveBeenCalled();

    visible = true;
    run.timer.runNext();
    expect(sampleFrame).toHaveBeenCalledTimes(1);
  });

  it("keeps the readable motion frame when no optional still exists", () => {
    const run = start({
      stillUrl: null,
      sampleFrame: vi.fn(() => "same-frame"),
    });
    run.img.dispatchEvent(new Event("load"));
    for (let i = 0; i < 4; i += 1) run.timer.runNext();

    expect(run.img.src).toContain("/drive.webp");
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "no-frame-change-no-still",
    }));
  });
});
