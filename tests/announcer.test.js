// announcer.test.js — arbitration engine coverage for src/announcer/announcerManager.js.
// The manager is a module singleton (mirrors sfxSynth.js/audioManager.js), so each test
// resets the module registry and re-imports it fresh to guarantee full state isolation
// (queue, active channel, cooldowns, _lastEndMs, kill-burst hold, etc. all start clean).
// announcerStings.js is mocked so procedural playback is observable without a real
// AudioContext; announcerEvents.js/announcerLines.js are used unmocked (pure data/logic).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** @type {typeof import("../src/announcer/announcerManager.js")} */
let manager;
/** @type {{ playAnnouncerSting: import("vitest").Mock }} */
let stingsMock;
let deps;
let presenter;

/** Advances the fake clock (and performance.now(), which is faked alongside it). */
function advance(ms) {
  vi.advanceTimersByTime(ms);
}

/** Convenience: all showCallout eventIds observed so far, in call order. */
function playedEventIds() {
  return presenter.showCallout.mock.calls.map((call) => call[0].eventId);
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });

  stingsMock = { playAnnouncerSting: vi.fn(() => true) };
  vi.doMock("../src/announcer/announcerStings.js", () => stingsMock);

  manager = await import("../src/announcer/announcerManager.js");

  deps = {
    getSfxVolume: vi.fn(() => 1),
    getIsMuted: vi.fn(() => false),
    playSfx: vi.fn(() => 1),
    stopSfx: vi.fn(),
    fadeOutSfx: vi.fn(),
    isVoiceEnabled: vi.fn(() => true),
    isCalloutsEnabled: vi.fn(() => true),
    getLocale: vi.fn(() => "en"),
  };
  presenter = { showCallout: vi.fn(), hideCallout: vi.fn() };

  manager.initAnnouncer(deps);
  manager.setAnnouncerPresenter(presenter);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("../src/announcer/announcerStings.js");
});

describe("priority interrupt rule", () => {
  it("interrupts the active announcement only when incoming.priority >= active.priority + 20 AND active.interruptible", () => {
    // rampage (priority 50, medium, interruptible) becomes active via the kill-burst window.
    manager.announce("rampage");
    advance(450);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("rampage");

    // first_spill (priority 70) satisfies 70 >= 50 + 20 exactly -> interrupts.
    manager.announce("first_spill");
    advance(450);

    const state = manager.getAnnouncerDebugState();
    expect(state.activeEventId).toBe("first_spill");
    expect(presenter.hideCallout).toHaveBeenCalled();
    expect(playedEventIds()).toEqual(["rampage", "first_spill"]);
  });

  it("does not interrupt when the priority gap is under +20, even if interruptible", () => {
    manager.announce("rampage"); // priority 50, interruptible
    advance(450);

    manager.announce("double_spill"); // priority 62; 62 < 50 + 20 = 70
    advance(450);

    expect(manager.getAnnouncerDebugState().activeEventId).toBe("rampage");
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1);
  });

  it("does not interrupt a non-interruptible active announcement, even when it would otherwise queue", () => {
    manager.announce("carnage"); // priority 60, interruptible: false
    advance(450);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("carnage");

    // first_spill (70) clears the +20 threshold (70 >= 60+20=80 is false anyway, but even
    // an event that DID clear it couldn't interrupt carnage since it's not interruptible).
    manager.announce("first_spill");
    advance(450);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("carnage");
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1);
  });

  it("critical events always interrupt, even a non-interruptible active announcement", () => {
    manager.announce("carnage"); // priority 60, interruptible: false
    advance(450);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("carnage");

    manager.announce("sudden_death"); // cls critical — bypasses the interruptible flag entirely
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("sudden_death");
  });
});

describe("critical class flush", () => {
  it("interrupts the active announcement and flushes the entire queue, regardless of interruptible", () => {
    manager.announce("carnage"); // interruptible: false
    advance(450);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("carnage");

    manager.announce("new_leader", { leader: "P1" });
    manager.announce("last_call");
    expect(manager.getAnnouncerDebugState().queueLength).toBe(2);

    manager.announce("victory");

    const state = manager.getAnnouncerDebugState();
    expect(state.activeEventId).toBe("victory");
    expect(state.queueLength).toBe(0);
    expect(presenter.hideCallout).toHaveBeenCalled();
    // victory has callout: null -> never shown via showCallout.
    expect(playedEventIds()).not.toContain("victory");
  });
});

describe("queue: max 2 items + priority eviction", () => {
  it("evicts the lowest-priority queued item when full and the incoming item is higher priority", () => {
    manager.announce("defeat"); // critical, priority 100 — stable, un-interruptible-by-anything-else backdrop
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("defeat");

    manager.announce("double_spill"); // priority 62
    advance(450);
    manager.announce("savage"); // priority 55
    advance(450);
    expect(manager.getAnnouncerDebugState().queueLength).toBe(2);

    // aisle_wipeout (68) should evict savage (55, the lowest of the two queued).
    manager.announce("aisle_wipeout");
    advance(450);
    expect(manager.getAnnouncerDebugState().queueLength).toBe(2);

    // Let defeat finish (1400ms total) + the min gap, then drain (advance overshoots
    // MIN_GAP_MS so the knob can move under 1800 without touching this math).
    advance(1400 - 1350 + 1800 + 50);
    // Highest priority queued item drains first: aisle_wipeout (68) beats double_spill (62).
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("aisle_wipeout");
    expect(playedEventIds()).toEqual(["aisle_wipeout"]);
    expect(playedEventIds()).not.toContain("savage");
  });

  it("discards the incoming item when the queue is full and it is not higher priority than the lowest", () => {
    manager.announce("defeat");
    manager.announce("double_spill"); // 62
    advance(450);
    manager.announce("carnage"); // 60
    advance(450);
    expect(manager.getAnnouncerDebugState().queueLength).toBe(2);

    manager.announce("savage"); // 55 — lower than both queued (62, 60) -> discarded
    advance(450);
    expect(manager.getAnnouncerDebugState().queueLength).toBe(2);
    expect(manager.getAnnouncerDebugState().heldEventId).toBeNull();
  });
});

describe("dedupe by event id in the queue", () => {
  it("replaces a duplicate queued event id with the newer data instead of adding a second entry", () => {
    // double_spill (1100ms, non-interruptible) as a busy backdrop. new_host (ttlMs 4000)
    // as the queued item — at the current min gap, shorter-TTL events (e.g. new_leader's
    // 2500) can legitimately expire before the drain; that expiry is its own test below.
    manager.announce("double_spill");
    advance(450); // burst window -> becomes active

    manager.announce("new_host", { name: "P1" });
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1);

    manager.announce("new_host", { name: "P2" });
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1);

    advance(1100 + 1800 + 50); // double_spill ends, min gap elapses, queue drains
    const call = presenter.showCallout.mock.calls.find((c) => c[0].eventId === "new_host");
    expect(call[0].text).toContain("P2");
    expect(call[0].text).not.toContain("P1");
  });
});

describe("TTL expiry", () => {
  it("drops a queued item once its ttlMs has elapsed by the time the channel would drain it", () => {
    manager.announce("defeat"); // 1400ms, busy backdrop
    manager.announce("last_call"); // ttlMs 1500
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1);

    // defeat ends at 1400, drain fires at 1400 + MIN_GAP_MS — either way well past
    // last_call's expiry at 1500 — so it should never play.
    advance(3300);

    expect(manager.getAnnouncerDebugState().queueLength).toBe(0);
    expect(manager.getAnnouncerDebugState().activeEventId).toBeNull();
    expect(playedEventIds()).not.toContain("last_call");
  });
});

describe("sequence events", () => {
  it("bypass the minimum gap and are never queued, even overriding a busy channel", () => {
    manager.announce("comeback"); // plays immediately (channel idle at t=0)
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("comeback");
    advance(1200); // comeback's durationMs — natural end, gap timer now pending (needs +1200 more)

    // Gap has NOT elapsed yet — a normal event would have to queue/wait.
    manager.announce("countdown_3");
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("countdown_3");
    expect(manager.getAnnouncerDebugState().queueLength).toBe(0);
    expect(deps.playSfx).toHaveBeenCalledWith("countdown_3");

    // A second sequence event immediately overrides the first, still without queuing.
    manager.announce("countdown_2");
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("countdown_2");
    expect(manager.getAnnouncerDebugState().queueLength).toBe(0);
  });

  it("plays sequence audio via sfxKey unconditionally, even when the announcer voice toggle is off", () => {
    deps.isVoiceEnabled.mockReturnValue(false);
    manager.announce("go");
    expect(deps.playSfx).toHaveBeenCalledWith("countdown_go");
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("go");
  });
});

describe("ambient class", () => {
  it("is silently discarded when the channel is busy", () => {
    manager.announce("defeat");
    manager.announce("close_call");
    expect(manager.getAnnouncerDebugState().queueLength).toBe(0);
    expect(playedEventIds()).not.toContain("close_call");
  });

  it("is silently discarded when the queue is non-empty, even if the channel is idle", () => {
    // double_spill (1100ms) as backdrop — new_host's ttlMs (4000) leaves headroom to
    // survive the min-gap wait, unlike shorter-TTL events.
    manager.announce("double_spill");
    advance(450);
    manager.announce("new_host", { name: "P1" }); // queues
    advance(1100 + 1800 + 50); // double_spill ends, new_host drains and becomes active
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("new_host");

    // Queue is empty and channel is busy (new_host itself) — still discarded via the busy check.
    manager.announce("close_call");
    expect(playedEventIds()).not.toContain("close_call");
  });

  it("plays when the channel is idle and the queue is empty", () => {
    manager.announce("close_call");
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("close_call");
  });
});

describe("per-event gates", () => {
  it("oncePerRound: fires at most once until the round resets", () => {
    manager.announce("last_call");
    expect(playedEventIds()).toEqual(["last_call"]);

    advance(1000 + 1200 + 50);
    manager.announce("last_call");
    expect(playedEventIds()).toEqual(["last_call"]); // still just the one play
  });

  it("cooldownMs: blocks an immediate repeat, allows it again once the cooldown elapses", () => {
    manager.announce("double_spill");
    advance(450); // burst window
    expect(playedEventIds()).toEqual(["double_spill"]);

    // Immediate repeat, still well inside the 6000ms cooldown.
    manager.announce("double_spill");
    expect(manager.getAnnouncerDebugState().heldEventId).toBeNull(); // gated before it could open a burst hold

    // Clear the channel/gap and cross the cooldown boundary (cooldown stamped at t=0).
    advance(6000 + 1200);
    manager.announce("double_spill");
    advance(450);
    expect(playedEventIds()).toEqual(["double_spill", "double_spill"]);
  });

  it("maxPerRound: blocks once the per-round cap is reached", () => {
    manager.announce("close_call"); // maxPerRound 2, cooldownMs 25000
    advance(700 + 1200 + 25000); // clear the channel/gap AND the cooldown before the next attempt

    manager.announce("close_call");
    advance(700 + 1200 + 25000);
    expect(playedEventIds()).toEqual(["close_call", "close_call"]);

    // 3rd attempt — cooldown has elapsed too, so maxPerRound(2) is the only remaining gate.
    manager.announce("close_call");
    expect(manager.getAnnouncerDebugState().activeEventId).not.toBe("close_call");
    expect(playedEventIds()).toEqual(["close_call", "close_call"]);
  });
});

describe("kill-burst merge window", () => {
  it("collects same-window arrivals and announces only the highest priority one", () => {
    manager.announce("rampage"); // 50 — opens the 450ms hold
    advance(100);
    manager.announce("first_spill"); // 70 — replaces the held survivor
    advance(100);
    manager.announce("double_spill"); // 62 — lower than the current survivor, ignored

    advance(450); // window closes (measured from the first arrival at t=0)

    expect(manager.getAnnouncerDebugState().activeEventId).toBe("first_spill");
    expect(playedEventIds()).toEqual(["first_spill"]);
  });

  it("consumes cooldown/round gates for swallowed events even though they never play", () => {
    manager.announce("rampage"); // cooldownMs 8000, opens hold at t=0
    advance(50);
    manager.announce("first_spill"); // wins the merge (survivor)
    advance(450); // fires; first_spill plays

    // rampage was swallowed but its cooldown should already be stamped from t=0.
    manager.announce("rampage");
    expect(manager.getAnnouncerDebugState().heldEventId).toBeNull(); // gated by cooldown, never opens a new hold
  });
});

describe("comeback swallows new_leader", () => {
  it("cuts short an active new_leader and plays comeback in its place, bypassing the gap", () => {
    manager.announce("new_leader", { leader: "P1" });
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("new_leader");

    advance(100); // within the 450ms swallow window
    manager.announce("comeback", { leader: "P2" });

    expect(manager.getAnnouncerDebugState().activeEventId).toBe("comeback");
    expect(presenter.hideCallout).toHaveBeenCalled();
    expect(playedEventIds()).toEqual(["new_leader", "comeback"]);

    // The stale new_leader end-timer (originally due at t=1000) must not clobber comeback.
    advance(1000);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("comeback");
  });

  it("removes a queued new_leader instead of leaving both entries queued", () => {
    manager.announce("defeat"); // busy backdrop
    manager.announce("new_leader", { leader: "P1" });
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1);

    advance(100);
    manager.announce("comeback", { leader: "P2" });
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1); // new_leader replaced, not appended
  });

  it("does not swallow new_leader once the 450ms window has passed", () => {
    manager.announce("new_leader", { leader: "P1" });
    advance(1000 + 1800 + 50); // new_leader plays to completion, gap elapses, window long expired

    manager.announce("comeback", { leader: "P2" });
    expect(playedEventIds()).toEqual(["new_leader", "comeback"]);
  });
});

describe("voice pack registration", () => {
  it("routes playback to announcer_<key>_<NN> when a variant is registered", () => {
    manager.registerAnnouncerVoicePack({ locale: "en", availableKeys: ["first_spill_01"] });
    manager.announce("first_spill");
    advance(450);

    expect(deps.playSfx).toHaveBeenCalledWith("announcer_first_spill_01");
    expect(stingsMock.playAnnouncerSting).not.toHaveBeenCalled();
  });

  it("falls back to the procedural sting when no voice variant is registered", () => {
    manager.announce("first_spill");
    advance(450);

    expect(stingsMock.playAnnouncerSting).toHaveBeenCalledWith("firstSpill");
    expect(deps.playSfx).not.toHaveBeenCalledWith(expect.stringMatching(/^announcer_/));
  });
});

describe("recorded voice integration", () => {
  it("sequence events play a registered voice take INSTEAD of the beep sting", () => {
    manager.registerAnnouncerVoicePack({ locale: "en", availableKeys: ["countdown_3_01"] });
    manager.announce("countdown_3");

    expect(deps.playSfx).toHaveBeenCalledWith("announcer_countdown_3_01");
    expect(deps.playSfx).not.toHaveBeenCalledWith("countdown_3");
  });

  it("sequence voice plays even when the announcer voice toggle is off (core feedback)", () => {
    deps.isVoiceEnabled.mockReturnValue(false);
    manager.registerAnnouncerVoicePack({ locale: "en", availableKeys: ["go_01"] });
    manager.announce("go");

    expect(deps.playSfx).toHaveBeenCalledWith("announcer_go_01");
    expect(deps.playSfx).not.toHaveBeenCalledWith("countdown_go");
  });

  it("an interrupt fades out the interrupted announcement's audio", () => {
    manager.registerAnnouncerVoicePack({ locale: "en", availableKeys: ["rampage_01"] });
    manager.announce("rampage"); // priority 50, interruptible
    advance(450); // burst window -> active, voice playing
    expect(deps.playSfx).toHaveBeenCalledWith("announcer_rampage_01");

    manager.announce("first_spill"); // 70 >= 50 + 20 -> interrupts
    advance(450);

    expect(deps.fadeOutSfx).toHaveBeenCalledWith("announcer_rampage_01", 1, 90);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("first_spill");
  });

  it("natural completion does NOT stop the audio (reverb tail rings out)", () => {
    manager.registerAnnouncerVoicePack({ locale: "en", availableKeys: ["rampage_01"] });
    manager.announce("rampage");
    advance(450);
    advance(1100 + 50); // rampage's durationMs elapses -> natural end

    expect(manager.getAnnouncerDebugState().activeEventId).toBeNull();
    expect(deps.fadeOutSfx).not.toHaveBeenCalled();
    expect(deps.stopSfx).not.toHaveBeenCalled();
  });

  it("reserves the channel for the REAL voice clip length when it outruns durationMs", () => {
    deps.getSfxDurationMs = vi.fn(() => 3000);
    manager.registerAnnouncerVoicePack({ locale: "en", availableKeys: ["first_spill_01"] });
    manager.announce("first_spill"); // durationMs 1200, real take 3000
    advance(450); // burst window -> active at t=450

    advance(1200 + 100); // past the sting-era estimate — must STILL be talking
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("first_spill");

    advance(3000 - 1300 + 100); // past the real clip end
    expect(manager.getAnnouncerDebugState().activeEventId).toBeNull();
  });

  it("focus window extends to the full voice length plus post-focus quiet", () => {
    deps.getSfxDurationMs = vi.fn(() => 5000); // voice outruns the 4000ms callout hold
    manager.registerAnnouncerVoicePack({ locale: "en", availableKeys: ["directive_flash_sale_01"] });
    manager.announce("directive_flash_sale"); // focus window: max(4000, 5000) + 800 = 5800

    advance(5100); // voice done, but still inside the post-focus quiet
    manager.announce("refund"); // medium -> dropped, not queued
    expect(manager.getAnnouncerDebugState().queueLength).toBe(0);
    expect(playedEventIds()).not.toContain("refund");
  });
});

describe("resetAnnouncerRound", () => {
  it("clears the queue but leaves the currently-active announcement playing", () => {
    manager.announce("defeat");
    manager.announce("new_leader", { leader: "P1" });
    expect(manager.getAnnouncerDebugState().queueLength).toBe(1);

    manager.resetAnnouncerRound();

    expect(manager.getAnnouncerDebugState().queueLength).toBe(0);
    expect(manager.getAnnouncerDebugState().activeEventId).toBe("defeat");
  });

  it("clears oncePerRound/cooldown state so gated events can fire again", () => {
    manager.announce("last_call");
    expect(playedEventIds()).toEqual(["last_call"]);
    advance(1000 + 1800 + 50);

    manager.resetAnnouncerRound();
    manager.announce("last_call");
    expect(playedEventIds()).toEqual(["last_call", "last_call"]);
  });
});

describe("misc", () => {
  it("warns once for an unknown event id and otherwise ignores it", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    manager.announce("not_a_real_event");
    manager.announce("not_a_real_event");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(manager.getAnnouncerDebugState().activeEventId).toBeNull();
  });

  it("occupies no channel when the announcer voice is off and the event has no callout", () => {
    deps.isVoiceEnabled.mockReturnValue(false);
    manager.announce("sudden_death"); // callout: null, cls critical
    expect(manager.getAnnouncerDebugState().activeEventId).toBeNull();
    expect(deps.playSfx).not.toHaveBeenCalled();
    expect(stingsMock.playAnnouncerSting).not.toHaveBeenCalled();
  });

  it("stopAnnouncer hides the callout, clears the active channel, and empties the queue", () => {
    manager.announce("defeat");
    manager.announce("new_leader", { leader: "P1" });
    manager.stopAnnouncer();

    const state = manager.getAnnouncerDebugState();
    expect(state.activeEventId).toBeNull();
    expect(state.queueLength).toBe(0);
    expect(presenter.hideCallout).toHaveBeenCalled();
  });
});
