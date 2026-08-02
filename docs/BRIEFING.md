# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (the pre-commit hook does this on every commit; `npm run qa` only *checks* freshness, read-only).
> Generated 2026-08-02 at commit `d59fd92` on `cart-clash`. If docs/STATUS.md's digested sections have changed since, `npm run briefing:check` (inside `npm run qa`) fails until this is regenerated.
> Source digest: `e187431a`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Plan → Wyatt ack → apply — BRIEFING's ACTIVE CARD names the card, not permission to edit. (2) Read [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — owning system, edges, `do_not_break`.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — Tier A drained; Tier B/C, the security sweep and the analytics gating are closed — full evidence in completed-work.md (B1 AI-DIFF-1 shipped `49bfc2a`). ANLX-ATTRACT-1 closed 07-31 and the analytics DO has been reset (both before-external-testers items are done); the ring now starts clean.

## ACTIVE CARD

ROUND-WEDGE-1 Phase A — applied unpushed (`pausedWallMs` MAX-only). Commit/ship on

Plan → Wyatt ack → apply. This heading names the card; it is **not** permission to edit.

Self-directed queue (one at a time, within the declared phase):
- **FIGHT-VERIFY-1** owed fight-night verification — 🟢 agent half DONE 08-01 — podium/loadshots/states + focus-ring. Residual = Playtest owed cards (BACKLOG) —…
- **MAIN-1 / BUNDLE-1** main.js seam / code-split — 📋 post-gate

## Do not

- Plan → Wyatt ack → apply. BRIEFING's active-card heading names the card — it is not a green light to edit. No multi-file or behavior-changing work without an explicit ack, even when the card looks obvious.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to BACKLOG, not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

## Gates

`npm run qa` = status:size → typecheck → test → knip → briefing:check → arch:check → health:check (the chain is defined by `check` in package.json — that is the only hand-written copy). All steps are read-only; regeneration happens in the pre-commit hook, `npm run dashboard`, or `npm run refresh`. Report results by number. CI also runs a production build. Never claim "done" without pushing and `npm run verify:head`.
