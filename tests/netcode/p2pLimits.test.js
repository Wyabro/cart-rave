// p2pLimits.test.js — DataChannel (P2P gameplay plane) message-size policy.
//
// Unlike the WS control plane, these frames have no server relay: a semi-trusted host peer
// sends them and every client parses them at ~40Hz. This covers the pure size predicates
// and the binary-snapshot tail caps that bound the work a hostile/buggy host can force.
// Pure modules (no DOM): default node env.

import { describe, expect, it } from "vitest";
import {
  MAX_P2P_BINARY_BYTES,
  MAX_P2P_JSON_CHARS,
  MAX_SNAPSHOT_TAIL_BYTES,
  MAX_TAIL_COLLISIONS,
  MAX_TAIL_FALLS,
  isP2PBinaryWithinLimit,
  isP2PJsonWithinLimit,
} from "../../src/netcode/p2pLimits.js";
import { encodeHostStateSnapshot, decodeHostStateSnapshot } from "../../src/netcode/binary.js";

const oneCart = () => [{ p: [1, 2, 3], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] }];

describe("isP2PBinaryWithinLimit", () => {
  it("accepts sizes up to and including the ceiling", () => {
    expect(isP2PBinaryWithinLimit(0)).toBe(true);
    expect(isP2PBinaryWithinLimit(MAX_P2P_BINARY_BYTES)).toBe(true);
  });
  it("rejects oversized, negative, or non-finite sizes", () => {
    expect(isP2PBinaryWithinLimit(MAX_P2P_BINARY_BYTES + 1)).toBe(false);
    expect(isP2PBinaryWithinLimit(-1)).toBe(false);
    expect(isP2PBinaryWithinLimit(NaN)).toBe(false);
    expect(isP2PBinaryWithinLimit(Infinity)).toBe(false);
  });
});

describe("isP2PJsonWithinLimit", () => {
  it("accepts lengths up to and including the ceiling", () => {
    expect(isP2PJsonWithinLimit(0)).toBe(true);
    expect(isP2PJsonWithinLimit(MAX_P2P_JSON_CHARS)).toBe(true);
  });
  it("rejects oversized, negative, or non-finite lengths", () => {
    expect(isP2PJsonWithinLimit(MAX_P2P_JSON_CHARS + 1)).toBe(false);
    expect(isP2PJsonWithinLimit(-1)).toBe(false);
    expect(isP2PJsonWithinLimit(NaN)).toBe(false);
  });
});

describe("policy invariant", () => {
  it("permits a legitimate max-tail snapshot to pass the whole-frame ceiling", () => {
    // HEADER(16) + MAX_CARTS(4)*CART(52) + MAX_SNAPSHOT_TAIL_BYTES must fit under the frame cap.
    expect(16 + 4 * 52 + MAX_SNAPSHOT_TAIL_BYTES).toBeLessThanOrEqual(MAX_P2P_BINARY_BYTES);
  });
});

describe("binary snapshot tail caps (decode-side defense)", () => {
  it("drops an oversized JSON tail but keeps the cart transforms", () => {
    // ~300 collision objects blows past MAX_SNAPSHOT_TAIL_BYTES.
    const collisions = Array.from({ length: 300 }, (_, i) => ({
      intensity: 0.8,
      midpoint: { x: i, y: 2, z: 3 },
      slotB: i % 4,
    }));
    const buf = encodeHostStateSnapshot({ seq: 1, tHost: 1000, carts: oneCart(), collisions, falls: [] });

    // Precondition: the tail really is over the cap (frame minus header minus one cart).
    expect(buf.byteLength - 16 - 52).toBeGreaterThan(MAX_SNAPSHOT_TAIL_BYTES);

    const decoded = decodeHostStateSnapshot(buf);
    expect(decoded).not.toBeNull();
    expect(decoded.collisions).toEqual([]); // tail dropped
    expect(decoded.falls).toEqual([]);
    expect(decoded.carts).toHaveLength(1); // transforms survive
    expect(decoded.carts[0].p[0]).toBeCloseTo(1, 3);
  });

  it("caps collision/fall array lengths even when the byte tail is within limit", () => {
    // Many tiny entries stay under the byte ceiling but exceed the count caps.
    const collisions = Array.from({ length: MAX_TAIL_COLLISIONS + 25 }, (_, i) => ({ i }));
    const falls = Array.from({ length: MAX_TAIL_FALLS + 10 }, (_, i) => ({ i }));
    const buf = encodeHostStateSnapshot({ seq: 2, tHost: 1000, carts: oneCart(), collisions, falls });

    expect(buf.byteLength - 16 - 52).toBeLessThanOrEqual(MAX_SNAPSHOT_TAIL_BYTES); // byte tail is fine
    const decoded = decodeHostStateSnapshot(buf);
    expect(decoded.collisions).toHaveLength(MAX_TAIL_COLLISIONS);
    expect(decoded.falls).toHaveLength(MAX_TAIL_FALLS);
  });

  it("coerces a non-array collisions/falls field to an empty array", () => {
    const buf = encodeHostStateSnapshot({
      seq: 3,
      tHost: 1000,
      carts: oneCart(),
      collisions: "not-an-array",
      falls: { nope: true },
    });
    const decoded = decodeHostStateSnapshot(buf);
    expect(decoded.collisions).toEqual([]);
    expect(decoded.falls).toEqual([]);
  });

  it("still round-trips a normal small tail unchanged", () => {
    const collisions = [{ intensity: 0.5, midpoint: { x: 1, y: 2, z: 3 }, slotB: 2 }];
    const falls = [{ slotId: 1, respawnAtMs: 1234 }];
    const decoded = decodeHostStateSnapshot(
      encodeHostStateSnapshot({ seq: 4, tHost: 1000, carts: oneCart(), collisions, falls }),
    );
    expect(decoded.collisions).toEqual(collisions);
    expect(decoded.falls).toEqual(falls);
  });
});
