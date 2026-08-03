# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (the pre-commit hook does this on every commit; `npm run qa` only *checks* freshness, read-only).
> Generated 2026-08-03 at commit `c93ebc3` on `cart-clash`. If docs/STATUS.md's digested sections have changed since, `npm run briefing:check` (inside `npm run qa`) fails until this is regenerated.
> Source digest: `95d73373`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Plan → Wyatt ack → apply, acked **per wave** — one plan covering every lever plus its playtest checklist, one ack, then one commit per lever. BRIEFING's ACTIVE CARD names the card, not permission to edit. (2) **Look up** the files you are touching in [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — `Select-String -Path docs/ARCHITECTURE.json -Pattern <filename> -Context 4,12`. Never read it whole; it is ~30,000 tokens. (3) During a game card, do not commit to `tools/` · `.claude/hooks/` · `.agents/` — file it to BACKLOG instead.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — Tier A drained; Tier B/C, the security sweep and the analytics gating are closed. Run 7 closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 landed (loss-on-drop residual accepted). The analytics DO has been reset, so the ring starts clean for external testers. Stay in this phase until Wyatt advances the marker.

## ACTIVE CARD

ART-PASS-SUNDIAL-1 — Sundial art pass — all 6 waves shipped
Pass looks like: ▶ ACTIVE, code complete — Wave 6 pushed, not deployed. Remaining: playtest (SUNDIAL-PT-1) + deploy. Neither paint nor relief reads on this deck (plate median 2.6; item 34 probe moved 0%). The ramp is the exception — median 12.2, responds 12× more, so item 33 re-authored it. Spec = [handover](./planning/art-pass-sundial-handover.md).

Plan → Wyatt ack → apply. This heading names the card; it is **not** permission to edit.

## Do not

- Plan → Wyatt ack → apply, acked per wave. One plan covering every lever in the wave plus its playtest checklist, one ack, then one commit per lever. BRIEFING's active-card heading names the card — it is not a green light to edit.
- During a game card, do not commit to `tools/` · `.claude/hooks/` · `.agents/` · Command Center styling. Escape hatch + BACKLOG entry, never an inline fix.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card at a time; new ideas go to BACKLOG, not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH), nor anything under Verified healthy / non-issues in project-state.md §5, without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.
- No silent pure-black WebGL frames as an accepted "look". Solo polish before deep multiplayer features; prefer quality-preserving perf fixes and measure before/after.

## Gates

`npm run qa` = status:size → typecheck → test → knip → briefing:check → arch:check → health:check (the chain is defined by `check` in package.json — that is the only hand-written copy). All steps are read-only; regeneration happens in the pre-commit hook, `npm run dashboard`, or `npm run refresh`. Report results by number. CI also runs a production build. Never claim "done" without pushing and `npm run verify:head`.
