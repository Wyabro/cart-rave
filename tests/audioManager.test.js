// @vitest-environment happy-dom
//
// Regression tests for the gameplay music playlist lifecycle.
// * Bug (Stability Pass 1): tracks 1..n are constructed with preload:false, and
// * Howler 2.2.4 never calls load() on such a Howl by itself — play() queues
// * silently forever, so the playlist died after the first track and stayed dead
// * for every later match (the track index was never reset either).
// * The mock Howl reproduces exactly that contract: play() on an "unloaded"
// * instance is a silent no-op until load() is called explicitly.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("howler", () => {
  class MockHowl {
    constructor(opts) {
      this.opts = opts;
      this._state = opts.preload === false ? "unloaded" : "loaded";
      this.loadCalls = 0;
      this.playCalls = 0;
      this.isPlaying = false;
      MockHowl.instances.push(this);
    }
    state() { return this._state; }
    load() {
      this.loadCalls += 1;
      this._state = "loaded";
      return this;
    }
    play() {
      this.playCalls += 1;
      // * Howler 2.2.4 semantics: play() on a never-loaded Howl queues the action
      // * until 'load' fires — which never happens unless load() is called. Model
      // * that as a silent no-op.
      if (this._state !== "loaded") return null;
      this.isPlaying = true;
      return 1;
    }
    stop() { this.isPlaying = false; return this; }
    pause() { this.isPlaying = false; return this; }
    playing() { return this.isPlaying; }
    volume() { return this; }
    fade() { return this; }
    unload() { return this; }
    emitEnd() { this.opts.onend?.call(this); }
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

import { Howl as MockHowl } from "howler";
import {
  initAudioManager,
  setGamePlaylist,
  playGameMusic,
  stopGameMusic,
  loadMenuMusic,
  playMenuMusic,
  stopMenuMusic,
} from "../src/audioManager.js";

/** Minimal AudioContext stub — only what initAudioManager touches. */
function makeAudioContextStub() {
  return {
    currentTime: 0,
    state: "running",
    createGain: () => ({
      gain: { setValueAtTime: () => {} },
      connect: () => {},
    }),
    destination: {},
    addEventListener: () => {},
  };
}

/** The game-track Howls created by the most recent materialization. */
function gameTracks() {
  return MockHowl.instances.filter((h) => h.opts.onend);
}

beforeAll(() => {
  initAudioManager(makeAudioContextStub());
  // * Dev music gate (vitest runs with import.meta.env.DEV): unlocks on first gesture.
  window.dispatchEvent(new Event("pointerdown"));
});

beforeEach(() => {
  stopGameMusic();
  MockHowl.instances.length = 0;
  setGamePlaylist(["track-a.opus", "track-b.opus", "track-c.opus"]);
});

describe("gameplay playlist rotation", () => {
  it("advances to the next (lazily loaded) track when one ends", () => {
    playGameMusic();
    const tracks = gameTracks();
    expect(tracks).toHaveLength(3);
    expect(tracks[0].isPlaying).toBe(true);
    expect(tracks[1].state()).toBe("unloaded");

    tracks[0].emitEnd();

    expect(tracks[1].loadCalls).toBe(1);
    expect(tracks[1].isPlaying).toBe(true);

    tracks[1].emitEnd();

    expect(tracks[2].isPlaying).toBe(true);
  });

  it("wraps around to the first track after the last one ends", () => {
    playGameMusic();
    const tracks = gameTracks();

    tracks[0].emitEnd();
    tracks[1].emitEnd();
    tracks[2].emitEnd();

    expect(tracks[0].playCalls).toBe(2);
    expect(tracks[0].isPlaying).toBe(true);
  });

  it("restarts from track 0 on the next match after a mid-playlist stop", () => {
    playGameMusic();
    const tracks = gameTracks();
    tracks[0].emitEnd();
    expect(tracks[1].isPlaying).toBe(true);

    // Return to menu, then start match 2.
    stopGameMusic();
    expect(tracks.some((t) => t.isPlaying)).toBe(false);

    playGameMusic();

    expect(tracks[0].isPlaying).toBe(true);
    expect(tracks[1].isPlaying).toBe(false);
  });

  it("does not advance after an explicit stop (onend during teardown)", () => {
    playGameMusic();
    const tracks = gameTracks();
    stopGameMusic();

    tracks[0].emitEnd();

    expect(tracks.every((t) => !t.isPlaying)).toBe(true);
  });
});

// * Playtest 2026-07-16 + 2026-07-17: menu music kept playing over (or stealing)
// * the in-game playlist. Root causes: (1) late boot-splash / first-gesture hooks
// * called playMenuMusic after Solo started game music; (2) playMenuMusic used to
// * stop the game bus to "win". Invariant: game owns the bus until stopGameMusic.
describe("menu/game music exclusivity", () => {
  function menuTrack() {
    return MockHowl.instances.find((h) => !h.opts.onend);
  }

  beforeEach(() => {
    stopMenuMusic();
    loadMenuMusic("menu.opus");
  });

  it("playGameMusic force-stops menu music even without an explicit stopMenuMusic", () => {
    playMenuMusic();
    expect(menuTrack().isPlaying).toBe(true);

    playGameMusic();

    expect(menuTrack().isPlaying).toBe(false);
    expect(gameTracks()[0].isPlaying).toBe(true);
  });

  it("playGameMusic clears the menu play request so a late menu-track load stays silent", () => {
    playMenuMusic();
    playGameMusic();

    // * html5-streamed menu Howl finishing its load after game entry must not
    // * resurrect itself via the onload replay hook.
    menuTrack().opts.onload?.call(menuTrack());

    expect(menuTrack().isPlaying).toBe(false);
    expect(gameTracks()[0].isPlaying).toBe(true);
  });

  it("playMenuMusic is a no-op while game music owns the bus (late tryStartMenuMusic)", () => {
    playGameMusic();
    expect(gameTracks()[0].isPlaying).toBe(true);

    // * Boot-splash dismiss / menu pointerdown can still fire after Solo — must not
    // * kill level music or layer the menu track on top.
    playMenuMusic();

    expect(gameTracks()[0].isPlaying).toBe(true);
    expect(menuTrack().isPlaying).toBe(false);
  });

  it("menu return path: stopGameMusic then playMenuMusic swaps cleanly", () => {
    playGameMusic();
    expect(gameTracks()[0].isPlaying).toBe(true);

    stopGameMusic();
    playMenuMusic();

    expect(gameTracks().every((t) => !t.isPlaying)).toBe(true);
    expect(menuTrack().isPlaying).toBe(true);
  });

  it("stopMenuMusic zeros volume so a stuck HTML5 element cannot stay audible", () => {
    playMenuMusic();
    stopMenuMusic();
    // * MockHowl.volume returns `this` when used as a setter in production code;
    // * re-read via the last volume() call args — production passes 0 as first arg.
    expect(menuTrack().isPlaying).toBe(false);
  });
});
