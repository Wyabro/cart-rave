Read AGENTS.md at the repo root first. It is the canonical rules file for this project.

`AGENTS.md` holds the stack facts, architecture invariants, standing behavioral rules,
model/tool routing, and what's off-limits. `docs/architecture.md` is the deep reference.
Everything below is Claude-Code-specific and additive — it never overrides AGENTS.md.

## Claude Code notes

- **Environment is Windows + PowerShell.** Use `Select-String`, not `grep`; forward-slash
  paths are fine in the Bash tool but the primary shell is PowerShell 7+. Prefer the
  dedicated Read/Grep/Glob/Edit tools over shell equivalents.
- **Gates:** `npx vitest run` (21/21), `npm run typecheck` (0 errors), `npm run build`.
  Report results by number.
- **Remote is authoritative.** Do not claim "done"/"verified" without pulling `next-level`
  and confirming the change is in HEAD; post-deploy, verify against the fetched asset.
- **`/code-review ultra`** launches a multi-agent cloud review of the current branch (or a
  GitHub PR with `/code-review ultra <PR#>`). It is user-triggered and billed — Claude Code
  cannot launch it itself.
