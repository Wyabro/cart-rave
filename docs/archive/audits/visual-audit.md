# Cart Clash — Visual Audit Report (Three.js r185 Polish Pass)

*Audited 2026-07-08 on branch `cart-clash`. Sources: full read of scene/renderer core, three r185
source verification, live baseline capture (Classic Record, solo), and three targeted code sweeps
(carts/customization, arenas/lighting, effects/particles).*

## Executive summary

The game's rendering foundation is solid and deliberately cheap where it should be (no shadow
maps, pooled blob shadows, one Reflector, quality toggle). The single biggest finding is that
**the post-processing chain silently disables tone mapping and sRGB output encoding** — the
entire look has been hand-tuned around a technically broken color pipeline, and the cart
customization preview renders through a *different* (also inconsistent) pipeline, so carts don't
match between menu and game. Fixing this correctly (OutputPass + retune) is the highest-impact
single change available, and also the one that touches the look of everything.

Beyond that: pink/magenta neon is structurally under-bloomed relative to cyan/yellow (Rec.709
luma bias), the highest-frequency effect (boost streaks) allocates GPU objects per spawn, the
Backrooms arena has a player-readability gap, and several free perf wins exist (instancing the
Backrooms ceiling grid, not building the Classic skybox on levels that hide it).

Frame rate baseline: ~150 fps desktop in a 4-cart solo match on Classic Record (the heaviest
arena: Reflector + crowd + lasers + spotlights). Perf headroom exists, but every proposal below
stays inside the "browser multiplayer + mobile" budget.

---

## 1. Current pipeline (verified)

- **Renderer** (`src/scene.js:320-333`): `WebGLRenderer`, `antialias:false`, pixel ratio ≤ 2
  (1 in low-quality), `ACESFilmicToneMapping`, exposure 0.88, **no shadow maps** (blob contact
  shadows in `src/contactShadows.js`).
- **Composer** (`src/scene.js:405-440`): RenderPass → UnrealBloomPass (str 0.67 / rad 0.34 /
  thr 0.86) → custom Arcade FX ShaderPass (chromatic aberration + scanlines + vignette) → FXAA.
  Always the render path — `composer.render()` unconditional at `src/frameVisuals.js:294`;
  low-quality just disables bloom + arcade passes.
- **IBL**: RoomEnvironment PMREM baked once, `scene.environment`, global intensity 0.6 ×
  per-material 0.4 (`src/scene.js:135-171`, `src/config.js:318-321`).
- **Fog**: FogExp2 per level — Classic `0x0a0520`@0.0065, Backrooms `0x2a2418`@0.029, Zanzibar
  `0xff8c4a`@0.0032, Test `0x586274`@0.0032.
- **Cart used in gameplay**: the Draco GLTF cart (`public/models/cartrave4-draco.glb`, 24
  meshes / 24 materials / ~25k tris, cloned materials per cart). The procedural cart in
  `src/cart.js` is a load-race fallback only (`src/entities.js:152-176`).
- **Debug tooling**: `postFxDebug.js` Tweakpane (H / `?debug`) already exposes exposure, tone
  mapping mode, bloom, arcade, env intensity, fog — ideal for the retune work below.

## 2. Finding #1 — the color pipeline is silently broken (flagship fix)

Verified against three r185 source (`WebGLPrograms`): tone mapping and output color-space
conversion are applied **only when rendering to the default framebuffer** (`currentRenderTarget
=== null`). Consequences for this codebase:

1. `RenderPass` renders the scene into the composer's (HalfFloat, linear) render target →
   **ACESFilmic and `toneMappingExposure: 0.88` never execute**. Both settings, and the
   postFxDebug tone-mapping picker, are silent no-ops in-game.
2. The final pass is FXAA — a raw `ShaderMaterial` without `tonemapping_fragment` /
   `colorspace_fragment` chunks — so the canvas receives **linear-space values with no sRGB
   encoding**. Mid-tones display darker and more saturated than authored; highlight rolloff is
   hard-clipped instead of filmic.
3. The customization preview (`src/ui/cartPreview.js:254-258`) renders **directly** (no
   composer): sRGB encoding on, tone mapping off (default). So the preview and the game apply
   *different transfer functions* to the same cart materials — carts do not match between the
   customize screen and gameplay.
4. Bloom's luminance threshold operates on linear values, not the tone-mapped image, which
   compounds the color-skew in #5 below.

**Fix direction**: insert `OutputPass` (tone mapping + sRGB) after the bloom/arcade passes,
before FXAA (FXAA is designed for LDR sRGB input, so this order also *improves* AA quality);
set the same tone mapping on the cart preview renderer; then retune exposure / bloom / fog
colors / emissive intensities via the existing postFxDebug GUI to restore the intended look on
a correct foundation. Candidates: ACESFilmic (current intent) vs `NeutralToneMapping` (Khronos
PBR neutral — better hue preservation for saturated neon, likely the best fit for this art
style; ACES notoriously skews saturated magenta/cyan). **This visibly changes the whole game
and must be done as a dedicated, screenshot-compared tuning pass — not mixed with other
changes.**

## 3. Finding #2 — magenta never blooms (readability asymmetry)

Bloom high-pass uses Rec.709 luma (G 0.715, R 0.213, B 0.072) against threshold 0.86:

| Neon color | Luma | Blooms at rest? | Blooms at pulse peak (×1.6)? |
|---|---|---|---|
| Pink `#ff00ff` | 0.29 | no | **no** |
| Cyan `#00ffff` | 0.79 | no | yes |
| Green `#00ff00` | 0.72 | no | yes |
| Yellow `#ffff00` | 0.93 | ~borderline | yes |

Pink-team carts, pink boost streaks, and pink arena neon are structurally under-glowed versus
every other team color. Fix: per-hue emissive compensation already exists
(`cartEmissiveIntensityForHex`, `src/utils.js:40-44`) — extend/retune it, and/or lower
threshold with a wider soft knee as part of the §2 retune.

## 4. Cart system — state and preservation contract

### What must not break (customization contract)

Any material/mesh work on carts must preserve:

- **Material-cache arrays** `{ frameMats, frameBodyMats, accentMats, frameGlowMats }`
  (`src/cartThemes.js:24-30`, `src/cartRaveGltf.js:2348`) — sole interface for per-frame
  recolor, leader glow, and boost pulse (`src/frameVisuals.js:230-276`).
- **userData keys**: `isCartFrame`, `isHandle`, `isFace`, `isWheel`, `isSharedGeometry`,
  `isCartPatternLayer`, `sharesCartFrameGeometry`, `isRaveGltf`, `raveGltfPartRole`,
  `raveGltfAuthoredColor`, `raveGltfHasEmissiveAccent`, `raveGltfSunglassesStyle`,
  `preserveGltfMaps`, `baseScale`.
- **Named objects** resolved via `getObjectByName`: `CartFrame`, `CartHandle`, `BasketFace` /
  `RaveGltfFaceGroup`, `RaveGltfModel`, `RaveGltfBodyScale`, `CartFramePattern`.
- **`rebuildCartVisualsIntoRoot()`** (`src/entities.js:204`) merges userData across
  shatter/respawn rebuilds — new keys must be included or they vanish on first respawn.
- Call signatures branched on at `src/entities.js:157-170`: `prepareRaveGltfCart(...)` vs
  `buildCart(color)` + `applyCartTheme(...)`.

### Observations

- All cart materials are `MeshPhysicalMaterial` via one factory (`createPhysicalMaterial`,
  `src/scene.js:82`). Good consistency; presets per role (frame/wheel/fork/face/trim).
- **~48% of the cart's 25k triangles are in the 4 wheels** (~3k tris each) while the
  identity-carrying parts (sunglasses, handle, trim) are 30–870 tris. Budget misallocation;
  an asset-side decimation is the fix (risky bucket).
- **All 24 materials cloned per cart** (4 carts = 96 unique materials); wheels ×4 and lenses
  ×2 could share within a cart. Cheap dedup win.
- Emissive "wire glow" reuses the albedo map as emissive mask (`src/cartRaveGltf.js:1540`) —
  glow can't be tuned independently of surface color without a second texture.
- Pattern overlays are a coplanar second full mesh with `polygonOffset`, 128px mask ×3 repeat
  (`src/cartPatterns.js:32-33`) — doubles frame-mesh draw/fill when active, blocky up close.
- Procedural fallback face (flat plane lenses) reads paper-thin vs the GLTF mirror lenses —
  visible only during load races; low priority.
- Leader glow / boost pulse mutate materials every frame unconditionally, no dirty check —
  cheap but sloppy; fine to leave.

## 5. Arenas

### Classic Record (hero arena — strongest identity)
- Vinyl record + Reflector mirror floor + DJ booths + full space skybox (4000 stars, nebulae,
  planets, UFOs) + 5 drifting volumetric spotlights + crowd/lasers/billboard from effects.js.
- Weaknesses: space backdrop is flat-shaded primitives at fixed positions (no parallax
  relationship, reads generic); pit-wall void is a bare linear gradient; booth truss = 100+
  un-instanced small meshes; 6-sided neon tube cylinders will facet under bloom close-up.
- Perf: Reflector renders the scene an extra time (1024² full / 256² preview) — the single
  most expensive item in the game, already quality-gated. Leave as is.

### Backrooms Supermarket
- Best material variety (3 procedural canvas textures), intentionally drab liminal look, thick
  warm fog doing the depth work. Furniture pile properly merged per material bucket.
- **Readability risk (worst arena for it)**: warm yellow/beige environment + warm-colored
  carts blend; cart neon does all the contrast work. Worth a subtle cool-tinted key light or
  slight desaturation of the wallpaper band at cart height during the retune.
- Only 2 of 4 walls have shelving (`SHELVED_SIDES`) — asymmetric sparse read.
- **Perf**: 5×5 ceiling-fixture grid = ~150 un-instanced meshes + **15-16 live SpotLights**
  (vs 5 in Classic, 1 in Zanzibar). Fixture frames/panels are a textbook InstancedMesh case,
  and most spotlights could collapse into the ambient/hemisphere rig with baked-looking
  emissive panels — biggest lighting-cost win in the game.

### Zanzibar Platform
- Most texture-driven level (1024px deck decal, hazard chevrons, sky gradient dome, animated
  sun glint). Clear silhouette, good fall-hazard readability.
- Weaknesses: islands are flat cone/box cutouts at 400m+ against a 900m ocean tile (scale
  mismatch risk); the sun DirectionalLight does not track the animated sun-disc drift;
  monochrome neon accents (single `neonMat`) vs Classic's 4-color scheme.

### Cross-cutting
- **Blob shadows are the only grounding cue in the game** — flat, non-directional, render on
  top (`depthTest:false`). Acceptable for the style; a cheap directional bias (offset/stretch
  away from the arena's key light) would add depth for near-zero cost. Real shadow maps stay
  off the table for perf.
- `sceneExtras` (the full Classic space skybox) is **constructed on every level load and merely
  hidden** on non-Classic levels (`src/sceneExtras.js:543-544`) — wasted build cost + GC churn
  per swap. Skip construction instead.
- Grocery-pool props set `castShadow/receiveShadow` (`src/effects/groceryPool.js:271-272`) but
  shadow maps are never enabled — dead flags, remove for clarity.

## 6. Effects & feedback

- **Well-engineered**: grocery spill (fully pooled InstancedMesh + pre-alloc'd Rapier bodies),
  trash burst (52-slot pool), ambient dust (single Points), crowd (InstancedMesh, batched
  updates).
- **Boost streaks** (`src/effects.js:906-958`): `new Group()` + 2 `new MeshBasicMaterial()`
  per spawn at up to 20/s/cart — highest-frequency allocator in the game. Pool it like the
  trash burst.
- **Kill-confirm is the weakest "moment"**: CSS hitmarker + shared FOV-punch + stinger. The
  ram FOV punch and kill FOV punch share one `fovPunchUntil` timestamp and clip each other
  (`src/main.js:679-701`). For a game whose identity is over-the-top spectacle, the kill
  needs: its own punch slot (max-of, not overwrite), a distinct color flash, and ideally a
  2-3 frame micro hit-stop. (Slow-mo already exists for Last Cart Standing — machinery is
  there.)
- **Screen shake is a DOM `transform` on the canvas**, not camera-space — reads flat, and
  ignores `prefers-reduced-motion` (the DOM animations respect it; shake doesn't).
- Trash burst cubes are opaque unlit boxes with no rotation — flattest effect next to the
  neon dressing; additive tint + tumble is nearly free.
- Micro-GC nits: `groceryPool.update()` allocates a Map every frame even when idle
  (`src/effects/groceryPool.js:517`); `updateDeathCamera` allocates a `Matrix4` per frame
  (`src/camera.js:435`); `src/visuals.js:43-69` is a dead duplicate of the dust update loop.

## 7. Three.js r185 features — adopt / skip

| Feature | Verdict |
|---|---|
| `OutputPass` + correct color management | **Adopt — flagship fix (§2)** |
| `NeutralToneMapping` (r162+) | **Evaluate vs ACES during retune** — better neon hue fidelity |
| AgX tone mapping | Skip — desaturates; wrong for this art style |
| Shadow maps | Skip — blob shadows fit style & budget; add directional bias instead |
| WebGPURenderer / TSL | Skip — churn with no payoff at this scene complexity |
| InstancedMesh (more of it) | Adopt — Backrooms ceiling, Classic truss |
| HDR environment texture | Skip — RoomEnvironment suffices for toy-plastic look |
| SSAO/GTAO passes | Skip — cost + darkens; contradicts bright arcade direction |

## 8. Ranked plan

### Easy wins (low risk, do first)
| # | Item | Payoff |
|---|---|---|
| E1 | Pool boost-streak groups/materials | GC/perf, zero visual change |
| E2 | Fix FOV-punch collision (kill vs ram, max-of) | Kill feedback lands reliably |
| E3 | Skip `sceneExtras` construction on non-Classic levels | Level-swap cost/GC |
| E4 | Trash burst: additive tint + tumble rotation | Cheap juice |
| E5 | Micro-GC: grocery idle Map, death-cam Matrix4, delete `visuals.js` dead loop, dead shadow flags | Hygiene |
| E6 | Camera-space shake + `prefers-reduced-motion` fallback | Feel + accessibility |
| E7 | Share wheel/lens materials within a cart (24→~14 per cart) | Memory/driver overhead |
| E8 | Backrooms ceiling fixtures → InstancedMesh; collapse most SpotLights into emissive panels + rig | Biggest lighting perf win |
| E9 | Zanzibar: sun light tracks sun disc azimuth | Coherence, ~free |

### Medium (visible, needs tuning/verification)
| # | Item | Payoff |
|---|---|---|
| M1 | **Color pipeline fix: OutputPass + tone-mapping retune + preview parity** (§2) | Whole-game upgrade; the flagship |
| M2 | Bloom retune incl. magenta compensation (§3) — folded into M1's pass | Team-color fairness |
| M3 | Kill-confirm moment: micro hit-stop + color flash + distinct punch | Best moment-to-moment payoff |
| M4 | Directional bias on blob shadows per-arena | Depth for near-zero cost |
| M5 | Backrooms player-contrast: cool key light over play space | Readability in worst arena |
| M6 | Classic pit-wall + space backdrop dressing (gradient texture, parallax nudge) | Hero-arena depth |
| M7 | Zanzibar island silhouettes (layered flat shapes + haze) | Horizon believability |

### Risky / expensive (defer, do only with explicit approval)
| # | Item | Why risky |
|---|---|---|
| R1 | Wheel mesh decimation / re-export (12k tris → ~2k) | Asset pipeline change (Draco re-compress) |
| R2 | Pattern system → shader-based mask in frame material | Touches customization contract directly |
| R3 | Second emissive-mask texture for wire glow | Asset + material contract change |
| R4 | Any theme-variety reintroduction | Product decision, not polish |

### Sequencing note
M1 (color pipeline) changes the perceived value of *every* other tuning decision — bloom,
fog colors, emissive intensities. Order: E-items first (no look change), then M1 as an
isolated, before/after-screenshotted tuning pass, then M2-M7 on the corrected foundation.

---

## Implementation status (same session, 2026-07-08)

**Done and verified** (typecheck + 61/61 vitest + knip green; all three arenas
screenshot-verified in solo matches; customize flow exercised end-to-end):

- E1-E9: all landed. E8 used static per-state-bucket merges (125 fixture meshes → 4);
  Backrooms measured ~176 fps / 88 draw calls / 0.2M verts per frame afterwards.
- M1: `OutputPass` inserted (bloom → **output** → arcade → FXAA), tone mapping switched
  to `NeutralToneMapping` (hue-preserving for saturated neon; picker in postFxDebug now
  actually works and includes Neutral/AgX), exposure retuned 0.88 → 0.62, fog hexes
  retuned per arena (`0x040112` classic, `0x1a1510` backrooms, `0xff5a22` zanzibar).
  Cart preview now shares grading via `applyRendererColorGrading()` (scene.js) — menu
  and in-game carts finally match.
- M2: bloom knee retuned (threshold 0.86 → 0.68, smoothWidth 0.055 → 0.18, strength
  0.67 → 0.6) so low-luma magenta/pink neon glows softly instead of not at all.
- E7 note: intra-cart material dedup is content-keyed (role + map/normalMap/emissiveMap
  uuids + authored color) and scoped per cart instance — identical clones share, body
  role excluded (carries `raveGltfAuthoredColor`).
- Zanzibar sun: the sun disc turned out to be static, not drifting; it now has a very
  subtle ~105 s azimuth drift with the DirectionalLight locked to it. Trivial to freeze
  again if the motion is unwanted (`SUN_DRIFT_AMPLITUDE_RAD` in zanzibarPlatform.js).

**Round 2 (owner feedback: "too bright, bloom too much — I liked how dark it was")**:
- Exposure re-dropped 0.62 → 0.46; bloom strength 0.6 → 0.45, threshold 0.72,
  smoothWidth 0.14. The dark-void identity is deliberate — do not brighten in future
  passes (recorded in project memory).
- M3 done: kill-confirm is now armFovPunch(12°, 200ms) with max-of amplitude+duration
  (ram hits use 8°/100ms), plus a 110ms center-weighted white flash via a new `uFlash`
  uniform on the Arcade FX pass, plus an aberration/vignette kick. Purely presentational
  — a real hit-stop would scale host physics dt mid-round (gameplay change, rejected).
- M4 done: cart blob shadows nudge 0.35m away from the Zanzibar sun
  (CONFIG.contactShadows.directionalBias, level identified via the existing octagon
  hazards flag); overhead-lit arenas keep centered blobs; footprint sampling still uses
  the true cart position.
- M5 done: one steel-blue DirectionalLight (0x7a8fc0 @ 0.35) raking across the Backrooms
  play space — faint cool edge on carts/furniture against the warm walls, warm-dominant
  mood preserved.
- M6 done: pit-wall gradient eased (t^2.6, 24 height segments) with a violet rim band +
  5 fading additive depth rings down the shaft; starfield gained distance-based
  brightness tiers; horizon-fog cylinder color now syncs to CONFIG.postFx.fog.color
  (was hardcoded to the stale pre-retune hex); faint violet horizon glow band added.
- M7 done: Zanzibar islands rebuilt as 2-layer atmospheric-perspective silhouettes
  (3 clusters, 4 haze tones from near-black 0x150a16 to dusty-mauve 0x77565f), moved
  inside the ocean plane (300-400m).

**Round 3 (owner feedback)**:
- Global: still too bright/bloomy → exposure 0.46 → 0.40, bloom strength 0.45 → 0.34,
  threshold 0.72 → 0.76.
- M3 softened: kill punch 12° → 9° (180ms), flash strength 1.0 → 0.6 and shader mix
  0.32 → 0.2, impact pulse 0.9 → 0.55.
- M5 carpet glow fixed: cool rim light 0.35 → 0.2 and dropped to a near-grazing angle
  (height 14 → 7, target lifted to 1.2) so the carpet's up-normal barely sees it.
- Zanzibar horizon: sky-gradient bottom stops and sun halo still used the old fog hex
  (#ff8c4a) — realigned to the retuned 0xff5a22 so ocean and sky melt together; island
  silhouettes now take scene fog (base colors darkened to compensate) so they inherit
  the same ember haze as the ocean instead of floating unfogged.
- Grocery cargo clipping fixed (src/effects/groceryPool.js createCargoBay): items were
  placed by center point; now each item's bounding-sphere radius insets the XZ spread
  and sets the Y rest height, so nothing pokes through the basket floor/walls.
- R1 (wheel decimation) and R4 (theme variety) explicitly declined by owner.
- R2 done: pattern overlay is now an `onBeforeCompile` mask injection on the CartFrame's
  own material (uniforms `uPatternMask/uPatternRepeat/uPatternStrength/uPatternTint/
  uPatternEmissive`, `customProgramCacheKey` = `cartPattern:0|1`) — the coplanar
  `CartFramePattern` duplicate mesh and its polygonOffset hack are gone; pattern swaps
  update uniforms without recompiling. Verified live: instance has zero pattern meshes,
  injected material compiles (3 programs, no diagnostics) and renders (offscreen smoke
  test, glError 0).
- R3 done: body `emissiveMap` is now a generated grayscale wire mask (channel-max
  brightness smoothstep 0.45→0.7, cached per source-texture uuid, NoColorSpace,
  ImageBitmap-aware with fallback to the old albedo-reuse if the image can't be drawn)
  — wire glow is finally tunable independent of the albedo. Verified live:
  `material.emissiveMap !== material.map` on spawned instances.

**Verification gotcha for future passes**: rAF-based FPS probes in the preview tab read
1-2 fps while the tab is occluded (Chrome throttling) — looks exactly like a perf
regression. Check `document.visibilityState` or count GL draw calls instead.
