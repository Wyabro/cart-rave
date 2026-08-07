// @vitest-environment happy-dom
//
// AUDIO-MASTER-1 — `_masterVol` in src/audioManager.js was dead state (written by
// restoreVolumeState but never read; no master volume slider exists — Howler global
// volume stays pinned at 1.0 in applyAllVolumes). This spec pins the removal:
//   (a) source-level: main.js no longer passes `master:` into restoreVolumeState, and
//       audioManager.js contains no `_masterVol` token or `master` key anywhere in the
//       restoreVolumeState block.
//   (b) unit: restoreVolumeState({ sfx, music, muted }) still applies all three store
//       volumes identically and never throws.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("howler", () => {
  class MockHowl {
    constructor(opts) {
      this.opts = opts;
    }
    state() { return "loaded"; }
    once() { return this; }
    load() { return this; }
    play() { return null; }
    stop() { return this; }
    pause() { return this; }
    playing() { return false; }
    volume() { return this; }
    fade() { return this; }
    unload() { return this; }
  }
  MockHowl.instances = [];
  const Howler = {
    _volume: 1,
    _html5AudioPool: [],
    html5PoolSize: 10,
    autoUnlock: false,
    ctx: null,
    masterGain: null,
    volume: () => {},
    mute: () => {},
    stop: () => {},
  };
  return { Howl: MockHowl, Howler };
});

import { restoreVolumeState } from "../src/audioManager.js";
import { audioStore } from "../src/stores/audioStore.js";

// * Source reads use process.cwd() (repo-root-relative), not new URL(…, import.meta.url):
// * under the happy-dom environment Vite rewrites the latter to an http://localhost URL.
const mainSrc = readFileSync(resolve(process.cwd(), "src/main.js"), "utf8");
const audioManagerSrc = readFileSync(resolve(process.cwd(), "src/audioManager.js"), "utf8");

describe("AUDIO-MASTER-1 source-level: no master key in restoreVolumeState", () => {
  it("main.js calls restoreVolumeState without a master: key", () => {
    const callStart = mainSrc.indexOf("restoreVolumeState({");
    expect(callStart).toBeGreaterThan(-1);
    const callBlock = mainSrc.slice(callStart, mainSrc.indexOf("});", callStart) + 2);

    expect(callBlock).not.toMatch(/master\s*:/);
    expect(callBlock).toMatch(/sfx\s*:/);
    expect(callBlock).toMatch(/music\s*:/);
    expect(callBlock).toMatch(/muted\s*:/);
  });

  it("audioManager.js has no _masterVol token and no master key in the restoreVolumeState block", () => {
    expect(audioManagerSrc).not.toMatch(/_masterVol/);

    const fnStart = audioManagerSrc.indexOf("Bulk-restore volumes from saved values");
    expect(fnStart).toBeGreaterThan(-1);
    // JSDoc + body: from the doc comment through the last store write (CRLF-safe;
    // a "\n}\n" brace anchor does not exist on Windows line endings).
    const fnEndAnchor = "setMuted(state.muted);";
    const fnEnd = audioManagerSrc.indexOf(fnEndAnchor, fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fnBlock = audioManagerSrc.slice(fnStart, fnEnd + fnEndAnchor.length);

    expect(fnBlock).not.toMatch(/master/);
    expect(fnBlock).toMatch(/state\.sfx/);
    expect(fnBlock).toMatch(/state\.music/);
    expect(fnBlock).toMatch(/state\.muted/);
  });
});

describe("AUDIO-MASTER-1 unit: restoreVolumeState without master", () => {
  it("applies sfx/music/muted identically and never throws", () => {
    const initial = audioStore.getState();
    try {
      expect(() => restoreVolumeState({ sfx: 0.6, music: 0.4, muted: true })).not.toThrow();
      expect(audioStore.getState().sfxVolume).toBe(0.6);
      expect(audioStore.getState().musicVolume).toBe(0.4);
      expect(audioStore.getState().isMuted).toBe(true);

      expect(() => restoreVolumeState({ sfx: 0.9, music: 0.2, muted: false })).not.toThrow();
      expect(audioStore.getState().sfxVolume).toBe(0.9);
      expect(audioStore.getState().musicVolume).toBe(0.2);
      expect(audioStore.getState().isMuted).toBe(false);
    } finally {
      restoreVolumeState({
        sfx: initial.sfxVolume,
        music: initial.musicVolume,
        muted: initial.isMuted,
      });
    }
  });
});
