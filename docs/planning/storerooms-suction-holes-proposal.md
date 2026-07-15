# Proposal — Storerooms suction holes

Source: Wyatt playtest debrief 2026-07-15 — "it's too hard to get kills on storerooms because
of how big it is… maybe we should make the four holes more dangerous by sucking players in if
they get too close… and players get points if they hit them into the suction zone."

Status: **PROPOSAL — not implemented.** Per AGENTS.md, a new gameplay system needs the
"what should the player see / feel / do" answers locked with Wyatt first (questions below).
Related fixes already landed in the 2026-07-15 batch: exit-sign post collider removed, hole-lip
assist now stands down for 1.2 s after a qualified ram (shoves into holes are no longer fought),
and the tangent-escape commit arms at sawing speeds on the center furniture.

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

## Mechanics sketch

- Force application: per-cart per-step radial impulse toward the nearest hole center inside the
  band — structurally the inverse of `applySquareHoleLipAssist` (`simulation.js:688`), living
  beside it in `applyArcadeControls` (or in `runFixedPhysicsStep` before `world.step` so
  uncontrolled/knocked-back carts are covered without input coupling).
- The current lip assist (outward rescue for NPCs) is **replaced** on Storerooms — suction and
  rescue can't coexist. NPC AI keep-out margins for the holes widen to match the band so bots
  don't feed themselves in (they must respect `band + margin`, not just the lip).
- Kill credit: capture works today if the fall completes within `hitWindowMs` (3000 ms). To
  guarantee credit for slow captures, refresh the victim's `lastHitBy` timestamp when the
  suction takes over (mirror `GameState.recordHit` at `simulation.js:956`), or extend the
  window for band-captured falls.
- Suction is host-side physics only — no netcode change; clients see it through snapshots.

## Feel questions for Wyatt (answer before build)

1. **Escapability:** should full throttle straight out always escape the outer half of the
   band (suction = threat), or should deep-band capture be inescapable (suction = execution)?
2. **Points on capture or on fall?** Award when the victim crosses into the band (attacker
   sees instant feedback, but victim might still escape) or only when they actually fall
   (current KO flow, zero new scoring paths)? Recommend: on fall, credit guaranteed via the
   lastHitBy refresh.
3. **Does suction affect the local player identically?** (Recommend yes — asymmetric physics
   reads as cheating.)
4. **Band width / strength starting values** — propose 2.2 m band, peak pull ≈ 60% of cart
   max accel at the lip, linear falloff; tune live.
5. **Visual language** — decal ring vs particle drift vs both? Needs to read on Low tier too.

## Alternatives if suction feels wrong in playtest

- Shrink Storerooms' drivable field (tighter walls) so traffic density rises.
- Raise NPC proximity-aggression range on Storerooms only.
- Widen the holes (bigger targets, no new mechanic).
