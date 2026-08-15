// WARM-QP-ROTATE-1 — play-entry adopts the room arena after hello, before carts/warm.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePlayEntryLevelId } from "../../src/bootstrap.js";

const bootstrapSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../src/bootstrap.js"),
  "utf8",
);

describe("resolvePlayEntryLevelId", () => {
  it("returns the room arena when it differs from the loaded arena", () => {
    expect(resolvePlayEntryLevelId("zanzibar", "backrooms")).toBe("backrooms");
  });

  it("returns null when room and loaded match", () => {
    expect(resolvePlayEntryLevelId("zanzibar", "zanzibar")).toBe(null);
  });

  it("returns null when hello has not latched a room arena", () => {
    expect(resolvePlayEntryLevelId("zanzibar", null)).toBe(null);
    expect(resolvePlayEntryLevelId("zanzibar", "")).toBe(null);
  });

  it("returns null for an unknown room id (does not invent DEFAULT_LEVEL)", () => {
    expect(resolvePlayEntryLevelId("zanzibar", "not-an-arena")).toBe(null);
  });
});

describe("ensureSessionCartsReady adopt order (source)", () => {
  it("adopts the room arena with skipWarm before bootstrapSessionCarts", () => {
    const adoptAt = bootstrapSrc.indexOf("play-arena-adopt");
    const skipAt = bootstrapSrc.indexOf("skipWarm: true");
    const cartsAt = bootstrapSrc.indexOf("d.bootstrapSessionCarts(bootstrapGen)");
    expect(adoptAt).toBeGreaterThan(-1);
    expect(skipAt).toBeGreaterThan(adoptAt);
    expect(cartsAt).toBeGreaterThan(skipAt);
  });

  it("clears lastPlayEntryWarm on a mismatch so the follow-up warm is full", () => {
    const adoptAt = bootstrapSrc.indexOf("if (adoptId)");
    const cartsAt = bootstrapSrc.indexOf("d.bootstrapSessionCarts(bootstrapGen)");
    expect(bootstrapSrc.slice(adoptAt, cartsAt)).toMatch(/lastPlayEntryWarm = false/);
  });
});
