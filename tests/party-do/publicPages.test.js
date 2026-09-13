import { describe, expect, it } from "vitest";
import { requestPath } from "./beaconClient.js";

describe("public information pages and 404 routing", () => {
  it.each(["/privacy/", "/terms/"])("serves %s without game boot or trackers", async path => {
    const response = await requestPath(path);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Redshift Studios");
    expect(body).toContain("redshiftstudiossupport@gmail.com");
    expect(body).not.toContain("beacon.min.js");
    expect(body).not.toContain("game-analytics.js");
    expect(body).not.toContain("cr-boot-splash");
  });
  it.each(["/missing-aisle", "/deep/missing-page", "/assets/missing.js", "/api/not-a-route"])("keeps status 404 for %s", async path => {
    const response = await requestPath(path);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This aisle is empty.");
  });
  it("supports HEAD on missing pages without a body", async () => {
    const response = await requestPath("/missing-aisle", { method: "HEAD" });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
  it("serves the game at the root", async () => {
    const response = await requestPath("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/cart.clash/i);
  });
});
