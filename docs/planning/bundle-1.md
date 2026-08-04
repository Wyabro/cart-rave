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
| **B+** | The actual menu/game split — not yet scoped or acked. Each lever must land a measurable initial-set reduction and keep `size:check` green (re-baselining downward with `npm run size:update`) | not started |

Lever A is the card's insurance: if every later lever aborts, the durable guard still ships.

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

The byte budget is a proxy for the thing players feel. Before any split lands, record what "menu ready" costs today so a later lever can claim a real win instead of a smaller number.

| Measure | Value | Notes |
|---------|-------|-------|
| `menuReadyMs` (4090, prod) | _(to fill)_ | |
| `menuReadyMs` (Intel iGPU, prod) | _(to fill)_ | |
| Method used | _(to fill)_ | |
| Date / build SHA | _(to fill)_ | |

Judge on **production**, not dev — dev-only probes lie in prod.

---

## 6. Notes carried out of Lever A (not fixed here)

- `docs/bundle-budget.json` records `generatedAt`, so a `size:update` always dirties the file even at zero byte delta. Intentional (provenance), but do not read a diff on that line as a size change.
- The stale check compares `dist/index.html` mtime to the newest `src/**` mtime only. Edits to `index.html`, `public/`, or `vite.config.js` do not mark the build stale.
- Two `captureUpload-*.js` chunks exist in `dist/`; only the 1,074 B one is preloaded. `analyzeInitialSet` falls back to the full filename if two initial-set chunks ever collide on a stripped key rather than silently merging them.
