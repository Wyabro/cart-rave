import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FACADE_IMPORT = /from\s+["'](?:\.\/|\.\.\/)+gameState\.js["']/;

function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkJs(path, acc);
    else if (entry.name.endsWith(".js")) acc.push(path);
  }
  return acc;
}

describe("STORE-1 import lock", () => {
  it("does not keep src/gameState.js", () => {
    expect(existsSync(join(ROOT, "src/gameState.js"))).toBe(false);
  });

  it("src/ does not import the deleted facade", () => {
    const hits = [];
    for (const file of walkJs(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      if (FACADE_IMPORT.test(text)) hits.push(file.slice(ROOT.length + 1));
    }
    expect(hits).toEqual([]);
  });

  it("ram/combo mocks target stores/gameStore.js", () => {
    const files = [
      "tests/effects/optimisticLocalHitFx.test.js",
      "tests/scoring/reconcileComboSideEffects.test.js",
      "tests/physics/reverseRamImpulse.test.js",
    ];
    for (const rel of files) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      expect(text).toContain('vi.mock("../../src/stores/gameStore.js"');
    }
  });
});
