# SUNDIAL STATION — arena art-pass audit

**Scope:** `src/levels/zanzibarPlatform.js` (~2760 lines), plus `src/effects/waterDeathFx.js`,
`src/contactShadows.js`, `src/config.js`, `src/scene.js`, `src/effects.js`.
**Mood contract:** golden-hour offshore platform. Warm, open, not dark. `arenaExposureMul.zanzibar = 1.32`
([`config.js:501`](../../src/config.js:501)) is correct behaviour, ratified in
[`docs/reference/art-direction.md`](../../docs/reference/art-direction.md).

---

## 1. Where Sundial actually stands

**One of six audit groups never came back — `sky-sun-and-env` was lost to the usage limit, so the sky
and sun were only ever inspected sideways, by three other groups that happened to bump into them.**
Setting that aside, the prior held: Sundial is the most authored level in the game and almost nothing
in it is lazy — the deck ships albedo *and* roughness, the water-death FX are the densest effect work
in the repo, and the hologram's outer glyph band is a genuinely three-dimensional construction rather
than a decal. The dominant failure mode here is not bare surfaces; it is **authored work dialled below
the threshold where it can be seen, and two coordinate/mapping bugs that quietly invert the whole
frame's value structure.** The sky's entire ember gradient renders *below the opaque waterline* and is
never visible, which simultaneously starves the sky, hard-lines the horizon, and makes every distant
silhouette read 7–10× brighter than the sky behind it — the mechanical cause of the long-standing
"cutout" complaint. Fix that one canvas builder and a large fraction of this document evaporates.

**Confidence: low, uniformly.** Zero verifier passes survived this run (see §2), so *every* deficiency
claim below is single-source and marked `[unverified]`.

---

## 2. Coverage gap

**Missing group: `sky-sun-and-env`.** Five results returned — `deck-and-podium`, `ocean-and-water`,
`distant-scifi-dressing`, `holo-elements`, `lighting-and-atmosphere`. The sixth never produced a
result. **No verifier results returned either** — the journal contains five `{group, elements}`
payloads and zero `{group, corrections}` payloads. There is therefore nothing to overturn, no
`upheld:false` correction, and no `mood_violation:true` flag anywhere in the data. That is not
reassurance; it means nothing was checked twice.

Consequences, stated as a gap to fill rather than an absence of problems:

**Sky/sun elements that *were* covered, incidentally, by other groups** — treat these as
single-angle looks, not as a sky audit: the sky dome gradient (twice, from
`lighting-and-atmosphere` and `distant-scifi-dressing`), the sun disc
([`:1047-1070`](../../src/levels/zanzibarPlatform.js:1047)), the two sun halos
([`:1076-1115`](../../src/levels/zanzibarPlatform.js:1076)), the god-ray shafts
([`:1117-1155`](../../src/levels/zanzibarPlatform.js:1117)), the horizon haze cylinder
([`:1157-1184`](../../src/levels/zanzibarPlatform.js:1157)), the sunset fog
([`config.js:571`](../../src/config.js:571)), the sunset IBL equirect
([`:577-609`](../../src/levels/zanzibarPlatform.js:577)), and the ambient dust field
([`effects.js:96-98`](../../src/effects.js:96)).

**Never looked at by anyone:**
- **The five gulls** ([`:1598`](../../src/levels/zanzibarPlatform.js:1598)). They appear exactly once
  in the entire dataset — as a line item in the Low-quality stripping list. Nobody opened them. On an
  offshore platform the birds are a primary life cue and they are completely un-audited.
- **The 34-star field and the jet contrail** ([`:517-568`](../../src/levels/zanzibarPlatform.js:517)).
  Their landing elevations were computed as a side effect of the gradient analysis (stars at +46° to
  +90°, contrail +23° to +38°, against a 55° fov that tops out near +27°) but neither was ever audited
  as an element — nobody judged star density, distribution, contrail authoring, or whether either
  belongs in a golden-hour sky at all.
- **Cloud or cirrus layers.** No agent mentions clouds anywhere in 172 KB of results. Whether Sundial
  has any cloud layer beyond the four stratified haze bands baked into the sky canvas is **unknown and
  unaudited**.
- **Sky dome geometry budget.** `SphereGeometry(480, 32, 16)` dropping to `20x10` on Low
  ([`:1031`](../../src/levels/zanzibarPlatform.js:1031)) was noted in passing; the relationship
  between `SKY_RADIUS` 480, `WATER_SIZE` 900, and camera far 1000
  ([`scene.js:938`](../../src/scene.js:938)) was never examined as a composition question.
- **Sun drift as an authored behaviour.** `±0.015 rad` ([`:115`](../../src/levels/zanzibarPlatform.js:115))
  and the 500 ms `SUN_STEP_MS` quantization were each mentioned in service of other findings. Nobody
  audited whether the drift reads at all, or whether the 500 ms step visibly staircases the sun the way
  it demonstrably staircases the orbital gate's dot pulse.

**Do not present the sky as clean.** It is the single largest surface in every frame, three separate
groups independently found a mapping bug in it, and its dedicated audit is the one that never ran.

---

## 3. Do not touch — this IS Sundial Station

- **The open octagon and its eight kill edges, un-chamfered.** `CylinderGeometry(circumR, circumR, 0.6, 8, ...)` at [`:1793`](../../src/levels/zanzibarPlatform.js:1793); collider is four rotated cuboids at `halfLength = apothem` ([`:961-979`](../../src/levels/zanzibarPlatform.js:961)) — exact agreement. The missing chamfer is deliberate: a clean fall, not an assisted lip.
- **The centre podium frustum and its 9.8° drivable ramp.** [`:1944-1950`](../../src/levels/zanzibarPlatform.js:1944). Every downstream system reads `PODIUM_BASE_R`; the shape is load-bearing for scoring and AI, not just look.
- **Caution yellow `0xffb400` and the warm amber family.** [`:1968-1978`](../../src/levels/zanzibarPlatform.js:1968). The unification away from pink/cyan is the ruling, not the weakness. One shared material across six fixture classes is what makes the station read as one installation.
- **Sunset fog `0xff5a22` @ `0.00355`.** [`config.js:571`](../../src/config.js:571). 68% mix at 300 m, 92% at 450 m — the ember melt is doing the arena's heaviest lifting.
- **Exposure 0.4 × 1.32 = 0.528.** [`config.js:503-505`](../../src/config.js:503). Ratified. Not a violation.
- **The sun disc at opacity 0.85.** [`:1047-1070`](../../src/levels/zanzibarPlatform.js:1047), carrying the owner's own trim ("a bit too bright") in an annotated comment. Key and disc breathe on a phase-locked 11.4 s cycle.
- **Ocean hex `0x14242c`.** [`:1015`](../../src/levels/zanzibarPlatform.js:1015). "Deep ink with a warm bias" is authored identity — the *shading model* around it is the problem, never the hex.
- **The deck's wear vocabulary.** 46 traffic scuff arcs, four octagon plate-seam rings, 144 bolts with rust bleed, the hazard band ([`:157-301`](../../src/levels/zanzibarPlatform.js:157)). This is the wear language the art direction describes, authored before it was written down.
- **The under-deck rim glow.** [`:2048-2070`](../../src/levels/zanzibarPlatform.js:2048), additive `0xff7a28` @ 0.16. Makes the fall line beautiful rather than merely dangerous, and stays restrained.
- **The painted energy conduits.** [`:234-261`](../../src/levels/zanzibarPlatform.js:234) — amber, three-tier glow/core/junction, and physically backed by raised conduit boxes at the same eight angles.
- **The islands' two-layer structure and the horizon's azimuth spread.** [`:1273-1297`](../../src/levels/zanzibarPlatform.js:1273). Coverage spans −2.4 to +3.05 rad with one ~48° gap — correct for an arena you look outward through on all eight sides.
- **The ringed gas giant's placement.** [`:1478-1555`](../../src/levels/zanzibarPlatform.js:1478), 21.8° elevation against a chase camera that tops out near 27°, anti-solar, `fog:false`. Correctly reasoned and load-bearing as the "not on Earth" signal.
- **The water-death FX.** [`waterDeathFx.js:773-1642`](../../src/effects/waterDeathFx.js:773). The only water element that actively reconciles itself with golden hour — victim neon lerped 45% toward `_warmGlow = 0xff9040`.
- **The outer glyph band.** [`:2190-2207`](../../src/levels/zanzibarPlatform.js:2190). `openEnded` + `DoubleSide` + additive means you see the far wall's glyphs through the near wall's, counter-scrolling — real parallax volume.
- **Cart blob shadows.** [`config.js:589-601`](../../src/config.js:589). Owner-ruled in run 6: same flat circle under every cart, no ellipse, no height shrink, no per-arena bias. Out of play entirely.
- **The water sun-path glint, as a concept.** [`:1186-1223`](../../src/levels/zanzibarPlatform.js:1186). It needs work (§5, §6) but the light path on the water *is* the golden-hour identity. Do not delete it.

---

## 4. Holds up

Short list, with the evidence that earned it:

The **water-death entry splash and depth burst** ([`waterDeathFx.js:773-1189`](../../src/effects/waterDeathFx.js:773),
[`:1201-1642`](../../src/effects/waterDeathFx.js:1201)) — fourteen coordinated layers, droplets with
real ballistics at 22 m/s² *and* a surface bounce at `v.y *= -0.28`, correctly quality-tiered, warm-lerped
to the arena. The **ripple overlay shader** ([`:534-622`](../../src/effects/waterDeathFx.js:534)) — hand-written
GLSL with two documented NaN guards and a program-cache warmup anchor, both fixes for problems that
actually bit. The **three counter-rotating holo rings** ([`:2229-2255`](../../src/levels/zanzibarPlatform.js:2229))
— three radii, three tube gauges, two directions, one deliberately tilted with a slow wobble; bare
colour is the *correct* call at 35–55 mm tube radius. The **sun disc and its two halos** — the archived
"cross-flare near the sun" concern is resolved in shipped code: soft-limbed disc texture
([`:1047`](../../src/levels/zanzibarPlatform.js:1047)), alpha-graded haze strip
([`:1162`](../../src/levels/zanzibarPlatform.js:1162)), radial-falloff shafts
([`:1124`](../../src/levels/zanzibarPlatform.js:1124)). The **AmbientLight `0x2e2438` @ 0.48**
([`:2715`](../../src/levels/zanzibarPlatform.js:2715)) — 11% of the deck's light budget but 100% of its
shade-side hue; the one light doing correct golden-hour colour theory. The **beacon blink**
([`:2449-2450`](../../src/levels/zanzibarPlatform.js:2449)) — `0.4 + pow(max(0,sin), 14) * 2.8` is a real
aviation profile, not a sine. The **centre-cluster support pillars**
([`:1907-1923`](../../src/levels/zanzibarPlatform.js:1907)) — the one `panelTex` application in the whole
level whose UV aspect is actually square. And the **podium base guide lights**
([`:2079-2095`](../../src/levels/zanzibarPlatform.js:2079)), quarter-buried so they read as recessed
fixtures rather than glued-on boxes.

---

## 5. The pass

Ranked by visual impact per unit of effort. **Every item is `[unverified]`** — no verifier pass
survived this run. Where a finding carries unusual weight (measured against a committed capture, or
independently reached by more than one group) I say so.

### Tier 1 — small effort, whole-frame consequences

**1. Remap the sky gradient so the ember band lands above the waterline.** `[unverified]`
[`:517-568`](../../src/levels/zanzibarPlatform.js:517), builder `buildSkyTexture`.
Three's `SphereGeometry` pushes `uv.y = 1 - v` and `CanvasTexture.flipY` defaults true, so canvas
`t = 0` is the zenith and `t = 0.5` is the horizon. The seven gradient stops put `#c94a32` at `t=0.74`,
`#e86830` at `t=0.86` and the fog-matched `#ff5a22` at `t=1.0` — landing at **−43°, −65° and −90°
elevation**, permanently behind an opaque ocean. All four stratified haze bands land at −22° to −55°;
the 34 stars land at +46° to +90° against a 55° fov that tops out near +27°. What actually renders
above the horizon is `t = 0 → 0.51`: indigo to plum, roughly `rgb(13,0,17)` to `rgb(43,2,23)`. The
comment at [`:530-532`](../../src/levels/zanzibarPlatform.js:530) claims the last stop prevents "a seam
at the waterline"; the stop is at the *nadir*, so it produces exactly the seam it was written to
prevent. **Measured in `shots/run3-sundial.png` row 0: sky `[53,5,24]` directly above water
`[240,82,31]` — a 187-level step in red.** Three independent groups reached this finding.
*The pass:* recompress the stops into `t = 0 → 0.505` (approximately `0.0 #060318`, `0.18 #1a0a32`,
`0.30 #4a1538`, `0.38 #8a2848`, `0.44 #c94a32`, `0.48 #e86830`, `0.505 #ff5a22`, then hold `#ff5a22` to
1.0); move the four haze bands from canvas y 160–206 to ~y 118–135; drop the stars to y 0–110. Re-shoot
and confirm the waterline step falls from ~187 levels to under ~30. **Effort: small — a ~15-number edit
in one existing builder, no new textures, no geometry.** This is the enabling fix for items 5, 20, 21,
22 and 23 below.

**2. The IBL sun blob is 180° from the sun.** `[unverified]`
[`:598`](../../src/levels/zanzibarPlatform.js:598). The builder writes `sunU = (SUN_AZIMUTH / 2π) * w`;
three's `equirectUv()` reads `u = atan(dir.z, dir.x) / 2π + 0.5`. With `SUN_AZIMUTH = 2.4504 rad`,
authored `u = 0.390` against correct `u = 0.890` — a half-texture offset. The vertical axis is correct;
only azimuth is wrong. For a `metalness 0.82` ocean the environment map *is* the water's look, so the
sea's warmest reflected spot currently sits on the **anti-sun** side of the platform. The dismissive
comment at [`:596-597`](../../src/levels/zanzibarPlatform.js:596) ("exact phase is irrelevant for
reflections") is true for a chrome prop and false for the sea at golden hour.
*The pass:* `const sunU = ((SUN_AZIMUTH / (Math.PI * 2)) + 0.5) % 1 * w;`, drawn wrapped at the seam
using the same trick already in `buildWaterNormalTexture` at [`:633`](../../src/levels/zanzibarPlatform.js:633).
**Effort: small — one line.**

**3. The ocean is a teal-tinted black mirror because it is authored as a metal.** `[unverified]`
[`:1015-1022`](../../src/levels/zanzibarPlatform.js:1015). `metalness: 0.82` over linear albedo
`(0.0075, 0.0175, 0.0265)` gives diffuse = albedo × 0.18 ≈ zero, and blended F0 =
`(0.0134, 0.0216, 0.0289)` — **below a plain dielectric's 0.04 in red, and tinted teal**, in the arena
whose identity is warm amber. The authored "deep ink with a warm bias" hex contributes 18% to diffuse
and otherwise acts as a specular tint. Measured off the deck edge in `shots/run3-sundial.png`:
`[7,1,1]` falling to `[1,0,0]`. This is the mechanical reason an additive glint plane had to be bolted
on — the physical sun path was suppressed at the material level.
*The pass:* keep the hex. Change the model: `metalness 0.0–0.05` and let `ior 1.333` supply water's real
F0. Re-judge near-water luma against the deck afterward, then retune `envMapIntensity`/exposure —
in that order, since reflection strength will jump. **Effort: small (one knob) plus a look pass.**

**4. The water's authored detail is dialled below the visible threshold — three numbers.** `[unverified]`
The normal map ([`:618-671`](../../src/levels/zanzibarPlatform.js:618)) is genuinely authored — 110
wrap-offset bumps, a hand-written Sobel pass — and then `normalScale (0.22, 0.22)` reduces the surface
tilt to **~0.13°**, with no `anisotropy` set (defaults to 1), so mip filtering erases the remainder
past ~20 m at the grazing angles this plane is always viewed at. The foam ring
([`:1616-1636`](../../src/levels/zanzibarPlatform.js:1616)) has 420 correctly-placed blobs whose peak
on-screen alpha is texture α (≤0.15) × material opacity (≤0.16) = **0.024**. The wave drift
([`:1671-1674`](../../src/levels/zanzibarPlatform.js:1671)) resolves to **0.19 m/s** resultant, moving a
pattern you cannot see.
*The pass:* `normalScale` → 0.6–0.9 *and* Sobel `strength` 2.2 → 4–6; add
`waterNormalTex.anisotropy = renderer.capabilities.getMaxAnisotropy()`; foam material opacity → 0.45–0.6
with per-blob α ceiling → 0.35; drift 3–5× to 0.6–1.0 m/s with clearly different x/y rates. Tune as one
pass, judge in a **prod** build. **Effort: small.**

**5. Seven settlement lights are 100% buried inside a solid island.** `[unverified]`
[`:1299-1328`](../../src/levels/zanzibarPlatform.js:1299). The lights spawn at azimuth
`SUN_AZIMUTH+0.55 ±0.05` at 296–306 m; the near island's first cone sits at *exactly* that azimuth at
300 m with scale `(76, 37, 76)`. A 200,000-sample test against the cone's radius at each sample's own
height puts **100.00% of samples inside the cone volume, minimum clearance 46.4 m**. The cone is opaque
and depth-writing; the points are `depthWrite:false` but depth-*tested*, so they fail against a surface
~70 m in front of them. The comment claims they "punch through the haze"; they never render at all.
Because these are the **only warm point lights on the entire horizon** — the gate (`0x8fd9ff`), city
windows (`0x9fe8ff`) and ship glows (`0x7ad9ff`) are three near-identical cool cyans — the horizon's
point-light palette is currently monochrome cyan.
*The pass:* sample distance from ~224–236 m (the cone's near flank) instead of 296–306; widen azimuth
jitter from ±0.05 to ±0.22 rad so seven dots spread across the island's real 228 m width; stagger y;
add a slow per-dot flicker in the existing 500 ms block. **Effort: small. Cheapest high-value fix on
the horizon.**

**6. The hazard band sits four metres inboard of the edge it is warning about.** `[unverified]`
[`:276-287`](../../src/levels/zanzibarPlatform.js:276). `octPath(apothem − 1.7)` places *vertices* at
that radius, not a perpendicular inset — so the band's octagon has apothem 27.72 and its centreline
sits **3.98 m inboard**, with 3.23 m of undifferentiated steel between its outer stroke and the kill
line. A marking whose job is "the rim IS the kill zone" reads as an inner lane ring. It also carries
zero wear, on the one painted surface carts cross most.
*The pass:* `octPath((apothem − 1.7) / COS_HALF)` restores a true 1.7 m inset without touching colour.
Then age it: sun-bleach toward `#c9a545` on sun-facing flats, chip the chevrons where the traffic band
crosses, add scrape marks running off the edge at three or four points. **Effort: small.**

### Tier 2 — the sundial premise, and grounding

**7. Nothing on the deck is grounded, and the API to fix it already ships.** `[unverified]`
[`contactShadows.js:344`](../../src/contactShadows.js:344) exports `createStaticContactShadowCluster`.
The Storerooms calls it twice ([`backroomsSupermarket.js:1790`](../../src/levels/backroomsSupermarket.js:1790),
[`:3084`](../../src/levels/backroomsSupermarket.js:3084)). **Sundial calls it zero times.** Eight
bollards, four 5.2 m masts, the podium frustum and four spawn booths all float on the plate with no
contact darkening, and the deck texture bakes no AO. On an arena with a ~10° sun and no shadow maps,
this is the difference between props standing on a floor and props hovering over it.
*The pass:* one `createStaticContactShadowCluster` call in `buildDeck` covering the 8 bollards, 4 masts,
podium base ring and booth legs — a tight dark contact patch at each base plus a longer fainter streak.
**Effort: medium.** **Flagged for owner sign-off** — see Open Question 4 on directional offsets.

**8. The arena's title concept is one untextured rectangle, and it is wrong by 7×.** `[unverified]`
[`:2007-2034`](../../src/levels/zanzibarPlatform.js:2007). `PlaneGeometry(2.8, 19.7)` with
`MeshBasicMaterial({ color: 0x06080e, opacity: 0.22 })` — no map, no alphaMap, no gradient, constant
opacity, hard rectangular ends. The comment calls it "a long soft radial stripe"; there is no radial
falloff and nothing soft. Three measured defects: it starts at radius 10.7 m while the podium boundary
at that azimuth is at 8.82 m, leaving **1.88 m of fully lit deck between the podium and its own
shadow**; at the key's 9.9° elevation a 0.5 m podium throws a **2.9 m** shadow, not 19.7 m (19.7 m
would need a 3.44 m gnomon); and it ends 1.4 m short of the rim instead of running off the edge. Its
depth bias (`polygonOffsetFactor -1`, no units, y = 0.025) is also half the blob shadows' tuned
`-4/-32` at `floorEpsilon 0.045`, on a near-0.1/far-1000 buffer — a documented quantization risk.
*The pass:* bake the shadow story into `buildDeckTexture`, where `SUN_AZIMUTH` is already in scope and
the ±0.86° drift makes a baked solution exact — a penumbra-widening gnomon shadow flush against the
podium octagon at 8.8 m running off the deck edge, plus matching long shadows and contact pools for the
bollards and masts. Replace the quad with a soft-edged alpha strip using the file's existing
`buildSoftStripTexture` ([`:497`](../../src/levels/zanzibarPlatform.js:497)), tapering in opacity and
widening with distance, driven off the live sun azimuth. Bring depth bias to parity with the blobs.
**Effort: medium.**

**9. The circle-on-octagon habit — three instances, one systemic slip.** `[unverified]`
This is one shape-language error appearing three times, so fix it once as a pattern.
(a) **Bolt rings** [`:210-232`](../../src/levels/zanzibarPlatform.js:210): 144 bolts placed on *circles*
(`cos/sin` at constant radius) fastening seams that are *octagons* (`octPath`). A circle of radius R
sits `0.0761·R` outside the octagon at the flat midpoints — the outer bolt ring wanders up to **2.02 m
off its own seam**. Bolt count is also fixed at 48 per ring regardless of radius, so pitch stretches
from 1.90 m to 3.47 m. (b) **Podium apron ring** [`:289-301`](../../src/levels/zanzibarPlatform.js:289):
a `ctx.arc` circle around an octagonal podium, so the gap breathes 1.10 m at the vertices to 1.82 m at
the flats — most visible at the contested king-of-the-hill zone the camera sits on all match.
(c) **Crown neon torus** [`:2071-2077`](../../src/levels/zanzibarPlatform.js:2071): a circular ring on
an octagonal crown, sitting **32.2 cm outboard** of the plate edge at each flat midpoint and hovering at
a height that varies along its own length.
*The pass:* walk the `octPath` polyline for bolts at a fixed ~1.2 m pitch (fixes drift and stretch in
one change) and double-row them; `octPath(PODIUM_BASE_R + 1.1)` for the apron with ticks moved to flat
midpoints; rebuild the crown ring as eight straight segments at `VERTEX_OFFSET` inset inside apothem
6.098. **Effort: small each.**

**10. The centre podium's crown plate is bare PBR — and it is on the Rule 1 allowlist.** `[unverified]`
[`:1952-1966`](../../src/levels/zanzibarPlatform.js:1952). `CircleGeometry(6.15, 32)` with
`createPhysicalMaterial({ color: 0x1d2027, roughness: 0.22, metalness: 0.9 })` — **zero maps of any
kind**, 118.8 m² of near-mirror gloss sitting on top of the most texture-authored floor in the game.
`art-direction.md` Rule 1 explicitly allowlists "Sundial Station — deck plate, **center podium**" and
records the status as passing; this surface does not pass. It also cannot pay off its own gloss: at
roughness 0.22 it reflects a 128×64 canvas and returns a smooth colour wash, not a sunset. Separately,
the 32-gon disc at radius 6.15 **overhangs the 8-gon podium (apothem 6.098) by 5.23 cm across 33% of
its perimeter**, visible as a floating lip from any low chase camera on the ramp.
*The pass:* swap `CircleGeometry` for an octagon inset inside apothem 6.098; author a crown texture in
the deck's own language (tighter plate grid, real bolt ring, machined centre boss under the hologram,
the amber apron ticks carried up) plus a roughness map with heavy burnish where carts park. Keep it
darker and glossier than the deck — that contrast idea is right, it just has to be earned by maps.
**Effort: medium.** See Open Question 5.

**11. The deck has albedo and roughness but no normal map, and the fascia has nothing at all.** `[unverified]`
[`:1774-1782`](../../src/levels/zanzibarPlatform.js:1774): the most-seen surface in the arena ships
`map` + `roughnessMap` and no `normalMap` — a file-wide grep finds exactly one normal map in the level
(the ocean, [`:1020`](../../src/levels/zanzibarPlatform.js:1020)). Cart Rave's floor, a smaller and
less-trafficked surface, ships all three ([`arena.js:1445`](../../src/arena.js:1445), `normalScale 0.35`).
Every seam, bolt and plate edge here is painted flat and cannot catch a highlight under a 9.9° key.
The **fascia rim band** ([`:1805-1822`](../../src/levels/zanzibarPlatform.js:1805)) is worse: bare
`color 0x2e333d, roughness 0.38, metalness 0.85` — the doc's "pristine untextured PBR" anti-reference
reading as clearcoat chrome, wrapped around 8 × 26.26 m of the single most-looked-at line in the arena,
sitting between an authored deck and authored bollards.
*The pass:* emit a normal map from the same canvas passes that already draw seams, bolts and plate
edges (`normalScale ~0.6`); give the fascia the `panelTex` already built in the same function at
[`:1802`](../../src/levels/zanzibarPlatform.js:1802) with a per-face repeat matched to its 26.26 × 0.34 m
aspect, plus impact scars and paint transfer where carts have clipped the rim. **Effort: medium.**

### Tier 3 — the horizon comes alive

**12. The orbital gate's pulse staircases, and its seven dots blink in unison.** `[unverified]`
[`:1365-1402`](../../src/levels/zanzibarPlatform.js:1365), animated at
[`:1667`](../../src/levels/zanzibarPlatform.js:1667). `gateDotsMat.opacity` is written only inside the
`SUN_STEP_MS = 500` gate, and `sin(t*0.0009)` has a 6.98 s period — so a "slowly pulsing" beacon
advances in **14 visible stair steps per cycle**. All seven dots share one material. The ring itself is
the strongest silhouette on the horizon at 15.7° angular diameter and its 28-segment torus deviates only
1.8 px, so the geometry is right.
*The pass:* move the opacity write out of the 500 ms block (one line, free); split the dots onto a
per-point alpha attribute and phase them so the light chases around the arc — a sequencing beacon at
15.7° is a far bigger read than a synchronised blink. Keep the cool `0x8fd9ff` — it is the right and
only contrast note on this horizon. **Effort: small.**

**13. The alien city is 24 single dots and it is dead.** `[unverified]`
[`:1404-1476`](../../src/levels/zanzibarPlatform.js:1404). The comment promises "grids of lit floors";
the code emits **one 1.7 px point per lit floor at a random lateral offset** — about 24 dots total for
a 14.4° × 17.0° arcology, which reads as dust, not a facade. The 128 m landmark gets ~7 dots over 128 m
of tower. `winMat` is never referenced in `update()`, so the city is completely static while the gate
pulses and three ships orbit. `Math.random()` also runs at build time, so the window layout changes on
every level load.
*The pass:* loop the existing lateral term to emit 3–5 points across each lit floor's arena-facing width
(~24 dots becomes ~90); add per-window flicker on a per-point alpha attribute and let a handful switch
state on a multi-second timer; give the InstancedMesh two or three `instanceColor` values for depth
separation; seed the RNG (decor, not gameplay). **Effort: medium.** Keep `towerSpecs` unchanged — the
setback, sky bridge and needle are good composition.

**14. The three ships read as a dot with a dash.** `[unverified]`
[`:1557-1593`](../../src/levels/zanzibarPlatform.js:1557). Motion design is right — three radii, three
heights, one counter-rotation, allocation-free updates. Delivery is not: a hull is 31 × 3 px of flat
colour, and the engine glow is a **`PointsMaterial` with no map at `size 3.0`, so it renders as a hard
square physically larger on screen than the 3.1 px hull it is attached to**. `shipGlowMat` is
`fog:false`, so the near and far ships glow identically — no depth cue across the trio.
*The pass:* give the glow the file's existing `buildSoftDiscTexture` ([`:471`](../../src/levels/zanzibarPlatform.js:471))
and emit 3–4 points along the reverse tangent with falling size and opacity so it trails; add a red/green
nav-light pair per ship; let glow opacity fall with orbital radius. **Effort: small.**

**15. The god rays run at 48% of their authored strength, and none of them cross the deck.** `[unverified]`
[`:1117-1155`](../../src/levels/zanzibarPlatform.js:1117), overwritten at
[`:1663-1665`](../../src/levels/zanzibarPlatform.js:1663). Constructor opacities are 0.085/0.105/0.125;
the update line silently rewrites them to a runtime peak of 0.040/0.050/0.060. And all three sit 160 m
away over open ocean at 22–30 m altitude — **there is not one shaft, mote beam or haze volume anywhere
in the play space**, on the arena whose premise is a low sun raking the deck.
*The pass:* breathe around the authored values, not half of them — `(0.085 + i*0.02) * (0.85 + 0.15*sin)`;
add 2–3 more instances of the same geometry and material at `sunDir*45`, tilted so their long axis rakes
the plate at the key's elevation. Three draw calls of pure alpha, and the cheapest way to make the raking
light *visible on the floor* rather than inferred from N·L. **Effort: small. This is the additive
alternative to darkening the deck — see §7.**

**16. Give the ambient dust a sun lobe.** `[unverified]`
[`effects.js:96-98`](../../src/effects.js:96), [`:362-374`](../../src/effects.js:362). The 'sunset'
style has its own six-hex warm palette and its own tuned config — authored, not a fallback — but 260
motes are distributed uniformly through a 45 m × 26 m cylinder at fixed opacity. At golden hour what
makes airborne particulate read is that it is **backlit**: dense and bright toward the light, invisible
away from it. This is the arena's only near-field atmosphere.
*The pass:* pass `SUN_AZIMUTH` through `setAmbientDustStyle` and weight both spawn density and per-mote
brightness by a lobe such as `0.35 + 0.65 * max(0, cos(θ − sunAz))²`. Same particle count, same draw
call. **Effort: small.**

**17. The islands are faceted 7-gons and the "spires" are a bar chart.** `[unverified]`
[`:1239-1264`](../../src/levels/zanzibarPlatform.js:1239). `ConeGeometry(1,1,7)` at radius 76 m viewed
from 300 m has a silhouette chord deviation of 7.5 m = 2.87° ≈ **56 px at 1080p** — a large, obvious
polygonal kink in the largest landform in the frame. `addRidge` sets position and scale only, with
uniform XZ scale, so every cone in a ridge is an identically-oriented regular 7-gon in plan and their
facet edges line up. The mid cluster's comment calls them "jagged rock spires"; they are four
axis-flat `BoxGeometry` instances with flat tops and **no tilt of any kind**.
*The pass:* raise `radialSegments` 7 → 16–20 (kink drops from 56 px to under 10 px); add per-part
`rotation.y` and slight non-uniform XZ scale; give the mid cluster a per-part `rotation.z` of 0.05–0.15
rad so the spires lean. **Effort: medium.** Do not move the placements.

**18. The four-tone island haze ladder delivers a 1–3 luma spread.** `[unverified]`
[`:1234-1237`](../../src/levels/zanzibarPlatform.js:1234). Four hand-picked, individually commented
tones, resolving through the shipped pipeline to **10 luma of separation at 0 m, 3 luma at 300 m, and
1 luma at 365–400 m** — below perceptual threshold and below display quantization. The comment's
reasoning ("at 300–365 m the fog does the atmospheric-perspective blending for us") is self-defeating:
at 68–87% fog the fog does not blend the authored value, it *overwrites* it. Proof of inertness:
substituting the archived lighter tone `0x77565f` for the current `0x40202c` at 365 m changes the
result by only 3/8/11.
*The pass:* after the sky fix lands, re-derive the four tones against the *corrected* horizon value and
spread them far enough to deliver a measurable 12–20 luma ladder — verified by computing post-fog
post-ACES luma, not by eyeballing hexes. If the fog will dominate regardless, delete three of the four
materials and get depth separation from geometry scale and `yLift`, which already work. **Do not leave
four commented tones that deliver one.** **Effort: small.**

**19. The gas giant is a sticker.** `[unverified]`
[`:1478-1555`](../../src/levels/zanzibarPlatform.js:1478). Best-authored element on the horizon — a
real 64×64 band canvas delivering 2.3× internal contrast, correctly reasoned elevation, correct
`fog:false`. Four things stop it finishing: **no limb darkening** (hard uniform circular edge — the sun
disc four hundred lines earlier does this properly via `buildSoftDiscTexture`); **no terminator**,
despite sitting 137° from the sun azimuth, so it renders as a uniformly lit full disc; **the ring
cannot occlude the planet** because planet, ring and moon all set `depthWrite:false` and share one
origin, so the ring's near and far halves render identically — and ring-in-front-of/ring-behind is *the*
cue that a ringed planet is a 3D object; and **the moon is genuinely bare** — `0xd8ccd8`, no map, at
luma 112 against a planet base of 108, so it reads as a detached chip of the same material.
*The pass:* radial limb-darkening gradient over the existing band canvas; a soft terminator wedge
phase-matched to `SUN_AZIMUTH-2.4` (biggest single readability win, one gradient fill); curve the four
bands to follow the limb; `depthWrite: true` on the planet disc; give the moon its own small canvas and
darken it 20–25 luma below the planet. **Effort: medium.**

### Tier 4 — the hologram

**20. Four lines of waste, then the storytelling gets outrun.** `[unverified]`
[`:2438-2446`](../../src/levels/zanzibarPlatform.js:2438). Both bands set `map.needsUpdate = true`
after writing `offset.x`. `offset` feeds the `uvTransform` uniform, which three updates automatically —
`needsUpdate` here forces a full **512×128 canvas re-upload plus mipmap regeneration at least once per
frame** (~262 KB/frame at 60 fps) purely to move a uniform, on a level with a documented load-stall
history. Separately, mesh spin and UV scroll **add** rather than cancel (verified against three's
cylinder UV winding), giving a net glyph sweep of **1.85 m/s** — fast enough that the authored
`SUNDIAL` / `SOL-07` / `GNOMON` / `SYNC` callsigns read as a warm smear.
*The pass:* delete both `needsUpdate` lines; halve the scroll rates to ~0.035/s and −0.05/s so net sweep
lands near 0.8–0.9 m/s. **Effort: small.** Spend the reclaimed budget on item 22.

**21. The gnomon fin is a flat 12 cm strip lying on its back.** `[unverified]`
[`:2176-2188`](../../src/levels/zanzibarPlatform.js:2176). `PlaneGeometry(0.12, 2.4)` with the Euler
composition `Rx(-90°)·Rz(θ)` mapping its normal to +Y — so the "fin" lies **flat**, 30 mm above the dial
plate, as a radial strip. The comment says "triangle edge pointing sun-ward"; it is a rectangle, it is
not a fin, and a gnomon is by definition the *vertical* blade that casts the shadow. It contributes zero
silhouette and is semantically triplicated by the 8 floating spokes
([`:2278-2288`](../../src/levels/zanzibarPlatform.js:2278)), the dial texture's own 8 major ticks, and
the deck's separate shadow decal.
*The pass:* build a standing blade — a vertical triangle rising ~1.0–1.4 m from the dial centre, leaning
along `SUN_AZIMUTH`, additive amber with a soft vertical alpha ramp. Gives the hologram the vertical
silhouette element it entirely lacks and makes the sundial read from a deck-level camera even when the
dial plate is edge-on. Keep the flat strip as the noon line or delete it. **Effort: small. Highest-value
item in this group.**

**22. Nothing projects the hologram, and it never flickers.** `[unverified]`
[`:2123-2301`](../../src/levels/zanzibarPlatform.js:2123). Enumerating every `add()` between the podium
and the hologram: the crown tops out at y 0.55 and the lowest holo geometry is at y 3.35 (3.19 at the
bottom of the bob) — **2.64 m of empty air with nothing in it.** No emitter, no lens, no beam, no
plinth, no volumetric cone. The nearest light, `PointLight(0xffb400, 28, 50, 2)`, sits at y 7 — *above*
the hologram, so its amber pool on the podium reads as a separate overhead source. Meanwhile every
temporal term in the group is a pure sine
([`:2414-2447`](../../src/levels/zanzibarPlatform.js:2414)): no dropout, no glitch frame, no roll bar,
no re-sync stutter. The only scanline is a 0.12-alpha 3 px pattern baked into the glyph canvas, which
mips away at gameplay distance. A hologram without instability reads as a glass sculpture.
*The pass:* (a) a small projector housing on the cap plate at r ~0.8 m using the existing panel/grille
vocabulary; (b) a soft additive cone from the lens to the hologram's underside, matching the sun-shaft
treatment already at [`:1119-1145`](../../src/levels/zanzibarPlatform.js:1119); (c) move `spindleLight`
from y 7 to ~4.2–4.5 so the hologram *is* the source; (d) an update-loop instability layer — rare
stochastic dropout to ~15% for 1–2 frames, a world-space roll bar sweeping each glyph cylinder every
~6 s, and millimetre jitter gated to fire only during the dropout. All revert cheaply.
**Effort: medium.**

**23. The machine never registers that a match is happening.** `[unverified]`
[`:2414`](../../src/levels/zanzibarPlatform.js:2414). The hologram's entire update contract is
`update(timeMs)` — a clock and nothing else. `zanzibarPlatform.js` does not import
`sampleArenaReactive`, though `arena.js`, `effects.js`, `frameVisuals.js` and `sceneExtras.js` all do,
and `sampleArenaReactive` already returns `{ accentColor, intensityMul, koT, hasLeader }` live today
with zero plumbing. Classic Record's centre reacts; Sundial's more elaborate device does not. It is
dense with data-readout language that never displays any data.
*The pass:* drive holo opacity/scale off `koT` and `intensityMul` — a bright spike and scale kick on KO
decaying back to the sine baseline. **Use `koT` and `intensityMul` only, never `accentColor`** — the
ambient default cycles pink→cyan, which is exactly the clash the amber unification removed. Bigger win
if the plumbing is acceptable: the dial texture already carries 32 ticks with 8 major and a fixed
sun-ward index, so lighting ticks down as the round drains turns the sundial into a literal clock using
geometry that already exists. **Effort: small.**

**24. The inner glyph band is a clone that says the same thing.** `[unverified]`
[`:2209-2227`](../../src/levels/zanzibarPlatform.js:2209). `glyphTex.clone()` shares `source` in three
r185, so the inner band carries the identical `SUNDIAL`/`SOL-07`/`GNOMON`/`SYNC` callsigns, histogram
and 18 packet grids as the outer band, 0.7 m away, at a 3.5× horizontal stretch. The counter-rotation
choreography is good and the content duplication wastes it.
*The pass:* parameterize the builder for a second register — tide/ephemeris rows, a numeric telemetry
ruler, a sun-elevation readout — so the outer band reads as station identity and the inner as live
instrument data. Same wash/rail/tick vocabulary, same amber family. **Effort: medium.**

**25. Smaller holo items, batched.** `[unverified]`
The **dial texture** ([`:847-911`](../../src/levels/zanzibarPlatform.js:847)) is the lowest-resolution
canvas in the group (256²) on the largest surface (5.8 m disc = 22.7 mm/texel) and the only holo texture
with `anisotropy` left at 1, despite being the surface the chase camera always sees near-edge-on — bump
to 512², anisotropy 8, and give it the sundial semantics its name promises (octant hour glyphs, a
highlighted current-hour sector). The **glyph band canvas** ([`:745-841`](../../src/levels/zanzibarPlatform.js:745))
is 3.4× anisotropic — 36.2 px/m horizontal against 121.9 px/m vertical, so the arena's only self-naming
text is horizontally smeared; go 1024×128 and raise scanline pitch from 3 px to ~8 px so it survives
mipping. The **crystal core** ([`:2141-2154`](../../src/levels/zanzibarPlatform.js:2141)) is the focal
point of the centrepiece and the least authored surface in the group — additive + DoubleSide on a convex
octahedron means every ray crosses exactly two faces, so brightness is near-uniform across the whole
silhouette; add per-face vertex colours and a slower counter-rotating outer shell. The **octagon wire
rim** ([`:2257-2276`](../../src/levels/zanzibarPlatform.js:2257)) uses `THREE.Line`, which WebGL renders
as one device pixel at any distance — replace with an 8-segment torus at the same radius. The **8 spokes
and 16 tick pillars** ([`:2278-2299`](../../src/levels/zanzibarPlatform.js:2278)) are bare uninstanced
boxes with no entry in `update()` at all — 24 dead draw calls; and the pillars' count of 16 matches
nothing else in an arena that is 8-fold everywhere. Instance, re-cadence to 8 or 32, or cut.
**Effort: small each, medium in aggregate.**

### Tier 5 — correctness, cleanup, and things that are lying

**26. Six dead `envMapIntensity` knobs.** `[unverified]` Water 0.58
([`:1019`](../../src/levels/zanzibarPlatform.js:1019)), deckTop 0.45, deckSide 0.35, fascia 0.6,
capPlate 0.8, conduit 0.4. In three r185, `WebGLRenderer` overwrites `envMapIntensity` with
`scene.environmentIntensity` for every standard/physical material where `material.envMap === null` and
`scene.environment !== null`. No material in this file assigns an owned `envMap`, so all six flatten to
0.6 — **3× to 7× the authored 0.084–0.192**. The repo already documents this gotcha
([`config.js:510-513`](../../src/config.js:510), [`scene.js:207-209`](../../src/scene.js:207)) and
Classic uses the `clampFloorEnv` escape hatch ([`arena.js:1475-1485`](../../src/arena.js:1475)); Sundial
uses none. Either adopt the pattern for the surfaces whose reflectivity is meant to differ, or delete
the six inert scales and their `userData` twins so the file stops claiming a tier structure it does not
have. **Effort: small.**

**27. Seven `toneMapped:false` flags are inert on the shipping path and inverted on Low.** `[unverified]`
[`:1211`](../../src/levels/zanzibarPlatform.js:1211), [`:2061`](../../src/levels/zanzibarPlatform.js:2061),
and five hologram layers. Three only applies per-material tone mapping when
`currentRenderTarget === null`, and this game tone-maps in the `OutputPass` because the scene renders
into a composer RT ([`scene.js:1148-1152`](../../src/scene.js:1148)). So on Medium and High the flag
does nothing; on Low, where `composerBypass` is true, those seven layers render **ungraded and blow out**
relative to the rest of the frame. The intent is inverted across tiers. Pick one truth — drop the flags
and compensate with opacity, or keep them and compensate when `isComposerBypassActive()`. **Effort: small.**

**28. The spindle light's contract is dead, and its comment says otherwise.** `[unverified]`
[`:2737-2741`](../../src/levels/zanzibarPlatform.js:2737). The comment claims the two returned colours
"still feed main.js's spindle color cycle." They do not: `main.js` destructures them at
[`main.js:2828-2830`](../../src/main.js:2828) into locals and never reads them again. Sundial's own
update never touches `spindleLight`, so the arena's centre light is a hard constant while every fixture
around it breathes. The same stale belief is copy-pasted at
[`backroomsSupermarket.js:3446-3447`](../../src/levels/backroomsSupermarket.js:3446). Two lines in the
level's update to lerp colour on a ~9 s cycle and ride intensity in phase with the dusk breath — then
delete both false comments. **Effort: small.**

**29. The cool anti-sun fill is weaker than its own precedent.** `[unverified]`
[`:2720-2722`](../../src/levels/zanzibarPlatform.js:2720). Rule 5 names the Storerooms rim as the
precedent because "warm environment plus warm carts collapsed." Sundial is the other warm environment
and its separation light is both dimmer and darker: `0x3a6088 @ 0.22` here against `0x8aa0c8 @ 0.28` at
[`backroomsSupermarket.js:3394`](../../src/levels/backroomsSupermarket.js:3394) — and the Storerooms rim
aims at a deliberate off-centre target to hold a grazing angle, while Sundial's has no target at all.
Raise to ~0.28–0.32 with an explicit target ~1.2 m up and offset from centre, and capture the Rule 5
baseline for `zanzibar` while in there — `art-direction.md` lists it as TBD. **Effort: small. Note this
is an *addition* of light, not a removal.**

**30. `panelTex` is applied with no per-face UV correction anywhere.** `[unverified]`
[`:379-424`](../../src/levels/zanzibarPlatform.js:379) ships one global `repeat (2,2)` that every
consumer inherits regardless of face aspect. Pylons: 1.5 × 6.8 m faces → **4.5:1 stretch**, rivets
elongated into ovals. Raised conduits ([`:1980-2005`](../../src/levels/zanzibarPlatform.js:1980)):
16.7 × 0.38 m faces → **44:1 stretch**, the panel grid becoming long smears over a 16.7 m run. The
bevel is also painted light-and-shadow baked into albedo, so under a moving 9.9° sun the fake bevel
lighting stays fixed while the real lighting sweeps past it. Return the texture un-repeated so each call
site clones and sets its own repeat, and emit a matching normal map from the same canvas passes.
**Effort: medium.**

**31. The impact-ripple normal is added in the wrong coordinate space.** `[unverified]`
[`waterDeathFx.js:328-339`](../../src/effects/waterDeathFx.js:328),
[`:359-402`](../../src/effects/waterDeathFx.js:359). The vertex stage stores a **world**-space position;
the fragment stage derives a world-XZ radial direction and adds it into `normal` immediately after
`#include <normal_fragment_maps>`, at which point three's `normal` is **view** space. `amp` is scaled by
2.2, making this the strongest normal perturbation the ocean ever receives — and the one that responds
wrongly, so crest highlights swim as the camera turns. The surrounding engineering (4-slot
oldest-eviction, per-frame envelope fade, frame-driven delayed pulses, `customProgramCacheKey` guard) is
careful enough that this reads as an oversight. Transform to view space before adding.
**Effort: medium.**

**32. Bollards are eight identical clones with a 10-segment silhouette.** `[unverified]`
[`:2340-2362`](../../src/levels/zanzibarPlatform.js:2340). One shared geometry, one shared material, and
**no rotation is ever set on any instance** — so the same 14 authored wear scratches appear 16 times
around a ring the camera constantly pans across. At 10 radial segments a 0.55 m bollard has a 2.7 cm
facet sagitta, and these are the props most often silhouetted against a bright horizon — the harshest
possible test for Rule 4. Each also meets the deck as a bare cylinder: no base flange, no anchor bolts,
no rust bleed. Per-instance `rotation.y` plus ±3% scale jitter, 16–20 radial segments, a shared instanced
base flange, and a matching rust ring painted into `buildDeckTexture`. **Effort: small.**

**33. The podium ramp wears a wall texture.** `[unverified]`
[`:431-458`](../../src/levels/zanzibarPlatform.js:431). `buildGrilleTexture` authors vertical vent slats
and a "top rail highlight" — and it is applied to `podiumSideMat`, which clothes a **9.8° drivable
ramp**. Players drive up over vent slats, past a rail highlight running along a crest that has no rail.
`repeat (10, 1)` across an 8-facet octagon means 1.25 tiles per facet, so the slat pattern phase-shifts
at every seam and no two faces match. No roughness or normal map on a surface carts are on constantly.
Set repeat to 8 or 16; re-author as transverse anti-slip tread plate with the vent slats and glow line
confined to the lowest 20% where the frustum meets the deck. **Effort: medium.**

**34. Deck surface density, batched.** `[unverified]` The **albedo**
([`:157`](../../src/levels/zanzibarPlatform.js:157)) is the densest builder in the game and every mark on
it is low-frequency: 6.70 cm/texel leaves zero steel grain, and the 90 grime blotches are isotropic soft
circles with no directional flow, no drip, and **nothing that reads "offshore, salt air, permanent sun"**
— an ocean platform with no salt bloom and no spray staining is the one thing this arena's premise most
obviously owes. 29% of the square canvas is off-octagon waste. The **46 scuff arcs**
([`:169-178`](../../src/levels/zanzibarPlatform.js:169)) are alpha 0.03–0.08 — roughly +8/255 before
tone mapping, authored at the threshold of visibility — and every one is a perfect concentric circle, so
they read as machining swirl rather than traffic. The **roughness map**
([`:318-372`](../../src/levels/zanzibarPlatform.js:318)) has the right idea (carts burnish the driving
annulus) but moves roughness only 0.580 → 0.502, a 0.08 delta that will be invisible under a grazing
key; its "brushed metal" strokes are 0.8–4.8 **metres** long in world space. The **plate seams**
([`:193-208`](../../src/levels/zanzibarPlatform.js:193)) produce plates of 83–97 m² — real offshore deck
plate is ~2×6 m. The **station name decals** ([`:263-274`](../../src/levels/zanzibarPlatform.js:263)) are
16 px monospace on a 6.7 cm/texel map (8 px on Low) — sub-legible, and the only two marks on 3330 m².
*The pass, as one coherent job:* a tiling high-frequency detail layer (steel grain albedo + normal at
~1 m repeat) as a second overlay mesh, mirroring the pattern `arena.js` already ships for the vinyl
detail ring ([`arena.js:1423-1451`](../../src/arena.js:1423)), so the unique 1024 map carries *layout*
and the tiling layer carries *density*. Then bias the grime instead of scattering it — salt-crust bloom
pooling at seams, spray staining climbing inward from the rim, sun-bleach on the sun-facing half driven
off `SUN_AZIMUTH` (already in scope). Add rubber skid arcs on the four booth-approach lanes, braking
chevrons on the apron, and raise the pale burnish to 0.06–0.14 so it survives tone mapping. Push the
polish band to a 0.58 → 0.34 delta and pull brush strokes to 0.1–0.4 m. Blit the decal text from a
dedicated high-res offscreen canvas, then age it. **Effort: medium, and it is the largest single body of
work in this document.**

**35. Small truths worth correcting.** `[unverified]`
The **booth builder's JSDoc** ([`:2469-2471`](../../src/levels/zanzibarPlatform.js:2469)) claims
"holographic banners, and pink/cyan rail neon alternating per booth" — there is no banner geometry
anywhere in the function, and the rails use the single shared caution-yellow `neonYellowMat`. The doc is
stale twice over and predates the amber unification; **fix the doc, do not build pink/cyan.** The
**`lodProps` registration** ([`:2748`](../../src/levels/zanzibarPlatform.js:2748)) calls
`getWorldPosition` on the InstancedMesh, which sits at the group origin — so LOD distance is measured
from camera to arena centre and in a 34.3 m arena can never exceed the `far: 95` threshold; the gate is
inert for all three registered props. The **"cyan" in the conduit and grille comments**
([`:234`](../../src/levels/zanzibarPlatform.js:234), [`:427`](../../src/levels/zanzibarPlatform.js:427))
describes amber code — a future pass could "fix" it back to a clashing hue. The **truss ring**
([`:1833-1873`](../../src/levels/zanzibarPlatform.js:1833)) has no gussets or bolt plates, so it reads
extruded rather than assembled. The **under-skirt and deck slab edge**
([`:1783-1790`](../../src/levels/zanzibarPlatform.js:1783)) are flat black — and the skirt is what a
player stares at for the whole fall after being knocked off. **Effort: small each.**

**36. Low quality deletes the arena's identity rather than reducing it.** `[unverified]`
The hologram is **not built at all** on Low ([`:2123`](../../src/levels/zanzibarPlatform.js:2123)) — the
podium becomes a bare dark disc, and the frame stops saying "research station." The ocean loses its
normal map, the glint, the foam and the caustic simultaneously, leaving `color 0x14242c` on two
triangles: measured at **1–11 of 255** across the whole near and mid field in `shots/run3-sundial.png`.
Both god-ray shafts and the sun-path glint — the arena's two golden-hour signatures — are cut while the
91-mote dust field and the entire backdrop city/gate/planet stay. Low is not rare:
[`qualityMode.js:39-53`](../../src/utils/qualityMode.js:39) returns it for menu-preview LOD, session
auto step-down, explicit setting, **and the touch-device default**. And the same file degrades rather
than deletes elsewhere — the sky sphere drops 32×16 → 20×10.
*The pass:* keep the water normal map on Low (a 256 px canvas built once; one extra texture fetch, not a
pass) at repeat ~12 without anisotropy; keep the foam ring (48-segment ring, one basic material); keep
the glint as a static quad and one of three shafts; build core + dial + outer band only for the hologram
(~3 draw calls). Reserve the skips for genuinely expensive items. **Effort: medium.**

---

## 6. The ocean and the horizon

Water, sky and distant dressing are most of every frame in an arena with no walls, and they are where
this audit's two structural bugs live. Both are mapping errors, not taste.

**The horizon is a hard line because the sky's warm half is underwater.** Detailed in item 1. The
measured consequence in a committed capture is a 187-level step in red across the waterline. A
secondary consequence: the horizon haze cylinder at
[`:1157-1184`](../../src/levels/zanzibarPlatform.js:1157) — correctly built, correctly colour-matched to
the fog hex, 4° tall at ~0.08 effective alpha — is currently **the only thing bridging a 92%-fogged
`#ff5a22` ocean to a `#58193b` sky.** It is doing a patch's job. Once the sky remap lands, re-judge
whether it is still needed at opacity 0.11.

**Every distant silhouette is brighter than the sky behind it.** `[unverified]` This is the cross-cutting
finding and it explains the "cutout" read better than any geometry claim. Every element in the distant
group is an unlit `MeshBasicMaterial` that **inherits** scene fog (verified by omission at
[`:1234`](../../src/levels/zanzibarPlatform.js:1234), [`:1332`](../../src/levels/zanzibarPlatform.js:1332),
[`:1377`](../../src/levels/zanzibarPlatform.js:1377), [`:1409`](../../src/levels/zanzibarPlatform.js:1409),
[`:1564`](../../src/levels/zanzibarPlatform.js:1564)) while the sky dome explicitly opts out
(`fog:false`, [`:1033`](../../src/levels/zanzibarPlatform.js:1033)). Pushed through the shipped pipeline
at 0.528 exposure with real ACES matrices: the near island renders `rgb(175,38,13)`, the mid island
`rgb(185,44,16)`, the turbines `rgb(173,37,15)`, the gate `rgb(191,49,17)`, a city tower `rgb(193,50,18)`.
The sky those shapes sit against renders `rgb(22–31, 1, ~19)`. **Object luma 56–80, background luma
7–10 — every horizon element is 7–10× brighter than its background.** The code comments assert the
opposite intent in three places ("reads as a distant silhouette" at `:1366`, "hold as dark shapes against
the dusk" at `:1405`, "true silhouette" at `:1229`). Worse, atmospheric perspective is **inverted**: the
farthest tier is the brightest, so the hazy background ridge is the most visible thing on the horizon.
Two systems each authored correctly in isolation, disagreeing at their boundary. The sky remap fixes it
globally with no per-element work; the fog hex and density must not be touched.

**The ocean is dark, flat, and square.** `[unverified]` The plane is
`PlaneGeometry(900, 900, 1, 1)` — **four vertices**, zero displacement anywhere in the file
([`:1007`](../../src/levels/zanzibarPlatform.js:1007)). There is no swell at all, so every other water
cue has to be faked on a mirror-flat sheet. The square silhouette is a measurable second-order tell: the
plane's edge sits at 450 m along the axes and 636 m along the diagonals, an apparent elevation step of
0.223° ≈ 2.9 px at 1280×720 — **visible in `shots/run3-sundial.png` row 0, where the waterline steps by
1–3 px across the frame exactly as predicted.** Fixes, in order of payoff: the material model (item 3),
the three dialled-down numbers (item 4), the reflected sun's 180° offset (item 2), then optionally a
`CircleGeometry(450, 96)` for a circular horizon and one low-frequency Gerstner pair (~40–70 m
wavelength, 0.25–0.4 m amplitude) in the vertex hook `waterDeathFx.js` already injects into. Keep the
plane at 900 m, keep it opaque, and keep `WATER_Y` a scalar — the splash detection at
[`waterDeathFx.js:1672`](../../src/effects/waterDeathFx.js:1672) depends on all three.

**The sun path has a 56-metre hole in it.** `[unverified]`
[`:1186-1223`](../../src/levels/zanzibarPlatform.js:1186). The glint plane spans **90 m to 310 m** along
the sun line, while the deck edge is at 31.7–34.3 m — so the water a player looks at when leaning over a
kill edge has no sun path in it at all, and the true specular position for a camera 9 m above the water
with the light at 9.9° elevation is **~52 m out, inside the gap**. It is also a single smooth airbrushed
ellipse: golden-hour water is thousands of individual specular flecks, the old scrolling streak noise was
deliberately deleted, and nothing replaced it. Extend the near end to the deck (e.g. 95 × 320 at
`sunDir*170`, or two overlapping quads so the near end tapers); restore break-up as a low-amplitude
flecking term multiplied into the existing radial gradient rather than as rectangles.

**Where the platform touches the sea, nothing happens.** `[unverified]`
[`:1875-1905`](../../src/levels/zanzibarPlatform.js:1875). Eight pylons penetrate the water plane by
1.8 m with a single uniform material top to bottom — **no tide line, no wet band, no algae, no
biofouling, no rust at the splash zone, no wake, no vertical UV variation.** Combined with a foam ring at
2.4% effective alpha and no cast shadow of any kind, there is literally zero grounding cue: the platform
reads as pasted onto the water rather than standing in it. Three scoped adds: a dark tide/algae gradient
on the lower pylon, eight small foam collars breathing out of phase with the main ring, and a soft
darkening disc under the deck. The third does more for grounding than anything else in this group — but
see Open Question 4 before offsetting it along `-sunDir`.

**The always-on ocean caustic is swell-scale and cool-tinted.** `[unverified]`
[`waterDeathFx.js:386-408`](../../src/effects/waterDeathFx.js:386). Real, always-running, correctly
tiered — and its three sine lattices produce feature wavelengths of **11.9 to 23.8 m**, which is swell
scale, not the 0.1–2 m of light-through-chop sparkle. The comment says "warm sun-kissed caustic flecks";
the vectors are `vec3(0.12, 0.16, 0.14)` (green-biased) and `vec3(0.14, 0.18, 0.2)` (blue-biased), in the
arena that deliberately unified to warm amber. At peak the add is ~0.022 linear against a base albedo of
`(0.0075, 0.0175, 0.0265)` — it can more than **double** the water's albedo, and at metalness 0.82 that
lands mostly in the specular blend. So the only always-on ocean animation is tinting the reflection
cooler. Raise `cp = wXZ * 0.085` to ~0.35–0.6 so features land at 2–6 m, and re-tint both vectors warm.

### The island question — settled, in both directions

**The M7 claim is structurally true; its recorded colour values are stale; and the "cutouts" complaint
was right about the symptom and wrong about the cause.**

- **Structure: M7 wins.** `addIsland` ([`:1273-1278`](../../src/levels/zanzibarPlatform.js:1273)) does
  place two atmospheric-perspective layers — a near ridge plus a haze ridge offset by
  `ISLAND_HAZE_DIST_OFFSET` = +35 m, clamped to `ISLAND_MAX_DIST` = 400, with `yLift 1.5` so the far
  ridge's foot is lost in haze. Each ridge is a **chain of 2–4 primitives** (`offset += w*0.7`,
  z-staggered), not one cutout. The archived "flat cone/box cutouts at 400 m+ against a 900 m ocean
  tile" description does not match the code that ships.
- **Colours: neither record is current.** M7's recorded haze ladder of `0x150a16` to `0x77565f` is
  **stale**. The live values at [`:1234-1237`](../../src/levels/zanzibarPlatform.js:1234) are
  `0x140a10 → 0x231018 → 0x321823 → 0x40202c` — substantially darker than M7 recorded. Cite the code,
  not either audit.
- **The "cutout" read survives, for reasons neither claim identified.** Three of them, all measured:
  the value inversion above (islands render 7–10× brighter than the sky behind them); the
  `ConeGeometry(1,1,7)` facet kink of 2.87° ≈ **56 px at 1080p** on the largest landform in the frame,
  with zero rotation variance so every cone's facets align; and unlit `MeshBasicMaterial` giving no form
  shading at all — no sunward face, no shadowed face — so even the well-proportioned mid cluster reads as
  a stencil. The four-tone haze ladder that was supposed to counteract this **delivers 1–3 luma of
  separation at the distances it is actually used**, which is below perceptual threshold.
- **One element in the brief does not exist.** A case-insensitive search of the whole file for "spire"
  returns exactly one hit — a comment at [`:1286`](../../src/levels/zanzibarPlatform.js:1286) labelling
  the mid **island** cluster "jagged rock spires." There is no separate tilted alien spire cluster with
  window lights. `addRidge` applies position and scale only; the sole rotation is a `lookAt` that
  resolves to pure yaw, so **there is no tilt anywhere on the islands**, and the only window-light
  `Points` in the file belong to the alien city. The four flat-topped un-tilted boxes at
  `SUN_AZIMUTH-0.5` @ 335 m *are* the thing, and they are covered under item 17. Recorded explicitly so
  the inventory is not carried forward wrong — "the brief named it, therefore it exists" is precisely the
  inference that produced the earlier false claim.

---

## 7. Dropped proposals

Cut for violating the golden-hour identity. Each underlying *finding* is real and is preserved above;
only the proposed remedy is dropped.

**Dropped: lower the sun key to ~5–6° elevation.**
[`:2710-2712`](../../src/levels/zanzibarPlatform.js:2710). The finding is sound — the key tracks the sun
disc's *azimuth* only, and sits at 9.93° elevation while the disc the player reads as the sun sits at
1.87°, a 5.3× disagreement. But the proposed fix explicitly drops the deck's N·L from 0.172 to ~0.10,
darkening the dial plate in the arena ratified as *not dark*. Keep the coherence finding; reconcile the
two upward or leave the value alone (see Open Question 8).

**Dropped: drop the HemisphereLight from 0.78 to 0.55–0.60.**
[`:2713-2714`](../../src/levels/zanzibarPlatform.js:2713). The finding is real: the hemi is direction-free
in the horizontal plane and out-weighs the key 2.3:1 on the deck, so the surface the arena is named for
takes ~80% of its light from direction-free fill and the sun does not sculpt it. But removing 0.2 of a
~1.67 light budget from a golden-hour arena is a darkening, and combined with the dropped key proposal it
compounds. **The correct fix is additive, not subtractive:** god-ray shafts that actually cross the deck
(item 15), the sun-lobe bias on the ambient dust (item 16), long shadows baked into the deck texture
(item 8), and static prop grounding (item 7). All of those make the raking light *visible* without
taking any light away. Warming the hemi *ground* hex from `0x061018` toward a dim ember bounce is also
acceptable — it lifts down-facing geometry rather than dimming the deck.

**Self-dropped in the source data, recorded here so it stays dropped: `accentColor` plumbing into the
hologram.** The proposal to drive the hologram off `sampleArenaReactive` explicitly excludes
`accentColor` because its ambient default cycles pink→cyan
([`arenaReactiveLights.js:128-130`](../../src/arenaReactiveLights.js:128)) — exactly the clash the amber
unification removed. Use `koT` and `intensityMul` only.

**Not a proposal, but do not act on it: the booth JSDoc's "pink/cyan rail neon alternating per booth."**
[`:2469-2471`](../../src/levels/zanzibarPlatform.js:2469). Stale documentation predating the amber
unification, describing code that does not exist. Correct the doc; do not implement it.

**No `mood_violation` flags exist in the data** — because no verifier ran. The three drops above are my
own reading against the mood contract, not upheld verifier corrections.

---

## 8. Open questions for Wyatt

1. **"Artifacts near the sun — under review"** ([`config.js:504`](../../src/config.js:504)). Two groups
   disagree. `lighting-and-atmosphere` says **resolved**: all three run-2 cross-flare fixes shipped —
   the soft-limbed disc texture ([`:1047`](../../src/levels/zanzibarPlatform.js:1047)), the alpha-graded
   haze strip replacing the flat cylinder ([`:1162`](../../src/levels/zanzibarPlatform.js:1162)), and the
   radial-falloff shaft texture replacing flat planes
   ([`:1124`](../../src/levels/zanzibarPlatform.js:1124)) — so the clause is stale and should retire when
   ART-EXPO-1 records baselines. But `ocean-and-water` flags a **live candidate**: `glintMat` is
   `toneMapped:false` *and* fogged (`MeshBasicMaterial.fog` defaults true), so at ~70% fog its far end
   mixes toward the bright ember `fogColor` and then bypasses ACES — **it gets hotter with distance
   instead of fading.** The sun disc and both halos set `fog:false`
   ([`:1061`](../../src/levels/zanzibarPlatform.js:1061),
   [`:1089`](../../src/levels/zanzibarPlatform.js:1089),
   [`:1106`](../../src/levels/zanzibarPlatform.js:1106)); the glint does not. One-line test: set
   `fog: false` on `glintMat` and re-look. **Run that before deciding whether to retire the clause.**
2. **Does the run-6 no-directional-bias ruling extend past cart blobs?** Two proposals want static
   shadows offset along `-sunDir`: prop grounding on the deck (item 7) and a soft darkening disc under
   the platform on the water (§6). Both use the `contactShadows` module. The ruling as recorded is about
   **cart** blob shadows — same flat circle under every cart, no exceptions — and static level props are
   a separate system that The Storerooms already uses twice. But the mechanism is close enough that I am
   not shipping it without your word. Static props: directional or flat?
3. **Rule 1 allowlist contradiction.** `art-direction.md` states "every arena surface on the allowlist
   PASSES," and explicitly allowlists "Sundial Station — deck plate, **center podium**." The podium's
   crown plate ([`:1952-1966`](../../src/levels/zanzibarPlatform.js:1952)) has **zero maps of any kind**.
   Either the doc's status line needs correcting or the surface does — which?
4. **The wind farm: keep it or replace it?** [`:1330-1363`](../../src/levels/zanzibarPlatform.js:1330).
   Technically it is a two-blade bar with no hub or nacelle spinning at 4.0–4.6 RPM (about a third of real
   turbine speed), which reads as a radar or a windmill rather than heavy machinery. Tonally it is the
   only terrestrial-industrial element on a horizon carrying an orbital gate, an arcology and a ringed gas
   giant — and it is the **closest** piece of dressing at 290 m, therefore the least fogged and most
   legible, arguing directly against the planet that exists to say "not on Earth." Fix it (3 blades +
   nacelle, 10–15 RPM) or replace it at the same silhouette scale with something that reinforces the
   identity? This changes the work, so decide first.
5. **Give Sundial its own bloom profile?** [`scene.js:81-89`](../../src/scene.js:81).
   `BLOOM_DISPLAY_NEON` (`0.25 / 0.67 / 0.5 / 0.025`) is shared with Cart Rave and labelled
   "Wyatt-approved live tune 2026-07-13." One profile serves two opposite frames: in Cart Rave only
   emissive neon crosses a 0.5 display-luma threshold; in Sundial at 0.528 exposure the sun disc, both
   halos, the water glint, the fogged ember horizon and the caution-yellow perimeter all sit at or above
   it, with a near-hard 0.025 knee so the whole horizon line crosses in one step. Proposed
   `BLOOM_DISPLAY_SUNDIAL` at threshold ~0.62–0.68, knee ~0.08–0.10, radius ~0.45–0.5. This reduces
   glow on a tune you signed off; the `?bloomthr/?bloomstr/?bloomrad/?bloomsmooth` live dials make it an
   A/B session rather than a guess. Worth doing?
6. **Is Low a shipping look or a fallback?** It is the **touch-device default**
   ([`qualityMode.js:39-53`](../../src/utils/qualityMode.js:39)), and on it Sundial deletes the entire
   hologram, all four ocean detail systems, both god-ray/glint signatures and the bloom pass. The ocean
   measures 1–11 of 255. If Low is a look people actually ship in, item 36 moves up the ranking sharply.
7. **There is no HIGH-quality capture of this arena anywhere in the repo.** All three committed Sundial
   shots (`shots/smoke-sundial.png`, `shots/run3-sundial.png`) carry the COMPATIBILITY MODE banner and
   show the podium as an empty dark disc with **no hologram at all**. Nothing in the repo shows what the
   hologram, the glint or the shafts actually look like. **Shoot a HIGH frame before starting any of
   this** — several items above are geometry-verified but visually unconfirmed, including the finding
   that the dial plate sits within 0–0.33 m of the chase camera's eye plane and reads as a hairline
   ([`:2159-2174`](../../src/levels/zanzibarPlatform.js:2159), `HOLO_HOVER_Y` 3.75 vs a computed chase eye
   height of 4.269 m).
8. **Sun key vs sun disc: reconcile upward or downward?** Deriving both from one `SUN_ELEV_RAD` is
   clearly right. Matching the light *down* to the disc's 1.87° drops deck N·L from 0.172 to 0.033 —
   too dark. Matching the disc *up* to the light's 9.93° raises the sun in the sky and makes it read
   less like a setting sun. Or leave them disagreeing and accept it as a stylisation. Your call; the
   dropped proposal in §7 assumed the first.

---

## 9. What this pass must not become

**Do not fix the bright horizon by darkening the arena.** The single most likely wrong turn: someone
reads "every distant element is 7–10× brighter than its background" and reaches for exposure, fog
density, or the hemi light. The inversion is a **sky mapping bug** — the warm gradient stops render
below an opaque ocean. Fix the sky and the objects fall into place; touch `arenaExposureMul 1.32`, the
fog hex `0xff5a22` or its `0.00355` density and you have traded a golden-hour arena for a dim one and
still not fixed the seam.

**Do not let "make the raking light read" become "take light away."** The deck genuinely takes ~80% of
its illumination from direction-free fill, and that is a real problem. The fix is *adding* directional
evidence — shafts that cross the deck, backlit dust, baked long shadows, prop grounding — not lowering
the key or the hemisphere. Sundial is warm and open. A dial plate that has gone moody has failed even if
the N·L ratio improved.

**Do not let pink or cyan back in.** Three live vectors: `accentColor` from `sampleArenaReactive` cycles
pink→cyan and must never be plumbed into the hologram; the booth JSDoc still *claims* alternating
pink/cyan rail neon; and two stale comments say "cyan" over code that draws amber
([`:234`](../../src/levels/zanzibarPlatform.js:234), [`:427`](../../src/levels/zanzibarPlatform.js:427)),
which is an invitation for a future pass to "fix" the colour back to the clash that was deliberately
removed. The cool `0x8fd9ff` gate guidance blue is the *one* sanctioned contrast note and it lives on the
horizon, not on the platform.

**Do not turn the wear pass into a grime pass.** Sundial's wear language is **salt, sun-bleach, spray
staining and rust bleed** — bright, dry, high-sun weathering. Cart Rave's is damp concrete and scuffed
vinyl under darkness. Copying that vocabulary here produces a wet, dim, closed-in platform: the exact
inversion of the mood. Every proposed mark above should read as "baked by permanent golden hour and
salt air," never as "sweated on in a basement."

**Do not add uniform noise across 3330 m².** The deck's problem is not that it lacks marks; it is that
its marks are all low-frequency, all isotropic and all concentric. Adding more of the same at higher
alpha makes a busier flat floor. The marks must be *biased* — by traffic lane, by sun azimuth, by
drainage, by where carts brake and where they go over the edge.

**Do not reshape the octagon or the podium.** Eight kill edges, no chamfer, a 9.8° drivable ramp, and
`PODIUM_BASE_R` read by scoring and AI. Every fix above is a *surface* fix or a *placement* fix inside
that shape. The one geometry change sanctioned here is making round things octagonal (item 9) — never
the reverse.

**Do not reinstate per-cart directional blob shadows.** Same flat circle under every cart, no ellipse,
no height shrink, no per-arena bias. There are no shadow maps in this game and there is no exception for
the sundial arena, however tempting the premise makes it.

**Do not trust this document as verified.** Zero verifier passes survived. One of six groups never ran.
Several high-ranking items carry real measurement receipts against `shots/run3-sundial.png` and against
three's own source, and several others are single-read inferences. Shoot a HIGH capture, fix the sky
first, and re-judge everything downstream of it — a large fraction of the water and horizon items will
need their numbers re-derived once the background they sit against changes.
