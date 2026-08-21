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

  it("loads the Aegis Store bridge once from the canonical URL", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const matches = html.match(/https:\/\/api\.glitch\.fun\/js\/aegis-bridge\.js/g) || [];
    expect(matches).toHaveLength(1);
    expect(html).toContain('src="https://api.glitch.fun/js/aegis-bridge.js"');
  });
});
