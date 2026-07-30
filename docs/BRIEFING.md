# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (also runs inside `npm run qa`).
> Generated 2026-07-30 at commit `0d6bf88` on `cart-clash`. If docs/STATUS.md has changed since, `npm run health:check` fails until this is regenerated.
> Source digest: `50cbe46e`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Plan → Wyatt ack → apply — BRIEFING's ACTIVE CARD names the card, not permission to edit. (2) Read [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — owning system, edges, `do_not_break`.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — Tier A drained. B1 AI-DIFF-1 shipped (`49bfc2a`). B2 CARGO-WT-1 closed (Wyatt feel accept 07-22). B3 HIT-FEEL-1 PASS (Wyatt playtest 07-22 — quieter incoming + woken normals; `?tune` ramming.fx). ARENA-BAL-1 closed (Wyatt 07-22, no code). CARGO-VIS-1 queued (full-bay + rim overflow). Before public/external playtest: reset analytics DO (see Gotchas).

## ACTIVE CARD

C2 CARGO-VIS-1 — full-bay fill + rim overflow look
Pass looks like: ▶ session 3 pass 4 (07-30) — 4-phase pacing 5/10/20/30 + rear dead-strip fix (front-nudge 0.08→0.02, hl 0.6→0.7); wall-to-wall fill, crest over the rim, rear-clip check clean; Wyatt eyes = the close

Plan → Wyatt ack → apply. This heading names the card; it is **not** permission to edit.

## Waiting on Wyatt (not agent work)

- **A1 COUNTDOWN-WARM-1** fly-over camera shader/composer stall — ✅ PASS (Wyatt playtest 07-22)
- **A1 COUNTDOWN-SYNC-1** non-host countdown clock-domain sync — ✅ PASS (Wyatt playtest 07-22; empty quickplay edge case logged to BACKLOG)
- **A3 MP-FX-1** non-host gameplay VFX parity — ✅ PASS (Wyatt playtest 07-22: opponent charge glow + hop land dust/thud on non-host)
- **A4 ARENA-COL-1** Cart Rave pit KO detection & kill-zone reliability — ✅ PASS (Wyatt playtest 07-22 — rim entry pose/time → buildKOEvent)
- **B3 HIT-FEEL-1** hit feedback — weak normals + noisy incoming — ✅ PASS (Wyatt playtest 07-22)

## Do not

- Plan → Wyatt ack → apply. BRIEFING's active-card heading names the card — it is not a green light to edit. No multi-file or behavior-changing work without an explicit ack, even when the card looks obvious.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to BACKLOG, not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

## Gates

`npm run qa` = size budget + typecheck + tests + knip + briefing + health check — report results by number. CI also runs a production build. Never claim "done" without pulling `cart-clash` and verifying HEAD.
