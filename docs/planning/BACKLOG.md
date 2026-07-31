# Cart Clash — Backlog (open work only)

**What is this?** Every known **open** item, deduplicated — grouped by discipline, prioritized.
**Why does it exist?** So open work lives in one place instead of scattered tables.
**Who should read it?** Whoever is picking the next piece of work.
**Related:** [STATUS.md](../STATUS.md) (declared phase + focus), [ROADMAP.md](./ROADMAP.md)
(phase definitions), [completed-work.md](./completed-work.md) (shipped),
[netcode-deep-dive.md](./netcode-deep-dive.md) (hazard writeups).

Priorities: **Critical** = blocks Version 2 · **High** = should land before V2 ·
**Medium** = V2-window polish · **Low** = post-launch / opportunistic.

Completed rows are **not** kept here — move them to [completed-work.md](./completed-work.md).
Do not re-add closed IDs (NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1, VFX-1, NET-CLK-*, NET-BUF-1, …)
without new evidence.

**Pre-ship 07-19 rows** tagged *(pre-ship 07-19)* are parked polish — pick up when Wyatt
names them; they do not auto-queue over STATUS.

**SHIP-1 tiers (07-20):** pre-ship ordering now lives in [SHIP-1.md](./SHIP-1.md).
Rows tagged `[SHIP-1 A–E]` are pre-ship, drained tier by tier; untagged rows default to
post-launch unless Wyatt pulls them forward.

---

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| Medium | BOOT-PERF-1 — pre-warm the selected arena during menu idle | Remaining first-load cost wants idle warm of SELECTED arena shaders. Gate on tab-visible. |
| Done | COUNTDOWN-SYNC-1 — countdown beat desync / "skips" `[SHIP-1 A1]` | Fixed (07-21): retroactively fire missed "1" beat, staggered 220ms before GO + host-domain clock sync. Confirmed good by Wyatt in playtest (07-22). |
| Low | COUNTDOWN-QUICKPLAY-1 — empty quickplay countdown connect-wait edge case | In empty quickplay games, countdown either waits for player connection before starting or skips part of it. Documented from F8 captures (184–196); parked in backlog per Wyatt (07-22). |
| 🟡 Partial | NET-PERF-1 — reconcile rewind-replay cost | Caps shipped; residual if retest still rubber-bands. |
| Low | NET-PERF-3 — p2p per-message buffer copy | Only batch if F8 shows alloc pressure after NET-PERF-1. |
| Medium | Host-reload mid-round live confirm | Automated half: netharness `hostReload` (A6b). Optional: one live HOST-tab reload smoke for feel. |
| Medium | ANLX-VIEW-1 — player-analytics view `[SHIP-1 A7]` | ✅ PASS 07-22 — `npm run analytics:pull` + CC Analytics panel. **Before public playtest: `DELETE /api/analytics`.** |
| Done | MP-FX-1 — non-host players miss gameplay VFX `[SHIP-1 A3]` | PASS (07-22 Wyatt playtest): charge glow via `ch` bit 16 + remote hop land thud/dust; collision/shatter already on snapshot tail. |
| Medium | Customize screen performance pass *(pre-ship 07-19)* | Measure before tuning. |
| Done | ARENA-COL-1 — Cart Rave pit/kill-zone reliability `[SHIP-1 A4]` | PASS (07-22 Wyatt playtest): rim entry pose (`fallEntryPos`) & round-clock timestamp (`fallEntryTimeMs`) → `buildKOEvent` via `{ classifyPos, creditTimeMs }`. Tests: `scoringEvent.test.js` +2. |
| Low | Countdown timer survives menu return *(pre-ship 07-19)* | Stale countdown UI on main menu. |
| High | HOST-CAP-1 — capability-based host preference `[SHIP-1 A1]` | After host-hitch forensics: strongest machine wins host (`party/hostSelection.ts` + hostCapability); weak-host warning; residual = min-spec fact. |
| High | SRV-TEST-1 — direct tests for `party/index.ts` `[SHIP-1 A5]` | **Done** (A5a pure helpers + A5b DO harness). Extend scenarios under A6. |
| Medium | NET-SIM-1 — socket-lifecycle netharness scenarios `[SHIP-1 A6]` | **A6a done (unpushed):** party-do silent-reap + ghost 4010. **A6b done (unpushed):** netharness `hostReload`. P2P zombie + reconnect cooldown already unit-covered. |
| Done | HYGIENE-1 — acked fixed-list sweep (07-30 review fold-in) | ✅ closed 07-30 — (1) sourcemap:false · (2) boot-error filter · (3) remotes deleted + **Wyatt set GitHub default branch → `cart-clash`** · (4) profiler `--dpr`/`--gpu`. |
| High | SKYBOX-1 — restore never-built `sceneExtras` (review C-01) | `main.js:2361` stub → `null`; delete shadowing local `disposeSceneExtras` (`:2465` — kills the `:148` import); wire real disposer into level teardown. 991 lines of Classic skybox/planets/spotlights have never rendered. **Runs after WARM-IGPU-1 Phase 1** (else re-run P0 cold-cache captures with skybox on). Wyatt eyes close. Re-observe "arena visuals persisting" afterwards — review killed both prior hypotheses. |
| High | SEC-BEACON-1 — harden open POST beacons | Before external testers. `/api/log-error`/`captures`/`analytics` have body caps only (100k/350k/64k); ring caps 2000/80/20000 mean a flood evicts real crash rows on our write billing. Add rate limit; extract IP-cap `5` (`party/index.ts:861`) into constants.ts; dedupe 4× release logic (`:498/:831/:963/:1115`) into one `#releaseIp`; tests on the A5b DO harness (zero today). |
| High | SEC-UNLOCK-1 — DEV-gate `?devUnlocks=all` | Before external testers. `src/stores/unlockStore.js:22-31` ran ungated in prod — a shared `?devUnlocks=all` link permanently unlocked everything. **Scope narrowed at ack: `=all` only.** `?devUnlocks=off` stays live in every build — it only removes privileges and playtest Session 2 requires it on a prod build (`docs/playtest/README.md:83`). Manual localStorage + `CartClashDevUnlocks` overrides kept by design; the false "manual override only" header claim fixed. |
| High | SEC-ROUTE-1 — Worker routes `includes()` → exact `===` | ✅ Done 07-30 (`8da2575`). `party/index.ts:1553/1580/1615/1730` matched on `pathname.includes(...)`, so any path *containing* the substring routed there. **Tightened at ack to exact `===`, not `startsWith`** — these routes have no sub-paths (options ride the query string) and the log DOs' internal handlers already use `===`. `startsWith("/parties/")` at `:1790` stays: that one is a real prefix route. Shipped with a 404 fallback — `routePartykitRequest` returns null for unmatched paths and returning null from `fetch()` 500s. |
| Low | SEC-TOKEN-1 — admin tokens out of query params | `?token=` on `/api/errors|captures|analytics` (`index.ts:1592/1698/1757`) leaks into logs/referrers; move to a header. Compares are also non-constant-time (`!==`). |
| Done | CARGO-RACE-1 — bay built empty if grocery GLTFs lose the load race | ✅ 07-30 — bays self-heal on init resolve: `createCargoBay()` queues pre-init bays, `buildPool()` populates still-parented ones (mirrors pendingSpills replay). Cold-solo probe: `[0,0,0,0]` → `[18,18,18,18]` PASS. Unblocked CARGO-VIS-1 evidence. |
| Medium | WARM-SOLO-1 — solo post-`carts-ready` stall (WARM-IGPU-1 residual) | Laptop A cap-206 (**solo**) took a 6.4s longtask ~1.9s after `carts-ready`, inside the countdown. WARM-IGPU-1's Lever A does **not** cover it: arena rotation is quickplay-only, and solo's flyover warm already runs inside `ensureSessionCartsReady`. Proxy evidence says the residual is driver-side first-draw cost (a 13.1s menu-warm frame carried only 235ms of attributed span time), so raising budgets will not help. Candidate mechanism worth checking first: scene content added *after* the warm pass (CSS2D nametags, cargo bays — CARGO-RACE-1's self-heal adds 18–30 meshes per cart, announcer/VFX) introduces new materials whose programs link at the first live countdown draw. **Work only on real telemetry** (`warmupSettle` / longframe spans from a weak-GPU playtester), never on speculation — no iGPU hardware available to reproduce. |
| Medium | NET-RING-1 — decode-ring reject counters (review C-03) | Instrument-first. Rejects (dup/ooo seq etc.) burn ring slots AFTER decode; `netStateBuffer` retains ring-owned cart arrays by reference (`netcode.js:1422→1434`); true margin = 96−rejects, not 32, and only bites when consumption stalls. Count rejects-since-oldest-buffered; the copy-into-pooled-record fix only if counters show real traffic. |
| Medium | PERF-WATCH-1 — auto-quality step-up path | Watchdog demotion is irreversible per session (no step-up anywhere; DEV-only warn; 2 tier steps + 2 renderScale steps; attract render-cost and game frame-delta both judged against one 20.5ms bar). Decide after WARM-IGPU-1 P0b telemetry shows how often it bites. |
| Medium | PERF-TIER-1 — `high-lite` tier rung | `DISCRETE_GPU_RE` puts a 1660 Ti in the same discrete→High bucket as a 4090; High→Medium cuts 4 knobs at once (DPR 2→1.25, reflector off, crowd, lasers). Blocked on HYGIENE-1's `--dpr` profiling — tier table may be tuned against an inverted ranking (512px reflector is DPR-invariant; full-screen cost ×4 at DPR 2). |
| Medium | SHEET-1 — in-match contact-sheet tool | `tools/sheet.mjs`: boot via `makeClient({room:"solo", diag:1, perfPump:1})` (`gameharness.mjs:96` pattern) + `waitForState(phase==="running")`; arena via localStorage `cartRaveLevel`; deterministic state via `__ccDiag.control.setScores()`/`rewindRoundClock()`; fresh page per cell; viewport matrix 3440/1920/1512/1366/768/390 + reduced-motion; no `freeze=1` in-match. **Pre-check first:** blackframes readback false-black risk (`settle()` resolves inside rAF, `sampleBlack` runs in the microtask after). Serves FIGHT-VERIFY-1 and UI-SCALE-1 (≥1920 identity cells MAE ~0 via `compare.mjs`). |
| Medium | Deeper server-authoritative logic (TRUST-1) `[SHIP-1 D1]` | Prerequisite for trusted leaderboard. Builds on SRV-TEST-1 helpers. |
| Medium | `structuredClone` → flat serializer in `party/index.ts` | Only after profiling shows it matters. |
| Medium | Persistent leaderboard / player stats `[SHIP-1 D2]` | Needs TRUST-1. |
| Low | Quickplay rotation live 2-browser check | Feature shipped; still wants a live multi-client confirm. |

## Art

| Pri | Item | Notes |
|-----|------|-------|
| High | Bloom look sign-off (Classic/Sundial) `[SHIP-1 E2]` | Art half of closed VFX-1 — dark arenas + punchy neon must survive display-referred bloom. |
| Medium | Wilting-groceries Defeat screen reads as "confetti / something good" `[SHIP-1 E2]` | Needs art-direction call before code. |
| High | CART-MODEL-1 — new cart basket/model `[SHIP-1 C1]` | Wyatt-led Blender work completing the prototype-era cart design. While in Blender: clean body UVs / 2nd UV channel — unblocks patterns ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)). |
| Medium | Pattern customize UI `[SHIP-1 C3]` | Unblocked by CART-MODEL-1's re-UV. |
| High | CARGO-VIS-1 — basket fill + overflow look `[SHIP-1 C2]` | Pre-ship: groceries must **fill the full basket** and **overflow the top** at boss/full life-cargo. Count ramp exists (CARGO-WT-1); layout/scale/pile still wrong. Prefer after C1 new basket; can prototype on current bay if needed. |
| Low | Sunglasses finish materials broken `[SHIP-1 E2]` | |
| Low | Asset filename rebrand (`cart-rave-base*.glb` etc.) | Deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Announcer re-records (Wyatt) `[SHIP-1 E3]` | Shorter directive takes + odd lines. Pipeline drop-in. |
| Medium | Sudden Death music low-pass `[SHIP-1 E3]` | Audio-graph surgery (shared Howler bus). |
| Low | Deeper Howler upgrade `[SHIP-1 E3]` | Spatial, pooling, volume groups. |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Taste-tuning follow-ups from Pass 4 | Only reopen with playtest evidence (D-GP4-1). |
| Medium | Clutch slow-mo (Pass 5 deferral) | Taste-gated. |
| Low | Turntable swirl force revive | Scoped prototype via DIR-1 — taste-gated. |
| Low | KO "doomed" presentational cue | Idea stage. |
| Low | Death-cam "follow killer" revisit | Previously reverted. |
| Low | Animate the customize sunglasses-tab camera zoom | |
| Low | Subtle monetization path | Idea stage only. |
| Done | CARGO-WT-1 — grocery weight as risk/reward `[SHIP-1 B2]` | Closed 07-22 (Wyatt feel accept) — life-scoped boss/glass; bay count ramp; look → CARGO-VIS-1. |
| Done | AI-DIFF-1 — NPC difficulty modes `[SHIP-1 B1]` | Shipped 07-22 (`49bfc2a`). Medium = baseline; Solo Easy default + menu; Quickplay Medium; Friends host pick. |
| Done | HIT-FEEL-1 — hit feedback `[SHIP-1 B3]` | PASS 07-22 (Wyatt) — quieter incoming + woken normals; `?tune` ramming.fx. |
| High | INPUT-KB-1 — keyboard parity with controller `[SHIP-1 A2]` | |
| Done | ARENA-BAL-1 — self-KO rate on Sundial + Storerooms `[SHIP-1 B3]` | Closed 07-22 (Wyatt, no code). |
| Medium | SOLO-DIFF-1 — `DEFAULT_SOLO` easy→medium | `src/aiDifficulty.js:14` is `"easy"`; quickplay already pins medium. The default hides shipped AI-DIFF-1 work. Trivial flip — Wyatt call. |
| Low | Controller vibration strength *(pre-ship 07-19)* | |

## UI / UX

| Pri | Item | Notes |
|-----|------|-------|
| High | RESULTS-1 — results screen layout redesign `[SHIP-1 E1]` | |
| Medium | Controller menu navigation polish *(pre-ship 07-19)* | Modal-scoping shipped 07-20; remaining = polish + pad-in-hand validation. |
| Medium | UI-FRAME-1 — premium frame/panel styling pass `[SHIP-1 E1]` | |
| Medium | ESC scoring panel refresh `[SHIP-1 E1]` | |
| Low | Main-menu SFX slider `[SHIP-1 E3]` | |
| Medium | ONBOARD-1 — first-run controls card `[SHIP-1 E4]` | Minimal onboarding; Solo is the tutorial (AI-DIFF-1 sharpens it). Not a tutorial system. |
| High | FIGHT-VERIFY-1 — owed fight-night verification | 8 items at [fight-night-ui-handover.md:252+](./fight-night-ui-handover.md). Agent half via SHEET-1: responsive sweep 1025/1024/768/380, reduced-motion, cold-boot loading screens per arena, die-cut hover/press surfaces. Wyatt half (cannot be agent-closed): real-match HUD/results feel, two-client friends room (CHECKOUT LINE has never rendered). |
| Done | CARGO-HUD-1a — cargo-readout mock on BOTH hosts | ✅ 07-30 — injected mocks (no repo change) of nameplate vs score-strip, 3 states + matching baskets in one frame. **Wyatt picked nameplate placement with the score-strip chip treatment.** |
| High | CARGO-HUD-1 — opponent cargo readout (nameplate) | **Card written, awaiting ack:** [cargo-hud-1.md](./cargo-hud-1.md). Display-only — `lifeCargoPoints` already on both wire paths (netcode.js:1775 / :1267; binary.js:117/:248), zero cargo refs in hud.js today. 3 states (stripped/stocked/boss) as a slab chip on `.cart-nametag`; rides the existing per-frame diff-gated `updateNameLabels` cache, so one `innerHTML` write per transition. Seam: `cargoTierFor()` in cargoLoad.js. The gap it closes: boss incoming-ram 0.52× vs stripped 1.32× — the harder-to-see half carries the bigger swing. |
| High | UI-SCALE-1 — responsive root-scale migration | Two passes per [responsive-scale-migration.md](./responsive-scale-migration.md): one fluid root (`html { font-size: clamp(0.75rem, min(0.84vw, 1.5svh), 1rem) }`), clamps → `(max÷16)rem`, media queries STAY px (rem in MQs resolves against initial root — silent mis-evaluation). **Pass 1 also does ≤768 reflow structure — Wyatt 07-30: phone = fewer elements, not same-menu-smaller.** Blocked on SHEET-1. Sequential single-owner, no fan-out (one coupled CSS system). Safety invariant: ≥1920 renders pixel-identical pre/post (every clamp already saturates at max there). |

## Tech Debt

Jam-era structure that still works but accrues cost. Prefer seams after multiplayer is proven.
Priorities below are post-gate unless Wyatt pulls them forward.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | **Created 07-20** — [SHIP-1.md](./SHIP-1.md), living doc; row stays as pointer until ship. |
| Medium | MAIN-1 | Carve `main.js` composition seam | Prerequisite for BUNDLE-1. |
| Medium | STORE-1 | Collapse `gameState` facade dual import | |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Prerequisite for leaderboard. `[SHIP-1 D1]` |
| Low | BUNDLE-1 | Menu/game code-split | Blocked on MAIN-1 (D-PERF-3). |
| Low | GLTF-1 | Drop legacy cart GLTF layout path | |
| Low | DUAL-1 | Delete leftover dual-era paths | |
| Low | TS-1 | TypeScript on hot paths / TS 7 | Stay on TS 6.x for the gate. |
| Low | TOOL-1 | Tooling residue | |
| Low | Vite 500 kB chunk-size hint | Cosmetic. |
| Low | BRAND-1 | Brand / domain cutover ceremony | Frozen — [brand.md](../brand.md). |

### Explicitly *not* tech debt (do not “modernize” these)

| Topic | Why leave it |
|-------|----------------|
| Host-only Rapier on a client | Architecture invariant — [AGENTS.md](../../AGENTS.md). |
| Zustand + KO event reactors | Current and coherent. |
| partyserver + WebRTC P2P split | Control plane vs gameplay plane is correct. |
| Big `config.js` knob table | Fine if knobs stay centralized; DIR-1 stops mid-round mutation. |

## Future Ideas (post-launch)

- WebGPU compute shaders for targeted VFX — after mobile perf; no physics rewrite.
- Economy/XP progression beyond lifetime unlocks — only if reopened deliberately.
- Domain + full rebrand cutover (BRAND-1).
- MAIN-1 → BUNDLE-1 after V2.
- DIR-1 runtime modifier stack if Living Store grows mutators.
- GLTF-1 legacy layout deletion after cartrave4-only sign-off.
