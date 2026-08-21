import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hook = new URL("../rapier-live/register-rapier-hook.mjs", import.meta.url).href;
const script = fileURLToPath(new URL("../rapier-live/cartPopStoreroomsRepro.mjs", import.meta.url));

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

describe("CART-POP-1 isolated Rapier Storerooms floor", () => {
  it("still launches on the pre-fix 9 cuboids at 24 m/s", () => {
    const report = runRepro();
    const cuboid = report.summary.find((row) => row.name === "cuboid circle r16 24");
    expect(cuboid.pops).toBe(1);
    expect(cuboid.firstPop.preVy).toBeCloseTo(0, 1);
    expect(cuboid.firstPop.y).toBeGreaterThan(0.2);
    const tilted = cuboid.firstPop.contacts.find((row) => (
      row.contacts > 0 && row.normalY < 0.98 && row.normalY > 0.7
    ));
    expect(tilted).toBeTruthy();
  });

  it("does not launch a supported cart on the hole-cut trimesh at rest", () => {
    const report = runRepro();
    const rest = report.summary.find((row) => row.name === "trimesh rest");
    expect(rest.maxDelta).toBeLessThan(0.2);
    expect(report.restContacts.y).toBeCloseTo(0.375, 2);
    expect(report.restContacts.pairs).toBeGreaterThan(0);
    const support = report.restContacts.details.find((row) => row.contacts > 0 && row.normalY > 0.9);
    expect(support).toBeTruthy();
  });

  it("does not convert 24 m/s circular drive into a CART-POP rise", () => {
    const report = runRepro();
    for (const name of ["trimesh circle r10 24", "trimesh circle r16 24", "trimesh circle seam 24"]) {
      const drive = report.summary.find((row) => row.name === name);
      expect(drive, name).toBeTruthy();
      expect(drive.maxDelta, name).toBeLessThan(0.75);
      expect(drive.pops, name).toBe(0);
      expect(drive.endY, name).toBeGreaterThan(0.2);
    }
  });

  it("still stops a falling cart on the floor", () => {
    const report = runRepro();
    const drop = report.summary.find((row) => row.name === "trimesh drop then drive");
    expect(drop.endY).toBeGreaterThan(-1);
    expect(drop.minY).toBeGreaterThan(-1);
  });

  it("keeps the four square voids open", () => {
    const report = runRepro();
    for (const name of [
      "trimesh hole +20 +20",
      "trimesh hole -20 +20",
      "trimesh hole +20 -20",
      "trimesh hole -20 -20",
    ]) {
      const hole = report.summary.find((row) => row.name === name);
      expect(hole, name).toBeTruthy();
      expect(hole.endY, name).toBeLessThan(-1);
    }
  });
});
