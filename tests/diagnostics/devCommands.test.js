// @vitest-environment happy-dom
// devCommands.test.js — pure command registry plus Cart Clash command-pack registration.

import { describe, expect, it, vi } from "vitest";
import {
  commandFail,
  commandOk,
  createCommandRegistry,
  parseCommandLine,
} from "../../src/dev/commandRegistry.js";
import { createDevControl } from "../../src/dev/devControl.js";
import { registerCartClashModules } from "../../src/dev/index.js";
import { gameStore } from "../../src/stores/gameStore.js";
import { isQuickplayRoom } from "../../shared/roomCodes.js";

/**
 * Mirror of `detectGameMode` (src/netcode.js) for a given room, without importing netcode.js —
 * that module pulls PartySocket and the whole netcode graph into a unit run. The test below
 * source-asserts that the real function still routes through the same predicate, so this mirror
 * cannot quietly diverge from it.
 * @param {string} room
 */
function detectGameModeForRoom(room) {
  if (room.toLowerCase().startsWith("testdrive")) return "testdrive";
  if (room.startsWith("solo")) return "solo";
  if (isQuickplayRoom(room)) return "quickplay";
  return "friends";
}

describe("developer command registry", () => {
  it("registers and executes commands through names and aliases", () => {
    const registry = createCommandRegistry();
    registry.register({
      name: "echo",
      aliases: ["say"],
      args: "<text>",
      help: "Echo arguments.",
      run: (args) => commandOk(args.join("|")),
    });

    expect(registry.execute("echo one two")).toEqual(commandOk("one|two"));
    expect(registry.execute("say three")).toEqual(commandOk("three"));
    expect(registry.names()).toEqual(["echo"]);
  });

  it("parses quoted arguments and escaped quotes", () => {
    expect(parseCommandLine(`echo "two words" 'three words' "say \\"hi\\""`))
      .toEqual(["echo", "two words", "three words", 'say "hi"']);
  });

  it("suggests by command name or alias prefix without duplicates", () => {
    const registry = createCommandRegistry();
    registry.register({
      name: "sudden",
      aliases: ["sd"],
      help: "Sudden Death.",
      run: () => commandOk("ok"),
    });
    registry.register({
      name: "scores",
      help: "Set scores.",
      run: () => commandOk("ok"),
    });

    expect(registry.suggest("s")).toEqual(["scores", "sudden"]);
    expect(registry.suggest("sd")).toEqual(["sudden"]);
  });

  it("formats searchable help with scope, args, and aliases", () => {
    const registry = createCommandRegistry();
    registry.register({
      name: "rewind",
      aliases: ["fast-end"],
      args: "[remainMs]",
      help: "Rewind the round clock.",
      scope: "host",
      run: () => commandOk("ok"),
    });

    expect(registry.help("clock")).toContain("rewind [remainMs] [host-only]");
    expect(registry.help("fast-end")).toContain("aliases: fast-end");
    expect(registry.help("missing")).toBe('No commands match "missing".');
  });

  it("returns shared failures for empty, unknown, and invalid command results", () => {
    const registry = createCommandRegistry();
    registry.register({ name: "broken", help: "Broken.", run: () => null });

    expect(registry.execute("")).toEqual(commandFail("bad-args", "Enter a command. Try: help"));
    expect(registry.execute("nope")).toEqual(
      commandFail("unknown", 'Unknown command "nope". Try: help'),
    );
    expect(registry.execute("broken")).toEqual(
      commandFail("unknown", 'Command "broken" returned an invalid result.'),
    );
  });

  it("rejects duplicate names and aliases", () => {
    const registry = createCommandRegistry();
    registry.register({
      name: "status",
      aliases: ["state"],
      help: "Status.",
      run: () => commandOk("ok"),
    });
    expect(() => registry.register({
      name: "state",
      help: "Duplicate.",
      run: () => commandOk("no"),
    })).toThrow(/already registered/);
  });
});

describe("shared developer control", () => {
  it("uses the natural timer path for Sudden Death and syncs once", () => {
    const calls = { scores: [], starts: [], syncs: 0 };
    const control = createDevControl({
      getIsHost: () => true,
      getRoundState: () => ({ phase: "running" }),
      getNetSlots: () => [{ kind: "human" }, { kind: "npc" }, null, null],
      getYouConnId: () => "host",
      getLocalSlotIndex: () => 0,
      setRoundScores: (scores) => calls.scores.push(scores),
      setRoundStartedAtMs: (time) => calls.starts.push(time),
      getRoundClockNowMs: () => 200_000,
      sendHostRound: () => { calls.syncs += 1; },
      grantKos: vi.fn(),
      roundDurationMs: 150_000,
      // * Not a public room — the SEC-DIAG-1 gate below refuses in prod quickplay, and the
      // * mode is fail-closed, so a round-lever test has to say which room it is in.
      getGameMode: () => "solo",
    });

    expect(control.forceSuddenDeath()).toEqual(expect.objectContaining({ ok: true }));
    expect(calls.scores).toEqual([{ 0: 2, 1: 2, 2: 0, 3: 0 }]);
    expect(calls.starts).toEqual([60_000]);
    expect(calls.syncs).toBe(1);
  });

  it("reports host and phase failures without mutating", () => {
    const setRoundScores = vi.fn();
    const control = createDevControl({
      getIsHost: () => false,
      getRoundState: () => ({ phase: "lobby" }),
      getNetSlots: () => [],
      getYouConnId: () => null,
      getLocalSlotIndex: () => -1,
      setRoundScores,
      setRoundStartedAtMs: vi.fn(),
      getRoundClockNowMs: () => 0,
      sendHostRound: vi.fn(),
      grantKos: vi.fn(),
      roundDurationMs: 150_000,
      getGameMode: () => "solo",
    });

    expect(control.setScores({ 0: 1, 1: 0, 2: 0, 3: 0 }))
      .toEqual(expect.objectContaining({ ok: false, reason: "host-required" }));
    expect(setRoundScores).not.toHaveBeenCalled();
  });

  it("places the local cart at an XZ hold and zeros planar speed", () => {
    const setTranslation = vi.fn();
    const setLinvel = vi.fn();
    const control = createDevControl(roundLeverDeps({
      getGameMode: () => "solo",
      getAllCarts: () => [{
        body: {
          translation: () => ({ x: 40, y: 2.1, z: 0 }),
          setTranslation,
          setLinvel,
        },
      }],
    }));
    expect(control.setLocalCartXZ(15, 0)).toEqual(expect.objectContaining({ ok: true }));
    expect(setTranslation).toHaveBeenCalledWith({ x: 15, y: 2.1, z: 0 }, true);
    expect(setLinvel).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 }, true);
  });

  it("refuses setLocalCartXZ without a local body", () => {
    const control = createDevControl(roundLeverDeps({
      getGameMode: () => "solo",
      getAllCarts: () => [],
    }));
    expect(control.setLocalCartXZ(15, 0))
      .toEqual(expect.objectContaining({ ok: false, reason: "unknown" }));
  });

  // * SEC-DIAG-1. devControl attaches in PRODUCTION under ?diag=1 (main.js) so round-end MP bugs
  // * can be reproduced live, which let a quickplay HOST set their own score. The gate is a
  // * conjunction — prod AND public quickplay — and both halves need pinning: gating on the room
  // * alone would break `tools/netharness.mjs`, which drives `room=quickplay` and calls
  // * control.setScores / rewindRoundClock against a dev stack.
  const roundLeverDeps = (over = {}) => ({
    getIsHost: () => true,
    getRoundState: () => ({ phase: "running" }),
    getNetSlots: () => [{ kind: "human" }, { kind: "npc" }, null, null],
    getYouConnId: () => "host",
    getLocalSlotIndex: () => 0,
    setRoundScores: vi.fn(),
    setRoundStartedAtMs: vi.fn(),
    getRoundClockNowMs: () => 200_000,
    sendHostRound: vi.fn(),
    grantKos: vi.fn(),
    roundDurationMs: 150_000,
    ...over,
  });

  it("refuses every round lever in production quickplay, even for a host mid-round", () => {
    const setRoundScores = vi.fn();
    const sendHostRound = vi.fn();
    const control = createDevControl(roundLeverDeps({
      isDev: false,
      getGameMode: () => "quickplay",
      setRoundScores,
      sendHostRound,
    }));

    for (const result of [
      control.setScores({ 0: 9, 1: 0, 2: 0, 3: 0 }),
      control.forceSuddenDeath(),
      control.rewindRoundClock(1500),
    ]) {
      expect(result).toEqual(expect.objectContaining({ ok: false, reason: "public-room" }));
    }
    // * Nothing reached the wire — a refusal that still called sendHostRound would have
    // * published the cheated state before failing.
    expect(setRoundScores).not.toHaveBeenCalled();
    expect(sendHostRound).not.toHaveBeenCalled();
  });

  it("refuses on an overflow SHARD too — QUICKPLAY-SHARD-1 must not reopen SEC-DIAG-1", () => {
    // * The regression bar recorded when SEC-DIAG-1 closed. The gate itself only ever sees a
    // * MODE string, so the shard risk lives one layer up in detectGameMode, which used to
    // * match the room name EXACTLY — `quickplay2` classified as "friends" and a ?diag=1 host
    // * on any overflow shard got setScores back. Both halves are pinned here so the pair
    // * cannot drift apart:
    //
    // * Half 1 (behaviour): whatever resolves to "quickplay" is refused in a prod build.
    const setRoundScores = vi.fn();
    const control = createDevControl(roundLeverDeps({
      isDev: false,
      getGameMode: () => detectGameModeForRoom("quickplay2"),
      setRoundScores,
    }));
    expect(control.setScores({ 0: 9, 1: 0, 2: 0, 3: 0 }))
      .toEqual(expect.objectContaining({ ok: false, reason: "public-room" }));
    expect(setRoundScores).not.toHaveBeenCalled();

    // * Half 2 — that the REAL detectGameMode still routes through this same predicate — is
    // * source-asserted in tests/quickplayShards.test.js. It cannot live here: this spec runs
    // * under happy-dom, where `import.meta.url` is not a file URL and readFileSync throws.
  });

  it("keeps the round levers in production friends and solo rooms", () => {
    for (const mode of ["friends", "solo", "testdrive"]) {
      const control = createDevControl(roundLeverDeps({ isDev: false, getGameMode: () => mode }));
      expect(control.setScores({ 0: 1, 1: 0, 2: 0, 3: 0 }))
        .toEqual(expect.objectContaining({ ok: true }));
    }
  });

  it("keeps the round levers in a DEV quickplay room, which is what the netharness drives", () => {
    const control = createDevControl(roundLeverDeps({ isDev: true, getGameMode: () => "quickplay" }));
    expect(control.setScores({ 0: 1, 1: 0, 2: 0, 3: 0 }))
      .toEqual(expect.objectContaining({ ok: true }));
    expect(control.rewindRoundClock(1500)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("fails closed when the room mode is unknown or unwired", () => {
    // * resolvedPartyRoomFromUrl already defaults a missing ?room= to "quickplay", so an
    // * unreadable mode must refuse rather than open.
    for (const getGameMode of [() => undefined, () => null, undefined]) {
      const control = createDevControl(roundLeverDeps({ isDev: false, getGameMode }));
      expect(control.setScores({ 0: 1, 1: 0, 2: 0, 3: 0 }))
        .toEqual(expect.objectContaining({ ok: false, reason: "public-room" }));
    }
  });

  it("leaves returnToMenu ungated — it is ESC-equivalent and the netharness teardown needs it", () => {
    const returnToMenu = vi.fn();
    const control = createDevControl(roundLeverDeps({
      isDev: false,
      getGameMode: () => "quickplay",
      returnToMenu,
    }));
    expect(control.returnToMenu("esc")).toEqual(expect.objectContaining({ ok: true }));
    expect(returnToMenu).toHaveBeenCalledWith("esc");
  });

  it("does not expose grantKos in a production build", () => {
    // * SEC-UNLOCK-1 precedent: grantKos is not host-gated and writes progression directly, so
    // * on prod any ?diag=1 tab could grant itself unlocks — the hole ?devUnlocks=all closed.
    // * Omitted, not failing, so the surface documents intent (same shape as forceKillFeed).
    const grantKos = vi.fn();
    const prod = createDevControl(roundLeverDeps({ isDev: false, getGameMode: () => "solo", grantKos }));
    expect(prod.grantKos).toBeUndefined();
    expect(grantKos).not.toHaveBeenCalled();

    const dev = createDevControl(roundLeverDeps({ isDev: true, getGameMode: () => "solo", grantKos }));
    expect(dev.grantKos("classicRecord", 3)).toEqual(expect.objectContaining({ ok: true }));
    expect(grantKos).toHaveBeenCalledWith("classicRecord", 3);
  });

  // * forceKillFeed (SHEET-1) is gated on isDev rather than host+running, because devControl
  // * also attaches in PRODUCTION under ?diag=1 (see `createDevControl` at its main.js call
  // * site) and a kill-feed injector must not exist on the live site. isDev is passed IN
  // * precisely so this prod branch is reachable from vitest, which always runs DEV === true.
  // * SEC-DIAG-1 put grantKos behind the same omit; its case lives above.
  const killFeedDeps = (over = {}) => ({
    getIsHost: () => true,
    getRoundState: () => ({ phase: "running" }),
    getNetSlots: () => [{ kind: "human", name: "YOU" }, { kind: "npc", name: "BOT" }, null, null],
    getYouConnId: () => "host",
    getLocalSlotIndex: () => 0,
    setRoundScores: vi.fn(),
    setRoundStartedAtMs: vi.fn(),
    getRoundClockNowMs: () => 0,
    sendHostRound: vi.fn(),
    grantKos: vi.fn(),
    roundDurationMs: 150_000,
    ...over,
  });

  it("does not expose forceKillFeed in a production build", () => {
    const control = createDevControl(killFeedDeps({ isDev: false }));
    expect(control.forceKillFeed).toBeUndefined();
  });

  it("renders one kill-feed row through the real reactor, without mutating score", () => {
    const addKillFeedEntry = vi.fn();
    const setRoundScores = vi.fn();
    const grantKos = vi.fn();
    const control = createDevControl(killFeedDeps({
      isDev: true,
      setRoundScores,
      grantKos,
      getHud: () => ({ addKillFeedEntry, colorHexToCss: (c) => `#${c}` }),
      getAllCarts: () => [],
      colorHexForSlot: () => 0x00ff00,
    }));

    expect(control.forceKillFeed({ victimSlotIndex: 1, comboTier: 2, comboMultiplier: 2 }))
      .toEqual(expect.objectContaining({ ok: true }));
    expect(addKillFeedEntry).toHaveBeenCalledTimes(1);
    // actor (local slot 0), then the victim's name from netSlots.
    expect(addKillFeedEntry.mock.calls[0][0]).toBe("YOU");
    expect(addKillFeedEntry.mock.calls[0][3]).toBe("BOT");
    // Presentation only — a screenshot tool must never write score or progression.
    expect(setRoundScores).not.toHaveBeenCalled();
    expect(grantKos).not.toHaveBeenCalled();
  });

  it("refuses a kill-feed row with no HUD or a self-KO", () => {
    const control = createDevControl(killFeedDeps({
      isDev: true,
      getHud: () => ({ addKillFeedEntry: vi.fn(), colorHexToCss: (c) => `#${c}` }),
      getAllCarts: () => [],
      colorHexForSlot: () => 0,
    }));
    expect(control.forceKillFeed({ victimSlotIndex: 0 }))
      .toEqual(expect.objectContaining({ ok: false, reason: "bad-args" }));

    const noHud = createDevControl(killFeedDeps({ isDev: true, getHud: () => null }));
    expect(noHud.forceKillFeed()).toEqual(expect.objectContaining({ ok: false, reason: "unknown" }));
  });
});

describe("Cart Clash command pack", () => {
  it("registers the expected v1 commands with mocked closure-bound deps", () => {
    const registry = createCommandRegistry();
    const ok = () => commandOk("ok");
    registerCartClashModules(registry, {
      control: {
        forceSuddenDeath: ok,
        rewindRoundClock: ok,
        setScores: ok,
        grantKos: ok,
      },
      getStatus: () => ({
        isHost: true,
        phase: "running",
        remainMs: 10_000,
        unlockOverride: "all",
      }),
    });

    expect(registry.names()).toEqual([
      "announce",
      "blackmon",
      "capture",
      "diag",
      "directive",
      "directives",
      "flags",
      "forcegpu",
      "help",
      "kos",
      "mute",
      "rewind",
      "scores",
      "sd",
      "status",
      "unlocks",
    ]);
    gameStore.setState({ roundPhase: "lobby", isSuddenDeath: false });
    expect(registry.execute("directive flash_sale")).toEqual(expect.objectContaining({
      ok: false,
      reason: "round-not-running",
    }));
  });
});
