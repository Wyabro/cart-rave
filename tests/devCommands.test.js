// @vitest-environment happy-dom
// devCommands.test.js — pure command registry plus Cart Clash command-pack registration.

import { describe, expect, it, vi } from "vitest";
import {
  commandFail,
  commandOk,
  createCommandRegistry,
  parseCommandLine,
} from "../src/dev/commandRegistry.js";
import { createDevControl } from "../src/dev/devControl.js";
import { registerCartClashModules } from "../src/dev/index.js";
import { gameStore } from "../src/stores/gameStore.js";

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
    });

    expect(control.setScores({ 0: 1, 1: 0, 2: 0, 3: 0 }))
      .toEqual(expect.objectContaining({ ok: false, reason: "host-required" }));
    expect(setRoundScores).not.toHaveBeenCalled();
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
