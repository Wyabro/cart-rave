# Grok — Cart Clash

Cold start: [docs/BRIEFING.md](./docs/BRIEFING.md) → [AGENTS.md](./AGENTS.md) → top of
[docs/STATUS.md](./docs/STATUS.md). Deep process/stack:
[docs/reference/agent-manual.md](./docs/reference/agent-manual.md) (**read when** needed).

**AGENTS.md is canonical.** This file is Grok-only extras. Never restate stack, invariants,
or the gate chain here.

## Role

**Grok and Codex are equal heavy-lift defaults** (no single main driver yet). Cursor = IDE /
backup. Claude is demoted — do not wait on Claude-only hooks or Claude process theater.

## Grok notes

- **Windows + PowerShell.** `Select-String`, not `grep`; single-line commits (`-m "..."`).
- Prefer dedicated file tools over shell for read/edit when available.
- Gates: `npm run qa` — report results **by number**. Client bundle touch → also `npm run build`.
- Ship only on Wyatt's explicit **"ship it"**; never `git add -A`.
- Never claim "done"/"verified" without pulling `cart-clash` and confirming HEAD
  (`npm run verify:head`). Post-deploy: fetch production asset and `Select-String` for the symbol.
- Plan → Wyatt ack → apply **per wave** before multi-file or behavior-changing work.
- Game-card freeze: no commits to `tools/`, `.claude/hooks/`, `.agents/` mid-card.
- Output shape: follow `i-have-adhd` when loaded — action first, numbered steps, no preamble/closers.
