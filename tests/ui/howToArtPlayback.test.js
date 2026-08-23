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
    async runNext() {
      const callback = pending.shift();
      expect(callback).toBeTypeOf("function");
      await callback();
    },
    pending,
  };
}

function makeDecoder({ frameCount = 3, durationUs = 40_000 } = {}) {
  return class MockDecoder {
    constructor() {
      this.closed = false;
      this.tracks = {
        ready: Promise.resolve(),
        selectedTrack: { frameCount, codedWidth: 16, codedHeight: 10 },
      };
    }
    async decode({ frameIndex }) {
      return {
        image: {
          frameIndex,
          duration: durationUs,
          displayWidth: 16,
          displayHeight: 10,
          close() {},
        },
      };
    }
    close() {
      this.closed = true;
    }
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
    schedule: timer.schedule,
    cancelSchedule: timer.cancel,
    now: vi.fn(() => 100),
    onVerdict,
    ...overrides,
  });
  return { slot, callout, timer, onVerdict, stop };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("HOW TO PLAY animated WebP playback", () => {
  it("loops motion on a canvas from ImageDecoder and wraps the frame index", async () => {
    const paints = [];
    const Decoder = makeDecoder({ frameCount: 3 });
    const run = start({
      ImageDecoder: Decoder,
      fetchBuffer: async () => new ArrayBuffer(8),
      paintFrame: (_canvas, image) => {
        paints.push(image.frameIndex);
      },
    });

    await flush();
    const canvas = run.slot.querySelector("canvas");
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(16);
    expect(canvas.height).toBe(10);
    expect(run.slot.querySelector("img")).toBeNull();
    expect(paints).toEqual([0]);
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      token: "drive",
      status: "playing",
      reason: "decoder-loop",
      samples: 3,
    }));
    expect(run.callout.isConnected).toBe(true);

    await run.timer.runNext();
    await run.timer.runNext();
    await run.timer.runNext();
    expect(paints).toEqual([0, 1, 2, 0]);

    run.stop();
    expect(run.slot.querySelector("canvas")).toBeNull();
  });

  it("closes the decoder when the player leaves the slide during playback", async () => {
    let instance = null;
    const Decoder = class extends makeDecoder() {
      constructor(...args) {
        super(...args);
        instance = this;
      }
    };
    const run = start({
      ImageDecoder: Decoder,
      fetchBuffer: async () => new ArrayBuffer(8),
      paintFrame: () => {},
    });
    await flush();
    expect(instance?.closed).toBe(false);

    run.stop();
    expect(instance?.closed).toBe(true);
    expect(run.slot.querySelector("canvas")).toBeNull();
  });

  it("does not advance decoder frames while the slide is hidden", async () => {
    let visible = false;
    const paintFrame = vi.fn();
    const run = start({
      ImageDecoder: makeDecoder(),
      fetchBuffer: async () => new ArrayBuffer(8),
      paintFrame,
      isVisible: () => visible,
    });
    await flush();
    expect(paintFrame).not.toHaveBeenCalled();
    expect(run.onVerdict).not.toHaveBeenCalled();

    visible = true;
    await run.timer.runNext();
    expect(paintFrame).toHaveBeenCalledTimes(1);
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "playing",
      reason: "decoder-loop",
    }));
  });

  it("falls back to the still when ImageDecoder reports a single frame", async () => {
    const run = start({
      ImageDecoder: makeDecoder({ frameCount: 1 }),
      fetchBuffer: async () => new ArrayBuffer(8),
      paintFrame: () => {},
    });
    await flush();
    expect(run.slot.querySelector("img")?.src).toContain("/drive.still.webp");
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "decoder-still",
    }));
  });

  it("falls back to the still when decoder fetch fails", async () => {
    const run = start({
      ImageDecoder: makeDecoder(),
      fetchBuffer: async () => {
        throw new Error("motion-http-404");
      },
    });
    await flush();
    expect(run.slot.querySelector("img")?.src).toContain("/drive.still.webp");
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "motion-load-error",
    }));
  });

  it("uses a plain img when ImageDecoder is missing", async () => {
    const run = start({ ImageDecoder: null });
    await flush();
    const img = run.slot.querySelector("img");
    expect(img).toBeInstanceOf(HTMLImageElement);
    img.dispatchEvent(new Event("load"));
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "playing",
      reason: "img-load",
    }));
    expect(run.slot.querySelector("canvas")).toBeNull();
  });

  it("swaps to the paired still when the fallback img fails to load", async () => {
    const run = start({ ImageDecoder: null });
    await flush();
    const img = run.slot.querySelector("img");
    img.dispatchEvent(new Event("error"));
    expect(run.slot.querySelector("img")?.src).toContain("/drive.still.webp");
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "motion-load-error",
    }));
  });

  it("collapses to text when both motion and still fail to load", async () => {
    const run = start({ ImageDecoder: null });
    await flush();
    const img = run.slot.querySelector("img");
    img.dispatchEvent(new Event("error"));
    img.dispatchEvent(new Event("error"));
    expect(img.isConnected).toBe(false);
    expect(run.slot.dataset.art).toBeUndefined();
    expect(run.onVerdict).toHaveBeenCalledTimes(1);
  });

  it("bypasses motion and sampling for reduced-motion users", () => {
    const run = start({ reducedMotion: true, ImageDecoder: makeDecoder() });
    expect(run.slot.querySelector("img")?.src).toContain("/drive.still.webp");
    expect(run.timer.schedule).not.toHaveBeenCalled();
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "reduced-motion",
      samples: 0,
    }));
  });

  it("cancels an in-flight decoder boot when the player leaves the slide", async () => {
    let finishFetch = () => {};
    const fetchBuffer = vi.fn(() => new Promise((resolve) => {
      finishFetch = resolve;
    }));
    const run = start({
      ImageDecoder: makeDecoder(),
      fetchBuffer,
      paintFrame: () => {},
    });
    await vi.waitFor(() => expect(fetchBuffer).toHaveBeenCalled());
    run.stop();
    finishFetch(new ArrayBuffer(8));
    await flush();
    expect(run.onVerdict).not.toHaveBeenCalled();
    expect(run.slot.querySelector("canvas")).toBeNull();
  });

  it("keeps the readable motion frame when no optional still exists", async () => {
    const run = start({
      stillUrl: null,
      ImageDecoder: makeDecoder({ frameCount: 1 }),
      fetchBuffer: async () => new ArrayBuffer(8),
      paintFrame: () => {},
    });
    await flush();
    expect(run.onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: "fallback",
      reason: "decoder-still-no-still",
    }));
  });
});
