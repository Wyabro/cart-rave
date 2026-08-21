// @vitest-environment happy-dom
// Snapshot finite guard: NaN/Infinity in snapshot poses must never reach Rapier
// bodies (applySnapshotToCartBody / applyCartState) — one poisoned component
// would ghost the cart permanently.
import { describe, expect, it } from "vitest";
import {
  applySnapshotToCartBody,
  applyCartState,
  isFiniteVec3,
  isFiniteQuat,
} from "../../src/netcode.js";

function mockBody() {
  const calls = { translation: null, rotation: null, linvel: null, angvel: null };
  return {
    calls,
    setTranslation(v) { calls.translation = v; },
    setRotation(v) { calls.rotation = v; },
    setLinvel(v) { calls.linvel = v; },
    setAngvel(v) { calls.angvel = v; },
  };
}

const GOOD_P = [1, 2, 3];
const GOOD_Q = [0, 0, 0, 1];
const GOOD_LV = [0.5, 0, -0.5];
const GOOD_AV = [0, 0.25, 0];

describe("isFiniteVec3 / isFiniteQuat", () => {
  it("accepts finite tuples of the right length", () => {
    expect(isFiniteVec3([1, 2, 3])).toBe(true);
    expect(isFiniteQuat([0, 0, 0, 1])).toBe(true);
  });
  it("rejects wrong shape and non-finite components", () => {
    expect(isFiniteVec3([1, 2])).toBe(false);
    expect(isFiniteVec3([1, 2, 3, 4])).toBe(false);
    expect(isFiniteVec3("nope")).toBe(false);
    expect(isFiniteVec3([NaN, 2, 3])).toBe(false);
    expect(isFiniteQuat([0, Infinity, 0, 1])).toBe(false);
  });
});

describe("applySnapshotToCartBody finite guard", () => {
  it("applies a fully valid snapshot", () => {
    const body = mockBody();
    applySnapshotToCartBody({ body }, { p: GOOD_P, q: GOOD_Q, lv: GOOD_LV, av: GOOD_AV });
    expect(body.calls.translation).toEqual({ x: 1, y: 2, z: 3 });
    expect(body.calls.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(body.calls.linvel).toEqual({ x: 0.5, y: 0, z: -0.5 });
    expect(body.calls.angvel).toEqual({ x: 0, y: 0.25, z: 0 });
  });

  it("rejects NaN pose without touching the body", () => {
    const body = mockBody();
    applySnapshotToCartBody({ body }, { p: [NaN, 2, 3], q: GOOD_Q, lv: GOOD_LV, av: GOOD_AV });
    expect(body.calls.translation).toBeNull();
    expect(body.calls.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("rejects Infinity quaternion and velocities without touching the body", () => {
    const body = mockBody();
    applySnapshotToCartBody(
      { body },
      { p: GOOD_P, q: [Infinity, 0, 0, 1], lv: [NaN, 0, 0], av: [0, 0, Infinity] },
    );
    expect(body.calls.translation).toEqual({ x: 1, y: 2, z: 3 });
    expect(body.calls.rotation).toBeNull();
    expect(body.calls.linvel).toBeNull();
    expect(body.calls.angvel).toBeNull();
  });

  it("keeps last good pose when a later snapshot turns hostile", () => {
    const body = mockBody();
    const cart = { body };
    applySnapshotToCartBody(cart, { p: GOOD_P, q: GOOD_Q, lv: GOOD_LV, av: GOOD_AV });
    applySnapshotToCartBody(cart, { p: [NaN, NaN, NaN], q: GOOD_Q, lv: GOOD_LV, av: GOOD_AV });
    expect(body.calls.translation).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe("applyCartState direct-snap finite guard", () => {
  it("snaps interpolation targets only from finite poses", () => {
    const cart = {
      body: mockBody(),
      _netTargetPos: { set(...xyz) { this.v = xyz; } },
      _netTargetQuat: { set(...xyzw) { this.q = xyzw; } },
      _lastNetLinvel: {},
      _lastNetAngvel: {},
    };
    applyCartState(cart, { p: [NaN, 0, 0], q: GOOD_Q, lv: GOOD_LV, av: GOOD_AV }, { interpolate: false });
    expect(cart.body.calls.translation).toBeNull();
    expect(cart._netTargetPos.v).toBeUndefined();
    expect(cart._netTargetQuat.q).toEqual([0, 0, 0, 1]);
    expect(cart._lastNetLinvel).toEqual({ x: 0.5, y: 0, z: -0.5 });
  });
});
