# Gameplay Production Value Pass — July 9, 2026

**Goal:** make the existing game more memorable — feel, arena personality, pacing, system
synergy — with no new systems and no engine/networking/physics rewrites. Follow-up to the
July 7–8 pass ([production-value-pass-2026-07.md](../archive/audits/production-value-pass-2026-07.md)).

**Status:** all four waves implemented and verified (115/115 Vitest, `tsc --noEmit` clean,
knip back to its 5 pre-existing findings, solo runtime smoke clean). Uncommitted on
`cart-clash` as of this writing.

## Shipped

### Wave 1 — fixes + free wins
- **Victim-side hit feedback** (fixes mis-wired P0 #6): being rammed now shakes/pulses on
  host (`simulation.js` victim branch) AND non-host (`netcode.js` `slotB === localSlot`
  branch in `replayHostCollisionFx`); nulled in the reconciliation `replayCallbacks`.
- **Water-death audio**: procedural splash + underwater boom (`sfxSynth.js`
  `playWaterSplash`/`playWaterDeathBoom`, called from `waterDeathFx.js`). New `spawnNoise`
  helper (filtered-noise idiom) added to sfxSynth.
- **GO! kick**: FOV punch + rising whoosh via new `onGoMoment` HUD option.
- **Haptics**: new `src/haptics.js` (`hapticPulse` — gamepad dual-rumble + `navigator.vibrate`);
  wired to kill confirm, ram shake, hit taken, boost release.
- **Arena name splash** during countdown (`.hud-arena-splash`, names match menu cards).
- **Podium confetti** now also bursts at winner-cam orbit start (HUD-root canvas).
- **Intensity ramp**: 60s/30s announcer beats (`one_minute`/`thirty_seconds` events +
  `timeCheck` sting) + amber `hud-timer-warn` tier for the last 30s.

### Wave 2 — core feel + remote parity
- **Remote boost/hop FX**: encoder derives `isHopping` from `lastHopAtMs` freshness
  (the wire `h` flag finally has a producer); non-host rising-edge boost FX via new
  `onRemoteBoostStart` callback; host-side NPC/remote boosts + hops now audible
  (attenuated — `playSfx` gained a per-play `volume` option).
- **Squash & stretch**: `animateCartImpactSquash` (shares the boost-pulse tween slot);
  fired for rammer+victim on collisions and floor/edge impacts, host + replay paths.
- **Music ducking**: `AudioManager.duckMusic(depth, holdMs)` (Howl fades — music is
  html5-streamed, outside the WebAudio graph); auto-ducks under critical/high/sequence
  announcer events (`onAnnouncementPlays` hook) and kill confirms.
- **Score-breakdown float**: `+8 · HOLE SHOT · CRIT · LEADER DOWN · 2.0×` rises on local
  KO (`hud.showScoreFloat`); reward context rides the falls[] JSON tail so non-hosts match.
- **Leader crown + rampage pips** on the in-match scoreboard (pips fed from KO events,
  5s decay; local pip reads gameStore directly).
- **Announcer coverage**: `critical_ko`, `leader_down`, `challenge_complete` events +
  lines + stings; `wasCritical`/`victimWasLeader` forwarded through the KO reactor.

### Wave 3 — design-risky presentation + UX completions
- **KO hit-stop (~80ms)**: presentation-only — mesh pose writes + follow camera hold while
  physics/prediction/reconciliation run untouched; 120ms exponential blend back; shatter
  keeps animating during the freeze; `prefers-reduced-motion` respected.
- **Arena KO flash re-enabled** at reduced strength (0.6/0.35); the persistent leader tint
  stays off (the original "too aggressive" complaint). **Sudden Death world reaction**:
  ambient fixture cycle hue-shifts red↔magenta (no brightening) via
  `setArenaSuddenDeathMode`, driven from broadcast SD state.
- **Crowd cheers** (procedural noise swell) on KOs + victory — Classic Record only
  (crowd exists there; Storerooms stays liminal-silent).
- **True near-miss detection**: per-frame proximity scan (`announcerDirectorNearMissScan`)
  replaces the old landed-hit arming; a boosting opponent passing within 2.6m at speed
  without contact fires `close_call`.
- **Match point**: `MATCH POINT` status when ≤15s remain and top two are within 1 point;
  `isFinalBlow` now written for Sudden-Death-ending KOs and carried on the wire.
- **Friends-mode rematch auto-countdown** (10s, host label ticks "PLAY AGAIN (7)").
- **Challenge progress block on the results screen**; **mid-match unlock toasts** in the
  HUD (`◆ UNLOCKED` kicker) with humanized copy ("Gold Mirror shades unlocked!").

### Wave 4 — arena kill-zone scoring (user-approved values)
- **Storerooms corner voids: base 2** (mirrors the Classic center-hole template) via
  `Simulation.classifyLevelKillZone` → `buildKOEvent` `classifyKillZone` dep;
  perimeter stays 1.
- **Sundial high ground: +1** when the crediting ram was delivered from the podium
  (`fromPodium` captured at contact in the lastHitBy record). Classic center hole
  unchanged at 2. All bonuses appear in the score float ("VOID DROP", "HIGH GROUND").
- Unit tests cover classification, stacking, and wire round-trip (scoringEvent.test.js).

## Needs eyes-on / two-browser verification
- **Two-browser session** (not testable in the throttled preview): victim shake as
  non-host, remote boost/hop FX (incl. under packet loss for double-fires), score float
  on a non-host kill, hit-stop on non-host without prediction rubber-banding.
- **Taste checks**: arena KO flash strength (0.6), SD red ambient, hit-stop length (80ms),
  crowd cheer timbre, duck depths — all tunable one-liners.
- **Haptics** on real gamepad/phone hardware.

## Deliberately cut / deferred
- NPC personality intro toasts (low impact), edge-danger vignette (contends with the
  impact-pulse uniform + open black-frame bug — revisit post-fix as a non-post-FX cue),
  kill-cam replay, spectate-killer, per-arena music beds, superlatives (needs per-match
  stat accumulation).

## Constraint compliance
No composer/post-FX pass changes (existing uFlash/vignette/aberration uniforms reused);
no physics-dt manipulation (hit-stop is render-side only); dark+neon identity preserved
(hue shifts and short flashes only, leader tint kept off); no new wire format fields
(hop flag already existed; fall context rides the JSON tail).
