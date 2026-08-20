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

describe("CART-POP-1 isolated Rapier Classic wedges", () => {
  it("does not launch a supported cart at event 1686, and names segments 11-12", () => {
    const report = runRepro();
    const rest = report.summary.find((row) => row.name === "wedges rest yaw0");
    expect(rest.maxDelta).toBeLessThan(0.2);
    expect(report.restContacts.y).toBeCloseTo(0.375, 2);
    const support = report.restContacts.details.find((row) => row.contacts > 0 && row.normalY > 0.9);
    expect(support.i).toBe(12);
    expect(report.restContacts.details.some((row) => row.i === 11 && row.normalY < 0.2)).toBe(true);
  });

  it("proves a CART-POP-scale +dvy on a high-speed floor impact with restitution 0.05", () => {
    const report = runRepro();
    const drop = report.summary.find((row) => row.name === "drop then inward drive");
    expect(drop.maxDelta).toBeGreaterThan(10);
    expect(drop.firstPop.preVy).toBeLessThan(-8);
    expect(0.05 * Math.abs(drop.firstPop.preVy)).toBeLessThan(1);
    expect(drop.firstPop.postVy).toBeGreaterThan(1);
  });
});
