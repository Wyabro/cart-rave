// @vitest-environment happy-dom
//
// Regression tests for the gameplay music playlist lifecycle.
// * Bug (Stability Pass 1): tracks 1..n are constructed with preload:false, and
// * Howler 2.2.4 never calls load() on such a Howl by itself — play() queues
// * silently forever, so the playlist died after the first track and stayed dead
// * for every later match (the track index was never reset either).
// * The mock Howl reproduces exactly that contract: play() on an "unloaded"
// * instance is a silent no-op until load() is called explicitly.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

vi.mock("howler", () => {
  class MockHowl {
    constructor(opts) {
      this.opts = opts;
      this._state = opts.preload === false ? "unloaded" : "loaded";
      this.loadCalls = 0;
      this.playCalls = 0;
      this.fadeCalls = [];
      this.isPlaying = false;
      /** @type {Record<string, Array<() => void>>} */
      this._once = {};
      /** When true, load() stays "loading" until emitLoad() (async warm tests). */
      this.deferLoad = false;
      /** Every value passed to volume() as a SETTER (MENU-MUSIC-VOL-1). */
      this.volumeCalls = [];
      MockHowl.instances.push(this);
    }
    state() { return this._state; }
    once(event, fn) {
      (this._once[event] ||= []).push(fn);
      return this;
    }
    load() {
      this.loadCalls += 1;
      if (this.deferLoad) {
        this._state = "loading";
        return this;
      }
      this._state = "loaded";
      this._emitOnce("load");
      return this;
    }
    /** Complete a deferred load() — mirrors Howler async decode. */
    emitLoad() {
      this._state = "loaded";
      this._emitOnce("load");
    }
    emitLoadError() {
      this._emitOnce("loaderror");
    }
    _emitOnce(event) {
      const list = this._once[event] || [];
      this._once[event] = [];
      for (const fn of list) fn();
    }
    play() {
      this.playCalls += 1;
      // * Howler 2.2.4 semantics: play() on a never-loaded Howl queues the action
      // * until 'load' fires — which never happens unless load() is called. Model
      // * that as a silent no-op.
      if (this._state !== "loaded") return null;
      this.isPlaying = true;
      this.opts.onplay?.call(this);
      return 1;
    }
    stop() { this.isPlaying = false; return this; }
    pause() { this.isPlaying = false; return this; }
    playing() { return this.isPlaying; }
    volume(...args) {
      if (args.length) this.volumeCalls.push(args[0]);
      return this;
    }
    fade(...args) { this.fadeCalls.push(args); return this; }
    unload() { return this; }
    emitEnd() { this.opts.onend?.call(this); }
    /**
     * Howler html5 _playLock race: the media element's play() promise resolves AFTER
     * stop() ran, restarting playback. Model as playback flipping on + onplay firing.
     */
    emitLatePlay() {
      this.isPlaying = true;
      this.opts.onplay?.call(this);
    }
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
  duckMusic,
  registerSfx,
  registerAmbience,
  prefetchSfxByPrefix,
  prefetchSfxByPrefixAsync,
  prefetchSfxKeysAsync,
  prefetchGameMusicAsync,
  prefetchAmbienceAsync,
  materializeGamePlaylistIfPending,
  hasMaterializedGamePlaylist,
  setSfxPerVolume,
} from "../src/audioManager.js";
import { audioStore, AUDIO_VOLUME_MAX } from "../src/stores/audioStore.js";

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

  // * Run-6 regression: the 320ms deferred menu-hide (run-5 transition overlap) let a
  // * pending HTML5 play() promise resolve AFTER stopMenuMusic — the menu track
  // * restarted under the level playlist. The Howl-level onplay guard is the terminal
  // * backstop: playback that starts while intent flags say "silent" dies instantly.
  it("a late play() resolution after game entry is killed by the onplay guard", () => {
    playMenuMusic();
    playGameMusic();
    expect(menuTrack().isPlaying).toBe(false);

    menuTrack().emitLatePlay();

    expect(menuTrack().isPlaying).toBe(false);
    expect(gameTracks()[0].isPlaying).toBe(true);
  });

  it("duck release never fades the stopped menu track back up mid-game", () => {
    vi.useFakeTimers();
    try {
      playMenuMusic();
      playGameMusic();
      menuTrack().fadeCalls.length = 0;

      duckMusic(0.4, 50);
      vi.advanceTimersByTime(1000);

      // * Game track ducks and releases; the menu Howl must be untouched — a fade
      // * back to _musicVol on a "stopped" html5 element re-arms the bleed.
      expect(menuTrack().fadeCalls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// * Run-7 2e: host mid-round resume freezes from late announcer decode. Play-entry
// * must await pack load, not only kick load().
describe("prefetchSfxByPrefixAsync (announcer warm)", () => {
  beforeEach(() => {
    // * Unique keys each test so registry grows but filters stay precise.
  });

  it("sync load resolves loaded=total without waiting on the network", async () => {
    registerSfx("announcer_warm_a_01", ["a.opus"], { preload: false });
    registerSfx("announcer_warm_a_02", ["b.opus"], { preload: false });
    registerSfx("other_sfx", ["c.opus"], { preload: false });

    const result = await prefetchSfxByPrefixAsync("announcer_warm_a_");
    expect(result.total).toBe(2);
    expect(result.loaded).toBe(2);
    expect(result.timedOut).toBe(false);

    const warmed = MockHowl.instances.filter((h) =>
      (h.opts.src || []).some((s) => s === "a.opus" || s === "b.opus"),
    );
    expect(warmed.every((h) => h.state() === "loaded")).toBe(true);
    expect(warmed.every((h) => h.loadCalls >= 1)).toBe(true);
  });

  it("waits for deferred decode then resolves", async () => {
    registerSfx("announcer_warm_b_01", ["d.opus"], { preload: false });
    const howl = MockHowl.instances[MockHowl.instances.length - 1];
    howl.deferLoad = true;

    const pending = prefetchSfxByPrefixAsync("announcer_warm_b_");
    // * Kick has started; still loading until emitLoad.
    expect(howl.loadCalls).toBe(1);
    expect(howl.state()).toBe("loading");

    howl.emitLoad();
    const result = await pending;
    expect(result).toEqual({ loaded: 1, total: 1, timedOut: false });
    expect(howl.state()).toBe("loaded");
  });

  it("times out with partial loaded count when decode never finishes", async () => {
    vi.useFakeTimers();
    try {
      registerSfx("announcer_warm_c_01", ["e.opus"], { preload: false });
      const howl = MockHowl.instances[MockHowl.instances.length - 1];
      howl.deferLoad = true;

      const pending = prefetchSfxByPrefixAsync("announcer_warm_c_", { maxWaitMs: 50 });
      expect(howl.state()).toBe("loading");

      await vi.advanceTimersByTimeAsync(60);
      const result = await pending;
      expect(result.total).toBe(1);
      expect(result.loaded).toBe(0);
      expect(result.timedOut).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// * Cap-54: first music/ambience/countdown decode at countdown start ~1.3s host LT.
// * Play-entry warm must materialize + await these before commitMenuHidden plays them.
describe("play-entry audio warm (music / ambience / countdown keys)", () => {
  it("materializeGamePlaylistIfPending builds tracks without playing", () => {
    // * beforeEach may already have materialized a default playlist — replace it.
    setGamePlaylist([["warm-track-0.opus"], ["warm-track-1.opus"]]);
    materializeGamePlaylistIfPending();
    expect(hasMaterializedGamePlaylist()).toBe(true);
    const tracks = MockHowl.instances.filter((h) =>
      (h.opts.src || []).some((s) => String(s).startsWith("warm-track-")),
    );
    expect(tracks.length).toBeGreaterThanOrEqual(2);
    expect(tracks.every((h) => h.playCalls === 0)).toBe(true);
  });

  it("prefetchGameMusicAsync loads track 0", async () => {
    setGamePlaylist([["warm-music-a.opus"]]);
    const result = await prefetchGameMusicAsync();
    expect(result.total).toBe(1);
    expect(result.loaded).toBe(1);
    expect(result.timedOut).toBe(false);
    const track = MockHowl.instances.find((h) =>
      (h.opts.src || []).includes("warm-music-a.opus"),
    );
    expect(track?.state()).toBe("loaded");
    expect(track?.playCalls ?? 0).toBe(0);
  });

  it("prefetchAmbienceAsync loads beds without playing", async () => {
    registerAmbience("warm_bed", "warm-bed.opus", 0.3);
    const result = await prefetchAmbienceAsync(["warm_bed", "missing_key"]);
    expect(result.total).toBe(1);
    expect(result.loaded).toBe(1);
    expect(result.timedOut).toBe(false);
    const bed = MockHowl.instances.find((h) =>
      (h.opts.src || []).includes("warm-bed.opus"),
    );
    expect(bed?.state()).toBe("loaded");
    expect(bed?.playCalls ?? 0).toBe(0);
  });

  it("prefetchSfxKeysAsync warms only the listed keys", async () => {
    registerSfx("countdown_warm_3", ["cw3.opus"], { preload: false });
    registerSfx("countdown_warm_skip", ["cws.opus"], { preload: false });
    const result = await prefetchSfxKeysAsync(["countdown_warm_3", "nope"]);
    expect(result).toEqual({ loaded: 1, total: 1, timedOut: false });
    const hit = MockHowl.instances.find((h) => (h.opts.src || []).includes("cw3.opus"));
    const skip = MockHowl.instances.find((h) => (h.opts.src || []).includes("cws.opus"));
    expect(hit?.loadCalls).toBeGreaterThanOrEqual(1);
    expect(skip?.loadCalls ?? 0).toBe(0);
  });

  it("fire-and-forget prefetch still kicks load without awaiting", () => {
    registerSfx("announcer_warm_d_01", ["f.opus"], { preload: false });
    const howl = MockHowl.instances[MockHowl.instances.length - 1];
    expect(howl.state()).toBe("unloaded");
    prefetchSfxByPrefix("announcer_warm_d_");
    expect(howl.loadCalls).toBe(1);
    expect(howl.state()).toBe("loaded");
  });
});

// * MENU-MUSIC-VOL-1 — the store's volume domain is 0..AUDIO_VOLUME_MAX (1.15) but Howler
// * only accepts 0..1, and it fails ASYMMETRICALLY: the volume() setter silently ignores
// * anything >1 (falls through to its getter branch, never throws), while the Howl
// * constructor does not validate at all. A >1 value therefore reaches `_volume`, and the
// * `node.volume = _volume` write every Sound performs on play — including at each loop
// * restart — throws IndexSizeError, stranding a fresh <audio> element at its DEFAULT 1.0.
// * That is full scale: menu music far LOUDER than the player set, unfixable afterwards
// * because the corrective setter refuses the poisoned value forever.
describe("volume clamp at the Howler boundary (MENU-MUSIC-VOL-1)", () => {
  const initial = audioStore.getState();
  const restore = { music: initial.musicVolume, sfx: initial.sfxVolume };

  afterEach(() => {
    audioStore.getState().setMusicVolume(restore.music);
    audioStore.getState().setSfxVolume(restore.sfx);
    setSfxPerVolume("cartCrash", 1);
  });

  it("the premise still holds: the store domain reaches above Howler's ceiling", () => {
    // * If this ever fails the clamp is merely redundant, not wrong — but the comments
    // * above it would be lying, so make that loud rather than silent.
    expect(AUDIO_VOLUME_MAX).toBeGreaterThan(1);
    audioStore.getState().setMusicVolume(AUDIO_VOLUME_MAX);
    expect(audioStore.getState().musicVolume).toBeGreaterThan(1);
  });

  it("never CONSTRUCTS a music Howl above 1, even at max slider", () => {
    audioStore.getState().setMusicVolume(AUDIO_VOLUME_MAX);
    MockHowl.instances.length = 0;
    loadMenuMusic("menu.opus");
    const menu = MockHowl.instances.find((h) => (h.opts.src || []).includes("menu.opus"));
    expect(menu).toBeDefined();
    expect(menu.opts.volume).toBeLessThanOrEqual(1);
    expect(menu.opts.volume).toBe(1);
  });

  it("never WRITES a music volume above 1, even at max slider", () => {
    loadMenuMusic("menu.opus");
    const menu = MockHowl.instances.find((h) => (h.opts.src || []).includes("menu.opus"));
    menu.volumeCalls.length = 0;
    audioStore.getState().setMusicVolume(AUDIO_VOLUME_MAX);
    playMenuMusic();
    expect(menu.volumeCalls.length).toBeGreaterThan(0);
    for (const v of menu.volumeCalls) expect(v).toBeLessThanOrEqual(1);
  });

  it("passes legal values through untouched — the clamp is not a rescale", () => {
    // * Guards against "fixing" this by dividing by AUDIO_VOLUME_MAX, which decayed
    // * saved volume ~1/1.15 per page load the last time it was tried.
    loadMenuMusic("menu.opus");
    const menu = MockHowl.instances.find((h) => (h.opts.src || []).includes("menu.opus"));
    menu.volumeCalls.length = 0;
    audioStore.getState().setMusicVolume(0.5);
    expect(menu.volumeCalls).toContain(0.5);
  });

  it("never constructs an SFX Howl above 1, even at max slider", () => {
    audioStore.getState().setSfxVolume(AUDIO_VOLUME_MAX);
    registerSfx("clamp_probe", ["clamp-probe.opus"], { preload: false });
    const sfx = MockHowl.instances.find((h) =>
      (h.opts.src || []).includes("clamp-probe.opus"),
    );
    expect(sfx.opts.volume).toBeLessThanOrEqual(1);
  });

  it("clamps the sfxVol x perVol PRODUCT, not just the slider", () => {
    // * setSfxPerVolume accepts up to 5, so a legal slider value alone is not enough.
    registerSfx("cartCrash", ["crash.opus"], { preload: false });
    const sfx = MockHowl.instances.find((h) => (h.opts.src || []).includes("crash.opus"));
    sfx.volumeCalls.length = 0;
    audioStore.getState().setSfxVolume(0.9);
    setSfxPerVolume("cartCrash", 4);
    expect(sfx.volumeCalls.length).toBeGreaterThan(0);
    for (const v of sfx.volumeCalls) expect(v).toBeLessThanOrEqual(1);
  });
});
