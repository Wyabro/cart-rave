# Scoring & Event System

> **Status:** implemented (2026-07-08) — migration steps 1–5 complete and committed.
> **Last refreshed:** 2026-07-10 — reactors include match stats + arena VFX; kill-zone bonuses;
> Living Store (cargo + PA directives) noted below. This is an **as-built reference**, not a proposal.
> Supersedes the jam-era audit
> [`archive/audits/step-10a-scoring-audit.md`](../archive/audits/step-10a-scoring-audit.md).
> Sibling system docs: [`announcer.md`](announcer.md),
> [`Game_Architecture.md`](Game_Architecture.md).

## What this replaced

Scoring used to be a closed loop: a cart falls, a number goes up. As Cart Clash grew, a set of
systems all needed to know *what just happened*, not just *who got points* — the announcer,
challenges, combos, Sudden Death, production VFX, and the kill feed. Each was fed from **three
separate ad-hoc payloads plus inline calls** assembled at the fall site, and every subsystem
re-derived its own interpretation of the same fall. There was no shared representation.

**The reframe, now in place:** points are one *output* of a richer gameplay event. The fall is
modelled once as a **KO Event**; every subsystem reacts to it.

## Core idea: one KO Event, many reactors

When a cart falls, the fall site builds a single canonical **KO Event** and hands it to a fixed
list of pure-consumer **reactors**:

```
KOEvent
────────
victimSlotIndex:   3            attackerSlotIndex: 1 (null = self/environmental)
isKill:            true         cause:             center_hole
wasCritical:       true         impactSpeed:       21.4  (m/s of the crediting ram)
victimWasLeader:   false        victimKind:        "npc"   victimAiName: "aggressor"
comboTier:         2            comboMultiplier:   2.0
isSuddenDeath:     false        roundTimeMs:       41200
reward: { base: 2, critical: 1, leader: 0, multiplier: 2.0, total: 6 }
verb:              "STEAMROLLED"
```

Each reactor reads fields and pokes one subsystem — it never re-inspects physics or scores to
guess what happened. This generalizes the pattern the announcer already used
([`announcerDirector.js`](../../src/announcer/announcerDirector.js) is a read-only observer fed one
`fall` object) to every consumer.

**Where it lives:**

| Piece | File |
|---|---|
| `buildKOEvent` (host) + `rebuildKOEvent` (client replay) + `KOEvent` typedef | [`src/scoring/koEvent.js`](../../src/scoring/koEvent.js) |
| `dispatchKOEvent` + the reactors | [`src/scoring/koReactors.js`](../../src/scoring/koReactors.js) |
| Host fall loop that builds + dispatches | [`src/gameFlow.js`](../../src/gameFlow.js) |
| Non-host replay that rebuilds + dispatches | [`src/netcode.js`](../../src/netcode.js) `processHostFallEvent` |

## Dataflow

Host-authoritative, replayed on clients — the game's existing split. The KO Event *is* the fall
blob the host already shipped, promoted to a documented type.

```
HOST                                              EVERY CLIENT (incl. host)
────                                              ─────────────────────────
cart.y < fallThreshold
   │
   ▼
buildKOEvent()                                     ┌───────────────────────────────┐
   │                                               │  dispatchKOEvent(event, ctx)   │
   ├─► addScore(...) at the call site (not a       │    ├─► matchStatsReactor       │
   │   reactor yet — host mutates scores here)     │    ├─► challengeReactor        │
   ├─► serialize a thin subset ────────────────────┼──► ├─► localKillConfirmReactor │
   │   into snapshot falls[] (JSON tail)           │    ├─► arenaVfxReactor         │
   └─► dispatchKOEvent(event, ctx)  ───────────────┘    ├─► killFeedReactor         │
                                                        └─► announcerReactor        │
                                                   (Score is NOT in this list)      │
                                                    └───────────────────────────────┘
   non-host: netcode.js decodes falls[] ─► rebuildKOEvent(msg) ─► dispatchKOEvent()
```

- **Host** builds the full event, applies score at the call site (`addScore`), serializes a thin
  subset into the `falls[]` tail, and dispatches locally.
- **Clients** decode `falls[]`, `rebuildKOEvent` from the wire record (recomputing derived fields
  — names, colors, victim classification — from local slot/cart state), and run the **same**
  `dispatchKOEvent`. Authoritative scores arrive via the existing host round message; clients
  never apply `reward.total`. The event drives presentation + local bookkeeping only.

`falls[]` is a **JSON tail** ([`binary.js`](../../src/netcode/binary.js)), so widening the wire is
cheap when it's needed (see [Deferred](#deferred--known-gaps)).

## KO Event schema

The host's `buildKOEvent` populates **every** field. The wire (`falls[]`) currently carries only
a **thin subset**; on clients `rebuildKOEvent` fills the rest from local state or neutral defaults.
No client reactor reads a field that isn't available to it today.

| Field | Type | On wire? | Notes |
|---|---|---|---|
| `victimSlotIndex` | int | ✅ (`slotId`) | who fell |
| `attackerSlotIndex` | int \| null | ✅ (`attackerSlot`) | null ⇒ self/environmental |
| `isKill` | bool | derived | `attackerSlotIndex != null` |
| `cause` | enum | ❌ | `center_hole` \| `outer_edge` \| `self` \| `sudden_death`; client approximates outer/self |
| `wasCritical` | bool | ❌ | host: `impactSpeed >= CONFIG.scoring.criticalVelocityThreshold`; client `false` |
| `victimWasLeader` | bool | ❌ | host leader scan; client `false` |
| `victimKind` | string \| null | recomputed | `"human"`/`"npc"` from the slot table (per-machine) |
| `victimAiName` | string \| null | recomputed | AI personality (e.g. `"aggressor"`) from the cart (per-machine) |
| `impactSpeed` | float | ❌ | m/s of the crediting ram; host from `lastHitBy`, client `0` |
| `comboTier` | int (0–3) | ✅ | attacker streak tier at the kill |
| `comboMultiplier` | float | ✅ | from `CONFIG.combo.tiers[tier].multiplier` |
| `isSuddenDeath` | bool | ❌ | host `roundState.isSuddenDeath`; client `false` |
| `isFinalBlow` | bool | ✅ (when set) | Sudden-Death-ending KOs; carried on the wire for presentation |
| `roundTimeMs` | int | ❌ | ms since round start; host only |
| `reward` | object | thin / rebuilt | `{ base, critical, leader, highGround, multiplier, total }`; score float uses breakdown |
| `verb` | string | ✅ | host-picked so every client renders the same word |
| names / colors | — | derived | resolved per client from slots (never trusted from the wire) |

**Reward breakdown** replaces a bare `points`. Base points vary by kill zone (e.g. Classic center
hole / Storerooms corner voids at 2; perimeter edge at 1; Sundial **high ground** +1 when the
crediting ram was from the podium). `reward.total` is what the host's `addScore` adds.

## Reactor catalog

Reactors run in `DEFAULT_KO_REACTORS` order: **match stats → challenge → local kill-confirm →
arena VFX → kill feed → announcer**. Each is `(koEvent, ctx) => void`; all app wiring arrives via
`ctx` so the module stays a leaf.

1. **`matchStatsReactor`** — per-match KO/death/combo counters (`src/scoring/matchStats.js`) for
   results superlatives and future goals. Runs on every device for every KO dispatch.
2. **`challengeReactor`** — progresses local challenge counters (`ko_void` / `ko_npc` /
   `ko_aggressor`) for the local player's kills, reading `victimKind` / `victimAiName` off the
   event. Runs on every device for *its own* player's kills (gated `attacker === localSlot`), so a
   KO is counted exactly once, on the attacker's machine.
3. **`localKillConfirmReactor`** — attacker-side kill-confirm feedback (sting/hitmarker/FOV punch)
   when the local player scored the KO.
4. **`arenaVfxReactor`** — arena KO flash / related world reactions gated by event fields.
5. **`killFeedReactor`** — renders one feed row. Attacker + combo badge for a kill; the event's
   `verb` with no actor for a self/environmental fall. Single verb source ⇒ host and clients show
   the same word.
6. **`announcerReactor`** — forwards to `announcerDirectorOnFall` (first_spill, refund, rampage,
   cleanup_aisle, critical_ko, leader_down…).

**Score is not a reactor.** It's applied at the host fall site (`addScore`, plus the Sudden Death
resolution and `lastScoringHitAt` tiebreak stamp). It's the one thing that mutates authoritative
game state and only runs on the host — folding it into a reactor is possible but wasn't worth the
indirection for V1. Combo-timer refresh similarly still lives inside `buildKOEvent`.

## Related systems (not KO reactors)

Full Living Store writeup: [`living-store.md`](./living-store.md).

- **Living Cargo** (`src/cargoLoad.js`) — reconciling **round score → bay fill + handling**
  after groceries update. Overflow / spill-rush PA lines fire from cargoLoad, not from KO reactors.
- **PA Directives** (`src/directives/`) — host mini-mutators. **Double Bag** multiplies KO
  `reward.total` via `getDirectiveKoRewardMultiplier` injected into `buildKOEvent` (leaf stays pure);
  effective `reward.multiplier` reports combo × directive. **Spill Bonus** awards +1 on the host
  `addScore` path for attributed forced spills (window-checked); float/feed presentation for that
  bonus is a known follow-up.
- **Lifetime unlocks** — challenge/unlock progression listens to KO-derived events via existing
  challenge/unlock stores, not a separate KO reactor.

## Non-goals / keep it simple

- **No generic event bus.** One typed `KOEvent` + a fixed reactor list is the whole system — no
  pub/sub, event sourcing, or middleware for a 4-player arena game.
- **Round lifecycle events** (countdown, GO, round end) stay in the announcer's `gameStore` phase
  subscription. This system is about **KO events** specifically.
- **Don't over-serialize.** Only fields clients can't recompute belong on the wire.

## Decisions (landed)

- **D1 — Critical is velocity-based.** `wasCritical` means the crediting ram landed at or above
  `CONFIG.scoring.criticalVelocityThreshold`, not whether nitro was active. Closes the audit's §3
  gap and wires up the previously-dead config value. Threshold **tuned to 16.0 m/s** (~68% of the
  23.5 top speed; ~60% of committed hits) via solo playtest.
- **D2 — `impactSpeed` captured.** The crediting ram's planar speed is stored on the `lastHitBy`
  record at ram time ([`simulation.js`](../../src/simulation.js)) and carried onto the event — feeds
  D1 and future intensity-scaled VFX/stats.
- **D3 — `victimWasLeader` is its own field**, so announcer/VFX can react to a leader KO without
  re-scanning scores (the leader bonus still flows into `reward`).
- **Center-hole is gated on `CONFIG.record.centerHole.enabled`** — solid-floor levels (Backrooms,
  Zanzibar, Test Arena) never award the +2 center bonus, even for near-origin edge falls.

## Deferred / known gaps

None block "done"; each is a deliberate V1 boundary to revisit when a consumer needs it.

- **Thin wire.** `falls[]` carries `victimSlot`/`attackerSlot`/`verb`/`comboTier`/`comboMultiplier`
  only. `cause`, `wasCritical`, `impactSpeed`, `victimWasLeader`, `reward`, and round context are
  **not** serialized, so on clients they're defaulted. Fine until a client-side VFX/stats reactor
  needs them — then widen `queueHostFallEvent` + `rebuildKOEvent` (cheap; JSON tail).
- **`cause: "sudden_death"`** is defined but never set — the Sudden Death path mutates
  `attackerSlotIndex`/`verb` only.
- **`isFinalBlow`** is reserved but always `false`; populate it when a reactor consumes it.
- **Combo-decay refresh + `addScore`** still live at the host call site rather than in a score
  reactor. Intentional for V1.
- **Stats persistence shape** — out of scope; a stats reactor can be added without touching the
  fall loop. Define when stats work starts.
