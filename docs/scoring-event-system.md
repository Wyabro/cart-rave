# Scoring & Event System — design

> **Status:** design proposal (2026-07-08). Supersedes the jam-era audit
> [`audits/step-10a-scoring-audit.md`](audits/step-10a-scoring-audit.md), which reviewed
> a much smaller game. This document describes the *target* shape, notes where today's
> code already gets there, and lays out an incremental migration. Sibling system docs:
> [`announcer.md`](announcer.md), [`Game_Architecture.md`](Game_Architecture.md).

## Why this rewrite

The original Step 10a audit treated scoring as a closed loop: a cart falls, a number goes
up. That was accurate for the jam build. Since then the game grew a set of systems that all
need to know *what just happened*, not just *who got points*:

- **The Store PA announcer** turns falls into moments (FIRST SPILL, REVENGE, EVERYBODY DOWN).
- **Challenges** track shaped outcomes — center-hole KOs, NPC kills, Aggressor kills, Sudden
  Death wins, last-cart-standing, untouchable rounds.
- **Combos** multiply score by an attacker's kill streak (RAMPAGE/SAVAGE/CARNAGE).
- **Sudden Death** resolves ties with its own KO semantics.
- **Production value** — cart shatter, screen shake, particles, kill-confirm UI, camera —
  wants *intensity* cues (was it critical? a leader KO? a triple?).
- **The kill feed** needs attacker/victim/verb/combo context.
- **Future stats & progression** want richer per-KO data than `+2`.

Today each of these is fed from **three separate ad-hoc payloads** plus **inline calls**, all
assembled at the fall site in [`gameFlow.js`](../src/gameFlow.js) (see
[Current state](#current-state-what-the-code-does-today)). Every subsystem re-derives its own
interpretation of the same fall. That's the staleness the audit doesn't capture — not wrong
math, but a missing **shared representation**.

**The reframe:** points are one *output* of a richer gameplay event. Model the event once;
let every subsystem react to it.

## Core idea: one KO Event, many reactors

Instead of the fall site computing a score and separately poking the announcer, the kill feed,
the challenge tracker, and the VFX layer, it emits a single canonical **KO Event**:

```
KOEvent
────────
victimSlotIndex:   3            attackerSlotIndex: 1 (null = self/environmental)
cause:             center_hole  ("center_hole" | "outer_edge" | "self" | "sudden_death")
impactSpeed:       28.6         (m/s at the crediting ram; 0 for self-falls)
wasCritical:       true         victimWasLeader:   false
isFinalBlow:       true         (ended round / Sudden Death)
comboTier:         2            comboMultiplier:   2.0
isSuddenDeath:     false        roundTimeMs:       41200
reward: { base: 2, critical: 1, leader: 0, multiplier: 2.0, total: 6 }
```

From that one event:

| Reactor | Reads | Effect |
|---|---|---|
| **Score** | `attackerSlotIndex`, `reward.total`, `isFinalBlow` | applies points, updates tiebreak timestamp |
| **Kill feed** | attacker/victim, `verb`, `comboTier`, `comboMultiplier` | renders the feed row |
| **Announcer** | victim/attacker, `comboTier`, `cause` | first_spill, refund, rampage, cleanup_aisle… |
| **Challenges** | `cause`, victim kind, `isSuddenDeath`, combo | `ko_void`, `ko_npc`, `ko_aggressor`, `sd_win`… |
| **Production/VFX** | `impactSpeed`, `wasCritical`, `victimWasLeader`, `cause` | shatter scale, shake intensity, particle count |
| **Stats/progression** | the whole event | aggregate per-match / lifetime counters |
| **Analytics/replay** | the whole event | structured log, future kill-cam context |

Each reactor is a **pure consumer**: it reads fields and does its thing. It never re-inspects
physics or scores to guess what happened. This is exactly the pattern the announcer already
uses — [`announcerDirector.js`](../src/announcer/announcerDirector.js) is a read-only observer
fed one `fall` object. **We generalize that pattern to every subsystem.**

### Why this simplifies things

- **One place decides "what happened."** The center-hole test, the critical test, the leader
  test, the combo math — all live in one function and land in the event. No subsystem re-runs
  them. Today the leader test runs in scoring, the combo tier is re-read in three places, and
  the challenge tracker re-checks victim kind inline.
- **Adding a reactor is additive.** A kill-cam, a "most brutal KO of the match" stat, a
  damage-number popup — each is a new function reading existing fields. Zero changes to the
  fall detector.
- **The network story gets simpler, not harder.** The host already ships a fall blob to
  clients so they can replay presentation (see below). The KO Event *is* that blob, promoted
  to a first-class type with a documented schema.

## Dataflow

The event is **host-authoritative** and **replayed on clients** — the same split the game
already uses. Nothing here changes the netcode model; it names it.

```
HOST                                              EVERY CLIENT (incl. host)
────                                              ─────────────────────────
cart.y < fallThreshold
   │
   ▼
buildKOEvent()  ← calculateFallScore + impact,     ┌───────────────────────────────┐
   │              cause, leader, combo             │  dispatchKOEvent(event)        │
   ├─► applyScore(event)  (host mutates scores)    │    ├─► announcer director      │
   │                                               │    ├─► challenge tracker       │
   ├─► serialize authoritative subset ─────────────┼──► ├─► kill feed               │
   │     into host snapshot falls[] (JSON tail)    │    ├─► production / VFX        │
   │                                               │    ├─► stats                   │
   └─► dispatchKOEvent(event)  (host runs it too) ─┘    └─► analytics / replay      │
                                                    └───────────────────────────────┘
   non-host: netcode.js decodes falls[] ─► rebuildKOEvent() ─► dispatchKOEvent()
```

- **Host** computes the full event, applies score to authoritative state, serializes the
  **authoritative subset** (see schema) into the snapshot `falls[]` tail, and dispatches
  locally so the host sees the same presentation.
- **Clients** decode `falls[]`, rebuild the KO Event (recomputing *derived* fields like names
  and colors from local slot state), and dispatch. Scores themselves still arrive via the
  existing host round message — clients don't re-apply `reward.total`; the event drives
  *presentation and reactors*, the round sync drives *authoritative scores*.

`falls[]` is a **JSON tail** today ([`binary.js`](../src/netcode/binary.js) L73, L155), so
widening the wire subset costs nothing but bytes — no binary layout work.

## KO Event schema

`A` = authoritative (host computes, must serialize on the wire). `D` = derived locally on each
client from slot state (names, colors) — **never trust these from the wire**, they're
per-viewer.

| Field | Type | A/D | Source today | Notes |
|---|---|---|---|---|
| `victimSlotIndex` | int | A | `slotIndex` | who fell |
| `attackerSlotIndex` | int \| null | A | `hit.attackerSlotIndex` | null ⇒ self/environmental |
| `cause` | enum | A | `isCenterHole` + attribution | `center_hole` \| `outer_edge` \| `self` \| `sudden_death` |
| `wasCritical` | bool | A | derived from `impactSpeed` | `impactSpeed >= criticalVelocityThreshold` — **velocity-based (decided)** |
| `victimWasLeader` | bool | A | leader scan in `calculateFallScore` | drives the leader bonus + VFX |
| `impactSpeed` | float | A | crediting ram's planar speed | m/s, captured on the `lastHitBy` record — **decided** |
| `comboTier` | int (0–3) | A | `attackerCart.comboTier` | attacker's streak tier at kill |
| `comboMultiplier` | float | A | `getComboMultiplier(tier)` | 1.0 / 1.5 / 2.0 / 3.0 |
| `isSuddenDeath` | bool | A | `roundState.isSuddenDeath` | |
| `isFinalBlow` | bool | A | Sudden Death win / last-standing | ended the round |
| `roundTimeMs` | int | A | `nowMs - startedAtMs` | seconds into the round |
| `reward` | object | A | assembled in `calculateFallScore` | `{ base, critical, leader, multiplier, total }` |
| `verb` | string | A | `pickKillFeedVerb` / self verb | kill-feed verb; host picks so all clients agree |
| `attackerName` / `victimName` | string | D | `netSlots[i].name` | resolved per client |
| `attackerColor` / `victimColor` | css hex | D | `colorHexForSlot` | resolved per client |

**Reward breakdown** replaces the current single `points`. It makes the score *legible* (the
kill feed / a future damage popup can show "+2 center ×2 combo = 6") and lets stats attribute
*why* points were earned, not just how many. `reward.total` is what `applyScore` adds.

## Reactor catalog

Each reactor is a function `(event: KOEvent) => void`, registered once. Order is deterministic
(score first so downstream reactors can read fresh totals if needed).

1. **Score** *(host authoritative; the only reactor that mutates game state)* — `applyScore`
   adds `reward.total` to `attackerSlotIndex`, stamps `lastScoringHitAt` for the tiebreaker
   ([`gameState.js`](../src/gameState.js) `pickTimerWinner`), and resolves Sudden Death / last
   blow. On clients this is a **no-op** (scores come from round sync).
2. **Kill feed** — one `addKillFeedEntry` call from event fields. Removes the current
   duplicated construction in both `gameFlow.js` and `netcode.js`.
3. **Announcer** — `announcerDirectorOnFall(event)`. Already a pure observer; just feed it the
   event instead of a bespoke 3-field object.
4. **Challenges** — a new `challengeReactor(event)` that owns *all* challenge mapping:
   `cause === "center_hole"` ⇒ a center-hole challenge, victim kind ⇒ `ko_npc` /
   `ko_aggressor`, `cause === "self"` is ignored, etc. **This pulls the inline
   `ChallengeTracker.record(...)` calls out of the fall loop** (`gameFlow.js` L341–349) into
   one place that reads the event — the single biggest simplification win.
5. **Production/VFX** — reads `impactSpeed` / `wasCritical` / `victimWasLeader` / `cause` to
   scale shatter, shake, particles, and kill-confirm feedback by *intensity* instead of every
   effect re-deriving "was this a big one."
6. **Stats** *(future)* — accumulates per-match and lifetime counters from the event stream.
7. **Analytics/replay** *(future)* — appends the structured event to a round log; a kill-cam
   reads back the same records.

Guardrail: only **Score** touches game state, and only on the host. Every other reactor is
presentation/bookkeeping and safe to run identically on all clients.

## Current state: what the code does today

Grounding, so the migration is honest about the starting point. At the fall site in
[`gameFlow.js`](../src/gameFlow.js) `updateGameFlow`:

- `calculateFallScore()` (L60) already computes most of the event: center-hole, critical,
  leader bonus, combo tier/multiplier, final `points`, `verb`. It returns a `scoreData`
  object — **this is 80% of the KO Event already**, just not named or shared.
- Points apply via `addScore` (L334); tiebreak timestamp via `gameStore`.
- The kill feed is built **inline** twice — once here (L352–359, plus the Sudden Death
  branches L395–418) and once in [`netcode.js`](../src/netcode.js) (L819–833).
- Challenges are recorded **inline** in the fall loop (L341–349): `ko_void`, `ko_npc`,
  `ko_aggressor`, gated on the local player being the attacker.
- A **second** payload, `queueHostFallEvent({...})` (L422–433), is serialized into `falls[]`
  for clients.
- A **third** payload, `onAnnouncerFall({ victimSlotIndex, attackerSlotIndex, comboTier })`
  (L438–442), feeds the announcer director.
- Clients rebuild yet another shape in `netcode.js` and call `addKillFeedEntry` +
  `onAnnouncerFall` themselves.

So there are effectively **four representations** of one fall (`scoreData`, the queued host
event, the announcer fall, the client-side reconstruction) plus inline challenge logic. They
already carry overlapping fields. Unifying them is consolidation, not new architecture.

### Also stale vs. the audit

- **Critical is still boost-based, not velocity-based** *(to be fixed — see Decision D1).*
  `CONFIG.scoring.criticalVelocityThreshold` (11.0 m/s) exists ([`config.js`](../src/config.js)
  L293) but **nothing reads it** — `wasCritical` is computed from the nitro window
  `ramBoostActiveUntilMs` ([`simulation.js`](../src/simulation.js) L856). This is the audit's
  §3 gap, and the KO Event closes it: once `impactSpeed` is captured (D2),
  `wasCritical = impactSpeed >= threshold`.
- **Sudden Death, combos, and last-cart-standing** post-date the audit entirely and now live
  in the fall loop.
- **Tie handling is fixed:** `pickTimerWinner` ([`gameState.js`](../src/gameState.js) L42)
  returns `"draw"` on an all-zero tie and breaks positive ties by most-recent scoring hit —
  resolving the audit's §8. Human ties route to Sudden Death.

## Migration plan

Incremental and low-risk — each step ships independently and is verifiable in the preview.

1. **Define the type.** Add a `KOEvent` typedef + `buildKOEvent(deps, slotIndex, pos, hit)`
   factory that returns today's `scoreData` fields under the new names, plus `cause`,
   `victimWasLeader`, `roundTimeMs`, and the `reward` breakdown. Pure refactor; no behavior
   change. `calculateFallScore` becomes its internals.
2. **Add `dispatchKOEvent(event, reactors)`** and move the existing fan-out (kill feed,
   announcer, `onLocalKillConfirm`) behind it. Score still applies at the call site for now.
3. **Extract the challenge reactor.** Move the inline `ChallengeTracker.record(...)` calls
   into `challengeReactor(event)`; register it. Fall loop no longer mentions challenges.
4. **Unify the wire shape.** Serialize the KO Event's authoritative subset into `falls[]` and
   have `netcode.js` rebuild a KO Event and call the *same* `dispatchKOEvent`. Deletes the
   duplicated client-side kill-feed/announcer construction.
5. **Capture `impactSpeed` and make critical velocity-based (D1 + D2).** Store the crediting
   ram's planar speed on the `lastHitBy` record at ram time
   ([`simulation.js`](../src/simulation.js) `recordHit`), carry it onto the KO Event, then set
   `wasCritical = impactSpeed >= CONFIG.scoring.criticalVelocityThreshold` — retiring the
   nitro-window heuristic and wiring up the config value that's currently dead.
6. **(Later) stats + analytics reactors** read the now-stable event stream.

Steps 1–4 are pure consolidation with no gameplay change — good candidates to land behind the
existing round tests. Step 5 changes critical-hit feel and should be tuned.

## Non-goals / keep it simple

- **No generic event bus.** One well-typed `KOEvent` and a fixed list of reactor functions is
  the whole system. Don't build pub/sub, event sourcing, or a middleware chain for a 4-player
  arena game — it would be more code than it saves.
- **Round lifecycle events** (countdown, GO, round end) stay where they are — the announcer
  already handles them off `gameStore` phase transitions. This doc is about **KO events**
  specifically; only promote others if a second consumer actually appears.
- **Don't over-serialize.** Only fields clients can't recompute go on the wire (the `A` rows).
  Names and colors stay `D`.

## Decisions

- **D1 — Critical is velocity-based.** `wasCritical` means the crediting ram landed at or above
  `CONFIG.scoring.criticalVelocityThreshold` (11 m/s), *not* whether nitro was active. Rewards
  the hit, not the powerup, per the original spec. Retires the dead config value. *(landed in
  migration step 5)*
- **D2 — Capture `impactSpeed`.** Store the crediting ram's planar speed on the `lastHitBy`
  record at ram time and carry it onto the KO Event. Unlocks D1 and intensity-scaled VFX.
  *(migration step 5)*
- **D3 — `victimWasLeader` is its own field.** The leader bonus still flows into `reward`, but
  surfacing the flag lets the announcer/VFX react to a leader KO without re-scanning scores.

## Open questions

1. **Stats persistence shape** — out of scope here; the event schema is designed so a stats
   reactor can be added without touching the fall loop. Define when stats work starts.

## Appendix — field mapping (today → KOEvent)

| KOEvent field | Today |
|---|---|
| `victimSlotIndex` | `slotIndex` (fall loop) |
| `attackerSlotIndex` | `scoreData.attackerSlot` / `hit.attackerSlotIndex` |
| `cause` | derived from `isCenterHole` + attribution + Sudden Death branch |
| `wasCritical` | `hit.wasCritical` (boost window today → velocity per D1) |
| `victimWasLeader` | leader scan inside `calculateFallScore` (not currently returned) |
| `impactSpeed` | — (not captured; open Q2) |
| `comboTier` / `comboMultiplier` | `scoreData.comboTier` / `scoreData.comboMultiplier` |
| `isSuddenDeath` | `roundState.isSuddenDeath` |
| `isFinalBlow` | `suppressSuddenDeathWin` / last-standing / SD win branches |
| `roundTimeMs` | `nowMs - roundState.startedAtMs` (not currently returned) |
| `reward.total` | `scoreData.points` |
| `reward.{base,critical,leader,multiplier}` | intermediates in `calculateFallScore` (not surfaced) |
| `verb` | `scoreData.verb` |
| names / colors | `netSlots[i].name`, `colorHexForSlot` (resolved per client) |
