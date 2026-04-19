# Cart feel tuning (deferred)

## Collider vs visual (current baseline)

- **x / z:** Cuboid collider was shaved to **~95% of visual** bounds (`CONFIG.cart.size`: full **x = 1.31**, **z = 2.26**; half-extents derived in `createCart`). Improves cart-on-cart contact without matching mesh exactly.
- **y:** Collider full **y = 1.35** remains **undersized vs visual (~11%)** — tied to wheel sink / spawn height; left deferred (see comment on `CONFIG.cart.size.y` in `main.js`).

## Angular damping (kept from this tuning round)

- **`CONFIG.cart.angularDamping = 1.5`** — applied on **all** cart bodies via `RigidBodyDesc.dynamic().setAngularDamping(...)` in `createCart` (player + NPCs identical).

## Center of mass (rigid body `localCom` / additional mass CoM)

**Current baseline (reverted):** `{ x: 0, y: -0.55, z: 0 }` — set in `applyCartMassPropertiesOverride` in `main.js` (same path for every cart).

### Observed failure modes

| Mode | What we saw |
|------|----------------|
| **Baseline stability** | **y = -0.55**, **z = 0** — stable but felt dull / low character. |
| **Tipping mode** | **y = -0.4** — too tippy laterally (e.g. hard turns). |
| **Flip mode** | **y = -0.45** with **z = -0.2** (rearward CoM) — front flips under acceleration. |

### CoM tuning — deferred notes (same as `CONFIG.cart` comment)

- Baseline **-0.55** is **stable-but-boring**.
- Tried **y = -0.4** (tippy) and **y = -0.45** with **z = -0.2** rearward (front-flips under acceleration).
- Next attempt should use **small, single-axis** changes with **angular damping co-tuned**:
  1. Try **y = -0.5** alone; if tippy, raise **angularDamping** from **1.5 → 2.0–2.5**.
  2. If stable, try **y = -0.475**.
  3. **Do not** shift CoM in **z** until **pitch stability** is confirmed at the target **y**.
  4. Revisit only after **ram boost** and other feel work land — need full context.
