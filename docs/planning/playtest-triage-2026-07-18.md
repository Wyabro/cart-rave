# Playtest triage — 2026-07-18 (run 4)

> **Historical / superseded.** Run 7 closed 2026-07-20. Live queue and phase live in
> [STATUS.md](../STATUS.md). Keep for forensics only.

Run-4 notes: 19/25 good, **6 needs-work** + 2 general notes. All 8 addressed in `7e67fe2`,
deployed as Version `d42534f4` (bundle `index-JHMFE-UK.js`). This file is the decode — what
the evidence showed, what changed, and what run 5 should confirm.

## The headline: MP "stuttery mess / laggy-rubberbandy" — and the VPS question

Wyatt: *"I'm leaning in to the idea of maybe moving things over to a vps or something at
this point."* The evidence says **don't** — every mechanism found was client-side, and the
game's real-time traffic never touches our server anyway (P2P WebRTC DataChannels; the
Worker/DO only does lobby + signaling). A VPS changes nothing about this jank. If a future
capture shows high `net.flow.snapGapMaxMs` with a healthy sender, *that* would be a
transport conversation — infra moves should wait for that evidence.

### Evidence

- 12 F8 bundles (all non-host): `connectionState: "ok"` throughout, small input backlog
  (4–8 pending ≈ 67–133 ms unacked at 60 Hz — normal RTT), `axisWired: true` — the wire
  and the input path were healthy while the screen looked wrong.
- ScreenSketch video of the non-host, run through `ffmpeg freezedetect`: a ~67 ms full
  freeze recurring every ~1.0–1.2 s, metronome-regular — a major-GC signature, invisible
  to the longframe probe (its threshold was 100 ms).
- The bundles carried **zero** snapshot-cadence or reconcile-error data — the exact
  signals needed to diagnose rubberbanding were unobserved (now fixed, see Observability).

### Root causes and fixes (all in `7e67fe2`)

1. **Hard-snap reconciliation (the rubberband).** The non-host's own cart was corrected by
   hard-snapping the Rapier body to host truth + replaying unacked inputs on *every*
   snapshot (up to 40 Hz). The smooth-correction knobs in `CONFIG.net.prediction` were
   dead config — nothing read them. Fix: the pre↔post correction delta now accumulates
   into `cart._reconcileVisOffset` (gameLoop.js); frameVisuals renders the mesh at
   body + offset and decays it at `reconcilePosRate`/`reconcileRotRate`; corrections ≥
   `maxCorrectionM` (4 m, respawns/desyncs) still snap clean. Physics is untouched —
   host-authoritative truth still lands instantly in the body.
2. **The camera re-broadcast every snap.** The follow camera reads the raw body pose and
   is rigid by design (no-lerp invariant), so each body snap moved the whole screen.
   main.js now feeds the camera the same smoothed pose (body + offset) the mesh renders
   at. The no-camera-smoothing invariant stands — the error is eased at its source, and
   the camera stays rigid relative to the smoothed pose.
3. **Decode allocation → periodic major GC (the 67 ms metronome).** `decodeHostStateSnapshot`
   allocated ~20 objects/arrays per snapshot × 40 Hz, and the interp buffer retains up to
   64 snapshots (~1.6 s) — every allocation survived the nursery, got promoted, and became
   steady old-gen garbage. Fix: a 96-entry ring pool in binary.js (must exceed the
   64-snapshot retention; 32 snapshots of slack for transient refs). Tail arrays
   (collisions/falls) stay freshly allocated — they're processed on arrival and die young.
4. **Host send bursts.** The 40 Hz send loop is a free-running `setInterval`; after a host
   main-thread hitch the queued callbacks fired back-to-back, dumping near-identical-tHost
   snapshots that every client then reconciled in a pile. Fix: ticks that fire sooner than
   half the send period are skipped (the forced round-end flush bypasses the guard).

### Observability added (the run-4 blind spots)

- `net.flow` in every F8 bundle: `snapGapAvgMs` / `snapGapMaxMs` / `snapGapsOver100` /
  `snapCount` + `reconcileErrLastM` / `reconcileErrMaxM` / `reconcileTeleports`, reset per
  prediction reset (`getNetFlowStats()` in netcode.js).
- `net/snap_gap` diag events for arrival gaps > 250 ms (rate-limited 1/s) — timestamped
  against KOs/announcer/boot in the event ring.
- `perf.loop.over33` / `over66` counters — sub-100 ms hitches now leave a trace.

### What run 5 should show

Both screens should feel dramatically smoother; the non-host's own cart should glide
through corrections instead of vibrating. If it's still rough: F8 on **both** machines —
the bundle now answers "sender, wire, or receiver?" directly (`flow.snapGapMaxMs` high →
sender/wire; gaps clean but `over66` climbing → local frame cost; `reconcileErrMaxM`
persistently high → prediction divergence worth tuning `inputJitterBufferMs`/rates).

## The other seven

| Item | Cause | Fix |
|---|---|---|
| Patterned carts "way darker", solids "a tad dark" | run-3 master cut 0.575→0.46 hit pattern valleys in the ACES toe (~1:1 visible) while solid wire hid in the shoulder + bloom | master 0.46→**0.52**; pattern valley tint 0.15→**0.22**, emissive boost 0.22→**0.40** (~3× valley luminance). Hue-boost cap (the actual blow-out source) unchanged |
| Shadows "clip into the arena floors" | depthTest ON (run-3) + 4.5 cm hover < depth-buffer quantization at 10–30 m view distances → blob fragments tie/lose vs floor in patches | `polygonOffset: -2/-4` on the blob material — wins vs the coplanar floor, real occluders still occlude |
| Splash "tad louder, more varied" | single take, ±14% rate, 0.45 base | base 0.52, rate ±22%, wider gain wobble, + a detuned low "body" layer 50–140 ms behind on bigger falls (65% chance) |
| "no sfx on death for non host" | death sting lives only in host-side `scheduleRespawn` (own-cart gated); the non-host's own death arrives via the snapshot fall tail → `processHostFallEvent`, which replayed VFX only | `playSfx("death")` in the fall-event handler when the victim slot is the local slot (600 ms dedupe already upstream) |
| Sundial hologram "carts drive through it" | base hover 2.85 m above podium; dial plate dipped to ~3.0 m at bob-min | `HOLO_HOVER_Y = 3.75` (+0.9 m), single constant for placement + bob |
| Countdown / spawn-lock | *(not flagged in run 4 — run-3 fixes confirmed by silence; "works but stuttery" implies the non-host drove)* | — |

## Side finds

- Stale `.claude/worktrees/dreamy-hopper-895792` worktree (already cherry-picked as
  `1de4fc7`) sat inside the repo and doubled vitest discovery (888 "tests"). Removed;
  honest count is 444/49. An empty locked root dir may linger until reboot.
- gameharness flaked once inside the battery (exit 1 with 33/0 checks passing — scenario
  error at teardown, zombie-workerd environment); standalone rerun: 41/41, exit 0.

Gates at ship time: qa 444 tests / 49 files green, build green, battery netcode rigs
green (spawnlock 4/4 · mpIntegration 16/16 · hostMigration 7/7 · teardownRejoin 8/8),
gameharness 41/41 on rerun. Deployed and byte-verified: `snap_gap`,
`_reconcileVisOffset`, `over66`, `reconcileTeleports` all present in the served bundle.
