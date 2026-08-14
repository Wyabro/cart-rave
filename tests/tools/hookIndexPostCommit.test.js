/**
 * HOOK-INDEX-1 — post-commit clears staged generated docs when index blob ≠ HEAD.
 * Temp-repo integration (not Claude Code hooks — those live in claudeHooks.test.js).
 */
import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findStaleGeneratedIndexPaths,
  clearStaleGeneratedIndex,
  GENERATED_DOC_PATHS,
} from "../../tools/git-hooks/clear-stale-generated-index.mjs";

const repos = [];

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "cart-clash-hook-index-"));
  repos.push(repo);
  const run = (...args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  run("init", "-q");
  run("config", "user.email", "t@t");
  run("config", "user.name", "t");
  // Match Windows-friendly core settings without depending on global git config.
  run("config", "core.autocrlf", "false");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "docs", "ARCHITECTURE.json"), '{"v":1,"old":true}\n');
  writeFileSync(join(repo, "docs", "BRIEFING.md"), "old briefing\n");
  writeFileSync(join(repo, "src.js"), "v1\n");
  run("add", "docs/ARCHITECTURE.json", "docs/BRIEFING.md", "src.js");
  run("commit", "-q", "-m", "init");
  return { repo, run };
}

afterEach(() => {
  while (repos.length) {
    const r = repos.pop();
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("HOOK-INDEX-1 clearStaleGeneratedIndex", () => {
  it("lists GENERATED_DOC_PATHS matching pre-commit", () => {
    expect(GENERATED_DOC_PATHS).toEqual(["docs/BRIEFING.md", "docs/ARCHITECTURE.json"]);
  });

  it("finds nothing when index matches HEAD", () => {
    const { repo } = makeRepo();
    expect(findStaleGeneratedIndexPaths({ cwd: repo })).toEqual([]);
    expect(clearStaleGeneratedIndex({ cwd: repo }).cleared).toEqual([]);
  });

  it("unstages when index blob ≠ HEAD blob (residue shape)", () => {
    const { repo, run } = makeRepo();

    // Commit new content on HEAD (what pathspec+pre-commit would land in the object).
    writeFileSync(join(repo, "docs", "ARCHITECTURE.json"), '{"v":2,"new":true}\n');
    writeFileSync(join(repo, "docs", "BRIEFING.md"), "new briefing\n");
    run("add", "docs/ARCHITECTURE.json", "docs/BRIEFING.md");
    run("commit", "-q", "-m", "regen on HEAD");

    // Simulate residue: stage *old* content into the real index without changing HEAD.
    // (Do not `checkout HEAD --` after add — that resets the index too.)
    writeFileSync(join(repo, "docs", "ARCHITECTURE.json"), '{"v":1,"old":true}\n');
    writeFileSync(join(repo, "docs", "BRIEFING.md"), "old briefing\n");
    run("add", "docs/ARCHITECTURE.json", "docs/BRIEFING.md");
    // Worktree back to HEAD; index stays old — the MM shape from the BACKLOG repro.
    run("restore", "--worktree", "--source=HEAD", "--", "docs/ARCHITECTURE.json", "docs/BRIEFING.md");

    const headArch = run("rev-parse", "HEAD:docs/ARCHITECTURE.json").trim();
    const indexArch = run("rev-parse", ":0:docs/ARCHITECTURE.json").trim();
    expect(indexArch).not.toBe(headArch);

    expect(findStaleGeneratedIndexPaths({ cwd: repo }).sort()).toEqual(
      ["docs/ARCHITECTURE.json", "docs/BRIEFING.md"].sort(),
    );

    const result = clearStaleGeneratedIndex({ cwd: repo });
    expect(result.error).toBeUndefined();
    expect(result.cleared.sort()).toEqual(["docs/ARCHITECTURE.json", "docs/BRIEFING.md"].sort());

    // After restore --staged, index matches HEAD.
    expect(run("rev-parse", ":0:docs/ARCHITECTURE.json").trim()).toBe(headArch);
    expect(run("rev-parse", ":0:docs/BRIEFING.md").trim()).toBe(
      run("rev-parse", "HEAD:docs/BRIEFING.md").trim(),
    );
    expect(findStaleGeneratedIndexPaths({ cwd: repo })).toEqual([]);
    // Cached diff for those paths is empty.
    expect(run("diff", "--cached", "--name-only", "--", ...GENERATED_DOC_PATHS).trim()).toBe("");
  });

  it("leaves a legitimate staged change alone when it matches a deliberate stage of new content", () => {
    // If index === HEAD there is nothing to clear — even if worktree differs.
    const { repo, run } = makeRepo();
    writeFileSync(join(repo, "docs", "ARCHITECTURE.json"), "worktree only\n");
    // Index still matches HEAD; predicate must not unstage (nothing staged differently).
    expect(findStaleGeneratedIndexPaths({ cwd: repo })).toEqual([]);
    expect(run("diff", "--cached", "--name-only").trim()).toBe("");
  });

  it("fail-open: returns error field instead of throwing when git is broken", () => {
    const result = clearStaleGeneratedIndex({
      cwd: join(tmpdir(), "no-such-repo-hook-index"),
      execFileSync: () => {
        throw new Error("boom");
      },
    });
    // findStale returns [] when rev-parse fails (null blobs); clear has no stale → no error
    // Force restore path to throw:
    const forced = clearStaleGeneratedIndex({
      cwd: process.cwd(),
      paths: ["docs/ARCHITECTURE.json"],
      execFileSync: (cmd, args) => {
        if (args?.[0] === "rev-parse") {
          // index and head different non-null → will attempt restore
          if (String(args[1]).startsWith(":0:")) return "aaa\n";
          if (String(args[1]).startsWith("HEAD:")) return "bbb\n";
        }
        if (args?.[0] === "restore") throw new Error("restore failed");
        throw new Error(`unexpected ${cmd} ${args}`);
      },
    });
    expect(forced.cleared).toEqual([]);
    expect(forced.error).toMatch(/restore failed/);
  });
});
