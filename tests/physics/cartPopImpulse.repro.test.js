import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hook = new URL("../rapier-live/register-rapier-hook.mjs", import.meta.url).href;
const script = fileURLToPath(new URL("../rapier-live/cartPopWedgeRepro.mjs", import.meta.url));

function runRepro() {
  const out = execFileSync(process.execPath, [
    "--experimental-wasm-modules",
    "--import",
    hook,
    script,
  ], {
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, CART_POP_REPRO_JSON: "1" },
  });
  return JSON.parse(out);
}

describe("CART-POP-1 isolated Rapier Classic annulus", () => {
  it("does not launch a supported cart at event 1686 rest pose", () => {
    const report = runRepro();
    const rest = report.summary.find((row) => row.name === "trimesh rest");
    expect(rest.maxDelta).toBeLessThan(0.2);
    expect(report.restContacts.y).toBeCloseTo(0.375, 2);
    expect(report.restContacts.pairs).toBeGreaterThan(0);
    const support = report.restContacts.details.find((row) => row.contacts > 0 && row.normalY > 0.9);
    expect(support).toBeTruthy();
  });

  it("does not convert 24 m/s planar drive into a CART-POP rise", () => {
    const report = runRepro();
    const drive = report.summary.find((row) => row.name === "trimesh tangent 24");
    expect(drive.maxDelta).toBeLessThan(0.75);
    expect(drive.pops).toBe(0);
    expect(drive.endY).toBeGreaterThan(0.2);
  });

  it("still stops a falling cart on the floor", () => {
    const report = runRepro();
    const drop = report.summary.find((row) => row.name === "drop then inward drive");
    expect(drop.endY).toBeGreaterThan(-1);
    expect(drop.minY).toBeGreaterThan(-1);
  });

  it("keeps the center hole open", () => {
    const report = runRepro();
    const hole = report.summary.find((row) => row.name === "center hole");
    expect(hole.endY).toBeLessThan(-1);
  });
});
