// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  GLITCH_API_BASE,
  GLITCH_BUILD_TYPE,
  GLITCH_GAME_VERSION,
  GLITCH_TITLE_ID,
} from "../../src/analytics/glitchConfig.js";

describe("glitchConfig", () => {
  it("locks title + playtest version constants", () => {
    expect(GLITCH_TITLE_ID).toBe("bf9f27c8-27be-4996-a3f0-cc4dc68ad2bb");
    expect(GLITCH_API_BASE).toBe("https://api.glitch.fun/api");
    expect(GLITCH_GAME_VERSION).toBe("0.8.6");
    expect(GLITCH_BUILD_TYPE).toBe("playtest");
  });

  it("leaves Aegis injection to Glitch for iframe HTML entry", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const matches = html.match(/https:\/\/api\.glitch\.fun\/js\/aegis-bridge\.js/g) || [];
    expect(matches).toHaveLength(0);
  });
});

describe("glitchPlatform runtime surface", () => {
  const src = readFileSync(new URL("../../src/analytics/glitchPlatform.js", import.meta.url), "utf8");

  it("never ships admin or deploy routes from the runtime client", () => {
    expect(src).not.toMatch(/\/tokens/);
    expect(src).not.toMatch(/\/retentions/);
    expect(src).not.toMatch(/\/analytics\/events-summary/);
    expect(src).not.toMatch(/createTitleToken|listTitleTokens|revokeTitleToken/);
    expect(src).not.toMatch(/GLITCH_DEPLOY_TOKEN|gl_deploy_/);
    expect(src).not.toMatch(/listInstalls|viewInstall/);
  });
});

describe("glitch-deploy token load", () => {
  const src = readFileSync(new URL("../../tools/glitch-deploy.mjs", import.meta.url), "utf8");

  it("reads GLITCH_DEPLOY_TOKEN from .env.local when the shell is empty", () => {
    expect(src).toMatch(/function loadDeployToken\(/);
    expect(src).toMatch(/process\.env\.GLITCH_DEPLOY_TOKEN/);
    expect(src).toMatch(/["']\.env\.local["']/);
    expect(src).toContain("GLITCH_DEPLOY_TOKEN");
    const load = src.slice(src.indexOf("function loadDeployToken"), src.indexOf("const token = loadDeployToken"));
    expect(load).not.toMatch(/VITE_GLITCH_TITLE_TOKEN/);
  });
});
