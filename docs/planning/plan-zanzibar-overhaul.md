# Plan — Level 3 ("Zanzibar") Flagship Environment Overhaul

**Date:** 2026-07-09
**Status:** IMPLEMENTED 2026-07-09 (same session), plus a feedback round the same day.

**Feedback round (2026-07-09, after user playtest):**
- **Jitter was NOT fixed by the tuck alone** — user video showed resting jitter on the open deck, absent on booths. Diagnosis: booths are cuboids, deck was a convex hull → roundCuboid carts jitter on large hull faces but are stable on cuboids. Fix: deck rebuilt as FOUR overlapping rotated cuboids whose union is exactly the octagon (regular octagon = union of 4 rectangles rotated 45° apart, half-length = apothem, half-width = apothem·tan 22.5°); podium crown got the same 4-cuboid cap treatment with the ramp hull tucked 2 cm below the cap plane. Regression test rewritten as coverage sampling (tests/zanzibarFloor.test.js).
- Booth holo-banners removed (user disliked them).
- Perimeter lighting (deck edge strips, booth rails, bollard caps) switched from pink/cyan to caution yellow (0xffb400); pink/cyan retained on center accents (podium crown, guide lights, spindle, hologram).
- Distant sci-fi added: half-submerged orbital gate ring with pulsing guidance lights, tilted alien spire cluster with window lights, three ships on slow orbits with engine glows.

**Water-death FX round (2026-07-09, third playtest request):** carts falling into the ocean now splash on entry (foam ring + spray column + ballistic droplets, intensity scaled by fall speed) and detonate visibly (the ocean is opaque, so the "underwater" explosion is faked at the surface: neon light bloom through the water, sharp shock ring, glowing geyser pillar, delayed foam boil, rising bubble churn — plus cartShatter clamps its own core/ring explosion to the waterline). New module src/effects/waterDeathFx.js, registered by the level init and cleared on dispose (same pattern as cartShatter's setShatterEnvironment); per-frame driver called from frameVisuals; entry splashes detected from mesh positions so they work for local, host, and remote carts. Debug console handle: `CartClashWaterFx.spawnWaterDeathBurst(x, z, hex)`. Functional layers verified via the handle's counter (spawn → animate → drain); visual composition signed off in live play.

**Touch-up round (2026-07-09, second playtest):** jitter confirmed FIXED by the cuboid deck. Center accents (podium crown, guide lights, hologram, spindle light, deck-texture apron ring + conduit traces, grille glow) unified to the warm amber family — pink/cyan center clashed with the yellow perimeter; the neonColor1/neonColor2 config values are no longer used by this level. Yellow emissive toned down 2.0 → 1.15. Spire cones replaced with an alien city skyline (slab towers, setbacks, sky bridge, needle antenna, lit-floor window points). Added a ringed gas-giant + companion moon at ~22° elevation (chase cam ceiling is ~27°) for the unmistakable off-world read. All verified live in preview at 120–174 fps. Verified: typecheck + 107 tests (incl. new tests/zanzibarFloor.test.js) + knip (no new findings); live solo matches on Sundial Station at 120–174 fps with booth spawns, edge kills, water respawn, NPC edge-ranging, and pink/cyan neon confirmed in preview; Classic Record loads correctly afterward (radius restore path exercised). Decisions: name = **SUNDIAL STATION** (user's own synthesis of the Sundial/Station proposals); AI octagon-clamp fix included; sunset PMREM included behind a revert switch; enlargement +20% (rationale: at 26.4 m Zanzibar occupied the same footprint as Classic Record minus the hole — the size bump is primarily about differentiating the two arenas).
**Scope:** Environment, presentation, collision, polish for the `zanzibar` level only. No gameplay redesign, no scoring/networking changes, no layout changes, tropical-sunset + sci-fi identity preserved.

---

## Phase 1 — Investigation findings

### Current implementation

- The entire level is procedural in `src/levels/zanzibarPlatform.js` (891 lines): octagonal deck (Three CylinderGeometry, 8 segments) + canvas-painted 1024px deck texture, center podium frustum, 8 hazard bollards, 4 spawn booths, sky-gradient dome, 900 m ocean plane, 3 two-layer island silhouette clusters, sun disc/halo with slow azimuth drift, animated glint strip. No GLB assets, no shadow maps (blob contact shadows only), no Reflector.
- **Zanzibar is the cheapest arena in the game**: 1 point light + sun/hemi/ambient vs Classic's 5 fixtures + Reflector and Backrooms' 15. Baseline ~150 fps on the heaviest arena → real headroom for added detail.
- Arena size derives from the **shared** `config.record.radius = 26.4` (`src/config.js:29`). Zanzibar reads it live at build time for deck circumradius (`radius / cos 22.5° ≈ 28.6`) and booth placement. `CONFIG.cart.spawnRingRadius` is computed **once at module load** (`config.js:405-409`) — the one cached derived value.
- Materials: `createPhysicalMaterial` (scene.js) + global RoomEnvironment PMREM IBL (neutral, baked once at startup). Tone mapping exposure 0.4, dark-arena identity is owner-locked (do not brighten).
- Post-FX constraint: the composer / render-target formats are under an **active black-frame investigation** (`docs/planning/handover-postfx-black-frames.md`) — this pass must not touch `scene.js` composer setup, pass order, or RT formats.

### Floor jitter — root cause (found)

1. **Root cause: coplanar convex-hull faces.** The podium hull's entire 6 m-radius base ring sits at exactly `y = 0`, coincident with the deck hull's top face (`zanzibarPlatform.js:600-616`). Two colliders on the same static body sharing a large coplanar contact plane → Rapier narrow-phase flip-flops manifold ownership → alternating micro-impulses. This failure mode is *documented and deliberately avoided elsewhere in this repo*: Backrooms recesses stacked hulls 2 cm below its floor (`CHAMFER_TUCK = 0.02`, `backroomsSupermarket.js:891-893`, guarded by `tests/backroomsFloor.test.js`). Zanzibar never received the treatment; it is the only level with large-area coincident hull faces.
2. **Amplifier: restitution combine rule.** No combine rule is set anywhere; Rapier defaults to Average → cart 0.3 vs floor 0.05 yields effective ~0.175 bounce (floor was tuned to 0.05). Micro-impulses re-bounce instead of damping out.
3. **Amplifier: cart COM at y = −0.55**, below the collider's own bottom face (`simulation.js:195-219`) — long lever arm turns tiny angular noise into visible sway. Global cart tuning; **out of scope**, noted only.
4. **Secondary: `applyGeometryUnstick`** (`simulation.js:665-705`) applies a literal rotating "jitter" impulse to any cart near-stationary for 2 s below booth height. Legit anti-wedge safeguard; if the coplanar seam makes carts feel "caught," this compounds it. Fixing (1) should stop it from mistriggering; **no change** to the safeguard itself.

### Pre-existing bugs discovered (affect this task)

- **Zanzibar's AI hazard model is silently discarded**: `setLevelHazards` (`simulation.js:925-930`) keeps hazards only if `squareHoles` is a non-empty array. Zanzibar's `aiHazards` (octagon bounds + podium keep-out) has no `squareHoles`, so `_levelHazards` is null → bots fall back to a **hardcoded ±20/±24 clamp box** (`simulation.js:1372-1375`) and get zero podium keep-out or octagon-aware edge behavior. At the current 26.4 m radius this roughly coincides with the deck; after a 20% enlargement bots would visibly hug the center. Fix is required *to preserve combat pacing under enlargement* (see Plan §2).
- Countdown flyover orbits a fixed 28 m radius (`camera.js:218-224`) for every level; at ~31.7 m arena radius it would orbit inside the deck. Override hook already exists (`beginCinematicCountdown(camera, overrides)`).

---

## Naming proposals

Product name is **Cart Clash** (frozen, `docs/brand.md`). Level id `zanzibar` stays (storage/config-bound, invisible to players). Display-name touchpoints: `index.html:663`, `src/ui/loadingScreen.js:51`, `src/unlockConfig.js:85`, `docs/brand.md` table (+ CSS section comment).

| Proposal | Rationale |
|---|---|
| **THE SUNDIAL** ★ recommended | The arena literally is one: a flat octagonal plate, raised center podium as the gnomon, one low sun sweeping long shadows across the deck. Matches THE STOREROOMS' article style. Premium, evocative, and the sci-fi facility reads as a solar research array. |
| **HELIODECK** | Helio (sun) + deck. Sounds like a named module of an offshore research station — strongest pure sci-fi read, keeps the "deck" identity. |
| **SOLSTICE STATION** | The frozen-golden-hour conceit: a station where the sun never sets (the sun literally only drifts ±0.9° in code). Clean facility name, nice lore hook. |
| **PARADISE RIG** | Offshore industrial rig × postcard tropics — the ironic mash-up is very Cart Clash. Punchy and grinning. |
| **EMBER ATOLL** | Palette-true (the fog hex is literally sunset ember `0xff5a22`); atoll gives the tropical ocean. More poetic, less sci-fi. |
| **OCTANE REEF** | Octagon pun + fuel/speed pun + tropical reef. The playful sports-venue option. |

---

## Phase 2 — Implementation plan

### 1. Rename (risk: trivial)

Replace "ZANZIBAR PLATFORM" display string in the four touchpoints above once a name is chosen. Level id, storage keys, fog/config keys untouched.

### 2. Arena enlargement +20% (risk: medium)

Radius 26.4 → **31.7 m** (apothem; deck circumradius ≈ 34.3 m).

- `src/config.js`: add `physics.record.radiusByLevel = { zanzibar: 31.7 }`; extract the spawn-ring formula into an exported `computeSpawnRingRadius(config)`; bump `CONFIG_VERSION`.
- `src/levels/index.js` `loadLevel()`: after resolving the level id, set `config.record.radius` from `radiusByLevel` (default base value otherwise) and recompute `spawnRingRadius`. Because Zanzibar reads the radius live at build time, this single mutation point automatically scales: deck, deck texture, booth ring, spawn ring, `aiHazards.arenaHalf/circumRadius`, contact-shadow apothem, and all live AI radius reads. Wrap the level's `dispose` to restore base radius + spawn ring.
- `src/levels/zanzibarPlatform.js`: scale podium footprint `PODIUM_BASE_R 6.0→7.2`, `PODIUM_TOP_R 4.2→5.0` (keep height 0.5 — ramp eases 15.5°→13°, still drivable, verticality unchanged); add a fourth seam ring (~26.5 m) in the deck texture so plate density stays even.
- `src/main.js`: pass `{ radius: circum + ~5, height: +2 }` override to `beginCinematicCountdown` when the active level is zanzibar.
- **AI clamp fix (required for pacing):** in `setLevelHazards`, also accept hazard sets with `isOctagon`/`circularKeepOuts`; in `clampAiTargetAwayFromHazards`, when `isOctagon`, clamp targets to `arenaHalf − margin` (octagon apothem test already exists in `contactShadows.js:78-86` — same 2-axis projection). This *activates the level's already-declared hazard data*; Classic/Backrooms paths untouched. Without it, bots use ~75% of the enlarged deck and pacing degrades. (This also finally gives bots the podium keep-out the level has been exporting all along.)
- Playtest note: if 20% feels sparse in 4-cart matches, fall back to 15% (30.4) by changing one number.

### 3. Floor collision fix (risk: low)

- Podium hull: build base ring at `y = −0.02` (`PODIUM_TUCK = 0.02`, mirroring Backrooms' `CHAMFER_TUCK` convention) — kills the coplanar plane; visual mesh unchanged.
- Deck + podium colliders: `.setRestitutionCombineRule(CoefficientCombineRule.Min)` so the floor's tuned 0.05 actually wins (currently ~0.175 effective). Bollards/booths keep default Average (their bounce is intentional).
- Add `tests/zanzibarFloor.test.js` asserting the podium hull base sits ≥1 cm below deck top (same pattern as `tests/backroomsFloor.test.js`).
- Cart COM / geometry-unstick impulse: flagged, not touched (global gameplay tuning).

### 4–6. Environmental detail, sci-fi identity, materials (risk: low–medium, the bulk of the work)

All inside `zanzibarPlatform.js`, extending the existing procedural/canvas-texture systems. Instanced or shared-geometry throughout; heavy items gated behind `!isLowQualityMode()` (same convention as the glint strip). Target ≤ +20 draw calls.

**Engineered structure (kills the "blocky" read):**
- Perimeter truss ring: one InstancedMesh of diagonal struts (~64 instances) between deck rim and skirt.
- 8 slim corner pylons at octagon vertices dropping to the water with cross-braces (existing 4 center pillars stay).
- Dark metal fascia band under the neon rim strips so the neon reads as mounted hardware; small stanchion posts.
- Podium: thin contrasting top-cap disc, radial vent/grille detail on the frustum side (canvas), 8 guide lights at the base corners.
- Booths: canopy roof panel + antenna mast, cable-conduit boxes underneath, holographic team banner plane above each.

**Sci-fi identity:**
- Rotating holographic octagon ring above the podium (1–2 additive transparent meshes, canvas HUD-glyph texture, slow spin in `update()`).
- 4 slim beacon masts between booths with blinking aviation lights (emissiveIntensity pulse — sells "offshore facility").
- Cyan energy-conduit traces added to the deck canvas texture (zero geometry cost) + emissive strip along the skirt.
- 2–3 distant offshore wind turbines / sister platforms on the horizon, fogged like the islands, blades slowly rotating — cheap motion + instant sci-fi skyline depth.
- Faint contrail streak in the sky texture; a couple of blinking far-off aircraft dots.

**Materials (kills the "plastic" read):**
- Deck: procedural grayscale canvas as `roughnessMap` (brushed-metal strokes, edge wear along seams, rust streaks at bolts) — MeshStandardMaterial already supports it; one extra 512/1024 canvas.
- Shared tileable "metal panel" canvas for booth slabs / pillars / podium side (one texture, many meshes) replacing flat colors.
- Worn hazard stripes (scratches) on bollards; metalness/roughness variation across trim materials.
- **Flagged option — sunset environment map:** bake a one-time PMREM from the level's own sky dome at load so metals reflect sunset ember instead of the neutral RoomEnvironment. Biggest single "real materials" win; isolated one-time render at load, does NOT touch the composer — but it is new render-target usage while the black-frame investigation is open, so it ships only with explicit approval and a trivial revert switch.

### 7. Ocean enhancement (risk: low)

- Animated ripple: procedural tileable normal-map canvas on the existing water material, offset drifted in `update()` (no vertex animation, no extra draw calls).
- Second faint counter-scrolling glint layer for parallax (one mesh).
- Soft animated foam ring where the platform structure meets the water (canvas radial texture, slow opacity pulse) — sells scale and contact.
- Islands keep their (already-revised) composition; add a few emissive settlement-light dots on the nearest ridge. All ocean/horizon work stays fog-coupled (`0xff5a22`) per the visual-audit round-3 lesson.

### 8. Production-value pass (risk: low)

- Neon color variety: alternate pink/cyan (`neonColor1`/`neonColor2`) across deck edge strips / podium crown / bollard caps — directly addresses the visual audit's "monochrome accents" criticism; meshes stay in the existing `boothNeonMeshes` pulse list.
- 3–5 distant gull silhouettes on a slow orbit (pairs with ROADMAP #57's planned gull audio bed).
- Countdown flyover retuned for the larger deck (see §2).
- Loading screen already has the sunset theme; only the title string changes with the rename.
- Exposure, bloom, fog values: **untouched** (owner-locked dark identity).

### Files to modify

| File | Change |
|---|---|
| `src/levels/zanzibarPlatform.js` | Bulk: collider tuck + combine rule, geometry/detail/materials/ocean, update() animations |
| `src/config.js` | `radiusByLevel`, spawn-ring helper, CONFIG_VERSION bump |
| `src/levels/index.js` | Per-level radius apply/restore |
| `src/main.js` | Cinematic countdown override for zanzibar |
| `src/simulation.js` | `setLevelHazards` octagon acceptance + octagon clamp (surgical) |
| `index.html`, `src/ui/loadingScreen.js`, `src/unlockConfig.js`, `docs/brand.md` | Rename |
| `tests/zanzibarFloor.test.js` | New collider regression test |

### Performance & verification

- Zanzibar is the lightest arena; budget: ≤ +20 draw calls, no new dynamic lights, no shadow maps, all textures procedural canvases (≤1024px, halved in low-quality), heavy extras gated on `!isLowQualityMode()`.
- Verify via preview (127.0.0.1, visible tab): stationary/slow-cart jitter gone on deck + podium rim; solo match on enlarged deck (spawn, booth jump-in, edge falls, countdown flyover); before/after screenshots; fps + `renderer.info` draw-call comparison; run `tests/`; knip for unused exports.

### Explicitly out of scope / follow-ups (not in this pass)

- Restitution combine rule on Classic/Backrooms floors (same Average issue exists there).
- Cart COM / `applyGeometryUnstick` retuning.
- `sceneExtras` ground ring possibly still built (hidden) on non-Classic levels — verify & skip-build as a separate task.
- Per-level music / gull audio bed (ROADMAP #55/#57).

### Open decisions for approval

1. Level name choice.
2. Include the sunset PMREM environment map (flagged: touches render targets once at load while black-frame bug is open)?
3. Include the AI octagon-clamp fix in `simulation.js` (recommended — required for pacing at +20%; it's activating data the level already exports)?
4. 20% vs 15% enlargement.
