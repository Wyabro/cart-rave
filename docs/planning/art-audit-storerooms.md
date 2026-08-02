# THE STOREROOMS — arena art-pass audit

`src/levels/backroomsSupermarket.js` (3609 lines) · six element groups audited · two verified

> **Confidence.** Two groups (shelving-and-fixtures, furniture-piles-and-props) went through a
> second agent that re-opened every constructor and re-ran the loops. Four groups
> (shell-floor-walls-ceiling, voids-markings-hazards, lighting, atmosphere-and-identity) did
> not — their verify agents died on a usage limit. **Every deficiency claim from those four is
> marked [unverified].** They are not equal-confidence findings, and where an unverified claim
> is load-bearing I have re-checked the cited line myself and said so.

---

## 1. The honest read

The Storerooms is the in-repo reference for authored surfaces and it earns that: ~9 procedural
texture builders (`:150`–`:596`) plus a floor whose vertex colours are the product of five
independent, physically-motivated wear fields — chamfer darkening, traffic lanes, ceiling drip
keyed to the real `CEILING_GAP_SPOTS`, dead-quadrant murk, and a light pool driven by the actual
`getFixtureState` grid (`:832`–`:893`). That buys it a floor that reads as a place somebody used
rather than a plane somebody textured, and it is why this arena, not Cart Rave, is the one the
art-direction doc points at when it says the question here is coverage, not "add maps."

Where it falls short is in four specific ways, and none of them is "needs more textures." First,
the builders bake **one-off events into repeating tiles** — the carpet's 2 coffee rings appear
~640 times on a perfect 3 m lattice, the wallpaper's 6 gravity drips restart mid-air every 6 m of
height ~58 times per wall [unverified]. A drip that begins at three different heights in the same
vertical column is the most legible "this is a tiled texture" tell available, on the surface that
defines the arena. Second, the **fixtures** — 74 uprights, 16 boards, 4 spawn decks — are the one
wall assembly element carrying no map at all, sandwiched between mapped drywall (`:1945`), mapped
concrete pillars (`:2122`) and mapped cartons (`:2132`). Third, a **sign bug** at `:2047` makes
41.3% of every shelf slot permanently unstockable, so half that untextured racking is naked board.
Fourth, and largest: the lighting model is roughly 96% flat hemisphere + ambient + IBL, so the
authored 44%-dead fixture grid gets flattened back out and the "islands of sick light" read is
mostly a ±9% tint painted into carpet vertices, not lighting [unverified].

The identity work, by contrast, is genuinely thorough — and the verifier found **zero mood
violations across 25 corrections.** The pull on this arena is not toward the rave. It is toward
*more*, and toward *darker*.

---

## 2. Do not touch — this IS The Storerooms

- **The mood.** Liminal fluorescent: drab, uncanny, quietly wrong. It is the brightest arena in
  the game and that is correct. It is not a warehouse rave and it is not a horror level.
- **The rave strip.** `levelUsesRaveExtras()` is `classicRecord`-only (`main.js:2405-2407`), and
  the level goes further than hiding — `boothNeonMeshes = []` (`:3401`), `spindleLight`'s two
  colour-cycle endpoints are near-identical by construction (`:3449-3453`), `recordMesh` is an
  empty detached Group (`:3457`). No future rave feature riding the shared per-frame contract can
  bleed in accidentally.
- **The VHS/CCTV layer and the near-silence.** Identity, not deficiencies. (Note: "near-silence"
  is an authored bed at gain 0.45, *raised* from 0.3 on 2026-07-16 because it read as silent.)
- **`BLOOM_DISPLAY_STOREROOMS` 0.62 / 0.4 / 0.62 / 0.1** (`scene.js:73-78`) — high cutoff, tight
  radius, strong gain. Nothing blooms but the tubes, and they glare. Bloom as a lighting
  phenomenon rather than party spill; the structural opposite of the neon profile.
- **The five-field floor wear bake** (`:832-893`) — the thing this doc measures everything against.
- **Void chamfer lips** (`:650-710`, `:1006-1047`) — a 3.8× value drop over a 3.6 m approach, with
  `getFloorSurfaceY` as single source of truth for mesh, floor slices *and* collider hulls.
- **The four void sub-room beats** (`:1153-1232`) plus the deliberately-one-step-lighter near-lip
  preview tier (`:3327`) so looking down foreshadows the fall.
- **Pit-ring dressing and the leaning stanchion** — `stanchion.rotateZ(0.55)` (`:2253`). One dead
  checkout lane against three sides of machine-repeated racking; the 90/10 rule stated and kept.
- **The furniture-pile spotlight state machine** (`:1854-1898`) — 42% dip / 10% blink / 48% no-op,
  5–14 s idle gaps, lamp and light modulating together. The in-repo model for every flicker
  proposal below.
- **The failing-fluorescent rig** — `dimMatA`/`dimMatB` on incommensurate LFO pairs so they are
  out of sync *by construction*, dead panels correctly given no real light (`:2650-2664`, `:2872-2875`).
- **The steel-blue rim's colour and heading** — `0x8aa0c8` @ `0.28` at 7.6° grazing (`:3394`;
  verified live, matches art-direction.md Rule 5 with no drift). The azimuth is fair game; the
  colour and elevation are not.
- **Blacks that are meant to be black** — pit floor `0x070708` (`:1289`), void lip `0x12110f`
  (`:2118`), shaft interior below ~−8 m. Detail there is spent effort.
- **Half-empty shelving as *intent*.** The bug at `:2047` is not the intent; the sparseness is.

Also holding up on verified review: `buildFurnitureTexture('fabric')` (900 pilling flecks + edge
wear — the one builder that meets the bar), the pile's contact-shadow blobs, the real-time spot
tier gating (8/3/2), and the decision to run no shadow maps at all.

---

## 3. Holds up

Beyond the identity list, four elements were checked hard and came back clean:

**The pile's composition** — verifier **overturned** a `reads_thin`. The audit's supporting fact
was false (nearest `CEILING_GAP_SPOTS` entry is 24 m from the pile at origin; the ceiling cell
directly above it is intact), and the central claim that "only the carpet narrates" is contradicted
by an authored tilt escalation across five layers: base 0.0–0.05 (`:1596-1609`) rising to peak
0.30–0.45 (`:1644-1646`). Pieces sit flat at the bottom and progressively askew toward the top.
That is composition-as-narration. The wishlist of 6–10 consequence props is taste.

**The pile's traffic scuff ring** — verifier **overturned** a `reads_thin`. The claimed 0.8 m
pristine gap is ~0.46 m at the pile's widest (the couch at `:1596` projects to ~3.64 m radial
support), contact-shadow ellipses already darken carpet to ~3.0 m, and the ring's 5.5 m centre is
deliberate: its outer edge at 6.9 lands 0.1 m short of the booth approach lanes gated at
`along >= 7` (`:730`), joining ring and lanes into one continuous circulation loop. The proposed
retune to `abs(r - 4.3) / 1.9` would open a 0.8 m dead gap and move the discontinuity rather than
remove it.

**The wall baseboard** — verifier **overturned** a `reads_thin` on four grounds: `0x2c2820` is
luma ~16% under a dim warm fill; it sits at |55.6| m while the play floor ends at `ARENA_HALF` 38,
so nothing comes within ~18 m of it; the shelf run stands 0.8 m in front of it and 74 uprights
break it up before any texture would; and the "eye scans it tracking carts" premise is unsupported
for a band spanning y 0–0.8, below the lowest shelf board at y 1.0. *(The unverified
shell-group audit independently called this `bare_filler` on a different argument — the 496 m run
and the fact it uses `pushBox` rather than `pushFadeBox` so it never joins the void fade. The
verifier wins: this is dropped. The `pushFadeBox` routing is a free ride-along if the shelf-steel
map ever lands, not a card.)*

**Pit floor, void lip, void sub-rooms, pit-ring dressing** — all correctly authored as silhouettes
and value ramps rather than lit surfaces. At 45.5 m under `FogExp2` @ 0.029 the pit ring is ~82%
fogged; a map there would be invisible. The vertex fade *is* the material.

---

## 4. The pass

Ranked by visual impact per unit of effort. Verified items carry more weight than unverified ones
at equal impact.

### 1. Fix the shelf-stocking negative-modulo bug — `:2047` · small · **verified** · SHIPPED `ef5b35e` · **visually verified 08-02**

`if (((lvl * 7 + Math.round(a) * 13 + side * 41) % 10) < skipThreshold) continue;` — JS `%`
preserves the dividend's sign, and `a` runs −55 → +55. The verifier executed the exact expression
across all four sides and every level: **430 of 1040 slots (41.3%) evaluate to a negative raw
modulo, and a negative is unconditionally `< skipThreshold`.** Those slots can never be stocked at
any threshold. Solving for the worst level per side gives a fully-empty region of a ≤ −3.5, −5.5,
−9.5, −11.5 — 40–47% of every 110 m run, empty at *every* shelf level. Because `wallFrame`
(`:1346-1352`) maps local −a to a different world axis per side, the bare ends form a **pinwheel**,
which is a more conspicuous machine tell than a uniform translation.

*The pass:* `((((… ) % 10) + 10) % 10)`. Corrected density jumps 329 → 612 boxes, which is denser
than the level currently looks, so retune `skipThreshold` to ~4–5 (full) / 6–7 (sparse) to hold
today's sparseness while distributing it evenly — better still, hash on `Math.floor(a / 5.1)` so
emptiness clusters at bay granularity and reads as human picking. Fix `pick` at `:2050` in the same
edit: it is the same negative-modulo family, so every negative remainder falls through to beige and
the surviving low-`a` cartons are colour-skewed. **This is #1 because it halves the visible area of
finding #4 for free** — half that untextured racking is currently naked board.

*Shipped and looked at — both halves.* `ef5b35e` landed the true-modulo fix on the *stocking*
hash but not on `pick`; that half followed as **SHELF-PICK-1**, closed 08-02 and verified on the
same camera — 12 cartons recolour, zero geometry change, and blue goes from 111 to 208 slots
arena-wide ([completed-work](./completed-work.md)). `ef5b35e` shipped on code verification alone with the
visual proof explicitly owed, because the `?shot=storerooms` bookmark does not frame the shelf
walls. **Settled 08-02:** a before/after aimed square at the side-0 wall
(`node tools/shoot-gpu.mjs --shot storerooms --cam "-12,5.3,44,-12,5.3,55"`, hardware raster
confirmed — ANGLE/D3D11 on an RTX 4090) shows **60 slots in frame, 0 stocked before, 42 after**.
The BEFORE frame is five levels of completely bare board across ~17 m of wall; the amplified ×4
diff panel is black except for ~30 clean carton silhouettes. This is a real look win, not a
correctness-only fix, and the "halves the visible area of finding #4" argument above stands with a
picture behind it. Note the density caveat: `skipThreshold` was **not** retuned, so the wall now
carries ~612 boxes where it carried ~329 — "filled in" is not "final density", and the 4–5 / 6–7
retune plus the bay-granularity hash idea both stay open.

### 2. Un-bury the furniture-pile fixture — `:1839-1848` · small · **verified** · **FIXED 08-02**

Confirmed by arithmetic, not inference. The fixture is `BoxGeometry(1.35, 0.09, 0.55)` at
`(0, 14.22, 0)`; `fixtureWorldXZ(2,2)` returns exactly `(0,0)` and `getFixtureState(2,2)` resolves
to `"dead"`. The dead ceiling panel occupies x±2.25, y[14.17, 14.27], z±0.925 — the fixture is
**strictly inside it with 5 mm clearance on every axis**, and `deadMat` is opaque with emissive
`0x000000`. So the per-frame `fixtureMat.emissiveIntensity` write at `:1897` that exists
specifically to sell the flicker renders to nobody, while warm light visibly pulses onto the arena's
centrepiece from a permanently dead panel.

*The pass:* drop `fixtureY` to `CEILING_Y - 0.75`, add a dark housing box (reuse `frameMat`
`0x3a382f`) so the emissive reads as a tube inside a fixture, and two 3 cm drop-stems to the grid.
Leave the (2,2) panel dead — a work light strung under a burnt-out fixture is a better story than a
working one.

**Done 08-02, as written, with two corrections.** (a) The housing is a **U-channel** — two sides
and a top, no floor — because a closed box re-hides the emissive the item exists to unbury. (b)
`frameMat` is scoped inside `buildCeiling`, so only its **tone** `0x3a382f` was borrowed; the new
material and the three new geometries are tracked in the function's `ownedMaterials` /
`ownedGeometries`, and the housing is parented to the strip so the existing scene-removal entry
tears it down. Panel (2,2) stays dead. **Capture, camera under the pile looking up**
(`--cam "0,3,9,0,13,0"`, ANGLE/D3D11 RTX 4090): before is a flat dark slab with the emissive
invisible inside it; after is a lit work light hanging below the dead panel, blooming the way the
tubes do. **Side-effect check, because the source moved 0.47 m closer to the pile at decay 2.4 —
the theoretical gain is ~13%:** a second before/after on the `?shot=storerooms` bookmark, which
frames the pile, comes back with an amplified diff panel that is **black apart from animated dust**.
The arena's centrepiece did not brighten measurably, which is consistent with §5's finding that
~96% of the light here is flat hemisphere + ambient + IBL. No intensity retune needed.

### 3. Give the floor decals a working LOD — `:3382` · small · [unverified, mechanism re-checked] · **FIXED 08-02 (floor decals only)**

`registerLevelLodNode(floorDecals.group, { far: 38 })`, and `levelLod.js:58` measures
`getWorldPosition` of the **group**, which both `buildFloorStoryDecals` and `buildUncannyDetails`
leave at the origin while every prop inside carries world-space coordinates. So the test is
camera-to-arena-centre, not camera-to-prop. `ARENA_HALF` is 38 and `followBack` is 8.36 m
(`config.js:448`), so a cart at (28, 28) heading inward puts the camera near 48 m — which culls the
hazard tape (38), the arrows (42) *and* the pit-ring depth cue (48) simultaneously, in one 250 ms
step, while the player manoeuvres beside a corner void. **Every positive fall marking in the arena
blinks out exactly when it is needed.** I verified the four `far` values and the `levelLod.js`
mechanism directly; this is a correctness defect in a readability system, not a taste call.

*The pass:* register per-mesh, or per-cluster (one node per void for the tape, one per blotch). At
minimum raise `floorDecals.far` past the arena diagonal (~56). It is ~22 small unlit transparent
planes and is not what costs frames.

**Done 08-02 — per-mesh, `far` unchanged at 38** (a wiring fix, not a knob turn). The mechanism
claim is confirmed by reading: `updateLevelLod` measures `getWorldPosition` of the **registered**
object (`levelLod.js:57`), and all four groups here are left at the origin while their children
carry world coords. Per-node registration was already the in-repo precedent — Sundial does it
(`zanzibarPlatform.js:2748`); Storerooms was the outlier. **Measured A/B on the live app**, not
asserted: a gitignored probe importing `/src/utils/levelLod.js` from the running dev server reads
`getLevelLodNodeCount()` **4 → 25** (3 groups + 22 decal meshes, matching the "~22 planes" above).
Two unit tests in `tests/levelLod.test.js` pin the mechanism from both sides — a container at the
origin culls even when its children are in range, a per-child node at the same camera pose does not.

**LOD-HARNESS — read this before trying to capture any LOD change.** `updateLevelLod` does **not
run in the `shoot-gpu` attract path.** Demonstrated, not assumed: hazard tape is still drawn with
the camera at 41 m from centre (past `far` 38), and from 52 m out the wet blotches *and* the
pit-ring checkout silhouette (`far` 48) are both still drawn. The call sits in the game render loop
behind `frameBudgetAllow("level_lod")` (`main.js:5167-5169`). So the before/after PNG workflow that
settled items 1 and its `pick` sibling **cannot verify this class of fix** — use the node-count
probe plus unit tests, and leave the in-frame read to a real match. Whether it is the attract path
or the budget gate was not chased; it does not change the fix.

Split out at Wyatt's call rather than folded in, so this stayed one lever: **LOD-UNCANNY-1** (the
arrows, same defect, but that group also owns physics bodies), **LOD-PITRING-1** (`pitDressing` at
`far` 48 is a ring at 45.5 m radius, so its cull radius is arguably inverted — it hides when you get
*close* to it; `doorways` shares the shape), and **LOD-CLOCK-1** (the call throttles on
host-adjusted time, so a backward clock correction stalls LOD updates).

### 4. Author the shelf steel — `:2128` · medium · **verified**

`{ color: 0xffffff, roughness: 0.78, metalness: 0.4, vertexColors: true }` — every slot checked, no
map of any kind. It is the dominant fixture on all four walls, the **largest** untextured surface in
the arena, and at metalness 0.4 riding the full RoomEnvironment PMREM at 0.6 it produces smooth
evenly-lit steel: the named "pristine untextured PBR" anti-reference.

*The pass, with the verifier's two corrections applied.* (a) Do **not** invent
`roughness: 0.86, metalness: 0.24` — the file's own painted-metal precedent is
`buildFurnitureTexture('metal')` (`:510-530`) consumed by `metalMat` at 0.72 / 0.42 *with* a map
(`:1737-1743`). Retint that builder and add a punched-slot pass; it is cheaper and keeps the level
internally consistent. (b) **Author at low spatial frequency.** The walls stand at 56 m while the
play floor ends at 38, so this is never closer than 18 m to a cart, where fog already eats 24% —
and 93% from arena centre. Rust bands, a slot ladder, chalk streaking: strong value contrast, coarse
scale. Fine grain will not survive. Break each 114 m board into per-bay segments with a 4 cm gap so
the run reads as bolted bays. Keep the 43 m fade-to-void posts and the heights — that verticality is
identity. The same map rides along on `railMat` (`:2937`), which is separately the lowest-roughness
/ highest-metalness pair in all 3609 lines and reads as the shiniest thing in a dead room.

### 5. Fix the suction telegraph — `:3193`, `:3225` · small · [unverified] → **verified 08-02** · **FIXED 08-02**

Two coupled defects on a kill mechanic. (a) The glow is dimmest exactly where the pull is
strongest: `band *= smoothstep(uInner, uInner + 0.9, cheb)` drives the ring to zero over cheb
4.30 → 5.20, which is the 0.9 m band where suction is 63–100% of `SUCTION_PEAK_ACCEL` 33 m/s²
(`simulation.js:776`). Because additive blending multiplies the colour by the alpha, added radiance
at 0.3 m from the lip is ~col × 0.0044 against ~col × 0.139 at mid-band — a ~30× difference. **The
last 0.9 m before a cart is committed is unmarked.** (b) The ring is a flat plane at constant
y = 0.03 (`:3225` — verified) while the carpet under it slopes to −0.55 across the chamfer, so at
the lip it floats 0.556 m above the surface it is painted on. Today that float is hidden only
*because* (a) zeroes the alpha there, so the two must be fixed together.

*The pass:* displace the annulus vertices with `getFloorSurfaceY(x,z) + 0.03`; narrow the inner fade
from 0.9 to ~0.25 m and clamp its floor so the lip holds ~45–55% of peak; then de-square the output
(constant alpha) so total screen brightness is unchanged or lower. **Do not touch the palette** —
the olive→sodium-amber ramp at `:3212-3217` was deliberately recoloured out of magenta in run-5
because "no rave neon," and that decision is exemplary.

**Both halves confirmed against the tree, then done 08-02.** `inner = HOLE_HALF + 0.05 = 4.30`,
`outer = HOLE_HALF + HOLE_SUCTION_BAND = 6.85`, and `SUCTION_PEAK_ACCEL = 33` m/s² falling linearly
to the band edge (`src/simulation.js:776,808`) — so the erased 4.30→5.20 metre really is where the
pull runs 63–100% of peak.

- **Geometry.** The `ShapeGeometry` (8 vertices, one flat plane) is replaced by a tessellated square
  annulus — 64 steps around × 10 rows across, ~1.3k triangles — whose every vertex takes its Y from
  `getFloorSurfaceY` + 0.03. Baked **once in hole-local space and still shared by all four meshes**
  (the chamfer is hole-relative and the voids are symmetric), and the meshes now sit at `y = 0`
  because the float and the ramp are in the vertices.
- **Lip floor, as a number in the shader:** `band *= mix(0.50, 1.0, smoothstep(uInner, uInner +
  0.25, cheb));`. Narrowing alone would not have worked — `smoothstep` is still 0 at `uInner`.
- **Paid for with the crest exponents and the output alpha, deliberately NOT with `pow(band, ·)`:**
  at the lip `band` is now the 0.50 floor, and `0.50^x` falls away far faster than mid-band ~1.0, so
  raising the band exponent would preferentially darken the exact metre this item exists to light.
  `spiral` 2.4 → 3.35, `counter` 0.35 → 0.23, alpha 0.40 → 0.36.
- **Brightness, measured rather than asserted.** Mean frame luma **73.95 → 74.12 (+0.22%)** against a
  **0.02% noise floor** (two captures of the same state). So it is *not* strictly "unchanged or
  lower" — it is measurably up by about one sixth of a luma unit on a 74-unit frame. Reaching strict
  parity costs roughly a third of the ring's total output, which guts the mid-band that already
  worked; the call was to accept +0.22% rather than pay that. **Palette untouched.**
- **Captures:** from above the void, the amber goes from faint corner blobs with a dark lip to a
  continuous band hugging the edge, and the ×4 diff is black except for that band. At player height
  the glow now lies *on* the chamfer ramp instead of floating over it. **Owed: Wyatt playtest —
  item 5 — does the lip band read as "you are committed" without becoming a game marker.**

### 6. Author the spawn deck — `:2934`, `:2948` · medium · **verified**

`{ color: 0x7c766a, roughness: 0.9, metalness: 0.05 }`, no maps, no vertexColors — 7.0 × 0.6 × 5.0 m
× 4, and it is the surface under the camera at the first frame of every match and every respawn,
viewed from ~2 m, while the cardboard crate standing on it *is* textured (`:2940`).

*The pass:* a `buildBoothDeckTexture()` in the file's own canvas idiom — worn mezzanine plate, caster
scuffs through the middle, dirt at the rail bases — assigned as `map` + `bumpMap` off one canvas
(the trick the carpet already uses at `:3269`). Plus a faded yellow-black safety stripe on the
arena-facing lip. **The verifier flagged this as the only proposal in its group introducing a
colour, and approved it**: it is industrial hazard signage in the exact vocabulary already shipping
at `:2460-2470`, and it must be authored through that same 0.35-alpha black wash so it lands drab.
It is a double win — the jump edge currently has no value break at all against warm carpet under
warm fluorescents, which is the warm-on-warm collapse the rim light exists to fight. Add a
stencilled bay letter per deck.

### 7. Fluorescent panel diffuser map — `:2650-2664` · small · [unverified]

The lit and dim panels are legitimately Rule-1 exempt as emissive, and their out-of-sync flicker is
good work. But ~11 dead panels and ~100 frame rails carry no map, and a dead fluorescent is the
closest, most-stared-at object in a liminal ceiling. Here it is a flat grey box.

*The pass:* one 256 px diffuser canvas — two soft tube bands, a lens prism grid, a few dark specks —
handed to `deadMat` as `map` and to `litMat`/`dimMatA`/`dimMatB` as `emissiveMap`, so lit panels
glow *through* the tube pattern instead of as a uniform slab. One texture, four materials, no light
changes, no colour changes. This is the highest identity-per-line item in the audit: the panels are
the arena's signature object *and* the only thing that clears the 0.62 bloom threshold, so they are
the brightest thing in frame. Let two dead panels hang askew in their grid.

### 8. Retail signage and bay codes — absent · medium · **verified**

Absence independently confirmed: a grep of all 3609 lines for `fillText`, `strokeText` and `font =`
returns **zero hits.** The arena contains no authored lettering of any kind. That is the largest
single reason 74 uprights and 16 boards read as an extruded rack rather than an inventory system
somebody used to run.

*The pass:* one 512 px atlas — stencilled bay codes, a shelf-edge ticket strip, one
"STAFF ONLY" placard — applied via the existing decal recipe (`:2332-2340`: transparent,
`depthWrite: false`, `polygonOffset: -1`, opacity ~0.45 so it reads sun-bleached). Explicitly not
neon, not emissive, not saturated: unlit paper and stencil paint is the literal opposite of party
dressing, and it deepens identity rather than adding to it. **Two verifier cautions.** The
diagnosis said "orange ticket rails" while the proposal said "faded off-white" — go off-white;
orange is warm saturation in the arena whose documented weakness is warm-on-warm collapse, so the
orange version partly defeats its own purpose. And at 18 m minimum distance a 4 cm ticket rail is
~2 px; spend the budget on the large elements (bay codes on the 74 uprights, the placard) and treat
the rails as a low-frequency value break, not legible detail.

### 9. Lift the fog colour — `config.js:573-576` · small · [unverified, two groups converge]

`FogExp2(0x1a1510, 0.029)`. The fog hex is **darker than every lit surface it covers** — carpet base
(0.76, 0.74, 0.64), wallpaper `#a89a52` under `0xe8e2c8`, ceiling `#cdc6ad` under `0xb8b29a`. So
there is no distance at which the air reads as lit: geometry does not fade *into* haze, it fades
into brown-black. Real fluorescent haze scatters and goes *pale* with distance. The cost is
concrete: the level header names "yellowed wallpaper walls set far back" as identity, and at 56 m
those walls are 93% replaced by `0x1a1510` from anywhere on the play floor. The atmosphere group's
verdict is that this currently lands closer to art-direction.md's **"oppressive horror dark"
anti-reference** than to "liminal fluorescent" — which makes this the one item in the pass that is
actively *mood-correcting*, not mood-risking.

*The pass:* move the hex toward what the air would in-scatter under sodium-white tubes — a
desaturated warm grey-olive around `0x2a2418`–`0x3a352c`, still far below the lit carpet, no
saturation added. Density is a separate question (see Open Questions). Baseline with `npm run shoot`
first and gate on Rule 3 via `npm run compare` — the 18 m ring between floor edge and wall sits at
only ~28% fog and will lift first. **This is a look call and needs Wyatt's eye in prod, not dev.**

### 10. Wet-floor blotches: fix the Y, light the material, add the sign — `:2381-2416` · medium · [unverified]

Y is hardcoded to `0.018` (`:2413` — verified) while the hazard-tape loop 80 lines below correctly
samples `getFloorSurfaceY` (`:2498`). The `[-15, 24]` blotch sits at Chebyshev 5.0 from the
`(-20, 20)` void, inside the 4.25–5.30 chamfer band where the carpet is at ~−0.157, so it floats
~0.175 m — and its 3.2 m footprint overhangs the open void by ~0.6 m. Separately the material is
`MeshBasicMaterial`, i.e. unlit, which defeats the element: wetness is a **roughness** phenomenon,
and a Basic material structurally cannot express it. In the dim quadrant an unlit stain at fixed
alpha can even sit *brighter* than the lit carpet beneath it and read as a pale patch.

*The pass:* sample `getFloorSurfaceY`; move to `MeshStandardMaterial` with the map as albedo *and*
as an inverted roughnessMap (~0.35 wet core against the carpet's 0.98) so the flickering fixtures
throw a moving sheen; rebuild the canvas at 256² with a hard mineral tide-line ring and irregular
lobes — that tide line is the single detail that sells water damage. Then add the beat the audit
correctly says is missing: **one folded A-frame wet-floor sign, lying on its side, dirty and faded,
next to the biggest blotch.** Someone put it out, it fell over, nobody came back. That is the whole
arena in one prop.

### 11. Bake the ceiling — `:2634`, `:2762-2764` · medium · [unverified]

The ceiling is the only major shell surface with **no vertex-colour layer at all**, so it has zero
large-scale variation: no murk over the dead quadrant, no brightening under the 7 lit fixtures.
Nothing lights it either — every ceiling SpotLight aims down at y 1.6 and no shadow maps exist, so a
112 × 112 m surface receives only the HemisphereLight's *ground* colour plus ambient. It reads as a
flat lid. Compounding it, the 8 water rings in the tile repeat 56× per axis (~3100 identical rings
on a 2 m lattice) on the surface a Backrooms space is most identified by, and `anisotropy` is never
set so 56 repeats will moiré at grazing angle.

*The pass:* subdivide the plane and bake vertex colours from the **existing** `getFixtureState` /
`fixtureWorldXZ` helpers — a soft pool around each lit fixture, murk over the dead 2×2 quadrant,
brown bloom at the sag and gap spots. That alone turns a lid into a lit ceiling without adding one
light. Set `anisotropy = 4`. Move the 8 water rings out of the tile. In the same pass, the two
sagging tiles (`:2764`, `bare_filler` — flat untextured `0x7a6a48` next to a mapped ceiling) get
`ceilingTex` plus a stain canvas with a **hard tide-line ring** at the edge, resized to the 1 m tile
module; and the 7 gap openings get something behind the black — 2–3 dark boxes reading as joist,
duct and conduit — so a removed tile stops reading as a hole cut in a texture.

### 12. Clamp the level's IBL — `:3275`, `scene.js:275-283` · small · [unverified, two groups converge]

`floorMat` passes `envMapIntensity: getMaterialEnvMapIntensity() * 0.08` with the comment "minimal
IBL" — and in three r185 that write is discarded, because `three.module.js:18688-18690` overwrites
`envMapIntensity` with `scene.environmentIntensity` for any material whose `envMap` is null. So the
carpet receives ~12× the IBL its author asked for, and every shell surface in the arena is filled by
a **neutral white studio room probe at 0.6** that nobody authored for this level. It lifts and
desaturates the yellowed wallpaper, and it lands on carts identically from every direction, which
works directly against the steel-blue rim's job.

*The pass:* `setEnvironmentIntensity(scene, n)` already exists (`scene.js:233-243`) and
`applyLoadedLevelSideEffects` is the existing per-arena hook — add a per-arena map alongside
`arenaExposureMul`, starting backrooms around 0.2–0.3 and restoring 0.6 on swap. Alternatively do
what `arena.js:1475-1484` already does and assign an owned `envMap` so the 0.08 clamp renders.
Probe before/after rather than trusting the estimate, and correct the now-misleading comment at
`:3263` in the same edit. **This removes fill the code already intends to remove** — it is not a
darkening decision.

### 13. De-lattice the carpet and wallpaper — `:150`, `:239` · medium each · [unverified]

Same defect twice. The carpet bakes 14 radial stains and 2 coffee rings into a tile that repeats
~25.3× per axis over the 76 m floor — so a one-off event appears ~640 times on a perfect 3 m grid.
The wallpaper bakes 28 blotches and **6 vertical gravity drips** into a 6 m tile, so the identical
drip constellation appears ~58 times per wall and restarts mid-air every 6 m of height. Water runs
down once, from a source.

*The pass:* strip the discrete features out of both tiles — keep fibre, weave, seams, damask and
banding, which are legitimately periodic — and re-issue them as world-placed decal quads at
irregular sizes and yaw, reusing the existing wet-blotch decal path so no two repeat. Wall stains
must *start* at a ceiling or pipe height and run down. Switch the carpet builder to `makeRng(seed)`
— it is the only one of the nine using bare `Math.random()`, contradicting `makeRng`'s own docstring
at `:98-101`. This pays for itself against item #3: the floor-decal group needs more content anyway.

### 14. Give the three hero PointLights lamps — `:2851-2863` · small each · [unverified]

All three of the arena's most characterful lights emanate from empty air. `heroBuzz` (`0xffe2a8`,
16) sits 4.9 m from the nearest fixture centre, and that cell is dead — "ballast buzz made visible"
requires seeing the tube. `heroSick` (`0xb8c9a0`, 7) is 4.75 m from a cell wearing a *warm* panel,
so there is no green source anywhere. `heroCool` (`0x9eb8d8`, 9) pours cool light out of a pure-black
`0x08070a` quad, which reads as a lighting bug rather than a lit plenum. All three also hang
0.42–0.6 m below the tiles at decay 2, blowing clipped discs onto blank ceiling.

*The pass:* move `heroBuzz` to the real cell centre `(-13.3, 13.3)` and convert that cell dead → dim
so it has a panel; retint one panel's material to the sick-green tone for `heroSick` (a fourth
bucket costs one merged mesh in the existing path); give `heroCool`'s gap a shallow dark box with a
faintly cool-lit back face, the trick the void sub-rooms already use. Drop all three 1.5–2 m so they
stop washing the ceiling. Keep the colours and keep `heroBuzz` in the dead quadrant — one tube still
fighting in the dark corner is the best beat in the arena.

### 15. Cut the kill edge — `:664`, `:1308-1332` · small · [unverified]

The carpet map and its UVs run continuously over the perimeter lip and terminate against black with
no edge condition at all. A floor that ends has a slab section, exposed backing, a bent metal edge
strip. Right now the world's most dramatic edge — the one that kills you — is a texture that simply
stops. Same at the four void mouths.

*The pass:* one merged 0.12 m vertical fascia band around the perimeter carrying the concrete map,
with a thin dark carpet-backing line along its top, extended to the void mouths. One draw call, one
hard high-contrast horizontal line at the exact commit point, nothing below −2 m changes. Pair with
switching `getHoleApproachScuff` (`:812-822`) from Euclidean to Chebyshev — it currently draws a
*circular* ring around a *square* hole, hugging the corners and bowing 2.2 m off the face midpoints
— and raise its applied weight from 0.12 (`:885`, verified) to ~0.3 so it renders at all.

### Behind those

Verified, small, worth doing when touching the pile: **`bakePileWear`** (`:1757-1770`) reads exactly
one input — `y` — so two chairs at the same height are bit-identical in grime and no crevice is
darker than an exposed face; add per-piece XZ hash jitter, up-face dust off the normal, and radial
crevice darkening, all inside the same loop at zero draw-call cost. **`buildFurnitureTexture('wood')`**
and **`('metal')`** contain material identity but literally zero wear — no mug rings or pen scoring
on 10 up-facing desk tops the spot hits directly; no rust, chipping or seam grime on the steel; both
can reuse their own canvas as `bumpMap` at ~0.01 the way the carpet already does. **`('plastic')`**
resolves to ~0.04 effective albedo, so the pile's *densest* geometry — 24 individually-modelled
drawer fronts with 24 handle boxes — disappears into black; lift `darkMat.color` toward `0x8c877e`
and add sticker ghosts. **Pile UVs** (`:1521-1528`): `applyMatrix4` never rewrites `uv`, so a
4-rivet large-panel motif lands whole on a 9 cm chair leg — an 11× texel mismatch; the carpet
already solves this by baking world-scaled UVs (`:874-875`). **The chair** is the pile's most
repeated piece (16 calls) and has four straight legs where a 5-star caster base would be the single
biggest silhouette win available. **The "slumped endcap"** (`:2058-2066`) provably cannot slump —
both emitters force `_pushQ.identity()` — and worse, the box spans y 0.20–0.90 while the board spans
1.03–1.17, so a board floats above a floating box with a 13 cm air gap; the rotation-capable pattern
is 200 lines away at `:2251-2258`. **The 329 shelf cartons** have zero yaw, zero tilt, zero scale
jitter and the same barcode in the same place on all six faces of every box, while the booth crates
30 m away vary count, yaw and scale for free. **The booth divider** (`:2944`) is the brightest
*untextured* plane on the booth and `buildFurnitureTexture('fabric')` — literally a cubicle-panel
weave — is a two-line call away. **The monitor** (verifier-downgraded `bare_filler` → `reads_thin`)
carries `plasticTex` but its screen face is the same material as its back; one `screenMat` at
roughness 0.14 makes a dead CRT out of the arena's most on-theme prop.

Unverified and cheaper than they look: **pillar UVs** (8.3:1 stretch turning 1–2 px pores into
~1.3 × 10.7 cm streaks, plus a base dust gradient tiling 4× up the shaft so "dust at the base" lands
at y +6.3 m and +17 m), **`anisotropy = 4`** on the concrete and ceiling builders to match the other
three, **drywall `xSegments` 1 → ~24** so one stretch of wall can be dirtier than another and the
dead-side tint stops being a hard whole-wall step at the corners, **the wall↔ceiling angle trim**
(nothing exists; the two planes interpenetrate by 4 cm along the room's most visible horizontal
line), **hazard tape** (a uniform 35% black wash over mathematically perfect stripes, marking 14% of
the void perimeter from 1.5 m back), **caster ruts** (flat untextured `MeshBasic` quads on a carpet
carrying albedo + bump + a five-field bake), **the arrows** (3 across 76 × 76 m, at half the carpet's
texel density, with erosion punched uniformly instead of consulting the `getTrafficWearFactor` field
the file already computes), **the dummy spindle** (`:3449-3453` — a dead light slot; repurpose it
under a dim cell driven by the flicker envelope so one failing panel finally throws stuttering light
on the carpet), **the fog's two write paths** (`:3257` bypasses `setSceneFog`'s live-state and clear
colour; delete it before any retune lands), and **an explicit `backrooms` entry in
`arenaExposureMul`** — even at 1.0, authored-and-recorded beats inherited.

---

## 5. Readability — is the steel-blue rim enough?

**No, not on its own.** The light is doing exactly what its comment claims and the geometry backs it:
`DirectionalLight(0x8aa0c8, 0.28)` at `:3394` (verified live, matching art-direction.md Rule 5 with
no drift from the documented figure), direction (0.783, −0.133, −0.609) — 7.6° above horizontal, so
the "near-grazing" claim is accurate. Against a carpet up-normal the dot is 0.133 → ~0.037 on the
floor, while a vertical cart face square to it takes up to the full 0.28: **~7.5× more on the cart
than on the carpet.** That is the right design. It buys cart separation without tinting the floor
blue, and on the lit side it moves the cart's R:B ratio from ~1.60 to ~1.22.

Three things limit it [unverified]:

**The azimuth is fixed and the camera is not.** The light is world-fixed while the chase camera
orbits freely, so across a full orbit it lands on the cart's camera-facing side as *fill* about as
often as it lands on the silhouette edge as *rim*. A device that only fires from some azimuths
cannot be Rule 5's answer. The tell is in the history: 0.28 has already drifted up from the
shipped-M5 0.2 chasing this same problem, which says the **angle**, not the intensity, is the limit.
Do not raise it further — that is what washes the carpet blue.

**A white studio probe is re-filling the shadow side.** The RoomEnvironment PMREM at 0.6 lands on
carts identically from every direction (item #12), so it fills exactly the side the rim is trying to
darken, and desaturates the cart while it does. Clamping the level's env intensity is arguably a
bigger Rule 5 win than anything done to the rim itself.

**Everything else in the room is flat.** With hemisphere + ambient + IBL supplying ~96% of the light
and each ceiling spot lifting the carpet ~3%, carts sit in a directionless wash with no modelled
falloff and no defined ground contact. The rim is the only directional cue in the arena.

*The fix:* make the azimuth camera-relative — re-aim `coolRimLight.position`/`.target` each frame
from camera yaw with a ~120–150° offset so the cool edge always falls away from the viewer — or add
a second opposed grazing directional at ~0.18 so an edge exists from any azimuth. Keep `0x8aa0c8`
and keep 7.6°. Measure with Rule 5 before and after.

Separately, three items in the pass are readability work in their own right and should be counted
as such: the suction telegraph (#5), the spawn-deck lip stripe (#6), and the kill-edge fascia cut
(#15). The off-white-not-orange signage correction (#8) is the same argument in miniature — adding
*warm* colour to a warm room to fix a warm-on-warm problem does not work.

---

## 6. Dropped proposals

**The verifier flagged zero mood violations across 25 corrections.** Nothing in the two verified
groups pushes this arena toward the rave. That is worth knowing on its own: the gravitational pull
here is not "make it a party," it is "make it *more*" and "make it *darker*."

Dropped by me, policing the four unverified groups:

- **Raising `deadMul` from 0.14 to 0.35–0.5** (`:884`, lighting) — justified as "the uncanny read
  wants that corner to be a place you lose a cart in." Dropped: that is horror-dark reasoning *and*
  an outright readability regression. Losing a cart in a corner is a gameplay defect wearing mood as
  a costume. Keep the paired `poolMul` raise (`:886`) — brightening under working tubes is pure win
  — and leave the dead quadrant at 0.14.
- **Taking `AmbientLight` to zero** (`:3388`, lighting) — the proposal's own text says to check that
  "the furniture pile interior, the booth undersides and the aged shelf bays don't crush to pure
  black." Zero is the version where they do. Capped at ~0.3, and only paired with a raise to the
  hemisphere's ground colour so downward faces get contact shading rather than nothing.
- **Orange shelf-edge ticket rails** (`:2298` region, shelving) — verifier-corrected to faded
  off-white. Orange is warm saturation in the arena whose documented weakness is warm environment
  plus warm carts collapsing.

Two more that are not mood violations but should not land as written:

- **A lone office chair standing on the play floor** (furniture group). The verifier flagged that
  this repeats the exact mistake the file records: the EXIT post "originally lived on drivable
  carpet with a collider and wedged carts (playtest 2026-07-15)" (`:2299-2301`). Colliderless, or
  off the drivable surface, or not at all.
- **Retuning the pile's scuff ring to `abs(r - 4.3) / 1.9`** — verifier-refuted. It would open a
  0.8 m dead gap between the ring and the booth approach lanes, moving the discontinuity rather
  than removing it.

---

## 7. Open questions for Wyatt

1. **Should the CRT/arcade pass be pushed harder once ART-FILTER-1 makes it Storerooms-exclusive?**
   Today `uAberration 0.003 / uScanlineDensity 1.8 / uVignette 0.5` are written **once**, at
   composer construction, from global config (`scene.js:1168-1175`) — `applyLoadedLevelSideEffects`
   gates VHS, exposure, bloom, dust and fog, and writes nothing to the arcade uniforms. So these
   numbers were tuned to be inoffensive across three arenas. Once exclusive they are no longer a
   compromise and probably should not stay at compromise values. **One thing must be fixed before
   the amplitude is touched:** the scanline is `sin(gl_FragCoord.y * 1.8) * 0.018` in *raw device
   pixels* — a 3.49 px period, which is sub-pixel-scale on a 2× display and aliases into moiré
   rather than reading as a CRT line. Express it in device-independent units (× `getPixelRatio()`)
   first, then re-judge amplitude and the >50% corner vignette. My read: yes, push it — this is the
   one arena where the filter means something — but the unit fix lands first or pushing amplitude
   just makes the moiré louder.
2. **Fog: colour only, or colour and density?** Both unverified groups want the hex lifted out of
   `0x1a1510`. Only the atmosphere group wants density pulled 0.029 → 0.018–0.020; the shell group
   explicitly says the density knob belongs to ART-EXPO-1 and should not move in an art pass. The
   short sightline is identity either way. Your eye, in prod, with a `shoot` baseline first.
3. **Is the lighting rebalance one card, or off the table?** Making the 7/7/11 grid load-bearing
   means moving hemi (1.38), ambient (0.7), env (0.6) and spotIntensity (11) *together*, in one
   commit, at constant mean brightness. Done right it is a redistribution. Done piecemeal it is the
   failure mode in §8. Do you want it attempted, and do you want to be at the machine for it?
4. **Does the VHS layer get to be more noticeable, and does CCTV chrome belong in the HUD?** At
   `uVhsAmount 0.3` the whole layer is ±0.21 px jitter, ±3.8/255 grain, and roughly one 6.6 px tear
   per 150 s round. The proposal deliberately does **not** raise the amount — that is where the
   readability cost lives — and instead adds chroma smear (the single most identifiable VHS trait,
   and free in readability terms because it never moves luma edges), a permanent head-switching band
   in the bottom ~1.5%, and a camera-ID + running timestamp as a DOM element gated on levelId. Is
   the timestamp atmosphere, or is it UI clutter?
5. **The ambience bed came back literally `unverified`** — the agent could route-check it
   (`backrooms_bed` @ 0.45, one track, no hype layer, `arenaCatalog.js:47-59`) but could not listen.
   Does it read as a specific room — ballast hum, distant HVAC — or as an anonymous pad? The exhaust
   fan is visibly turning at 2π/5.2 rad/s (`:2829-2847`); if it is audible but unsynced to the
   visible rotation, that is a free, mood-correct tie-in.
6. **How much loose prop density do you actually want on the drivable floor?** Multiple proposals
   want props out there (chair, mop bucket, toppled bin, more arrows, more decals). The arena's
   identity is partly *emptiness*, and the EXIT post was deleted for wedging carts. Where is the
   line?
7. **Pile peak: physics card or art card?** Carts rest ~0.72 m above the highest visible chair — the
   ball cap is r 0.51 at y 5.695 (`:1704-1710`) while the top chair reaches ~5.48 m. The verifier
   confirmed the gap but called it a physics defect, not an art-pass finding.

---

## 8. What this pass must not become

**The failure mode is not neon. It is the stack.**

Three groups that never talked to each other independently proposed darkening this arena: pull the
hemisphere 1.38 → 0.6–0.8, pull ambient 0.7 → 0.2–0.3 or zero, pull env 0.6 → 0.2–0.3, raise
`deadMul` 0.14 → 0.35–0.5, raise traffic-lane darkening 0.14 → 0.30 with a 0.10 backing core. Each
is individually defensible. Landing them together is how The Storerooms stops being the brightest
arena in the game and becomes a horror level — and "oppressive horror dark" is a named
anti-reference, not a stylistic preference. **This arena is over-lit and indifferent. It is not
dramatic.** If the room ever reads as "pools of light in a dark place," that is a horror film and
the pass has failed. The correct read is a room that is *too evenly lit for how empty it is* — and
notably the single highest-impact atmosphere item in the whole audit (#9, the fog colour) moves in
the **opposite** direction, toward pale luminous haze. If the rebalance lands and the fog lift does
not, the net effect is straightforwardly wrong.

**Second failure mode: "uncanny" as a licence to add.** This audit produced 30+ proposals. The
Storerooms' identity is emptiness, near-silence, and half-abandoned stock. Every prop placed on the
play floor is a prop that is not empty. The elements that hold up best — the leaning stanchion, the
single dead checkout lane, the four void sub-rooms, the one fallen wet-floor sign — all work because
they are *singular*. The 90/10 rule documented at `:2172-2176` is the constraint: machine-repeated
dressing with a single human anomaly. Ten anomalies is not ten times as uncanny; it is set
dressing.

**Third: the beam volumes drifting additive.** Light shafts under the fluorescents are the defining
Backrooms image and are legitimately on the table — but Cart Rave's searchlight cones were deleted
(`effects.js:1732-1733`) precisely because they were `toneMapped: false` additive meshes writing HDR
white. The guard is non-negotiable: `NormalBlending`, `toneMapped: true`, peak alpha clamped well
below the panel emissive so it never blooms, `depthWrite: false`, driven off the existing tier
budget. Sick fluorescent haze, not god rays.

**Fourth: markings drifting saturated.** Every marking proposal in this document is currently
self-policed — faded off-white, 0.35–0.5 opacity, drab, through a 0.35-alpha black wash. The moment
one of them lands at full value, the arena has *game markers* instead of facility paint nobody has
repainted, and readability has been bought with mood.

**Fifth, quietly: the CRT layer becoming a flex.** Once ART-FILTER-1 makes it exclusive there will
be pressure to make it *look cool*. It is a surveillance artefact on a room nobody is watching. It
should read as a tape nobody rewound, not as a style.
