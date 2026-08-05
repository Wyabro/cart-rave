# Claude — Cart Clash (demoted)

Cold start: [docs/BRIEFING.md](./docs/BRIEFING.md) → [AGENTS.md](./AGENTS.md).
Deep rules: [docs/reference/agent-manual.md](./docs/reference/agent-manual.md) when needed.

**AGENTS.md is canonical.** Claude is **not** a default driver (Grok + Codex are equal
primaries; Cursor is IDE/backup). Use this runtime only if Wyatt explicitly opens it.

## Claude-only notes

- Hooks in `.claude/hooks/` are **optional leftover** for this runtime. Shared process authority
  is AGENTS.md + git hooks (`npm run setup`) + `npm run verify:head` — not Claude pedantry.
- Escape hatches: `CART_CLASH_SKIP_HOOKS=1`, `SKIP_GIT_GUARD=1`, `SKIP_PATH_GUARD=1`,
  `SKIP_STOP_GUARD=1` (env on the Claude process, not in command strings).
- Windows + PowerShell: `Select-String`, not `grep`.
