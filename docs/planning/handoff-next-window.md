# Handoff — next agent window (Run 7 · NH-HIT lever 1)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod still:** **`index-CM5S_sme.js`** / **`6b5a9df`**  
**Local:** NH-HIT lever 1 **coded unpushed**  
**Ship only on “ship it.”** One lever at a time.

---

## Active: NH-HIT — non-host hit delay

**Bar:** joiner rams NPCs/players and **feels** the hit now (SFX/shake/particles), not a beat late.

| Step | Status |
|------|--------|
| **1 — optimistic local ram FX** | coded unpushed |
| **3 — host quality advisory/migrate** | after lever 1 retest |

### Evidence

- Cap-87/88 weak host + 89/90 strong host: delay remained. Structural (RTT + 40ms jitter + 40Hz), not only HOST-ROLE-1.
- NH-SMOOTH v4 visual: better (partial).

### Lever 1 files

- `src/simulation.js` — non-host live path plays collision FX when local is rammer  
- `src/netcode.js` — `noteOptimisticCollisionFx` stamps pair dedupe  
- `src/main.js` — wires callback  
- `tests/optimisticLocalHitFx.test.js`

### DO THIS NOW

1. Ship on “ship it”  
2. Same room dual client; joiner rams NPCs  
3. Pass feel → try lever 3 if authority lag still ugly  
4. Fail → F8 both + pull  

### Closed / partial

P0–P4 · NH-STATS · NH-BOOST · NH-SMOOTH (visual partial)  
