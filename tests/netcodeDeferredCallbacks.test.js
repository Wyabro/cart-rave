// @vitest-environment happy-dom
/**
 * Callback seam guards (BUNDLE-1 Lever E + CB-SEAM-1).
 *
 * `netcode.js` stays eager but no longer statically imports the heavy game graph
 * (gameLoop / cartShatter / effects.groceryPool / scoring.koReactors /
 * announcer.announcerManager / directives.directiveEngine / cargoLoad). Those twelve
 * entry points are now keys on the `registerGameCallbacks` table, supplied by `gameBoot`
 * through the live-reading `buildNetcodeGameBridge` lambdas.
 *
 * The failure mode this guards is NOT a crash. A key that exists in netcode but is missing
 * from the bridge — or renamed on one side only — degrades to netcode's silent no-op
 * default in a live multiplayer session: a KO reactor that never fires, a remote directive
 * that never applies, a spill with no VFX. That is invisible until a player reports it.
 * So the key set is asserted on both sides, and each bridge lambda is proven to delegate
 * to the context key of the SAME name.
 *
 * CB-SEAM-1 extends that to the full callbacks table via GAME_CALLBACK_RENAMES /
 * GAME_CALLBACK_COMPOSED_BRIDGE_KEYS (literal ↔ bridge name mismatches).
 *
 * See docs/planning/bundle-1.md §11.
 */
import { describe, it, expect } from "vitest";
import * as Netcode from "../src/netcode.js";
import { buildNetcodeGameBridge } from "../src/gameSession.js";

const KEYS = Netcode.DEFERRED_GAME_CALLBACK_KEYS;
const RENAMES = Netcode.GAME_CALLBACK_RENAMES;
const COMPOSED = Netcode.GAME_CALLBACK_COMPOSED_BRIDGE_KEYS;

/** Args that satisfy every deferred callback's arity without touching real game state. */
const CALL_ARGS = {
  clearNpcCartCache: [],
  resetReconciliationState: [],
  hideCargoBay: [{}],
  triggerGrocerySpill: ["0", [0, 0, 0], [0, 0, 0, 1], [0, 0, 0], 6, null],
  isShatterAnimating: [{}, 0],
  dispatchKOEvent: [{}, {}],
  announce: ["new_host", { name: "x" }],
  applyRemoteDirective: [{ id: "d", durationMs: 1 }],
  clearDirectiveOnHostMigration: [],
  getDirectiveWireState: [],
  armSpillBoost: [{}],
  stripLifeCargo: [{}],
};

describe("BUNDLE-1 Lever E — deferred game-callback key parity", () => {
  it("declares a non-empty key set", () => {
    expect(KEYS.length).toBeGreaterThan(0);
    expect(new Set(KEYS).size).toBe(KEYS.length);
  });

  it("netcode's callback table stubs every deferred key", () => {
    const stubbed = new Set(Netcode.getGameCallbackKeys());
    const missing = KEYS.filter((k) => !stubbed.has(k));
    expect(missing).toEqual([]);
  });

  it("the session bridge supplies every deferred key as a function", () => {
    const bridge = buildNetcodeGameBridge(() => null, { returnToMenu: () => {} });
    const missing = KEYS.filter((k) => typeof bridge[k] !== "function");
    expect(missing).toEqual([]);
  });

  it("every bridge lambda delegates to the context key of the same name", () => {
    const called = [];
    const ctx = {};
    for (const key of KEYS) ctx[key] = (...args) => { called.push(key); return undefined; };
    const bridge = buildNetcodeGameBridge(() => ctx, { returnToMenu: () => {} });

    for (const key of KEYS) bridge[key](...CALL_ARGS[key]);

    expect(called.sort()).toEqual([...KEYS].sort());
  });

  it("every bridge lambda is null-safe with no context (pre-boot fail-safe)", () => {
    const bridge = buildNetcodeGameBridge(() => null, { returnToMenu: () => {} });
    for (const key of KEYS) {
      expect(() => bridge[key](...CALL_ARGS[key])).not.toThrow();
    }
    // * Documented inert defaults: omitting `payload.dir` IS the "no directive" wire state,
    // * and the isShatterAnimating read is guarded by `cart._shatterState` upstream.
    expect(bridge.getDirectiveWireState()).toBe(null);
    expect(bridge.isShatterAnimating({}, 0)).toBe(false);
  });

  it("netcode no longer statically imports the deferred game graph", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(import.meta.dirname, "../src/netcode.js"), "utf8");
    const forbidden = [
      "./gameLoop.js",
      "./cartShatter.js",
      "./effects/groceryPool.js",
      "./scoring/koReactors.js",
      "./announcer/announcerManager.js",
      "./directives/directiveEngine.js",
      "./cargoLoad.js",
    ];
    const leaked = forbidden.filter((m) => new RegExp(`^import[^\\n]*from "${m.replace(/[./]/g, "\\$&")}"`, "m").test(src));
    expect(leaked).toEqual([]);
  });
});

describe("CB-SEAM-1 — full bridge ↔ adapter ↔ literal parity", () => {
  it("rename map keys are live literal callbacks keys", () => {
    const literal = new Set(Netcode.getGameCallbackKeys());
    const orphanRenames = Object.keys(RENAMES).filter((k) => !literal.has(k));
    expect(orphanRenames).toEqual([]);
  });

  it("composed map keys are live literal callbacks keys", () => {
    const literal = new Set(Netcode.getGameCallbackKeys());
    const orphanComposed = Object.keys(COMPOSED).filter((k) => !literal.has(k));
    expect(orphanComposed).toEqual([]);
  });

  it("every literal key has a bridge function source (same name or rename)", () => {
    const bridge = buildNetcodeGameBridge(() => null, { returnToMenu: () => {} });
    const missing = [];
    for (const literalKey of Netcode.getGameCallbackKeys()) {
      const bridgeKey = Netcode.bridgeKeyForLiteral(literalKey);
      if (typeof bridge[bridgeKey] !== "function") missing.push(`${literalKey}→${bridgeKey}`);
      const extras = COMPOSED[literalKey];
      if (extras) {
        for (const extra of extras) {
          if (typeof bridge[extra] !== "function") missing.push(`${literalKey}+${extra}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every rename target differs from the literal key", () => {
    const same = Object.entries(RENAMES).filter(([lit, br]) => lit === br).map(([lit]) => lit);
    expect(same).toEqual([]);
  });

  it("bridge does not expose stripped getMenuVisible", () => {
    const bridge = buildNetcodeGameBridge(() => null, { returnToMenu: () => {} });
    expect(Object.hasOwn(bridge, "getMenuVisible")).toBe(false);
    expect(Netcode.getGameCallbackKeys()).not.toContain("getMenuVisible");
  });

  it("every bridge key is a function", () => {
    const bridge = buildNetcodeGameBridge(() => null, { returnToMenu: () => {} });
    const bad = Object.keys(bridge).filter((k) => typeof bridge[k] !== "function");
    expect(bad).toEqual([]);
  });
});
