# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (also runs inside `npm run qa`).
> Generated 2026-07-22 at commit `009277c` on `cart-clash`. If docs/STATUS.md has changed since, `npm run health:check` fails until this is regenerated.
> Source digest: `52c32c76`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** read [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — the generated codebase map (every file's owning system, dependency edges, and a `do_not_break` block). The active item below tells you *what* to do; the manifest tells you *what not to break* where.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — SRV-TEST-1 / A5 done (unpushed): A5a pure helpers + A5b DO harness (`tests/party-do/`, Workers Vitest pool); Vitest 707→739 (+32, +4.5%). Countdown/MP-FX/ARENA-COL/Intel-as-host PASS (07-22). COUNTDOWN-QUICKPLAY-1 in BACKLOG.

## NO ACTIVE CARD

Nothing named — wait for Wyatt to pick the next card in docs/STATUS.md

Self-directed queue (one at a time, within the declared phase):
- **MAIN-1 / BUNDLE-1** main.js seam / code-split — 📋 post-gate

## Waiting on Wyatt (not agent work)

- **A1 COUNTDOWN-WARM-1** fly-over camera shader/composer stall — ✅ PASS (Wyatt playtest 07-22)
- **A1 COUNTDOWN-SYNC-1** non-host countdown clock-domain sync — ✅ PASS (Wyatt playtest 07-22; empty quickplay edge case logged to BACKLOG)
- **A3 MP-FX-1** non-host gameplay VFX parity — ✅ PASS (Wyatt playtest 07-22: opponent charge glow + hop land dust/thud on non-host)
- **A4 ARENA-COL-1** Cart Rave pit KO detection & kill-zone reliability — ✅ PASS (Wyatt playtest 07-22 — rim entry pose/time → buildKOEvent)

## Do not

- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to BACKLOG, not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

## Gates

`npm run qa` = size budget + typecheck + tests + knip + briefing + health check — report results by number. CI also runs a production build. Never claim "done" without pulling `cart-clash` and verifying HEAD.
