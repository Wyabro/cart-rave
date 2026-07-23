# The Living Store — Living Cargo + PA Directives

As-built reference for the Living Store layers (Living Cargo shipped 2026-07-10;
**CARGO-WT-1 life-scoped weight** 2026-07-22). Deferred multiplayer checks:
[living-store-test-plan.md](../planning/living-store-test-plan.md). Sibling refs:
[announcer.md](./announcer.md), [scoring-event-system.md](./scoring-event-system.md).

North Star: the cart carries **this life's** grocery weight (boss / glass loop), and the
Store PA graduates from commentator to game-master. Round score still wins on the HUD —
the cart is **not** a cumulative round scoreboard after death. Both layers change what the
five core verbs (drive/boost/hop/ram/survive) are *worth* — never the verbs themselves.

---

## Living Cargo (`src/cargoLoad.js`) — CARGO-WT-1

Per-frame reconciler (ticked from `frameVisuals` right after `GroceryPool.update`)
that syncs each cart from **life-scoped** `lifeCargoPoints` (host-authoritative, synced
on the binary snapshot cart padding byte `lc`).

| Mechanic | How | Where |
|---|---|---|
| Life cargo | Spawn/respawn → `baselinePoints` (today's feel). KO / SD award / Spill Bonus → `grantLifeCargo`. Spill → `stripLifeCargo` (0). | `cargoLoad.js` + `gameFlow` / `directiveEngine` / spill sites |
| Cart weight curve | `weight01 = lifeCargo / fullScore`: stripped (fast/glass) ↔ baseline (1.0) ↔ boss (slower, harder to launch) | drive + ram-incoming in `simulation.js`; soft mass via `applyCartMassPropertiesOverride` |
| Bay fill | `GroceryPool.setCargoFill` from weight01; bay **hidden** while stripped | `updateCargoLoad` |
| Spill announce | `armSpillBoost` still arms `spill_rush` window; drive surge is the **stripped curve** (spillBoost speed/accel muls = 1.0) | spill sites + `simulation.js` |
| Bigger mess | Spill count 3→12 scales with weight01; `count` rides `MSG.spill` | `spillCountForCart` |
| PA moments | `cart_overflow` first boss fill **this life** (`clearCargoOverflowForSlot` on respawn); `spill_rush` on local strip | edge-tracked here |

All tunables: `CONFIG.cargo` (config.js). `comRaise` stays off. DEV: `window.__cartClashCargo()`.

Cart fields: `lifeCargoPoints`, `cargoFullness01` (= weight01), `spillBoostUntilMs`
(deliberately NOT cleared by `resetCartTransientState` — announce window can fire after fall respawn). Respawn sets life cargo back to `baselinePoints`.

### Sync

Host packs `lifeCargoPoints` as uint8 into cart snapshot **padding byte 0** (`binary.js`).
Non-hosts apply `snap.lc` in `applyCartState`. Same deploy ships encode+decode.

---

## PA Directives (`src/directives/`)

- **`directives.js`** — frozen data table (house pattern: pure data, no imports).
  Five launch directives: `flash_sale` (ramming.strength ×1.5), `double_bag`
  (koRewardMul 2), `express_lane` (boost cooldowns ×0.5, charge ×0.55), `spill_bonus`
  (+1 pt to attributed rammer — also fills life cargo), `rush_hour` (driving.maxSpeed
  ×1.12, accel ×1.25, boostedMaxSpeed ×1.08 — nitro keeps headroom). New directives
  are table entries + two announcer lines; overrides are dot-path multipliers into
  CONFIG so they track future base-tuning.
- **`directiveEngine.js`** — host-authored. Scheduling is a per-round slot list
  (`CONFIG.directives.fireAtMs`, default 20s/55s/90s ± `jitterMs`), anchored to
  round-elapsed time; stale slots (missed by more than a window — migration, frozen
  tab) are skipped, never fired late; no window may run inside the last
  `quietFinaleMs` (30s) of the round clock. One active at a time, no back-to-back
  repeats, silent expiry (the HUD chip draining is the end signal — deliberate,
  user-cut PA sign-off).

### Netcode

- Start: one-shot `MSG.directive {id, durationMs}` over the DataChannel (spill
  pattern); every peer applies identical CONFIG overrides and self-expires on its own
  clock.
- **Self-heal:** the active window also rides the host's 40Hz snapshot JSON tail as
  `dir: {id, r}` (binary.js) — a client that missed the one-shot, or joined
  mid-window, applies it from the next snapshot with the remaining duration.
- KO reward boost applies host-side in `buildKOEvent` via the injected
  `getDirectiveKoRewardMultiplier` dep (koEvent.js stays a leaf); the boosted reward
  (and effective `reward.multiplier` = combo × directive) rides `falls[]`, so client
  presentation matches without directive state.
- Spill Bonus awards go through the host `addScore` path with `lastHitBy`
  attribution (window-checked, self-spills excluded) **and** `grantLifeCargoForSlot`.
  Presentation: `onSpillBonusAward` fans out a score float + feed line.

### Safety rails

- Never fires during Sudden Death (an `addScore` there ends the round); entering SD,
  leaving the running phase, or a stray late packet all restore/refuse. A gameStore
  subscription (not the rAF tick) performs the phase-exit restore, so overrides can't
  leak while the menu freezes the loop.
- `tests/directiveEngine.test.js` pins slot firing, stale-skip, finale
  guard, apply/restore integrity, SD/phase rails, remote apply, and scoring hooks.

## Announcer integration

Directive events are `cls: "critical"` + `focus: true` (announcerEvents.js): critical
so the announce interrupts and clears the queue the instant the rules change; focus
opens a suppression window for the callout's 5.2s hold during which non-sequence,
non-critical events are **dropped** (not queued). The window closes early if the
callout is interrupted (`endActive`). Regular callouts render 25% smaller than
directive callouts (`[data-focus]` sizing in `announcer.css`; tighter still on
mobile). Focus is only valid on events WITH a callout — a callout-less focus event
would open a phantom mute window (this bit sudden_death once; see the comment on its
event def).

## HUD chip

`.hud-directive` — kill-feed-styled plate under the round timer (name + seconds +
accent drain bar), driven per frame by `HUD.setHudDirective(getActiveDirective(), now)`
from frameVisuals. Write-guarded (accent/name on directive change, bar quantized to
0.1%) per the repo's no-redundant-DOM-writes convention.
