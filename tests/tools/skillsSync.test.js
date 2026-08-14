/**
 * skillsSync.test.js — the .agents/skills → .claude/skills mirror and its drift gate.
 *
 * The mirror exists because the two runtimes read different paths and only one is committed
 * (.gitignore:47). The gate exists because the failure is silent: an unsynced skill does not
 * error, it just never fires.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { hashDir, planSync, planPrune, planAll, RUNTIME_TARGETS } from "../../tools/skills-sync.mjs";
import { validateSkillsMirror, evaluateProjectHealth } from "../../tools/lib/projectHealthValidation.mjs";

const tmpRoots = [];

/** Build a throwaway skills tree: { "skillName/file.md": "body" }. Cleaned up in afterAll. */
function scratchSkills(files) {
  const root = mkdtempSync(join(tmpdir(), "skillsync-"));
  tmpRoots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body ?? "x\n");
  }
  return root;
}

afterAll(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
});

describe("hashDir", () => {
  it("is stable across identical trees and flips on a content change", () => {
    const a = scratchSkills({ "s/SKILL.md": "one\n", "s/refs/x.md": "two\n" });
    const b = scratchSkills({ "s/SKILL.md": "one\n", "s/refs/x.md": "two\n" });
    expect(hashDir(a)).toBe(hashDir(b));

    const c = scratchSkills({ "s/SKILL.md": "one\n", "s/refs/x.md": "CHANGED\n" });
    expect(hashDir(c)).not.toBe(hashDir(a));
  });

  it("flips when a file is added or renamed, not just edited", () => {
    const base = scratchSkills({ "s/SKILL.md": "one\n" });
    const extra = scratchSkills({ "s/SKILL.md": "one\n", "s/EXTRA.md": "one\n" });
    const renamed = scratchSkills({ "s/OTHER.md": "one\n" });
    expect(hashDir(extra)).not.toBe(hashDir(base));
    expect(hashDir(renamed)).not.toBe(hashDir(base));
  });
});

describe("planSync", () => {
  it("reports created / updated / unchanged per skill and never writes", () => {
    const src = scratchSkills({ "alpha/SKILL.md": "a\n", "beta/SKILL.md": "b\n", "gamma/SKILL.md": "g\n" });
    const dest = scratchSkills({ "alpha/SKILL.md": "a\n", "beta/SKILL.md": "STALE\n" });

    const plan = planSync(src, dest);
    const byName = Object.fromEntries(plan.map((s) => [s.name, s.status]));
    expect(byName).toEqual({ alpha: "unchanged", beta: "updated", gamma: "created" });

    // planSync is a pure read: re-running it yields the same answer, dest untouched.
    expect(planSync(src, dest)).toEqual(plan);
  });

  it("ignores loose files at the skills root — only directories are skills", () => {
    const src = scratchSkills({ "alpha/SKILL.md": "a\n", "README.md": "not a skill\n" });
    expect(planSync(src, scratchSkills({})).map((s) => s.name)).toEqual(["alpha"]);
  });
});

describe("planPrune", () => {
  it("names skills the destination still carries after they left the source", () => {
    const src = scratchSkills({ "alpha/SKILL.md": "a\n" });
    const dest = scratchSkills({ "alpha/SKILL.md": "a\n", "hallmark/SKILL.md": "deleted\n" });
    expect(planPrune(src, dest)).toEqual(["hallmark"]);
  });

  it("is empty when the mirror is clean, and when the destination does not exist", () => {
    const src = scratchSkills({ "alpha/SKILL.md": "a\n" });
    expect(planPrune(src, scratchSkills({ "alpha/SKILL.md": "a\n" }))).toEqual([]);
    expect(planPrune(src, join(tmpdir(), "skillsync-does-not-exist"))).toEqual([]);
  });
});

describe("prune safety — the rule that protects other installers' skills", () => {
  it("marks exactly one target as owned, and it is the repo mirror", () => {
    const owned = RUNTIME_TARGETS.filter((t) => t.owned);
    expect(owned).toHaveLength(1);
    expect(owned[0].id).toBe("claude");
  });

  it("never reports orphans for a shared user-level destination", () => {
    // ~/.cursor/skills holds skills this repo never placed; deleting them would be data loss.
    const src = scratchSkills({ "alpha/SKILL.md": "a\n" });
    for (const t of planAll(src)) {
      if (!t.owned) expect(t.orphans).toEqual([]);
    }
  });

  it("skips a runtime whose skills dir does not exist, and never invents one", () => {
    const src = scratchSkills({ "alpha/SKILL.md": "a\n" });
    for (const t of planAll(src)) {
      if (!t.present) expect(t.skills).toEqual([]);
      // owned target is always considered present — this tool creates it
      if (t.owned) expect(t.present).toBe(true);
    }
  });
});

describe("SKILLS_UNSYNCED drift gate", () => {
  it("names each drifted skill and whether it is missing or stale", () => {
    const findings = validateSkillsMirror([
      { name: "alpha", status: "unchanged" },
      { name: "beta", status: "updated" },
      { name: "gamma", status: "created" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("SKILLS_UNSYNCED");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("npm run skills:sync");
    expect(findings[0].message).toContain("beta (stale)");
    expect(findings[0].message).toContain("gamma (missing)");
    expect(findings[0].message).not.toContain("alpha");
  });

  it("is silent on a fully-synced mirror, and on an empty plan", () => {
    expect(validateSkillsMirror([{ name: "alpha", status: "unchanged" }])).toEqual([]);
    expect(validateSkillsMirror([])).toEqual([]);
  });
});

describe("evaluateProjectHealth threading", () => {
  const statusMd = "## Current focus\n\nx\n\n### Release phases\n\n- ▶ Playtesting & stabilization\n\n### Do not\n\n- x\n";
  const errors = (r) => r.findings.filter((f) => f.severity === "error").map((f) => f.code);

  it("red-gates when skillsPlan shows drift", () => {
    const r = evaluateProjectHealth({ statusMd, skillsPlan: [{ name: "beta", status: "created" }] });
    expect(errors(r)).toContain("SKILLS_UNSYNCED");
    expect(r.ok).toBe(false);
  });

  it("skips the gate entirely when skillsPlan is omitted (the CI path)", () => {
    const r = evaluateProjectHealth({ statusMd });
    expect(errors(r)).not.toContain("SKILLS_UNSYNCED");
  });
});
