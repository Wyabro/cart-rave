# Solo polish sprint — July 10, 2026

**Branch:** `cart-clash`  
**Focus:** Solo-first feel, load, and bot depth. No post-FX/composer changes (black-frame risk).

## Shipped

### 1. Spill Bonus presentation
- Host awards already worked; presentation was missing.
- `onSpillBonusAward` in `src/directives/directiveEngine.js` → float / kill-feed style feedback in `main.js` / `hud.js`.

### 2. First-Solo load hardening
- Selected level cold-load, idle-warm suppress, cart prefetch.
- Touch points: `src/bootstrap.js`, `src/levelManager.js` (and related netcode/bootstrap wiring).

### 3. Directional hit vignette
- Not “near edge” proximity alone — **where you were rammed from**, cart-colored DOM wash.
- Arm: `triggerLocalHitTaken` → `pulseLocalHitDirectionVignette` in `main.js`.
- HUD: `pulseHitDirection` / `tickHitDirection` / `setEdgeDanger` in `hud.js`.
- CSS: `#hud .hud-edge-danger` in `src/ui/styles/hud.css`.
- Math: `src/utils/edgeDanger.js` (`sideWeightsFromCartBasis`).
- Floor intensity: `CONFIG.ramming.fx.hitDirMinIntensity` (shake gate stays separate/higher).
- ~~Config also has `CONFIG.edgeDanger` for near-edge telegraph knobs.~~ Cut in audit — see below.

### 4. Solo AI rubberband
- Pure curve: `src/utils/soloRubberband.js`.
- Config: `CONFIG.cart.ramBoost.soloRubberband`.
- Sim: `Simulation.setSoloRubberbandActive` / `getSoloRubberbandFactors`; chase weights in `getAiAxis`; nitro commit scale in `maybeTriggerNpcOpportunisticRamBoost` (**solo only**).

### 5. Death cam follow killer — **REVERTED**
- Goal was post-KO camera tracking the killer / fight for the respawn window.
- Landed briefly; **regressed feel** and was fully reverted to the original drift + pan-to-explosion death cam (`beginDeathCamera` / `updateDeathCamera` in `src/camera.js`).
- Optional future revisit — keep pure visual and validate multipath carefully.

### 6. Hop landing SFX/VFX
- Takeoff still plays `"hop"`; landing was often mute.
- One-shot flags on cart: `hopAwaitingLand`, `hopAirborne` (`entities.js`); armed in `triggerHop` + prediction hop.
- Rising-edge floor contact in `simulation.js` processCollisionEvents → `onHopLand` (distinct lower-rate `"floor"` thud + light dust).
- Suppresses generic floor impact on the same contact (no double-thud).
- Times out after `CONFIG.cart.hop.landingMaxMs`.
- Prediction reconcile nulls `onHopLand` so multipath replay does not spam SFX.

### 8. NPC rare hop
- Config: `CONFIG.cart.hop.npc` (cooldown, chance, threat distance, edge-save chance).
- Host-only: `maybeTriggerNpcOpportunisticHop` in `main.js`, called from `gameFlow.js` next to opportunistic nitro.
- Threat: approaching cart within distance/alignment/speed gates.
- Edge-save: higher chance near hazard via `Simulation.isNpcNearHazardEdge`.
- Safety: grounded-ish only; abort if forward look crosses a square void; no booth / free-fall hops.

## Tests
- `tests/edgeDanger.test.js`
- `tests/soloRubberband.test.js`
- `tests/hopLanding.test.js`
- Stubs: `tests/directiveEngine.test.js`, `tests/gameFlowSuddenDeath.test.js`

Gate at writeup: `npx tsc --noEmit` clean; full Vitest suite green (~188).

## Explicit non-goals / constraints honored
- Solo-first; multipath only where host-only FX already exists.
- No post-FX/composer changes.
- Brand: Cart Clash user-facing; legacy `cart-rave` infra IDs untouched.

## Post-sprint integration audit (same day)

Multi-angle review (manual + Opus subagent) before commit. Fixes applied:

1. **Hop-landing double-thud on clients** — the host suppressed its *local* generic
   floor FX on a hop landing but still broadcast the floor collision event, so a
   client's own hard landing played its predicted hop thud *plus* the replayed
   generic floor impact. Broadcast now suppressed too (`queueHostCollisionEvent`
   gate in `simulation.js` processCollisionEvents).
2. **Near-edge danger telegraph CUT (product decision)** — the sprint shipped
   `CONFIG.edgeDanger` knobs + pure proximity math, but nothing sampled it per
   frame. Wyatt decided he only wants the directional **hit** vignette, so the
   telegraph surface was removed entirely: `CONFIG.edgeDanger`, the proximity/
   model functions in `src/utils/edgeDanger.js` (only `sideWeightsFromCartBasis`
   remains — the hit vignette uses it), and their tests. The `#hud .hud-edge-danger`
   element + CSS stay as the hit-flash renderer.
3. **Dead code** — unreachable `|| previewMode` disjunct in
   `levelManager.rebuildLevelIfNeeded` finalize branch; never-added `is-critical`
   class (hud.js + hud.css).

Cleared as safe (sprint integration + July 10 production regression audit):

- Solo rubberband gating (re-armed per `getAiAxis` call, consumers double-gated on
  `detectGameMode() === "solo"`) — does **not** leak into multiplayer
- NPC hop host-gating via gameFlow's `isHost && running` block (same pattern as NPC nitro)
- Prediction-replay `onHopLand: null`; host suppresses floor collision **broadcast** on
  hop land (no client double-thud)
- Reconciliation hop-flag self-heal via `landingMaxMs` (note: flags still not cleared in
  `resetCartTransientState` — residual low-priority edge if you die mid-hop)
- Bootstrap idle-warm suppression races (degrade to full swap at worst)
- Netcode hit-direction (visual-only approximation for remote collisions)
- Living Store: directive CONFIG restore on SD / leave-running; snapshot `dir` self-heal
- Stability Pass 1 items re-confirmed not regressed in tree: flagged-spectator SD fall
  loop, music `load()` before `play()`, lobby non-host leave → `#checkAllReady`,
  customization partial-save hue, cart `baseScale` after shatter

**Not bugs (product / design):**

- Near-edge ambient telegraph — deliberately cut; hit vignette only
- Customize sunglasses-tab “resize” — intentional 1.35× camera zoom

Gate: `npm run check` green (tsc, 174 tests, knip) + `vite build` clean at audit.
Browser-verified: hit-vignette flash live via module drive; full in-game drive
test blocked by the hidden-pane rAF freeze — visible-pane manual check pending.

Canonical non-issue table for living docs: [project-state.md §5](../../planning/project-state.md#5-known-issues).
