# Cart Clash — External Code Review

**Repo:** `github.com/Wyabro/cart-rave` · **Branch:** `cart-clash` · **Commit reviewed:** `56dfa61` ("Merge pull request #3 from Wyabro/redesign/fight-night-ui", 2026-07-23)
**Reviewed:** 2026-07-30 · **Reviewer:** Claude (chat session, fresh clone, no prior repo state)

---

## How to read this

Every finding carries an evidence label. Per the repo's own standing rule (*"Verify before you speak"*), these are not decoration — treat them as load-bearing.

| Label | Meaning |
|---|---|
| **VERIFIED** | Read in the tree at this commit, or observed as a command result. Line numbers checked. |
| **ARITHMETIC** | Follows deductively from verified constants. No runtime observation. |
| **INFERRED** | Mechanism verified statically; whether it fires in practice is unconfirmed. Disproof step given. |
| **UNVERIFIED** | Could not be checked in this environment. Stated as open. |

**Nothing in this document was observed at runtime.** No WebGL, no browser, no live Worker, no deploy. Every "this will happen" is static reasoning. Each finding that needs runtime confirmation names the cheapest check.

### What was run

Clean clone → `npm ci` (exit 0) → then:

| Gate | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | **773 tests / 77 files pass** |
| `npm run status:size` | ok — 7,687 tokens / 8,000 budget |
| `npm run health:check` | ok |
| `npm run briefing` | "already fresh — not rewritten" |
| `npm run build` | succeeds — `dist` 29 MB, 17 `.map` files |
| `npm audit` | 5 high (dev-chain only); `--omit=dev` → 0 |
| `npm run knip` | **COULD NOT RUN** — oxc-parser exceeded ArrayBuffer allocation in a 4 GB container. Environment limit, not a repo defect. Knip findings below are from a hand-rolled substitute and are weaker than knip's would be. |

---

## Priority queue

Ordered by (impact × confidence) ÷ effort. Not by severity alone.

| # | ID | Finding | Label | Effort |
|---|---|---|---|---|
| 1 | [P-01](#p-01) | STATUS.md is 315 tokens from deadlocking `npm run qa` | VERIFIED | minutes |
| 2 | [C-01](#c-01) | `sceneExtras.js` (991 lines) is unreachable — Classic skybox never builds | VERIFIED | minutes |
| 3 | [F-01](#f-01) | Auto-quality watchdog demotes on shader compiles, not GPU load | VERIFIED + ARITHMETIC | ~1 hour |
| 4 | [F-02](#f-02) | Perf harness pins `deviceScaleFactor: 1` — the top quality knob has never been measured | VERIFIED | ~30 min |
| 5 | [X-01](#x-01) | No ESLint in the repo, but 68 `eslint-disable` comments | VERIFIED | ~1 hour |
| 6 | [C-02](#c-02) | Cargo bay layout cannot satisfy the active CARGO-VIS-1 card | ARITHMETIC | ~2 hours |
| 7 | [S-01](#s-01) | Production ships 7.8 MB of sourcemaps | VERIFIED | minutes |
| 8 | [P-02](#p-02) | Module-eval crashes reach no telemetry | VERIFIED | minutes |
| 9 | [S-02](#s-02) | Worker routes match on `pathname.includes()` | VERIFIED | minutes |
| 10 | [S-03](#s-03) | Unauthenticated POST beacons have no rate limit | VERIFIED | ~1 hour |
| 11 | [C-03](#c-03) | Decoded-snapshot ring has an unenforced safety margin | INFERRED | ~2 hours |
| 12 | [S-04](#s-04) | Per-IP connection cap: magic number, 4× duplicated release, untested | VERIFIED | ~1 hour |
| 13 | [X-02](#x-02) | `main` is the default branch and 3 months stale | VERIFIED | minutes |
| 14 | [S-05](#s-05) | Dev-unlock reachable by shareable URL; doc says "manual override only" | VERIFIED | minutes |
| 15 | [X-03](#x-03) | knip `project` scope excludes 49 files (~24% of code) | VERIFIED | minutes |
| 16 | [F-03](#f-03) | `gpuCaps` has one `discrete` bucket; High→Medium is a 4-knob cliff | VERIFIED | ~2 hours |
| 17 | [X-04](#x-04) | `npm audit`: wrangler at the exact top of its vulnerable range | VERIFIED | minutes |
| 18 | [D-01](#d-01) | Doc-drift cluster (5 items) | VERIFIED | ~30 min |
| 19 | [X-05](#x-05) | Physics is stubbed out of the entire test suite | VERIFIED | (informational) |
| 20 | [X-06](#x-06) | 11 dead imports, 4 dead exports, 1 shadowed import | VERIFIED | ~30 min |

---

# Correctness

<a id="c-01"></a>
## C-01 — `sceneExtras.js` cannot execute · **VERIFIED**

991 lines building Classic Record's multi-layer parallax skybox, planets, and world spotlights. `initSceneExtras` is unreachable at runtime.

### Chain

| Step | Location | Fact |
|---|---|---|
| 1 | `src/main.js:2361` | `let sceneExtras = { scene, sceneRoots: [], disposables: [], update: () => {}, disposed: false }` — truthy, `disposed: false` |
| 2 | `src/main.js:2493` | The **only** call site of `initSceneExtras`, behind `if (!sceneExtras \|\| sceneExtras.disposed)`. With the step-1 default, the condition is **false**. |
| 3 | `src/main.js:2477`, `src/sceneExtras.js:980` | The only two places that set `disposed = true`. **Neither is ever called** — a full-repo grep for `disposeSceneExtras` returns the import, the two declarations, and one JSDoc reference. **Zero invocations.** |
| 4 | — | Nothing ever assigns `sceneExtras = null`. All eight references in `main.js` are reads plus the one guarded assignment. It is a closure local, so no external module can reach it. |

**Consequence:** `ensureRaveAttractShell` always takes the `else if` branch and toggles `.visible` on an empty array. The per-frame `sceneExtras?.update?.(syncedNow, camera)` calls the stub's no-op. Nothing named `classicSkyRoot` is ever added to the scene.

Corroboration: `src/levels/backroomsSupermarket.js:11` documents that main disables "the Classic space skybox" — implying it is expected to exist. `sceneExtras.js` is the only module that builds it.

### How it decayed — **INFERRED** (artifacts consistent, history not conclusive)

`main.js:2465` declares `function disposeSceneExtras(extras)` — a near-duplicate of the module function, minus `sceneRoots.length = 0`, wrapped in try/catch. As a `function` declaration inside `main()`, it **shadows the import at `main.js:148`** across the entire 4,860-line closure. The stub default at 2361 then closed the last gate. Both artifacts trace to commit `8174180` (`fix(physics): default to standard Rapier; make SIMD opt-in`) — the regression appears to be collateral from an unrelated fix.

### Disproof — 10 seconds

Load Classic, open console:
```js
scene.getObjectByName("classicSkyRoot")
```
`undefined` confirms. (Scene is exposed in DEV via `window.__cartRavePerf.scene`.)

### Fix

1. Delete the local `disposeSceneExtras` at `main.js:2465`.
2. Change the `main.js:2361` default from the stub object to `null`.
3. Keep the `main.js:148` import; wire the real `disposeSceneExtras` into the level-teardown path.

Step 2 alone restores the gate. Steps 1 and 3 prevent recurrence.

### Why every gate missed it

- `tsc --noEmit` passes — shadowing an import with a local `function` is legal JS.
- 773 tests don't reach it — `sceneExtras.js` is in the untested presentation layer ([X-05](#x-05)).
- ESLint `no-shadow` / `no-redeclare` would have caught it on first save. There is no ESLint ([X-01](#x-01)).

This is the concrete cost of X-01. Not style — a whole bug class the gate chain cannot see.

**Scope check:** I scripted a hunt for the same pattern (local declarations shadowing imported bindings) across `src`, `party`, `shared`, `tools`, `scripts`. **Exactly one hit** — this one. Isolated accident, not a habit.

---

<a id="c-02"></a>
## C-02 — Cargo bay layout cannot satisfy CARGO-VIS-1 · **ARITHMETIC**

Active card: *basket groceries must fill the full bay and overflow the rim when full.* The count ramp works. The geometry has two independent blockers.

### Blocker 1 — the pile is confined to ~¼ of the footprint

Two conservative insets multiply:

| Location | Value |
|---|---|
| `src/entities.js:341` | `hw = Math.max(0.18, outerHw * 0.48)` |
| `src/entities.js:342` | `hl = Math.max(0.2, outerHl * 0.42)` |
| `src/effects/groceryPool.js:569` | `wallPad = 0.03`, subtracted at 570–571 |
| `src/effects/groceryPool.js:579+` | `GRID` `u`/`v` fractions top out at **±0.55** — never ±1 |

Compounded, item centers reach roughly `0.55 × 0.48 ≈ 0.26` of the cart's outer half-width (≈0.23 along Z), plus each item's own half-extent.

The `GRID` comment says the fractions are *"of the usable half-extent after item size"* — i.e. ±1 should mean flush to the wall. The data never approaches ±1. **Intent and values disagree.** Widening to ±1.0 is data-only and the highest-leverage single change.

### Blocker 2 — rim overflow is not expressible

- `createCargoBay(hw, hl)` (`groceryPool.js:551`) takes **width and length only. No height.**
- `getBasketCargoParams` returns `{ floorY, hw, hl, centerX, centerZ }` (`entities.js:346`) — no rim Y.
- Stacking is `layerLift = slot.layer * (halfY * 1.7 + 0.02)` (`groceryPool.js:637`) — derived purely from item size. Whether layer 2 clears the rim is **coincidental, not solved.**

**The rim data already exists and is discarded.** `entities.js:336` computes `bodyH = box.max.y - box.min.y` and uses it only for `floorY`. `box.max.y` is the rim.

### Before briefing an agent on this

The `GRID` comment states the **opposite** of the card: *"only 3 layers, so the extra items fill gaps **without raising the pile past the rim**."* A previous pass deliberately kept the pile under the rim. The card reverses that decision. An agent will fight a documented intent unless you say so explicitly in the prompt.

### Recommendation (one, per your preference)

Have `getBasketCargoParams` also return `rimY` (from `box.max.y`, already computed), pass it as a third argument to `createCargoBay`, and widen the `GRID` fractions to ±1.0. Layer 2's lift then solves against `rimY` instead of guessing, and both halves of the card become achievable in one change.

---

<a id="c-03"></a>
## C-03 — Decoded-snapshot ring has an unenforced safety margin · **INFERRED**

### Verified facts

| Location | Fact |
|---|---|
| `src/netcode/binary.js:139` | `DECODE_RING_SIZE = 96` |
| `src/netcode/binary.js:141-142` | `_decodeRing`, `_decodeRingIdx` — pooled entries recycled in arrival order |
| `binary.js` docstring | Contract: *consumers must treat decoded snapshots as immutable — entries are recycled in arrival order* |
| `src/netcode.js:1422` | `bufferAuthoritativeState(serverNowMs, seq, carts, epoch)` retains the ring-owned `carts` array in `netStateBuffer` |
| `src/config.js:366` | `stateBufferMaxSize: 64` |

### The mechanism

96 > 64 looks safe — and is, **only if every decode gets buffered**. It doesn't. Three rejects occur *after* decode has already consumed a ring slot:

1. `if (last && seq <= last.seq) return;` — out-of-order/duplicate. The transport is explicitly **unordered/unreliable WebRTC**, so this is expected traffic, not an edge case.
2. Non-finite `serverNowMs` / `seq`.
3. Non-object `carts`.

True margin is therefore `96 − (rejects in window)`, not 32. At a sustained ~33% reject rate, the oldest buffered entries alias to recycled slots: they silently take on **newer pose data while keeping their old `serverNowMs`/`seq`**. `findSnapshotPair` then interpolates between mismatched poses — visually, remote carts stuttering or snapping.

### Why it needs a stall to fire

`pruneConsumedSnapshots` runs per frame. At `interpBufferMs: 75` and `hostSendHz: 40` (`config.js:362-363`) the buffer sits ~3 entries deep. It only climbs toward 64 when **consumption stalls** — hidden tab, occluded window, long shader compile.

Confirmed relevant: the P2P receive path is **not** visibility-gated. `handleP2PMessage` is a raw DataChannel handler; the only `visibilitychange` handlers are the host round-clock shift (`main.js:4811`) and `resetGameLoopTiming` (`gameLoop.js:719`). So: client tabs away → host keeps sending at 40 Hz → congested link → both conditions at once.

### Disproof, cheapest first

1. Instrument `bufferAuthoritativeState` to count rejects and log `rejectsSinceOldestBufferedEntry`. If that never approaches 32, **the hypothesis is dead.**
2. If it does: dev-only assert that the oldest buffered entry's ring index is still within 96 of `_decodeRingIdx`.

### Fix

Don't retain ring-owned arrays across frames — have `bufferAuthoritativeState` copy into its own pooled record. **Raising `DECODE_RING_SIZE` only moves the probability; it does not restore the invariant.**

---

# Performance

The framing that matters: the evidence does not support "the game is slow." It supports "the watchdog measures the wrong thing, and the measurement rig has never seen the biggest knob."

<a id="f-01"></a>
## F-01 — Auto-quality demotes on shader compiles, not GPU capability · **VERIFIED + ARITHMETIC**

The likely explanation for a GTX 1660 Ti laptop landing on Low.

### Verified constants (`src/utils/autoQuality.js`)

```
SAMPLE_CAP        = 90
BAD_FRAME_MS      = 20.5     // ~48 fps
BAD_WINDOWS_NEEDED = 2
WINDOW_MS         = 1000
MAX_STEPS         = 2
COOLDOWN_MS       = 4000
outlier reject: dtMs > 250 → return false
samples cleared: ONLY on step-down. Never between windows.
```

### Defect 1 — windows are not independent

`FRAME_INTERVAL_MS = 33` in `src/ui/menuAttract.js:65` (~30 fps attract). So 90 samples ≈ **3 seconds** of history, evaluated **every 1 second**, with the buffer never cleared between windows.

Three consecutive evaluations share the same samples. **One bad second poisons three windows; only two are needed.**

Worse, the p95 index is `min(len-1, floor(len*0.95))` → at len 90 that is `sorted[85]`, the **5th largest** sample. So **5 stalls in the 20.5–250 ms band across 3 seconds** is sufficient to trip a bad window — and because the buffer persists, the same 5 stalls trip three.

Result: step down. Cooldown 4 s, buffer cleared. Arena is still warming → more stalls → two more windows → **step down again**. `MAX_STEPS = 2` yields exactly High→Medium→Low with the GPU never being the limiting factor.

The source comment says *"consecutive bad 1s windows"* — that is the intent, not the behavior.

### Defect 2 — threshold/quantity mismatch

`menuAttract.js:198` measures **render cost** (wall-clock around `composer.render()`) and feeds it via `main.js:1554`. The game path (`frameVisuals.js:206`) feeds **frame delta**. `BAD_FRAME_MS = 20.5` was calibrated for frame delta (≈48 fps). Two different quantities are judged against one bar.

### Defect 3 — buffer survives the menu→gameplay transition

Not cleared on transition, so the first seconds of actual play are judged partly on attract-loop measurements.

### Self-correction

In conversation I implied the large shader-compile longtasks (your own notes: *1.7–4.2 s starting ~5 ms after world-ready — first attract `composer.render` compiling arena + postFX programs*) land in the samples. **They do not** — the `dtMs > 250` guard rejects them outright.

What slips through is the **20.5–250 ms band**: individual program compiles, first-draw uploads, GC. Five of those in three seconds is enough. The mechanism holds; the entry point is the mid-band, not the giant stalls. This makes Fix 3 below the most important of the three.

### Fix (all three, in order)

1. **Clear `samples` at the start of each window** so windows are genuinely independent.
2. **Gate the attract feed until shader warm-up completes** — `markBootPhase("idle-shader-start"/"idle-shader-end")` already brackets it.
3. **Drop the outlier ceiling from 250 ms to ~60 ms** so mid-band compile stalls are discarded rather than counted.

### Two things making this invisible

- The step-down `console.warn` is wrapped in `if (import.meta.env.DEV)` → **production logs nothing.**
- Of the eight `trackEvent` calls (`challenge_completed`, `client_error`, `match_ended`, `match_started`, `player_quit`, `session_end`, `session_start`, `unlock_earned`), **none reports quality tier or step-down.** No telemetry exists on the behavior in question.
- **There is no step-up path.** `qualityMode.js` exports `setSessionQualityTier` and nothing that raises a tier. One transient stall demotes the whole session with no recovery.

Adding `tier`, `dpr`, `gpuClass`, and step-down reason to `session_start`/`session_end` converts this from anecdote to data across playtesters. The analytics DO already exists to receive it.

### Disproof — 30 seconds, decides the whole question

On the 1660 Ti laptop with devtools open: check `devicePixelRatio`, then watch **whether demotion fires while still on the menu** or only after a round starts.

- **Menu-side demotion** → compile stalls. The GPU is fine. Fix F-01.
- **Holds High through the menu, steps down mid-round** → real render cost. Go after the DPR-2 fragment path ([F-02](#f-02)) instead.

---

<a id="f-02"></a>
## F-02 — The perf harness has never measured the biggest knob · **VERIFIED**

`tools/perf-profile.mjs:382` hardcodes `deviceScaleFactor: 1`, with no CLI override.

The High tier's single largest lever is `pixelRatioCap: 2`. At DPR 1: `min(1, 2) = 1`. **The pixel-ratio cap is inert in every measurement ever taken with this tool.** High, Medium, and Low all measure at effective ratio 1 (Low at 0.75 via `renderScale`).

On a laptop panel at 150% Windows scaling that is 2.25× the fragments; at 200%, 4× — multiplied through bloom, the VHS pass, FXAA, and the additive laser beams that `laserBudget: "full"` enables.

### The knock-on: your tier table may be tuned against an inverted ranking

`src/utils/qualityTiers.js` header states the Classic Reflector is *"~60% of the High-tier GPU frame"*, sourced from `docs/planning/production-pass-2-performance.md` — measured at DPR 1. `src/arena.js:18`: `REFLECTOR_TEXTURE_SIZE_FULL = 512`, a **fixed** render target that does **not** scale with DPR.

At DPR 2, full-screen work quadruples while the reflector stays constant. **The ranking inverts.** You may have optimized the wrong thing first.

Also: `chromium.launch({ headless: true })` at `perf-profile.mjs:376` passes no GPU flags, so depending on environment the harness may be measuring SwiftShader rather than your 4090. **UNVERIFIED** — depends on your local Chromium.

### Fix

Add `--dpr` to the harness and re-run the Classic/High cells at 1, 1.5, 2. That single change tells you whether the tier table is sane.

---

<a id="f-03"></a>
## F-03 — One `discrete` bucket, and High is a cliff · **VERIFIED**

`src/utils/gpuCaps.js`: `DISCRETE_GPU_RE` matches `/geforce/i` and `/\bgtx\b/i`. A GTX 1660 Ti reports a string containing "GeForce" → classifies `discrete` → **defaults to High, same bucket as a 4090.**

The module docstring shows the iGPU end of this was solved deliberately. The **mid-range-discrete** end is unhandled.

And High→Medium is not a step, it is a cliff — four knobs at once:

| Knob | High | Medium |
|---|---|---|
| `pixelRatioCap` | 2 | 1.25 |
| `reflector` | true | false |
| `crowdCount` | ∞ | 2200 |
| `laserBudget` | full | core |

A machine needing one of those gets all four. One more watchdog misfire lands it on Low (`composerBypass: true`, `renderScale: 0.75`, no post-FX).

### Fix

Add a rung. A `high-lite` with `pixelRatioCap: 1.5` and `reflector: false`, keeping crowd and lasers, is very likely the 1660 Ti's profile. Note this changes the tier enum — check `MAX_STEPS` and the `?preset=` harness cells together.

---

# Security & Exposure

<a id="s-01"></a>
## S-01 — Production ships 7.8 MB of sourcemaps · **VERIFIED**

`vite.config.js:98` — `sourcemap: true`, with no comment. Conspicuous: every other build option in that block is commented.

Built output: `dist` = 29 MB, **17 `.map` files, 7.8 MB total**. `wrangler.jsonc` sets `assets.directory = dist`, so they are publicly served.

**Fix:** `sourcemap: false` for prod, or `"hidden"` plus removing `.map` files from `dist` before `wrangler deploy`. Note this interacts with [X-04](#x-04) — the `postcss` advisory is specifically about `.map` file disclosure.

---

<a id="s-02"></a>
## S-02 — Worker routes match on `pathname.includes()` · **VERIFIED**

`party/index.ts:1555, 1579, 1614, 1728`:

```ts
if (url.pathname.includes("/api/log-error")) { … }
if (url.pathname.includes("/api/errors"))    { … }
if (url.pathname.includes("/api/captures"))  { … }
if (url.pathname.includes("/api/analytics")) { … }
```

Any path *containing* these substrings routes there and shadows the ASSETS handler. **Fix:** `startsWith`.

---

<a id="s-03"></a>
## S-03 — Unauthenticated POST beacons have no rate limit · **VERIFIED**

`advanceRateLimit` (imported at `party/index.ts:43`) is wired **only** to the WS path (`index.ts:467`). `/api/log-error`, `/api/captures`, `/api/analytics` are open POSTs with only body-size caps.

Storage cannot grow unbounded — the DOs are ring buffers (2000 / 80 / 20000 rows). **That is precisely the problem:** anyone can flood 2,000 junk rows and **evict real crash reports before you read them**, on your write billing.

Close before external playtesters. Pairs naturally with the analytics-DO reset already tracked in STATUS.

---

<a id="s-04"></a>
## S-04 — Per-IP connection cap: magic number, duplicated release, untested · **VERIFIED**

`party/index.ts:862` — `if (currentConnections >= 5)`.

Three problems, and the repo's own conventions name all three:

1. **Magic number.** `party/constants.ts` opens with *"Single home so tests and DO code cannot drift on magic numbers."* Every sibling threshold lives there with a test (`RATE_LIMIT_MAX_PER_SEC`, `REAP_TIMEOUT_MS`, `REAP_THROTTLE_MS`, `PICKER_TIMEOUT_MS`). This one is a bare inline `5`.
2. **Untested.** Nothing in `tests/` references `ipConnectionCounts`, `cf-connecting-ip`, `"Too many connections"`, or code `4029`.
3. **Release logic copy-pasted at 4 sites** — `index.ts:496, 829, 961`, and the ghost-exorcism branch (~1113). Miss one path and the count only ever leaks **upward**. Your `.cursorrules` notes DO state survives `wrangler deploy`, so a leaked count permanently 4029s a real player until the DO evicts.

**Fix:** extract one `#releaseIp(connId)`; move `5` into `constants.ts` with a test.

**Sound as-is:** the IP source is correct. `cf-connecting-ip` is not client-spoofable through Cloudflare, and the `"unknown"` fallback fails strict rather than open.

---

<a id="s-05"></a>
## S-05 — Dev-unlock reachable by shareable URL; the doc misdescribes it · **VERIFIED** (corrected)

**Correction to what I said in conversation.** I framed the production behavior as an unintended bypass. It is not — `src/stores/unlockStore.js` documents it deliberately:

```
| PROD  | absent   | real gates |
| PROD  | "all"    | unlock all (manual override only) |
```

`isDevUnlockAll()` at line 45–50 honors `"all"` before reaching `import.meta.env.DEV` at line 49. **That is by design.** My earlier characterization was wrong.

**The actual defect is narrower and still real:** the doc says *"manual override only,"* and that claim is false. `unlockStore.js:21-31` runs a URL one-shot at module top level with **no DEV gate**:

```js
const raw = new URLSearchParams(window.location.search || "").get("devUnlocks");
if (raw === "all" || raw === "off") storageSet(DEV_UNLOCKS_STORAGE_KEY, raw);
```

So `cartrave.lol/?devUnlocks=all` sets the override from a **link**. Verified in the production bundle I built from this HEAD: `dist/assets/index-CSSNPEz4.js` contains `CartClashDevUnlocks` (8 occurrences), the `devUnlocks` param handling, and the self-documenting `help()` text including "force unlock".

One Discord post ends progression for that group. Client-side progression is never truly enforceable and for a free browser game the stakes are modest — but daily/weekly challenges and personal bests are a design pillar, and this is a labeled front door.

**Fix (minimal, preserves the documented intent):** DEV-gate the **URL one-shot** only, leaving manual localStorage override working in prod as designed. Then the doc's "manual override only" becomes true. If you also want the console API out of prod, wrap the `window.CartClashDevUnlocks` registration (line 53+) in `import.meta.env.DEV` — Vite substitutes `false` statically and the block tree-shakes out, removing the help text that advertises it.

---

# Process & Workflow

<a id="p-01"></a>
## P-01 — STATUS.md is 315 tokens from deadlocking `npm run qa` · **VERIFIED**

The highest-priority item in this document, because it blocks the workflow itself rather than the game.

`tools/status-size.mjs` **exits 1 when over budget** (line 19 documents this; line 97 implements it), and `status:size` is the first link in `npm run check`, which `npm run qa` aliases.

Current state:

| Measure | Value |
|---|---|
| `docs/STATUS.md` size | 30,741 chars |
| Tokens (`CHARS_PER_TOKEN = 4`) | **~7,685** |
| `BUDGET_TOKENS` | 8,000 |
| **Headroom** | **315 tokens ≈ 1,260 characters** |

About one paragraph.

Meanwhile AGENTS.md mandates *"Update `docs/STATUS.md` after meaningful steps"*, and the escalation ladder requires a *"5-line findings entry to STATUS.md"* on every timeboxed failure. **The process obligates writing to the exact file whose growth fails the gate.** The next real session ends with a red `qa` for a reason unrelated to your code — and per your own definition of done, red gates block shipping.

### Second trip, also close

`MAX_ENTRIES_PER_DATE = 6` sets `overBudget` **regardless of token count**. Current density:

| Date | Entries |
|---|---|
| 2026-07-22 | 5 |
| 2026-07-21 | 5 |
| 2026-07-23 | 2 |

A normal busy agent day hits 7 and fails the gate on a file that is under the token budget.

### Fix

1. **Now:** archive the pre-07-22 date windows, per the tool's own `KEEP_RECENT_DATES = 2` suggestion. This is the mechanism working as designed.
2. **Prevention:** add a warning tier at ~90% of budget. Nothing currently warns at 96%; the first signal is a hard failure at 101%. A warn line converts a wall into runway.

---

<a id="p-02"></a>
## P-02 — Module-eval crashes reach no telemetry · **VERIFIED**

`installGlobalErrorReporting()` is called at `src/main.js:764` — the first line **inside** `main()`. Anything thrown during module evaluation happens before that.

The inline boot handlers in `index.html` are meant to cover the gap, and are well built: they exist before any module loads and forward via their own `fetch(..., { keepalive: true })`, independent of the module graph. But their filters are narrow:

| Handler | Line | Condition |
|---|---|---|
| `error` | `index.html:1126` | forwards only when `t.tagName === "SCRIPT" && isGameModuleUrl(t.src)` — a **resource load** failure |
| `unhandledrejection` | `index.html:1142` | forwards only on `/Failed to fetch dynamically imported module\|Importing a module script failed\|…/` |

A **runtime exception during module evaluation** is neither. A TDZ error, a bad top-level `await`, a null deref in module init — those fire with `ev.target === window`, fail the `tagName === "SCRIPT"` check, and `installGlobalErrorReporting` has not run yet. **The player sees a hung boot splash; you get zero telemetry.**

Not hypothetical for this codebase. Verified top-level side effects exist: the `devUnlocks` URL one-shot (`unlockStore.js:21`), the `window.CartClashDevUnlocks` registration (`unlockStore.js:53`), the `window.__cartRaveSendErrorLog` assignment (`errorReporter.js`, end of file). Any of those throwing is invisible.

**Fix:** in the `index.html:1126` handler, drop the `tagName === "SCRIPT"` requirement when `ev.error` is present, so genuine `ErrorEvent`s forward through `forwardBootError` too.

---

# Hygiene & Gate Coverage

<a id="x-01"></a>
## X-01 — No ESLint, but 68 `eslint-disable` comments · **VERIFIED**

No ESLint config file anywhere. Not in `devDependencies`. Not in the `qa` chain. Yet **68 `eslint-disable` comments** across `src`, `party`, `tools`, `scripts`, `tests` — in at least 20 files including `main.js`, `scene.js`, `levelManager.js`, `bootstrap.js`, `autoQuality.js`.

Every one is a no-op. They imply a gate that does not exist.

This finding has now surfaced three times independently in this review: it would have caught [C-01](#c-01) (`no-shadow`), [X-06](#x-06)'s 11 dead imports (`no-unused-vars`), and gives the 68 comments meaning.

**Fix:** add ESLint with `no-shadow`, `no-redeclare`, `no-unused-vars` and wire it into `check`. If you'd rather not, strip the 68 comments so they stop implying coverage. Adding it is the better trade — the rules above map directly onto bugs already found here.

---

<a id="x-02"></a>
## X-02 — `main` is the default branch and 3 months stale · **VERIFIED**

| Branch | HEAD | Date |
|---|---|---|
| `main` | `5c854e4` "Fix game URL in README" | **2026-05-03** |
| `next-level` | `4ecb946` | 2026-07-06 |
| `cart-clash` | `56dfa61` | 2026-07-23 |

Anyone opening `github.com/Wyabro/cart-rave` lands on the jam README: "Cart Rave," PartyKit as the stack, 60-second matches. All three are now wrong.

**Fix:** point the default branch at `cart-clash`.

### Branch clutter

| Branch | Status |
|---|---|
| `next-level` | last moved 2026-07-06 |
| `docs/agent-config-rewrite` | unmerged |
| `redesign/fight-night-ui` | merged via PR #3 — deletable |
| `vercel/install-vercel-web-analytics-szsph5` | bot branch, 2026-04-29 |
| `vercel/vercel-web-analytics-to-projec-npj24h` | bot branch, April |

Verified: **zero Vercel references** anywhere in the tree (`src`, `party`, `index.html`, `package.json`, `wrangler.jsonc`). Both bot branches are pure noise.

---

<a id="x-03"></a>
## X-03 — knip `project` scope excludes ~24% of the code · **VERIFIED**

`knip.json` sets:

```json
"project": ["src/**/*.{js,ts}", "party/**/*.{js,ts}"]
```

Excluded: **43 `.mjs` files** across `tools/` and `scripts/`, plus all **6 `shared/*.js`** — 49 files against 154 in scope. `shared/` is the **protocol layer** both client and server import. The `.{js,ts}` extension filter would also miss any `.mjs` inside `src`/`party` (currently zero, so no active gap there).

**Fix:** add `shared/**/*.js`, `tools/**/*.mjs`, `scripts/**/*.mjs` to `project`, with `tools`/`scripts` entry points declared so they aren't reported wholesale.

---

<a id="x-04"></a>
## X-04 — Dependency advisories: wrangler at the top of its vulnerable range · **VERIFIED**

`npm audit --omit=dev` → **0 vulnerabilities. Nothing reaches players.**

Full tree — 5 high severity:

| Package | Detail |
|---|---|
| **`wrangler` 4.113.0** | vulnerable range `4.16.0 – 4.113.0` (via `miniflare`). **You are at the exact top.** This is your deploy tool (`npm run ship`), running with your Cloudflare credentials. |
| `postcss <=8.5.17` | Path traversal in sourcemap auto-loading → arbitrary `.map` file disclosure. Note the overlap with [S-01](#s-01). |
| `sharp <0.35.0` | libvips CVE-2026-33327, -33328, -35590, -35591 |
| `miniflare` | `4.20250508.3 – 4.20260721.0` |
| `@cloudflare/vitest-pool-workers` | `0.8.31 – 0.18.7` |

Build-chain, not player-facing, so not urgent. But you run agent-generated code on this machine routinely, which makes dev-chain exposure less academic than for a typical solo project. A wrangler bump should clear the top three entries.

---

<a id="x-05"></a>
## X-05 — Physics is stubbed out of the entire test suite · **VERIFIED** (informational)

`vitest.config.js` aliases **both** `@dimforge/rapier3d` and `@dimforge/rapier3d-simd` to `tests/stubs/rapier3d.js`, which is **two lines**:

```js
// Test stub — rapierInstance dynamic import target; never initialized in unit tests.
export default {};
```

A defensible call — Rapier is WASM and awkward under Vitest. But it means the 773 green tests verify **zero physics behavior**: collision response, rewind-and-replay reconciliation, substep settling, the trimesh edge-flag fix. All covered only by the pure-JS scaffolding around the physics calls.

Your real physics regression net is `npm run battery` / `gameharness`, which runs **separately and is not in `qa`**.

Not a bug. Worth knowing exactly what green means when deciding whether to trust it.

### Test suite quality — genuinely good

I went looking for a vacuously-green suite and did not find one:

| Measure | Value |
|---|---|
| Assertions | 1,981 |
| Tests | 775 blocks (773 executed) |
| Assertions per test | 2.6 |
| `.skip` / `.todo` | **0** |
| `vi.mock` calls | 24 across 77 files (light mocking) |

The gap is coverage **breadth**, not test quality.

### Coverage shape

Modules referenced anywhere in `tests/` cover **~70%** of `src`+`party`+`shared` by LOC (crude basename matching — approximate). The untested 30% is almost entirely presentation:

| Module | LOC |
|---|---|
| `src/cartRaveGltf.js` | 3,394 |
| `src/cart-rave-menu.js` | 2,351 |
| `src/effects/waterDeathFx.js` | 1,718 |
| `src/animations.js` | 1,495 |
| `src/scene.js` | 1,257 |
| `src/cartShatter.js` | 1,102 |
| `src/sceneExtras.js` | 991 |
| `src/ui/cartPreview.js` | 861 |
| `src/ui/pauseOverlay.js` | 834 |
| `src/postFxDebug.js` | 759 |
| `src/ui/resultsOverlay.js` | 684 |

Defensible for a game — logic and netcode are the tested part. Two caveats: `sceneExtras.js` being here is exactly why [C-01](#c-01) went unnoticed, and `cart-rave-menu.js` at 2,351 lines is a **state machine**, not just paint — and it is the same surface as the open responsive bug.

---

<a id="x-06"></a>
## X-06 — Dead code inventory · **VERIFIED**

Knip could not run, so these come from hand-rolled substitutes. **Weaker than knip's output.** Re-run knip before acting broadly.

### Shadowed imports — 1

`src/main.js:2464` — `disposeSceneExtras`. See [C-01](#c-01). Scripted sweep across `src`, `party`, `shared`, `tools`, `scripts` found **exactly this one**.

### Dead exports — 4 (zero references outside their defining file)

| Symbol | Location | Note |
|---|---|---|
| `showGameplayElements` | `src/hud.js:2775` | likely fight-night redesign orphan |
| `syncColors` | `src/hud.js:2571` | likely fight-night redesign orphan |
| `getActiveRoomAiDifficulty` | `src/netcode.js:3016` | |
| `disposeComposer` | `src/scene.js:1245` | safe-dead, **not** a leak — `createComposer` is called exactly once, at `main.js:1524` |

The two HUD ones trace to `c603119` (`fix(ui): 7c — chip sizing, slab keycaps, drop the remapping notice`).

Over-exported but internally used (leave alone or reduce visibility): `setEdgeDanger`, `syncHudLayout`, `WS_ELEVATED_TYPES`, most of `tools/lib/projectHealthValidation.mjs`.

### Dead imports — 11 (imported, never referenced in the importing file)

| File | Binding |
|---|---|
| `src/cart-rave-menu.js` | `setAllAudioMuted`, `wireButtonPressFeedback` |
| `src/hud.js` | `animateKillFeedExit` |
| `src/main.js` | `applyThemeLeaderGlow` |
| `src/frameVisuals.js` | `clamp` |
| `src/input.js` | `flashBoostActivate`, `syncTouchLayout` |
| `src/ui/resultsOverlay.js` | `animateMenuCardEnter`, `animateMenuReveal`, `fadeIn` |
| `tools/lib/archModel.mjs` | `join` (from `node:path`) |

**All 11 are live functions called from elsewhere** — cruft, not breakage. I checked `syncTouchLayout` specifically because mobile layout is an open bug: it is called internally at `touchControls.js:131`, so orientation resync is intact.

`no-unused-vars` clears all 11 in one pass. See [X-01](#x-01).

---

<a id="d-01"></a>
## D-01 — Doc-drift cluster · **VERIFIED**

Listed because internal consistency is a stated standard, and because each of these can mislead an agent session.

| # | Location | Claim | Reality |
|---|---|---|---|
| 1 | `vite.config.js:114` | "SIMD is preferred at runtime" | Contradicts line 62 **and** `rapierInstance.js`, both of which say SIMD is opt-in and broken on 0.19.3 |
| 2 | `AGENTS.md:49`, `docs/reference/control-flow.md:73` | `main.js` is a "4,500-line closure" | `main()` spans lines **763–5622 = 4,860**; the file is 5,701 |
| 3 | `docs/BRIEFING.md` header | "Generated at commit `a7cf110` on `redesign/fight-night-ui`" | HEAD is `56dfa61` on `cart-clash`. See below — the gate cannot catch this. |
| 4 | `AGENTS.md` Commands | `check` = `status:size + typecheck + test + knip + briefing + health:check` | Actual chain **also includes `npm run arch`**, which the same document later states runs inside `qa` |
| 5 | `src/stores/unlockStore.js` header | PROD `"all"` is "manual override only" | Reachable via `?devUnlocks=all`. See [S-05](#s-05) |

Also now stale: the memory/handover note that a prior Gemini audit *"diagnosed nonexistent binary framing."* `src/netcode/binary.js` exists and is live — binary framing shipped **after** that audit. Anything citing that audit as evidence of hallucination should be re-read with that in mind.

### Why #3 can never trip the gate — **VERIFIED**

`validateBriefingFreshness` (`tools/lib/projectHealthValidation.mjs:199`) compares an embedded digest against `briefingSourceDigest(statusMd)` — **STATUS.md content only**. Branch and commit are printed into the BRIEFING header but are **not part of the digest**. So `a7cf110 on redesign/fight-night-ui` sits there indefinitely while both `npm run briefing` ("already fresh — not rewritten," which I observed) and `health:check` report ok.

They read as provenance and are not. **Fix:** either add branch + HEAD to the digest input, or remove them from the header.

### Bonus: the validation module itself is largely unreferenced

`tools/lib/projectHealthValidation.mjs` exports `evaluateProjectHealth` and its component validators. Most have no references outside the file. Worth confirming that `health:check` actually calls into this module rather than reimplementing the checks — if it does not, the semantics validated here are dead too. **UNVERIFIED** — I did not trace the `health-check.mjs` → `projectHealthValidation.mjs` call path.

---

# Verified clean

Recording what was checked and found sound matters as much as the defect list — it tells you where **not** to spend time, and two of these were hypotheses I expected to confirm and could not.

## Security

- **No committed secrets.** Scanned `src`, `party`, `tools`, `scripts`, `index.html`, `wrangler.jsonc` for API-key/token/password/bearer patterns with 16+ char values. Nothing. No Supabase or third-party keys.
- **`.claudeignore` is a real boundary** — `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `secrets/`.
- **`clientId` is not a griefing vector.** The ghost-exorcism path looked exploitable (spoof an ID, convert someone's slot to NPC). It isn't: `clientId` is a `crypto.randomUUID()` in localStorage (`netcode.js:2226-2234`), stored server-side in `#connClientId`, and **never appears in any outbound payload**. Not guessable, not leaked.
- **WS ingress is properly hardened.** Size-classified pre- and post-parse, per-connection rate limited (`index.ts:467`), every field type-narrowed with caps.
- **`decodeHostStateSnapshot` bounds-checks** header size, cart count, and total length before reading, and sanitizes non-finite floats. (Its *consumer* is the C-03 issue, not the decoder.)
- **Token compares are non-constant-time** (`index.ts:1595, 1701, 1760` use `!==`). Low practical risk over a network; two-line fix if you want it closed.

## Code quality

- **Zero `TODO` / `FIXME` / `HACK` / `XXX`** in `src`, `party`, `shared`. Unusual and good.
- **The frame loop is allocation-free.** Zero `new THREE.*` and zero `.clone()` in `gameLoop.js`, `hud.js`, `netcode.js`. All nine `new THREE.*` in `simulation.js` are **module-scope scratch objects** (lines 59–66, 1244). `effects.js` has 56, worth a spot-check, but the hot path is clean.
- **No shadow-map cost at all** — zero `castShadow = true`, zero `shadowMap.enabled` anywhere. Dynamic lights are modest and tier-gated.
- **Both previously-flagged stale refs are gone** — no `PARTYKIT_PUBLIC_HOST` in `src/config.js`, and `scripts/dev-next-level.mjs` no longer exists.

## AGENTS.md is accurate — the most important clean result

For the document every agent session inherits, this held up:

- **All 18 referenced paths resolve.** `docs/brand.md`, `style-guide.md`, `BRIEFING.md`, `STATUS.md`, `ARCHITECTURE.json`, `planning/project-state.md`, `reference/Game_Architecture.md`, `reference/control-flow.md`, `archive/README.md`, `planning/BACKLOG.md`, `guides/visual-qa.md`, `guides/dev-toolkit.md`, `guides/observability.md`, `CLAUDE.md`, `GEMINI.md`, `GROK.md`, `.cursorrules`, `.cursor/rules/cart-clash.mdc`. Zero broken links.
- **`ROUND_DURATION_MS` genuinely single-sourced.** `shared/roundConstants.js:10` = `150_000`, imported by `src/config.js:19` and `party/roundValidation.ts:32`. No hardcoded duplicate anywhere.
- **"~84 unexported inner functions" measures 86** (82 `function` declarations + 4 top-level const arrows inside `main()`).
- **CI matches the claim exactly** — `npm ci` → `npm run qa` → `npm run build`, on push/PR to `cart-clash`/`main`.

Only two inaccuracies, both in [D-01](#d-01) (#2 and #4).

## Hypotheses killed

Both were plausible causes of the open *"arena visuals persisting into subsequent levels"* bug. Both are wrong — which narrows where to look.

**Concurrent level swaps — not the cause.** `commitLevelLoad` (`main.js:2777`) calls `disposeLevel()` then awaits **twice** before reassigning — a textbook double-dispose window. But callers close it: play entry explicitly awaits both in-flight promises (`bootstrap.js:373-376`), and `rotateLoadedArenaInPlace` requires carts to exist while `canSafelyRebuildLevel()` requires they don't — **mutually exclusive by construction**. The `config.record.radius` save/restore is also safe: dispose strictly precedes the next load, so the LIFO restore holds.

**Missed visibility toggle on non-preview swaps — not the cause.** `onPreviewSwapComplete` only fires for menu previews, so rotation looked like it would skip `setRaveExtrasVisible`. It doesn't: `commitLevelLoad` awaits `rebuildForQualityChange()` as its final step, which calls `setRaveExtrasVisible(levelUsesRaveExtras())` at `main.js:2103`. **Every swap path is covered.**

Given C-01, the likeliest remaining explanation for arena-visual persistence is elsewhere entirely — fix C-01 first and re-observe, since a never-built skybox changes what "persisting" even looks like.

## Residual, unproven

Three separate mutexes guard the same shared state (`commitLevelLoad`'s closure variables): `levelRebuildPromise`, `menuLevelPreviewPromise`, `arenaRotationInFlight`. Two of the three pairs are explicitly cross-checked. The third — **play-entry rebuild vs. quickplay rotation** — is not: `ensureLevelRebuilt` never inspects `arenaRotationInFlight`, and `rotateLoadedArenaInPlace` never inspects `levelRebuildPromise`.

I could not construct a reachable path where a play entry begins while a rotation is in flight, so this may be unreachable **by accident rather than design**. Flagging to make explicit, not to fix. A single shared in-flight flag removes the question.

---

# The responsive-CSS bug, quantified

Not a new finding — evidence for a decision already made (the two-pass scale migration).

| File | Hardcoded `px` | `clamp()` | `vw`/`vh` | `@media` |
|---|---|---|---|---|
| `src/cart-rave-menu.css` | **1,242** | 299 | 301 | 24 |
| `src/ui/styles/hud.css` | **671** | 162 | 176 | 13 |
| `src/ui/styles/results.css` | 172 | 44 | 50 | 4 |
| `src/ui/loadingScreen.css` | 138 | 23 | 23 | 3 |

Total CSS: 8,439 lines. A 4:1 px-to-clamp ratio is exactly what *"correct at 1080p and 1440p, wrong everywhere else"* looks like — the layout is **pinned to specific viewports rather than scaled**. Consistent with the migration already decided on.

---

# Suggested sequencing

Not a plan — a proposal. One card at a time, per AGENTS.md.

**Do first, independent of everything else** (minutes each, unblocks or de-risks the rest):

1. [P-01](#p-01) archive STATUS.md date windows — **before the next session hits the wall**
2. [X-02](#x-02) default branch → `cart-clash`; delete the two `vercel/*` and merged `redesign/fight-night-ui`
3. [S-01](#s-01) `sourcemap: false`
4. [P-02](#p-02) widen the boot error filter

**Then the single highest-value change:**

5. [C-01](#c-01) restore `sceneExtras`. Three-line fix; recovers 991 lines of built visuals; likely changes how the open arena-persistence bug presents, so re-observe that afterward rather than before.

**Then, before any more perf work:**

6. [F-02](#f-02) add `--dpr` to the harness and re-measure Classic/High at 1 / 1.5 / 2. This is prerequisite — the current tier table may be tuned against an inverted ranking.
7. [F-01](#f-01) fix the watchdog windowing, but **run the 30-second menu-vs-round disproof first**. If demotion is menu-side, F-01 is the whole answer and F-03 is unnecessary.

**Then the gate that would have caught three of the above:**

8. [X-01](#x-01) add ESLint with `no-shadow`, `no-redeclare`, `no-unused-vars`; wire into `check`. Clears [X-06](#x-06) as a side effect.
9. [X-03](#x-03) widen knip scope; **re-run knip on a machine with more memory than mine had** and reconcile against X-06.

**Before external playtesters:**

10. [S-03](#s-03) rate-limit the open beacons
11. [S-05](#s-05) DEV-gate the `?devUnlocks` URL one-shot
12. [S-02](#s-02) `startsWith` routing · [S-04](#s-04) `#releaseIp` + constant + test

**When the card comes up:**

13. [C-02](#c-02) cargo layout — brief the agent on the reversed intent explicitly
14. [C-03](#c-03) run the reject-count instrumentation before writing any fix
15. [D-01](#d-01) doc-drift sweep · [X-04](#x-04) wrangler bump

---

## Caveats on this document

- Single commit, single session, **no runtime observation of any kind**.
- `npm run knip` never ran. [X-06](#x-06) is a hand-rolled approximation and is the weakest section here.
- Coverage percentages use crude basename matching — directional, not precise.
- I did not read `docs/archive/` (per AGENTS.md: grep, don't read whole), so historical *why* behind some decisions is unknown to me. Where a finding contradicts a past deliberate decision — [C-02](#c-02) most clearly — I flagged it rather than assuming the current state is wrong.
- Where this document and the code disagree, **the code wins.** Fix the document.
