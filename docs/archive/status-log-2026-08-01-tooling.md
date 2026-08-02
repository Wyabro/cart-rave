# STATUS session log — 2026-08-01 tooling stabilization + enforcement hooks (archived)

Moved out of [STATUS.md](../STATUS.md) on 2026-08-02 during the LOD-CLOCK-1 insert so
`status:size` stays under budget. Condensed one-liners remain live. Not current truth.

---

2026-08-01 (tooling stabilization sweep, 13 commits) — the Wyatt-commissioned cohesion pass
before the 10-item playtest. Gates are now **read-only**: `check` runs `briefing:check` /
`arch:check` instead of the writers, so BRIEFING_STALE/ARCH_STALE are finally reachable in
CI and `qa` never dirties the tree (the generator→Stop-guard self-block is gone).
Regeneration lives only in the pre-commit hook / `dashboard` / `refresh` — and those hooks
are now **tracked** (`tools/git-hooks/` via `core.hooksPath`) with one-shot `npm run setup`
(hooks + skills:sync + Command Center) replacing three undocumented bootstrap steps.
`refresh.mjs` is the single surface list (it had skipped playtest-console). One freshness
model: session-briefing warns on the content digest, not mtimes (the mtime warning
false-positived by construction). The gate chain has exactly one hand-written copy
(package.json `check`; briefing derives its Gates section from it, inside the digest).
Guards are session-scoped: Stop guard blocks only on dirt THIS session touched
(STOP-DIRT-1 closed; track-session-writes.mjs records ownership; Bash-only edits = known
blind spot, degrades to silence); pathspec-less `git commit` hard-denies when the index
holds foreign staged paths (GIT-INDEX-1 closed; bare `git add -u` gap closed; retreat =
demote to warn if it over-fires). `npm test` count-gates vitest against on-disk spec
discovery (TEST-COUNT-1 closed — workerd silent drops are now hard reds; root cause still
open). guard-protected-paths got its escape hatch + tests. BACKLOG −33% (12 closed rows
migrated full-text to completed-work.md; RESULTS-ACT-1/TRUST-1 deduped). Decision index
07-20→07-23 rolled to the archive log verbatim. claudeHooks 116 cases; suite 89 files /
1026 tests. **Restart Claude sessions to pick up the new PostToolUse tracker.** Playtest
owed cards untouched — the console still seeds all 10.

2026-08-01 (enforcement hooks) — Two AGENTS.md rules that no code enforced are now
mechanical. `guard-git-add.mjs` gained every `git commit -a` form (`-a`, `-am`, `-sam`,
`--all`), the `:` / `:(top)` pathspecs, and a `--` split so `git add -- -A` (a file named
`-A`) stops false-positiving; a `permissions.deny` backstop in `.claude/settings.json`
covers the common forms if the hook is disabled, but it is glob-only so `-vA`, `:`,
`:(top)` and a literal `*` stay hook-only. New `tools/verify-head.mjs` + `npm run
verify:head` is the repo's **first** remote check — there was no `git fetch`/`ls-remote`
anywhere, so `collectGit`'s ahead/behind (and the dashboard's green "in sync" chip) read a
local ref that had been stale ten hours. It uses `ls-remote` (zero writes, no
`FETCH_HEAD`, no lock contention with a concurrent session), resolves `@{upstream}` rather
than hardcoding `origin/cart-clash`, and splits it on the *first* `/` so `origin/feat/foo`
works. New `guard-stop-drift.mjs` (Stop) blocks a "done/verified" claim only when real
drift coincides — untracked files ignored via `--untracked-files=no`, offline degrades to
never-block. An earlier draft had an "honesty" matcher that exited early on the word
"unpushed"; that was a one-word bypass (`Done. Verified in HEAD. (unpushed)`) and is
deleted — honest phrasing passes because it contains no *claim*, not because of a keyword.
Gates: 976 tests / 89 files green, typecheck + knip + health:check clean. `tests/claudeHooks.test.js`
(67 cases) pins both matchers. Not yet playtested — no gameplay surface touched.
