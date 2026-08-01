// * Pins the two AGENTS.md enforcement hooks. Both are matcher-driven, and a matcher that
// * silently stops matching is worse than no guard at all — it reads as enforced while
// * enforcing nothing. These cases are the contract; the hooks' pure functions are exported
// * behind an isMain guard specifically so this file can drive them.
// * See .claude/hooks/guard-git-add.mjs, .claude/hooks/guard-stop-drift.mjs,
// * tools/verify-head.mjs, and AGENTS.md § Enforcement.
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { offends, walkGitSegments, evaluateGitCommand } from "../.claude/hooks/guard-git-add.mjs";
import { claimsCompletion, evaluateStop } from "../.claude/hooks/guard-stop-drift.mjs";
import { evaluateProtectedPath } from "../.claude/hooks/guard-protected-paths.mjs";
import { trackWrite } from "../.claude/hooks/track-session-writes.mjs";
import { readState, updateState } from "../.claude/hooks/lib/session-state.mjs";

const scratch = mkdtempSync(join(tmpdir(), "cart-clash-hooktest-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("guard-git-add: whole-worktree staging is denied", () => {
  it.each([
    "git add -A",
    "git add .",
    "git add ./",
    "git add --all",
    "git add :/",
    "git add :",
    "git add :(top)",
    "git add *",
    "git add -Av",
    "git add -vA",
    "git -C sub add -A",
    "git -c user.name=x add -A",
    "npm test && git add -A",
    "git status; git add .",
    "git add -- .",
  ])("denies %j", (cmd) => expect(offends(cmd)).toBe(true));

  // * `git commit -a` stages every tracked file without an explicit path — the same hazard
  // * as `git add -A`, and the gap the original guard shipped with.
  it.each([
    "git commit -a",
    'git commit -am "x"',
    'git commit -a -m "x"',
    'git commit -sam "x"',
    "git commit --all",
    'git commit --all -m "x"',
  ])("denies %j", (cmd) => expect(offends(cmd)).toBe(true));

  // * Bare -u/--update stages every tracked modification — the long-documented gap,
  // * closed. With a pathspec it stays legitimate.
  it.each(["git add -u", "git add --update", "git add -uv"])("denies %j", (cmd) =>
    expect(offends(cmd)).toBe(true)
  );
});

describe("guard-git-add: legitimate git work is untouched", () => {
  it.each([
    "git add docs/STATUS.md",
    "git add docs/STATUS.md AGENTS.md",
    "git add -p",
    "git add -u src/",
    "git add --patch",
    "git add addendum.txt",
    "git addendum",
    'git commit -m "x"',
    "git commit --amend --no-edit",
    "git commit --amend",
    "git log --all",
    "git log --grep add --all",
    "git status --short",
    "npm run qa",
  ])("allows %j", (cmd) => expect(offends(cmd)).toBe(false));

  // * After `--` every token is a pathspec, so this names a FILE called "-A".
  it("allows a path literally named -A", () => {
    expect(offends("git add -- -A")).toBe(false);
  });

  // * stripQuoted exists for exactly this: the rule text quotes the command it forbids.
  it("allows the forbidden string inside a commit message", () => {
    expect(offends('git commit -m "never git add -A again"')).toBe(false);
  });
});

describe("guard-stop-drift: completion claims", () => {
  it.each([
    "Done.",
    "**Done**",
    "Shipped.",
    "The change is now in HEAD.",
    "Verified in origin/cart-clash HEAD.",
    "All gates green: 412 tests.",
    "Ready to ship.",
    "I have pushed the fix and verified it against production.",
  ])("fires on %j", (msg) => expect(claimsCompletion(msg)).toBe(true));

  it.each([
    "Not done yet.",
    "Once done, I will push.",
    "Next step: verify in origin/cart-clash HEAD.",
    "TODO: complete the migration.",
    "I could not push — no network.",
    "Applied the change. Unpushed until it lands on origin/cart-clash.",
    "Reading the file now.",
  ])("stays silent on %j", (msg) => expect(claimsCompletion(msg)).toBe(false));

  // * A pasted log or diff routinely contains the word "done"; it is data, not a claim.
  it("ignores claim words inside fenced code", () => {
    expect(claimsCompletion("Here is the log:\n```\nfeat: done with retries\n```\nStill working.")).toBe(false);
  });
});

const clean = (over = {}) => ({
  branch: "cart-clash",
  upstream: "origin/cart-clash",
  ahead: 0,
  behind: 0,
  trackedDirty: [],
  remoteReachable: true,
  drifted: false,
  reasons: [],
  ...over,
});

const unpushed = (n = 2) =>
  clean({ ahead: n, drifted: true, reasons: [`${n} unpushed commit(s) on cart-clash`] });

/** evaluateStop with an injected drift result and an isolated counter dir. */
function run(message, drift, over = {}) {
  const calls = { n: 0 };
  const verdict = evaluateStop(
    { last_assistant_message: message, session_id: over.session ?? `s-${Math.random()}`, ...over.input },
    {
      env: over.env ?? {},
      counterDir: over.counterDir ?? scratch,
      checkHeadDrift: () => {
        calls.n++;
        return drift;
      },
    }
  );
  return { verdict, calls };
}

describe("guard-stop-drift: block only when a claim meets real drift", () => {
  it("blocks a claim while commits are unpushed, naming the count", () => {
    const { verdict } = run("Done. Verified in origin/cart-clash HEAD.", unpushed(2));
    expect(verdict?.decision).toBe("block");
    expect(verdict?.reason).toContain("2 unpushed commit(s)");
  });

  // * The honesty wording must not rescue a claim — that was a one-word bypass in an
  // * earlier draft ("Done. ... (unpushed)" would have passed with real drift).
  it("blocks even when the message also says 'unpushed'", () => {
    const { verdict } = run("Done. Verified in HEAD. (unpushed)", unpushed(1));
    expect(verdict?.decision).toBe("block");
  });

  it("allows a claim when the tree is genuinely in sync", () => {
    expect(run("Done. Verified in origin/cart-clash HEAD.", clean()).verdict).toBeNull();
  });

  // * Offline must never wedge a session: unknown ahead/behind + clean tracked files = pass.
  it("allows a claim when the remote is unreachable and nothing is dirty", () => {
    const offline = clean({ ahead: null, behind: null, remoteReachable: false });
    expect(run("Done.", offline).verdict).toBeNull();
  });

  // * STOP-DIRT-1: dirt only counts when THIS session touched the file. A dirty file
  // * another session is mid-edit on must not block this session's correct claim.
  it("blocks on a dirty file this session touched, naming it", () => {
    const session = "dirt-mine";
    updateState(scratch, session, () => ({ touched: ["src/main.js"] }));
    const dirty = clean({ trackedDirty: [" M src/main.js"], drifted: true });
    const { verdict } = run("Done.", dirty, { session });
    expect(verdict?.decision).toBe("block");
    expect(verdict?.reason).toContain("src/main.js");
  });

  it("stays silent on a dirty file this session did NOT touch", () => {
    const session = "dirt-theirs";
    updateState(scratch, session, () => ({ touched: ["docs/status.md"] }));
    const dirty = clean({ trackedDirty: [" M docs/planning/BACKLOG.md"], drifted: true });
    expect(run("Done.", dirty, { session }).verdict).toBeNull();
  });

  it("stays silent on dirt when the session has no state file at all", () => {
    const dirty = clean({ trackedDirty: [" M src/main.js"], drifted: true });
    expect(run("Done.", dirty).verdict).toBeNull();
  });

  // * The pre-commit hook owns the generated docs — their dirt is never a blocking fact.
  it("ignores generated docs even when this session touched them", () => {
    const session = "dirt-generated";
    updateState(scratch, session, () => ({ touched: ["docs/briefing.md", "docs/architecture.json"] }));
    const dirty = clean({
      trackedDirty: [" M docs/BRIEFING.md", " M docs/ARCHITECTURE.json"],
      drifted: true,
    });
    expect(run("Done.", dirty, { session }).verdict).toBeNull();
  });

  it("takes the post-arrow path on rename porcelain lines", () => {
    const session = "dirt-rename";
    updateState(scratch, session, () => ({ touched: ["src/new.js"] }));
    const dirty = clean({ trackedDirty: ["R  src/old.js -> src/new.js"], drifted: true });
    expect(run("Done.", dirty, { session }).verdict?.decision).toBe("block");
  });

  // * git quotes paths with special characters; those are unparseable here and must fail
  // * CLOSED (count as relevant) rather than silently pass — but only once a session
  // * record exists.
  it("blocks conservatively on a quoted porcelain path when a record exists", () => {
    const session = "dirt-quoted";
    updateState(scratch, session, () => ({ touched: ["src/other.js"] }));
    const dirty = clean({ trackedDirty: [' M "src/wei\\303\\237.js"'], drifted: true });
    expect(run("Done.", dirty, { session }).verdict?.decision).toBe("block");
  });

  // * `git add` staging counts the same as a Write — a session that only staged a file
  // * (e.g. after a Bash edit) still owns its dirt.
  it("counts staged paths from the session record as session-owned", () => {
    const session = "dirt-staged";
    updateState(scratch, session, () => ({ staged: ["party/index.ts"] }));
    const dirty = clean({ trackedDirty: [" M party/index.ts"], drifted: true });
    expect(run("Done.", dirty, { session }).verdict?.decision).toBe("block");
  });

  it("still blocks unpushed commits even with an empty session record", () => {
    const session = "ahead-empty-record";
    updateState(scratch, session, () => ({}));
    expect(run("Done.", unpushed(1), { session }).verdict?.decision).toBe("block");
  });
});

describe("guard-git-add: segment walker", () => {
  it("extracts add pathspecs across flags and --", () => {
    const [seg] = walkGitSegments("git add -v docs/STATUS.md -- -A src/x.js");
    expect(seg.kind).toBe("add");
    expect(seg.paths).toEqual(["docs/STATUS.md", "-A", "src/x.js"]);
  });

  it.each([
    ['git commit -m "x"', true],
    ["git commit --amend --no-edit", true],
    ['git commit --message "x"', true],
    ['git commit -m "x" -- docs/a.md', false],
    ['git commit -m "x" docs/a.md', false],
  ])("%j pathless=%s", (cmd, pathless) => {
    const [seg] = walkGitSegments(cmd);
    expect(seg.kind).toBe("commit");
    expect(seg.isPathless).toBe(pathless);
  });

  it("walks add and commit in one command line", () => {
    const segs = walkGitSegments('git add a.js b.js && git commit -m "x" && git push');
    expect(segs.map((s) => s.kind)).toEqual(["add", "commit"]);
    expect(segs[0].paths).toEqual(["a.js", "b.js"]);
    expect(segs[1].isPathless).toBe(true);
  });
});

describe("guard-git-add: GIT-INDEX-1 commit-scope check", () => {
  const root = process.cwd();
  const evalCmd = (command, { session, staged, env = {} } = {}) =>
    evaluateGitCommand(
      { session_id: session ?? `gi-${Math.random()}`, cwd: root, tool_input: { command } },
      { env, stateDir: scratch, listStaged: () => staged ?? null }
    );

  it("denies a pathspec-less commit when the index holds a foreign path, naming it", () => {
    const session = "gi-foreign";
    updateState(scratch, session, () => ({ staged: ["src/mine.js"] }));
    const r = evalCmd('git commit -m "x"', { session, staged: ["src/mine.js", "src/theirs.js"] });
    expect(r).toContain("GIT-INDEX-1");
    expect(r).toContain("src/theirs.js");
    expect(r).not.toContain("src/mine.js,");
  });

  it("allows when everything staged is session-owned (staged, touched, or generated docs)", () => {
    const session = "gi-owned";
    updateState(scratch, session, () => ({ staged: ["src/a.js"], touched: ["src/b.js"] }));
    const r = evalCmd('git commit -m "x"', {
      session,
      staged: ["src/a.js", "src/B.js", "docs/BRIEFING.md", "docs/ARCHITECTURE.json"],
    });
    expect(r).toBeNull();
  });

  it("unions same-command `git add X && git commit` pathspecs into ownership", () => {
    const session = "gi-samecmd";
    updateState(scratch, session, () => ({ staged: [] }));
    const r = evalCmd('git add src/new.js && git commit -m "x"', {
      session,
      staged: ["src/new.js"],
    });
    expect(r).toBeNull();
  });

  it("allows when the session has no state file (fail open)", () => {
    expect(evalCmd('git commit -m "x"', { staged: ["src/theirs.js"] })).toBeNull();
  });

  it("allows when git itself fails to list the index (fail open)", () => {
    const session = "gi-gitfail";
    updateState(scratch, session, () => ({ staged: ["src/a.js"] }));
    expect(evalCmd('git commit -m "x"', { session, staged: null })).toBeNull();
  });

  it("skips the scope check for pathspec commits", () => {
    const session = "gi-pathspec";
    updateState(scratch, session, () => ({ staged: ["src/a.js"] }));
    expect(
      evalCmd('git commit -m "x" -- src/a.js', { session, staged: ["src/theirs.js"] })
    ).toBeNull();
  });

  it("records allowed add pathspecs into session state", () => {
    const session = "gi-record";
    expect(evalCmd("git add docs/STATUS.md src/x.js", { session })).toBeNull();
    expect(readState(scratch, session).staged).toEqual(["docs/status.md", "src/x.js"]);
  });

  it("still denies bulk staging through the full evaluator", () => {
    expect(evalCmd("git add -A")).toContain("whole-worktree");
    expect(evalCmd("git add -u")).toContain("whole-worktree");
  });

  it.each(["CART_CLASH_SKIP_HOOKS", "SKIP_GIT_GUARD"])("%s bypasses the evaluator", (key) => {
    const session = "gi-skip";
    updateState(scratch, session, () => ({ staged: ["src/a.js"] }));
    expect(
      evalCmd('git commit -m "x"', { session, staged: ["src/theirs.js"], env: { [key]: "1" } })
    ).toBeNull();
  });
});

describe("track-session-writes: session write recording", () => {
  const root = process.cwd();

  it("records a normalized repo-relative path and dedupes", () => {
    const session = "tw-basic";
    const input = { session_id: session, cwd: root, tool_input: { file_path: "src\\Main.js" } };
    trackWrite(input, { stateDir: scratch, env: {} });
    trackWrite(input, { stateDir: scratch, env: {} });
    expect(readState(scratch, session).touched).toEqual(["src/main.js"]);
  });

  it("records notebook_path too", () => {
    const session = "tw-notebook";
    trackWrite(
      { session_id: session, cwd: root, tool_input: { notebook_path: "docs/x.ipynb" } },
      { stateDir: scratch, env: {} }
    );
    expect(readState(scratch, session).touched).toEqual(["docs/x.ipynb"]);
  });

  it("ignores paths outside the repo root and malformed input", () => {
    const session = "tw-outside";
    trackWrite(
      { session_id: session, cwd: root, tool_input: { file_path: join(tmpdir(), "x.js") } },
      { stateDir: scratch, env: {} }
    );
    trackWrite({ session_id: session, cwd: root, tool_input: {} }, { stateDir: scratch, env: {} });
    expect(readState(scratch, session).existed).toBe(false);
  });

  it("CART_CLASH_SKIP_HOOKS bypasses recording", () => {
    const session = "tw-skip";
    trackWrite(
      { session_id: session, cwd: root, tool_input: { file_path: "src/a.js" } },
      { stateDir: scratch, env: { CART_CLASH_SKIP_HOOKS: "1" } }
    );
    expect(readState(scratch, session).existed).toBe(false);
  });

  it("coexists with the block counter in one state file", () => {
    const session = "tw-coexist";
    trackWrite(
      { session_id: session, cwd: root, tool_input: { file_path: "src/a.js" } },
      { stateDir: scratch, env: {} }
    );
    updateState(scratch, session, (s) => ({ blocks: s.blocks + 1, lastKey: "k" }));
    const state = readState(scratch, session);
    expect(state.touched).toEqual(["src/a.js"]);
    expect(state.blocks).toBe(1);
    expect(state.lastKey).toBe("k");
  });
});

describe("guard-stop-drift: cheap exits touch no git", () => {
  it("no claim → no verdict and no drift check", () => {
    const { verdict, calls } = run("Reading the file now.", unpushed(2));
    expect(verdict).toBeNull();
    expect(calls.n).toBe(0);
  });

  // * POLARITY: true means "already continuing because of a prior block" — return null.
  // * Inverting this disables the guard on every normal turn. See the hook header.
  it("stop_hook_active true → no verdict and no drift check", () => {
    const { verdict, calls } = run("Done.", unpushed(2), { input: { stop_hook_active: true } });
    expect(verdict).toBeNull();
    expect(calls.n).toBe(0);
  });

  it("stop_hook_active false → guard runs normally", () => {
    const { verdict, calls } = run("Done.", unpushed(2), { input: { stop_hook_active: false } });
    expect(verdict?.decision).toBe("block");
    expect(calls.n).toBe(1);
  });

  it.each(["CART_CLASH_SKIP_HOOKS", "SKIP_STOP_GUARD"])("%s bypasses the guard", (key) => {
    const { verdict, calls } = run("Done.", unpushed(2), { env: { [key]: "1" } });
    expect(verdict).toBeNull();
    expect(calls.n).toBe(0);
  });
});

describe("guard-stop-drift: session counter", () => {
  // * Same drift state twice is the same information — re-flagging it is nagging, not
  // * enforcement. (The plan's draft expected block/block/null here; the digest rule is
  // * stricter and correct, so unchanged state goes quiet after the first block.)
  it("does not re-block an unchanged drift state", () => {
    const session = "same-state";
    expect(run("Done.", unpushed(2), { session }).verdict?.decision).toBe("block");
    expect(run("Done.", unpushed(2), { session }).verdict).toBeNull();
    expect(run("Done.", unpushed(2), { session }).verdict).toBeNull();
  });

  it("blocks at most twice per session even as drift changes", () => {
    const session = "changing-state";
    expect(run("Done.", unpushed(1), { session }).verdict?.decision).toBe("block");
    expect(run("Done.", unpushed(2), { session }).verdict?.decision).toBe("block");
    expect(run("Done.", unpushed(3), { session }).verdict).toBeNull();
  });

  it("keeps separate budgets per session", () => {
    expect(run("Done.", unpushed(1), { session: "a" }).verdict?.decision).toBe("block");
    expect(run("Done.", unpushed(1), { session: "b" }).verdict?.decision).toBe("block");
  });

  // * Session ids are not guaranteed filename-safe and Windows rejects <>:"/\|?* outright.
  it("survives a session id full of Windows-illegal characters", () => {
    const session = 'a/b\\c:d*e?f"g<h>i|j';
    expect(run("Done.", unpushed(1), { session }).verdict?.decision).toBe("block");
    expect(run("Done.", unpushed(1), { session }).verdict).toBeNull();
  });
});

describe("guard-protected-paths: generated + archived files are deny, everything else passes", () => {
  const root = process.cwd();
  const evalPath = (file_path, env = {}) =>
    evaluateProtectedPath({ tool_input: { file_path }, cwd: root }, env);

  it.each([
    "docs/BRIEFING.md",
    "docs/briefing.md",
    "docs\\BRIEFING.md",
    "docs/ARCHITECTURE.json",
    "docs/archive/handovers/handoff-2026-07.md",
    "docs/archive/audits/production-readiness-audit-2026-07.md",
  ])("denies %j", (p) => expect(evalPath(p)).toBeTruthy());

  it("denies via an absolute path too", () => {
    expect(evalPath(join(root, "docs", "BRIEFING.md"))).toBeTruthy();
  });

  it("denies notebook_path the same as file_path", () => {
    const r = evaluateProtectedPath(
      { tool_input: { notebook_path: "docs/ARCHITECTURE.json" }, cwd: root },
      {}
    );
    expect(r).toBeTruthy();
  });

  it.each([
    "docs/STATUS.md",
    "docs/planning/BACKLOG.md",
    "docs/archive/README.md",
    "src/main.js",
    "briefing.md",
  ])("allows %j", (p) => expect(evalPath(p)).toBeNull());

  it("allows paths outside the project tree", () => {
    expect(evalPath(join(tmpdir(), "docs", "BRIEFING.md"))).toBeNull();
  });

  it.each(["CART_CLASH_SKIP_HOOKS", "SKIP_PATH_GUARD"])("%s bypasses the guard", (key) => {
    expect(evalPath("docs/BRIEFING.md", { [key]: "1" })).toBeNull();
  });

  it("stays silent on malformed input", () => {
    expect(evaluateProtectedPath({}, {})).toBeNull();
    expect(evaluateProtectedPath({ tool_input: {} }, {})).toBeNull();
  });
});
