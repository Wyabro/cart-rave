// * Pins the rig verdict contract added 2026-07-20: checks may be `inconclusive` (starved
// * client loop — no evidence either way, NET-2 class) and must count separately from
// * failures everywhere — tally JSON, exit code — so a red battery means regression, not
// * environment noise. See tools/lib/harness.mjs resolveExitCode/writeTallySync and
// * docs/guides/netcode-harness.md (exit contract).
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveExitCode, writeTallySync } from "../tools/lib/harness.mjs";

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
