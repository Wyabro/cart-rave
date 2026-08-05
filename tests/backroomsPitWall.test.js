import { describe, it, expect } from "vitest";
import {
  getBackroomsPitWallSpec,
  getBackroomsPitDressingSpec,
} from "../src/levels/backroomsSupermarket.js";
import { CONFIG } from "../src/config.js";

// STORE-PLAT-WALL-1 — the arena cliff face had no collider.
//
// Wyatt fell into the Storerooms pit and drove straight through the wall attached to the
// arena, ending up underneath the playfield. The pit was sealed on three surfaces (backstop
// cap at the pit floor, full-height perimeter walls, per-shaft ricochet walls) and open on the
// fourth: buildPit rendered the 26 m cliff as four plain meshes with no physics.
//
// The invariants below are the ones that make the fix correct rather than merely present:
//
// 1. THE TOP IS NOT COPLANAR WITH THE CHAMFER. The perimeter chamfer prism bottoms out at
//    FLOOR_BOTTOM_Y, so a wall topping out at exactly that height shares a plane with it, and
//    exactly-coplanar faces flip contact ownership frame to frame (the CHAMFER_TUCK lesson,
//    see tests/zanzibarFloor.test.js). The top is pinned one CHAMFER_TUCK ABOVE
//    FLOOR_BOTTOM_Y so the two genuinely overlap. This is asserted as an equality on purpose:
//    ">= FLOOR_BOTTOM_Y" would pass a zero-overlap touch, which is the bug itself.
//
// 2. THE RING NEVER INTRUDES INTO THE PLAYFIELD. The inner face lands exactly on ARENA_HALF.
//    A wall poking inside it would be an invisible barrier at the arena edge — the opposite
//    complaint from the one that opened this card.
//
// 3. THE CORNERS OVERLAP. Adjacent walls overrun each corner so there is no seam for a cart
//    to slip through, the same way the void-shaft walls already overlap theirs.
//
// Rapier is stubbed in unit tests (vitest.config.js aliases it to an empty object), so there
// is no headless world to inspect — the geometry is asserted through the exported pure spec,
// the same pattern as getZanzibarFloorColliderSpec.

const CHAMFER_TUCK = 0.02; // keep in sync with backroomsSupermarket.js
const EPS = 1e-9;

const spec = getBackroomsPitWallSpec();
const { walls, arenaHalf, floorBottomY, pitFloorY, topY, skirt } = spec;

/** Axis-aligned extent of one wall on a given axis. */
const span = (w, axis) =>
  axis === "x"
    ? { min: w.px - w.hx, max: w.px + w.hx }
    : { min: w.pz - w.hz, max: w.pz + w.hz };

describe("STORE-PLAT-WALL-1 — Storerooms pit cliff colliders", () => {
  it("rings the arena with four walls", () => {
    expect(walls).toHaveLength(4);
  });

  it("tops out exactly one CHAMFER_TUCK above the floor bottom, never coplanar with it", () => {
    // The pinned number, not an inequality — see invariant 1 above.
    expect(topY).toBeCloseTo(floorBottomY + CHAMFER_TUCK, 12);
    expect(topY).toBeGreaterThan(floorBottomY);

    for (const w of walls) {
      expect(w.py + w.hy).toBeCloseTo(topY, 12);
    }
  });

  it("reaches the pit floor at the bottom, so nothing slips beneath the ring", () => {
    for (const w of walls) {
      expect(w.py - w.hy).toBeCloseTo(pitFloorY, 12);
    }
  });

  it("puts the inner face exactly on the arena edge and never inside it", () => {
    for (const w of walls) {
      // The short axis is the skirt thickness; the long axis runs along the edge.
      const thinX = w.hx < w.hz;
      const centre = thinX ? w.px : w.pz;
      const half = thinX ? w.hx : w.hz;
      const innerFace = Math.abs(centre) - half;

      expect(half).toBeCloseTo(skirt / 2, 12);
      expect(innerFace).toBeCloseTo(arenaHalf, 12);
      // Strictly outside: no part of the ring may cover playable floor.
      expect(innerFace).toBeGreaterThanOrEqual(arenaHalf - EPS);
    }
  });

  it("overlaps at every corner, leaving no seam", () => {
    const zWalls = walls.filter((w) => w.hx > w.hz); // run along X, capped in Z
    const xWalls = walls.filter((w) => w.hz > w.hx); // run along Z, capped in X
    expect(zWalls).toHaveLength(2);
    expect(xWalls).toHaveLength(2);

    for (const zw of zWalls) {
      for (const xw of xWalls) {
        // The pair must share footprint area at the corner they meet, not merely touch.
        const ox = Math.min(span(zw, "x").max, span(xw, "x").max)
          - Math.max(span(zw, "x").min, span(xw, "x").min);
        const oz = Math.min(span(zw, "z").max, span(xw, "z").max)
          - Math.max(span(zw, "z").min, span(xw, "z").min);
        expect(ox).toBeGreaterThan(0);
        expect(oz).toBeGreaterThan(0);
      }
    }
  });

  it("spans the full cliff height the visual ring draws", () => {
    for (const w of walls) {
      expect(w.hy * 2).toBeCloseTo(topY - pitFloorY, 12);
    }
  });
});

// STORE-PIT-WEDGE-1 — the pit band must stay wider than a cart can bridge.
//
// Giving the cliff a collider turned the pit band into a corridor with a solid wall on BOTH
// sides: the cliff inside, the perimeter wall's physics slab outside, gondola rows between.
// The gondolas were a 9 m row at 45.5, which left 2.0 m of inner gap — a cart fits into that
// sideways (1.47 m) but cannot turn in it (2.83 m diagonal), so it wedged and stayed wedged.
//
// The bar is derived from CONFIG.cart.size + the round-cuboid skin rather than hardcoded, so
// growing the cart fails this test instead of silently re-creating the trap. Both gaps are
// checked: pushing the band outward to fix the inner gap trades it for an identical outer one
// against the room wall, which is exactly the mistake this assertion exists to catch.

const CART_SKIN = 0.08; // roundCuboid border radius, entities.js
const cartW = CONFIG.cart.size.x + CART_SKIN * 2;
const cartL = CONFIG.cart.size.z + CART_SKIN * 2;
const CART_DIAGONAL = Math.hypot(cartW, cartL);
const CLEARANCE_BAR = CART_DIAGONAL * 1.25; // margin over "just barely turns"

describe("STORE-PIT-WEDGE-1 — pit band clearance", () => {
  const d = getBackroomsPitDressingSpec();

  it("agrees with the cliff spec about where the cliff's outer face is", () => {
    const w = walls.find((x) => x.hx < x.hz); // an X-capped wall
    expect(d.cliffOuterFace).toBeCloseTo(Math.abs(w.px) + w.hx, 12);
  });

  it("leaves a cart room to turn between the cliff and the dressing", () => {
    const innerGap = d.innerFace - d.cliffOuterFace;
    expect(innerGap).toBeGreaterThan(CLEARANCE_BAR);
  });

  it("leaves a cart room to turn between the dressing and the room wall", () => {
    const outerGap = d.wallInnerFace - d.outerFace;
    expect(outerGap).toBeGreaterThan(CLEARANCE_BAR);
  });

  it("keeps the band roughly centred, so neither side is the weak one", () => {
    const innerGap = d.innerFace - d.cliffOuterFace;
    const outerGap = d.wallInnerFace - d.outerFace;
    expect(Math.abs(innerGap - outerGap)).toBeLessThan(1.0);
  });
});
