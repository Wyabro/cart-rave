# Hook enforcement — what each hook blocks, and its known false positives

The standing rules in [AGENTS.md](../../AGENTS.md) are enforced by the harness, not by trust.
That file carries the summary and the escape hatches; this guide carries the mechanics —
what each hook actually inspects, why it is shaped that way, and the shapes that produce a
false block.

The hooks live in `.claude/hooks/` and are wired from the committed `.claude/settings.json`,
so they travel with a clone. **Hook config is snapshotted at session start — restart the
session after changing `settings.json`.** **Claude Code only:** Cursor / Antigravity / Grok
get `npm run verify:head` and AGENTS.md, not mechanical blocking. All hooks fail open (any
internal error exits 0) and are driven by `tests/claudeHooks.test.js`.

## `session-briefing.mjs` (SessionStart)

Injects the committed `docs/BRIEFING.md` as cold-start context, and warns when STATUS's
digested sections have moved past it (same content digest as `briefing:check` — never mtimes).

## `guard-git-add.mjs` (PreToolUse on Bash/PowerShell)

Enforces three rules.

**(1) Denies whole-worktree staging:** `git add -A` / `.` / `./` / `.\` / `.\\` / `:/` / `:` /
`:(top)` / `*` / `--all`, an absolute pathspec naming the repo root **quoted or bare** (`"."`
counts), combined short flags like `-Av`, bare `git add -u` / `--update` (with a pathspec,
`-u <path>` stays legal), and every `git commit -a` form. Explicit paths, `-p`, and `--amend`
pass.

A `permissions.deny` list in `settings.json` backs it up if the hook is disabled or errors —
but that list is **glob-only**, so `-vA`, `:`, `:(top)`, a literal `*` and the
backslash/absolute-root forms are hook-only. **`settings.json` is strict JSON, not JSONC:
never put a comment in it, or every hook in the file stops loading.**

**(2) GIT-INDEX-1:** concurrent sessions share one git index, so a pathspec-less `git commit`
ships whatever anyone staged. The hook records this session's `git add` pathspecs, and denies
a pathspec-less commit whose index holds paths this session never touched or staged (generated
docs exempt; no session record or git failure → allow). The denial names the foreign paths and
the remedies.

**(3) GIT-INDEX-2:** GIT-INDEX-1 compares *paths*, so a file you legitimately wrote and staged
still passes when a concurrent session appended to it in between — an owned path carrying a
foreign hunk. `track-session-writes.mjs` therefore records a content hash of every file this
session writes, and two checks compare against it:

- **Check A** hashes the **worktree** at `git add` — the only check that can see
  `git add X && git commit` in one command, because at PreToolUse the index is still pre-add.
- **Check B** hashes the **staged blob** at a pathspec-less commit.

Hashes normalize CRLF, because `core.autocrlf` makes worktree and index bytes differ by line
ending.

**Check A means an explicit-path `git add` can now be denied — that is the contract working,
not a hook bug.** Bash-written files record no hash, so they read as drifted if staged; that
and `git add -p` are the known false-positive shapes, and `SKIP_GIT_GUARD=1` is the answer.
Every read failure falls open.

## `guard-protected-paths.mjs` (PreToolUse on Write/Edit/MultiEdit/NotebookEdit)

Denies edits to generated files (`docs/BRIEFING.md`, `docs/ARCHITECTURE.json`) and the
`docs/archive/{handovers,audits}/` history.

## `track-session-writes.mjs` (PostToolUse on the same matchers)

Records which repo files this session wrote — the ownership record the two guards above and
below consult. Bash-only edits (sed/heredoc/npm scripts) are a known blind spot; their dirt
goes untracked, which degrades guards toward silence, never toward false blocks.

## `guard-stop-drift.mjs` (Stop)

Blocks a "done / verified" claim when `verify:head` says the tree is drifted — unpushed
commits, behind the upstream, or **modified tracked files this session touched**
(STOP-DIRT-1: another session's in-flight dirt no longer blocks this session's correct claim;
generated docs never count; untracked is ignored). Restating honestly, e.g. **"applied,
unpushed"**, is not a claim and passes. It blocks at most twice per session and never twice
for the same unchanged drift state.

## Escape hatches

`CART_CLASH_SKIP_HOOKS=1` (all hooks) · `SKIP_GIT_GUARD=1` · `SKIP_PATH_GUARD=1` ·
`SKIP_STOP_GUARD=1`. These are read from the Claude Code process env, **never parsed out of a
command string** — so `SKIP_GIT_GUARD=1 git add -A` is still blocked.

## The git hooks (separate mechanism)

`tools/git-hooks/pre-commit` and `post-commit` regenerate `docs/BRIEFING.md` +
`docs/ARCHITECTURE.json` and refresh the Command Center on every commit. They are **tracked in
the repo** and installed by **`npm run setup`**, which sets `git config core.hooksPath
tools/git-hooks` and also syncs `.claude/skills/` and builds the Command Center — the three
local pieces a fresh clone is missing, one command, idempotent. It replaces any prior local
`core.hooksPath` for this repo. Bypass both hooks with `SKIP_DOCS_HOOK=1`.
