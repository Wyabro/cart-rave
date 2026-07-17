# Cart Clash — Project State

**Last updated:** July 16, 2026  
**Phase:** 4 — Multiplayer & Infrastructure (post-jam, working toward Version 2)  
**Branch:** `cart-clash` (active development) · `main` (production)  
**Production:** https://cart-rave.wyabro.workers.dev/  
**Repo:** https://github.com/Wyabro/cart-rave  
**Naming:** Product is **Cart Clash**; Worker/host/storage IDs may still say `cart-rave` — see [brand.md](../brand.md).

---

## 1. Overview

Cart Clash is a browser-based **4-player physics sumo** game. Players drive neon shopping carts on arena floors — a vinyl record ring (**Cart Rave**, jam tribute), a Backrooms supermarket (**The Storerooms**), or a floating sundeck (**Sundial Station**, level id `zanzibar`). Ram opponents off edges or into voids to score. Rounds last **150 seconds** (2.5 minutes).

**Version 2 goal:** Polished release with strong solo feel, three presentation-elevated arenas, cosmetic/level progression, better performance, and a **domain cutover** after the naming freeze in [brand.md](../brand.md). See [ROADMAP.md](./ROADMAP.md) for open work.

> **This doc = the present** — what's built and works today (architecture snapshot + known
> issues + verified non-issues). Health and current focus live in [STATUS.md](../STATUS.md);
> forward plans in [ROADMAP.md](./ROADMAP.md) + [BACKLOG.md](./BACKLOG.md); the shipped log
> in [completed-work.md](./completed-work.md). When a task here ships, move its writeup to
> completed-work.md.

---

## 2. Stack & build

| Layer | Technology |
|-------|------------|
| Rendering | Three.js r185 / `^0.185.1` (`src/`, Vite-bundled) |
| Physics | Rapier3D `^0.19.3` (host-authoritative, client-side only) |
| Multiplayer | partyserver `^0.5.8` Durable Object (`party/index.ts`) + partysocket `^1.3.0` |
| P2P / TURN | WebRTC DataChannels; Cloudflare Calls mint TURN (`request_turn_credentials`) |
| Build | Vite `^8.1.4` + vite-plugin-wasm → `dist/` |
| Hosting | Cloudflare Workers (ASSETS + Durable Object via Wrangler `^4.110.0`) |
| Quality | TypeScript 6.x `tsc --noEmit`, Vitest `^4.1.10`, knip `^6.26.0` |
| Fonts | Self-hosted under `public/fonts/` (`npm run fonts:fetch`) |
| Cart models | Draco GLBs under `public/models/` (masters under `art/`) |

Full version table + licenses: [CREDITS.md](../reference/CREDITS.md) and [docs/README.md § Tech stack](../README.md#tech-stack).

**No server-side physics.** The Durable Object relays messages only. Host snapshots stream at ~**40 Hz** on the DataChannel when P2P is up.

**Tooling notes (July 10, 2026):** TypeScript stays on **6.x** (7.x deferred). Wrangler 4.108+ vs partyserver workers-types peer mismatch is handled by `.npmrc` `legacy-peer-deps=true`.

---

## 3. Architecture snapshot

- **Host-authoritative multiplayer** with client-side prediction for the local human cart (non-host).
- **4 cart slots** per room; empty slots filled by NPCs. Humans swap in by color pick.
- **Ready-up gate**: server broadcasts `gameStart` only when all humans are ready.
- **Levels**: `classicRecord` (default), `backrooms`, `zanzibar` — menu select, persisted in `localStorage` (`cartRaveLevel`); levels gated by lifetime unlocks (dev unlocks all by default).
- **Solo play** reuses multiplayer (private `soloXXXXXX` room + 3 NPCs).
- **KO Event system** — one fall event fans out to reactors (match stats, challenges, kill confirm, arena VFX, feed, announcer). See [scoring-event-system.md](../reference/scoring-event-system.md).
- **Living Store (shipped)** — Living Cargo (cart = scoreboard) + host-authored PA **directives** mid-round. As-built: [living-store.md](../reference/living-store.md).

### Recent work (July 9–16, 2026)

July 9–10 highlights: progression unlocks; Sundial Station flagship + three-arena elevation; full HUD redesign (center stage, tokens, icons); gameplay feel pass; match-stat spine + charge glow + auto-quality; boot/load + half-res bloom + level LOD; **Living Store** (cargo + directives + review hardening); solo polish sprint; regression audit (verified non-issues logged in §5); netcode connection lifecycle hardening.

July 10–11 production passes (index: [production-passes.md](./production-passes.md)): **Pass 2** 3-tier quality system; **Pass 3/3.2/3.3** sticker-language UI + UX flow + density; **Pass 4** gameplay/combat/AI fixes (`73631e0`); **Pass 5** VFX/audio waves 1–3 (`043e793`..`eb924af`); **stabilization pass** (`b9e8fb8`..`3754949`, unpushed — wheel roll, podium +20%, menu pacing, dead-code purge). Plus: **black-frame flicker root-caused and fixed on Storerooms** (half-res float bloom mips → per-arena bloom pipeline `98317c1`, D-VFX-2); **netcode test punch list closed** (`party/roundValidation.ts`, `party/hostSelection.ts`, `applyHostMigration`, P2P size gates — `1dbb48a`, `6ee9c0b`); Rapier **SIMD made opt-in** after a game-breaking borrow error (`8174180`); visual-QA toolchain (`shoot`/`compare`/`blackframes`, `?blackmon=`, `?rtmode=`).

July 12–16 highlights: **Store PA announcer — full recorded voice pack shipped** (61 takes en, Tiers 1–4, all 5 Living Store directives voiced, voiced countdown replaces beeps); **friction sprint A+B** (join overlay, solo pause, lobby ready, rematch copy/grace, SD-only last-standing); **diagnostics framework + gameplay E2E rig** (`?diag` → `window.__ccDiag` + `gameharness.mjs`); **netcode 2-client harness** (`netharness.mjs` — spawnlock + mpIntegration + hostMigration); **battery sweep** (`npm run battery` one-command regression); **pre-playtest hardening** (SD wedge fix, combo gate, host fall-queue lifecycle, NET-CLK-2, ghost exorcism, kill-credit promote); **potato hardening** (software-GL auto-low, GPU-aware tier); **playtest kit + console v3**; **suction holes v1** (Storerooms); **controller haptics hardening**. Full writeups in [completed-work.md](./completed-work.md) and the [decision log](../archive/decision-log-2026-07.md).

### Key files

| Path | Role |
|------|------|
| `src/main.js` | Entry point, render loop, system wiring |
| `src/bootstrap.js` | Menu/gameplay transition |
| `src/levelManager.js` | Level preview and hot-swap |
| `src/netcode.js` | Multiplayer, prediction, interpolation, host P2P maintain |
| `src/netcode/p2p.js` | WebRTC peers/DataChannels, ICE grace, TURN wait |
| `src/netcode/binary.js` | Host snapshot encode/decode (bounds-checked) |
| `src/simulation.js` | Rapier physics (host) |
| `src/levels/` | Level definitions (classic, backrooms, zanzibar/Sundial) |
| `src/scoring/` | KO events, reactors, match stats |
| `src/cargoLoad.js` | Living Cargo bay/handling reconciler |
| `src/directives/` | Living Store directive table + host engine |
| `src/stores/unlockStore.js` / `unlockConfig.js` | Lifetime cosmetic + level unlocks |
| `src/announcer/` | "The Store PA" — arbitration, events, director, stings |
| `src/ui/centerStage.js` | HUD stage-band arbiter |
| `src/ui/icons.js` | Shared HUD SVG icons |
| `src/ui/styles/` | hud, pause, results, global, announcer, **tokens** |
| `src/utils/levelLod.js` | Distance-cull decorative props |
| `src/utils/autoQuality.js` | Session low-quality step-down |
| `src/utils/edgeDanger.js` | Hit-from / edge-danger side weights (DOM vignette math) |
| `src/utils/soloRubberband.js` | Solo-only NPC chase/nitro difficulty curve |
| `party/index.ts` | partyserver Durable Object (relay + room state) |
| `party/roundValidation.ts` / `hostSelection.ts` | Extracted, unit-tested `host_round` validation + promote-oldest |
| `src/netcode/p2pLimits.js` | P2P DataChannel frame/tail size gates |
| `tests/` | Vitest suite (379 tests / 41 files at 2026-07-16) |
| `.cursorrules` | Design spec and AI guardrails |

Full architecture reference: [Game_Architecture.md](../reference/Game_Architecture.md).

---

## 4. Current status

**Phases 1–3 largely complete; Phase 4 (Multiplayer & Infrastructure) is active.** What works today:

- **Core game** — fully playable host-authoritative multiplayer with client-side rewind-and-replay prediction; solo mode (private `soloXXXXXX` room + NPCs) runs the same path.
- **Physics & feel** — convex-hull + primitive colliders across all three arenas; July 9 feel pass (hit feedback parity, hit-stop presentation, haptics, remote boost/hop FX); July 10 solo polish (directional hit vignette, hop landing thud, NPC rare hop, solo AI rubberband).
- **Content** — three elevated arenas (Cart Rave / Classic Record, The Storerooms, Sundial Station); touch controls; daily/weekly challenges; lifetime cosmetic/level unlocks; personal-best tracking.
- **Presentation** — Store PA announcer; center-stage HUD redesign; production-value + visual-polish + feel passes (July 7–9); Spill Bonus float/feed (July 10).
- **Progression** — lifetime unlocks for patterns (incl. Bolt), sunglasses, custom color, and levels; mid-match unlock toasts; results challenge progress.
- **Living Store** — cargo bay tracks round score (spill-rush comeback, top-heavy grip); Store PA issues mid-round directives (Flash Sale / Double Bag / Express Lane / Spill Bonus / Rush Hour) with HUD chip + focus callouts + Spill Bonus presentation.
- **Solo path** — private room + 3 NPCs; first-solo cold-load hardening; score-lead rubberband for bots (solo only).
- **Perf foundations** — lazy game music, Draco cart models, self-hosted fonts, half-res bloom, prop LOD, auto-quality watchdog, menu preview LOD.

**Next / open** (full plan in [ROADMAP.md](./ROADMAP.md); item level in [BACKLOG.md](./BACKLOG.md)):

| Item | Status |
|------|--------|
| Wyatt playtest queue (Passes 4/5 + stabilization + bloom A/B) | ⚠️ Open — checklist in [STATUS.md](../STATUS.md) |
| Multiplayer runtime smoke test (two browsers, one room) | ⬜ Pending — the V2 gate; includes [Living Store](./living-store-test-plan.md) + [host migration](./host-migration-test-plan.md) checklists |
| Black-frame flicker (VFX-1) | 🟡 Root cause fixed on Storerooms (`98317c1`); promote to default after look check |
| Static netcode hazards (clocks / migration / buffers) | ⬜ Open — [netcode-deep-dive.md](./netcode-deep-dive.md) |
| Menu overhaul + domain cutover | 🧊 Cutover frozen until deliberate event ([brand.md](../brand.md)) |
| Persistent leaderboard (Supabase) | ⬜ Planned (post-V2) |

The full shipped log — including the Phase 4 bug-fix ledger — lives in [completed-work.md](./completed-work.md#phase-4-bug-fix-ledger).

---

## 5. Known issues

All primary high-priority bugs (host cart freeze, ready-up races, ready button redundancies, and alignment offsets) from the original playtests have been resolved. Stale known issues from the Jam era have been cleared.

Current validation / risk focus:

1. Multiplayer runtime integration smoke tests (two browsers, one room) — still the V2 gate; Living Store paths deferred to [living-store-test-plan.md](./living-store-test-plan.md), migration feel to [host-migration-test-plan.md](./host-migration-test-plan.md).
2. Black-frame flicker: root cause **confirmed** (half-res float bloom mips on ANGLE/NVIDIA, D-VFX-2) and fixed on Storerooms; Classic/Sundial still run HDR bloom until the look check promotes the display-referred pipeline.
3. Static netcode hazards — cataloged in [netcode-deep-dive.md](./netcode-deep-dive.md). **Closed in code:** NET-CLK-1/2/3, NET-MIG-1/2, NET-BUF-1. **Still open:** NET-MIG-3, NET-PRES-1, NET-SD-1, NET-2 residual hitch, Living Store host-migration mutator desync.
4. Evicting/resetting in-memory Durable Object state between server builds.
5. Playtest debt: Passes 4/5 + stabilization are behavior-changing and human-unvalidated.
6. Structural / jam-era tech debt (god-file `main.js`, CONFIG-mutating directives, legacy GLTF path, brand freeze) — tracked as MAIN-1 / DIR-1 / GLTF-1 / BRAND-1 etc. in [BACKLOG.md § Tech Debt](./BACKLOG.md#tech-debt); **not** V2 blockers.

### Verified healthy / non-issues (July 10 regression audit)

Static code + gate review of Stability Pass 1 + solo-polish tree. **Not** a substitute for two-browser smoke. Cleared so future agents do not re-investigate as open defects:

| Area | Verdict |
|------|---------|
| SD spectator **per-frame KO spam** (already-flagged spectators at y=-50) | Fixed in Stability Pass 1 (`77d5a52`); `gameFlowSuddenDeath` regression tests cover the fall-loop guard |
| Gameplay music dies after track 1 | Fixed (Howler `load()` before `play()` on `preload:false` tracks) + track index reset per match |
| Lobby stuck on READY when a **non-host** leaves/reaps | Fixed in `party/index.ts` (`#checkAllReady` on leave/reap, not host-only) |
| Customization partial save → body color collapses to magenta | Fixed (partial saves no longer downgrade `custom-hue` → preset) |
| Cart permanently wrong size after shatter/respawn | Fixed (cancel pulse/squash tweens; respawn uses canonical `baseScale`) |
| Solo AI rubberband leaking into multiplayer | Safe — re-armed only when `detectGameMode() === "solo"`; consumers double-gated |
| Hop landing double-thud on non-host clients | Safe — host suppresses floor collision broadcast on hop land; prediction replay sets `onHopLand: null` |
| NPC rare hop in multiplayer clients | Intentional host-sim only (same pattern as NPC nitro); remote hop FX via existing snap `h` rising edge |
| Living Store directive restore on SD / leave-running | Safe — `updateDirectiveEngine` restores CONFIG overrides immediately when not running or in SD |
| Directive lost one-shot / mid-join catch-up | Safe — active directive rides host snapshots as `state.dir` self-heal |
| First-solo cold-load racing menu idle-warm (wrong arena) | Hardened — idle warm suppressed on play entry; level override on cold bootstrap; worst case degrades to full rebuild |
| Near-edge ambient “danger telegraph” missing | **Not a bug** — product cut; only directional **hit** vignette uses `#hud .hud-edge-danger` (see solo-polish session note) |
| Customize tab “cart resize” when opening sunglasses | **Not a bug** — deliberate 1.35× camera zoom (animate later for polish) |
| “Random arena rotation” expected at rematch | **Does not exist** as a feature (not a broken feature) |
| Automated quality gate | `npm run check` green at audit time: tsc, **174** Vitest tests, knip |

Still open after the same audit (do not treat as cleared): host tab background freezes rAF authority; full visible-tab solo drive + two-browser smoke.

**Post-audit micro-passes:**
- **Batch A:** charge SFX stop on fall/SD via `onCartOutOfPlay` → `stopChargeSfxForCart`; hop landing flags cleared in `resetCartTransientState`.
- **Batch B:** `reconstructSuddenDeathSpectators` — multi-way SD victims by y/disabled body, not score-only.
- **Batch C:** `ensureSuddenDeathOnHostPromote` (route 2) — infer SD on promote from clock + human tie.
- **Batch D:** Spill Bonus presentation wire (`MSG.spillBonus` + shared `presentSpillBonusAward`); room level latch (`authoritativeRoomLevelId` on hello/round → `sendHostRound`); menu music bridge `window.__cartRaveTryStartMenuMusic` → `AudioManager.playMenuMusic`.

---

## 6. Dev workflow

| Context | Command | Doc |
|---------|---------|-----|
| `cart-clash` daily dev | `npm run dev:local` | [preview-dev.md](../guides/preview-dev.md) |
| Production local | `npm run dev` + `npm run dev:party` | [README.md](../README.md) |
| Deploy production | `npm run ship` | [deploy-urls.md](../guides/deploy-urls.md) |
| Full gate | `npm run qa` (alias of `check`) | typecheck + test + knip — same as CI |
| Visual QA | `npm run shoot` / `compare` / `blackframes` / `qa:visual` | [visual-qa.md](../guides/visual-qa.md) |

**Dev unlocks:** Vite dev treats all cosmetics/levels as unlocked by default. Force real locks with `?devUnlocks=off` or `localStorage cartRaveDevUnlocks=off`. See `unlockConfig.js` header.

---

## 7. Historical context

This project shipped for **Cursor Vibe Jam 2026** (May 2026) as **Cart Rave**. Post-jam work continues on **`cart-clash`** under the product name **Cart Clash**.

- Session handovers: [handovers/](../archive/handovers/)
- July 2026 session plans (HUD, Sundial, feel): [session-notes/](../archive/session-notes/)
- Shipped feature log: [completed-work.md](./completed-work.md)

**Note:** `project-state.md` previously tracked jam deadline tasks and blocking bugs from April 2026. Those items are resolved or superseded by the Version 2 roadmap.
