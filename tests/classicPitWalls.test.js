import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// WALL-SLIDE-CLASSIC-1 — Cart Rave's vertical pit surfaces must not average friction
// with the cart.
//
// Rapier combines the two colliders' friction with Average by default, and the cart carries
// friction 1.1 (CONFIG.cart.friction). So Classic's containment lip, written 0.02 — the author
// reaching for ice — behaved like 0.56, and the shaft staves (0.05) like 0.575. The lip comment
// block in arena.js is an extended fight against carts grinding on that hull (inward lean so
// there is no resting equilibrium, knife edge so there is no flat top to park on); ice friction
// was the third leg of that fix and the only one that never took effect.
//
// Same bug and same fix as STORE-WALL-SLIDE-1 on Storerooms — see tests/backroomsPitWall.test.js.
//
// Rapier is stubbed in unit tests (vitest.config.js aliases it to an empty object), so there is
// no world to measure friction in. This is a source assertion, the same approach used by
// tests/spawnRing.test.js, and it exists because the rule is one chained call that is trivially
// dropped when a collider is edited later.

const src = readFileSync(new URL("../src/levels/arena.js", import.meta.url), "utf8");
const MIN_RULE = "setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)";

/** Source between two unique anchors, so the slice does not drift as the file is edited. */
function sliceBetween(startAnchor, endAnchor) {
  const a = src.indexOf(startAnchor);
  const b = src.indexOf(endAnchor, a);
  expect(a, `anchor missing: ${startAnchor}`).toBeGreaterThan(-1);
  expect(b, `anchor missing: ${endAnchor}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("WALL-SLIDE-CLASSIC-1 — Classic pit walls do not average friction with the cart", () => {
  it("sets the Min rule exactly twice", () => {
    // Shaft wall staves + containment lip hulls. Nothing else in Classic is wall-class.
    const hits = src.split(MIN_RULE).length - 1;
    expect(hits).toBe(2);
  });

  it("attaches each rule to the friction value it governs, not just somewhere in the file", () => {
    // A bare count would pass if a third Min appeared on the record floor. Requiring the rule
    // to sit in the same chain as its own setFriction() fails for the right reason instead.
    for (const value of ["0.02", "0.05"]) {
      const chain = new RegExp(
        `setFriction\\(${value.replace(".", "\\.")}\\)\\s*\\n\\s*\\.${MIN_RULE.replace(/[.()]/g, (c) => `\\${c}`)}`,
      );
      expect(src, `Min not chained to setFriction(${value})`).toMatch(chain);
    }
  });

  it("leaves the backstop cylinder on the default Average rule", () => {
    // Floor canary. The cylinder's top cap doubles as the shaft floor and sits at y -64, below
    // the -30 fall KO line — corpse-only. If it ever acquires Min, someone has run a "make the
    // pit consistent" sweep, which is exactly the move that would sand the driving feel off.
    const backstop = sliceBetween("Native cylinder collider", "--- Shaft walls");
    expect(backstop).not.toContain("setFrictionCombineRule");
  });

  it("never sets a restitution combine rule, because Rapier's default Average is load-bearing here", () => {
    // RAPIER-DEFAULT-MAX-1: this test's name and this comment used to say the default is Max —
    // it is Average (@dimforge/rapier3d/geometry/collider.js:861-862). Lip 0.5 and staves 0.6
    // averaged with the cart's 0.3 give 0.40 / 0.45, the deflection WALL-SLIDE-CLASSIC-1 passed
    // playtest at on prod a028cb8a — the feel is signed off at these real values, not the higher
    // ones the old comment implied. Sundial needed RestitutionCombineRule.Min for the opposite
    // reason — to hold a LOWER deck value (zanzibarPlatform.js:25). Copying that here would
    // flatten the bounce that keeps boosted rams from sailing out over the stands.
    expect(src).not.toContain("setRestitutionCombineRule");
  });
});
