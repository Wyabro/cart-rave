# Cart Clash — Session Status

Declared state: phase, current focus, the one active card, prohibitions, open issues. Observed
evidence (git HEAD, gate/battery results, captures) is generated — `npm run dashboard`. The
cold-start read order lives once, in [AGENTS.md](../AGENTS.md); do not restate it here.

History is not kept in this file. Closed work → [completed-work.md](./planning/completed-work.md).
Session logs → [archive/README.md](./archive/README.md). Decisions in full →
[archive/decision-log-2026-08-03-to-16.md](./archive/decision-log-2026-08-03-to-16.md).

## Phase

Orientation only — **advance the ▶ marker only on Wyatt's explicit instruction.** Agents may
report phase-exit eligibility; they must not move the marker.

### Release phases

- ✅ Foundation — engine, arenas, carts, physics
- ✅ Core gameplay — KOs, scoring, Living Store, solo AI
- ✅ Multiplayer — P2P netcode, host authority, migration
- ✅ Production systems — passes 1–5, tooling, observability
- ▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC
- ⬜ Release candidate — queue drained, exact-HEAD evidence green, tech-debt triage
- ⬜ Ship — domain cutover, external testers, wide URL

## Current focus

**Playtesting and stabilization.** External playtest is gated on BACKLOG Block 1.
**NIGHT-SHIFT-CITY-2** closed PASS 09-18 (`47ad5d80`). Wyatt pulled
**NIGHT-SHIFT-PICKER-1** then **NIGHT-SHIFT-QP-1** to Block 1 (not active
until ack in the next window). Residual **NIGHT-SHIFT-DETAIL-1**.
SNAP-FINITE-PT-1 and NET-LAG-1 wait.
**CG-COVERS-1** closed 09-14 (Wyatt). **CAM-COMFORT-1** closed 09-14 (Wyatt, no lever).
**SITE-TRUST-1** closed 09-14 — prod `c58c96ff` Worker
`aed9d44e-7139-4af7-92ee-1625307d7147`. **SITE-TRUST-PT-1** Wyatt PASS
on prod.
**SOFTGL-DISMISS-1** closed 09-01 — PLAY ANYWAY is one-shot per tab.
**SOFTGL-DISMISS-PT-1** PASS (local `?forcegpu=sw`; Wyatt authorized).
**RESTART-ROUND-1** closed 09-01 — **RESTART-ROUND-PT-1** PASS (local
Playwright; Wyatt authorized). **PAUSE-SLIDER-DELAY-1** closed 09-01 —
**PAUSE-SLIDER-DELAY-PT-1** PASS (local Playwright; Wyatt authorized).
**MENU-SHORTWIN-1** closed 09-02 — short-desktop hero spacing.
**MENU-SHORTWIN-PT-1** PASS (local Playwright 1077×606).
**CG-ZIP-1** closed 09-02 — `tmp/cart-clash-crazygames.zip` 23.96 MB / 182
files. **CG-ZIP-PT-1** PASS (local Playwright unzip + `lvh.me`).
**ONBOARD-COPY-1** closed 09-14 — prod `39010c93` Worker
`0c962927-fae5-49ba-877e-19b814190ec8`. **ONBOARD-COPY-PT-1** Wyatt PASS.
**MENU-MUSIC-FIRST-PT-1** Wyatt PASS 09-01 on prod `d16fd523`.
**NET-LAG-1-PT-1** PASS 09-14 (trail gone). Wave 2 shipped `8fa504ac` but
**NET-LAG-PT-2 FAIL** on two Intel non-host matches: caps 400/402 show 11/10
hard corrections, max 19.9/22.1 m, RTT 29/5 ms average, zero history drops,
5/7 replay-budget events. Video 09-24 shows repeated arena swings around the
local cart. The captures do not support input-history loss or routine network
delay as the main cause; the source of physics divergence is open. Next:
bounded pre-host/post-replay F8 trace, then
one cause-specific fix. Do not retouch Classic / Sundial /
Storerooms floors. Do not reopen **CART-POP-1**. Stay in this phase until
Wyatt advances the marker.
**GLITCH-TECH-1** shipped 09-18 — prod `4ab166a8` Worker
`57c54d38-5a8c-4660-aa1f-4e4c2b1eb934`. VERIFY_OK `index-B5xOzF-P.js`, 28 refs,
0×404, `/installs/` + `/validate` live. Owed: **GLITCH-TECH-PT-1**.

**BOOT-TBT-1 join-load ship 09-14:** prod `a29736a1` Worker
`241bb329-6ef1-444a-ab1c-82fbd47114c7`. VERIFY_OK `index-CEplJ-zV.js`, 28 refs,
0×404, exclusive-lock symbol live. Battery 8/8. Owed: **JOIN-LOAD-PT-1**.

**Closed cards keep their narrative in their own docs, not here** — Sundial
([handover](./planning/art-pass-sundial-handover.md); read its "Traps that cost time" before any
capture, and judge phase changes against a ~1.2% construction-noise floor, not zero), Fight Night
([handover](./planning/fight-night-ui-handover.md)), Cart Rave and Storerooms
([audits](./planning/art-audit-storerooms.md)). Owed human checks are BACKLOG rows under
`## Playtest owed`. Playtest console: `npm run dashboard` →
[.diag-captures/playtest-console.html](../.diag-captures/playtest-console.html). F8 +
`npm run captures:pull`.

### Do not

Standing prohibitions — fed into [BRIEFING.md](./BRIEFING.md) and the Command Center firewall.

- **[AGENTS.md](../AGENTS.md) applies in full and is not summarised here** — agent states Routine / Standard / Critical before editing · Standard and Critical require ack · one card at a time · `tools/` · `.claude/hooks/` · `.agents/` frozen during a game card · ship only on "ship it" · never `git add -A` · the ▶ phase marker is Wyatt's. Read it before editing; this list carries only the project-specific prohibitions below.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH), nor anything under **Verified healthy / non-issues** in [project-state.md §5](./planning/project-state.md), without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.
- No silent pure-black WebGL frames as an accepted "look". Solo polish before deep multiplayer features; prefer quality-preserving perf fixes and measure before/after.

### Done when (Playtesting & stabilization)

- [x] Run 7 playtest mission closed (P0–P6 · NH · NET-1 · LS-1 · RC-1 A/B/C · CAM-1 · HUD-MENU-1)
- [x] **NET-2** quickplay/mid-join cart driveable without long freeze — Wyatt PASS (~3s to drive)
- [x] **NET-MIG-3** host-migration ghost feel — Wyatt PASS + live deploy verified
- [x] **NET-PRES-1** fall/collision event-id dedupe — code landed; loss-on-drop residual accepted
- [x] **NET-SD-1** sole-leader SD self-fall / untied wipeout — crowns fallback winner
- [x] Stabilization residual named by Wyatt — **PERF-CLASSIC-IGPU-1** (ack B, 08-18)
- [ ] Phase exit only on Wyatt instruction → Release candidate

### Active queue (strict — one card at a time)

Live rows only. Shipped and closed cards live in
[completed-work.md](./planning/completed-work.md); the tier list is
[SHIP-1.md](./planning/SHIP-1.md).

| # | What | Status |
|---|------|--------|
| SOFTGL-DISMISS-1 | software-GL modal one-shot per session | ✅ CLOSED 09-01 — **SOFTGL-DISMISS-PT-1** PASS (local `?forcegpu=sw`) |
| RESTART-ROUND-1 | pause RESTART ROUND must not advance RD | ✅ CLOSED 09-01 — **RESTART-ROUND-PT-1** PASS (local Playwright) |
| PAUSE-SLIDER-DELAY-1 | pause overlay empty ~1 s before sliders | ✅ CLOSED 09-01 — **PAUSE-SLIDER-DELAY-PT-1** PASS (local Playwright) |
| MENU-SHORTWIN-1 | menu readable at CrazyGames 1077×606 | ✅ CLOSED 09-02 — **MENU-SHORTWIN-PT-1** PASS (local 1077×606) |
| CG-ZIP-1 | CrazyGames Basic Launch zip of `dist/` | ✅ CLOSED 09-02 — 23.96 MB / 182 files; **CG-ZIP-PT-1** PASS |
| SITE-TRUST-1 | public information and analytics choice | ✅ CLOSED 09-14 — **SITE-TRUST-PT-1** PASS (prod `c58c96ff`) |
| ONBOARD-COPY-1 | HOW TO PLAY AISLE 1+2 copy matches live input | ✅ CLOSED 09-14 — Wyatt PASS **ONBOARD-COPY-PT-1** on prod `39010c93` |
| NET-LAG-1 | Friends/QP lag + rubber-band (F8 both machines) | wave 2 `8fa504ac` on prod; Wyatt NET-LAG-PT-2 FAIL 09-24 despite low RTT and zero input-history loss; correction trace pending |
| RAM-ARREST-1 | silent ram on solver-arrested contact (SNAP-FINITE-PT-1 FAIL) | ✅ shipped `6c5c139b` Worker `8476ccfb`; **SNAP-FINITE-PT-1** retest owed |
| AUDIO-RAM-IMPACT-1 | ram crash SFX inaudible + soft taps silent (external playtest) | ✅ CLOSED 08-21 — Wyatt PT PASS on prod `67778a9f` (both rounds: `c4e7f082` + `0644094f`) |
| ONBOARD-WEBP-1 | HOW TO PLAY WebP playback + fallback | ✅ CLOSED 08-23 — Wyatt PASS **ONBOARD-WEBP-PT-1** on prod `14658bf8` (Worker `e14acbd4`) |
| CLIENT-ID-AUTH-1 | clientId claim hijack guard (session-token proof of ownership) | shipped `e5ca329b` Worker `c789f236`; Wyatt PASS **CID-AUTH-PT-1** 08-22 |
| CLUTCH-SLOMO-1 | SD-deciding KO slow-mo before podium | ✅ shipped Worker `c214c758` (VERIFY_OK `index-D28UWcmx.js`); **CLUTCH-SLOMO-PT-1** owed on prod |
| BRAND-1 | Domain cutover | 🧊 frozen ([brand.md](./brand.md)) |

### Next actions

1. After diagnostic ship, run **NET-LAG-DIAG-PT-1** `[2pc]`; NET-LAG-PT-2 stays FAIL until a cause-specific fix gets Wyatt PASS. **SNAP-FINITE-PT-1** `[2pc]` retest owed on prod `6c5c139b`. Owed: **CLUTCH-SLOMO-PT-1** (prod). Deferred: **SHARD-PT-2** (launch day).
   Closed 09-02: **CG-ZIP-PT-1** · **CG-ZIP-1** · **MENU-SHORTWIN-PT-1**.
   Closed 09-01: **MENU-MUSIC-FIRST-PT-1** · **SOFTGL-DISMISS-PT-1** ·
   **RESTART-ROUND-PT-1** · **PAUSE-SLIDER-DELAY-PT-1**.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md). Closed IDs live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| BRAND-1 | Domain / Worker cutover | 🧊 frozen until deliberate cutover ([brand.md](./brand.md)) |

## Decision index

**One line each, newest first.** In-flight only. Closed 08-03 → 08-16:
[decision-log-2026-08-03-to-16.md](./archive/decision-log-2026-08-03-to-16.md). Full text 07-31
→ 08-02: [decision-log-2026-08.md](./archive/decision-log-2026-08.md). 07-11 → 07-23:
[decision-log-2026-07.md](./archive/decision-log-2026-07.md).

- **D-BOOT-TBT-1** (08-18): yield Classic `initArena` between measured
  slabs; `loadLevel` awaits `initFn`. No Rapier pre-warm. Prod wasm already
  `zstd`. **BOOT-TBT-PT-1** Wyatt PASS 08-19 (prod `c3aecffe`).
- **D-PERF-WATCH-1** (08-18): wave 1 = scale-up only (17ms / 8 windows /
  30s ratchet). No mid-round Low → Medium. Wave 2 is a separate ack.
- **D-PERF-CLASSIC-IGPU-1** (08-18): wave B = name the +7.5 ms vis gap. No
  `recordbody` ship until a clean cell. 60 fps bar is not this card. **CLOSED
  on cap-372**: vis gap is render (visRenderMeanMs 9.09 of visMeanMs 10.09 ≈
  90%; sync/fx/hud/other ≈ 1.0 ms total). Render-gated lever has a clean cell.
- **D-WARM-QP-ROTATE-1** (08-18): parent closed. Adopt + **WARM-QP-ROTATE-PT-1**
  cover first-room swap. cap-364 is pre-fix. Residual compile after adopt →
  **WARM-CLASSIC-JUICE-1**. Mid-session QP rotate needs a new ID if it stalls.
- **D-WORK-LANES-1** (08-17): agents self-classify Routine / Standard / Critical by blast radius and state the lane before editing. Routine proceeds after intent with focused checks; Standard and Critical require ack and one wave-boundary QA; Critical adds adversarial review and risk-specific proof. Scope growth escalates the lane.
- **D-SPILL-RAM-CREDIT-1** (08-17): SPILL credit = real spill (tip-over / massive-ram / void fall) attributed to `lastHitBy` + 3s window. Rams on upright victims count 0. Playtest **SPILL-RAM-CREDIT-PT-1**.
- **D-HOWLER-UPGRADE-1** (08-17): pooling + volume buses already shipped. Spatial deferred, taste-gated. Card closed. New ID if playtest asks for 3D SFX.
- **D-COUNTDOWN-HOST-STAMP-1** (08-16): first non-host 3-2-1 adopts `host_round` start while `hostClock.samples === 0` (caps 367 / 368). Not a THOST-CEILING fail. Candidate: skip that stamp until the host clock has samples.
- **D-REMOTE-INPUT-STALE-1** (08-17): host zeros stale remote input after `remoteInputStaleMs` (300) of apply-silence; nitro latch kept; ackSeq untouched. Playtest **REMOTE-INPUT-STALE-PT-1**.
- **D-LAST-STANDING-DEAD-1** (08-16): delete Last Cart Standing. Bolt → 5 SD wins. lastStanding wire accepted; non-max rejected. Playtest **LAST-STANDING-DEAD-PT-1**.
- **D-NPC-ABORT-BURST-1** (08-16): abort hard-cancels unless the locked target is live on the floor and cart-yaw runway is clear. Open-floor close ram still bursts. Playtest **NPC-ABORT-BURST-PT-1**.

## Gotchas (append-only)

The hot set — what a current session is likely to hit. Deep-domain and narrow entries live in
**[reference/gotchas.md](./reference/gotchas.md)** — grep it *before* debugging physics
(combine rules · `castRay` filters · no RNG seed), audio (Howler `_playLock` · volume buses),
the dev loop (dev probes lie in prod · edge propagation · frozen `rAF` · HNS ports · hostFreeze),
or a suspected blocker (TS 7 · `cartrave4` UVs).

- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- **Level animation IS capturable** — SHOOT-ANIM-1 closed (`6b27283`); pin with `--t <ms>` and compare two. Judge against the arena's null floor, not zero: **Sundial ~1.2%, Classic ~15.9%**. Rave **dressing** is still frozen — SHOOT-ANIM-2.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- **The in-app Browser pane does not composite while hidden**, so rAF never fires there: loaders sit at 4% forever. Verify rendered behavior on prod or in tests.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- **Before any public / external-tester playtest: reset the analytics DO.** Token-gated: `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (never `?token=`).
- Local worker port is **8899** (`LOCAL_WORKER_PORT` in `src/config.js`). If it goes EACCES, re-check Windows HNS exclusions and move the port there.

## Last updated

2026-09-14 (**CLUTCH-SLOMO-1** ship) — Worker
`c214c758-075f-470c-8007-77df06dfdb6e`. VERIFY_OK `index-D28UWcmx.js`
(attempt 1, 28 refs, 0×404). Symbol `setSlowMoStartMs` live in
`gameBoot-cwnC8SEL.js`. SD-win defers ~1.2s slow-mo, then endRound.
Owed: **CLUTCH-SLOMO-PT-1** on prod (hard-refresh https://www.cartclash.lol/).

2026-09-14 (**RAM-ARREST-1** ship) — commit `6c5c139b` Worker
`8476ccfb-660b-4d67-a9bc-ba902c4516f4`. VERIFY_OK `index-BQxMmoL7.js`
(attempt 1, 28 refs, 0×404). Presentation fallback on solver-arrested
contact; physics live-gated. Owed: **SNAP-FINITE-PT-1** retest `[2pc]` + F8.

2026-09-08 (**ONBOARD-COPY-1** ship) — prod `39010c93` Worker
`0c962927-fae5-49ba-877e-19b814190ec8`. VERIFY_OK `index-CLCGsbQj.js`
(attempt 1, 28 refs, 0×404). Live entry has `Steer with WASD. Press Space to hop.`
Owed: **ONBOARD-COPY-PT-1**. Next **CG-COVERS-1**.

2026-09-02 (**CG-ZIP-PT-1** PASS) — local Playwright on unzipped zip:
menu 1077×606, solo countdown on Sundial, Friends `SHOP5` seated two
tabs via `lvh.me` → live Worker. Next **CG-COVERS-1**.

2026-09-02 (**CG-ZIP-1** ship) — `npm run zip:cg` writes
`tmp/cart-clash-crazygames.zip` (23.96 MB / 182 files, `index.html` at
root). No SDK. Desktop-only listing. Next **CG-COVERS-1**.

2026-09-02 (**MENU-SHORTWIN-1** ship) — prod `1d40cb4e` Worker
`8ad14f71-55a1-4a83-bb60-7e7b2c1a7d94`. VERIFY_OK `index-2r3-npAj.js`
(attempt 1, 28 refs, 0×404). Live `index-CsbxUb-Y.css` has
`(width>=1025px) and (height<=640px)` `.cr-hero{padding-top:12px}`.
Next **CG-ZIP-1**.

2026-09-02 (**MENU-SHORTWIN-PT-1** PASS) — live Playwright on Vite
`:4000` at 1077×606: SETTINGS 26px above the hint bar, hint bar visible,
tagline stays. 1920×1080 unchanged. Parent closed.

2026-09-01 (**PAUSE-SLIDER-DELAY-PT-1** PASS) — local Playwright on
`npm run dev:local`: solo Esc, MUSIC / SFX / VOICE at opacity 1 on first
panel paint, reopen matches, 13/13. Wyatt authorized. Parent closed.

2026-09-01 (**RESTART-ROUND-PT-1** PASS) — local Playwright on
`npm run dev:local`: solo RD 1, pause RESTART ROUND, GO still RD 1,
clock 2:30, scores 0. Wyatt authorized. Parent closed. Do not reopen
**RD-COUNTER-1**.

2026-09-01 (**SOFTGL-DISMISS-PT-1** PASS) — local `?forcegpu=sw`: notice
on first load, gone after PLAY ANYWAY reload, back in a new context.
Wyatt authorized. Parent closed.

2026-09-01 — Wyatt: all six Crazy Games / prod-bug cards are High
(**SOFTGL-DISMISS-1** · **RESTART-ROUND-1** · **PAUSE-SLIDER-DELAY-1** ·
**MENU-SHORTWIN-1** · **CG-ZIP-1** · **CG-COVERS-1**).

2026-09-01 — Wyatt PASS **MENU-MUSIC-FIRST-PT-1** on prod `d16fd523`.
Filed **SOFTGL-DISMISS-1**, **RESTART-ROUND-1**, **PAUSE-SLIDER-DELAY-1**,
**CG-ZIP-1**, **CG-COVERS-1**. Pulled **MENU-SHORTWIN-1** forward for
CrazyGames iframe 1077×606.

Older session logs (2026-08-26 and earlier): [archive/README.md](./archive/README.md)
([status-log-2026-08-16-to-26.md](./archive/status-log-2026-08-16-to-26.md)).
