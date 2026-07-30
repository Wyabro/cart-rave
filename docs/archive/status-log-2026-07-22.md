# STATUS session log — 2026-07-22

Rolled out of [STATUS.md](../STATUS.md) on 2026-07-30 when the live log passed the 8k-token
budget (status-size gate). What stayed live: 2026-07-23 → present. Nothing here is current
truth — `git log` and the code are authoritative.

2026-07-22 (B1 AI-DIFF-1 SHIPPED) — `49bfc2a` / `index-Dxyw7U08.js` / Version `4e33515b`.
Easy/Med/Hard NPC decision tiers on prod. Medium = baseline identity; Solo default Easy +
Arenas picker (`cr-diff-btn`); Quickplay forced Medium; Friends host pick via store +
`host_round.aiDifficulty` latch (mirrors `levelId`; no `roundValidation` touch).
Playtest-tuned Easy −15% / Hard +15% vs first pass. Hard `steerGainMax` ≤ 1.85.

2026-07-22 (A7 ANLX-VIEW-1 PASS) — Wyatt smoke: `analytics:pull` + Command Center Analytics
panel. Reading surface closed. Reminder: clear analytics DO before public playtest
(`DELETE /api/analytics`). Unpushed until Wyatt ships.

2026-07-22 (COUNTDOWN-ARM-1 SHIPPED + PASS) — Continuous-mode server waits for
`MSG.clientPlayReady` (post-`ensureSessionCartsReady`) before minting `startsAtMs`, with a
`PLAY_READY_TIMEOUT_MS=12s` ceiling that arms a fresh full window; Cap-200 client defer stays
as straggler safety net. Shipped `e08e5f5`; Wyatt two-browser quickplay smoke on it = full
3-2-1. A6 closed, no active card. Battery 5/6 (spawnlock only — `countdown_3` miss under load
after gameharness; drive checks green).

2026-07-22 (A6b + Cap-200 — false green, then fixed) — netharness `hostReload` (mid-round
host tab reload) read 13/13 live but was a **false green**: a flag-only assert. Cap-200
(2eedc04, reloader, 4090) showed `menuVisible:false` while the DOM menu resurrected —
boot-splash late `CartRave.show()` after `commitMenuHiddenForGame`; continuous-mode
`colorPick` arm also truncated the host countdown to 1/GO. Fix shipped `8646dae`
(`shouldBootRevealMenu` guard, host-MP defer, harness `crRootDisplay`); Wyatt smoke: menu
PASS, countdown residual → COUNTDOWN-ARM-1 above.

2026-07-22 (process — plan→ack→apply firewall) — Cold-start docs made the A6b skip
impossible to miss: BRIEFING tag **ACTIVE CARD** (was DO THIS NOW) + explicit
"not permission to edit"; STATUS Do-not #1; AGENTS HOW WORK step 0; paste-able opener.
Lesson: buried STANDING bullets lose to a loud "do this now" heading.
