# Cart Clash — Completed Work (Historical Record)

> Historical log. Past entries may still say "Cart Rave" / `next-level` — that is intentional. Living naming rules: [brand.md](../brand.md).

**Last Updated:** July 31, 2026

> **This doc = the past** — the single home for historical/completed items. For what works
> *today* see [project-state.md](./project-state.md); for forward plans see [ROADMAP.md](./ROADMAP.md).

Chronological record of shipped work, newest first.

> **Convention:** As items ship, move their completed writeup here (out of ROADMAP.md / project-state.md).

---

### July 17–20, 2026 – Run 7 playtest mission (closed evidence)

Rolled out of STATUS.md's active queue on 07-31 — it had been sitting there as a historical
strip long after it stopped being live work. Superseded triage docs:
[2026-07-17](./playtest-triage-2026-07-17.md) … [run6](./playtest-triage-2026-07-18-run6.md).

| # | What | Status |
|---|------|--------|
| **Run 7** | Full playtest mission | ✅ CLOSED |
| **NET-1** | Two-browser full-round smoke | ✅ PASS (core + residual) |
| **NET-2** | Quickplay join frozen cart / slow load | ✅ PASS ~3s driveable |
| **NET-MIG-3** | Freeze / ghost colliders after host migrate | ✅ PASS + live |
| **NET-PRES-1** | Fall/collision event-id dedupe | ✅ DONE (dup face; loss residual) |
| **NET-SD-1** | SD untie / sole-leader self-fall softlock | ✅ DONE |

Do not re-open these without new evidence — they are listed in STATUS's standing "Do not".

---

### July 21–31, 2026 – Tier A drain, Tier B/C feel, security sweep, analytics gating

Archived out of STATUS.md's active queue once closed (STATUS carries only live cards).
Live-at values are the deployed commit / Cloudflare Version at close.

| # | Work | Outcome |
|---|------|---------|
| **A1** | host hitch forensics | `hiddenDuringGap` latch shipped + validated (a real 6.55s tab-out caught cleanly) — instrumentation proven |
| **A1** | COUNTDOWN-WARM-1 fly-over camera shader/composer stall | ✅ PASS (Wyatt playtest 07-22) |
| **A1** | COUNTDOWN-SYNC-1 non-host countdown clock-domain sync | ✅ PASS (Wyatt playtest 07-22; empty-quickplay edge case logged to BACKLOG) |
| **A1** | Intel-as-host capture (original chronic-freeze question) | ✅ PASS (Wyatt confirmed 07-22) |
| **A1 / HOST-CAP-1** | weak-host warning residual (after HOST-ROLE-1) | ✅ **SHIPPED 08-01** — toast once when local is host and join-time `score < WEAK_HOST_WARN_SCORE` (50); neutral 50 never warns; latch clears on lose-host. Prod Version `76ebdc37` / HEAD `423008f`. |
| **BOOT-PERF-1** | selected-arena idle warm gen-cancel | ✅ **SHIPPED 08-01** — `ensureWorldBootstrapped(selected)` + gen retarget mid-flight; stale flight never latches done. Same deploy. `bootstrapIdleWarm.test.js` ×5. |
| **A2** | INPUT-KB-1 keyboard digital-to-analog ease + menu nav | ✅ confirmed good by Wyatt |
| **A3** | MP-FX-1 non-host gameplay VFX parity | ✅ PASS (Wyatt playtest 07-22: opponent charge glow + hop land dust/thud on non-host) |
| **A4** | ARENA-COL-1 Cart Rave pit KO detection & kill-zone reliability | ✅ PASS (Wyatt playtest 07-22 — rim entry pose/time → `buildKOEvent`) |
| **A5** | SRV-TEST-1 direct tests for party decision cores | ✅ done (A5a helpers + A5b DO harness; 739 tests at close) |
| **A6** | NET-SIM-1 reconnect / socket-lifecycle sims | ✅ closed (Cap-200 shipped + menu PASS; hostReload 13/13) |
| — | COUNTDOWN-ARM-1 play-ready-gated continuous `game_start` | ✅ PASS (Wyatt smoke 07-22 on `e08e5f5` — full 3-2-1) |
| **A7** | ANLX-VIEW-1 analytics reading surface (`analytics:pull` + CC panel) | ✅ PASS (Wyatt smoke 07-22) |
| **B2** | CARGO-WT-1 life-scoped grocery weight (boss/glass) | ✅ closed (Wyatt feel accept 07-22; look → CARGO-VIS-1) |
| **B3** | HIT-FEEL-1 hit feedback — weak normals + noisy incoming | ✅ PASS (Wyatt playtest 07-22) |
| — | ARENA-BAL-1 Sundial + Storerooms self-KO rate | ✅ closed (Wyatt 07-22, no code) |
| — | QA-STATUS-1 STATUS token overage broke `qa` | ✅ closed — 07-21 log archived, queue reordered |
| — | HYGIENE-1 4-item sweep | ✅ closed 07-30 — sourcemaps off · boot-error filter · 3 stale remotes deleted · profiler `--dpr`; default branch → `cart-clash` |
| **C2** | CARGO-VIS-1 full-bay fill + rim overflow look | ✅ closed (Wyatt prod playtest PASS 07-30 on `b13bafb`) |
| — | WARM-IGPU-1 first-play warm stall swallows countdown (medium iGPUs) | ✅ CLOSED — prod playtest PASS 07-30 on `a9dbc7d`. Solo residual = WARM-SOLO-1 ([plan](./warm-igpu-1.md)) |
| — | CARGO-HUD-1a cargo-readout mock, 3-state | ✅ closed 07-30 — nameplate placement + score-strip chip look |
| — | CARGO-HUD-1 opponent cargo readout on the nameplate | ✅ PASS (Wyatt 07-30) — live at `38d0dfc` / Version `f8e8da1f` ([card](./cargo-hud-1.md)) |
| — | SKYBOX-1 restore never-built `sceneExtras` skybox (review C-01) | ✅ closed 07-30 — live at `c074c2a` / Version `8e5bb259`; LOW tier-gated per Wyatt (`skyExtras` knob), UFO-in-pit bug fixed |
| — | SEC-BEACON-1 rate-limit the open POST beacons | ✅ CLOSED 07-30 — live at `65dea12` / Version `255d6284`. Per-IP 30/60s inside each log DO (budget per-DO, not shared). Live flood probe: 30 accepted, 429 at #31. Wyatt playtest PASS |
| — | SEC-UNLOCK-1 DEV-gate `?devUnlocks=all` (`=off` deliberately kept) | ✅ CLOSED 07-30 — live at `64eff60` / Version `56439ef4`, prod-verified |
| — | SEC-ROUTE-1 Worker `/api/*` routes `includes()` → exact `===` ×4 | ✅ CLOSED 07-30 — live at `8da2575` / Version `268f6ff2`, prod-verified. Also fixed a live 500: unmatched paths returned null from `fetch()` → now 404 |
| — | ANLX-ATTRACT-1 mid-round joins booked phantom matches | ✅ CLOSED 07-31 — live at `2e85f0b` / Version `4083335f`. Acceptance below |
| — | ANLX-BULK-1 short `loss` bulk poisoned product analytics | ✅ CLOSED 07-31 — tool-sourced / intentional-on-machine, not player-path. L1 `#summary` floor `MIN_MATCH_DURATION_MS=3000` + L2 client skip of short non-null `match_ended`. Tests: `analyticsGating` + `analyticsSummaryFloor` |
| — | SEC-TOKEN-1 admin tokens out of query params | ✅ CLOSED — `Authorization: Bearer` only via `party/adminAuth.ts` (`requireAdminToken`); query `?token=` rejected; pull tools send Bearer |
| — | CARGO-RACE-1 bay built empty if grocery GLTFs lose the load race | ✅ 07-30 — bays self-heal on init resolve (`createCargoBay` queues pre-init; `buildPool` populates). Cold-solo probe `[0,0,0,0]` → `[18,18,18,18]` PASS |
| — | SHEET-1 in-match contact-sheet tool | ✅ BUILT + PROVEN 07-31 — `npm run sheet` / `--all`; subject-is-HUD gate; residual gaps → FIGHT-VERIFY-1 ([sheet-1.md](./sheet-1.md)) |
| — | HUD-FEED-1 kill-feed row overflows its plate (narrow + landscape) | ✅ SHIPPED 07-31 — four commits ending `0b5369d` / Version `4cca79ca`. Portrait `min(78vw,320px)` + base `max-width:100%`; landscape ceiling 240→320. Wyatt playtest PASS portrait + landscape (BRIEFING 07-31) |
| — | MENU-HINT-1 menu hint bar scrolls over settings content | ✅ SHIPPED 07-31 — live at `7d2b840` / Version `a438b567`. `position:fixed` ≤1024 + live `--cr-hintbar-h` reserve + opaque bar bg. Wyatt playtest PASS |
| — | DIAG-DOC-1 docs claimed `__ccDiag.control` DEV-only / null in prod | ✅ CLOSED — comment/JSDoc + guides only. Control object: `DEV \|\| ?diag=1`; hub only when `?diag=1` |
| **B1** | AI-DIFF-1 NPC difficulty modes | ✅ shipped 07-22 (`49bfc2a`) — Medium baseline; Solo Easy default + menu; Quickplay Medium; Friends host pick |

**ANLX-ATTRACT-1 acceptance (07-31).** The agreed counting metric could not decide it: the
`<3 s` + `result=draw` cluster in the newest 1000 rows is 161 rows dated **07-20 (53) and
07-21 (108)** and **zero since 07-22** — it stopped growing eight days *before* the fix
deployed, and no multi-client quickplay traffic ran in between. `/api/analytics?view=list`
caps at the newest 1000 rows, so a low-traffic week makes that window read as "recent" when
it is stale. Closed instead on a live two-client probe against production on `2e85f0b`
(prod `?diag=1` → `__ccDiag.snapshot("analytics"|"round"|"net")`, `sink=beacon`):

| Signal | Result |
|---|---|
| Clients that adopted `phase=running` while unseated (`player_quit reason=joinRejected, phase=running`) | 2 → **zero `match_started`** |
| Transient phantom window (`running` + menu visible + `body=null`) | queue held at 1 (`session_start`); grew **only** when the cart body appeared |
| `match_started` emitted | 7, **every one carrying `joinedMidRound`** (6 `true`, 1 `false`) |
| `<3 s` + `draw` `match_ended` produced | 0 |

`joinedMidRound:true` is the discriminator — that prop is reachable only through the
participation latch (`emitStarted(true)` in `pollParticipation`); the un-gated phase-transition
path stamps `false`. Both halves hold: phantoms suppressed, real mid-round joins still counted.
Evidence rows `#34366`–`#34383` in the analytics ring (wiped by the subsequent DO reset).

---

### July 20, 2026 – NET-PRES-1 + NET-SD-1

| Work | Summary |
|------|---------|
| **NET-PRES-1** | Host stamps `eid` (`f{seq}.{i}` / `c{seq}.{i}`) on drained snapshot tails; non-hosts skip already-seen eids before KO reactors / collision FX. Module: `src/netcode/presentationDedupe.js`. Legacy 600ms victim + 250ms pair-key kept as fallback + NH-HIT echo. Loss-on-drop remains an unreliable-channel residual (score via `host_round`). |
| **NET-SD-1** | Sole-leader self-fall / untied wipeout crowns `pickSuddenDeathFallbackWinner` (best standing else second place). Suppress multi-way continue kept; tied wipeout still re-seats. |

---

### July 10–11, 2026 – Production Passes 2–5, stabilization & engine health

Compact record — the pass-by-pass index with commits lives in
[production-passes.md](./production-passes.md); long rationale in the
[decision log](../archive/decision-log-2026-07.md).

| Work | Landed as | Summary |
|------|-----------|---------|
| **Pass 2 — Performance** | `b79f277` (+ `fe923ab`) | 3-tier quality system (`qualityTiers.js`), Classic reflector/crowd cost work, mobile budgets, CPU alloc fixes. Plan archived: [production-pass-2-performance.md](../archive/session-notes/production-pass-2-performance.md) |
| **Pass 3 — UI/Presentation** | `7d37263`, `bdd33cc`, `ce737dd` | Sticker language on all menus/overlays, attract-mode arena menu, exit animations. Plan archived: [production-pass-3-ui.md](../archive/session-notes/production-pass-3-ui.md) |
| **Pass 3.2/3.3 — UX flow + density** | `d5c7f45`..`1b07515`, `5ed1b69` | Pause redesign, results rebalance, Friends overlay, discoverability, viewport-fit/touch/dvh |
| **Pass 4 — Gameplay/Combat/AI** | `73631e0` | Bot stall/latch fixes, proximity aggression, Sundial rim nav + podium contest, intensity ram SFX, hop/lip-assist gates (D-GP4-1) |
| **Pass 5 — VFX/Audio** | `043e793`, `7146d71`, `eb924af` | Grocery-spill juice + clatter, debris personality, cargo emissive, neon envMap, comeback callout, menu clicks, distinct Defeat screen, first-blood escalation, floor/edge + victory audio |
| **Stabilization pass** | `b9e8fb8`..`3754949` | Travel-based wheel roll, boost-bar leak fix, Zanzibar podium +20%, menu pacing ~700ms, grocery separation, clamp/lerp consolidation, dead config/code purge, knip zero-ignore, menu backdrop gradient (D-STAB-1/2) |
| **VFX-1 flicker root cause + fix** | `98317c1` | Confirmed on hardware: half-res *float* bloom mips (D-VFX-1/2). Per-arena pipeline: display-referred byte bloom on Storerooms (0 flicker), HDR elsewhere pending look check |
| **Netcode test punch list** | `1dbb48a`, `6ee9c0b` | `party/roundValidation.ts` + `party/hostSelection.ts` + `applyHostMigration` extracted and unit-tested (25+9 tests); P2P DataChannel frame/tail size gates (`p2pLimits.js`, 10 tests) |
| **Physics WASM** | `9d8a69e` → `8174180` | Rapier SIMD preferred, then reverted to **opt-in** after a game-breaking borrow error; standard build is the default |
| **Visual QA toolchain** | multiple | `npm run shoot`/`compare`/`blackframes`, `?blackmon=1`, `?rtmode=`, `?ablate=`, STATUS discipline ([visual-qa.md](../guides/visual-qa.md)) |
| **Debug panel** | `68a0cc8` | Tweakpane expanded: stats, camera, quality/level/rtmode, announcer |

Gate at the end of the run: `npm run qa` green — **285 tests / 28 files**, tsc clean, knip
clean (zero ignores). Pending validation (not shipped-quality yet): Wyatt playtest of
Passes 4/5 + stabilization + bloom A/B; two-browser NET-1 smoke.

---

### July 10, 2026 – Netcode connection lifecycle hardening

Stability pass on hybrid WebSocket + WebRTC netcode (architecture notes: [Game_Architecture.md](../reference/Game_Architecture.md) multiplayer section).

| Item | What landed |
|------|-------------|
| **Menu / session P2P teardown** | `disconnectPartySession()` calls `P2P.closeAllConnections()` so leave-to-menu does not leak RTCPeerConnections / DataChannels |
| **ICE disconnect grace** | `"disconnected"` waits 5 s before teardown; `"failed"` / `"closed"` immediate; timers cleared on recovery and `closeAllConnections` |
| **Mid-match P2P reconnect** | Host `maintainHostPeerConnections()` on keepalive — re-offer missing/dead/channel-down peers; cooldown + stuck-negotiation timeout in `CONFIG.net` |
| **Binary decoder bounds** | `decodeHostStateSnapshot` returns `null` on short buffers / `numCarts > 4` / payload shorter than cart count |
| **Reject-pending cleanup** | `#rejectPendingConn` only sends `joinRejected` + `close()`; `onClose` owns pending-picker / IP / slot cleanup |

**Tests:** `tests/netcode.test.js` (truncated/invalid binary), `tests/p2p-signaling.test.js` (ICE grace, maintain/reconnect, rate limit).  
**Deferred (not shipped):** historical remote rewind during CSP reconciliation; gating drive input on `hasSpilled` (VFX flag, not KO freeze).

---

### July 10, 2026 – Production regression audit (investigation only)

Focused bug sweep of Stability Pass 1 + uncommitted solo-polish tree (no feature work, no large refactors). Gate at audit: `npm run check` green — tsc, **174** Vitest tests, knip.

**Verified healthy / non-issues** (logged so they are not re-triaged as open defects) — full table in [project-state.md §5](./project-state.md#5-known-issues):

- SD fall-loop spectator guard (flagged spectators), music playlist rollover fix, lobby non-host leave → all-ready, customization hue partial-save, cart scale after shatter
- Solo rubberband double-gated (solo only); hop-land host broadcast suppress + prediction `onHopLand: null`; NPC hop host-only by design
- Living Store: CONFIG restore on SD/phase leave; snapshot `dir` self-heal
- First-solo load idle-warm suppress / level override (worst case = full rebuild)
- Product non-bugs: no near-edge ambient telegraph (hit vignette only); sunglasses tab 1.35× zoom is intentional; no “random arena rotation” feature

**Still open** (forward work stays on [ROADMAP.md](./ROADMAP.md) Phase 4): multi-way SD host-promote spectator reconstruction; promotion-before-SD-sync; Spill Bonus presentation host-only; SD mid-charge SFX; hop flags on respawn; rematch arena after migration; host tab rAF freeze; two-browser + visible-tab smoke.

---

### July 10, 2026 – Solo Polish Sprint (feel / load / bots)

Session notes: [solo-polish-2026-07-10.md](../archive/session-notes/solo-polish-2026-07-10.md).

Solo-first juice and bot depth (no post-FX/composer changes). Death-cam “follow killer” was attempted and **reverted** (regression).

| Item | What landed |
|------|-------------|
| **Spill Bonus presentation** | `onSpillBonusAward` in `directiveEngine.js` → float/feed in `main.js` / `hud.js` (host presentation path; multiplayer client float/feed still deferred) |
| **First-Solo load hardening** | Selected-level cold-load, idle-warm suppress, cart prefetch (`bootstrap.js` / `levelManager.js`) |
| **Directional hit vignette** | Where you were rammed from (cart-colored DOM wash) — `pulseLocalHitDirectionVignette`, `hud` edge-danger CSS, `src/utils/edgeDanger.js`, `CONFIG.ramming.fx.hitDirMinIntensity`. Near-edge ambient telegraph **cut** by product decision (not missing wiring). |
| **Solo AI rubberband** | `src/utils/soloRubberband.js` + `CONFIG.cart.ramBoost.soloRubberband`; wired in `getAiAxis` + NPC nitro commit (solo only) |
| **Hop landing SFX/VFX** | Rising-edge floor contact after hop → distinct thud + light dust; one-shot flags `hopAwaitingLand` / `hopAirborne`; prediction replay nulls FX; host suppresses floor broadcast on hop land |
| **NPC rare hop** | Host-sim only; threat dodge + near-edge juke; `CONFIG.cart.hop.npc`; `maybeTriggerNpcOpportunisticHop` + `isNpcNearHazardEdge` |

**Tests:** `tests/edgeDanger.test.js`, `tests/soloRubberband.test.js`, `tests/hopLanding.test.js` (+ engine / SD stubs). Suite size at later regression audit: **174** Vitest tests (`npm run check` green).

---

## Architecture Refactors (June–July 2026)

Narrative snapshot of the major refactors that shaped the current module structure. Detailed per-file entries live in the dated log below.

- `src/bootstrap.js` — menu → gameplay flow extracted from `main.js`
- `src/levelManager.js` — level preview + swapping extracted from `main.js`
- Knip cleanup: unused exports reduced and codebase hardened
- 100% Type safety achieved under `npx tsc --noEmit`
- CSS extraction: ~2600 lines of inline CSS moved from `hud.js`, `pauseOverlay.js`, `resultsOverlay.js` to dedicated stylesheets in `src/ui/styles/` (hud.css, pauseOverlay.css, results.css, global.css, later `tokens.css`)
- `.cursorrules` cleaned up (~200 lines removed, simplified guardrails)
- **WebRTC signaling root-cause fix**: host now creates the DataChannel offer to each peer (`ensureHostPeerConnections()` in the `MSG.slots` handler) — previously `createOffer` was unreachable (only non-host no-op callers), so no channel ever opened and P2P gameplay sync was fully inert. `tests/p2p-signaling.test.js` covers the full handshake.
- `main.js` remains the thin orchestrator and wiring hub
- **Production-readiness pass (July 7)** — see [audits/production-readiness-audit-2026-07.md](../archive/audits/production-readiness-audit-2026-07.md): Safari mp3 audio fallbacks, OG/Twitter meta + fixed PWA manifest, runtime error reporting (`installGlobalErrorReporting`), `src/utils/storage.js` key registry, `src/utils/device.js` shared touch detection, dead assets/config removed (~25 MB), `npm run check` baseline gate
- **Production value pass (July 7)** — see [audits/production-value-pass-2026-07.md](../archive/audits/production-value-pass-2026-07.md): 100-item ranked player-experience review; top 10 shipped
- **Announcer system — "The Store PA" (July 8)** — see [announcer.md](../reference/announcer.md): production-ready, data-driven announcer framework
- **Visual polish pass (July 8)** — see [audits/visual-audit.md](../archive/audits/visual-audit.md): targeted AAA-style rendering pass preserving the dark-arena + punchy-neon identity
- **Progression unlocks (July 9)** — lifetime gates for patterns, sunglasses, custom color, and levels (`unlockStore.js` / `unlockConfig.js`); dev unlock-all override for agents
- **Sundial Station flagship + arena elevation (July 9)** — Level 3 display name + presentation overhaul; Classic / Storerooms / Sundial polish
- **HUD redesign (July 9)** — center-stage events, design tokens, icon system, sticker scoreboard, touch HUD
- **Gameplay feel pass (July 9)** — juice, arena kill-zone scoring, match-point, haptics, remote FX parity
- **Boot/load + render perf (July 9–10)** — lazy game music, Draco-only cart models, half-res bloom, level prop LOD
- **Living Store (July 10)** — Living Cargo (cart = scoreboard) + PA directives (game-master mini-mutators); as-built [living-store.md](../reference/living-store.md)
- **Stability Pass 1 (July 10)** — seven root-cause fixes (`77d5a52`): Sudden Death fall-loop spectator guard (fake per-frame KO events could spam the feed/announcer and end SD early with a misattributed winner — solo and MP); spectator-flag re-derivation on host migration mid-SD; gameplay playlist fix (Howler never load()s a `preload:false` track — playlist died after track 1 and stayed dead all session) + track-index reset per match; `hideGameplayElements()` consolidated as the single gameplay-HUD hide (combo badge, boost meter, conn pill, feed — replaces `initMenu`'s inline block); customization partial-save no longer downgrades custom-hue to preset (the "sunglasses reset my color to magenta" bug); cart scale tween reset at shatter + canonical baseScale on respawn rebuild (carts permanently changing size); server re-checks all-ready when a *non-host* leaves/reaps (lobby stuck on READY!). 12 regression tests added (`customization`, `audioManager`, `gameFlowSuddenDeath`) — SD + music suites verified to fail against pre-fix code. Non-bugs documented, not changed: "random arena rotation" doesn't exist (feature, not bug); customize-tab "resize" is the deliberate 1.35× sunglasses camera zoom. Deferred follow-ups: ROADMAP Phase 4. **Re-confirmed healthy** in the July 10 regression audit (see entry above + [project-state §5](./project-state.md#5-known-issues)).

---

## Phase 4 Bug Fix Ledger

Compact record of Phase 4 fixes that were tracked as one-line items. Deeper writeups for each are in the dated log below where applicable.

| Item | Status |
|------|--------|
| Combo decay order-of-operations race fix | ✅ Fixed |
| Grocery spill pending queue (async load window) | ✅ Fixed |
| Server-authoritative level sync via MSG.round | ✅ Fixed |
| Slot kind nullish coalescing fix (human vs NPC label) | ✅ Fixed |
| Results UI cleanup (NEXT LEVEL removal, PLAY AGAIN rename) | ✅ Fixed |
| CargoBay visibility sync via hostTransform | ✅ Fixed |
| Non-host death shatter VFX wiring | ✅ Fixed |
| Booth snap at countdown (clean round reset) | ✅ Fixed |
| Mid-round join cart teleport (NPC→human) | ✅ Fixed |
| Rate limit exemption for high-freq messages | ✅ Fixed |
| Ram streak VFX on non-host clients | ✅ Fixed |
| hasSpilled state sync via hostTransform | ✅ Fixed |
| Remote boost instant VFX on non-host | ✅ Fixed |
| Kill feed color CSS hex conversion | ✅ Fixed |
| Shatter ref dual-path resolution (module + callback) | ✅ Fixed |
| Respawn visual cleanup (shatter debris + mesh rebuild) | ✅ Fixed |
| Respawn cleanup simplified to single cleanupShatter call | ✅ Fixed |
| Death shatter color hex parsing hardened | ✅ Fixed |
| Host respawn resets hasSpilled + cargoBay state | ✅ Fixed |
| cargoBay lookup by name (resilient getObjectByName) | ✅ Fixed |
| Scene bridge wiring (getSceneRef/getScene/getShatterRef) | ✅ Fixed |
| Shatter hex & 0xffffff bitmask clamping | ✅ Fixed |
| Netcode DRY refactor (applyCartState + serializeCartToWire) | ✅ Fixed |
| Pause/Esc overlay extracted to pauseOverlay.js | ✅ Fixed |
| @ts-expect-error cleanup (cartRaveGltf, cartThemes) | ✅ Fixed |
| Level select Zustand sync (menu + levelManager) | ✅ Fixed |
| Force-clear shatter state on respawn | ✅ Fixed |
| hud getter to avoid stale ref in context injection | ✅ Fixed |
| Null cart guard in updateRemoteCartNetTargets | ✅ Fixed |
| Boost state force-sync from wire (isRamBoosting/isBoosting) | ✅ Fixed |
| Slot 1 debug logging (send/receive state monitor) | ✅ Added |
| Self-contained shatter VFX lifecycle (isShatterAnimating + doRespawnRef) | ✅ Fixed |
| Audio controls extraction (audioControls.js, ~90 lines from main.js) | ✅ Fixed |
| Graphics toggles extraction (graphicsToggles.js, remove window globals) | ✅ Fixed |
| 100% typecheck compliance (0 errors under `npx tsc --noEmit`) | ✅ Verified |
| CSS extraction refactor (inline CSS → `src/ui/styles/`) | ✅ Fixed |
| WebRTC signaling: host initiates DataChannel offer (`ensureHostPeerConnections`) — restores P2P sync | ✅ Fixed |
| P2P signaling test coverage (`tests/p2p-signaling.test.js`) | ✅ Added |
| Signaling runtime validation (host→peer: DataChannel OPEN + 426 binary snapshots streamed) | ✅ Verified |

---

## Chronological Log

### July 10, 2026 – Living Store (Cargo + PA Directives) + Render LOD

As-built reference: [living-store.md](../reference/living-store.md). Deferred multiplayer checks: [living-store-test-plan.md](./living-store-test-plan.md).

**Living Cargo** (`03edc7c` + hardening)
- `src/cargoLoad.js` reconciles host-synced round scores → bay fill + handling (ticked from `frameVisuals`).
- Bay fills **2→12** groceries toward `CONFIG.cargo.fullScore` (8) so standings read off the field.
- Surviving a spill: ~2.6s **"empty cart is a fast cart"** comeback buff (`armSpillBoost`); `count` on `MSG.spill`; never stacks with nitro.
- Top-heavy grip slide at fullness; bigger mess on spill. CoM-raise taste-gated **off**. PA: `cart_overflow` / `spill_rush`. DEV: `window.__cartClashCargo()`.

**PA Directives — Store PA as game-master** (`b7ceeb2`, `70a737b`, `e2dea5c`)
- `src/directives/directives.js` data table + `directiveEngine.js` host scheduler (slots ~20s/55s/90s ± jitter, 18s windows, quiet last 30s, no SD, no back-to-back repeats, silent expiry).
- Five launch directives: **Flash Sale** (ram ×1.5), **Double Bag** (KO ×2), **Express Lane** (faster boost charge), **Spill Bonus** (+1 per forced grocery spill), **Rush Hour** (base drive speed/accel up, nitro keeps headroom).
- Net: one-shot `MSG.directive` + snapshot-tail self-heal `dir:{id,r}`; KO mul via `buildKOEvent` dep; CONFIG apply/restore on expiry / phase exit / SD.
- Presentation: critical + **focus** callouts (5.2s hold, suppress other non-critical PA); HUD `.hud-directive` chip under timer; regular callouts 25% smaller.
- Review harden: sudden_death focus collateral fixed; focus ends on interrupt; phase-exit restore without rAF; `reward.multiplier` = combo × directive; 13 engine tests.

**Follow-up shipped (July 10 solo polish):** Spill Bonus now has dedicated float/feed presentation via `onSpillBonusAward` (see session note above).

**Render / fill-rate**
- Half-res UnrealBloom RTs (`CONFIG.postFx.bloomHalfRes`, strength compensated).
- Distance-cull non-gameplay Storerooms/Sundial props via `src/utils/levelLod.js` (+ `tests/levelLod.test.js`).
- Stepped expensive Sundial seascape decor updates.
- Green-booth bloom overexposure tamed (luma-weighted emissive fix).

Session plans for related July 9 work live under [archive/session-notes/](../archive/session-notes/).

### July 9, 2026 – HUD Redesign + Art Direction + Motion Slap

Full session notes: [hud-redesign](../archive/session-notes/hud-redesign-2026-07-09.md), [hud-art-direction](../archive/session-notes/hud-art-direction-2026-07-09.md).

- **Design tokens** — `src/ui/styles/tokens.css` (import from JS only; CSS `@import` breaks under rolldown-vite path rules).
- **Center Stage** — `src/ui/centerStage.js` arbitrates stage-band moments (announcer > toast queue).
- **Icons** — `src/ui/icons.js` inline-SVG glyph set; emoji crowns/notes retired on HUD.
- **Regions** — match / standings / events / stage / pod / utility; dedicated `#hud.hud-touch` mobile layout.
- Sticker scoreboard chips, Bungee timer, expanded kill-feed verbs, personality icons (replacing letter badges), host antenna glyph, RECONNECTING pill via `netcode.getConnectionState()`.
- Art-direction polish + motion slap pass (countdown stamp, KO chip dizzy stars, nametags under HUD, UX fixes).

### July 9, 2026 – Gameplay Production-Value Pass (Feel / Pacing / Synergy)

Full session notes: [gameplay-production-value-pass](../archive/session-notes/gameplay-production-value-pass-2026-07-09.md).

- Victim-side hit feedback parity (host + non-host); water-death audio; GO! FOV kick; haptics (`src/haptics.js`).
- Remote boost/hop FX + hop wire producer; squash & stretch; music ducking under big PA / kill confirms.
- Score-breakdown float; leader crown + rampage pips; near-miss `close_call`; Match Point status; friends rematch auto-countdown.
- Presentation hit-stop (~80ms render-side only); arena KO flash re-enabled at reduced strength; Sudden Death ambient hue; Classic crowd cheers.
- **Arena kill-zone scoring:** Storerooms corner voids base 2; Sundial high-ground +1 when ram from podium.

### July 9, 2026 – Charge Glow, Match Stats, Auto-Quality

- 3D boost-charge telegraph on the cart; menu level preview LOD with full rebuild on play.
- `src/scoring/matchStats.js` + `matchStatsReactor` — per-match KO/death/combo spine and results superlatives.
- Session auto-quality watchdog (`src/utils/autoQuality.js` / `qualityMode.js`).

### July 9, 2026 – Sundial Station Flagship + Arena Elevation

Full session notes: [plan-zanzibar-overhaul](../archive/session-notes/plan-zanzibar-overhaul.md).

- Level 3 **display name** → **Sundial Station** (level id stays `zanzibar`; see [brand.md](../brand.md)).
- Flagship overhaul: cuboid deck stability, warm-amber center accents, alien skyline, gas-giant/moon, water death FX.
- Follow-up **arena elevation** pass across all three levels: Classic reflective vinyl + pit/sky/booths; Storerooms liminal floor storytelling + unique hole beats; Sundial golden-hour seascape/hologram polish.
- Classic stadium seating / grocery spill polish; Storerooms boot crash + VHS tuning restore.

### July 9, 2026 – Progression Unlocks, Patterns, Boot/Load, Fonts

- **Lifetime unlocks** — `src/stores/unlockStore.js` + `src/unlockConfig.js`: patterns, sunglasses, custom color, levels (e.g. Storerooms after Classic KOs, Sundial after Storerooms KOs). Tab mute when document hidden. Dev unlock-all default under Vite (`CartClashDevUnlocks` / `?devUnlocks=`).
- **Cart patterns** — pattern picker reinstated on cartrave4 body; **Bolt** 6th pattern (forking lightning). Guide: [cart-pattern-reuv.md](../guides/cart-pattern-reuv.md).
- **Boot/load** — lazy in-match music; Worker Cache-Control for hashed bundles/media; grocery pool warm across swaps; Draco-only cart models in `public/` (masters under `art/`); idle-warm Rapier + default arena on menu. Audit: [boot-load-assets-2026-07.md](../archive/audits/boot-load-assets-2026-07.md).
- **Fonts** — self-host latin UI fonts under `public/fonts/`; drop Google Fonts CDN. Refresh: `npm run fonts:fetch`.

### July 9, 2026 – Docs Hygiene + Open Flicker Plan

- Docs reorganized earlier (July 8); July 9–10: post-FX black-frame handover + flicker/Classic audit plan (both since resolved and archived: [plan-flicker-fix-and-classic-audit.md](../archive/session-notes/plan-flicker-fix-and-classic-audit.md), [handover-postfx-black-frames.md](../archive/session-notes/handover-postfx-black-frames.md)).
- Debt clean: recovery bak trees dropped; shipped session notes moved to [archive/session-notes/](../archive/session-notes/); knip back to zero new findings.

### July 8, 2026 – Visual Polish Pass (Three.js Rendering)

Targeted AAA-style rendering pass on the existing Cart Rave presentation — no gameplay changes, no arena redesign, full customization contract preserved. Full audit + round-by-round record in [docs/archive/audits/visual-audit.md](../archive/audits/visual-audit.md). Owner steered the pass through three feedback rounds; final look is deliberately dark with restrained bloom (dark arena + punchy neon is the identity, not a "bright arcade" brief).

**Global rendering**
- Exposure retuned 0.88 → 0.62 → 0.46 → **0.40** across three "still too bright" rounds; bloom strength 0.67 → **0.34**, threshold 0.86 → **0.76**, `smoothWidth` widened to 0.14 (also fixed a latent Rec.709-luma bug where magenta neon at luma 0.29 never crossed the old 0.86 cutoff while cyan at 0.79 did).
- Fog hexes retuned in the corrected pipeline (colors now display as authored — previously rendered darker via the missing sRGB encode).

**M-tier arena/effect work**
- **Kill-confirm layered feedback (M3)**: softened FOV punch (9°/180ms; ram hits stay 8°/100ms via a `Math.max` `armFovPunch` helper so overlaps never truncate) + center-weighted white flash via a **new `uFlash` uniform on the Arcade FX shader pass** + aberration/vignette pulse. All decays run on cheap uniform writes each frame.
- **Zanzibar directional blob-shadow bias (M4)**: `CONFIG.contactShadows.directionalBias.zanzibar = { x: 0.27, z: -0.22 }` offsets cart blobs away from the sun; overhead-lit arenas keep centered blobs; footprint sampling still uses the true cart position. Level identified via the existing octagon-hazards flag (no new level-tracking path).
- **Backrooms cart-contrast rim light (M5)**: one steel-blue (`0x7a8fc0`) `DirectionalLight` @ 0.2 raking near-grazing across the play space — carts and the furniture pile pick up a faint cool edge without lifting the carpet.
- **Classic pit + backdrop dressing (M6)**: pit-wall vertex-color gradient eased `t^2.6` on 24 height segments with a violet rim band + **5 additive depth rings** at decreasing brightness down the shaft; horizon-fog cylinder color now reads from `CONFIG.postFx.fog.color`; starfield gained distance-based brightness tiers; faint violet horizon glow band added.
- **Zanzibar horizon + islands (M7)**: sky-gradient bottom stops and sun-halo color realigned to the retuned `0xff5a22` fog hex. Islands rebuilt from three flat cutouts into **two-layer atmospheric-perspective silhouettes** (3 clusters, 2 layers each, 4 hand-picked tones) that now take scene fog and inherit the exact same ember haze the ocean fades into.

**Cart material system (R-tier, full customization contract preserved)**
- **R2 — pattern overlay → in-material shader mask (`src/cartPatterns.js`)**: replaced the coplanar `CartFramePattern` duplicate mesh (polygonOffset hack, doubled draw of the heaviest cart mesh) with an `onBeforeCompile` mask injection on the CartFrame's own `MeshPhysicalMaterial`. Uniforms: `uPatternMask`, `uPatternRepeat`, `uPatternStrength`, `uPatternTint`, `uPatternEmissive`. `material.customProgramCacheKey = "cartPattern:0|1"` — switching between two non-classic patterns swaps a texture uniform without a shader recompile; only classic↔patterned flips recompile. Injected chunks modulate (never replace) the standard color/emissive pipeline, so per-frame recolor / leader-glow / boost-pulse still work.
- **R3 — dedicated emissive wire mask (`src/cartRaveGltf.js`)**: body role no longer reuses its own albedo as `emissiveMap` — a grayscale wire mask is now generated once per source-texture uuid (`buildRaveGltfWireEmissiveMask`, cached in `_wireEmissiveMaskCache`) by threshold-ramping the albedo's channel-max brightness (smoothstep 0.45 → 0.7). Fallback to the previous albedo-reuse behavior on unsupported texture types.
- **Preservation guarantees held**: `frameMats`/`frameBodyMats`/`accentMats`/`frameGlowMats` cache arrays, every `userData` gate, and the `rebuildCartVisualsIntoRoot` shatter-rebuild path all still work.
- R1 (wheel decimation) and R4 (theme variety) declined by owner.

**Grocery cargo clipping fix (`src/effects/groceryPool.js`)**
- `createCargoBay` was placing items by center point only — bottoms sank through the basket floor and edge items poked through the sides. Each item now measures its bounding-sphere radius, insets the XZ spread from the walls, and sets its rest height off the floor.

**Verification**
- `npm run check` green (0 TS errors, 61/61 tests, 0 knip findings) after every stage.
- Verified in-browser on all three arenas via preview screenshots.

### July 8, 2026 – Announcer System ("The Store PA")

Production-ready announcer framework designed and built for the Steam demo push. Creative direction: a supermarket tannoy hijacked by the rave's MC — retail-flavored callouts (FIRST SPILL, REFUND, CLEAN-UP ON AISLE, BUY ONE GET ONE) instead of generic arena-shooter vocabulary. No AI voice clips or placeholder dialogue — polished procedural stings + visual callouts stand in until real recordings land, via a fully data-driven voice pipeline.

**Architecture** (`src/announcer/`):
- `announcerManager.js` — the single arbitration entry point (`announce(eventId, data)`). Owns every rule about whether/when an announcement plays: single channel with a 1.2s minimum gap; `sequence`-class events (countdown/GO) bypass the gap and are never queued; `critical`-class events (Sudden Death, victory/defeat) interrupt and flush the queue; other interrupts require priority ≥ active+20 on an interruptible event; a 2-slot priority queue with per-event TTL, dedupe, and eviction; `ambient`-class events (close_call) only play into silence; a 450ms kill-burst merge collapses pile-ups into one line; `comeback` swallows a simultaneous `new_leader`.
- `announcerEvents.js` — frozen data table (priority, cooldown, once/max-per-round, chance, callout config, voice-asset manifest) for 19 events.
- `announcerLines.js` — localization-ready subtitle lines with `{attacker}`/`{victim}`/`{leader}`/`{aisle}` token substitution.
- `announcerStings.js` — 15 procedural WebAudio stings in the existing `sfxSynth.js` `spawnTone` idiom.
- `announcerDirector.js` — pure game-state observer. Subscribes to `gameStore` for round-phase transitions and score changes; derives events by observing existing state, then calls `announce()`. Runs identically on host and non-host: kill events reach every client through the existing `falls[]` snapshot tail, so zero netcode changes were needed.
- `src/ui/announcerDisplay.js` + `src/ui/styles/announcer.css` — neon callout banner + `aria-live="polite"` region for screen reader access.

**Integration** — every hook is purely additive; no gameplay, scoring, or protocol changes:
- Host fall hook in `gameFlow.js`; non-host mirror in the `falls[]` replay path in `netcode.js`; both converge on `announcerDirectorOnFall`.
- `hud.js` countdown/GO/Sudden-Death/final-10s ticks now route through `announce()`.
- `main.js` wires init, presenter, local big-hit → close_call hook, and victory/defeat at the podium.
- Pause overlay gained an ◇ ANNOUNCER section (ANNOUNCER + CALLOUTS toggles, gamepad-navigable), persisted via `settingsStore`.
- `sfxSynth.js`'s victory fanfare / defeat sting / Sudden Death sting were retired in favor of announcer-owned equivalents.

**Voice pipeline** (documented in [docs/reference/announcer.md](../reference/announcer.md)) — drop `public/sounds/announcer/<locale>/<eventId>_<NN>.ogg|.mp3`, register with Howler, call `registerAnnouncerVoicePack`. Fallback chain: voice variant → sting → silent-with-subtitle.

**Validation** — `npm run check` green (0 TS errors, 61/61 tests including 29 new arbitration tests, 0 knip findings). Verified end-to-end in-browser against the live initialized singletons.

### July 7, 2026 – Production Value Pass (Top-10 Player-Experience Improvements)

Creative-direction review of every player-facing surface; full 100-item ranked report in [docs/archive/audits/production-value-pass-2026-07.md](../archive/audits/production-value-pass-2026-07.md). Constraint: no multiplayer-architecture or core-gameplay changes. The 10 highest-impact items shipped:

1. **Attacker kill-confirm feedback** — procedural confirm sting + center-screen hitmarker + FOV punch on every KO, via a new presentation-only `onLocalKillConfirm` callback fired from `gameFlow.js` (host) and the `falls[]` replay path in `netcode.js` (non-host).
2. **Victory presentation** — procedural victory fanfare (local winner) / defeat sting (everyone else) + winner-colored canvas confetti burst at the podium.
3. **Final-10-seconds urgency** — timer turns red and pulses with a per-second procedural tick (pitch rises in the last 3s); suppressed during Sudden Death.
4. **Sudden Death entry sting** — dissonant drone+stab cue on the rising edge, on all clients.
5. **Boost charge meter** — bottom-center HUD bar for keyboard/gamepad, driven by the locally simulated cart each frame.
6. **Damage-taken impact pulse** — vignette + chromatic-aberration kick on hard local hits via the arcade post-FX pass.
7. **First-run HOW TO PLAY overlay** — auto-opens once (storage-gated, skipped when joining via invite link), input-mode-aware controls copy.
8. **Brand cohesion** — rotate prompt no longer calls the game "Cart Rave".
9. **Mobile landscape fixes** — kill feed no longer collides with the audio panel; pause overlay AUDIO/CONTROLS sections now scroll instead of overlapping.
10. **Challenges feedback loop** — overlay copy no longer promises nonexistent XP; in-match "CHALLENGE COMPLETE" HUD toast + sparkle sting; "✓N" completed-count chip on the menu CHALLENGES button.

New module `src/sfxSynth.js` (procedural sting synthesizer). **Validation:** `npm run check` green, production build passes, full runtime loop verified in-browser.

### July 7, 2026 – WebRTC Signaling Root-Cause Fix (Multiplayer Restored)

**Root cause of "multiplayer broken after the WebRTC migration"** — Verified (runtime + tests).
- After the P2P migration, lobby/join/host-election (all WebSocket) kept working, but **no WebRTC DataChannel ever opened**: remote carts never moved, host authority was invisible, and non-host collisions never reached the host.
- **The bug:** `createOffer()` was statically unreachable. The only offer/DataChannel creator, `initiateP2PConnection()` (`src/netcode/p2p.js`), is host-gated (`if (!isHost) return`). But its only two call sites — the `MSG.hello` and `MSG.hostMigrated` handlers — are **non-host-guarded** (`youConnId !== hostId`, `!nextIsHost`), so a non-host calling it hits the host guard and returns immediately. The host had **no call site at all**.
- **Intended design (per docs): the host is the offerer** ("Host creates a DataChannel per non-host peer"); non-hosts answer via `ondatachannel`.

**The fix (`src/netcode.js`)** — smallest correct change.
- Added `ensureHostPeerConnections()`: host-only helper that iterates `netSlots` and calls `P2P.initiateP2PConnection(connId)` for every human peer whose `connId !== youConnId`. Idempotent.
- Invoked once, from the `MSG.slots` handler (after `netSlots = merged`). The server rebroadcasts `MSG.slots` on every join and after host departure, so this single call site covers both new-peer connection **and** the new host connecting to all survivors after migration.

**Validation** — Verified.
- **Runtime:** host created and sent `sdp_offer` → ICE `connected` → DataChannel open → host streamed **426 binary snapshots (248 bytes each, ≈40 Hz)** to the peer.
- **Tests (`tests/p2p-signaling.test.js`):** host reaches `createOffer` + emits `sdp_offer`; non-host answers with `sdp_answer` + wires `ondatachannel`; DataChannel open → binary `onmessage` → dispatch → `netStateBuffer`.

### July 7, 2026 – Production-Readiness Audit & Top-10 Fixes

Full-codebase audit; report with all 50 ranked improvements in [docs/archive/audits/production-readiness-audit-2026-07.md](../archive/audits/production-readiness-audit-2026-07.md). The 10 highest-impact, safe items were implemented:

1. **Safari/iOS audio fix (highest player impact)** — every sound loaded as `.ogg` only, so the game was **silent on all Safari/iOS devices**. `audioManager.js` `loadMenuMusic` / `setGamePlaylist` / `registerSfx` now accept `[ogg, mp3]` arrays. Generated `.mp3` fallbacks for the 10 referenced SFX (~385 KB). `index.html` menu preload now feature-detects Ogg support.
2. **Dead audio purged (~6 MB)** — removed `.wav` masters (Death.wav alone was 3.8 MB) and unreferenced `Wheel.*` trio.
3. **TypeScript baseline restored** — 2 `Element.blur` errors in `cart-rave-menu.js` fixed.
4. **PWA manifest fixed** — `site.webmanifest` had empty `name`/`short_name` and white theme colors; now "Cart Clash" with the dark neon palette.
5. **Social link previews** — invite links unfurled blank; added Open Graph + Twitter Card tags.
6. **Runtime error reporting** — `errorReporter.js` now installs global `error`/`unhandledrejection` handlers with per-message dedupe and a 20-report session cap.
7. **Centralized storage** — new `src/utils/storage.js` with a `STORAGE_KEYS` registry (all 14 `cartRave*` keys). `"cartRaveLevel"` had been independently redefined in three files.
8. **Dead exports removed** — all 10 knip-flagged unused exports across `audioManager.js`, `gameState.js`, `entities.js`, `input.js`.
9. **Shared device detection** — new `src/utils/device.js` (`isTouchLikeDevice`) removes the copy-pasted touch check that `settingsStore.js` duplicated from `utils.js`.
10. **Repo hygiene + tooling** — removed stale `vercel.json`, `dev-server.py`, `partykit*.json`, git-tracked `.tmp-gltf-imgs/`. Added `npm run check` (typecheck + test + knip).

**Validation** — `npm run check` green, production build succeeds, booted in-browser with zero console errors.

### July 6, 2026 – Dead Code Removal, Protocol Cleanup & Cross-Transport Safety

**1. Major Dead Code Removal (~250 lines)** — Verified.
- **Server validators** (`party/index.ts`, ~183 lines removed): Removed the dead `MSG.hostEventCollision` / `MSG.hostEventFall` relay handlers and their now-unused helpers. Collisions and falls now travel in the binary snapshot's JSON tail, authored by the host and replayed on non-host clients, never touching the server.
- **`reconcilePredictedLocalCart`** (`src/netcode.js`): Full removal. Reconciliation is now fully rewind-and-replay inline in `gameLoop.js`.
- **`inputSendTimer` / `startInputSendLoop` / `stopInputSendLoop`** (`src/netcode.js`): Non-host input is now sampled synchronously in the physics loop via `sampleLocalInputForTick()`.
- **`configureP2P` / `getPeerConnections` / `getDataChannels`** (`src/netcode/p2p.js`): Removed unused re-exports.

**2. Shared NPC Name Pool (`shared/npcNames.js` — new module)** — Verified.
- Extracted the 40-name NPC list from both `party/index.ts` and `src/npcNames.js` into `shared/npcNames.js`.

**3. Protocol MSG Reorganization (`shared/protocol.js`)** — Verified.
- Message constants reorganized into three labeled sections: Client→Server (WebSocket control plane), Host↔Client (WebRTC DataChannel gameplay plane), Server→Client (WebSocket control plane).
- `hostAssigned` and `state` removed entirely. `spill` is no longer a server→client relay — spills travel fully peer-to-peer.

**4. Cross-Transport Stale-Host Packet Guard (`src/netcode.js`, `src/netcode/p2p.js`)** — Verified.
- `handleP2PMessage` now accepts a `fromConnId` parameter and rejects snapshots where `fromConnId !== hostId`. WebRTC DataChannels are unordered/unreliable, while `MSG.hostMigrated` arrives on the ordered WebSocket — rejecting by source connId prevents this race from poisoning the freshly-cleared snapshot buffer.

**5. Slots Accepted Verbatim from Server** — Server owns slot colors. Clients now accept `MSG.slots` verbatim instead of calling `declashNpcSlotColors` locally.

**6. Binary Decoder Protocol Constant Fix (`src/netcode/binary.js`)** — Verified.
- `decodeHostStateSnapshot` was stamping the hardcoded string `"hostTransform"`, which does not equal `MSG.hostTransform` (`"host_transform"`). **Every binary snapshot was silently dropped** — the `netStateBuffer` never received a single frame from the binary path since it was introduced.

**7. Interpolation Helper Extraction** — Extracted `lerpVec3Pair` and `slerpQuatPair`, eliminating ~40 lines of duplicated lerp/slerp logic.

**8. `broadcastHostTransform` Binary Encoding** — Now uses `encodeHostStateSnapshot` instead of JSON.

**9. Non-Host JSON Dispatch Fix (`src/netcode/p2p.js`)** — Non-host `onmessage` was filtering JSON frames to `MSG.hostTransform` only, silently dropping `MSG.spill` events.

**10. Monotonic Clock Consistency** — Host migration freeze deadline now uses `getMonotonicNow()` instead of `Date.now()`.

**11. End-to-End Binary Dispatch Tests** — New test hook `dispatchP2P(data, fromConnId)` drives the exact runtime path.

### July 6, 2026 – Worker ASSETS Fallback & Rigid Body Double-Free Guards

**1. Worker ASSETS Fallback (`party/index.ts`)** — Verified.
- The Worker's `fetch` handler now falls through to `env.ASSETS.fetch(request)` for non-PartyKit URLs. This allows a single Cloudflare Worker to serve both Durable Object traffic and static assets.

**2. Rigid Body Double-Free Guards (`src/arena.js`, `src/levels/backroomsSupermarket.js`, `src/levels/testArena.js`, `src/levels/zanzibarPlatform.js`)** — Verified.
- All `world.removeRigidBody(body)` calls guarded with `world.getRigidBody(body.handle)` before removal. Prevents Rapier panics when `dispose()` is called on a world where bodies were already cleaned up.

### July 6, 2026 – NaN/Infinity Guards for Binary Serialization & applyCartState

**1. Binary Decode Safety (`src/netcode/binary.js`)** — Added `getSafeFloat32` helper. All 14 `view.getFloat32()` calls in `decodeHostStateSnapshot` now use it, preventing NaN/Infinity from corrupt binary data propagating into the physics engine.

**2. `applyCartState` Bounds Validation (`src/netcode.js`)** — All body writes and net-target writes now gate on `Number.isFinite()` for every float component. A corrupt snapshot leaves the Rapier body and interpolation targets completely untouched.

### July 6, 2026 – Binary Host State Serialization, Input Loop Refactor & Server Fixes

**1. Binary Host State Serialization (`src/netcode/binary.js` — new module)** — Verified.
- Introduced hybrid binary encoding for the `hostTransform` payload.
- Per-cart data packed into a fixed 52-byte layout: position, quaternion, linear velocity, ackSeq, and 1 byte of bit-packed flags (boost, hop, cargoBay, hasSpilled).
- 12-byte header. JSON tail appended for sparse data (collisions, falls).
- **Bandwidth reduction**: A typical 4-cart snapshot drops from ~600–800 bytes of JSON to ~220 bytes.

**2. Input Sampling Moved to Physics Loop** — Verified.
- `startInputSendLoop()` (setInterval-based, 60Hz) is now a no-op. Input capture moved to synchronous `sampleLocalInputForTick()`.
- Eliminates the ~50ms average latency of the old setInterval approach.

**3. Server Fixes (`party/index.ts`)** — Verified.
- **Reaper `lastSeen` default**: Changed `?? now` to `?? 0`. New connections whose timestamp write hadn't yet propagated were being instantly reaped.
- **Host migration message type**: `MSG.hostAssigned` → `MSG.hostMigrated`.
- **Spill relay removed**: `MSG.spill` handler deleted from server.

**4. Deterministic Physics Timestamps (`src/simulation.js`)** — `applyRammingImpulse` and `processCollisionEvents` now receive `nowMs` from the physics step's deterministic clock.

**5. P2P ArrayBuffer Routing (`src/netcode/p2p.js`)** — `setupDataChannel` `onmessage` now detects `ArrayBuffer` and routes to `onStateCallback` directly, bypassing JSON parse.

### July 6, 2026 – Empty Slot Cart Body Fix & Visual Sync Clock

**1. Empty Slot Cart Body Fix (`src/entities.js`, `src/main.js`)** — Now always creates a cart for all 4 slots. Empty slots get `mesh.visible = false` and `body.setEnabled(false)`.

**2. Scene Update Clock Synchronization (`src/main.js`)** — All `Effects.update*` calls, `sceneExtras.update`, `levelUpdate`, spindle light cycle, and booth neon cycle now use `syncedNow` — the server-clock-corrected time — keeping visual phases synchronized across all clients.

### July 6, 2026 – Client Prediction Rewrite & Monotonic Clock

**1. Client-Side Prediction Rewrite: Rewind & Replay (`src/gameLoop.js`, `src/netcode.js`, `src/simulation.js`)** — Verified.
- Replaced the old `reconcilePredictedLocalCart` (soft lerp correction) with a full rewind-and-replay prediction model.
- On each new authoritative snapshot: hard-snap local cart body to host state → replay all pending inputs through `runFixedPhysicsStep` with disabled side effects → cart ends at locally predicted position, eliminating the soft-correction pop.
- Pending input buffer (`pendingInputs[]`) introduced with `getPendingInputs()`, `prunePendingInputs(ackSeq)`, and `getLatestSnap()` exports.
- Host tracks `hostLastProcessedInputSeq` per connection and includes `ackSeq` in per-cart snapshots.

**2. Monotonic Clock Adoption (`party/index.ts`, `src/netcode.js`)** — Replaced `Date.now()` with `getMonotonicNow()` (`performance.timeOrigin + performance.now()`) in the server and all netcode timekeeping paths.

**3. Host Fall Event Batching (`src/gameFlow.js`, `src/netcode.js`)** — Fall events now queued via `queueHostFallEvent()` and drained in batch with the next `hostTransform` broadcast.

**4. WebRTC P2P Latency Improvements (`src/netcode/p2p.js`)** — DataChannel now created with `{ ordered: false, maxRetransmits: 0 }` for lowest-latency unordered delivery.

### July 5, 2026 – WebRTC P2P DataChannel Migration

**Major architectural change** that moves real-time game data off the server WebSocket relay and onto direct peer-to-peer WebRTC DataChannels. The PartyKit/partyserver server is now a lightweight signaling relay + lobby manager.

**1. New P2P Module (`src/netcode/p2p.js`)** — Manages RTCPeerConnection lifecycle, DataChannel setup, ICE/TURN negotiation, and SDP offer/answer exchange. Host creates a DataChannel per non-host peer. Input buffering: if DataChannel is not yet open, the latest input frame is queued and flushed on `onopen`.

**2. Server Reduced to Signaling Relay (`party/index.ts`)** — Removed hostTransform relay, clientInput relay, spill relay, and MSG.state broadcast — all now P2P. Server retains: lobby management, color picking, ready-up, round lifecycle, host migration, and connection reaping. **[Corrected July 6]** The `hostEventFall`/`hostEventCollision` kill-feed relays were later removed. Added Cloudflare Calls TURN credential minting.

**3. Protocol Expansion (`shared/protocol.js`)** — 5 new message types: `requestTurnCredentials`, `turnCredentials`, `sdpOffer`, `sdpAnswer`, `iceCandidate`.

**4. Netcode Rewiring (`src/netcode.js`)** — `MSG.hello` handler: inits P2P, requests TURN credentials. **[Corrected July 7]** The original design had the non-host call `initiateP2PConnection(hostId)` here, but that function is host-gated, so **no offer was ever created — the DataChannel never opened**. The host is the offerer: fixed July 7.

**5. Spill Netcode Switch (`src/main.js`)** — `triggerSpillNetcode()` now calls `Netcode.sendP2PEvent()` instead of `partySocket.send()`.

**6. Defensive Null Guards** — `if (scene) scene.remove(root)` guards, `if (world && recordBody)` guards on all `world.removeRigidBody` calls across all level files.

**7. Backrooms Physics Fix** — Changed floor colliders from `RAPIER.ColliderDesc.cuboid` → `RAPIER.ColliderDesc.roundCuboid` with 0.15 border radius. Prevents carts from catching on sharp 90-degree lips when hopping over the corner voids.

### July 5, 2026 – Web Fonts, Kill Feed Variety & UI Polish

**1. Web Font Fix (index.html)** — Bungee and Space Mono were referenced in CSS but not present in the Google Fonts `<link>`, causing fallback to system fonts (Comic Sans / Courier on Windows).

**2. Self-Death Verb Variety (hud.js, gameFlow.js, party/index.ts)** — `pickSelfDeathVerb()` added with 6 randomized verbs ("FELL OFF", "ATE PAVEMENT", "TAPPED OUT", "SELF-DESTRUCTED", "NOPED OUT", "RAGE QUIT"). Server `ALLOWED_FALL_VERBS` set updated to match.

**3. Results Overlay Responsive Sizing (resultsOverlay.js)** — Score name/value font-sizes now use `clamp()`. Match history section overflow: `hidden` → `auto`.

**4. TEST DRIVE Button Removal** — Removed unused TEST DRIVE button from menu markup, CSS, and JS click handler.

### July 5, 2026 – Mobile Responsive CSS Fixes

Diagnosed and fixed 7 mobile layout issues from phone screenshots.

**Portrait fixes:**
- **Results history box empty void**: `flex: 0 1 auto; max-height: 30vh` on `.results-history`, capping flex-grow expansion.
- **FPS counter z-index overlap**: FPS canvas `z-index` reduced from `99999` to `100`.
- **Level card text overflow**: Level card grid switches from 3 columns to 2 columns at ≤480px portrait.
- **Challenges panel top-edge clip**: Added `scroll-padding-top` and `scroll-margin-top`.
- **Level button padding & font**: Tighter padding and `clamp()`-based font-size.
- **Results history font-size/line-height**: `clamp(12px, 3.4vw, 14px)` font-size and `line-height: 1.55`.

### July 5, 2026 – Camera Framing & Menu Stats Extraction

**1. Camera Framing & Viewport Extraction (cameraFraming.js, main.js)** — Extracted `updateCameraFraming()` and `updateViewport()` from `main.js` into new `src/ui/cameraFraming.js` module. ~30 lines extracted.

**2. Menu Stats Extraction (menuStats.js, main.js)** — Extracted `refreshMenuStats()` from `main.js` into new `src/ui/menuStats.js` module. ~10 lines extracted.

### July 4, 2026 – Multiplayer Visual Sync & Mid-Round Join Polish

**1. CargoBay Visibility & Death Shatter Sync** — `hostTransform` payload extended with `c` (cargoBay visibility boolean). Non-host `triggerCartShatterRef` was initialized to `null` and never wired, so death shatter VFX silently failed on non-host clients — fixed. All 4 carts now snapped to spawn booths before round countdown.

**2. Mid-Round Join Cart Teleport** — When a human replaces an NPC mid-round, the host detects the transition and teleports the cart to its spawn booth. Rate limiter now exempts `MSG.clientInput` and `MSG.hostTransform`.

**3. Ram Streak, hasSpilled, Remote Boost & Kill Feed Sync** — Ram boost streak spawners now run on all clients. `hasSpilled` state added to `hostTransform` payload. Remote boost edge-detection now passes `{ instant: true }`. Kill feed colors properly converted to CSS hex strings.

**4. Respawn Visual Cleanup & Shatter Hex Parsing** — Non-host clients now detect the respawn edge and call `cleanupShatter()` + `rebuildCartVisualsIntoRoot()`. Death shatter color parsing hardened.

**5. Host Respawn State & Scene Bridge Wiring** — Host now resets `cart.hasSpilled = false` at respawn. `cargoBay` lookup hardened via `getObjectByName()`. `getTriggerCartShatterRef`, `getSceneRef`, `getScene` bridge functions added.

**6. Netcode DRY Refactor: applyCartState + serializeCartToWire** — Extracted shared functions, eliminating ~50 lines of duplicated logic. Net reduction: 54 fewer lines of code.

**7. Runtime Null Guards** — `hud` references changed to getter syntax. `updateRemoteCartNetTargets` added `if (!cart) continue` guard.

**8. Boost State Sync & Slot 1 Debug Logging** — `applyCartState` now writes `snap.b` to both `cart.isRamBoosting` and `cart.isBoosting`.

**9. SlotIndex Param + Stuck-Shatter Guard + Host Respawn Cleanup** — Threaded `slotIndex` explicit parameter. Split shatter guard. Host respawn force-clears shatter state.

**11. Self-Contained Shatter VFX Lifecycle** — Introduced `isShatterAnimating(cart, now)` in `cartShatter.js` — a pure animation-clock check that replaces the brittle network-synced flags as the single source of truth for whether the death VFX is still playing. `doRespawnRef` (wired from `main.js` → `netcode.js`) drives a single unified respawn path on ALL clients.

**12. Audio Controls & Graphics Toggles Extraction** — Extracted audio volume/mute state management (~90 lines) from `main.js` into `src/ui/audioControls.js`. Extracted live GFX toggle bridge (~20 lines) into `src/ui/graphicsToggles.js`. Replaced `window.__cartRave_*` globals with proper module imports.

**13. Pause/Esc Overlay Extraction & @ts-expect-error Cleanup** — Extracted ~550 lines of Esc overlay UI from `hud.js` into new `src/ui/pauseOverlay.js`. Removed remaining ~20 `@ts-expect-error` suppressions.

### July 4, 2026 – Runtime Bug Fixes: Combo Decay, Grocery Queue, Level Sync, Results Cleanup

**1. Combo Decay Order-of-Operations Race Fix (gameFlow.js)** — Combo decay was running inline during the per-cart loop, before higher-indexed victims' falls were scored on the same frame. Moved decay to a **dedicated second pass**.

**2. Grocery Spill Pending Queue (effects/groceryPool.js)** — `triggerSpill()` bailed out if `init()` hadn't finished loading GLTF models yet. Added a `pendingSpills` queue.

**3. Server-Authoritative Level Sync via MSG.round** — Server now broadcasts `levelId` in every `MSG.round`. Non-host clients update their `settingsStore`.

**4. Results UI Cleanup** — Removed "NEXT LEVEL" button. "REMATCH" renamed to "PLAY AGAIN".

**5. Slot Kind Fallback Fix (hud.js)** — Changed `slot?.kind || "npc"` to `slot?.kind ?? ""` (nullish coalescing).

### July 4, 2026 – Repository-Wide TypeScript Audit & 100% Type Resolution

**1. Direct Code Audit** — Cross-examined roadmap claims against live source. Identified discrepancy where docs claimed zero type errors, while `npx tsc --noEmit` produced ~90 type errors.

**2. 100% `npx tsc --noEmit` Compliance (0 Errors)** — Augmented global module declarations in `src/globals.d.ts`. Aligned JSDoc parameter and return types across 11 core source modules. Cleaned up obsolete `@ts-expect-error` directives. Validated: `npx tsc --noEmit` now completes with 0 errors, `npm test` passes 21/21, `npm run build` in 1.69s.

### July 4, 2026 – Phase 4 Live Smoke Test & Server Hardening

**1. Server Stability & Crash Prevention (Critical)** — Hardened `onMessage` handler against out-of-order packets. Wrapped all downstream message handling in top-level try/catch. Removed all 14 non-null assertions on `#slots` array. Silent reaper hardened.

**2. Server-Side Level Authority & State Sync** — Server maintains authoritative `#currentLevelId` and broadcasts via `MSG.hello`. `enterPlayMode` now immediately hides menu DOM.

**3. Non-Host VFX & HUD Synchronization** — Expanded `MSG.hostTransform` payload with `b` (boosting) and `h` (hopping) booleans. Kill feed combo metadata fixed. Cinematic camera release added. Grocery spill crash protection.

**4. Codebase Hygiene & Bundle Optimization** — Removed orphaned `customizationStore.js`. De-exported 12 unused internal functions. Zero type suppressions goal (**[Corrected]** — later a 90-error discrepancy was found and resolved).

### July 4, 2026 – Customization Polish & Netcode Math Hardening

**1. Customization System Performance & Cleanup** — Slider debouncing. Dead code removal. Scope discipline (reverted an over-engineered "Pattern Selection UI").

**2. Netcode Math Hardening & Test Coverage (Phase 4 Prep)** — Expanded `tests/netcode.test.js` with 5 new extreme edge-case tests (total 21/21 passing). Buffer flood simulation. Clock drift resync verification. Test seams exposed under `__netcodeTestHooks`.

### July 4, 2026 – Phase 3 Major Systems: Zanzibar, Netcode Hardening & Tooling

**1. Level 3: Zanzibar Platform (New Arena)** — Fully floating octagonal steel sundeck arena. Strict convex hull colliders only. Custom `aiHazards` model with octagonal bounds. Dynamic sunset seascape. Custom animated sunset loading screen. `contactShadows.js` enhanced.

**2. Netcode & Server Hardening (Phase 4 Prep)** — Yaw-only reconciliation solved "suspension pop". Server validation hardened in `hostEventFall`. Clock drift resync (3-sample median re-bootstrap every 30s). Nitro edge detection. Memory/state hygiene.

**3. Engine & Core Stability** — WebGL memory leak fixed (Reflector material). Physics debug geometry lazily allocated. Stricter type safety.

**4. Testing & Tooling Infrastructure** — Vitest Rapier stub. New test suite `tests/netcode.test.js` with 16 tests running headless via happy-dom. Gamepad listeners wrapped in `typeof window !== "undefined"` guards.

### July 3, 2026 – Phase 2 Closure, Typography Rebrand & Progression Foundations

**1. Typography Rebrand & UI Polish** — Fonts: "Road Rage" for mega-titles, "Russo One" for UI headers, "Goldman" for mono/body, "Michroma" for HUD clock, "Space Grotesk" for labels. Main menu title changed from "CART RAVE" to "CART CLASH". Color gating during "countdown" and "running" phases.

**2. Rampage Combo System** — Host-authoritative combo multiplier system. 3 escalating tiers (1.5x RAMPAGE, 2.0x SAVAGE, 3.0x CARNAGE) with a 5-second decay timer. Combo tier and multiplier synced via `MSG.hostEventFall`.

**3. End-Screen Polish & Personal Bests** — `CameraMode.CINEMATIC_PODIUM` (low-angle victory lap orbit). "REMATCH" button. "NEXT LEVEL" button (later removed). Personal bests tracked in `localStorage`.

**4. Daily/Weekly Challenges & NPC Badges** — Created `src/stores/challengeStore.js`. Tracks 10 distinct challenges with 24h/7d rotation. Main menu "Challenges" panel with reactive progress bars. NPC personality badges: [A] Aggressor, [L] Lurker, [S] Scavenger, [C] Chaotic. Added `declashNpcSlotColors()`.

### July 3, 2026 – Deep Audit Resolution, Zustand Architecture & UI/Input Overhaul

**1. Spilling VFX & Netcode Audit Resolution** — Five critical runtime bugs surgically resolved:
- Collision group semantics fixed with proper Rapier collision masks.
- Spill echo double-fire & cargo bay desync fixed via `without` parameter in `#broadcastJson`.
- Grocery visual/collider misalignment fixed via dynamic bounding-box.
- Fall-elimination VFX voiding fixed (y-clamp to 0.5).
- Texture VRAM leak fixed (explicit texture disposal).

**2. Zustand Store Migration & Type Safety** — Created `audioStore.js`, `customizationStore.js`, `gameStore.js`, `settingsStore.js`. Single source of truth. Tweakpane compatibility via mutable proxy. Type safety improved (221 → 208 errors).

**3. Boot Splash Visual Overhaul** — Rewrote initial boot splash animation with inline SVG carts. 4-phase master timeline. `prefers-reduced-motion` fallback.

**4. Animation System & UI Refactor** — Eager-loaded `animations.js`. `SPRING_BOUNCE`/`SPRING_SNAP` presets. `resultsOverlay.js` refactored to use `createTimeline()` sequencing.

**5. Input System: Multi-Mode Controls & Gamepad Polish** — Dynamic controls panel (3 layouts: Keyboard, Gamepad, Touch). Analog steering with smooth radial deadzone (0.15). Mapping fixes (Boost to LT/A, Hop to RT/B). Ghost input prevention.

**6. Quality & Lifecycle Robustness** — Concurrency guard mutex. FBO sync. Auto-detection (touch, prefers-reduced-motion).

**7. NPC AI Personality Profiles & Tactics** — 4 distinct AI behavior profiles mapped to all 43 NPC names. Score rubberbanding. Sudden Death bloodhound overrides. Backrooms square-hole safety gate.

**8. Backrooms Level Polish** — Memory leak fix (wrapper function delegation). Non-deterministic shelf layout replaced with deterministic hash.

### July 2, 2026 – Audit Sweep Resolution & Phase 2 VFX Launch

**1. Critical Audit Findings Resolved (Findings #1–#8)** — Verified.
- **Critical Netcode Transport (#1)**: Fixed the reversed `onMessage` parameter order in `party/index.ts`. All prior netcode fixes now reachable at runtime.
- **Error Forwarder Endpoint (#2)**: Added `/api/log-error` route.
- **Restored Rapier WASM Deferral (#3)**: Created `src/physics/rapierInstance.js` as a shared singleton that dynamically imports.
- **Live Graphics Toggles (#4)**: Post-FX and Low Quality buttons now apply instantly.
- **Podium Gamepad Navigation (#5)**: `isUiActive` check now includes podium phase.
- **Boot Splash Slow-Connection Guard (#6)**: Added `window.__cartRaveMainReady` flag.
- **TS Suppression Cleanup (#7)**: Removed misapplied suppressions.
- **VFX & UI Nits (#8)**: Dust particle first-frame scale snap fixed. `_resizeTo` in `cartPreview.js` fixed.

**2. Spilling Cart Contents VFX (Phase 2)** — Fully client-side, netcode-safe cosmetic physics system.
- Pre-allocates 64 Rapier rigidbodies across 6 `THREE.InstancedMesh` pools for 6 GLTF models.
- Primitive Rapier colliders (Cuboids, Cylinders, Ball).
- Server broadcasts single `MSG.spill` event.
- `cargoBay` group parented to cart mesh.
- Triggers: high-impulse ram (>50), continuous tip-overs, pit fall-eliminations.
- 10-second lifetime + 1.5s scale-fade.

### July 2, 2026 – Architectural Safety Nets & Perf Spike

**1. Shared MSG Protocol** — MSG constants extracted from `src/config.js` and `party/index.ts` into `shared/protocol.js`.

**2. TypeScript checkJs Baseline** — `tsconfig.json` with checkJs, `typecheck` script, `@types/three`, `globals.d.ts`. Baseline: exactly 210 errors. **[Corrected]:** The pass also added 118 `@ts-expect-error` suppressions, one of which silenced the compiler error exposing the `onMessage` parameter swap — fixed in the same day.

**3. Vitest Unit Testing** — `tests/gameState.test.js`, 3 passing tests on `pickTimerWinner`.

**4. Production Error Forwarder** — `src/utils/errorReporter.js` (sendBeacon + keepalive fetch). **[Corrected]:** Initially client-side only; `/api/log-error` route added later.

**5. Rapier WASM Standard Package Spike** — Swapped `@dimforge/rapier3d-compat` → `@dimforge/rapier3d` with `vite-plugin-wasm`. WASM now separate 1,570 kB file (587 kB gzip). Rapier JS chunk shrank 2,235 kB → 180 kB.

### July 2, 2026 – Phase 1 Medium Polish & Customization Audit

**1. Customization Code Audit & Preview Fixes** — Camera framing decoupled from `_resizeTo()`. Color-revert fixed. Mirror finish roughness 0.02 + envMapIntensity 1.5 across all six styles. Zoom now camera-distance based (÷1.35). 3x2 grid compaction.

**2. Wheel Audio Removal** — ~115 lines across audioManager.js, frameVisuals.js, main.js, postFxDebug.js. Zero dangling references.

**3. Main Menu Graphics Toggles** — Buttons persist correctly; resolved same-day to apply live.

**4. Mid-Round Customization Gating** — Phase guard in `openCustomizeScreen()`. `cartrave:round-started` dispatched from main.js and auto-closes overlay.

### July 2, 2026 – Audit Regressions & Sweep Fixes (7 findings)

All seven verified fixed:
- Gamepad main-menu navigation — `setGamepadNavActive` hooked into `initMenu()` / `commitMenuHiddenForGame()`.
- Boot splash minimum duration — DOMContentLoaded shed converted to 3,500 ms setTimeout.
- Round timer/countdown clock-drift fix — `adjustedNow()` applies `serverClockOffsetMs`.
- Camera ray GC churn — module-level cached `RAPIER.Ray`.
- Shared material disposal — `userData.isSharedMaterial` tags.
- Trash particle sizing/freeze — spawn-time `baseScale` preserved.
- Boost pulse scale ratchet — pulses read `mesh.userData.baseScale`.

### July 1, 2026 – Phase 1 High Priority Clearance, Physics Overhaul, UI Rebrand, Audit Resolution, Gamepad Support

**1. Physics & Collision Overhaul**
- Classic Record: 72-segment trimesh ring → 16 convexHull compound, exact edge-to-edge trapezoidal vertex math.
- Backrooms: 5,776-polygon grid trimesh → 9-cuboid slice compound with exact void mapping for the 4 corner holes.
- Visual alignment: visualOffset 0.82, visualRecordY −0.42.

**2. UI / UX & "Cart Clash" Rebrand** — HUD overlap fix. Boot splash cart-smash animation. 20-segment Neon Tube loading bar. Rotating level-specific messages.

**3. Audio State Management** — Mute persistence fixed (removed `_isMuted` block-gates in music playback).

**4. Gamepad / Steam Deck Support** — Driving inputs (stick + D-Pad, RT/A boost, LT/B hop) merged with keyboard/touch. gamepadNav roving tabindex. `setUiMode` gating. **[Corrected]:** initial implementation had inverted steering and no gameplay gate on nav — fixed in July 2 fix pass.

**5. Codebase Hygiene & Audit Resolution** — Two Knip passes (31 dead exports / 8 files). Audit sweep resolving 20 findings.

### June 30, 2026

**Infrastructure & Deployment** — Migrated PartyKit → raw partyserver on Cloudflare free tier. V2 live at cart-rave.wyabro.workers.dev. **[Corrected]:** the migration carried PartyKit's `onMessage(message, connection)` signature into partyserver, which dispatches `(connection, message)`. Inbound message handling was non-functional until fixed July 2.

**Match Pacing & Sudden Death** — 2.5-minute rounds; Sudden Death (first score wins on tie); multi-way tie support + spectator mode.

**Death & Respawn Polish** — Cinematic death camera with momentum carry; 1,000 ms respawn.

**Audio Tightening Pass** — Dynamic wheel audio (removed July 2); charge-up SFX scaling; countdown SFX; menu music autoplay race fix.

**Mobile Performance & Low Quality Mode** — Auto low-quality mode; WASM crash fix (no mid-match Rapier world destroy); dynamic physics substeps.

**Defer Rapier WASM Loading** — deferred `RAPIER.init()` to first play. Removed July 2 by the `@dimforge/rapier3d` swap; restored July 2 by dynamic import.

**Phase 2 work** — lobby/ready-up stabilization, non-host lifecycle edges, client prediction, caster/fork visual polish, lag mitigation.

**NPC AI Behavior Overhaul** — 80% hunting cycles, predictive ramming, improved nitro logic + suicide prevention.

**Physics & Collision Fixes** — CCD on RigidBodyDesc; spawn booth friction; deeper Classic Record void (−30); position-based stuck-cart respawn.

**Other Polish** — Charge Boost early release + burst power; FFmpeg loudness normalization; entity/state cleanup.

### June 29, 2026

**Engine & Performance** — WebGL memory leaks patched; GC micro-stutter eliminated (Rapier scratch cache); arcade feel improvements.

**V2 Architecture** — GLB cart compressed (Draco + WebP); themed carts removed; Sunglasses + Mirror Finish customization.

**Gameplay** — Auto-Charge Boost; Cinematic Countdown Camera; Cart Shatter + Explosion Death VFX.

**Bug Fixes** — NPC respawn suicide loop fixed.

---

## Core Multiplayer & Foundation (Pre-June 2026)

- Full modular refactor (`main.js` as thin orchestrator + `src/` modules)
- PartyKit server + client handshake + host migration
- Multiplayer sync for human carts (host-authoritative)
- NPC fill for empty slots + slot sync
- Username system + color picker
- Round structure + HUD (countdown / running / podium)
- Results screen + Play Again + exit portal
- Main menu shell + mode routing (Solo / Quickplay / Friends)
- Friend flow + personal stats
- Portal system (exit + return portals)
- Ready-Up system

### Visuals & Environment
- Procedural cart models with caster wheels
- Spawn booths redesign
- Ground plane, pit wall, crowd silhouettes, main stage
- Skybox (stars, nebula, UFOs, planets, horizon fog)
- Crowd lighting + searchlights + point lights
- Stage lasers, fog, ambient light, spindle light
- Record label, void wall gradient, leader glow
- Vibe Jam billboard + in-world exit portal
- Esc overlay + menu integration

### Physics & Gameplay Feel
- Physics tuning (restitution, angularDamping, maxPitchRoll)
- Version 1 driving core restored + tipping behavior
- Ramming system + boosted ramming
- Collision particles, screen shake, trash bursts
- Nitro boost system + visual/audio feedback
- Wheel screech, hop, fall-off, nitro SFX
- Real cart crash sound sample

### Polish & Quality of Life
- Touch controls (in-game) + rotate prompt for mobile
- Mobile detection (replaces old desktop-only blocking)
- Audio system (separate music/SFX volume, procedural SFX)
- Kill feed, score bar, HUD overhaul
- Stats tracking + match history
- Performance fixes (menu perf, refresh stutter, etc.)
- Bug fixes across many sessions (ghost carts, host migration, etc.)
- Console log cleanup + dead code removal
- `bootstrap.js` and `levelManager.js` extracted from `main.js` (June 2026)

### Recent Technical Improvements (June 2026)
- Major dead code + unused export cleanup (Knip)
- `bootstrap.js` extraction (menu → play flow)
- `levelManager.js` extraction (level preview + swapping)

---

## Dropped Items

- Crazy Carts mode (solo 8 NPCs)
- General pre-submission checklist
- **FRIENDS-REJOIN-1** (08-01) — “auto-rejoin friends room like quickplay” rejected. Wyatt
  chose keep **JOIN LOBBY** on refresh for private rooms (D-FRIENDS-REJOIN-1 in STATUS). Not
  a defect; do not re-open without a new product call.

---

**Note on annotations:** Where a later audit contradicted a claim, the original entry stands with a **[Corrected]** annotation rather than being rewritten — the log should show what was believed at the time and what turned out to be true.
