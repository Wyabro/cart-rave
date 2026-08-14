import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// SUNDIAL-OBSTACLE-SLIDE-1 — Sundial's vertical obstacles must not average friction with the
// cart.
//
// Rapier combines the two colliders' friction with Average by default (verified in
// @dimforge/rapier3d/geometry/collider.js — ColliderDesc sets frictionCombineRule AND
// restitutionCombineRule to Average), and the cart carries friction 1.1 (CONFIG.cart.friction).
// So the 8 corner bollards, the gnomon blade, and (SPAWN-SUNDIAL-1) the booth legs — all
// written 0.3 — behaved like 0.7 where Average still applied. The blade is the site that
// matters: a 6.2 m flat vertical face a cart can grind along, versus a bollard's brief
// point impact. Legs are the same class (vertical posts you hit, not driveable floor).
//
// The written 0.3 is deliberately NOT retuned. Min only makes the number real.
//
// Same bug and same fix as STORE-WALL-SLIDE-1 (Storerooms) and WALL-SLIDE-CLASSIC-1 (Cart Rave)
// — see tests/backroomsPitWall.test.js and tests/classicPitWalls.test.js.
//
// Rapier is stubbed in unit tests (vitest.config.js aliases it to an empty object), so there is
// no world to measure friction in. This is a source assertion, the same approach used by
// tests/classicPitWalls.test.js, and it exists because the rule is one chained call that is
// trivially dropped when a collider is edited later.

const src = readFileSync(new URL("../../src/levels/zanzibarPlatform.js", import.meta.url), "utf8");
const MIN_RULE = "setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)";
// `for (const p of bollardPositions)` appears TWICE — the visual instancing loop runs first.
// Anchor on the physics block's own comment so the slice cannot silently swallow the deck.
const BOLLARD_ANCHOR = "// * SUNDIAL-OBSTACLE-SLIDE-1 — FrictionCombineRule.Min";

/** Source between two unique anchors, so the slice does not drift as the file is edited. */
function sliceBetween(startAnchor, endAnchor) {
  const a = src.indexOf(startAnchor);
  const b = src.indexOf(endAnchor, a);
  expect(a, `anchor missing: ${startAnchor}`).toBeGreaterThan(-1);
  expect(b, `anchor missing: ${endAnchor}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("SUNDIAL-OBSTACLE-SLIDE-1 — Sundial obstacles do not average friction with the cart", () => {
  it("sets the Min rule exactly three times", () => {
    // Bollard loop + gnomon blade + SPAWN-SUNDIAL-1 booth-leg create chain (one source
    // occurrence inside the per-booth leg loop — count is text, not runtime colliders).
    // Cross-braces stay mesh-only; floors stay Average.
    const hits = src.split(MIN_RULE).length - 1;
    expect(hits).toBe(3);
  });

  it("attaches each rule to the friction value it governs, not just somewhere in the file", () => {
    // A bare count would pass if Mins landed on the deck. Requiring each rule to sit in
    // the same chain as its own setFriction(0.3) fails for the right reason instead.
    const chain = /setFriction\(0\.3\)\s*\n\s*\.setFrictionCombineRule\(RAPIER\.CoefficientCombineRule\.Min\)/g;
    expect(src.match(chain)?.length ?? 0).toBe(3);
  });

  it("keeps the bollards, blade, and booth legs at the written 0.3 — Min makes it real, it is not a retune", () => {
    const bollards = sliceBetween(BOLLARD_ANCHOR, "// * Gnomon blade collider");
    const blade = sliceBetween("const bladeH = GNOMON_TIP_Y - GNOMON_BASE_Y;", "// Per-frame deck animation");
    const legs = sliceBetween("// * SPAWN-SUNDIAL-1 — platform legs were visual-only", "for (const sx of [-pw + 0.4, pw - 0.4])");
    for (const [name, chunk] of [["bollards", bollards], ["gnomon blade", blade], ["booth legs", legs]]) {
      expect(chunk, `${name} friction changed`).toContain("setFriction(0.3)");
      expect(chunk, `${name} lost the Min rule`).toContain(MIN_RULE);
    }
  });

  it("leaves the deck cuboids on the default Average rule", () => {
    // Floor canary. DECK_FRICTION is tuned as a FELT value against the cart's 1.1 — the whole
    // point of Average on a driveable surface. If this ever acquires Min, someone has run a
    // "make Sundial consistent" sweep, which is exactly the move that would sand off the grip.
    const deck = sliceBetween("const addRectCollider = (rect) =>", "spec.deckRects.forEach");
    expect(deck).not.toContain("setFrictionCombineRule");
  });

  it("leaves the podium ramp hull on the default Average rule", () => {
    // Second floor canary — the ramp is driven up, not scraped along.
    const ramp = sliceBetween("// * Drivable ramp ring", "floorColliderHandles.push(podiumCollider.handle)");
    expect(ramp).not.toContain("setFrictionCombineRule");
  });

  it("leaves the spawn booth slabs on the default Average rule", () => {
    // Third floor canary. B.friction is config-driven, so a sweep touching config would not
    // show up here — but a sweep touching colliders would.
    const booth = sliceBetween(
      "RAPIER.ColliderDesc.cuboid(pw, B.platformThickness / 2, pd)",
      "boothColliderHandles.push(boothCollider.handle)",
    );
    expect(booth).not.toContain("setFrictionCombineRule");
  });

  it("keeps RestitutionCombineRule.Min on the floors only, and off the obstacles", () => {
    // The two axes are independent and easy to confuse. The deck needs Min on RESTITUTION to
    // hold its tuned 0.05 under the cart's 0.3 (file header, line ~25). The obstacles want
    // their 0.55 bounce and take no restitution rule at all.
    expect(src.split("setRestitutionCombineRule").length - 1).toBe(2);
    const bollards = sliceBetween(BOLLARD_ANCHOR, "// * Gnomon blade collider");
    expect(bollards).not.toContain("setRestitutionCombineRule");
  });
});

describe("ZAN-BOLLARD-CLASS-1 / ZAN-BOLLARD-PT-1 — Sundial vertical posts", () => {
  // classifyEnvironmentCollision (simulation.js) maps boothColliderHandles to "edge"
  // (FX only) and bollardColliderHandles to "clang" (the metallic impact sound).
  // ZAN-BOLLARD-CLASS-1 registered the bollards + gnomon as edge; ZAN-BOLLARD-PT-1
  // split them into their own list so the clang fires ONLY on the posts, not on
  // booth legs / the pit wall. Rapier is stubbed in unit tests, so this pins the
  // WIRING as source assertions — the feel lands on ZAN-BOLLARD-PT-1.

  it("declares clangHandles and captures the bollard + gnomon collider handles", () => {
    expect(src).toContain("const clangHandles = [];");
    // Bollard loop + gnomon blade both push their created collider's handle.
    expect(src.split("clangHandles.push(collider.handle);").length - 1).toBe(2);
    // The deck return carries clangHandles out of buildDeck.
    expect(src).toContain("group, body, floorColliderHandles, clangHandles, deckTex,");
    expect(src).toContain("floorColliderHandles: number[], clangHandles: number[],");
  });

  it("registers clangHandles into bollardColliderHandles, NOT boothColliderHandles", () => {
    // ZAN-BOLLARD-PT-1: the posts get their own classify list (clang sound); the
    // booth legs keep boothColliderHandles (edge FX only).
    expect(src).toContain("const bollardColliderHandles = [...deck.clangHandles];");
    expect(src).not.toContain("boothColliderHandles.push(...deck.clangHandles);");
    // The level return carries bollardColliderHandles out.
    expect(src).toContain("bollardColliderHandles,");
  });
});
