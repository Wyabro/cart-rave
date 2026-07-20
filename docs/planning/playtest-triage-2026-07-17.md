# Playtest triage — 2026-07-17 (evening notes)

> **Historical / superseded.** Run 7 closed 2026-07-20. Live queue and phase live in
> [STATUS.md](../STATUS.md). Keep this file for forensics only — do not treat open rows as current.

Source: Wyatt's playtest console dump, 7/17 5:06 PM. 12 NEEDS WORK items + general
notes. This doc maps each item to root cause → change shipped this pass → what's
left. The multiplayer performance assessment is at the bottom — read it; it is
deliberately not cheerleading.

## Fixed this pass

### 1. Ram feels delayed / light taps weak
Root cause found: knockback was **deliberately spread over 3 fixed physics steps
and deferred one frame** (`CONFIG.ramming.spreadSteps: 3`, drained in
simulation.js before `world.step`). Contact → full launch was ~50–65 ms, and the
spreading also flattened peak acceleration, which is why light taps read weak.
- `spreadSteps` 3 → 1: full impulse lands on the next fixed step (~16 ms). Same
  total impulse, higher peak = punchier taps AND less delay, one knob.
- Kill-confirm delay is different: a KO only scores when the victim actually
  falls past `fall.yThreshold` (design — rescues/hangtime stay possible). Not
  changed. If it still reads slow, the lever is a *presentational* "doomed"
  cue when a cart goes over the edge unrecoverable, not faster scoring.

### 2. Hit marker flash disorienting
The per-hit stack was vignette+aberration pulse (240 ms, clamp 1.2) + shake +
FOV punch + white kill flash 0.6. Changes (main.js): pulse 240→170 ms, clamp
1.2→0.9, attacker-side pulse scaled ×0.7 (victim-side kept full — being hit
should still rattle), kill flash 0.6→0.45, kill pulse 0.55→0.4. World hitmarker
ring untouched.

### 3. Boost recharge lockout
`boostCharge.boostCooldownMs` 1000 → 200. Charging is available near-instantly
after a burst, as asked. (Uncharged boost untouched.)

### 4. Bots more aggressive (at you and each other)
Personality tune (src/npcNames.js): humanWeight aggressor .917→.93, lurker
.474→.55, scavenger .636→.70, chaotic .368→.45; NPC-vs-NPC ram commit chance
(`npcRamCommitChance`) .50/.25/.25/.35 → .62/.35/.35/.45. The existing ≤8m
proximity-aggression override is unchanged.

### 5. Countdown pacing
Was a hardcoded 3000 ms window (magic number in 9 places). Now single-sourced as
`COUNTDOWN_MS` in shared/roundConstants.js — used by client
(`CONFIG.round.countdownMs`) AND the server's game_start arming timer (they must
agree or MP digits pace against the wrong GO). HUD digits now hold
countdownMs/3 each instead of a fixed 1 s cadence. Went 3000→4500 in run 1
("rushed"), then **4500→3600 in run 2** ("1.5 s is a bit too long — 1.2 s").

### 6. Announcer overlap + directive length
- Overlap root cause: `sequence`-class clips (countdown/GO) deliberately played
  **over** a busy channel. Now they cut a live spoken line (90 ms fade) first;
  sibling countdown clips still ring their tails by design.
- Directive callouts: hold/duration/ttl 4000 → 2800 ms on all five directives
  (focus-window suppression shrinks with it). The *recorded lines themselves*
  still need Wyatt's re-records to get shorter — code can't trim the takes.

### 7. Music louder than everything
Root cause: music and SFX shared one default (0.575) but music is a sustained
bed while SFX are transient — equal defaults always read music-loud. Music-only
default now 0.35×max ≈ 0.40 (audioStore.js). Saved sliders are untouched; this
only affects players who never moved the slider (includes every fresh playtester).

### 8. Sundial splash "needs a SFX"
A synth splash already existed — it was buried under the music and had no
transient. Added a sharp surface-slap layer + raised gain (sfxSynth.js
`playWaterSplash`). Combined with the music default drop it should now read.
If it still doesn't sell, next step is a recorded splash asset (none exist in
the repo today — the splash is fully procedural).

### 9. ACES filmic
`applyRendererColorGrading` now sets `ACESFilmicToneMapping` (was Neutral).
Exposure stays 0.4 (that value was retuned for the corrected OutputPass
pipeline — the old 0.88 predates exposure actually working). Sundial-too-dark
handled by a new per-arena knob: `CONFIG.postFx.arenaExposureMul` (zanzibar:
1.18), applied at level load. **Needs Wyatt's eyeball on all three arenas** —
1.18 is a first guess, and "keep it dark" is still the law.

### 10. Non-host deaths have no shatter (MP)
Real bug, exact mechanism: the replicated shatter DID spawn, then the local
reconcile path (gameLoop.js) respawned the local cart on the very next host
snapshot — while the host still reported it dead — destroying the VFX one frame
in. The remote-cart path got the "wait for the shatter's own lifetime" guard in
a past fix; the local path was missed. Now mirrors the remote rule: respawn only
when the host reports alive AND `isShatterAnimating` is false. Should also fix
"respawns feel delayed"-adjacent weirdness where the cart snapped around at
death.

### 11. Quickplay joiner loads wrong arena (first join)
The prior hello-latch fix parked the room's levelId in
`pendingArenaRotationLevelId`, but every drain attempt ran while the menu was
still visible (drain no-ops on `menuVisible`) and nothing re-drained after the
menu hid — so the correction waited for the next round broadcast, exactly the
observed "fixed itself after the round ended." `commitMenuHiddenForGame` now
kicks `drainPendingArenaRotation()` after flipping `menuVisible`.

### 12. Host reload mid-round → menu stuck over game
Mechanism identified (not 100% reproduced): the quickplay auto-rejoin's
in-flight play-entry holds a deferred `commitMenuHiddenForGame`; if anything
fires `returnToMenu` in that window (join-reject, ghost-exorcise race, sim
error), the stale bootstrap later re-hides/reveals against the fresh menu —
menu-over-game, input dead. Fix: play-entry generation token
(`invalidateActivePlayEntry` bumped in `teardownGameSession`) so a torn-down
session's deferred menu-hide becomes a no-op. Honest caveat: this closes the
one desync path we could identify from code; a live host-reload-mid-round
2-browser test is still needed to call it fixed.

## MP hitch work shipped this pass (partial)

- **Empty snapshot tail skip** (netcode/binary.js): host stringified and every
  client parsed `{"collisions":[],"falls":[]}` 40×/sec even when empty. Now the
  tail is omitted entirely on empty frames (decoder already handled absence).
  Kills a steady per-frame alloc+parse on BOTH screens.
- **Remote-look shader warm-up** (main.js): server-driven slot colors/patterns
  can flip a cart's shader program key AFTER round-start warm-up compiled the
  defaults — first render of a re-skinned remote cart compiled synchronously
  mid-round (MP-only hitch). `updateCartMaterialsFromSlots` now schedules a
  coalesced `renderer.compileAsync`.

## The honest multiplayer assessment

What the notes say: severe hitching, delayed respawns, "basically non playable,"
and (fairly) that I keep calling MP nearly done. Taking that seriously:

**1. A large share of the hitching is NOT netcode.** The same notes say solo has
"major performance issues… hitches everywhere on almost every screen." A client
that hitches in solo will hitch worse in MP (more carts, more VFX, plus network
work per frame). Judging netcode quality through a hitching renderer is how we
end up rewriting the wrong layer.

**2. The architecture is not the obvious suspect yet.** Host-authoritative sim +
client prediction + snapshot interpolation over a DataChannel is the standard
shape for a 4-player arena game; nothing found in this pass says the *shape* is
wrong. What we found instead are concrete implementation costs:

| Rank | Source | Status |
|---|---|---|
| 1 | Reconcile rewind-replay: every host snapshot replays ALL pending inputs, each a **full Rapier world step** — N inputs × 40 Hz, MP-only | **Open — next perf pass** |
| 2 | Per-snapshot decode allocations (~1000+ short-lived objects/sec; retained briefly by the interp buffer, so pooling needs a ring-buffer design, not a drive-by) | **Open — next perf pass** |
| 3 | JSON tail stringify/parse every frame even when empty | Fixed this pass |
| 4 | Per-message ArrayBuffer copy in `coerceToArrayBuffer` (p2p.js) | Open (small) |
| 5 | Mid-round synchronous shader compile for late remote-cart looks | Fixed this pass |

**3. Measure before rearchitecting.** The diagnostics for this already ship in
prod: `?diag=1` + F8 capture bundle. The single highest-value thing the next
2-PC playtest can do is press F8 during a hitch storm on both machines and send
both bundles — that tells us whether the long frames are physics (replay),
GC (decode allocs), shader compiles, or render-bound, per machine.

**4. When a rethink WOULD be justified:** if, after the replay-cap + decode
pooling pass lands, a wired-LAN 2-PC session still hitches on the netcode path,
the fallback isn't "rewrite netcode" wholesale — it's dropping predict-replay
for interpolation-only on the local cart (accepting ~1 RTT input latency, like
the remote carts already do) which deletes hitch source #1 outright. That's a
scoped change, not an architecture rewrite.

## Not touched (Wyatt's own list / taste)
- **VHS pass**: git history says the flicker work changed **nothing** in the VHS
  params — the only change ever was `e4c4ac7` (07-09, "restore approved VHS
  tuning": amount 1.0→0.3, trackPeriod 26→22, noise scaled-by-amount). Knobs:
  `CONFIG.postFx.vhs` (config.js). So "it drifted during the flicker fix" is a
  false memory — what's there is the 07-09 approved tune.
- **Announcer re-records** (weird-sounding takes, shorter directive reads).
- **Wilting groceries reads as confetti** — needs an art direction call
  (desaturate + slower droop vs different silhouette). Not attempted blind.
- ~~Countdown length taste~~ — settled in run 2: `COUNTDOWN_MS = 3600` (1.2 s/digit).

---

## Run 2 addendum (same evening, 16/22 good, deployed `25891a7` / Version `10cfd8fd`)

Validated: ram feel, boost recharge, bots, announcer overlap, music balance,
first-join arena. Still open from run 2:

- **Sundial sun** — run-2 photo showed halo geometry RIMS (flat-opacity additive
  circles) + a bloom cross flare off the hard flat-bright disc. Reworked to
  radial soft-falloff textures (`buildSoftDiscTexture`, zanzibarPlatform.js) +
  exposure 1.18→1.32. **Needs eyes-on**; residual cross → tune Sundial's bloom
  threshold next.
- **Splash** — was firing but masked by the death-time audio stack; Wyatt's
  recording now ships (public/sounds/water-splash.opus, HEAD-checked drop-in
  registration in main.js, synth fallback retained).
- **Load stall root cause (from Wyatt's F8s, RTX 4090)** — zanzibar play-shader
  6.5 s vs 0.8 s elsewhere: fresh sunset equirect env PMREM-baked inside the
  synchronous compile every load, + composer passes compiling on the first
  visible frame (the round-start hitch that ate the flyover). Fixed: session-
  cached env texture (deliberately never disposed) + one throwaway
  `composer.render()` behind the overlay. Remaining first-load cost →
  BOOT-PERF-1 (menu-idle selected-arena pre-warm) in BACKLOG.
- **Non-host spawn-lock recurred** — zero captures from the locked machine, so
  no verdict. Suspect list includes the new join-time in-place arena rotation.
  F8 bundles now carry a `net` probe (input sampling-starved vs unacked), an
  `audio` probe, and `perf/longframe` events — **one F8 on the locked machine
  decides it.**

---

## Run 3 (Wyatt's notes header says "RUN 2", 11:18 PM, against deploy `f1b0aaf`; 18/22 good)

Wyatt's 8 F8 bundles decode as ONE page session on his machine: 3 solo rounds
(mode=solo, isHost) → menu → quickplay as non-host. That ordering *is* the repro.

### Non-host spawn-lock — ROOT CAUSE FOUND, FIXED
The run-2 probe decided it exactly as designed: `pendingInputs: 0` +
`localAckSeq: 0` while `lastSnapSeq` climbed (1983→6041→12221) = input
**sampling** starved, not the wire/ack path. Cause: `returnToMenu` →
`clearNetcodeRuntimeRefs` (main.js) nulls netcode's `getAxisRef`, and only the
one-time boot block ever wired it — so `sampleLocalInputForTick` is a permanent
no-op for the rest of the page session after ANY menu return (`if (!getAxisRef)
return null`), and reconcile pins the cart to the host's spawn pose. Solo → menu
→ join quickplay = frozen every round, all session.
- Why nothing caught it: host reads input directly (immune), solo is host-mode
  (immune), and every harness scenario joins via `?room=` URL, skipping the menu
  teardown entirely. The mpIntegration "peak 0.00m flake" was very likely this
  bug through a different door.
- Fix: `wireNetcodeRuntimeRefs()` — full ref bundle re-applied on every
  `ensureSessionCartsReady` (which provably runs on the broken path: the
  captures show carts spawning each round). F8 `net` probe now also carries
  `axisWired` + `migFreezeRemMs` (the two freeze gates the run-2 probe couldn't
  see). Follow-up chip: harness scenario that does a menu teardown before join.

### Countdown "notably wonky" — decoded from the countdown F8 + fixed
Ring buffer: lobby→countdown 952325, countdown→lobby 952440 (server's legit
arm→abort→re-arm, near-invisible, left alone), countdown again 952979, digits
3 (953447) and 2 (954617)… then a 6.4 s gap, and 1/GO/running all bunched at
961021-961028 — ~4 s after the host's GO. Cause: the non-host entered play on
its stale arena (solo leftover backrooms) and the room-arena swap (zanzibar) ran
DURING the countdown; `isLevelSwapping` gates `onFrame`, so the frame-driven
digits froze and burst on swap end. Fix: non-host `game_start` countdown
application defers via `whenArenaRotationSettled()` (gen-token cancel-safe); if
the server start time already passed when the swap settles, it drops straight
into running (host_round reconciles startedAtMs). Result: "NEXT ARENA" crossfade
→ honest remaining digits or straight GO, no stall-burst.

### Over-emissive carts (cyan/magenta, leader white, ALL arenas) — "what changed" answered
The ACESFilmic restore in run 1 (`5b254aa`). Cart glow constants were balanced
against the old tone mapping: `CART_EMISSIVE_MASTER` 0.575 → 0.46, per-hue
luminance boost capped at 2.0× (magenta was getting 2.5×, red 3.4×), leader
white-mix peak scale 0.85 → 0.66. Needs eyes-on; all three knobs are one-line.

### Sundial (needs eyes-on)
- Sun "a bit too bright": `sunMat.opacity` 0.85 (falloff shape unchanged).
- The remaining "cross": same class as the run-2 sun bug — flat-opacity additive
  planes drawing their geometry edges under ACES + exposure. Horizontal arm =
  the horizon haze cylinder (hard top edge) → vertical soft-strip alpha texture
  (`buildSoftStripTexture`), hot at the waterline melting upward. Vertical arm =
  the three untextured god-ray shaft planes → shared radial falloff texture.
  Peak opacities bumped to keep the mood at the same average.

### Splash "louder but repetitive"
Playback variation on the single recording (same trick as `playCartCrash`):
rate 0.86–1.14 + small gain wobble, base volume 0.6–1.0 → 0.42–0.78
(waterDeathFx.js). Death-explosion re-record is Wyatt's own recording task.

### Contact shadows through objects — answered + fixed
Blob quads rendered with `depthTest: false` in the transparent pass = painted
over every opaque mesh. Now `depthTest: true` (`floorEpsilon` 4.5 cm clears
floor z-fighting). Trade-off: on raised surfaces the floor-level blob is
occluded by the platform instead of bleeding through.

### Solo hitches (better, residual)
Remaining mid-round longframes in the solo F8s: 350–750 ms spikes clustering
near first-play announcer events (lazy announcer decode is the prime suspect —
each clip's first play decodes on the main thread), plus the known play-entry
load stalls (BOOT-PERF-1). Not attempted this pass.
