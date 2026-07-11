Read [AGENTS.md](./AGENTS.md) at the repo root first. It is the canonical rules file for this project.

`AGENTS.md` holds the stack facts, architecture invariants, standing behavioral rules,
model/tool routing, and what's off-limits. Session memory: [docs/STATUS.md](./docs/STATUS.md).
Architecture: [docs/reference/Game_Architecture.md](./docs/reference/Game_Architecture.md).
Everything below is Claude-Code-specific and additive — it never overrides AGENTS.md.

## Claude Code notes

- **Environment is Windows + PowerShell.** Use `Select-String`, not `grep`; forward-slash
  paths are fine in the Bash tool but the primary shell is PowerShell 7+. Prefer the
  dedicated Read/Grep/Glob/Edit tools over shell equivalents.
- **Gates:** `npm test`, `npm run typecheck`, `npm run build` / `npm run check`.
  Report results by number (do not hardcode stale test totals).
- **Remote is authoritative.** Do not claim "done"/"verified" without pulling `cart-clash`
  and confirming the change is in HEAD; post-deploy, verify against the fetched asset.
- **Visual QA:** `npm run shoot` / `blackframes` / `compare` — [docs/guides/visual-qa.md](./docs/guides/visual-qa.md).
