# PERF-WATCH-1 — auto-quality step-up path

> **Card:** [BACKLOG](./BACKLOG.md) · Medium pri · lane **Critical**.
> Deferred until **PERF-CLASSIC-IGPU-1** closes (same Intel UHD box, cap-371 `rsm 0.7`).
> WARM-IGPU-1 P0b telemetry is shipped. No external weak-GPU sample exists yet.
> Adversarial review 08-18 rejected the first draft. This file is the revised design.

## Problem

The session auto-quality watchdog ([`src/utils/autoQuality.js`](../../src/utils/autoQuality.js))
only steps quality **down** and does so irreversibly for the session. Every comment in the tree
is explicit: *"irreversible per session (there is no step-up path)"* (autoQuality.js,
gameplayAnalytics.js, external-code-review). One sustained 1s window above `BAD_FRAME_MS` (20.5ms)
for `BAD_WINDOWS_NEEDED` (2) windows demotes a tier (high→high-lite→medium→low, `MAX_STEPS`=3), then
steps render scale (1→0.85→0.7) below the LOW floor — and never returns.

Consequence on real hardware: a single shader-compile stall or a genuinely recovering machine
spends the **whole session** on a lower tier even when pacing returns to a 60 fps lock.

The asymmetry was deliberate. A wrong demotion only costs quality. A wrong step-up re-hurts the
player and can oscillate. PERF-TIER-1 already measured the hard case: Low → Medium is **3.5× cost**
on the Intel UHD box. That jump is not a continuous dead-band problem.

## Evidence grounding (what exists)

- **Watchdog** (`src/utils/autoQuality.js`): 1s windows, p95 of `samples` (min 20, max age 4s,
  cap 90) vs `BAD_FRAME_MS`=20.5; 2 consecutive bad windows → step. `COOLDOWN_MS`=4000 settle after
  every step. Gated on `?preset` (QA pin), mode-entry overlay, post-entry grace
  (`ENTRY_QUALITY_GRACE_MS`=2000), cooldown. Step log `getAutoQualityStepLog()` (≤16,
  `{from,to,source,p95,tMs}`); diag event `qualityStepDown`; DEV `console.warn`. Returns `true` →
  caller re-applies live.
- **Sample is rAF interval, not GPU busy time.** `gameLoop.js` sets `dt = (now - lastT) / 1000`.
  A healthy 60 Hz lock is **p95 ≈ 16.7ms**. Attract uses frame *cost*; game uses frame *interval*.
  A bar below 16.7ms never fires on 60 Hz.
- **Floor gate (blocker).** Lines 169–171 return before any sample when
  `atFloor && !canStepDownSessionRenderScale()`, or when `!atFloor && stepsApplied >= MAX_STEPS`.
  Fully demoted (low + rsm 0.7) is the recovery case. Tick exits first. `stepsApplied` only
  increments on tier-down (line 219). It never decrements.
- **Tier mechanics** (`src/utils/qualityMode.js`): `QUALITY_TIER_ORDER=["low","medium","high-lite","high"]`;
  `getQualityTier()` = menuPreviewLOD → sessionTierOverride → stored preference;
  `stepDownQualityTier(tier)` (no `stepUp` sibling); `setQualityTier(tier)` (user) clears the
  override.
- **Render scale** (`src/utils/qualityTiers.js`): `RENDER_SCALE_MUL_STEPS=[1,0.85,0.7]`,
  `sessionRenderScaleMul` starts 1; only `stepDownSessionRenderScale` / `canStepDown…` exist.
- **Apply path is not direction-agnostic.** Step-down is a live knob-off with no overlay.
  User-driven step-up (`handleQualityTierChange`) holds a loading overlay across 2 painted
  frames because `rebuildForQualityChange()` flips `composerBypass` and recompiles every
  program (`levelOrchestration.js` 182–199). Auto step-up Low → Medium is that same path flip
  mid-round with no overlay. Host hitch rubber-bands every peer (WARM-IGPU-1 class).
- **Software-GL floor** (`src/scene.js` 951–954): session forced `low`. Stored pref can still
  be `high`. A stored-pref ceiling would step off that floor.
- **P0b telemetry** (`src/analytics/gameplayAnalytics.js`): `session_end` reports `tier` (final),
  `steps` (**demotion count**), `firstStepSource`, `firstStepAtMs`, `firstStepP95`. Do not
  change the meaning of `steps`.
- **Tests** (`tests/misc/autoQuality.test.js`): 13 watchdog cases; `resetAutoQualityForTests`,
  `resetSessionRenderScaleForTests` exist.

## Decision

**Split the card. Wave 1 ships scale-up only. Wave 2 is tier-up + ratchet, and it does not
auto-cross the composer-bypass boundary mid-round.**

Lane: **Critical** (host hitch, `CONFIG.physics.maxSubsteps` mid-round on a later wave,
analytics shape, known 3.5× risk). Wyatt ack required before each wave. Uncertainty selected
the higher lane.

P0b still has no weak-GPU sample. Starting wave 1 without that sample is a Wyatt call.
Wave 1 is the cheap continuous lever. It does not re-open the 3.5× jump.

### Wave 1 — scale-up only

Restore `sessionRenderScaleMul` 0.7 → 0.85 → 1. Do not change the session tier.
Stop when scale `== 1`, even if the session tier is below the stored preference.

### Wave 2 — tier-up + ratchet (after wave 1 playtest)

Step one tier toward the stored-preference ceiling. Only after scale is back at 1.
Do **not** auto-step Low → Medium mid-round (that flip turns composer on).
Options for the Low → Medium boundary, pick one at wave-2 plan time:

1. Refuse the cross. Scale recovery is the whole auto path. User raises tier in the menu.
2. Reuse the user-quality warm path (overlay or `compileAsync` + painted-frame grace) and
   extend cooldown past compile.

Default if Wyatt does not pick: **refuse the cross**.

### Step-up trigger (interval bar — 60 Hz correct)

Game `dt` is rAF interval. A 60 Hz lock is 16.7ms. Do not use 12ms.

| | Step **down** (existing) | Step **up** (new) |
|---|---|---|
| Bar | p95 `> BAD_FRAME_MS` (20.5ms) | p95 `≤ GOOD_FRAME_MS` (**17ms** — holding 60) |
| Windows | `BAD_WINDOWS_NEEDED` = 2 consecutive | `GOOD_WINDOWS_NEEDED` = **8 consecutive** (≈8s) |
| Guard | window ≤ 20.5ms decays `badWindows` | window `> GOOD_FRAME_MS` **zeroes** `goodWindows` |

Dead-band is 17–20.5ms (~3.5ms). A 55 fps machine (p95 ≈ 18ms) never steps up and still
decays toward demotion. Step-up needs 4× the evidence of step-down.

A later render-cost feed can replace 17ms if playtest shows 17ms is too loose (steps up a
machine with no GPU slack). Do not mix cost and interval in one bar.

Constants are module-scope, exported for tests.

### Session ratchet (wave 2; also on wave 1 scale-up)

If a `qualityStepUp` is followed by a `qualityStepDown` within **30s**, lock the
pre-step-up level as the session ceiling. No further step-up this session.
Write `ratchetLocked: true` on that down entry in the step log. Emit diag
`qualityStepRatchet` `{from, to, dtMs}`.

Self-heal without a ratchet is a ~15s loop on the 3.5× box, not 2–6s of jitter.

### Ceiling and floors

- **Ceiling = stored preference, never above it.** New `getStoredQualityTier()` on
  `qualityMode.js` (validated against `QUALITY_TIER_ORDER`). Ignore `menuPreviewVisualLod`.
- **Software-GL: no step-up.** If `isSoftwareRendererActive()`, tick never steps up.
  Session stays at the software floor.
- Wave 1 does not walk tiers, so the stored-pref ceiling only matters as "do not raise
  scale past 1" (already true).

### Guard: game frames only for step-up

Step-up only fires on `source === "game"`. Never `"attract"`. Menu pacing is not in-game
headroom. Demotion still accepts both sources.

### Shared mechanics

- Per-step `COOLDOWN_MS`=4000, sample-ring clear after each step, `?preset` / overlay /
  grace — reused for step-up.
- **Sample when a down or an up is possible.** Delete the early return that exits at the
  scale floor before any window. `stepsApplied` decrements on a future tier-up (wave 2), or
  is replaced by distance-from-ceiling. Wave 1 does not touch `stepsApplied`.
- `clearSampleRing` and `noteModeEntryShown` clear `goodWindows`.
- `resetAutoQualityForTests` clears `goodWindows` and the ratchet lock.
- Step-up returns `true`. Caller re-applies via `rebuildForQualityChange()`.
- Wave 1 apply path is a pixel-ratio / FBO resize. No composer-bypass flip. No overlay.

## Change list

### Wave 1

- **`src/utils/qualityTiers.js`** — `canStepUpSessionRenderScale()` +
  `stepUpSessionRenderScale()`.
- **`src/utils/autoQuality.js`** — `GOOD_FRAME_MS=17`, `GOOD_WINDOWS_NEEDED=8`,
  `goodWindows`, scale-only step-up, `source === "game"` gate, software-GL gate,
  floor early-return fixed so sampling still runs when scale is at 0.7,
  `qualityStepUp` diag `{from,to,step,source,p95,renderScale,dir:"up"}`,
  step-log `dir: "down"|"up"` (additive), 30s scale ratchet + `qualityStepRatchet`,
  `clearSampleRing` / `noteModeEntryShown` / `resetAutoQualityForTests` clear
  `goodWindows` + ratchet state.
- **`src/analytics/gameplayAnalytics.js`** — add `stepUps` (count of `dir:"up"`).
  **`steps` stays the down-count** (`dir:"down"` or missing `dir`). `firstStep*`
  unchanged.
- **`src/frameVisuals.js`**, **`src/main.js`**, **`src/orchestration/gameBoot.js`**,
  **`src/orchestration/loopDeps.js`** — keep `onAutoQualityStepDown` /
  `handleAutoQualityStepDown`. The handler already re-applies. Do not rename in wave 1.
- **`tests/misc/autoQuality.test.js`** — see [Verification](#verification).
- Comments in `autoQuality.js` and `gameplayAnalytics.js` that say "irreversible /
  no step-up path" update in the same commit.

### Wave 2 (not in the wave-1 commit)

- **`src/utils/qualityMode.js`** — `stepUpQualityTier(tier)` + `getStoredQualityTier()`.
- **`src/utils/autoQuality.js`** — tier LIFO after scale is 1; decrement `stepsApplied`
  on tier-up (or drop `stepsApplied` for distance-from-ceiling); refuse Low → Medium
  mid-round unless Wyatt picked the warm-path option.
- Tests for ceiling, ratchet-after-tier-up, and the composer-bypass refuse.

## Verification

Lane: **Critical**. Wyatt ack before each wave. Focused tests while working. One
`npm run qa` at the wave boundary. Risk-specific proof: Intel UHD host playtest —
no oscillation, no mid-round hitch that rubber-bands peers.

### Wave 1 tests (extend `tests/misc/autoQuality.test.js` + scale unit cases)

1. Dead-band: sustained p95 = 18ms after a scale demotion never steps up.
   18ms > 17ms, so `goodWindows` **zeroes**. `badWindows` still decays.
2. Scale LIFO: after `[tier×N, scale×2]` demotions, 8 good windows restore
   0.7 → 0.85 → 1. Session tier does not move.
3. Floor still samples: at low + rsm 0.7, 8 good game windows return `true` and
   step scale to 0.85. Tick does not no-op at the floor.
4. Ratchet: step-up then a down inside 30s locks the pre-up scale. Further good
   windows do not step up. Step log has `ratchetLocked: true`. Diag
   `qualityStepRatchet` fires.
5. Guards: no step-up during overlay / grace / cooldown / `?preset`; no step-up
   on `source === "attract"`; no step-up when software-GL is active.
6. `goodWindows` clears on `noteModeEntryShown` and on `clearSampleRing`.
7. Analytics: `steps` equals down-count after a down+up pair. `stepUps` equals 1.
8. Returns `true` and emits `qualityStepUp`.

### Wave 2 tests (later)

Ceiling = stored pref. No step above stored `low` / `medium`. `stepsApplied`
does not brick later downs after a full recover. Low → Medium does not fire
mid-round (or uses the warm path if Wyatt picked that).

Run `npm run qa` (report by number), `npm run build`, pull `cart-clash`,
`npm run verify:head`. Seed a BACKLOG `## Playtest owed` row per wave.

## Risks

- **17ms too loose.** A 60 Hz lock with no GPU slack still reads p95 ≈ 16.7 and
  will try to raise scale. Scale steps are ~30% fragment cost, reversible, and
  ratchet-locked if they fail. Accept for wave 1. Revisit with a render-cost feed
  if playtest shows bounce.
- **3.5× Low → Medium.** Out of wave 1. Wave 2 refuses the cross by default.
- **Menu-preview LOD.** Closed by `source === "game"` and by not reading LOD as
  the ceiling.
- **Software-GL.** Closed by the no-step-up gate.
- **Analytics.** `steps` meaning is unchanged. `stepUps` is additive.

## Done when

### Wave 1

- Scale-up path implemented and unit-tested as above.
- `npm run qa` green by number. Build green. Pushed. `verify:head` matches.
- `qualityStepUp` appears in `?diag` captures. `session_end.steps` is still
  downs. `stepUps` is present.
- Wyatt prod playtest PASS on the Intel UHD box: a session that demoted to
  rsm 0.7 and then holds 60 fps returns toward rsm 1. No visible oscillation.
  Host hitch does not rubber-band peers.
- BACKLOG playtest row closed. Wave 2 stays open until Wyatt pulls it.

### Wave 2

- Separate ack. Separate commit. Composer-bypass decision recorded.
- Ratchet + ceiling tests green. Same Critical proof on the Intel UHD box.
- BACKLOG / ARCHITECTURE.json PERF-WATCH-1 row → CLOSED with this decision.
