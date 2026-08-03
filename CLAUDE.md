Cold start: read [docs/BRIEFING.md](./docs/BRIEFING.md) (generated, committed — phase ·
active item · do-nots), then [AGENTS.md](./AGENTS.md). AGENTS.md is the canonical rules
file: stack facts, architecture invariants, standing behavioral rules, **how work is
executed** (one card · timebox · escalation), model/tool routing, and what's off-limits.
Session memory: [docs/STATUS.md](./docs/STATUS.md).
Architecture: [docs/reference/Game_Architecture.md](./docs/reference/Game_Architecture.md).
Everything below is Claude-Code-specific and additive — it never overrides AGENTS.md.

## Claude Code notes

- **Environment is Windows + PowerShell.** Use `Select-String`, not `grep`; forward-slash
  paths are fine in the Bash tool but the primary shell is PowerShell 7+. Prefer the
  dedicated Read/Grep/Glob/Edit tools over shell equivalents.
- **Gates:** `npm run qa` — the chain is defined by `check` in package.json (described in
  AGENTS.md § Commands), not restated here. All steps read-only; qa never dirties the tree.
  Also `npm run build` when the client bundle changes; CI runs qa **plus** a production
  build. Report results by number (do not hardcode stale test totals).
- **Remote is authoritative.** Do not claim "done"/"verified" without pulling `cart-clash`
  and confirming the change is in HEAD; post-deploy, verify against the fetched asset.
- **Hooks enforce the standing rules** (bulk staging, cross-session commit leaks,
  protected generated files, "done" claims on session-owned drift, briefing injection).
  Summary + the escape-hatch env vars: [AGENTS.md § Enforcement](./AGENTS.md). What each
  blocks and its known false positives:
  [docs/guides/hook-enforcement.md](./docs/guides/hook-enforcement.md).
- **Visual QA:** `npm run shoot` / `blackframes` / `compare` — [docs/guides/visual-qa.md](./docs/guides/visual-qa.md).
