# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (also runs inside `npm run qa`).
> Generated 2026-07-31 at commit `d03893a` on `cart-clash`. If docs/STATUS.md has changed since, `npm run health:check` fails until this is regenerated.
> Source digest: `d6e50ab0`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Plan → Wyatt ack → apply — BRIEFING's ACTIVE CARD names the card, not permission to edit. (2) Read [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — owning system, edges, `do_not_break`.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — Tier A drained; Tier B/C, the security sweep and the

## ACTIVE CARD

~~ANLX-ATTRACT-1 acceptance~~ ✅ done 07-31 — closed on a live two-client prod probe, not on counting (evidence)

Plan → Wyatt ack → apply. This heading names the card; it is **not** permission to edit.

Self-directed queue (one at a time, within the declared phase):
- **SHEET-1** in-match contact-sheet tool (`?room=solo` boot) — 📋 plan ACK'D — sheet-1.md; unblocked (ANLX closed + DO reset done); blackframes pre-check done (readback is…
- **FIGHT-VERIFY-1** owed fight-night verification — 📋 agent half via SHEET-1; Wyatt half = playtest
- **MAIN-1 / BUNDLE-1** main.js seam / code-split — 📋 post-gate

## Do not

- Plan → Wyatt ack → apply. BRIEFING's active-card heading names the card — it is not a green light to edit. No multi-file or behavior-changing work without an explicit ack, even when the card looks obvious.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to BACKLOG, not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

## Gates

`npm run qa` = size budget + typecheck + tests + knip + briefing + health check — report results by number. CI also runs a production build. Never claim "done" without pulling `cart-clash` and verifying HEAD.
