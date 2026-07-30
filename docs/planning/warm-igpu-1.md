# WARM-IGPU-1 — first-play shader warm stall on iGPU laptops (countdown swallowed)

**Status:** Phase 0 + 0b **acked** (Wyatt 07-30); instrumentation ✅ landed. **Both iGPU
laptops are gone (07-30)** — steps 1 and 3 cannot run on the original hardware. Phase 0
closed on a SwiftShader cold-cache proxy instead (see *Phase 0 proxy result*), which is
sufficient to choose the lever: **Lever A, awaiting Wyatt's ack.** The `done when` criterion
below is relaxed accordingly — see *Verification without the hardware*.

**What to read the capture for** (once the cold-cache repro runs):
`warmupSettle.outcome === "budget-expired"` with `remaining > 0` on the warm play-entry
settle ⇒ **H1 confirmed** (link cost deferred past `play-shader-end` into the countdown) ⇒
**Lever A**. If it settles `ready` and the stall still lands in the countdown, the cost is at
first draw, not link ⇒ H3 ⇒ still Lever A, but Lever B would not help. A large `pollMs` with
`warm.compilePoll` spans inside the frozen window ⇒ ANGLE is linking synchronously in
`isReady()` ⇒ **Lever B** (budget scaling) is actively harmful; go Lever A.
**Relation:** New evidence beside COUNTDOWN-WARM-1 (desktop PASS 07-22 stands — this is the
medium-tier failure of the same warm pipeline). Does not touch the reverted host-countdown
gate (`c8df8fd`) — the lever stays "pre-warm before countdown", never "delay countdown".

## Evidence (captures cap-205 … cap-214, build `56dfa61`, 07-25)

Two new laptops, both auto-tiered **medium**, both solo host, first-ever run of this build:

| | Laptop A — Intel UHD 630 (0x3E9B) | Laptop B — AMD Radeon iGPU (0x1681) |
|---|---|---|
| play-shader window (`warm:true`) | **7144 ms** (t 2470842→2477986) | **3821 ms** (t 256844→260665) |
| warmupCompile | 1040 ms · 450 materials · `parallelCompile:true` | similar shape |
| post-"ready" stall | **6428 ms longtask _inside countdown_** (longframe 6414 ms, `focused:true`, only span = flyover `warm.compile:96`) | 2825+2704 ms longtasks ending ~200 ms **before** countdown start |
| countdown integrity | **elapsed 8163 ms vs 3600 config** — 3-2-1 never rendered, GO ~4.5 s late on unfreeze | clean (digit 2 at elapsed 2007 ms) |
| 2nd arena of session | — | backrooms entry: **150 ms** |
| gameplay after entry | 42/13,313 frames >33 ms (0.3%) | 65/26,939 (0.24%), maxDt 145 ms |

Reading: `play-shader-end` fires before real link work is done; the leftover lands in the
flyover warm pass, which (by D-COUNTDOWN-WARM-1 design) runs **at countdown start** — cheap
on the 4090, catastrophic on medium tier. Gameplay itself is fine; second-arena entry is
cheap, so the cost is session-first-play (likely per-build).

## Hypotheses

- **H1 (primary): compileAsync early-resolve.** `warm:true` uses the short readiness budget
  ([bootstrap.js:82](../../src/bootstrap.js), `safeCompileAsync` maxWaitMs in
  [scene.js:643](../../src/scene.js)). On slow ANGLE D3D11 links the poll budget expires,
  `play-shader-end` fires anyway, and the un-linked programs compile synchronously at the
  flyover warm draw → the stall relocates into the countdown.
- **H2: cold GPU shader disk cache.** Both laptops ran build `56dfa61` for the first time.
  The 07-22 desktop PASS was on machines that had rendered the build repeatedly (warm cache) —
  which would mean every player's *first run of every new build* hits this, and our own
  retests never see it.
- **H3 (background):** ANGLE/D3D11 links at draw regardless of
  `KHR_parallel_shader_compile:true` — cost can only be relocated pre-countdown, not removed.

## Plan

### Phase 0 — forensics (no behavior change, ~30–45 min)

1. **Cold-cache repro on the Intel 8A56 machine:** launch Chrome with
   `--disable-gpu-shader-disk-cache` (or clear profile `GPUCache`), first solo play with
   `?diag=1`, F8 during/after countdown. Expect the Laptop-A pattern; confirms H2 and gives
   us a local repro box.
2. **Diag-only patch — ✅ DONE 07-30.** Shipped as `perf/warmupSettle` (outcome
   `ready | budget-expired`, `remaining`, and the `compileMs` vs **`pollMs`** split),
   a `warm.compilePoll` span so the readiness poll stops reading as `unknown|window`, and
   Phase 0b's `perf/qualityStepDown` + analytics fields. Live-boot verified.
   **First finding, before any repro:** on the dev box a settle logged `compileMs: 22` /
   `pollMs: 1110`. The old `warmupCompile` event only fires at `compileMs >= 50`, so that
   settle produced **no event at all** — meaning the 07-25 laptop captures
   (`warmupCompile: 1040ms`) undercount the true warm cost by whatever their poll time was.
   Treat the evidence table's play-shader numbers as the reliable ones.
3. **Optimus check (Laptop A):** that machine has a GTX 1660 Ti, but the capture's ANGLE
   string proves Chrome rendered on the UHD 630 — Windows per-app graphics preference /
   battery can defeat our `powerPreference: "high-performance"` request
   ([scene.js:800](../../src/scene.js)). Re-run with Windows Graphics settings → Chrome →
   High performance; confirm ANGLE reports NVIDIA and the stall shrinks to desktop scale.
   Keep the iGPU result as the canonical medium-tier evidence — it's what out-of-the-box
   dGPU laptops do.

### Phase 0 proxy result — 07-30 (both iGPU laptops now unavailable)

Wyatt lost access to Laptop A and B, so step 1's cold-cache repro and step 3's Optimus check
cannot run on the original hardware. Substitute run: **headless SwiftShader, fresh profile
per run (empty shader disk cache)** — the slowest link path available — entering play through
the menu's own `cartrave:menu` event so the entry is genuinely `warm: true`. (A direct
`?room=solo` boot never takes the warm branch; it settles against the 4000 ms default, so
earlier direct-boot runs could not test this card at all.)

| Measure | Proxy (SwiftShader, cold cache) | Laptop A (cap-206) |
|---|---|---|
| warm settle budget | 1500 ms | 1500 ms |
| warm settle `pollMs` | **1009–1068 ms (67–71% of budget)** | not instrumented then |
| warm settle `outcome` | `ready`, `remaining: 0` (×4 runs) | unknown |
| sync `compileMs` at that settle | 43–47 ms | **1040 ms** (~24× heavier) |
| worst menu-warm long frame | 13,116 ms, named spans total **235 ms** | 6,428 ms, named spans 96 ms |

Two readings, and they agree on the lever:

1. **H1 is plausible but unproven.** Even on this box the warm settle burns ~70% of its
   1500 ms budget. Laptop A's *sync compile alone* was ~24× heavier than the proxy's; a poll
   scaling anywhere near that crosses the budget and settles `budget-expired` — which is
   exactly the deferred-link case. We cannot confirm it without a slow adapter, only bound it.
2. **H3 is directly supported.** A 13.1 s menu-warm frame carried only 235 ms of *attributed*
   span time. The cost is overwhelmingly outside JS — ANGLE/driver work at link/first-draw —
   so it can be **relocated but not removed**.

**Both readings point at Lever A.** Lever B (raise the readiness budget) only helps if H1 is
the whole story, and finding 2 says it is not; raising the budget would also lengthen the
mode-entry overlay on exactly the weak machines it is meant to help. **Recommendation: ship
Lever A without waiting for iGPU hardware.**

Real-world confirmation now arrives on its own: Phase 0b telemetry (`warmupSettle`,
`qualityStepDown`, `session_end.tier/steps`) ships to analytics, so the first external
playtester on a weak GPU reports the outcome we could not reproduce — **reset the analytics
DO before that playtest** so the sample is strangers-only.

### Phase 1 — fix (ONE lever, chosen after Phase 0 evidence)

- **Lever A — ✅ SHIPPED 07-30 (awaiting Wyatt desktop spot check).** `isSessionPlayReady`
  now also requires `!arenaRotationInFlight` ([main.js](../../src/main.js)), plus
  `Netcode.signalPlayReadyNow()` in the rotation's `finally` so a settled rotation re-arms
  immediately instead of waiting out the server's 12 s `PLAY_READY_TIMEOUT_MS`.

  **The hole it closed:** `rotateLoadedArenaInPlace` runs
  `warmupActiveSceneShaders({ forPlay: true })` — full compile budget, no loading overlay —
  while carts already exist and no cart bootstrap is pending. `isSessionCartsReady()` alone
  therefore reported READY *during* that compile, so the server could arm `game_start` and
  the countdown could start into it. That is precisely the overlap the 07-21 forensics
  attributed to `warm.render.default.play-full`. The countdown is never delayed once armed —
  this withholds the *arm*, which is what the reverted `c8df8fd` got wrong.

  **Scope limit — read before assuming cap-206 is fixed.** Arena rotation is **quickplay
  only** (`rotateLoadedArenaInPlace` is unreachable in solo). Laptop A's cap-206 was a
  **solo** session, where the flyover warm already ran inside the gate via
  `ensureSessionCartsReady`. So this lever does **not** explain or fix that capture's 6.4 s
  post-`carts-ready` stall. The proxy's finding 2 (13.1 s frame, 235 ms attributed) says that
  residual is driver-side first-draw cost — tracked as **WARM-SOLO-1** in BACKLOG, to be
  worked only on real telemetry, not speculation.
- **Lever B (fallback/adjunct):** scale the compileAsync readiness budget by quality tier
  (medium/low wait for real readiness) so `play-shader-end` stops firing early. Mind the
  three-r185 poll gotcha documented in scene.js.
- **Not on the table:** delaying or gating countdown start (reverted `c8df8fd`).

### Done when

Original criterion (**unreachable — hardware gone**): cold-cache first play on a medium-tier
machine showing countdown `elapsedMs` ≈ 3600 with no >500 ms longtask inside the countdown.

#### Verification without the hardware — results 07-30

- ✅ **Structural proof (headless, SwiftShader cold cache).** No `warmupSettle` /
  `warmupCompile` event and no `warm.*` span falls between the `lobby→countdown` round event
  and GO; zero >500 ms long frames in that window. Countdown ran **3624 ms against a 3600 ms
  config** (cap-206's was 8163 ms). Machine-independent: it holds or fails identically on a
  4090 and a UHD 630.
- ✅ **Unit (4 new, `tests/netcode.test.js`).** Gate predicate is false while rotating, true
  once settled, still requires carts-ready; `signalPlayReadyNow()` exists and is safe to call
  before a socket exists (the rotation `finally` calls it unconditionally, including on the
  failure path).
- ✅ **Two-client MP no-regression.** `netharness --scenario mpIntegration` 18/18, including
  *"both clients advance into a fresh round (rematch works) — host=countdown joiner=countdown"*
  — the rematch → lobby → play-ready → arm path this lever changes.
- ✅ `npm run qa` green — 777 tests.
- ⬜ **Owed (Wyatt, desktop):** COUNTDOWN-WARM-1 feel unchanged, quickplay entry not longer.
- ⬜ **Not verified end-to-end:** an actual quickplay arena *rotation* under two live clients.
  No rotation scenario exists in netharness; the gate predicate and the re-signal are unit-
  covered, the rotation call site is not. Worth adding if a rotation bug ever resurfaces.
- ⬜ **Deferred real-world confirmation:** first weak-GPU playtester's `warmupSettle` /
  `qualityStepDown` telemetry — the only thing that can confirm the iGPU case we cannot
  reproduce.

## Caveat

Laptop sessions were solo only — no new multiplayer evidence; the open host-freeze-near-KO/PA
forensics item is untouched by this card.
