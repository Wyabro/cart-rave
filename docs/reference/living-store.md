# The Living Store — Living Cargo + PA Directives

As-built reference for the two gameplay layers shipped 2026-07-10 (commits `03edc7c`,
`b7ceeb2`, `70a737b`, `e2dea5c`). Deferred multiplayer checks:
[living-store-test-plan.md](../planning/living-store-test-plan.md). Sibling refs:
[announcer.md](./announcer.md), [scoring-event-system.md](./scoring-event-system.md).

North Star: the cart IS the scoreboard, and the Store PA graduates from commentator to
game-master. Both layers change what the five core verbs (drive/boost/hop/ram/survive)
are *worth* — never the verbs themselves.

---

## Living Cargo (`src/cargoLoad.js`)

Per-frame reconciler (ticked from `frameVisuals` right after `GroceryPool.update`)
that derives per-cart state from the **synced round scores** — host and clients agree
with zero extra netcode.

| Mechanic | How | Where |
|---|---|---|
| Cart = scoreboard | Bay shows `baseItems→maxItems` (2→12) groceries as score approaches `fullScore` | `GroceryPool.setCargoFill` (visibility toggles on a 12-slot GRID, fill-order list in `group.userData.cargoItems`) |
| Spill comeback | ~2.6s speed/accel buff from the spill moment; never stacks with nitro | `armSpillBoost(cart)` (exported here, used by main.js spill sites + netcode `handleRemoteSpill`) → drive block in `simulation.js` |
| Top-heavy | Lateral grip × `lerp(1, gripFullFactor, fullness)` | `applyArcadeControls` in `simulation.js`; fullness set here as `cart.cargoFullness01` |
| Bigger mess | Spill count 3→12 scales with fullness; `count` rides `MSG.spill` | `spillCountForCart(cart)` (exported here) |
| Restock | Bay re-shows after the buff lapses (+`restockDelayMs`); fall spills restock via respawn | `updateCargoLoad` |
| PA moments | `cart_overflow` (first full bay per slot/round), `spill_rush` (local comeback nudge) | edge-tracked here, arbitration in announcer |

All tunables: `CONFIG.cargo` (config.js). `comRaise` is a taste-gated experiment,
**off by default** (raising CoM can flip carts into the pit; the grip slide is the
shipped feel). DEV console handle: `window.__cartClashCargo()`.

Cart fields (set in `entities.createCart`): `cargoFullness01`, `spillBoostUntilMs`
(deliberately NOT cleared by `resetCartTransientState` — a fall keeps the buff tail
after respawn).

## PA Directives (`src/directives/`)

- **`directives.js`** — frozen data table (house pattern: pure data, no imports).
  Five launch directives: `flash_sale` (ramming.strength ×1.5), `double_bag`
  (koRewardMul 2), `express_lane` (boost cooldowns ×0.5, charge ×0.55), `spill_bonus`
  (+1 pt to the attributed rammer per forced spill), `rush_hour` (driving.maxSpeed
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
  attribution (window-checked, self-spills excluded). Presentation fan-out is a known
  follow-up (no float/feed line yet).

### Safety rails

- Never fires during Sudden Death (an `addScore` there ends the round); entering SD,
  leaving the running phase, or a stray late packet all restore/refuse. A gameStore
  subscription (not the rAF tick) performs the phase-exit restore, so overrides can't
  leak while the menu freezes the loop.
- `tests/directiveEngine.test.js` (13 tests) pins slot firing, stale-skip, finale
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
