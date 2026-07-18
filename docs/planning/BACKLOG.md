# Cart Clash — Backlog (audited 2026-07-12)

**What is this?** Every known open item, deduplicated across STATUS, ROADMAP, the netcode
deep-dive, and the July pass records — grouped by discipline, prioritized. **Why does it
exist?** So open work lives in one place instead of scattered tables. **Who should read
it?** Whoever is picking the next piece of work. **Related:**
[STATUS.md](../STATUS.md) (health + focus), [ROADMAP.md](./ROADMAP.md) (phased plan),
[netcode-deep-dive.md](./netcode-deep-dive.md) (full hazard writeups).

Priorities: **Critical** = blocks the Version 2 release · **High** = should land before V2
ships · **Medium** = V2-window polish, ship-without-it acceptable · **Low** = post-launch /
opportunistic. Resolved items were removed in the 2026-07-12 audit (they live in
[completed-work.md](./completed-work.md)); do not re-add them.

---

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| **Critical** | **NET-1 — two-browser full-round runtime smoke** | The V2 gate. Join, color pick, ready, full round, SD overtime, podium, play again, disconnect/rejoin + feel/HUD parity. Run together with the [Living Store](./living-store-test-plan.md) and [host migration](./host-migration-test-plan.md) checklists. Keep every window visible (hidden tab freezes rAF); use `127.0.0.1`. Harness complements (spawnlock / mpIntegration / hostMigration) do **not** close this gate. |
| High | VFX-1 endgame: promote display-referred bloom to default | Root cause fixed (D-VFX-2); Storerooms shipped (`98317c1`). Needs Classic/Sundial look check + threshold/strength tune with Wyatt, then delete the `?rtmode` fork paths. |
| High | NET-MIG-3 — freeze vs WebRTC re-handshake | **Partial 2026-07-16:** freeze until first post-epoch snap or 2s max (was fixed 300ms). Ghost poses still possible if DC never opens before max. Live feel smoke still owed. |
| High | NET-2 residual — mid-round join cold-load hitch | Permanent weld fixed (`feaa9e0` chronic-slow resume guard); multi-second hitch remains (joiner skips menu idle-warm). Pre-warm / ghost-until-ready still unbuilt. |
| Medium | NET-PRES-1 — unreliable falls/collisions: loss and duplicate fan-out | **Partial 2026-07-16:** falls[] 600ms victim dedupe; collisions[] 250ms pair FX dedupe. Loss half still open. |
| ✅ | Living Store + host migration CONFIG desync | **Fixed 2026-07-16:** `clearDirectiveOnHostMigration` on all peers. **2026-07-16 audit:** also advances `scheduleIdx` past due/past slots so promote cannot re-fire a mid-window directive. Future slots still fire (by design). |
| Medium | Non-host reconcile re-counted combo/spill challenges | **Fixed 2026-07-16 audit:** `isReconcileReplay` gates combo tier + ChallengeTracker in `applyRammingImpulse`. |
| ✅ | NET-CLK-1 — split Party vs host clock offsets | Shipped 2026-07-12 — dual EWMA + gameStart same-message delta. |
| ✅ | NET-CLK-2 — podium gate mixes host `startedAtMs` with DO `now` | Closed 2026-07-14 — `runningSinceServerMs` server-domain anchor (`e3bcb03`). |
| ✅ | NET-CLK-3 — hit window / directives use round clock | Shipped 2026-07-12 — `getRoundClockNowMs` for hits + directives. |
| ✅ | NET-MIG-1 — promote restores kill credit | Shipped 2026-07-12 — snapshot `attr` tail + promote restore. |
| ✅ | NET-MIG-2 — ghost exorcism can leave `#hostId === null` | Fixed 2026-07-14 + residual closed 2026-07-16: `#ensureLiveHost` after exorcism, colorPick host repair, join-path promote reconnecting conn when still pending. |
| ✅ | NET-BUF-1 — spawn buffer uses DO time; live snapshots use host time | Fixed 2026-07-14 — `applyHostSpawnSnapshot` buffers host `tHost`. |
| High | BOOT-PERF-1 — pre-warm the selected arena during menu idle | 07-17 run-2 F8: zanzibar play-shader 6.5s on a 4090 (13 MeshPhysicalMaterials + equirect PMREM inside the sync compile). Session env cache + behind-overlay composer warm landed 07-17; the remaining first-load cost wants `scheduleIdleWorldWarm` to also run `warmupActiveSceneShaders` on the SELECTED arena (and full-quality preview so `needsFullRebuild` stays false). Gate on tab-visible. |
| High | NET-PERF-1 — reconcile rewind-replay cost | 07-17 triage #1 hitch suspect: every host snapshot replays ALL pending inputs, each a **full Rapier `world.step`** (gameLoop.js) — MP-only CPU multiplier on top of live prediction. Options: cap/amortize replay depth, or drop predict-replay for interp-only local cart (~1 RTT input latency, matches remote carts) — scoped change, NOT a netcode rewrite. Decide from F8 bundles captured on BOTH machines during the next 2-PC session. |
| High | NET-PERF-2 — snapshot decode GC churn | `decodeHostStateSnapshot` allocates a fresh object + 4 arrays per cart per 40 Hz snapshot (~1000+ allocs/sec). Pooling is blocked on `netStateBuffer` retaining snapshots for interpolation — needs a preallocated ring buffer, not a drive-by. (Empty-tail JSON skip already landed 07-17.) |
| Low | NET-PERF-3 — p2p per-message buffer copy | `coerceToArrayBuffer` slices a copy for every binary DataChannel frame (p2p.js). Small; batch with NET-PERF-2. |
| Medium | Host-reload mid-round live confirm | 07-17: menu-over-game desync guarded via play-entry generation token (`invalidateActivePlayEntry`); mechanism fix from code reading, never live-reproduced. Reload the HOST tab mid-round in the NET-1 smoke. |
| Medium | NET-SD-1 — SD can untie on score while the flag stays true | |
| Medium | Deeper server-authoritative logic | Host can fabricate final scores; decide what the Worker must validate. Prerequisite for the leaderboard. |
| Medium | `structuredClone` → flat serializer in `party/index.ts` | Deliberate deferral: only after NET-1 + profiling data (ROADMAP Phase 5). |
| Low | Persistent leaderboard (Supabase) | Treat host-asserted scores as untrusted input (see above). |
| Low | Quickplay rotation live 2-browser check | ✅ Shipped 2026-07-12 (playtest-blockers pass) — host picks a random arena at the rematch seam, masked crossfade swap; still needs a live multi-client smoke (NET-1 adjacent). |

## Art

| Pri | Item | Notes |
|-----|------|-------|
| High | Bloom look sign-off (Classic/Sundial) | Art half of the VFX-1 endgame above — dark arenas + punchy neon identity must survive display-referred bloom (standing look rule: low exposure, restrained bloom — don't brighten; see [archive/audits/visual-audit.md](../archive/audits/visual-audit.md)). |
| Medium | Wilting-groceries Defeat screen reads as "confetti / something good" | 07-17 playtest. Needs an art-direction call before code: desaturate + slower droop vs a different silhouette entirely. Deliberately not attempted blind. |
| Medium | Pattern customize UI — blocked on cartrave4 body UVs | Pattern system fully wired except the picker tab; body UVs are fragmented. Plan: bake a 2nd UV channel in Blender ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)), then add the PATTERNS tab. |
| Low | Asset filename rebrand (`cart-rave-base*.glb` etc.) | Separate deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| ✅ Done | Recorded announcer VO | **Shipped 2026-07-16** — full 61-take pack (all events voiced, countdown replaces beeps). Pipeline data-driven ([announcer.md](../reference/announcer.md)); adding locales/takes is still drop-in. Open: taste passes only. |
| ✅ Done | Per-arena ambient beds + per-arena music | **Shipped 2026-07-16** — beds + reactive crowd + SD tension ([ambience.md](../reference/ambience.md)); per-arena music, multi-song-per-level, loudness-matched ([music.md](../reference/music.md)). Open: Wyatt ear pass. |
| Medium | Announcer re-records (Wyatt) | 07-17: shorter directive takes + the lines that "sound a bit weird." Code-side trims (2800 ms hold, no talk-over) landed; the takes themselves are the remaining half. Pipeline is drop-in ([announcer.md](../reference/announcer.md)). |
| Medium | Sudden Death music low-pass | The remaining Pass 5 audio deferral: Howler music + file SFX share one bus → audio-graph surgery. (SD gets a tension-drone layer today via ambience, but not a filter on the music itself.) |
| Low | Deeper Howler upgrade | Spatial audio, pooling, volume groups (ROADMAP "Future Modernization"). |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| **Critical** | **Drain the Wyatt playtest queue** | Passes 4 & 5 + stabilization + bloom A/B are all behavior/look-changing and unvalidated. One session covers it — checklist in [STATUS.md](../STATUS.md). |
| Medium | Taste-tuning follow-ups from Pass 4 | Deliberately-kept knobs listed in D-GP4-1 (nitro duty-cycle, `maxImpulse` vs boost, air control, readability HUD adds) — only reopen with playtest evidence. |
| Medium | Clutch slow-mo (Pass 5 deferral) | Taste-gated; prototype only after the queue drains. |
| Low | Turntable swirl force (revive prototype `applyRecordSwirlImpulsesForSubstep`) | The spinning record used to physically drag carts tangentially — strongest at the label, `max(0,1-r/falloffR)**2` falloff to the rim — making the center a high-risk zone. Deleted in `dd33c6b`; floor is now visual-only spin by deliberate design ([Game_Architecture.md](../reference/Game_Architecture.md) line ~28). Only on-theme mechanic that ties the record to gameplay. Revive **scoped**, not raw: confine to the inner label zone (pairs with `centerHole`/`holeAssist` suck), or ship as a per-arena modifier (Classic Record on, others off). Must be host-side + deterministic for netcode; implement via the DIR-1 modifier stack, not a `CONFIG` mutation. Taste-gated — prototype after the Wyatt queue drains. |
| Low | KO "doomed" presentational cue | 07-17: "kills being confirmed feels delayed" — scoring correctly waits for the actual fall (rescues stay possible), so the fix is presentational: an early cue when a victim goes over the edge unrecoverable. Idea stage. |
| Low | Death-cam "follow killer" revisit | Attempted 07-10, reverted as a regression — revisit carefully or drop. |
| Low | Animate the customize sunglasses-tab camera zoom | The 1.35× snap reads as a cart-size glitch (testers reported it as a bug). |
| Low | Subtle monetization path | Cosmetic unlocks could support it — idea stage only. |

## Tech Debt

Jam-era structure that still works but accrues cost. **Do not** start full rewrites
during the V2 validation gate (playtest + NET-1). Prefer seams and dual-path deletion
after multiplayer is proven. Priorities below are post-gate unless noted.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | Create when the milestone is in sight. |
| Medium | MAIN-1 | Carve `main.js` composition seam | ~3.7k-line wiring hub (`main.js` ~163 KB). Extract boot / session / render-loop / combat-fx / net bridge so ownership is readable. **Prerequisite for BUNDLE-1** — not a rewrite; move existing modules behind one dynamic import boundary. Also shrinks the fat `callbacks`/`deps` bags into netcode/gameFlow/simulation. |
| Medium | STORE-1 | Collapse `gameState` facade dual import | Thin `gameState.js` wrappers over Zustand `gameStore`; some call sites use the store, some the facade. Pick one public surface (store or facade) and migrate call sites. Pair with KO reactors as the only fall/score fan-out. |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | Living Store temporarily patches `CONFIG` paths then restores — jam-speed side effects. Prefer a runtime multiplier / modifier stack so static config is immutable and restore bugs cannot leave rules sticky. |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Host client runs physics (invariant — keep it). For leaderboards / anti-cheat, Worker must treat scores/outcomes as untrusted and validate enough to reject obvious fabrication. Prerequisite for Supabase leaderboard. |
| Low | BUNDLE-1 | Menu/game code-split | **Blocked** (D-PERF-3): no clean seam until MAIN-1 + NET-1 smoke. Do not chip at it piecemeal. |
| Low | GLTF-1 | Drop legacy cart GLTF layout path | `cartRaveGltf.js` still supports cartrave4 **and** legacy monolithic caster layout + Draco fallback URL. Once production is cartrave4-only, delete legacy mesh roles / fallback load so one layout remains. |
| Low | DUAL-1 | Delete leftover dual-era paths | Examples: Rapier standard + SIMD packages (SIMD opt-in after borrow bug — keep opt-in but document sole default); quality comments/code that still talk about legacy low/high after the 3-tier system; removed `theme` field still silently ignored in customization storage; Howler + procedural SFX + PA layered as three eras (works — only refactor when audio ownership is the task). |
| Low | TS-1 | TypeScript on hot paths / TS 7 | Client is ~105 `.js` files with JSDoc; `party/` is real TS. Stay on TS 6.0.3 for the gate. Later: migrate contracts for `netcode` / `scoring` / `simulation` first; full TS 7 only after clearing ~849 JSDoc `object` errors (own migration pass). |
| Low | TOOL-1 | Tooling residue | `.npmrc` `legacy-peer-deps` for wrangler/partyserver types mismatch; agent rule files (AGENTS + `.cursorrules` + CLAUDE + GEMINI) should keep deferring to AGENTS; script aliases `dev:next-level` / dual cart-rave names — remove only with brand cutover. |
| Low | Vite 500 kB chunk-size hint | Cosmetic build warning; unrelated to the fixed `rolldownOptions` rename. |
| Low | BRAND-1 | Brand / domain cutover ceremony | Worker name, DO class, `cartRave*` storage keys, Party id, asset paths, module filenames — **intentionally frozen**. One planned event only; checklist in [brand.md](../brand.md). Do not drip-rename. |

### Explicitly *not* tech debt (do not “modernize” these)

| Topic | Why leave it |
|-------|----------------|
| Host-only Rapier on a client | Architecture invariant — server never simulates physics ([AGENTS.md](../../AGENTS.md)). |
| Zustand + KO event reactors | Current and coherent; keep extending, do not replace with a new state library. |
| partyserver + WebRTC P2P split | Control plane vs gameplay plane is correct; fix hazards, do not collapse to server-relay transforms. |
| Big `config.js` knob table | Fine as long as knobs stay centralized; DIR-1 should stop *mutating* it mid-round. |

## Future Ideas (post-launch)

- WebGPU compute shaders for targeted VFX (shatter, particles) — re-evaluate after mobile perf is proven; no physics rewrite.
- Economy/XP progression beyond lifetime unlocks — only if reopened deliberately.
- Domain + full rebrand cutover ceremony (BRAND-1: new Worker, storage migration, asset renames) as one planned event.
- MAIN-1 → BUNDLE-1 menu/game split after V2 multiplayer is proven.
- DIR-1 runtime modifier stack if Living Store grows more mutators.
- GLTF-1 legacy layout deletion after cartrave4-only production sign-off.
