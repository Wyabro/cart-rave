# Storerooms suction holes

Source: Wyatt playtest debrief 2026-07-15 — "it's too hard to get kills on storerooms because
of how big it is… maybe we should make the four holes more dangerous by sucking players in if
they get too close… and players get points if they hit them into the suction zone."

Status: **v1 IMPLEMENTED (2026-07-15), awaiting Wyatt feel sign-off.** Built with the proposal's
recommended defaults (below); every value is a named, tunable constant. **Needs a production
eyeball** — the frozen preview pane can't drive a full round, so feel is unverified. The 5 feel
questions are now **defaulted, not closed** — revisit after playtest.

## What shipped (v1)

- **Force** — `applySquareHoleSuction` / `computeSquareHoleSuction` in `src/simulation.js`
  replaces the outward lip rescue on any level registering a `suctionBand`. A cart in the band
  (Chebyshev `[half, half + suctionBand]` = `[4.25, 6.85]` m from a void center) is pulled toward
  it; pull = `depth × SUCTION_PEAK_ACCEL (30 m/s²)` + a shove-in capture assist
  (`SUCTION_CAPTURE_GAIN 2.4`). Depth-ramped → **outer half escapable at full throttle, deep
  capture / a shove commits.** Symmetric across humans and NPCs. Band width owned by the level
  (`HOLE_SUCTION_BAND = 2.6` in `backroomsSupermarket.js`).
- **NPC keep-out** — level `aiHazards.avoidMargin` 1.2→2.4, `influenceBand` 1.2→1.6 so bots steer
  clear of the band (reach 8.25 m > band edge 6.85 m) instead of self-feeding.
- **Kill credit** — host-only keepalive re-stamps the victim's `lastHitBy` while suction drags a
  just-rammed cart in (`SUCTION_CREDIT_KEEPALIVE_MS 2600`, throttled 500 ms), so a slow drag-to-
  fall still credits the shover. The existing `corner_void` 2× bonus still applies.
- **Telegraph (visual)** — pulsing additive magenta annulus on the floor per void
  (`buildSuctionHazardRings`), unlit so it reads on Low tier.
- **Tests** — `tests/squareHoleSuction.test.js` (6): null outside band / no band, inward
  direction, depth ramp, capture assist only on shove-in, outer-half escapability.

## Chosen defaults (revisit in playtest)

1. **Escapability:** outer half escapable at full throttle; deep band / shove commits. ✅ shipped.
2. **Points on capture or fall:** on **fall** (existing KO flow), credit guaranteed via the
   lastHitBy keepalive. ✅ shipped.
3. **Affects local player identically:** **yes** (symmetric physics). ✅ shipped.
4. **Band width / strength:** 2.6 m band, 30 m/s² peak pull at the lip, linear falloff. Tunable.
5. **Visual language:** pulsing magenta floor annulus. **Audio (wind-suck loop) DEFERRED** — needs
   client-side per-frame Howler wiring that can't be validated in the frozen preview; add after
   Wyatt confirms the feel.

## Open / deferred

- **Audio telegraph** — low wind-suck loop when the local cart enters a band (see Q5).
- **Particle drift** toward the void (nice-to-have; the ring + darken baking already read).
- Tune `SUCTION_PEAK_ACCEL` / `HOLE_SUCTION_BAND` after playtest if capture feels cheap or unfair.

## Original design notes

Related fixes landed in the earlier 2026-07-15 batch: exit-sign post collider removed, hole-lip
assist stands down for 1.2 s after a qualified ram, tangent-escape commit arms at sawing speeds
on the center furniture.

## Player-facing behavior (draft)

- Each of the four corner voids gets a **suction band** outside its lip (say 2.0–2.5 m wide).
- A cart inside the band is pulled toward the hole with strength ramping toward the lip.
  Driving straight out at full throttle escapes the outer band; deep in the band you need
  boost or a wall-off angle — getting shoved into it is usually lethal.
- **Kill credit:** whoever knocked the victim into the band gets the KO + points. The existing
  `corner_void` 2× kill-zone bonus (`koEvent.js:146`) still applies, so hole kills stay the
  premium play.
- Telegraph: the band must be readable — floor decal ring / pulsing darkness / particle drift
  toward the hole + a low wind-suck audio loop when the local cart enters it.

## Implementation reference (as built)

- Force in `applyArcadeControls` sub-helper `applySquareHoleSuction`, gated on
  `_levelHazards.suctionBand`; pure solve in `computeSquareHoleSuction` (exported, tested). The
  outward lip rescue (`applySquareHoleLipAssist`) is the else-branch — dead on Storerooms now,
  kept for any future square-void level that wants rescue over suction.
- Runs wherever physics is simulated (host: all carts; client: its predicted local cart) so
  prediction matches. No netcode/wire change. Credit keepalive is host-gated via `_stepIsHost`.
- NPC keep-out widened in the level's `aiHazards` so bots steer clear of the band.

## Alternatives if suction feels wrong in playtest

- Shrink Storerooms' drivable field (tighter walls) so traffic density rises.
- Raise NPC proximity-aggression range on Storerooms only.
- Widen the holes (bigger targets, no new mechanic).
