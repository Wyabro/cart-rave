// @vitest-environment node
import { describe, it, expect } from "vitest";
import { publicUrl } from "../src/utils/publicUrl.js";

describe("publicUrl", () => {
  it("resolves nested Glitch-style build paths", () => {
    const base = "https://example.test/builds/abc/index.html";
    expect(publicUrl("models/cartrave4-draco.glb", base)).toBe(
      "https://example.test/builds/abc/models/cartrave4-draco.glb",
    );
    expect(publicUrl("/draco/gltf/", base)).toBe(
      "https://example.test/builds/abc/draco/gltf/",
    );
  });

  it("resolves at domain root the same way Cloudflare hosts", () => {
    const base = "https://cartclash.lol/";
    expect(publicUrl("/models/cartrave4-draco.glb", base)).toBe(
      "https://cartclash.lol/models/cartrave4-draco.glb",
    );
  });
});
