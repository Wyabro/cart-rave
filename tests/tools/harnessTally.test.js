// * Pins the rig verdict contract added 2026-07-20: checks may be `inconclusive` (starved
// * client loop — no evidence either way, NET-2 class) and must count separately from
// * failures everywhere — tally JSON, exit code — so a red battery means regression, not
// * environment noise. See tools/lib/harness.mjs resolveExitCode/writeTallySync and
// * docs/guides/netcode-harness.md (exit contract).
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cellId,
  dedupeCells,
  normalizeArgv,
  parseViewports,
  resolveExitCode,
  writeTallySync,
} from "../../tools/lib/harness.mjs";

const pass = (name = "p") => ({ name, pass: true });
const fail = (name = "f") => ({ name, pass: false });
const incon = (name = "i") => ({ name, pass: false, inconclusive: true });

describe("resolveExitCode", () => {
  it("all pass → 0", () => {
    expect(resolveExitCode([pass(), pass()])).toBe(0);
    expect(resolveExitCode([])).toBe(0);
  });
  it("a real failure → 1, even alongside inconclusives", () => {
    expect(resolveExitCode([pass(), fail()])).toBe(1);
    expect(resolveExitCode([incon(), fail(), pass()])).toBe(1);
  });
  it("a thrown scenario → 1 regardless of checks", () => {
    expect(resolveExitCode([pass()], true)).toBe(1);
    expect(resolveExitCode([incon()], true)).toBe(1);
  });
  it("inconclusive-only non-passes → 3 (starved environment, not red)", () => {
    expect(resolveExitCode([pass(), incon()])).toBe(3);
    expect(resolveExitCode([incon(), incon()])).toBe(3);
  });
});

// * The sweep-cell helpers moved out of tools/sheet.mjs into harness.mjs when tools/podium.mjs
// * arrived (FIGHT-VERIFY-1 Phase A.0), so both tools build ids and matrices the same way.
// * `outcome` is the podium's addition — the same {arena, viewport} runs twice (victory and
// * defeat), and without it in the id and the dedupe key the two runs collide on disk.
describe("normalizeArgv", () => {
  it("splits --flag=value into --flag value", () => {
    expect(normalizeArgv(["--viewports=1920x1080", "--all"])).toEqual(["--viewports", "1920x1080", "--all"]);
  });
  it("leaves the already-split spelling alone", () => {
    expect(normalizeArgv(["--arenas", "zanzibar"])).toEqual(["--arenas", "zanzibar"]);
  });
  it("keeps '=' inside the value (urls survive)", () => {
    expect(normalizeArgv(["--url=http://127.0.0.1:3000/?a=1"])).toEqual(["--url", "http://127.0.0.1:3000/?a=1"]);
  });
  it("passes bare tokens through untouched", () => {
    expect(normalizeArgv(["a=b", "--x"])).toEqual(["a=b", "--x"]);
  });
});

describe("parseViewports", () => {
  it("parses a comma list, tolerating whitespace", () => {
    expect(parseViewports("1920x1080, 390x844")).toEqual([
      { w: 1920, h: 1080 },
      { w: 390, h: 844 },
    ]);
  });
  it("throws on a malformed token rather than silently dropping it", () => {
    expect(() => parseViewports("1920x1080,390")).toThrow(/bad --viewports token "390"/);
  });
  it("ignores empty segments from a trailing comma", () => {
    expect(parseViewports("800x600,")).toEqual([{ w: 800, h: 600 }]);
  });
});

describe("dedupeCells", () => {
  it("keeps rm/touch twins but drops exact repeats", () => {
    const out = dedupeCells([
      { w: 390, h: 844 },
      { w: 390, h: 844 },
      { w: 390, h: 844, rm: true },
      { w: 390, h: 844, touch: true },
    ]);
    expect(out).toHaveLength(3);
  });
  it("treats outcomes as distinct cells", () => {
    const out = dedupeCells([
      { w: 1920, h: 1080, outcome: "victory" },
      { w: 1920, h: 1080, outcome: "defeat" },
      { w: 1920, h: 1080, outcome: "victory" },
    ]);
    expect(out.map((c) => c.outcome)).toEqual(["victory", "defeat"]);
  });
});

describe("cellId", () => {
  it("omits the outcome segment entirely when absent (HUD-sheet ids unchanged)", () => {
    expect(cellId("classicRecord", { w: 1920, h: 1080 })).toBe("classicRecord-1920x1080");
    expect(cellId("classicRecord", { w: 390, h: 844, rm: true, touch: true })).toBe(
      "classicRecord-390x844-rm-touch",
    );
  });
  it("keeps victory and defeat on separate filenames", () => {
    const v = cellId("classicRecord", { w: 390, h: 844, outcome: "victory" });
    const d = cellId("classicRecord", { w: 390, h: 844, outcome: "defeat" });
    expect(v).toBe("classicRecord-victory-390x844");
    expect(d).toBe("classicRecord-defeat-390x844");
    expect(v).not.toBe(d);
  });
});

describe("writeTallySync", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-tally-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("counts inconclusive separately — never inside failed", () => {
    const file = join(dir, "tally.json");
    writeTallySync(file, "netharness:test", [pass("a"), fail("b"), incon("c"), incon("d")], false);
    const t = JSON.parse(readFileSync(file, "utf8"));
    expect(t.rig).toBe("netharness:test");
    expect(t.passed).toBe(1);
    expect(t.failed).toBe(1);
    expect(t.inconclusive).toBe(2);
    expect(t.hadError).toBe(false);
    expect(t.checks).toHaveLength(4);
    expect(t.checks[2].inconclusive).toBe(true);
  });
  it("plain green tally keeps the legacy shape plus inconclusive: 0", () => {
    const file = join(dir, "tally-green.json");
    writeTallySync(file, "rig", [pass("a"), pass("b")]);
    const t = JSON.parse(readFileSync(file, "utf8"));
    expect(t.passed).toBe(2);
    expect(t.failed).toBe(0);
    expect(t.inconclusive).toBe(0);
  });
});
