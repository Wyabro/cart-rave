// @vitest-environment happy-dom
// REMATCH-NULLGUARD-1: rematchResetWorld must survive allCartsRef === null.
// destroyCarts nulls the ref (src/entities.js ~642); a rematch racing session
// teardown used to throw a TypeError inside the game loop. The two bare loops in
// rematchResetWorld now use `allCartsRef || []`, matching the sibling guards.

import { describe, it, expect, vi } from "vitest";

// * audioManager constructs Howl instances at import-time for its default pool;
// * the stub keeps the entities.js import chain cheap in the test environment.
vi.mock("howler", () => ({
  Howl: class {
    constructor() {
      this._state = "loaded";
    }
    state() { return this._state; }
    load() {}
    play() { return 42; }
    stop() {}
    volume() { return 1; }
    fade() {}
    once() {}
    unload() {}
  },
  Howler: { mute: vi.fn(), volume: vi.fn() },
}));

import { destroyCarts, rematchResetWorld } from "../src/entities.js";

describe("rematchResetWorld null guard (REMATCH-NULLGUARD-1)", () => {
  it("does not throw after destroyCarts nulls the cart ref", () => {
    // * Session teardown path: destroyCarts sets allCartsRef = null.
    destroyCarts();
    // * A rematch reset racing that teardown must no-op instead of throwing
    // * inside the game loop (previously a TypeError on the bare loops).
    expect(() => rematchResetWorld()).not.toThrow();
  });

  it("stays idempotent across repeated calls with no carts", () => {
    destroyCarts();
    expect(() => rematchResetWorld()).not.toThrow();
    expect(() => rematchResetWorld()).not.toThrow();
  });
});
