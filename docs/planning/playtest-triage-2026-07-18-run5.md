# Playtest triage — 2026-07-18 (run 5)

> **Historical / superseded.** Run 7 closed 2026-07-20. Live queue and phase live in
> [STATUS.md](../STATUS.md). Keep for forensics only.

Run-5 notes: 20/25 good ("Good, just a few fixes"), **5 needs-work** + a 7-item general
list. This run's captures carried the new `net.flow` / `over33`/`over66` instrumentation
from run-4 — and they materially changed the diagnosis.

## The big finding: the host machine is the smoothness floor

Run-5 evidence (host PC bundles from cartclash.zip + non-host bundles + video):

- **Host PC = Intel UHD Graphics (Ice Lake iGPU), 8 GB, Edge, quality tier already
  "low", DPR 1, ~1910×915.** Its loop counters: `over33 = 2300 / 4267 frames` — **54%
  of all frames over 33 ms** — and ~1.4 frames/s over 66 ms. That machine is chronically
  GPU-bound at the floor of the quality ladder.
- **Non-host PC (RTX 4090): locally clean.** `over33 = 2 / 3842 frames`. The run-4
  netcode work (reconcile easing, decode pool, camera) landed — the receiver's own loop
  is no longer the problem.
- `net.flow` on the non-host: `snapGapAvgMs 25.8` (healthy 40 Hz sender on average), but
  11 gaps > 100 ms in ~22 s — and the recorded `snap_gap` events coincide with the
  receiver's own rare stalls (e.g. gap 791 ms right on top of a local 783 ms longframe):
  when the main thread stalls, message delivery stalls with it.
- `reconcileErrMaxM 1.114` / `last 0.555` — prediction diverges up to a meter against a
  host whose simulation advances in 33-400 ms lurches. The visual easing absorbs the
  snap, but the underlying state is genuinely jerky.

**Attribution correction (run-4 decode honesty):** run-4's video metronome (~67 ms
freeze every ~1.1 s) was attributed to major-GC pauses from unpooled snapshot decode.
The run-5 counters disprove that framing for the current build: the 4090's loop shows
near-zero over-66 frames while the metronome cadence matches the Intel host's ~1.4/s
over-66 rate almost exactly — the metronome was (and is) **the weak machine's chronic
GPU-bound hitching**, filmed. The decode ring pool remains correct hygiene (the promoted
churn was real), but the once-per-second freeze was the other PC. VPS remains
not-indicated: nothing here is transport; the floor is an iGPU out of GPU budget.

### What shipped for it

- **`renderScale` quality knob** (`qualityTiers.js`): LOW now renders the drawing buffer
  at **0.75× native** (≈44% fewer fragments) and lets the browser upscale; CSS size
  unchanged. Wired through both authoritative pixel-ratio sites (`scene.js`
  `applyComposerQualityTier` + boot, `cameraFraming.js` `updateViewport` — the
  resize-stomp gotcha) so tier steps and resizes agree. Medium/high stay native.
- Next capture from the Intel machine tells us if 0.75 is enough (`perf.loop.over33`
  should drop hard). If not, the next levers are a lower renderScale step, tier-gating
  the always-on RoomEnvironment IBL, and the crowd/dust budgets.

### Also in the netcode/probe layer

- `flow.windowMs` was 0 on direct-join paths (stats window never anchored) — now anchors
  on first snapshot arrival.

## The bug you found: boost-charge loop stuck on non-host death

Exact parity gap from the run-4 death-sting fix: the host's own-death path
(`scheduleRespawn`) stops the `chargeUp` loop + plays the sting; the non-host's
own-death path (`processHostFallEvent`) got only the sting. Dying with nitro held never
fires `onBoostRelease`, so the loop repeated until the round-boundary sweep. Fixed by
routing the same `stopChargeSfxForCart` helper through the netcode callbacks bridge and
calling it beside the sting. (Remote carts can't leak — only the local cart ever starts
the charge loop.)

## The rest

| Item | Cause | Fix |
|---|---|---|
| Yellow solid cart "still a bit hot" | yellow is the only palette hue with luma above the normalization reference (0.93 vs 0.72) — linear normalization under-corrects it | over-reference hues tamed with a ^1.6 exponent (yellow −15%); 0.85 gate keeps cyan (~0.9, signed off) and all boosted hues untouched (`utils.js`) |
| Shadows "still clip the floor as they move around" | no light-cast shadows exist (shadowMap never enabled — verified); the blob quad still lost depth ties over sloped chamfers/raised floor decor at long view distances where -2/-4 offset was under the depth quantum | polygonOffset strengthened to **-4 / -32** (`contactShadows.js`) — still centimeters-equivalent at 100 m, far under any real occluder separation |
| Cart Rave pit purple "hard edges" | haze discs + throat cylinder were flat-opacity surfaces whose geometry rims draw as lines under ACES (the sundial-cross failure) | sundial cure applied: canvas-gradient alpha maps (radial for discs, vertical for the throat) reaching 0 before the geometry edge; peak opacities nudged up to keep density (`arena.js`) |
| Storerooms vortex "pinkish, needs touch-up" | crest color was hot magenta-red — rave-family, but the Storerooms palette is sodium/fluorescent/sickly-green by design | recolored dim sickly-olive → hot sodium amber, ~20% softer overall (`backroomsSupermarket.js` shader) |
| Storerooms EXIT sign | background dressing that never earned its keep (already de-collidered after wedging carts on 07-15) | removed entirely (sign + post + glyph texture) |
| Attract → loading "rough" | menu was hard-cut to a bare canvas frame BEFORE the overlay faded in | menu now stays up while the overlay fades in over it (260 ms), then drops once opaque; end-of-load commit is the idempotent backstop (`bootstrap.js`) |
| Loading → level "rough" | dismissal held a dead panel-less dark overlay ~400 ms (exit at 180 ms, opacity fade only after a further 420 ms) | overlapped: slap-exit starts at 120 ms, whole-overlay fade mid-slap — continuous motion, ~540 ms total (`loadingScreen.js`) |
| MATCH POINT "too big, needs life" | 11-char word at the GO!-sized clamp (5.4 rem), then sat static | `--mp` class: ~40% smaller, wider tracking; SD-style sustained heartbeat pulse that keeps the banner tilt (`hud.js` + `hud.css`) |
| Kill confirm "could use a subtle sound" | it HAD one (`playKillConfirm`) — 0.16×vol vanished under music/crowd at real sliders (~0.2) | gain ~2× and the fizzy square body layer dropped — cleaner, audible, still short (`sfxSynth.js`) |

## Confirmed good in run 5

Spawn-lock (regression check passed), countdown, splash ("very close" → tuned last run),
Sundial hologram, non-host death shatter + sound, join flow "mostly good now / less
stuttery", glow otherwise ("otherwise gtg").
