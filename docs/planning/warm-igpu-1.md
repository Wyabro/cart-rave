# WARM-IGPU-1 — first-play shader warm stall on iGPU laptops (countdown swallowed)

**Status:** Phase 0 + 0b **acked** (Wyatt 07-30). Agent half (instrumentation) ✅ **landed
07-30**; steps 1 and 3 below are **Wyatt-machine actions and still owed**. Phase 1 lever
choice needs its own ack once those captures exist.

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

### Phase 1 — fix (ONE lever, chosen after Phase 0 evidence)

- **Lever A (recommended — the sanctioned lever verbatim):** fold the flyover-framing warm
  into the pre-countdown play-ready gate (`isSessionPlayReady`,
  [netcode.js:371](../../src/netcode.js)) that COUNTDOWN-ARM-1 already arms `game_start` on.
  All link cost lands before the countdown arms; countdown is never delayed once armed.
  Total entry time unchanged — this converts Laptop-A's swallowed countdown into
  Laptop-B's clean one.
- **Lever B (fallback/adjunct):** scale the compileAsync readiness budget by quality tier
  (medium/low wait for real readiness) so `play-shader-end` stops firing early. Mind the
  three-r185 poll gotcha documented in scene.js.
- **Not on the table:** delaying or gating countdown start (reverted `c8df8fd`).

### Done when

- Cold-cache first play on a medium-tier machine: countdown `elapsedMs` ≈ `countdownMs`
  (3600), no >500 ms longtask inside the countdown window, F8 capture as evidence.
- `npm run qa` green; desktop COUNTDOWN-WARM-1 feel unchanged (Wyatt spot check).

## Caveat

Laptop sessions were solo only — no new multiplayer evidence; the open host-freeze-near-KO/PA
forensics item is untouched by this card.
