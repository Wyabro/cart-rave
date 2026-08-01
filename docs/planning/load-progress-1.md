# LOAD-PROGRESS-1 — the arena loading meter is decorative for the whole build

**STATUS: ACK'D 2026-08-01 · READY — NOT STARTED.** Planned in the session that shipped
RESULTS-ACT-1 (`f42515f`) and HUD-BOOST-PODIUM-1 (`824b0a1`); deliberately deferred to a fresh
window. **Everything needed is in this file — no prior conversation required.**

Line references verified against HEAD `e80d87c`. **This document overturns the original
BACKLOG diagnosis** — see "Three corrections" below before reading that row.

## Context

`npm run loadshots` records the mode-entry meter's full value timeline. A cold `classicRecord`
entry at 1920×1080, reproduced on three consecutive runs across all three arena themes:

```
0% @25091ms → 15% @25126ms → ……… 11.5 SECONDS OF NOTHING ……… → 88% @36628ms
                                            → 94%/96% (same ms) → 100% @39446ms
```

The bar sits at 15% for ~85% of the load, then does the other 85 points in under 3 seconds. The
player watches a frozen meter through the longest part of the wait.

### Three corrections to the filed diagnosis — carry all of them

1. **The 60% milestone can never paint, on any path.** `levels/index.js:112` `onProgress?.(60)`
   and `:154` `onProgress?.(90)` are separated by **zero await points** — `:122` `initFn(...)`
   is fully synchronous (cold classic goes `classicRecord.js` → `initArena`,
   `arena.js:1394-2575`, which contains no `await`). `setProgress`
   (`ui/loadingScreen.js:195-207`) does raw DOM writes and the browser cannot paint mid-task, so
   90 overwrites 60 in the same frame. **Forwarding `onProgress` fixes far less than the BACKLOG
   row implies** — which is why this plan does not lead with it.
2. **The blocking await is `levelManager.js:247`** (`await d.ensureWorldBootstrapped(selected)`),
   not `bootstrap.js:462` (which is `await d.rebuildLevelIfNeeded(levelId, reportProgress)`).
   The flight it joins was created fire-and-forget at `bootstrap.js:443`, or under `?harness=1`
   even earlier at `main.js:5667`.
3. **The 90→88 backwards step is not on the "warm" path.** True warm
   (`bootstrap.js:453-456`) never runs `loadLevel` at all. The regression is on
   **world-warm-but-arena-stale** — idle warm built arena A and the player picked B, or a menu
   preview set `previewNeedsFullRebuild`. There `levelManager.js:267` really does forward the
   reporter, `levels/index.js:154` writes 90, and `bootstrap.js:463` then writes 88 over it.

### What actually fires cold — the whole list

| # | Site | Value | Painted? |
|---|---|---|---|
| 1 | `ui/loadingScreen.js:408` | 0 | yes |
| 2 | `bootstrap.js:431` | 5 | no — same task as #3 |
| 3 | `bootstrap.js:461` | 15 | yes |
| — | *11.5s silence* | | |
| 4 | `bootstrap.js:463` | 88 | yes |
| 5 | `bootstrap.js:476` | 94 | overwritten by #6 |
| 6 | `main.js:1719` | 96 | yes |
| 7 | `bootstrap.js:484` | 100 | yes |

**The silence is real work**, all inside `ensureWorldBootstrapped`: Rapier WASM (~1.5 MB dynamic
import), the PMREM env bake (`scene.js:253-291`), the level chunk import, the synchronous
`initFn`, `finalizeArenaForPlay` → `ensureRaveAttractShell({includeJuice:true})`, and
`warmupActiveSceneShaders` — whose own comment (`main.js:2878-2882`) measured **1.7–4.2s** of
longtasks in captures 45–51.

**This bug was already solved once, for the boot splash.** BOOT-METER-1 shipped
`window.__crBootFloor` (`index.html:597-608`): a **monotonic floor** plus an **ambient ticker**
that creeps between real milestones and self-caps below the next one. Its comment says why:

> *"Real-milestone floor: module code raises the bar when actual boot work completes; the fake
> ticker keeps ambient motion between milestones."* … *"Floor only goes up."*

The mode-entry overlay never got that treatment. **This card ports it.**

**Intended outcome:** the meter moves continuously through the whole load, never goes backwards,
and its anchor points are real events rather than interpolation.

## Approach — floor + ticker + boot-phase anchors

Three parts, in `src/ui/loadingScreen.js` plus one thin bridge. **No changes to `arena.js`,
`levelManager.js`, `bootstrapWorldCore`, or any level module.**

### 1 · Monotonic floor in `setProgress` (`ui/loadingScreen.js:195-207`)

It clamps to `[0,100]` and nothing else, so 88 paints over 90. Add a module-level
`modeProgressValue`, reset to 0 in `showModeEntryLoading` (`:408`), and ignore any write below
it. Mirror `index.html:603-608`'s shape and cite it in the comment.

This alone fixes the backwards step on the world-warm-but-arena-stale path.

### 2 · Ambient ticker inside `withModeEntryLoading` (`:493`)

An interval that creeps the bar toward — but never past — the next real anchor, exactly like
`index.html:581-596`. Start it after `showModeEntryLoading`; **clear it in the existing `finally`
at `:528-534`**, including on the throw path.

Each real report sets a new floor **and an explicit next-ceiling** for the ticker, so motion
between milestones is bounded and the bar cannot overshoot a milestone that has not happened.
The boot splash gets away with a single hardcoded cap of 90 plus random creep
(`index.html:588`); the mode overlay has more anchors and needs a real per-segment ceiling, not
one global cap — otherwise it crawls into 100 before `bootstrap.js:484` says so.

### 3 · Real anchors from `markBootPhase`

`src/utils/bootTimeline.js` **already stamps named phases at exactly the seams inside the silent
window** — nothing new needs instrumenting:

| Mark | Site | Suggested anchor |
|---|---|---|
| `world-init-start` | `bootstrap.js:174` | ~20 |
| `idle-shader-start` | `main.js:2883` | ~55 |
| `idle-shader-end` | `main.js:2885` | ~78 |
| `world-ready` | `bootstrap.js:204` | ~85 |

**These values are placeholders — treat the first `loadshots` run as the tuning step, not a ship
gate.** `idle-shader-*` dominates and varies 1.7–4.2s by machine.

#### Subscribe live; do not replay history — this is the trap in this card

`markBootPhase` writes `performance` marks, which **live for the whole page**. After an idle warm
or any prior play, `world-ready` and `idle-shader-*` are already present. Naively backfilling
from `readBootTimeline()` on every show would snap the floor to ~85 on a **second play entry** —
or on world-warm-but-arena-stale — and pin the bar high through the real rebuild. That is worse
than the bug being fixed.

- **Register a listener in `showModeEntryLoading`, clear it in `withModeEntryLoading`'s
  `finally`.** Only marks that fire *while the overlay is up* raise the floor.
- **Backfill from `readBootTimeline()` only when the world bootstrap is genuinely in flight** —
  `isWorldBootstrapInFlight()` already exists at `bootstrap.js:134`. That is the real mid-flight
  join case, including `?harness=1` where the flight starts at `main.js:5667` before the overlay
  exists.
- **Once `worldBootstrapDone`, ignore historical marks entirely.** Arena-swap progress then comes
  from `reportProgress` plus the ticker, which is correct — no world bootstrap is happening.
- **Backfill only the four named anchors, via an explicit `name → pct` map.** Do **not** walk
  every `cr:*` mark — `bootTimeline` stamps many more phases (`play-arena-done`,
  `play-cart-glb-done`, `carts-ready`, …), and mapping them wholesale would drive the meter off
  unrelated events.

#### Wiring — settle this before typing

`loadingScreen.js` must **not** import from `bootstrap.js`: `bootstrap.js` already imports
`withModeEntryLoading`, so that is a cycle and it will bite at runtime or under vitest. Pass the
predicate down at the single call site instead:

```js
// bootstrap.js ~430
withModeEntryLoading(task, {
  gameMode,
  levelId,
  backfillBootMarks: () => isWorldBootstrapInFlight(),
});
```

`loadingScreen.js` receives a predicate through `opts` and knows nothing about bootstrap. The
subscribe/unsubscribe hook lives in `bootTimeline.js`. No new files, no cycle.

**Keep it in existing files.** `tests/architecture.test.js:120` asserts every `src/` file is
claimed exactly once in `docs/ARCHITECTURE.json`; a new `src/` file fails that test unless you
run `npm run arch`.

### Also: fix the stale docstring

`ui/loadingScreen.js:209-214` claims *"Called by level loading tasks at key milestones: 20%
module fetched, 60% geometry built, 90% colliders ready, 100% done."* **None of those fire on a
cold entry, and 60 can never paint at all.** The false docstring is plausibly why this went
unnoticed.

## Explicitly rejected

- **Threading `onProgress` into `ensureWorldBootstrapped` as a parameter.** It cannot work: the
  flight starts at `bootstrap.js:443` (or `main.js:5667` under `?harness=1`) *before* any
  reporter exists, and `bootstrap.js:162-164` returns the in-flight promise while ignoring new
  arguments. It would have to be a settable module-level sink — strictly more coupling than the
  boot-phase bridge, for the same information.
- **Splitting `initFn` into painted phases.** Clean seams exist in `arena.js` (`:1423` textures,
  `:1851` record physics, `:1931` booths, `:1997` pit, `:2299` shaft), but it means making
  `initArena` async across all three arena modules and paying ~2 frames per seam on every cold
  load — to fix a cosmetic meter.
- **Fixing `main.js:2875-2877`'s missing second argument in isolation.** A real omission, but
  with 60 unpaintable and 20 only firing on an un-prefetched chunk it buys at most one extra
  paint. Fix it opportunistically if you are in the file; do not build the card around it.

## Do not

- **Do not make `ensureWorldBootstrapped` async.** `bootstrap.js:157-158`: *"Not async: callers
  must share the same Promise identity on same-target join (async/await would wrap a new outer
  promise every call)."* `tests/bootstrapIdleWarm.test.js` (5 cases) locks this.
- **Do not restructure `levelManager.js:245-247`.** Its comment: *"Cold-load the selected arena
  when the world is still empty — avoids bootstrapWorldCore(default) then an immediate full
  swap."*
- **Do not pass a reporter at `main.js:2959` or `levelManager.js:335`** — arena rotation and menu
  preview run with **no overlay on screen**; a reporter there writes into a hidden element.
- **Do not let the ticker reach 100.** Only `bootstrap.js:484` / `dismissModeEntryLoading` may.
- Ignore `.claude/worktrees/` when grepping — it is a duplicate tree.

## Verification

1. `npm run loadshots` — the regression gate and the source of the numbers above.
   `tools/loadshots.mjs:364-380` arms a MutationObserver on `.cr-load__pct` and prints the
   complete timeline in the `meter renders progress` check. **Read that timeline and paste it
   into the commit.** Target: no gap longer than ~1.5s, strictly non-decreasing.
2. **Run it twice**, confirming all three arena themes (the tool sweeps classic / backrooms /
   zanzibar).
3. **Add two checks to `tools/loadshots.mjs` in this same change** — `meter never goes backwards`
   and `no progress gap > ~1.5s` — over the timeline the tool already collects. ~10 lines, same
   pattern as `podium`'s `no gameplay HUD over the podium`. Without them the next regression is
   eyeball-only again, which is exactly how this one survived.
4. **Add unit tests to `tests/loadingScreenGate.test.js`**, three cases:
   - **floor** — report 90 then 88, assert `.cr-load__pct` still reads 90. `setProgress` is
     **not exported**: drive the `report` callback handed to the `withModeEntryLoading` task and
     assert the DOM, or add a test-only export. Do not fight the module boundary.
   - **ticker cleanup** — the interval is cleared after the task *throws*, not only on success.
   - **second play entry** — pre-seed `performance` marks, pass `backfillBootMarks: () => false`,
     assert the meter does **not** jump to ~85. Enough for v1; no `loadshots` second-entry path
     needed.
5. `npm run qa` — report **by number** (baseline at time of writing: 897 tests / 87 files).
   **`npm run build` too**, since `src/` changes.
6. **Update the BACKLOG row when you start.** It still blames `main.js:2875-2877` and the dropped
   `onProgress`; this document overturns that. Do not leave the wrong diagnosis in the file while
   implementing a different fix.

## Risks

1. **Timer leak under vitest** — the ticker must be cleared in `withModeEntryLoading`'s existing
   `finally` (`loadingScreen.js:528-534`), including on the throw path.
2. **Anchor values are guesses until measured.** Tune against a real timeline rather than
   shipping the table above as-is.
3. **Stale boot marks** — see the trap above. Covered by the second-play-entry unit test in
   Verification 4, not by a `loadshots` path.
4. **Cosmetic-only card.** No gameplay or netcode surface is touched. If this starts requiring
   changes to `bootstrap.js`'s promise handling, stop — that is BOOT-PERF-1 territory and out of
   scope.

## Critical files

- `src/ui/loadingScreen.js` — `setProgress` `:195-207`, `showModeEntryLoading` `:408`,
  `withModeEntryLoading` `:493-534`, stale docstring `:209-214`, `yieldForPaint` `:464`
- `src/utils/bootTimeline.js` — `markBootPhase` / `readBootTimeline`
- `index.html:581-608` — **the reference implementation**; read it before writing anything
- `src/bootstrap.js` — `:134` `isWorldBootstrapInFlight`, `:150-204` `ensureWorldBootstrapped`,
  `:431/:461/:463/:476/:484` reports
- `tools/loadshots.mjs` — `:364-380` observer, `:1039-1052` the timeline check
