// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  GLITCH_API_BASE,
  GLITCH_BUILD_TYPE,
  GLITCH_GAME_VERSION,
  GLITCH_TITLE_ID,
} from "../src/analytics/glitchConfig.js";

describe("glitchConfig", () => {
  it("locks title + playtest version constants", () => {
    expect(GLITCH_TITLE_ID).toBe("bf9f27c8-27be-4996-a3f0-cc4dc68ad2bb");
    expect(GLITCH_API_BASE).toBe("https://api.glitch.fun/api");
    expect(GLITCH_GAME_VERSION).toBe("0.8.6");
    expect(GLITCH_BUILD_TYPE).toBe("playtest");
  });
});
