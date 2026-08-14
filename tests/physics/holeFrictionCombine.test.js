// HOLE-FRICTION-COMBINE-1 — dynamic FrictionCombineRule.Min while overhanging the hole.
//
// Rapier averages cart μ with the deck's 0.8 by default, so holeAssist.lowFriction
// (0.05) felt like ~0.425. Mode `hole` pairs low μ with Min; mode `normal` restores
// Average so floors keep the grip they were tuned against.
//
// Rapier WASM is stubbed in unit tests — mock colliders + pure resolve cover the
// seam; source canaries guard createCartCollider and the unstick precedence line.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG } from "../../src/config.js";
import {
  applyCartFrictionMode,
  resolveCartFrictionMode,
} from "../../src/simulation.js";

const entitiesSrc = readFileSync(new URL("../../src/entities.js", import.meta.url), "utf8");
const simSrc = readFileSync(new URL("../../src/simulation.js", import.meta.url), "utf8");

function mockCollider() {
  return {
    setFriction: vi.fn(),
    setFrictionCombineRule: vi.fn(),
  };
}

describe("resolveCartFrictionMode", () => {
  it("returns hole only when overhanging with center hole on and not respawning", () => {
    expect(
      resolveCartFrictionMode({
        overhanging: true,
        centerHoleEnabled: true,
        respawning: false,
      }),
    ).toBe("hole");
  });

  it("returns normal on the annulus", () => {
    expect(
      resolveCartFrictionMode({
        overhanging: false,
        centerHoleEnabled: true,
        respawning: false,
      }),
    ).toBe("normal");
  });

  it("returns normal when center hole is disabled", () => {
    expect(
      resolveCartFrictionMode({
        overhanging: true,
        centerHoleEnabled: false,
        respawning: false,
      }),
    ).toBe("normal");
  });

  it("returns normal while respawning", () => {
    expect(
      resolveCartFrictionMode({
        overhanging: true,
        centerHoleEnabled: true,
        respawning: true,
      }),
    ).toBe("normal");
  });
});

describe("applyCartFrictionMode", () => {
  /** @type {{ collider: ReturnType<typeof mockCollider>, _frictionMode?: string | null }} */
  let cart;

  beforeEach(() => {
    cart = { collider: mockCollider(), _frictionMode: null };
  });

  it("writes lowFriction + Min on transition into hole", () => {
    applyCartFrictionMode(cart, "hole");
    expect(cart.collider.setFriction).toHaveBeenCalledTimes(1);
    expect(cart.collider.setFriction).toHaveBeenCalledWith(
      CONFIG.record.holeAssist?.lowFriction ?? 0,
    );
    expect(cart.collider.setFrictionCombineRule).toHaveBeenCalledTimes(1);
    // * Numeric Min fallback is 1 when RAPIER is not initialized (unit tests).
    expect(cart.collider.setFrictionCombineRule).toHaveBeenCalledWith(1);
    expect(cart._frictionMode).toBe("hole");
  });

  it("writes cart.friction + Average on transition into normal", () => {
    cart._frictionMode = "hole";
    applyCartFrictionMode(cart, "normal");
    expect(cart.collider.setFriction).toHaveBeenCalledWith(CONFIG.cart.friction ?? 1.1);
    // * Numeric Average fallback is 0.
    expect(cart.collider.setFrictionCombineRule).toHaveBeenCalledWith(0);
    expect(cart._frictionMode).toBe("normal");
  });

  it("skips WASM writes when mode is unchanged (transition cache)", () => {
    applyCartFrictionMode(cart, "hole");
    cart.collider.setFriction.mockClear();
    cart.collider.setFrictionCombineRule.mockClear();
    applyCartFrictionMode(cart, "hole");
    expect(cart.collider.setFriction).not.toHaveBeenCalled();
    expect(cart.collider.setFrictionCombineRule).not.toHaveBeenCalled();
  });

  it("no-ops without a collider", () => {
    expect(() => applyCartFrictionMode({ body: {} }, "hole")).not.toThrow();
  });
});

describe("unstick vs hole mode (source + policy)", () => {
  it("skips unstick friction cut while _frictionMode is hole", () => {
    // * Policy unit: same gate the unstick path uses after the impulse.
    const cart = { _frictionMode: "hole", collider: mockCollider() };
    if (cart._frictionMode === "hole") {
      // impulse-only path
    } else if (cart.collider?.setFriction) {
      cart.collider.setFriction((CONFIG.cart.friction ?? 1.1) * 0.35);
      cart._frictionMode = null;
    }
    expect(cart.collider.setFriction).not.toHaveBeenCalled();
    expect(cart._frictionMode).toBe("hole");
  });

  it("source: unstick returns early when mode is hole before setFriction", () => {
    expect(simSrc).toContain('if (cart._frictionMode === "hole") return;');
    const unstick = simSrc.slice(
      simSrc.indexOf("function applyGeometryUnstick"),
      simSrc.indexOf("export function getRammingQualificationScore"),
    );
    const holeGuard = unstick.indexOf('if (cart._frictionMode === "hole") return;');
    const frictionWrite = unstick.indexOf("cart.collider.setFriction");
    expect(holeGuard).toBeGreaterThan(-1);
    expect(frictionWrite).toBeGreaterThan(holeGuard);
  });
});

describe("createCartCollider / env wiring canaries", () => {
  it("does not put FrictionCombineRule.Min on the cart at create time (Option B)", () => {
    const createStart = entitiesSrc.indexOf("function createCartCollider");
    const createEnd = entitiesSrc.indexOf("function buildCartVisualMesh", createStart);
    expect(createStart).toBeGreaterThan(-1);
    expect(createEnd).toBeGreaterThan(createStart);
    const createBlock = entitiesSrc.slice(createStart, createEnd);
    expect(createBlock).not.toContain("setFrictionCombineRule");
  });

  it("resetCartTransientState restores normal mode", () => {
    expect(entitiesSrc).toContain('applyCartFrictionMode(cart, "normal")');
  });

  it("applyEnvironmentResponse uses resolve + apply (not raw setFriction alone)", () => {
    const env = simSrc.slice(
      simSrc.indexOf("function applyEnvironmentResponse"),
      simSrc.indexOf("function applyArcadeControls"),
    );
    expect(env).toContain("resolveCartFrictionMode");
    expect(env).toContain("applyCartFrictionMode");
    // * Mid-fall must restore, not skip.
    expect(env).toContain("respawnAtMs");
    expect(env).toMatch(/applyCartFrictionMode\(cart,\s*"normal"\)/);
  });
});
