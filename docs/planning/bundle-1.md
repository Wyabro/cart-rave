# BUNDLE-1 — Menu/game code-split (wave plan)

**Status:** **Lever A landed** 08-04 — byte budget + baseline committed. Levers B+ not started.
**Card:** [BACKLOG.md](./BACKLOG.md) · BUNDLE-1 (Low · Tech debt) — unblocked 08-04 by MAIN-1.
**Branch:** `cart-clash`
**Ack unit:** one lever at a time. **Commit unit:** one lever per commit.
**Execution:** one subagent per lever (same shape as [MAIN-1 §4](./main-1.md)) — orchestrator holds the plan/STATUS spine.
**Mid-wave abort:** a failed lever blocks the card. Stop and report; do not improvise a different design.

---

## 1. Goal (done condition)

| Today | After BUNDLE-1 |
|-------|----------------|
| The initial download set is **14 files / 1,554,863 raw bytes** — the menu pays for the whole game (three, rapier glue, scene, FX, cart shatter) before it can draw | Menu-critical code only in the initial set; in-round modules arrive on play entry |
| No bundle-size gate exists anywhere in the repo — a regression is invisible until someone reads a build log | `npm run size:check` gates the initial set on **bytes** and on **set membership**; `release:check` runs it with `--require-dist` |
| "Did that module actually leave the entry chunk?" is eyeballed from the Vite build table | `dist/.chunk-manifest.json` gives a mechanical module → chunk assert |

**Not goals:** shrink `three` itself · asset/texture budget · a lazy-loading framework · behavior change of any kind.

**Player-visible bar:** menu appears no later than today and every entry path (quickplay · friends · invite · solo · testdrive) still reaches `carts-ready`.

---

## 2. Locked decisions

| Decision | Value |
|----------|--------|
| What is measured | The **initial download set** — the `<script type="module">` in `dist/index.html` **plus every `<link rel="modulepreload">`**. Gating on `index-*.js` alone is defeatable by moving code to a sibling chunk that is still preloaded |
| Baseline keys | **Hash-stripped chunk names** (`index-BuD_HIUu.js` → `index`). `vite.config.js`'s build stamp bakes `builtAt` into the entry chunk, so **content hashes churn on every build even with zero source changes** — a hash-keyed baseline would be dead on arrival |
| gzip column | **Comparison proxy only.** Cloudflare serves brotli; the gzip number is used because it is deterministic and dependency-free. Never quote it as wire bytes |
| Failure rule | raw total > `budget + max(2%, 20 000 B)` **or** any chunk newly **ENTERS** the preload set. A chunk **leaving** the set is reported, never fatal |
| Stale dist | Standalone: log loudly, **exit 0** (never gate a dev machine on a dist it has not built). Under `--require-dist`: the same condition is **exit 1**. A silent skip must not be able to green the release gate |
| Chunking config | `build.rolldownOptions.output.codeSplitting.groups` stays **`node_modules`-path-only**. **No `manualChunks`** — it regressed before (rolldown folded three into the "animejs" chunk) |
| tools/ freeze | Carve-out for this card only: `tools/bundle-budget.mjs`, the `release-check.mjs` wiring, and a later one-line `archMap.mjs` claim. No other tool, no `.claude/hooks/`, no `.agents/` |

---

## 3. Levers

| Lever | Goal | Status |
|-------|------|--------|
| **A** | Byte budget tool + committed baseline + chunk manifest (**no `src/` changes**) | **done** — see §4 |
| **B** | `bootGameSystems` extract into `src/orchestration/gameBoot.js`, **still statically imported** — mechanical move, **zero byte change** | ⏸ next |
| **C** | Flip to `await import()`, wire the **five** triggers, wrap all **nine** `enterPlayMode` sites | not started |
| **D** | Cut the `menuPlayEntry` + `levelOrchestration` eager edges ⟵ **ABORT GATE** | not started |
| **E** | Move netcode's 7 game-side static imports onto the `registerGameCallbacks` bridge | not started |
| **F** | Re-baseline (ratchet), docs, ship | not started |

Lever A is the card's insurance: if every later lever aborts, the durable guard still ships.

**The core problem is not "move 900 lines."** `main()` (`src/main.js:324-2578`) is one ~2250-line closure
that builds every game system **before** `initMenu()` at `:1376`. The card cuts **four import edges**;
the code motion is a consequence. Edge 1 = `main.js` top level (B/C). Edge 2 = `main.js` →
`levelOrchestration` via `createLevelOrchestration` at `:824` (D). Edge 3 = `menuPlayEntry` →
HUD/directives/announcer/ambience (D). Edge 4 = `netcode.js`'s 7 game imports (E).

**Load-bearing insight:** `levelOrchestration` is **not** game-only — it owns the *menu* preview path
(`finalizeArenaShellForMenu` `:369`, `maskMenuPreviewSwap` `:553`), consumed by `levelManager.js:223/376`,
and `initLevelManager` runs at `:1322`, before the menu. It is still deferrable, but **only because the
arena work it drives is already time-deferred to the 1800 ms idle warm** (`bootstrap.js:531`).
Already-late-in-time ⇒ safe-to-be-late-in-bytes.

### Why the abort gate is on D, not C

`createLevelOrchestration` (`main.js:824`) stays eager through C, and it is the static edge dragging
Simulation / Effects / cartShatter / waterDeathFx into the eager graph. So **C defers construction
inside `main()`, not parse+eval of the heavy graph** — bytes barely move until D. Putting the 15% gate
on C would fail for the wrong reason and kill the wave right before the lever that pays.

- **C's bar:** structural green + no PLAY regression. **A near-zero byte delta at C is a PASS.**
- **D's bar:** 15% `menuReadyMs` drop vs the Lever A median **and** the four game-only chunks gone
  from the preload set.

### Abort gates — decided up front

1. **Three.js floor.** `three` 689 kB + `cartRaveGltf` + `cart-rave-menu` + `customization` + `scene.js`
   are all menu-required; the initial set cannot go below ~850 kB–1.0 MB raw. A successful card may only
   move ~150–300 kB of 1,554,863. **The pass bar is `menuReadyMs`, not "half the download."**
2. **<15% `menuReadyMs` drop at D** → stop before E, re-scope to budget-only.
3. **Lever E judged too risky** → netcode keeps 7 modules eager, byte win roughly halves. Acceptable
   partial outcome; **decide it, don't discover it.** A–D still ship.
4. **PLAY gets slower** on any path (pre-prefetch press, harness, hidden tab) → cannot ship.
5. **Metric gaming.** `cr:menu-ready` is `main.js:2317`, ~940 lines *after* `initMenu()` — it counts both
   halves of `main()`, so pure code motion moves the number without moving perceived paint.
   **Guard: `cr:milestone-90` and first-attract-frame must move too.**

### Seam design (for whoever runs B–D)

**New module `src/orchestration/gameBoot.js`** exporting `bootGameSystems(ctx)`, idempotent via a
module-local latched promise so all triggers share one load. `main.js` keeps a thin `ensureGameSystems()`.
`archMap.mjs:58` claims the five `src/orchestration/*.js` files by **exact path**, and `archModel.mjs:71`
already supports trailing-slash prefixes — so the claim is a **one-line swap to `"src/orchestration/"`**,
which also stops future orchestration files tripping `ARCH_UNMAPPED_FILE`.

**Stays eager:** boot marks, `initLoadingScreen`, canvas/audio, `createMenuPlayEntry` (`:490`), renderer
(`:572`), scene (`:649`), camera (`:656`), composer (`:803`), camera framing (`:1016`), `initMenuAttract`
(`:872`), graphics toggles, diagnostics/harness installers, `enableModeMenuButtons`, the `cr:menu-ready`
mark, `initMenu()`.

**Moves behind the boundary:** audio/sfx/announcer/directives init (`:689-800`), `HUD.init` (`:1083`),
`initResultsOverlay` (`:1147`), `createCartOrchestration` (`:1154`), `createLoopDeps` (`:1230`),
`createRoundLifecycle` (`:1235`), `initLevelManager` (`:1322`), `initBootstrap` (`:1344`), and
`:1379-2260`. **`createLevelOrchestration` (`:824`) joins them at D, not B/C.**

**The `refs` object.** ~20 module-scope `let`s in `main.js` (`hud`, `allCartsRef`, `getAxisRef`,
`triggerRamBoostRef`, `matchHistory`, `pendingMidRoundJoinRespawnConnId`, …) are written by the game half
and read by the menu half. Replace with **one mutable `gameRefs` object** at module scope, passed as
`ctx.refs`; property mutation crosses a chunk boundary safely. **Highest-value review point in the card:**
the diagnostics/harness installers that stay in `main.js` (`:2321+`) close over those `let`s today
(`getCarts: () => allCartsRef`). Every one must become `() => refs.allCartsRef` — a miss is a
permanently-null probe in the very F8 capture bundles this card is measured with, and nothing tests it.

**Keep the `cartrave:level-changed` listener EAGER** (`main.js:1387`). `canSafelyRebuildLevel()` returns
false when `!deps` (`levelManager.js:203-204`), so a pre-init call is a safe no-op — but safe is not
handled: moving the listener would turn arena-picker clicks during the prefetch window into **lost**
events, not deferred ones. Thin eager listener → `scheduleMenuLevelPreview()` only.

**Five triggers, one latch:** (1) idle prefetch in `scheduleIdleWorldWarm`'s `runWarm`
(`bootstrap.js:534`) via an **injected opt — `bootstrap.js` must never import `gameBoot.js`**, it is eager
and that would undo the split; also fire a bare prefetch at the *top* of the 1800 ms timer so the fetch
overlaps the delay. (2) play press via one `startPlay()` wrapper, awaiting inside the existing mode-entry
overlay, failing to `onMenuBootstrapError` (`menuPlayEntry.js:184`). (3) `?room=` auto-enter, same wrapper.
(4) **the harness branch `main.js:2543`** (`if (dbg.harness || dbg.hideHud)`) which bypasses idle warm —
non-optional, every `shoot`/`blackframes` capture takes it. (5) **first netcode hello / friends connect**
— see the lobby-bridge hazard.

**`enterPlayMode` has NINE call sites** — `menuPlayEntry.js` `:327 :338 :352 :393 :407 :416 :432` and
`main.js` `:1403` (onGameStart) · `:1673` (invokeHideMenu). `bootstrap.js:106` throws
`"initBootstrap() must run before enterPlayMode()"`, so a missed site is a **hard crash**, not a soft degrade.

**Lobby-bridge hazard — NET-1 class, resolve in B/C, not E.** `bootstrapNetcodeEntryFromUrl` runs at
module scope (`main.js:2571`) and `registerGameCallbacks` is wired at `gameSession.js:118` reading
`() => sessionBridgeCtx.current` — but **`sessionBridgeCtx.current` is assigned at `main.js:1648`, inside
the move range.** Between menu paint and the first `ensureGameSystems()` the bridge live-reads `null`:
slot colour/material bridges no-op, `onGameStartHandler` and host-migration handlers are absent. A friends
or `?room=` lobby in the first ~1.8 s — **or indefinitely with a hidden tab or suppressed idle warm** —
would run on a dead bridge. **Decide and record here before B ships:** either (a) a thin eager
`sessionBridgeCtx` partial covering the keys a menu-only lobby needs, or (b) trigger 5.

**Lever E callback lifetime: mutate the shared context, do NOT re-register.** `buildNetcodeGameBridge`
(`gameSession.js:226`) already returns live-reading lambdas with null-safe fallbacks, registered once.
`gameBoot` merges handlers into `sessionBridgeCtx.current` and the existing lambdas pick them up live.
The E inventory must mark which of the 7 imports' call sites can fire **before** the latch resolves; a
soft no-op default is acceptable **only** where the code already tolerates "world not ready."

---

## 4. Lever A — byte budget tool + baseline (done 08-04)

**Files:**

- `tools/bundle-budget.mjs` — measures the initial set; exports `analyzeInitialSet(html, sizeByFile)` (pure, unit-testable without a build), `compareToBaseline`, `strippedKey`
- `docs/bundle-budget.json` — committed baseline (`dist/` is gitignored, so the budget must be a committed *number*, never an artifact)
- `tests/bundleBudget.test.js` — pure-core cases **and** the `--require-dist` exit-code contract
- `vite.config.js` — `writeChunkManifest()` plugin alongside `stripOrphanDracoBuildAssets()`, writing `dist/.chunk-manifest.json` from `generateBundle`'s `bundle[file].moduleIds`
- `package.json` — `size:check` / `size:update`
- `tools/release-check.mjs` — `size:check -- --require-dist` after the build step, as a `reasons` entry

**Commands:**

```
npm run size:check                    # gate against docs/bundle-budget.json
npm run size:check -- --report        # always print the per-chunk table
npm run size:check -- --require-dist  # missing/stale dist is fatal (release gate)
npm run size:update                   # re-baseline from the current dist/
```

### Baseline — initial download set (14 files)

Captured 08-04 on `cart-clash` at the Lever A build. gzip = zlib default level, **proxy only**.

| Chunk (hash-stripped) | raw B | gzip B* |
|-----------------------|------:|--------:|
| `three` | 689,139 | 174,623 |
| `index` (entry) | 660,794 | 215,105 |
| `animejs` | 48,376 | 18,005 |
| `waterDeathFx` | 38,995 | 13,002 |
| `scene` | 36,861 | 14,095 |
| `howler` | 35,952 | 9,541 |
| `cartShatter` | 27,114 | 8,507 |
| `diagnostics` | 5,852 | 2,839 |
| `koReactors` | 5,581 | 2,218 |
| `contactShadows` | 3,177 | 1,549 |
| `utils` | 1,189 | 601 |
| `captureUpload` | 1,074 | 622 |
| `levelLod` | 532 | 359 |
| `rolldown-runtime` | 227 | 194 |
| **Initial set total** | **1,554,863** (1518.4 kB) | **461,260** (450.4 kB) |

\* brotli is what production actually serves; this column exists to compare builds to each other.

**Not in the initial set** (already deferred, do not regress them back in): `rapier` (183,373 B), `zanzibarPlatform`, `backroomsSupermarket`, `classicRecord`, `testArena`, `devControl`, the second `captureUpload` chunk. Any of these appearing as `ENTERED` is a Lever A failure signal even if bytes look fine.

### Asserts (Lever A)

- [x] `npm run qa` green — **112 files / 1,380 tests** (knip · briefing · arch · health all clean)
- [x] `npm run build` green
- [x] `npm run size:check` green against the freshly written baseline — delta **0 B**
- [x] **Hash stability:** all 22 emitted chunks are **byte-identical** before vs after adding the manifest plugin. Filename *hashes* are not comparable and never were: `builtAt` in the build stamp changes the entry chunk on every build, and every chunk importing it inherits the churn — verified by two consecutive no-change builds producing different `index-*.js` hashes with the plugin already installed. The plugin writes via `fs` in `closeBundle` (not `this.emitFile`) and mutates nothing in `bundle`
- [x] **Manifest sanity:** `dist/.chunk-manifest.json` maps `src/simulation.js`, `src/hud.js`, `src/effects.js` → the `index` chunk (22 chunks / 255 modules)

---

## 5. `menuReadyMs` baseline — **owed Wyatt**

The byte budget is a proxy for the thing players feel. Before any split lands, record what "menu ready" costs today so a later lever can claim a real win instead of a smaller number. **This is the number Lever D's 15% abort gate is measured against — the card cannot be judged without it.**

**Why it must be a human on a real machine:** the in-app browser pane does not composite frames while hidden, so rAF never fires there and an agent cannot collect this. It needs a real cold load on the weak box.

### How to capture it

The Intel iGPU box is the one that matters — it is the machine this card is *for*. The 4090 row is context, not the bar.

1. Open `https://cart-rave.wyabro.workers.dev/?diag=1` and **hard-refresh** (Ctrl+Shift+R). Cold load per sample: a warm HTTP cache measures a different thing.
2. When the menu buttons become clickable, open the console and run:
   `__ccDiag.snapshot("boot")`
3. Record **`menuReadyMs`**, plus **`milestone-90`** and the `world-ready` entry from `timeline` — those two are the metric-gaming guard (see §3 abort gate 5: `cr:menu-ready` sits ~940 lines after `initMenu()`, so pure code motion can move it without moving perceived paint).
4. **Repeat 5 times**, hard-refreshing between each. Record the **median**, not a single sample, plus the spread.
5. Press **F8** on the last one so the numbers land in a capture bundle, then `npm run captures:pull`.

| Measure | Value | Notes |
|---------|-------|-------|
| `menuReadyMs` (Intel iGPU, prod) — **median of 5** | _(to fill)_ | the bar |
| `menuReadyMs` (Intel iGPU) — spread (min–max) | _(to fill)_ | |
| `milestone-90` (Intel iGPU, median) | _(to fill)_ | anti-gaming guard |
| `menuReadyMs` (4090, prod, median of 5) | _(to fill)_ | context only |
| Date / build SHA | _(to fill)_ | |

Judge on **production**, not dev — dev-only probes lie in prod.

### Provisional n=1 reading — recovered from the MAIN-1 retest captures (08-04)

`menuReadyMs` is stamped once per page load and rides in **every** capture from that load, so the
Intel UHD retest bundles already carry a boot timeline. cap-256 and cap-260 (`8d96b0b`, Intel UHD,
`low`) are the **same page load** and report identical values — this is **n=1, not a median**, and the
HTTP-cache state of that load is unknown. It does not replace the 5-sample capture above.

| Mark | tMs | Share of menu-ready |
|------|----:|--------------------:|
| `module-eval` | 5,015 | **87%** |
| `menu-ready` | 5,738 | 100% |
| `milestone-75` | 6,774 | |
| `world-ready` | 10,662 | |
| `carts-ready` | 17,561 | |

**This is the most important number the card has, and it sharpens the whole plan.** `module-eval` is
marked on the **first line of `main()`** (`src/main.js:330`), which runs only after the entire import
graph has been fetched, parsed and evaluated. So on the target machine, **~5.0 s of the 5.7 s to an
interactive menu is spent before `main()` executes a single statement** — that is fetch + parse + eval
of the 1,554,863-byte initial set. Only ~723 ms is `main()`'s body.

Consequences:

1. **It confirms the abort gate belongs on D, not C.** Lever C defers *construction*, which lives in the
   723 ms tail — at best a fraction of a fraction. Lever D defers *bytes*, which attacks the 5,015 ms.
   Had the gate stayed on C, the card would almost certainly have aborted on a number it was never
   positioned to move.
2. **The 15% bar (~861 ms) looks reachable but not free.** It requires a real byte cut: roughly
   300 kB of 1,554 kB is ~19% of the payload, and only if `module-eval` scales with payload rather than
   being dominated by a fixed cost (connection setup, three.js parse). **Lever D must measure this, not
   assume it** — if `module-eval` barely moves after D's cut, the three.js floor (§3 abort gate 1) is the
   real ceiling and the card should re-scope to budget-only rather than push into E.
3. **`module-eval` is the honest supporting metric to record alongside `menuReadyMs`** — it cannot be
   moved by code motion within `main()`, so it is immune to the metric-gaming failure in abort gate 5.

---

## 6. Notes carried out of Lever A (not fixed here)

- `docs/bundle-budget.json` records `generatedAt`, so a `size:update` always dirties the file even at zero byte delta. Intentional (provenance), but do not read a diff on that line as a size change.
- The stale check compares `dist/index.html` mtime to the newest `src/**` mtime only. Edits to `index.html`, `public/`, or `vite.config.js` do not mark the build stale.
- Two `captureUpload-*.js` chunks exist in `dist/`; only the 1,074 B one is preloaded. `analyzeInitialSet` falls back to the full filename if two initial-set chunks ever collide on a stripped key rather than silently merging them.
