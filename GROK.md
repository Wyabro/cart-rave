This file serves **Grok Build and any other tool** without a dedicated pointer file.

Cold start: read [docs/BRIEFING.md](./docs/BRIEFING.md) (generated, committed — phase ·
the one active item · do-nots), then [AGENTS.md](./AGENTS.md). AGENTS.md is the canonical
rules file: stack facts, architecture invariants, standing behavioral rules, how work is
executed, model/tool routing, and what's off-limits. Session memory: docs/STATUS.md.
Everything below is additive — it never overrides AGENTS.md.

If your environment cannot auto-read repo files, use the **paste-able session opener** at
the top of AGENTS.md.

## Grok notes

- Same standing rules as every other agent — no tool-specific exemptions.
- Environment is Windows + PowerShell: `Select-String`, not `grep`; single-line commit
  messages with `-m "..."`.
- Gates: `npm run qa` (chain defined in AGENTS.md § Commands) — report results by number;
  CI runs qa plus a production build.
- Ship only on Wyatt's explicit "ship it"; never `git add -A` (concurrent agent sessions).
- Never claim "done"/"verified" without pulling `cart-clash` and confirming the change is
  in HEAD.
