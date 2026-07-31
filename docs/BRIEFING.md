# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (also runs inside `npm run qa`).
> Generated 2026-07-31 at commit `8da2575` on `cart-clash`. If docs/STATUS.md has changed since, `npm run health:check` fails until this is regenerated.
> Source digest: `7c53be16`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Plan → Wyatt ack → apply — BRIEFING's ACTIVE CARD names the card, not permission to edit. (2) Read [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — owning system, edges, `do_not_break`.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — Tier A drained. B1 AI-DIFF-1 shipped (`49bfc2a`). B2 CARGO-WT-1 closed (Wyatt feel accept 07-22). B3 HIT-FEEL-1 PASS (Wyatt playtest 07-22 — quieter incoming + woken normals; `?tune` ramming.fx). ARENA-BAL-1 closed (Wyatt 07-22, no code). CARGO-VIS-1 closed (Wyatt prod playtest PASS 07-30 on `b13bafb`). Before public/external playtest: reset analytics DO (see Gotchas).

## ACTIVE CARD

Analytics-DO reset — the last item of the before-external-testers gate now that all three SEC cards are closed. `DELETE /api/analytics?token=…` clears the DO, including the ~30 `sec-beacon-probe` rows. Gotchas worth keeping: `?devUnlocks=off` is a deliberate prod lever — playtest Session 2 needs it on a prod build, so never "fix" it by gating it; verifying this card by grepping `dist/` for `devUnlocks` gives a false FAIL because the `=off` path keeps the string; and vitest runs with `DEV === true`, so any DEV check read *inside* a helper makes its prod branch untestable — pass `isDev` in. Three SEC-BEACON-1 gotchas also still apply: the two 204-always beacon routes swallow a DO 429 until the Worker is changed too; `GET /api/errors` is unusable from tests (`ERROR_LOG_TOKEN` is a secret, absent in CI) — read back via the DO stub's `/list`; and ~30 probe rows (`sessionId: sec-beacon-probe`) sit in the analytics DO, cleared by the reset queued below

Plan → Wyatt ack → apply. This heading names the card; it is **not** permission to edit.

Self-directed queue (one at a time, within the declared phase):
- **SHEET-1** in-match contact-sheet tool (`?room=solo` boot) — 📋 blackframes readback pre-check first
- **FIGHT-VERIFY-1** owed fight-night verification — 📋 agent half via SHEET-1; Wyatt half = playtest
- **MAIN-1 / BUNDLE-1** main.js seam / code-split — 📋 post-gate

## Waiting on Wyatt (not agent work)

- **A1 COUNTDOWN-WARM-1** fly-over camera shader/composer stall — ✅ PASS (Wyatt playtest 07-22)
- **A1 COUNTDOWN-SYNC-1** non-host countdown clock-domain sync — ✅ PASS (Wyatt playtest 07-22; empty quickplay edge case logged to BACKLOG)
- **A3 MP-FX-1** non-host gameplay VFX parity — ✅ PASS (Wyatt playtest 07-22: opponent charge glow + hop land dust/thud on non-host)
- **A4 ARENA-COL-1** Cart Rave pit KO detection & kill-zone reliability — ✅ PASS (Wyatt playtest 07-22 — rim entry pose/time → buildKOEvent)
- **B3 HIT-FEEL-1** hit feedback — weak normals + noisy incoming — ✅ PASS (Wyatt playtest 07-22)
- **SEC-BEACON-1** rate-limit the open POST beacons — ✅ CLOSED 07-30 — live at `65dea12` / Version `255d6284`. Per-IP 30/60s inside each log DO (budget per-DO, not…

## Do not

- Plan → Wyatt ack → apply. BRIEFING's active-card heading names the card — it is not a green light to edit. No multi-file or behavior-changing work without an explicit ack, even when the card looks obvious.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to BACKLOG, not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

## Gates

`npm run qa` = size budget + typecheck + tests + knip + briefing + health check — report results by number. CI also runs a production build. Never claim "done" without pulling `cart-clash` and verifying HEAD.
