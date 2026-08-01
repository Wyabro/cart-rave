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
import { offends } from "../.claude/hooks/guard-git-add.mjs";
import { claimsCompletion, evaluateStop } from "../.claude/hooks/guard-stop-drift.mjs";

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

  it("blocks a claim on modified tracked files alone", () => {
    const dirty = clean({
      trackedDirty: ["M src/main.js"],
      drifted: true,
      reasons: ["1 modified tracked file(s)"],
    });
    expect(run("Done.", dirty).verdict?.decision).toBe("block");
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
