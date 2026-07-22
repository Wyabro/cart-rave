# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (also runs inside `npm run qa`).
> Generated 2026-07-22 at commit `b8e5047` on `cart-clash`. If docs/STATUS.md has changed since, `npm run health:check` fails until this is regenerated.
> Source digest: `7cb92a95`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — Countdown stack fixed; awaiting Wyatt's playtest verdicts + an Intel-as-host capture.

## NO ACTIVE CARD

Nothing named — wait for Wyatt to pick the next card in docs/STATUS.md

Self-directed queue (one at a time, within the declared phase):
- **A1 Intel-as-host capture** original chronic-freeze question — ⏳ still 0/5 sessions — party server keeps picking the 4090
- **MAIN-1 / BUNDLE-1** main.js seam / code-split — 📋 post-gate

## Waiting on Wyatt (not agent work)

- **A1 COUNTDOWN-WARM-1** fly-over camera shader/composer stall — ✅ fixed, needs Wyatt playtest
- **A1 COUNTDOWN-SYNC-1** non-host countdown clock-domain sync — ✅ catch-up + host-domain anchor fixed; needs Wyatt playtest + F8

## Do not

- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to BACKLOG, not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

## Gates

`npm run qa` = size budget + typecheck + tests + knip + briefing + health check — report results by number. CI also runs a production build. Never claim "done" without pulling `cart-clash` and verifying HEAD.
