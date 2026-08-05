import { describe, it, expect } from "vitest";
import { getBackroomsPitWallSpec } from "../src/levels/backroomsSupermarket.js";

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
