# AI Difficulty Proposal — Easy / Medium / Hard

**Status:** implemented as SHIP-1 **B1 AI-DIFF-1** (2026-07-22). Medium = current
baseline identity; Easy dials down; Hard dials up + Hard-only tactics. See
`src/aiDifficulty.js`.

## Goal

Introduce Medium and Hard as **decision-quality tiers**, not stat cheats. **Medium** is the
current shipped AI feel (post–cautious-fix baseline) and is the identity row. Easy dials
down for Solo-as-tutorial. All tiers share the same physics,
top speed, impulses, and scoring — a Hard bot wins by choosing better, not by moving faster.

## Where difficulty plugs in

The AI already has one choke point: every knob a difficulty tier needs is read either from
`PERSONALITY_PROFILES` (`src/npcNames.js`) or from `CONFIG.cart.hop.npc` /
`CONFIG.cart.ramBoost.npc` at decision time in `simulation.js` (`getAiAxis` and the
opportunistic boost/hop triggers in `main.js`/`gameFlow.js`).

Proposed shape: one frozen `DIFFICULTY_MODS` table (new module, e.g. `src/aiDifficulty.js`)
of **multipliers and offsets applied at read time** over the personality values. Easy is the
identity row (all 1.0 / +0), which structurally guarantees "preserve Easy behavior."
Personalities stay intact — an Aggressor is still an Aggressor on every tier; difficulty
scales how *sharply* each personality executes its identity.

Difficulty is a room-level setting (host-owned, ride `host_round` like `levelId` does).
UI entry point: solo mode select first; multiplayer default stays Easy until we decide.

## The tiers

### Easy — "Distracted shoppers" (current behavior, unchanged)

Bots wander and patrol a lot, commit to rams half-heartedly, occasionally stop for no
reason (4%/2% random-stop rolls), use hops/boosts opportunistically and rarely, and only
contest the podium when a human camps it. They are threats mostly when you make a mistake.

### Medium — "Regulars" (competent, honest)

Feels like: bots that clearly *want* to win but still leave you openings.

- **Decision making:** decision interval ×0.75 (reacts ~25% sooner); random-stop chance
  halved; target re-pick on stale chases sooner (`aiLastProgressMs` window ×0.8).
- **Aggression:** `humanWeight` +0.1 (clamped ≤ 0.95); `npcRamCommitChance` ×1.3;
  boost commit alignment window unchanged (they boost more often, not more precisely).
- **Recovery:** stuck detection window 1100 ms → 850 ms; edge-save hop chance
  (`hop.npc.edgeSaveChance`) ×1.5; rim-avoidance push starts slightly earlier (band +15%).
- **Tactics:** podium contest triggers at the current threshold but they *stay* on the
  podium ~30% longer; edge-camper follow clamp (`reachOuter`) +0.02.

### Hard — "League night" (sharp, still fair)

Feels like: every mistake is punished, edges are their weapon, but they physically drive
the same cart you do.

- **Decision making:** decision interval ×0.55; random stops removed entirely; steer gain
  range shifted to each personality's top half (e.g. Aggressor 1.3–1.8 → 1.55–1.8).
- **Aggression:** `humanWeight` +0.2 (clamped ≤ 0.97); `npcRamCommitChance` ×1.6; boost
  aim alignment tightened (the `alignmentDotMin` gate for committing a boost −10°
  equivalent — they hold boosts until the line is real); they preferentially attack
  targets that are already near an edge or mid-recovery (victim-selection weight on
  distance-to-hazard — new term, Hard-only).
- **Recovery:** stuck window 650 ms; edge-save hop chance ×2.2 with the threat-alignment
  gate loosened (`alignmentDotMin` 0.35 → 0.25); after a failed ram they disengage and
  re-angle instead of grinding (reuse the tangent/inward escape logic with a short timer).
- **Tactics:** actively contest the podium whenever it scores (not only when camped);
  defensive hop when a boosting cart closes head-on (reuse `hop.npc` threat check with
  `minThreatSpeed` lowered for boosters only); on Sudden Death, fight along the rim less —
  bias target headings inward (they don't self-KO to aggression).

## Interaction with existing systems

- **Solo rubberband** (`utils/soloRubberband.js`) stays as-is and stacks: it eases bots off
  when the human is losing. On Hard we may want `trailChaseMul` slightly less forgiving —
  taste call at playtest, exposed as one number in the same mods table.
- **Personalities:** unchanged files/weights; mods multiply at read time.
- **Multiplayer:** host simulates all NPCs, so the mods table needs no netcode beyond the
  one difficulty id on `host_round` (same latch pattern as `levelId`).

## Explicitly out of scope (anti-cheat guarantees)

- No changes to `maxSpeed`, impulse magnitudes, boost duration/cooldown floors below human
  values, respawn timing, or scoring.
- No omniscient inputs: bots keep using the same positional info they already read today
  (positions/velocities). "Prediction" on Hard is limited to leading a target by its
  current velocity — which the aim code already effectively does.
- No difficulty-scaled physics (friction/damping identical across tiers).

## Open questions for Wyatt

1. Where does difficulty live in the UI — solo mode select only, or also Friends lobbies
   (host picks)? Quickplay probably stays fixed (Easy or Medium?) for matchmaking sanity.
2. Default for solo: Easy or Medium?
3. Should Hard be an unlock (e.g. win N solo matches) or available day one?
4. Persist per-mode (`cartRaveAiDifficulty` localStorage) or per-session?

## Implementation estimate

Small: one mods table + ~10 read-site touches in `simulation.js`/`main.js`, a settings
store field, one menu control, one `host_round` field. Unit-testable the same way the Pass
4 AI fixes were (pure decision helpers).
