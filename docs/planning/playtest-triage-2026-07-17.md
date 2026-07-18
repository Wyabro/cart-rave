# Playtest triage — 2026-07-17 (evening notes)

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
