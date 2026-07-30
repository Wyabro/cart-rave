# STATUS session log — 2026-07-30, CARGO-VIS-1 arc (sessions 1 → 3 + hotfix)

> Archived from [STATUS.md](../STATUS.md) on 2026-07-30 when the card closed (status-size
> budget). STATUS keeps a one-paragraph closure entry; the blow-by-blow lives here.
> **History, not current truth** — `git log` and the code are authoritative.
> Decision of record: **D-CARGO-VIS-1** (pile crests the rim — reverses the old under-rim
> invariant). Companion fix: CARGO-RACE-1 (bays self-heal).

## Session 1 — geometry landed; evidence rig blocked, timeboxed out

Bay-local `rimY` plumbed `getBasketCargoParams` → `createCargoBay` (all 3 cart paths, both
call sites), GRID widened to ±1.0, layer-2 crest solves against rimY with a float guard for
deep baskets; the old under-rim comment REVERSED (D-CARGO-VIS-1). qa 773/773. **Screenshot
evidence blocked:** `createCargoBay()` builds its item list once, `GroceryPool.init` is
deliberately non-blocking (main.js:2826) — cold `?room=solo` headless boots lose the race
every time → empty bays (probe: itemCount 0 on all 4). Same race can hit a real cold-cache
fast play entry until the next KO rebuild → **CARGO-RACE-1**. Next rig lever: gameharness
`holdKey` drive-into-pit → KO respawn rebuilds bays with loaded models; or Wyatt real-window
look. Proven for SHEET-1: `freeze=1` + manual camera pose gives clean into-basket framing.

## CARGO-RACE-1 fixed — cold-boot empty cargo bays now self-heal

`createCargoBay()` queues bays built before `GroceryPool.init` resolves (`pendingBays`,
mirrors the pendingSpills replay); `buildPool()` re-runs the item build for still-parented,
still-empty bays after `ready = true` and before the spill replay, so a bay hidden by a
queued spill stays hidden. One file (`src/effects/groceryPool.js`), no signature/caller
changes. qa 773/773. Probe (cold headless `?room=solo`): bays first seen `[0,0,0,0]` — the
exact pre-fix condition — healed to `[18,18,18,18]` by phase=running, PASS.

## Session 1b + 1c — rig hardened; root cause found

Rig recipe (reusable for SHEET-1): hardware-GPU headless
(`--enable-gpu --ignore-gpu-blocklist --use-gl=angle` — kills SwiftShader blur + modal);
warm reload = real rave carts (cold boots spawn the procedural fallback, entities.js:162;
clear `cartRaveEngagedRoom` sessionStorage first or main.js:1794 strips `?room=solo`);
fill lever = in-page `import("/src/config.js")` → `cargo.baselinePoints` pre-first-cargo-frame.
1b's SwiftShader 900×600 look-claims superseded. Root cause of the buried pile: fallback bay
dims (`tripo_part_0` renamed `CartFrame`) → fixed in session 2.

## Sessions 2–3 — CartFrame fix + 4-pass retune, DEPLOYED `7660623`

**Session 2:** `getBasketCargoParams` matches `CartFrame` (instance rename of authored
`tripo_part_0`) → live rave carts hit the measured-bounds path; Wyatt red-line review: still
~⅓ of the true cavity (0.48/0.42 insets were never-rendered guesses). **Session 3, 4 acked
passes:** (1) insets → 0.68/0.60, cargoScale 0.52→0.60, crest guard 1.4→2.2·halfY;
(2) GRID 18→25; (3) Wyatt 4-phase pacing 5>10>20>30 — `CONFIG.cargo.fillPhases` + stepped
`lifeCargoVisibleCount` (quarter-split; weight01 stays continuous), GRID → 30 (15/10/5),
base/max 10/30, all phases verified live (rig reloads at life 2/3/6/8); (4) rear dead-strip:
front-nudge 0.08→0.02 + hl 0.6→0.7, rear-view shot proves no clip-through, crest tops the rim
in profile. qa 773/773 each pass. **Shipped:** Worker Version `9752ef69-…`, entry
`index-C06DMhvl.js`, **verified against fetched assets** (`fillPhases`+`CartFrame` in entry,
sha in `scene-DA9pQ7f6.js`).

## Hotfix — KO-respawn bay drift, DEPLOYED `b13bafb`

Wyatt prod playtest: each death rebuilt the bay further out (clip → fully outside). Cause: the
CartFrame path measured a WORLD AABB then inverted it — exact at creation, inflated up to ~2×
on KO rebuilds where the mesh still holds its death pose (dead code until session 2). Now:
geometry bbox × child-relative-to-root matrix — rotation-independent, creation numbers
identical so the pass 1–4 tuning holds. Probe: 2 pit-dive KO cycles → bay origin bit-identical
(dPos 0.000×3), footprint within jitter; post-KO shot clean (respawn = phase-2/10 by design).
qa 773/773. Shipped: Version `70d6aa91-…`, entry `index-BSZ0AT-Y.js`, sha in
`scene-Br9fE8mW.js` — **asset-verified**. **Wyatt prod playtest PASS → CARGO-VIS-1 closed.**
