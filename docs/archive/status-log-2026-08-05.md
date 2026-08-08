# Archived STATUS session log — 2026-08-05

Rolled out of [docs/STATUS.md](../STATUS.md) on **2026-08-08** to bring the live file back under
its token budget. **Nothing here is current truth** — the code and `git log` are authoritative,
and anything from this window that still matters lives in
[completed-work.md](../planning/completed-work.md) or the relevant card row.

**What moved:** the three 2026-08-05 session entries (AGENT-OS-1 tooling · BUNDLE-E-PT-1 PASS ·
BUNDLE-1 CLOSED PARTIAL, deployed `f2f90fd2`).

**What stayed live:** the 2026-08-06 → present entries in STATUS.md.

---

## 2026-08-05 — AGENT-OS-1 tooling

Cold-start cut: `AGENTS.md` 7.6k → ~1.6k always-on tokens; depth in
`docs/reference/agent-manual.md`. Tool routing: Grok ≡ Codex, Claude demoted. Pointers rewritten
(`GROK.md` / `CLAUDE.md` / `GEMINI.md` / `.cursorrules`). Seven David skills at `~/.grok/skills` +
`~/.codex/skills` (not vendored into repo). Left for later: `skills:sync` still health-gates the
Claude repo mirror; optional Grok config skill prune.

## 2026-08-05 — BUNDLE-E-PT-1 PASS

Lever E's deferred-callback seam playtested on prod `f2f90fd2`, 6/6 incl. the two-machine friends
round. That seam fails **silent**, so the human pass is the only evidence KO effects / announcer /
directives / cargo / colours survived the split — the unit test proves key parity, nothing more. No
correctness residual on BUNDLE-1's partial close. Also: Wyatt's **one-issue-per-playtest-card** rule
adopted (AGENTS.md + BACKLOG seed header; enforcement = PT-CARD-SPLIT-1), **HUD-TOAST-Z-1** filed,
fragile-tag audit rewrote `boot-and-orchestration`.

## 2026-08-05 — BUNDLE-1 CLOSED PARTIAL (deployed `f2f90fd2`)

Six levers, perf goal missed, byte hypothesis falsified; `size:check` membership re-keyed on
modules. [bundle-1.md §0](../planning/bundle-1.md)
