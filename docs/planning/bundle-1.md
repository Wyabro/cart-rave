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
| **B** | `bootGameSystems` extract into `src/orchestration/gameBoot.js`, **still statically imported** — mechanical move, **zero byte change** | **done** — see §7 |
| **C** | Flip to `await import()`, wire the **five** triggers, wrap all **nine** `enterPlayMode` sites | **done** — see §8 |
| **D** | Cut the `menuPlayEntry` + `levelOrchestration` eager edges | **done** — see §9 |
| — | ⟵ **ABORT GATE evaluated here, after C+D together** (see §5) | ⏸ **owed Wyatt — needs a deploy** |
| **E** | Move netcode's 7 game-side static imports onto the bridge **+ `main.js`'s `cartOrchestration` edge** (scope corrected by D — see §9) | not started |
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

> **Superseded 08-04 by the warm measurement in §5** — the reasoning below was derived from the *cold*
> profile (87/13 bytes-vs-construction). The locked target is the **warm** repeat visit, where the split
> is ~48/52, so **the gate now spans C+D together**. The paragraph is kept because its second half —
> why the gate must not sit on C *alone* — still holds.

### Why the abort gate is not on C alone

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

**Target locked 08-04 (Wyatt): the WARM repeat visit**, not the cold first load. Honest but the smaller
ceiling — on a warm load the payload is already local, so deferring bytes saves **parse+eval only, not
download**. The bar is therefore tight, and the card may legitimately fail its own abort gate. That was
chosen with the tradeoff on the table.

| Measure | Value | Notes |
|---------|-------|-------|
| `menuReadyMs` (Intel UHD, prod, warm) — **median of 5** | **1,083 ms** | ⟵ the bar |
| samples | 944 · 973 · 1083 · 1089 · 1671 | 1671 is load variance, retained |
| **15% gate target** | **≤ 921 ms** (−162 ms) | |
| `module-eval` (Intel UHD, warm) | _(owed — see below)_ | decides C-vs-D gate placement |
| Date / build | 08-04 · prod `8d96b0b` | |

Judge on **production**, not dev — dev-only probes lie in prod.

> A reading taken "too early" returns `null`, not a small number — `menuReadyMs` is stamped when the mark
> fires, so how long the human waited before reading it cannot bias the sample.

### ⚠ The warm target may invert which lever pays

From the cold n=1: `module-eval` 5,015 → `menu-ready` 5,738, so **`main()`'s body is ~723 ms** and that
part is CPU-bound — it should be roughly cache-independent. If that holds on a warm load:

| | cold (n=1) | warm (inferred, **unverified**) |
|---|---:|---:|
| pre-`main()` fetch+parse+eval (`module-eval`) | 5,015 (87%) | **≈ 360 (33%)** |
| `main()` body → menu-ready | 723 (13%) | ≈ 723 (67%) |
| total | 5,738 | 1,083 |

**If that inference is right, the payoff lever flips on a warm cache.** Lever D (defer bytes) attacks a
~360 ms slice; **Lever C (defer construction) attacks the ~723 ms majority.** The whole argument for
moving the abort gate from C to D was built on the cold profile, where bytes dominate 87/13. Warm is
roughly the inverse.

### ✅ RESOLVED 08-04 — measured, and the gate now spans C+D

Four warm Intel loads (caps 261–264, prod `8d96b0b`):

| cap | `module-eval` | `menu-ready` | `main()` body |
|-----|--------------:|-------------:|--------------:|
| 264 | 474 | 967 | 493 |
| 263 | 471 | 977 | 506 |
| 262 | 447 | 1000 | 553 |
| 261 | 970 | 1467 | 497 |
| **median** | **~472** | **~988** | **~500** |

**The inference was directionally right but numerically wrong** — predicted ~360/~723 (33/67), actual is
~472/~500, i.e. **roughly 50/50**. So neither half dominates on a warm load:

| profile | bytes (pre-`main()`) | construction (`main()` body) |
|---|---:|---:|
| cold (n=1) | 87% | 13% |
| **warm (n=4, the locked target)** | **48%** | **52%** |

**Decision: the 15% gate (≤921 ms) is evaluated after C **and** D together, not after D alone.**
Rationale — Lever D cutting ~300 kB of 1,554 kB is ~19% of the payload, so at best ~90 ms off a 472 ms
parse, which **cannot** clear the 162 ms bar by itself. Lever C moves `bootGameSystems`' construction off
the pre-menu path entirely and is aimed at the larger ~500 ms half. C is now expected to be the bigger
contributor, which is the reverse of what the cold data implied.

This does **not** restore the original "gate on C" placement either — that was rejected for a still-valid
reason (C alone leaves the heavy graph eagerly parsed). **Both levers land, then measure once.**

Record `module-eval` alongside `menuReadyMs` at every future measurement: it is immune to the
metric-gaming failure in §3 abort gate 5, since code motion inside `main()` cannot move it.

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

## 7. Lever B — `gameBoot` extract, static (done 08-04, `a0f1155`)

`src/main.js` **2,582 → 1,259 lines**; new `src/orchestration/gameBoot.js` (1,576) exporting
`bootGameSystems(ctx)`. Still statically imported — the `import()` boundary is Lever C. Also:
`archMap.mjs` five exact `src/orchestration/*.js` claims → one `"src/orchestration/"` prefix
(the granted `tools/` carve-out), `docs/ARCHITECTURE.json` regenerated, 3 test files retargeted
(source-grep anchors), 3 `control-flow.md` anchors.

**Side effect worth noting:** MAIN-1's soft target of ≤1500 lines for `main.js` — missed there at 2,402 —
is now **met at 1,259** as a by-product of this seam.

### Asserts

- [x] `npm run qa` green — **112 files / 1,380 tests**, identical to Lever A
- [x] `npm run build` green
- [x] `npm run battery` — **full 6/6** (gameharness · spawnlock · mpIntegration · hostMigration · hostReload · teardownRejoin)
- [x] Manifest: **256 modules (was 255, +1 = `gameBoot.js`)**; `simulation`/`hud`/`effects`/`gameBoot`/`levelOrchestration`/`bootstrap`/`netcode`/`levelManager` all still in `index`
- [x] `bootGameSystems` call sits ahead of `initMenu()`; the `cartrave:level-changed` listener stayed **eager**
- [⚠] `size:check` **+3,294 B**, over the hand-written ±2 kB assert — **the assert was wrong, not the lever**, see below

### The ±2 kB assert was mis-specified — corrected falsifier for C/D

The plan asserted "initial set within ±2 kB **proves** a pure move." That premise is false: converting
~20 module-scope `let`s into `gameRefs.*` **object properties** is itself a real byte cost, because a
minifier mangles locals to single characters but **cannot mangle property names** (unsafe by default).
133 `refs.*` reads plus a 33-key `ctx` literal accounts for the +3,294 B arithmetically.

The tool's own per-chunk report is the better falsifier, and it is unambiguous:

- initial set still **14 files** — nothing entered or left
- **every non-index chunk Δraw = 0** — all 13 of them
- the entire +3,294 B sits inside `index`

A module-graph change moves chunk membership or other chunk sizes. Neither happened. **Use
"membership unchanged + non-index chunks at Δ0" as the pure-move proof from here on, not a byte total.**
`size:check` itself passed (well inside the +31,097 allowance). Levers C/D should reclaim the 3.2 kB as
the seam's locals collapse back behind the boundary.

### ⚠ One order deviation — needs Wyatt's ear, not a test

A single call site cannot preserve the original order exactly: the moved code straddled
`wireMenuAudioControlsOnce` / `syncAllAudioUi` / `initMenu`. `bootGameSystems` now sits immediately
**before** that trio (the minimum crossing), so **the audio/announcer/directive init block now runs after
composer / levelOrchestration / menuAttract / devControl construction** — all of which reach audio
through lazy getters, and battery is 6/6 green.

It **cannot** move after `initMenu()`: `initMenu` synchronously takes the `?room=` branch into
`enterPlayMode()`, which throws without `initBootstrap()`, and it also calls `HUD.hideGameplayElements()`
and `refs.removePodiumSkipListeners()`.

**Battery does not judge audio ordering — a human does.** Added to the wave checklist: menu music starts
on entry, announcer/stings behave, no doubled or missing audio on first play.

---

## 8. Lever C — `gameBoot` behind `await import()` (done 08-04)

`main.js` drops the static `import { bootGameSystems }` for a module-local latch:
`prefetchGameSystems()` (bare chunk fetch), `ensureGameSystems()` (import + boot, one
shared promise), `isGameSystemsReady()` (sync probe). The former `bootGameSystems({…})`
call site now only **assembles** `gameBootCtx` — same 33 keys, same place in `main()`,
ahead of `initMenu()`.

### The nine `enterPlayMode` call sites

Seven live in `menuPlayEntry.js` and all now route through one `startPlay(modeLabel, opts)`
wrapper (by symbol, not line):

1. `initMenu` → `?room=testdrive…` auto-enter
2. `initMenu` → `?room=solo…` auto-enter
3. `initMenu` → `?room=quickplay` returning-visitor auto-rejoin
4. `cartrave:menu` handler → `action === "joinroom"` (invite link / typed code)
5. `cartrave:menu` handler → `action === "solo"`
6. `cartrave:menu` handler → `action === "quickplay"`
7. `cartrave:menu` handler → `action === "friends"` (room create + join)

The remaining two were listed in §3 as `main.js:1403 / :1673`; **Lever B already moved them
into `gameBoot.js`**, so they are inside the deferred chunk and need no wrapper:

8. `gameBoot.js` — the `onGameStartHandler` menu-hide (`enterPlayMode({ skipBootstrap: true })`)
9. `gameBoot.js` — `invokeHideMenu` on the session bridge

**Overlay policy.** `startPlay` is a straight pass-through when `isGameSystemsReady()` — the
normal case once the idle prefetch has run, byte-for-byte the old behavior. On a cold press
it awaits the boot **inside** `withModeEntryLoading`, which is depth-counted, so
`enterPlayMode`'s own overlay nests instead of showing a second one. Failures still reach
each site's `onMenuBootstrapError`. `index.html`'s boot-error handlers deliberately are not
relied on: they early-return on `window.__cartRaveBootstrapped`, set before menu-ready.

### The five triggers

| # | Where | Shape |
|---|-------|-------|
| 1 | `bootstrap.js` `scheduleIdleWorldWarm` | `prefetchGameSystems()` at the **top** of the 1800 ms timer (fetch overlaps the delay); `ensureGameSystems()` inside `runWarm`, guards re-checked after the await |
| 2 | play press | `startPlay` |
| 3 | `?room=` auto-enter | `startPlay` |
| 4 | `main.js` `if (dbg.harness \|\| dbg.hideHud)` | `ensureGameSystems().then(ensureWorldBootstrapped)` — plus `installVisualHarness`'s `ensureWorld` hook, which `?freeze`/`?cam`/`?ablate` reach **without** taking the harness branch |
| 5 | first netcode hello | `buildNetcodeGameBridge`'s `markFirstHelloReceived` |

⚠ `bootstrap.js`, `menuPlayEntry.js` and `gameSession.js` all take these as **injected
deps**. None may ever `import` `gameBoot.js` — they are eager, and a static edge there
silently undoes the split.

### Lobby-bridge hazard — decision: **(b) trigger 5**, and the hazard is already unreachable

Inventory of which bridge keys can fire before the latch resolves: **none.** Every key in
`buildNetcodeGameBridge` is driven by a live PartyKit socket, and the **only**
`Netcode.initNetcode()` call site in the app is `bootstrapNetcodeFromMenu`, which runs
inside `enterPlayMode`'s `onArenaReady` hooks — i.e. already behind `startPlay`'s await.
`bootstrapNetcodeEntryFromUrl` at module scope only *registers* callbacks and captures
`?room=` for the deferred menu; it opens no connection.

So option (a) — a thin eager `sessionBridgeCtx` partial — would be **dead code guarding an
unreachable window**, and a partial bridge is worse than none: it makes a future
pre-latch connect *look* alive while slot colour, `onGameStartHandler` and host-migration
handlers silently no-op. Option (b) fails loud-and-correct instead: the first hello forces
the boot. It is wired as a fail-safe (`void ensureGameSystems()`, fire-and-forget so the
netcode message pump is never blocked), not as the load-bearing path.

### One behavior fix this lever required

`initMenu()` now runs **before** the HUD exists, so its `HUD.hideGameplayElements()` /
`hideAudioWidget()` landed on an un-inited HUD (null-safe no-ops) and `HUD.init` then built
a fresh `#hud` with nothing left to hide it — a gameplay HUD painting over the title screen
the moment the idle warm resolved. `gameBoot` now re-applies the menu HUD state
(`hideGameplayElements` + `hideAudioWidget` + `updateTouchControlsVisibility`) at the end of
its boot when `refs.menuVisible`.

### Asserts

- [x] `npm run qa` green — **112 files / 1,380 tests**, identical to Levers A and B
- [x] `npm run build` green
- [x] Manifest: **22 chunks / 256 modules** (unchanged). A new **`gameBoot` chunk exists
  and is OUTSIDE the initial set** (21,820 B raw). Modules that left `index`:
  `src/orchestration/gameBoot.js` and `src/announcer/announcerVoiceKeys.js` — exactly the
  seam and nothing else
- [x] Initial set **1,544,336 B (−10,527 B)** vs the Lever A baseline. Modest, as predicted:
  the heavy graph is still eagerly reachable via `levelOrchestration` + `menuPlayEntry`
  until Lever D
- [⚠] `size:check` **exits 1** on `chunk ENTERED the initial set: gamepadNav` — see below

### ⚠ `size:check` red — an entry-chunk *rename*, not a re-eagered module

Rolldown split the old monolithic `index` entry into `index` (23 modules, 118,290 B) plus a
new preloaded shared chunk it named after its first `node_modules`-path group, **`gamepadNav`
(92 modules, 531,977 B)**. 118,290 + 531,977 = 650,267 vs the baseline `index`'s 660,794 —
the same code, 10,527 B lighter, under two names. Every one of the other 13 baseline chunks
is at **Δraw = 0**, and none of the known-deferred chunks (`rapier`, `zanzibarPlatform`,
`backroomsSupermarket`, `classicRecord`, `testArena`, `devControl`, the second
`captureUpload`) has entered.

The membership rule fired correctly on its own terms — it cannot distinguish "a deferred
module got re-eagered" from "the entry chunk was renamed and split". **Deliberately NOT
re-baselined here:** Lever F owns the ratchet, and Levers D/E are still measured against the
Lever A number. Whoever runs F must re-baseline and should consider whether `strippedKey`
needs an entry-chunk alias so a rename cannot masquerade as a regression.

### Not fixed here

- `initMenu`'s `scheduleMenuLevelPreview()` for `testArena` now runs before `initLevelManager`,
  so it is a no-op rather than a deferred preview. Covered in practice: the idle warm calls
  `scheduleMenuLevelPreview()` again after the world bootstraps. Worth a look at D.
- The audio/announcer init block now runs **after** `initMenu()`, a bigger version of Lever
  B's §7 order deviation. Battery does not judge audio ordering — **a human must confirm**
  menu music starts on entry, announcer/stings behave, and there is no doubled or missing
  audio on first play.

---

## 9. Lever D — edge cuts (done 08-04, `399b2ad`)

New `src/orchestration/gameTeardownHooks.js` (dependency-free hook table, 10 hooks, all defaulting to
no-ops, registered by `gameBoot`). `menuPlayEntry` dropped 4 static imports; `main.js` 1,360 → 1,262
lines and had **95 provably-dead imports pruned** (occurrence scan + `tsc --noEmit`, knip clean).
`createLevelOrchestration` moved behind the boundary.

**Scope taken beyond the two edges, and it was necessary:** `main.js` imported `hud.js` for the same
reason `menuPlayEntry` did, so Edge 1 alone would have cut nothing — its four HUD calls route through
the same table. Two sibling edges (`Effects.initEffects` + `spawnTrashBurstRef`;
`createGameContext().registerModules({Simulation, Entities, HUD})` + `triggerCartShatterRef`) moved into
`gameBoot` in the same style. No new design invented.

**`level.*` null-safety audit** — four unguarded menu-reachable reads found and fixed to `gameRefs.level?.`:
menuAttract's `onAnimationTick` (sceneExtras / levelUpdate / raveDressing), `handleQualityTierChange`,
`handleAutoQualityStepDown`, and the `getNetDebug` diag probe. The quality-change path additionally
`await ensureGameSystems()` under the overlay that is already up — silently skipping would have broken
menu quality changes. `cartrave:level-changed` stayed eager and thin.

### Result: −79,872 B, and the rest is blocked on E

Initial set **1,554,863 → 1,474,991 B (−79,872, −5.1%)**. Entry-family arithmetic (the `gamepadNav`
false positive persists): 91,157 + 489,765 = 580,922 vs baseline `index` 660,794 = **−79,872**, all 13
other baseline chunks Δ0.

| module | chunk | in initial set? |
|---|---|---|
| `orchestration/levelOrchestration.js` | `gameBoot` | **OUT** ✅ |
| `effects.js` · `simulation.js` · `hud.js` · `netcode.js` · `cartOrchestration.js` | `gamepadNav` | still IN ❌ |
| `cartShatter.js` · `effects/waterDeathFx.js` | own chunks | still IN ❌ |

Gates: qa **112 files / 1,380 tests** · build green · **battery 6/6** · `shoot` default + `--level
backrooms` both `worldReady=true` (zanzibar skipped per SHOOT-LEVEL-1).

### ⚠ Lever E's scope is bigger than planned — verified

The four game-only chunks **cannot** leave the preload set until E lands, and **cutting `netcode.js`
alone will not do it.** `hud.js` is reached by **two** eager paths from `main.js`:

1. `main.js` → `netcode.js` → (its 7 static game imports)
2. `main.js` → `orchestration/cartOrchestration.js` → `hud.js` — kept for `displayColorHexForSlot` /
   `shuffledClientNpcNames`

**E must cut both**, or the bytes stay. `roundLifecycle.js` and `loopDeps.js` also import `hud.js`, but
both are already behind the boundary via `gameBoot`.

---

## 10. ⛔ ABORT GATE FAILED after C+D — measured 08-04, prod `f531e02`

Intel UHD, warm, lobby-phase F8 captures. **The card has not made the menu faster on its locked target.**

| metric | pre (`8d96b0b`) | post (`f531e02`, n=7) | change |
|---|---:|---:|---:|
| `module-eval` (parse) | ~472 | **563** | **+91 WORSE** |
| `main()` body (construction) | ~501 | 476 | −25 |
| `menu-ready` | 988 (caps) / 1083 (console) | **1067** | **flat to worse** |

Post samples (caps 265–271): 907 · 1019 · 1022 · 1067 · 1084 · 1097 · 1728 → median **1067**.
Pre samples: caps 967 · 977 · 1000 · 1467; console 944 · 973 · 1083 · 1089 · 1671.
Dropping the high outlier from both sets does not rescue it (1044 post vs 1028 pre).

**A single early capture (cap-265, 907 ms) read as a pass and was reported as one before the rest
arrived. It was the best of seven.** Cause: the measurement instruction said "F8 on the last load" to
save keystrokes, which yields n=1. **Always F8 every load — the gate needs a median, and the
run-to-run spread here (907–1728) is larger than the effect being measured.**

### Why parse regressed

Rolldown split the entry chunk into `index` + `gamepadNav`, so the browser fetches **two** preloaded
chunks where it fetched one, with `gameBoot` behind them. That request overhead plus lost cross-chunk
minification context appears to exceed Lever C's construction saving. Construction moved only 25 ms,
not the 103 ms the single sample implied.

### Decision 08-04: Wyatt acked running Lever E anyway

The gate's own rule (§3 abort gate 2) is "stop before E." The concern was raised with the data and
**Wyatt chose to proceed** — E is the only remaining lever that touches the parse half, since it is what
frees `effects` / `simulation` / `hud` / `cartShatter` / `waterDeathFx` (~500 kB) from the preload set.

**E's hypothesis, stated so it can be falsified:** removing ~500 kB from the initial download set should
cut `module-eval`. **If post-E `module-eval` does not drop clearly below the pre-card ~472 ms — not just
below the regressed 563 — the hypothesis is dead and the card closes as a partial.** Measure with F8 on
**every** load, n≥5.

### Banked regardless of E

- **Lever A** — a bundle-size gate the repo did not have. Independent of any perf outcome.
- **Lever B** — `main.js` 2,582 → 1,262 lines; MAIN-1's missed ≤1500 target, met. Perf-neutral.
- **Lever D's −79,872 B is real for COLD loads.** Warm was the locked target and warm has the bytes
  already local — a first-time visitor still downloads 80 kB less.

---

## 6. Notes carried out of Lever A (not fixed here)

- `docs/bundle-budget.json` records `generatedAt`, so a `size:update` always dirties the file even at zero byte delta. Intentional (provenance), but do not read a diff on that line as a size change.
- The stale check compares `dist/index.html` mtime to the newest `src/**` mtime only. Edits to `index.html`, `public/`, or `vite.config.js` do not mark the build stale.
- Two `captureUpload-*.js` chunks exist in `dist/`; only the 1,074 B one is preloaded. `analyzeInitialSet` falls back to the full filename if two initial-set chunks ever collide on a stripped key rather than silently merging them.

Carried out of **Lever B**:

- `src/main.js` still carries ~18 genuinely unused imports (`RAPIER`, `Visuals`, `clamp`, `ChallengeTracker`, `PROGRESSION_EVENTS`, `getMatchStats`, `snapshotMatchStats`, `shouldAllowPodiumEnd`, `notePodiumEndSend`, `animateResultsPodiumShow`, `cancelResultsAnimations`, `spawnResultsConfetti`, `spawnResultsDefeatWilt`, `resetArenaReactiveLights`, `ensureSuddenDeathOnHostPromote`, `clearNpcCartCache`, `armRoundStartRenderProbe`, `resetSessionCartBootstrap`, `getLastSuccessfulHelloGen`). Pre-existing and knip-clean today. Left untouched **deliberately** in B to keep the module graph identical for the pure-move proof — **prune them in Lever F** for free bytes.
- The repo has no eslint config for ESLint 10 (`npx eslint` fails outright), so `tsc --noEmit` is the only static undefined-name check in the chain. It passed. Worth a tooling card someday — not this one.
