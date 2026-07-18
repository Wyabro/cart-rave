# Playtest triage — 2026-07-18 run 6

Notes: "Overall: Good, just a few fixes" — 16/26 checks passed, 10 needs-work.
Evidence: 34 F8 capture bundles (3 zips: `solo and lobby` = 4090 solo session,
`multi` = 4090 side of two MP matches, `reeeeeeee` = Intel UHD side), a 5.5s MP
video, and a Wyatt-supplied `hit-impact.ogg`. All bundles stamp build `5177532`
(run-5 fixes live).

## The headline decodes

### MP smoothness ("not much better tbh") — the Intel machine HOSTED this time

Run-5's conclusion stands (Intel UHD = the smoothness floor) but run-6 adds the
multiplier: **in these matches the Intel machine was the host**, so its hitching
became everyone's experience:

- Intel host: `over33` 27–33% of frames even at LOW/0.75× renderScale (run-5's
  54% → ~30%; the renderScale helped but nowhere near enough).
- 4090 non-host: locally clean (`over33` ≈ 0%), but `snapGapMaxMs` 4965–6957ms,
  27 gaps >100ms, `reconcileErrMaxM` 5.3–19.7m, teleports — all inherited from
  the host's stalls. The host's frame pacing IS the peers' netcode feel.

**Fix shipped:** the auto-quality watchdog no longer stops at the LOW floor — at
LOW it steps a session render-scale multiplier 1 → 0.85 → 0.7 (effective 0.75 →
0.64 → 0.53 of native) on the same p95>20.5ms trigger. Effective scale is now in
the diag `runtime.renderScaleMul` probe, so the next Intel capture shows whether
it engaged. **Playtest lever:** have the 4090 create the room (first joiner
hosts) — that alone would have made these matches smooth for both screens.

### Host minimize = frozen world + live timer (bug confirmed, bounded now)

Host tab hidden → rAF (and the sim) freezes, but its `setInterval` keepalives
keep it from being reaped (>20s reaper never fires) → non-hosts sit frozen
indefinitely while their wall-clock HUD counts down. Fixes shipped:

- **Host side:** on tab return during a running round, the round anchor (and PA
  directive window) shift forward by the hidden gap + `sendHostRound` resyncs
  every client — the round resumes where it froze instead of instantly firing
  timer-end/SD for the hidden gap. Solo gets the same fix free (tabbing away no
  longer eats round time).
- **Non-host side:** new `Netcode.getHostStallMs()` (snapshot silence beyond a
  2.5s grace) — the HUD holds the countdown during the stall and shows a
  "Host connection stalled" toast once per stall.

### Sudden Death "bugged" in MP — a stalemate, not a latch bug

Intel capture: `isSuddenDeath:true`, `remainingMs:-24200`, phase still running,
scores tied 1-1. Decode: SD only ends on a resolving KO (attributed kill of a
tied cart, or a self-fall leaving exactly one tied cart). On Storerooms' solid
floor two cagey drivers can circle forever — **SD had no timeout**. The negative
remaining is probe-only (HUD pins SD to 0). Fixes shipped:

- `CONFIG.round.suddenDeathMaxMs` (45s): host ends the round via the standard
  most-recent-scoring-hit tiebreak. `endRound()` with no scorer during SD now
  also clears the SD flag + cleans up spectators (it previously left the flag
  set into the podium).
- **Force-SD in prod:** `__ccDiag.control` (incl. `forceSuddenDeath()`,
  `setScores`, `rewindRoundClock`) now attaches in production under `?diag=1`
  (host-gated, running-round-gated). Deliberate trade-off, noted in code:
  a quickplay host with `?diag=1` could cheat — revisit before public launch.

### Menu music bleeding into game ("insane at this point") — root-caused + tested

The recurring regression had a fresh cause each time; this round it was run-5
itself: `18fc25d` deferred `commitMenuHiddenForGame` by 320ms (visual overlap),
which also deferred `stopMenuMusic` — reopening the exact async-replay window
the 07-17 fix (`a53f231`) had closed (late `ctx.resume`/`onload`/HTML5
`_playLock` play-promise races restart the menu Howl after the stop). Fixes:

1. `enterPlayMode` now stops menu music **synchronously at the click** (new
   `stopMenuMusicForPlay` bootstrap dep); the 320ms deferral stays visual-only.
2. Terminal guard on the menu Howl itself: `onplay` fires → if intent flags say
   "menu must be silent", it stops instantly. This kills the class, not the
   instance — any future re-trigger path dies at the Howl.
3. `duckMusic`'s release fade no longer touches the menu Howl mid-game (it was
   re-ramping a "stopped" HTML5 element's volume back up).
4. Three new regression tests in `tests/audioManager.test.js` (late-play kill,
   duck-release isolation, plus the mock now models the `_playLock` race).

### Hit marker inaudible — the slider was applied TWICE to synth stings

`sfxSynth` recipes multiply by `getSfxVolume()` AND the THREE listener master
gain was also set to the slider → quadratic. At Wyatt's real slider (0.08!) the
kill-confirm played at ~0.2% amplitude. File-based (Howler) SFX apply it once.

- Listener master gain is now a **mute gate only** (recipes carry the slider) —
  all synth stings become linear. Sites: audioControls, main, audioManager
  visibility-restore.
- `hit-impact.ogg` → `public/sounds/kill-confirm.opus` (−18.2 LUFS, −1.3 dBTP,
  libopus 96k) registered as Howler SFX `killConfirm`; `onLocalKillConfirm`
  plays it (spill-bonus keeps the synth sting).

### Esc menu bugs PA directives — uncompensated clock domain

Solo Esc pause shifts the round/countdown anchors but the directive window rides
raw `performance.now()` — it silently drained (or expired) behind the pause
menu. New `shiftDirectiveTimersBy(delta)` is called from the solo pause resume
(and from the host tab-return compensation).

### Lobby stalls when clicking buttons (general note)

Captures: longframes 4270ms + 3572ms with `resume:false` (real stalls) in the
lobby on the **4090**. Cause: the menu arena-preview swap (dispose + build +
`compileAsync` + first-Sundial equirect→PMREM bake) forced within 900ms by the
`requestIdleCallback` timeout — landing exactly while the player is clicking.
Fixes: (a) idle warm now pre-bakes the Sundial sunset env PMREM offscreen (4×4
RT render seeding the renderer's by-texture cache), killing the biggest one-time
stall; (b) preview idle timeout 900→2000ms so swaps wait for genuine idle.
Residual: per-swap arena build+compile cost still exists — masked, not free.

## The look/feel batch

- **Boost glow white/hot** → charge-ready white-mix 0.08–0.26 → 0.04–0.12,
  `glowPeakIntensityMul` 1.95→1.6, active-nitro pulse 1.2–1.6× → 1.1–1.35×,
  streak core gain/bloomBoost trimmed (mix caps 1.12/1.15), `streakBrightnessMul`
  1.05→0.95. Leader-white identity untouched (its own path).
- **Cart Rave moving spotlights** → they never died; `4b8d5d5` re-aimed the 4
  crowd searchlights into the stands (green-booth white-sheet taming). The sheet
  came from a FIXED heading + additive cone meshes — both gone — so the sweep is
  restored: staggered radii (12/20/28/36m breathing), y=−3 onto the vinyl, all
  4 colors incl. the green-booth unit, intensity 28→22. Still tier-gated: LOW
  has `extrasLasers:false` (the Intel machine keeps them off — deliberate).
- **Storerooms vortex hard inner edge** → the band mask had no inner falloff
  (full strength at the void lip). Added `smoothstep(uInner, uInner+0.9)` inner
  fade — peak now sits mid-band, zero at both boundaries.
- **Blob shadow** → Wyatt's ruling encoded: same flat circle under every cart.
  Equal radii 1.0/1.0 (was 0.8×1.16 ellipse), `minAirborneScale` 1.0 (no height
  shrink), Zanzibar directional bias removed entirely. Height opacity fade and
  hole masking kept.
- **Handoffs still jank** → the residual seam: overlay dismiss held the opaque
  backdrop until +280ms while only the panel faded. `cr-load--exit` now fades
  bg/vignette/scan with the panel — the live arena crossfades in immediately.
- **Storerooms song** → trimmed 5:08 → 3:00 (2s fade-out loop seam), 3.86 →
  2.36MB, −13.4 LUFS (matches the −13.5 music set). Still loops for podium
  idling. Ear-check the loop seam.

## Verification state

- `npm run qa`: 449 tests / 49 files green, typecheck + knip clean.
- `npm run build`: green.
- Visual shots: classic (spotlights) + storerooms (vortex) via `npm run shoot`.
- NOT yet human-validated: everything (behavior-changing → needs run-7 eyes).

## Run-7 checklist (for Wyatt)

1. **MP smoothness**: have the **4090 create the room** this time. Check both
   screens; F8 on Intel → `runtime.renderScaleMul` shows if the dynamic
   step-down engaged (expect 0.85 or 0.7 after ~10s of play).
2. **Host minimize**: minimize the host mid-round ~10s → non-host should show
   the stall toast + frozen timer; on host return both resume where they froze.
3. **Sudden death**: on the host with `?diag=1`:
   `__ccDiag.control.forceSuddenDeath()` → SD should enter, and if nobody
   scores, resolve by tiebreak within 45s.
4. **Music**: solo entry from menu several times (fast + slow clicks) — listen
   for menu track under level music. Also return-to-menu → re-enter.
5. **Kill confirm**: at YOUR normal slider (even 8%) — the new hit-impact should
   land on every KO.
6. **Esc menu** (solo): open Esc mid-directive ~10s → directive timer should
   resume where it paused.
7. **Looks**: boost glow = cart color?, spotlights sweeping the Cart Rave floor
   (medium/high tier only), vortex inner edge blends into the hole, shadows =
   same circle under every cart, handoff dismiss crossfades (no dark beat).
8. **Storerooms song**: loop seam at 3:00 acceptable?
