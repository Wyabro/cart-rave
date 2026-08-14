// * Pins the two AGENTS.md enforcement hooks. Both are matcher-driven, and a matcher that
// * silently stops matching is worse than no guard at all — it reads as enforced while
// * enforcing nothing. These cases are the contract; the hooks' pure functions are exported
// * behind an isMain guard specifically so this file can drive them.
// * See .claude/hooks/guard-git-add.mjs, .claude/hooks/guard-stop-drift.mjs,
// * tools/verify-head.mjs, and AGENTS.md § Enforcement.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { offends, walkGitSegments, evaluateGitCommand } from "../../.claude/hooks/guard-git-add.mjs";
import { claimsCompletion, evaluateStop } from "../../.claude/hooks/guard-stop-drift.mjs";
import { evaluateProtectedPath } from "../../.claude/hooks/guard-protected-paths.mjs";
import { trackWrite } from "../../.claude/hooks/track-session-writes.mjs";
import {
  hashContent,
  normalizeRepoPath,
  readState,
  updateState,
} from "../../.claude/hooks/lib/session-state.mjs";

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
    // * HOOK-WHOLETREE-1: `.\` is how you stage the tree in PowerShell, which is this
    // * repo's own shell, and git accepts it — verified staging every file in a throwaway
    // * repo. An exact-string table was holed on the dev platform, the mirror image of the
    // * POSIX hole f11e014 closed. These need no root: they canonicalize to `.`.
    "git add .\\",
    "git add .\\\\",
    "git add -- .\\",
    "git add -u .\\",
    // * HOOK-WHOLETREE-2: quoting a whole-tree pathspec used to delete it. stripQuoted
    // * collapsed `"."` to `""` BEFORE the matcher ran, so the token it judged was a pair of
    // * quotes, in no table. maskQuoted preserves offsets so the real token survives.
    'git add "."',
    "git add '.'",
    'git add "./"',
    'git add ".\\\\"',
    'git add -- "."',
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
    // * The over-match guard for HOOK-WHOLETREE-1: canonicalizing separators must not turn
    // * an ordinary Windows-shaped path into a whole-tree pathspec.
    "git add docs\\STATUS.md",
    // * HOOK-WHOLETREE-2 over-match guards: an ordinary quoted path is still ordinary, and a
    // * quoted value must not be scanned as if it were command text.
    'git add "docs/STATUS.md"',
    "git add 'docs/STATUS.md'",
    'git add "my file.js"',
    // * The `;` is inside the message, so it must not split a new segment into existence.
    'git commit -m "x; git add -A"',
    // * Escaped quotes inside a message must not close it early — drop that handling and the
    // * tail of this line scans as a real command.
    'git commit -m "say \\"git add -A\\""',
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

  // * maskQuoted exists for exactly this: the rule text quotes the command it forbids.
  it("allows the forbidden string inside a commit message", () => {
    expect(offends('git commit -m "never git add -A again"')).toBe(false);
  });
});

// * HOOK-WHOLETREE-2. The quoting model is the whole card: the old stripQuoted DELETED a
// * quoted token before the matcher judged it, which lost a real pathspec in both directions
// * at once — a whole-tree stage read as harmless, and a legitimate path read as unowned.
describe("guard-git-add: quoting is masked, not deleted", () => {
  it("recovers the real pathspec from a quoted token", () => {
    // * Pre-fix this was ['""'] — the literal two-quote string, recorded into session state
    // * as the path this session staged, so the file it actually staged read as foreign on
    // * the next pathspec-less commit. A fail-CLOSED false positive nobody had traced.
    expect(walkGitSegments('git add "docs/STATUS.md"')[0].paths).toEqual(["docs/STATUS.md"]);
    expect(walkGitSegments("git add 'src/a.js' src/b.js")[0].paths).toEqual([
      "src/a.js",
      "src/b.js",
    ]);
  });

  it("keeps a quoted value with spaces as ONE token", () => {
    expect(walkGitSegments('git add "my file.js"')[0].paths).toEqual(["my file.js"]);
  });

  it("still treats a quoted message as a message, not as a pathspec", () => {
    const [seg] = walkGitSegments('git commit -m "docs/a.md"');
    expect(seg.isPathless).toBe(true);
  });

  // * The safety direction of the fallback. Unbalanced quotes desync any pairing scheme, so
  // * maskQuoted returns the RAW text and the literal scan still sees everything. A mask that
  // * swallowed a real bulk stage would be a silent hole — strictly worse than a denial that
  // * names an escape hatch.
  it("does not let an unbalanced quote hide a real bulk stage", () => {
    expect(offends("echo 'it is fine ; git add -A")).toBe(true);
    expect(offends('echo "unclosed && git add -A')).toBe(true);
  });
});

// * HOOK-WHOLETREE-1, second case: an absolute pathspec naming the repo root stages the whole
// * tree exactly like `git add .`, and no literal in WHOLE_TREE can express it — the string is
// * machine-specific. It is also the only rule here that needs a root, so it is driven for
// * BOTH path flavours from one machine; that is the lesson f11e014 paid for.
describe.each([
  ["win32", path.win32, "C:\\repo"],
  ["posix", path.posix, "/repo"],
])("guard-git-add: absolute whole-tree pathspecs — %s flavour", (_name, p, root) => {
  const off = (cmd) => offends(cmd, { root, p });

  it.each([
    `git add ${root}`,
    `git add ${root}${p.sep}`,
    `git add ${root}${p.sep}src${p.sep}..`,
    // * Dotted relatives resolve to the root too — free with this rule, no new mechanism.
    "git add ././",
    "git add ./.",
    "git add src/..",
    // * HOOK-WHOLETREE-2 crossed with this rule: quoting the absolute form hid it twice over.
    `git add "${root}"`,
    `git add '${root}'`,
  ])("denies %j", (cmd) => expect(off(cmd)).toBe(true));

  it.each([
    `git add ${p.join(root, "src", "main.js")}`,
    "git add src/main.js",
    "git add src/../src/main.js",
  ])("allows %j", (cmd) => expect(off(cmd)).toBe(false));

  // * Outside the tree is NOT whole-tree — and normalizeRepoPath maps it to the same null it
  // * maps the root to, which is exactly why this rule resolves by hand instead of calling it.
  it("allows an absolute pathspec outside the tree", () => {
    expect(off(`git add ${p.resolve(root, "..", "elsewhere")}`)).toBe(false);
  });

  // * Inert without a root, so every command-only `offends(cmd)` row above keeps its
  // * pre-HOOK-WHOLETREE-1 meaning and this fix cannot widen them by accident.
  it("stays inert when no root is threaded", () => {
    expect(offends(`git add ${root}`)).toBe(false);
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
      // * Real case for the generated docs on purpose: git reports the index's own case, and
      // * GENERATED_DOCS is authored lowercase, so this row is what pins the foldKey() at the
      // * membership site. Drop that fold and EVERY pathspec-less commit in this repo denies,
      // * because the pre-commit hook stages exactly these two files.
      staged: ["src/a.js", "docs/BRIEFING.md", "docs/ARCHITECTURE.json"],
    });
    expect(r).toBeNull();
  });

  // * HOOK-CASE-1. This case used to live in the test above, asserting that a staged
  // * `src/B.js` was owned by a session that had only touched `src/b.js` — i.e. it asserted
  // * the defect. On a case-sensitive filesystem those are two different files, so that is
  // * one session claiming another's staged work, which is the exact leak GIT-INDEX-1 exists
  // * to stop. If this goes red, the fix is NOT to restore .toLowerCase() in guard-git-add.
  it("treats a case-variant staged path as foreign, not as session-owned", () => {
    const session = "gi-case";
    updateState(scratch, session, () => ({ staged: [], touched: ["src/b.js"] }));
    const r = evalCmd('git commit -m "x"', { session, staged: ["src/b.js", "src/B.js"] });
    expect(r).toContain("src/B.js");
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

  // * HOOK-WHOLETREE-2's fail-CLOSED half, end to end. Pre-fix the quoted add recorded the
  // * path `""`, so the file it genuinely staged was not in `owned` and this denied its own
  // * work as foreign — a guard blocking correct work, which is the shape that teaches
  // * SKIP_GIT_GUARD=1 as reflex and quietly retires the guard.
  it("owns a QUOTED add pathspec, so a quoted stage does not read as foreign", () => {
    const session = "gi-quoted";
    updateState(scratch, session, () => ({ staged: [] }));
    const r = evalCmd('git add "docs/STATUS.md" && git commit -m "x"', {
      session,
      staged: ["docs/STATUS.md"],
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
    // * Case preserved — this key has to survive a round trip to `git show :0:<path>`.
    expect(readState(scratch, session).staged).toEqual(["docs/STATUS.md", "src/x.js"]);
  });

  it("still denies bulk staging through the full evaluator", () => {
    expect(evalCmd("git add -A")).toContain("whole-worktree");
    expect(evalCmd("git add -u")).toContain("whole-worktree");
  });

  // * HOOK-WHOLETREE-1 through the PRODUCTION path. evaluateGitCommand is the only caller
  // * that threads the repo root into the matcher, so the absolute-root rule can only be
  // * proven live here — and it proves the ordering too: resolve `root` after the offense
  // * short-circuit (where it used to sit) and this goes red while the unit rows stay green.
  it("denies whole-tree pathspecs the literal table cannot express", () => {
    expect(evalCmd(`git add ${root}`)).toContain("whole-worktree");
    expect(evalCmd("git add .\\")).toContain("whole-worktree");
  });

  it.each(["CART_CLASH_SKIP_HOOKS", "SKIP_GIT_GUARD"])("%s bypasses the evaluator", (key) => {
    const session = "gi-skip";
    updateState(scratch, session, () => ({ staged: ["src/a.js"] }));
    expect(
      evalCmd('git commit -m "x"', { session, staged: ["src/theirs.js"], env: { [key]: "1" } })
    ).toBeNull();
  });
});

describe("guard-git-add: GIT-INDEX-2 content-drift checks", () => {
  const root = process.cwd();
  const MINE = "i am what this session wrote\n";
  const THEIRS = "i am what this session wrote\nplus a concurrent session's hunk\n";

  /** A session that wrote `rel` with MINE's content. */
  const seed = (session, rel = "src/netcode.js", extra = {}) =>
    updateState(scratch, session, () => ({ writes: { [rel]: hashContent(MINE) }, ...extra }));

  // `undefined` for worktree/blob means "reads back exactly what the session wrote".
  const evalCmd = (command, { session, staged, worktree, blob, env = {} } = {}) =>
    evaluateGitCommand(
      { session_id: session ?? `g2-${Math.random()}`, cwd: root, tool_input: { command } },
      {
        env,
        stateDir: scratch,
        listStaged: () => staged ?? null,
        readWorktree: () => (worktree === undefined ? MINE : worktree),
        readStaged: () => (blob === undefined ? MINE : blob),
      }
    );

  it("Check A denies `git add` when the worktree drifted from the recorded write", () => {
    const session = "g2-add-drift";
    seed(session);
    const r = evalCmd("git add src/netcode.js", { session, worktree: THEIRS });
    expect(r).toContain("GIT-INDEX-2");
    expect(r).toContain("src/netcode.js");
    // add-flavoured remedy: the index is empty here, so --cached would misdirect
    expect(r).toContain("git diff -- <file>");
    expect(r).not.toContain("--cached");
  });

  it("Check A denies the same-command `git add X && git commit` one-liner", () => {
    const session = "g2-onecmd";
    seed(session);
    // staged: [] because at PreToolUse the add has not run yet — precisely why Check B
    // cannot see this case and Check A must.
    const r = evalCmd('git add src/netcode.js && git commit -m "x"', {
      session,
      worktree: THEIRS,
      staged: [],
    });
    expect(r).toContain("GIT-INDEX-2");
    expect(r).toContain("src/netcode.js");
  });

  it("does not record a denied add as session-owned", () => {
    const session = "g2-norecord";
    seed(session);
    expect(evalCmd("git add src/netcode.js", { session, worktree: THEIRS })).toContain(
      "GIT-INDEX-2"
    );
    expect(readState(scratch, session).staged).toEqual([]);
  });

  it("Check B denies a pathspec-less commit when the staged blob drifted", () => {
    const session = "g2-blob-drift";
    seed(session, "src/netcode.js", { touched: ["src/netcode.js"] });
    const r = evalCmd('git commit -m "x"', {
      session,
      staged: ["src/netcode.js"],
      blob: THEIRS,
    });
    expect(r).toContain("GIT-INDEX-2");
    expect(r).toContain("git diff --cached");
  });

  it("Check B ALLOWS a clean index whose worktree has since drifted", () => {
    const session = "g2-clean-index";
    seed(session, "src/netcode.js", { touched: ["src/netcode.js"] });
    // The commit ships the staged bytes, which are this session's. Denying here would mean
    // Check B is reading the worktree instead of the index.
    expect(
      evalCmd('git commit -m "x"', {
        session,
        staged: ["src/netcode.js"],
        blob: MINE,
        worktree: THEIRS,
      })
    ).toBeNull();
  });

  it("allows when the hashes match, on both checks", () => {
    const session = "g2-match";
    seed(session, "src/netcode.js", { touched: ["src/netcode.js"] });
    expect(evalCmd("git add src/netcode.js", { session })).toBeNull();
    expect(evalCmd('git commit -m "x"', { session, staged: ["src/netcode.js"] })).toBeNull();
  });

  it("ignores a drifted path this session never wrote (GIT-INDEX-1's domain)", () => {
    const session = "g2-unwritten";
    updateState(scratch, session, () => ({ touched: ["src/other.js"], writes: {} }));
    expect(evalCmd("git add src/other.js", { session, worktree: THEIRS })).toBeNull();
  });

  it("ignores drifted generated docs", () => {
    const session = "g2-generated";
    updateState(scratch, session, () => ({
      writes: { "docs/architecture.json": hashContent(MINE) },
      touched: ["docs/architecture.json"],
    }));
    expect(
      evalCmd("git add docs/ARCHITECTURE.json", { session, worktree: THEIRS })
    ).toBeNull();
  });

  it("allows when the worktree read fails (fail open)", () => {
    const session = "g2-failopen-worktree";
    seed(session);
    expect(evalCmd("git add src/netcode.js", { session, worktree: null })).toBeNull();
  });

  it("allows when the staged-blob read fails (fail open)", () => {
    const session = "g2-failopen-blob";
    seed(session, "src/netcode.js", { touched: ["src/netcode.js"] });
    expect(
      evalCmd('git commit -m "x"', { session, staged: ["src/netcode.js"], blob: null })
    ).toBeNull();
  });

  it("allows when the session record predates `writes` (back-compat)", () => {
    const session = "g2-backcompat";
    updateState(scratch, session, () => ({
      staged: ["src/netcode.js"],
      touched: ["src/netcode.js"],
    }));
    expect(
      evalCmd('git commit -m "x"', { session, staged: ["src/netcode.js"], blob: THEIRS })
    ).toBeNull();
  });

  // The live replay cannot cover this: the hook reads its own process env and deliberately
  // never parses the command string, so a `VAR=1 git add …` prefix does NOT bypass it.
  it.each(["CART_CLASH_SKIP_HOOKS", "SKIP_GIT_GUARD"])("%s bypasses both content checks", (key) => {
    const session = `g2-skip-${key}`;
    seed(session, "src/netcode.js", { touched: ["src/netcode.js"] });
    const env = { [key]: "1" };
    expect(evalCmd("git add src/netcode.js", { session, worktree: THEIRS, env })).toBeNull();
    expect(
      evalCmd('git commit -m "x"', { session, staged: ["src/netcode.js"], blob: THEIRS, env })
    ).toBeNull();
  });

  it("degrades a corrupt `writes: []` to {} rather than throwing", () => {
    const session = "g2-corrupt";
    updateState(scratch, session, () => ({ writes: [], touched: ["src/netcode.js"] }));
    expect(readState(scratch, session).writes).toEqual({});
    expect(evalCmd("git add src/netcode.js", { session, worktree: THEIRS })).toBeNull();
  });

  // * HOOK-CASE-1: the coverage gap that let the case bug ship green. EVERY case above
  // * injects readWorktree/readStaged, so none of them exercises the real readers — and the
  // * real staged reader is `git show :0:<path>`, whose index lookup is case-SENSITIVE even
  // * when core.ignorecase is true. Under the old lowercasing normalizer that call matched
  // * nothing for any path with a capital letter, driftedAgainstWrites skipped on null, and
  // * Check B was silently dead for 37% of this tree. This drives a REAL git repo with a real
  // * uppercase path and no injection at all.
  it("Check B reads a real staged blob at an uppercase path (no injected readers)", () => {
    const repo = mkdtempSync(join(tmpdir(), "cart-clash-realgit-"));
    const run = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    try {
      run("init", "-q");
      run("config", "user.email", "t@t");
      run("config", "user.name", "t");
      mkdirSync(join(repo, "Src"), { recursive: true });
      writeFileSync(join(repo, "Src", "Netcode.js"), "MINE\n");
      run("add", "Src/Netcode.js");

      // Sanity: the case-preserved path resolves in the index and the folded one does not.
      expect(execFileSync("git", ["show", ":0:Src/Netcode.js"], { cwd: repo }).toString()).toBe("MINE\n");
      expect(() => execFileSync("git", ["show", ":0:src/netcode.js"], { cwd: repo, stdio: "pipe" })).toThrow();

      const session = "g2-realgit";
      // Session recorded a DIFFERENT hash than what is staged → Check B must fire.
      updateState(scratch, session, () => ({
        touched: ["Src/Netcode.js"],
        writes: { "Src/Netcode.js": hashContent("SOMETHING ELSE\n") },
      }));

      const verdict = evaluateGitCommand(
        { session_id: session, cwd: repo, tool_input: { command: 'git commit -m "x"' } },
        { env: {}, stateDir: scratch, listStaged: () => ["Src/Netcode.js"] },
      );
      expect(verdict).toContain("GIT-INDEX-2");
      expect(verdict).toContain("Src/Netcode.js");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// * The reason this file went red on CI for a day: every path case here ran on ONE path
// * flavour — the host's. `path.sep` is `\` on Windows and `/` on POSIX, and on POSIX a
// * backslash is a legal filename byte, so Windows-shaped input normalized on the dev box
// * and passed through untouched on ubuntu-latest. A test that can only be wrong on the
// * machine you do not have is not a test. normalizeRepoPath takes an injectable flavour
// * so the same table is asserted for both platforms from either one.
describe.each([
  ["win32", path.win32, "C:\\repo"],
  ["posix", path.posix, "/repo"],
])("normalizeRepoPath — %s flavour", (_name, flavour, root) => {
  const norm = (target) => normalizeRepoPath(target, root, flavour);

  // * Separators fold, case does NOT (HOOK-CASE-1). The returned string is handed to
  // * readFileSync and to `git show :0:<path>`, and git's index lookup is case-sensitive even
  // * under core.ignorecase — so lowercasing here silently broke the staged-blob check for
  // * every path containing a capital letter.
  it.each([
    ["src/Main.js", "src/Main.js"],
    ["src\\Main.js", "src/Main.js"],
    ["src\\ui/hud.js", "src/ui/hud.js"],
    ["docs/BRIEFING.md", "docs/BRIEFING.md"],
    ["docs\\BRIEFING.md", "docs/BRIEFING.md"],
    ["docs\\..\\docs\\BRIEFING.md", "docs/BRIEFING.md"],
  ])("normalizes %j to %j on both platforms", (input, expected) => {
    expect(norm(input)).toBe(expected);
  });

  it("keeps case-variant paths distinct — they are different files on a case-sensitive FS", () => {
    expect(norm("src/Foo.js")).not.toBe(norm("src/foo.js"));
  });

  it.each([
    "../outside/x.js",
    "..\\outside\\x.js",
    "../../etc/passwd",
    "..\\..\\etc\\passwd",
    "",
    ".",
  ])("rejects %j as outside the tree", (input) => {
    expect(norm(input)).toBeNull();
  });

  it("rejects a bare .. rather than treating it as an in-tree name", () => {
    // * `rel.startsWith('../')` alone never caught rel === '..' exactly.
    expect(norm("..")).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(norm(null)).toBeNull();
    expect(norm(undefined)).toBeNull();
    expect(norm(42)).toBeNull();
  });
});

describe("track-session-writes: session write recording", () => {
  const root = process.cwd();

  it("records a normalized repo-relative path and dedupes", () => {
    const session = "tw-basic";
    const input = { session_id: session, cwd: root, tool_input: { file_path: "src\\Main.js" } };
    trackWrite(input, { stateDir: scratch, env: {} });
    trackWrite(input, { stateDir: scratch, env: {} });
    // * Separator normalized, case preserved: this key is what guard-git-add later reproduces
    // * to look up `writes`, and what it hands to git.
    expect(readState(scratch, session).touched).toEqual(["src/Main.js"]);
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

  it("records a content hash beside the path, and CRLF hashes equal to LF", () => {
    const lf = "tw-hash-lf";
    trackWrite(
      { session_id: lf, cwd: root, tool_input: { file_path: "src/a.js" } },
      { stateDir: scratch, env: {}, readFile: () => "line one\nline two\n" }
    );
    const crlf = "tw-hash-crlf";
    trackWrite(
      { session_id: crlf, cwd: root, tool_input: { file_path: "src/a.js" } },
      { stateDir: scratch, env: {}, readFile: () => "line one\r\nline two\r\n" }
    );
    const recorded = readState(scratch, lf).writes["src/a.js"];
    expect(recorded).toBe(hashContent("line one\nline two\n"));
    // core.autocrlf makes worktree and index bytes differ by line ending — they must not
    // read as drift.
    expect(readState(scratch, crlf).writes["src/a.js"]).toBe(recorded);
  });

  it("records the path but no hash when the file cannot be read", () => {
    const session = "tw-nohash";
    trackWrite(
      { session_id: session, cwd: root, tool_input: { file_path: "src/a.js" } },
      {
        stateDir: scratch,
        env: {},
        readFile: () => {
          throw new Error("vanished");
        },
      }
    );
    const state = readState(scratch, session);
    expect(state.touched).toEqual(["src/a.js"]);
    expect(state.writes).toEqual({});
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
