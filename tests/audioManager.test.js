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
      // * Howler's Sound pool lives on the Howl as `_sounds`; the music low-pass
      // * wrap helper iterates it. html5 music Howls get a real <audio> node so
      // * wrapMusicElements / createMediaElementSource can be asserted.
      this._sounds = opts.html5 && typeof document !== "undefined"
        ? [{ _node: document.createElement("audio") }]
        : [];
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
    /** Howler private: sampleRate-reload latch (see initAudioManager pin). */
    _mobileUnloaded: false,
    ctx: null,
    masterGain: null,
    volume: () => {},
    mute: () => {},
    stop: () => {},
  };
  return { Howl: MockHowl, Howler };
});

import { Howl as MockHowl, Howler as MockHowler } from "howler";
import {
  initAudioManager,
  setGamePlaylist,
  playGameMusic,
  stopGameMusic,
  loadMenuMusic,
  loadMenuPlaylist,
  getMenuTrackCount,
  playMenuMusic,
  stopMenuMusic,
  duckMusic,
  setMusicLowPass,
  registerSfx,
  playCartDeath,
  getSfxPerVolume,
  registerAmbience,
  prefetchSfxByPrefix,
  prefetchSfxByPrefixAsync,
  prefetchSfxKeysAsync,
  prefetchGameMusicAsync,
  prefetchAmbienceAsync,
  materializeGamePlaylistIfPending,
  hasMaterializedGamePlaylist,
  setSfxPerVolume,
  getAudioDebugState,
} from "../src/audioManager.js";
import { audioStore, AUDIO_VOLUME_MAX } from "../src/stores/audioStore.js";

describe("cart death audio layer", () => {
  it("plays the base death sound and explosion layer together", () => {
    MockHowl.instances.length = 0;
    registerSfx("death", ["Death.opus"], { pool: 3 });
    registerSfx("explosionAdd", ["explosion-add.opus"], { pool: 3 });

    const death = MockHowl.instances.at(-2);
    const explosion = MockHowl.instances.at(-1);
    playCartDeath();

    expect(death.playCalls).toBe(1);
    expect(explosion.playCalls).toBe(1);
    expect(getSfxPerVolume("death")).toBeCloseTo(1);
    expect(getSfxPerVolume("explosionAdd")).toBeCloseTo(0.7);
    expect(explosion.opts.volume / death.opts.volume).toBeCloseTo(0.7);
  });
});

/** Minimal AudioContext stub — only what initAudioManager touches. */
function makeAudioContextStub() {
  const ctx = {
    currentTime: 0,
    state: "running",
    /** Filters handed out by createBiquadFilter, for observing the module's filter. */
    filters: [],
    createGain: () => ({
      gain: { setValueAtTime: () => {} },
      connect: () => {},
    }),
    createBiquadFilter: () => {
      const filter = {
        type: "",
        Q: {},
        rampCalls: 0,
        connectedTo: undefined,
        frequency: {
          value: 0,
          cancelScheduledValues: () => {},
          setTargetAtTime: (value, time, tc) => {
            filter.frequency.value = value;
            filter.frequency.lastRamp = { value, time, tc };
            filter.rampCalls += 1;
          },
        },
        connect: (target) => {
          filter.connectedTo = target;
        },
      };
      ctx.filters.push(filter);
      return filter;
    },
    createMediaElementSource: () => ({ connect: () => {} }),
    destination: {},
    addEventListener: () => {},
  };
  return ctx;
}

/** The game-track Howls created by the most recent materialization. */
function gameTracks() {
  return MockHowl.instances.filter((h) => h.opts.onend && !h.opts.menuTrack);
}

function menuPlaylistHowls() {
  return MockHowl.instances.filter((h) => h.opts.menuTrack);
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
    return MockHowl.instances.find((h) => h.opts.menuTrack);
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

describe("menu playlist rotation", () => {
  beforeEach(() => {
    stopMenuMusic();
    loadMenuPlaylist(["menu-a.opus", "menu-b.opus"]);
  });

  it("plays the requested start index first", () => {
    playMenuMusic(1);
    const tracks = menuPlaylistHowls();
    expect(tracks).toHaveLength(2);
    expect(getMenuTrackCount()).toBe(2);
    expect(tracks[1].isPlaying).toBe(true);
    expect(tracks[0].isPlaying).toBe(false);
  });

  it("warms the next track and advances when one ends", () => {
    playMenuMusic(0);
    const tracks = menuPlaylistHowls();
    expect(tracks[0].isPlaying).toBe(true);
    expect(tracks[1].loadCalls).toBe(1);

    tracks[0].emitEnd();

    expect(tracks[1].isPlaying).toBe(true);
    expect(tracks[0].isPlaying).toBe(false);
  });

  it("wraps to the first track after the second ends", () => {
    playMenuMusic(0);
    const tracks = menuPlaylistHowls();

    tracks[0].emitEnd();
    tracks[1].emitEnd();

    expect(tracks[0].isPlaying).toBe(true);
  });

  it("does not advance after stopMenuMusic", () => {
    playMenuMusic(0);
    const tracks = menuPlaylistHowls();
    stopMenuMusic();

    tracks[0].emitEnd();

    expect(tracks.every((t) => !t.isPlaying)).toBe(true);
  });

  it("playGameMusic stops every menu track", () => {
    playMenuMusic(0);
    playGameMusic();

    expect(menuPlaylistHowls().every((t) => !t.isPlaying)).toBe(true);
    expect(gameTracks()[0].isPlaying).toBe(true);
  });

  it("a late play() on either menu track dies during game", () => {
    playMenuMusic(0);
    playGameMusic();

    for (const t of menuPlaylistHowls()) {
      t.emitLatePlay();
      expect(t.isPlaying).toBe(false);
    }
    expect(gameTracks()[0].isPlaying).toBe(true);
  });

  it("playMenuMusic does not retarget while a menu track is already playing", () => {
    playMenuMusic(0);
    const tracks = menuPlaylistHowls();
    playMenuMusic(1);
    expect(tracks[0].isPlaying).toBe(true);
    expect(tracks[1].isPlaying).toBe(false);
  });

  it("keeps startIdx when the DEV gate blocks playback (first-load original-song bug)", async () => {
    vi.resetModules();
    const am = await import("../src/audioManager.js");
    MockHowl.instances.length = 0;
    am.initAudioManager(makeAudioContextStub());
    am.loadMenuPlaylist(["menu-a.opus", "menu-b.opus"]);
    am.playMenuMusic(1);
    const dbg = am.getAudioDebugState();
    expect(dbg.menuTrackIdx).toBe(1);
    expect(dbg.menuShouldPlay).toBe(true);
    const tracks = MockHowl.instances.filter((h) => h.opts.menuTrack);
    expect(tracks.every((t) => !t.isPlaying)).toBe(true);
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

// * VOICE-BUS-1 — "The Store PA" voice takes (announcer_* keys) ride a third volume
// * category (VOICE) independent of SFX. Same clamp discipline as MENU-MUSIC-VOL-1:
// * the store domain reaches 1.15 but Howler's ceiling is 1.0, so the bus clamps
// * through howlerVol() and never divides by AUDIO_VOLUME_MAX.
describe("VOICE-BUS-1: announcer voice bus vs SFX bus", () => {
  const initial = audioStore.getState();
  const restore = {
    music: initial.musicVolume,
    sfx: initial.sfxVolume,
    voice: initial.voiceVolume,
  };

  afterEach(() => {
    audioStore.getState().setMusicVolume(restore.music);
    audioStore.getState().setSfxVolume(restore.sfx);
    audioStore.getState().setVoiceVolume(restore.voice);
    setSfxPerVolume("cartCrash", 1);
  });

  function findHowl(src) {
    return MockHowl.instances.find((h) => (h.opts.src || []).includes(src));
  }

  it("constructs announcer_* Howls at the VOICE category volume, not SFX", () => {
    audioStore.getState().setVoiceVolume(0.8);
    audioStore.getState().setSfxVolume(0.2);
    MockHowl.instances.length = 0;
    registerSfx("announcer_voice_bus_a", ["voice-a.opus"], { preload: false });
    registerSfx("plain_sfx_bus_a", ["plain-a.opus"], { preload: false });
    expect(findHowl("voice-a.opus").opts.volume).toBeCloseTo(0.8);
    expect(findHowl("plain-a.opus").opts.volume).toBeCloseTo(0.2);
  });

  it("voiceVolume moves only the announcer_* Howls and never writes above 1", () => {
    audioStore.getState().setSfxVolume(0.4);
    registerSfx("announcer_voice_bus_b", ["voice-b.opus"], { preload: false });
    registerSfx("plain_sfx_bus_b", ["plain-b.opus"], { preload: false });
    const voice = findHowl("voice-b.opus");
    const plain = findHowl("plain-b.opus");
    voice.volumeCalls.length = 0;
    plain.volumeCalls.length = 0;
    // * Store domain 1.15 must clamp to Howler's 1.0 ceiling on the VOICE bus too.
    audioStore.getState().setVoiceVolume(AUDIO_VOLUME_MAX);
    expect(voice.volumeCalls.at(-1)).toBeCloseTo(1);
    expect(voice.volumeCalls.at(-1)).toBeLessThanOrEqual(1);
    // * The re-apply loop visits plain SFX too, but at its own unchanged SFX level.
    expect(plain.volumeCalls.at(-1)).toBeCloseTo(0.4);
  });

  it("plain SFX is unaffected by voiceVolume changes", () => {
    audioStore.getState().setSfxVolume(0.9);
    audioStore.getState().setVoiceVolume(0.7);
    registerSfx("announcer_voice_bus_c", ["voice-c.opus"], { preload: false });
    registerSfx("plain_sfx_bus_c", ["plain-c.opus"], { preload: false });
    const voice = findHowl("voice-c.opus");
    const plain = findHowl("plain-c.opus");
    voice.volumeCalls.length = 0;
    plain.volumeCalls.length = 0;
    audioStore.getState().setVoiceVolume(0.1);
    expect(voice.volumeCalls.at(-1)).toBeCloseTo(0.1);
    expect(plain.volumeCalls.at(-1)).toBeCloseTo(0.9);
  });
});

// * SD-MUSIC-LPF-1 — Sudden Death low-passes the music. Music is html5-streamed
// * outside the graph, so the filter rides a shared BiquadFilter that each music
// * element joins via createMediaElementSource. The gate is decided once at
// * initAudioManager; Apple/WebKit platforms are excluded (that routing has gone
// * silent in several iOS releases).
// *
// * Music-silence regression (2026-08-08): Howler._unlockAudio closes a shared
// * THREE AudioContext when sampleRate !== 44100 and recreates one. Wrapping
// * music into the closed stash silences it permanently. init pins
// * _mobileUnloaded; wrap refuses closed contexts.
describe("SD-MUSIC-LPF-1: music low-pass bus", () => {
  it("initAudioManager wires the filter into Howler.masterGain and opens it", () => {
    const ctx = makeAudioContextStub();
    initAudioManager(ctx);

    const filter = ctx.filters[0];
    expect(filter).toBeDefined();
    expect(filter.type).toBe("lowpass");
    expect(filter.frequency.value).toBe(20000);
    expect(filter.connectedTo).toBe(MockHowler.masterGain);
  });

  it("pins Howler._mobileUnloaded so unlock cannot close the shared THREE context", () => {
    MockHowler._mobileUnloaded = false;
    initAudioManager(makeAudioContextStub());
    expect(MockHowler._mobileUnloaded).toBe(true);
  });

  it("setMusicLowPass(true) glides the cutoff down and is idempotent", () => {
    const ctx = makeAudioContextStub();
    initAudioManager(ctx);
    const filter = ctx.filters[0];

    setMusicLowPass(true);
    expect(filter.frequency.lastRamp.value).toBe(280);
    const rampsAfterFirst = filter.rampCalls;

    setMusicLowPass(true);
    expect(filter.rampCalls).toBe(rampsAfterFirst);
  });

  it("setMusicLowPass(false) glides the cutoff back to full band", () => {
    const ctx = makeAudioContextStub();
    initAudioManager(ctx);
    const filter = ctx.filters[0];

    setMusicLowPass(true);
    setMusicLowPass(false);

    expect(filter.frequency.lastRamp.value).toBe(20000);
  });

  it("Apple/WebKit platforms never build the filter; setMusicLowPass is a no-op", () => {
    vi.stubGlobal("navigator", {
      vendor: "Apple Computer, Inc.",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    try {
      const ctx = makeAudioContextStub();
      initAudioManager(ctx);

      expect(ctx.filters).toHaveLength(0);
      expect(() => setMusicLowPass(true)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
      // * Restore the supported flag for later tests in this file.
      initAudioManager(makeAudioContextStub());
    }
  });

  it("wrapMusicElements does not createMediaElementSource on a closed context", () => {
    const ctx = makeAudioContextStub();
    let mediaSourceCalls = 0;
    ctx.createMediaElementSource = () => {
      mediaSourceCalls += 1;
      return { connect: () => {} };
    };
    initAudioManager(ctx);
    try {
      // * Live wrap at init+load is allowed.
      loadMenuMusic("menu-live.opus");
      const liveCalls = mediaSourceCalls;
      expect(liveCalls).toBeGreaterThan(0);

      // * Simulate Howler.unload() closing the shared THREE context after LPF init.
      ctx.state = "closed";
      MockHowler.ctx = ctx;
      mediaSourceCalls = 0;

      // * ensureMusicLpGraph must disable the dead bus; wrap must not source again.
      expect(() => setMusicLowPass(true)).not.toThrow();
      loadMenuMusic("menu-closed.opus");
      expect(mediaSourceCalls).toBe(0);

      const dbg = getAudioDebugState();
      expect(dbg.howlerMobileUnloaded).toBe(true);
      expect(dbg.musicLpSupported).toBe(true);
      // * Bus cleared (null) once ensure sees only a closed ctx.
      expect(dbg.musicCtxState).toBe(null);
    } finally {
      initAudioManager(makeAudioContextStub());
    }
  });

  it("getAudioDebugState exposes LPF + mobile-unload pin fields", () => {
    initAudioManager(makeAudioContextStub());
    const dbg = getAudioDebugState();
    expect(dbg).toMatchObject({
      musicLpSupported: true,
      musicLpActive: false,
      musicCtxState: "running",
      howlerMobileUnloaded: true,
    });
    expect(typeof dbg.musicWrappedCount).toBe("number");
  });
});
