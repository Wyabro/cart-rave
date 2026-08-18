// WARM-QP-ROTATE-1 — play-entry adopts the room arena after hello, before carts/warm.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePlayEntryLevelId } from "../../src/bootstrap.js";

const here = dirname(fileURLToPath(import.meta.url));
const bootstrapSrc = readFileSync(join(here, "../../src/bootstrap.js"), "utf8");
const levelOrchSrc = readFileSync(join(here, "../../src/orchestration/levelOrchestration.js"), "utf8");
const levelMgrSrc = readFileSync(join(here, "../../src/levels/levelManager.js"), "utf8");

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
  it("adopts the room arena and warms it (no flyover) before bootstrapSessionCarts", () => {
    const adoptAt = bootstrapSrc.indexOf("play-arena-adopt");
    const warmAt = bootstrapSrc.indexOf("skipFlyover: true");
    const cartsAt = bootstrapSrc.indexOf("d.bootstrapSessionCarts(bootstrapGen)");
    expect(adoptAt).toBeGreaterThan(-1);
    expect(warmAt).toBeGreaterThan(adoptAt);
    expect(cartsAt).toBeGreaterThan(warmAt);
    expect(bootstrapSrc).not.toMatch(/skipWarm:\s*true/);
  });

  it("consumes juice and marks the arena warm so the post-cart compile is short", () => {
    const adoptAt = bootstrapSrc.indexOf("if (adoptId)");
    const cartsAt = bootstrapSrc.indexOf("d.bootstrapSessionCarts(bootstrapGen)");
    const adoptBlock = bootstrapSrc.slice(adoptAt, cartsAt);
    expect(adoptBlock).toMatch(/lastPlayEntryWarm = false/);
    expect(adoptBlock).toMatch(/consumeRaveJuiceJustBuilt/);
    expect(adoptBlock).toMatch(/lastPlayEntryWarm = true/);
  });
});

describe("WARM-CLASSIC-JUICE-1 (source)", () => {
  it("does not init lasers when laserBudget is off", () => {
    expect(levelOrchSrc).toMatch(/laserBudget !== "off"/);
    const juiceAt = levelOrchSrc.indexOf("initBillboard");
    const gateAt = levelOrchSrc.indexOf('laserBudget !== "off"');
    const lasersAt = levelOrchSrc.indexOf("initLasers");
    expect(juiceAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(juiceAt);
    expect(lasersAt).toBeGreaterThan(gateAt);
  });

  it("adopt warm can skip the countdown flyover compile", () => {
    expect(levelOrchSrc).toMatch(/opts\.skipFlyover !== true/);
    expect(levelMgrSrc).toMatch(/skipFlyover: opts\.skipFlyover === true/);
  });
});
