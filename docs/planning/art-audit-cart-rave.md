# Cart Rave — arena art-pass audit

147 elements across six groups. Four groups (floor-and-pit, dj-booths, crowd-and-stage,
lasers-billboard-vfx) went through an independent verify pass; **skybox-and-space and
lighting-and-atmosphere did not** — their verify agents died on a usage limit. Every
deficiency claim from those two groups is marked **[unverified]** below and should be
re-checked against source before you spend money on it. Where a verifier overturned an
audit call, the verifier's verdict is the one printed here.

---

## Where this arena actually stands

Cart Rave is not an untextured arena — that framing was wrong and the verifiers killed it
repeatedly. The vinyl floor, the pit wall, the seat blocks, the bowl cladding, the booth
plate metal, the LED screen, the sky dome and the ram-boost shader are all genuinely
authored, several of them with recorded iteration against named playtest failures. The real
gap is different and more embarrassing: **a large fraction of the authoring that exists
never reaches the screen.** The record body's maps resolve to a flat border colour because
ExtrudeGeometry hands out UVs in metres and the textures are ClampToEdge
([`arena.js:439`](../../src/arena.js:439), [`:298`](../../src/arena.js:298)). The pit wall's
rivets render as 6:1 ovals because `repeat.set(16, 200)` stretches every panel 5.8×
([`arena.js:162`](../../src/arena.js:162)). The cladding's cart-silhouette motif — real
identity work — renders as a 3.57 m × 0.18 m yellow smear because one `repeat(24, 3)` is
shared by three decks of different circumference ([`effects.js:1441`](../../src/effects.js:1441)).
And the arena's own namesake, the CART RAVE record label, draws its wordmark, its hole cut
and 3 of its 7 runout grooves entirely inside the RingGeometry's inner edge, so what ships
is a blank tinted disc ([`arena.js:1632`](../../src/arena.js:1632)).

The second gap is a genuine absence rather than a delivery failure: there is no light in the
air anywhere the player looks. Every haze system in the level is localised — booth pads,
pit throat, pit void — and the dancefloor volume the beams actually pass through has none of
it, which is why "fog catching lasers" does not happen in any frame. Paired with that, the
stage — the arena's focal object — is an empty polished deck: no DJ booth, no monitor wedges,
no cases, no cable, no performer ([`effects.js:2826-2998`](../../src/effects.js:2826)).

Nothing here needs a redesign. It needs a delivery pass, a light-in-the-air pass, and about
a dozen props that currently exist as placeholder primitives beside well-authored neighbours.

---

## Do not touch — this IS Cart Rave

About 70 elements carry `is_identity`, so a line each would be noise. They cluster into
families. Two of these families **hold up and should not be opened at all**; the rest are
identity *slots* whose delivery is thin — the slot is sacred, the surface is not.

**Untouchable, already right:**

- **The dual-tone rim system** — magenta rim torus at r 26.80, cyan edge ring at 27.14, magenta
  inner rim at 3.70, hot-yellow inner lip at 3.83, all animated on deliberately different rates
  so the two edges never beat together ([`arena.js:1797-1849`](../../src/arena.js:1797)). This is
  the kill edge, and the verifier confirmed it survives thresholding to pure black and white —
  it is the arena's Rule 4 compliance.
- **The four-colour booth neon system** — `boothEmissiveIntensity`'s Rec.709 luma cap at refLuma
  0.42 (pink 1.500 / green 0.806 / cyan 0.890 / orange 1.200) plus 90°-out-of-phase breathing
  ([`arena.js:837`](../../src/arena.js:837), [`:849`](../../src/arena.js:849)). Replacing this
  collapses all four corners into one wash — a documented past regression — and players lose the
  instant read of which booth is theirs.
- **The cart-first mirror** — the Reflector at 512², clipBias 0.003, 0x111111 tint, with crowd,
  stadium, lasers and sky excluded ([`arena.js:1504`](../../src/arena.js:1504),
  [`cheapMirror.js:22`](../../src/utils/cheapMirror.js:22)). The verifier proved the exclusion is
  a level-wide documented policy with a stated reason, not neglect. Un-excluding the beams
  reintroduces the shipped green-booth white sheet.
- **The pit as a lit shaft** — the 0.34→0.05 glow-ring opacity ladder with the single cyan break
  at -18 m, the four haze discs with their radial alpha fade, the symmetric-fade throat cylinder
  at 0.09 ([`arena.js:2136`](../../src/arena.js:2136), [`:2170`](../../src/arena.js:2170),
  [`:2202`](../../src/arena.js:2202)). Every one of these exists because a previous version drew a
  hard purple rim line. Deleting any of them brings that back.
- **The crowd is shopping carts** — ~45 merged primitives fit-scaled onto the real `buildCart()`
  AABB ([`effects.js:537`](../../src/effects.js:537)). Best-authored asset in the level and the
  joke the whole arena rests on.
- **The bowl neon family and the moat dressing** — fascia bands, deck strips, clad seams, 48 ribs,
  parapet crown, gold band, moat rings and 16 LED spokes, all additive, all registered into
  `stadiumPulseMats` ([`effects.js:1278-1681`](../../src/effects.js:1278)). Layered coloured edges
  cutting a dark bowl is the underground-warehouse read working.
- **The ram-boost streak shader** — the one element authored to the standard the direction asks
  for, with distinct instant/charge-release behaviours and two recorded rounds of anti-white-wash
  tuning ([`effects.js:2401`](../../src/effects.js:2401)).
- **The neon void sky dome** — domain-warped fbm club smoke in the cart palette, delivering 70–86%
  of its energy in the elevation band the camera actually sees
  ([`sceneExtras.js:140`](../../src/sceneExtras.js:140)). This is the one sky element that is not
  space at all, and it is on-direction. **[unverified]**
- **The spindle light, the KO flash, the bloom profile and the fog colour** — a hot magenta
  PointLight in the record's centre hole ([`arena.js:1494`](../../src/arena.js:1494)); the 340/240 ms
  multi-fixture KO punch that every consumer explicitly restores from
  ([`arenaReactiveLights.js:84`](../../src/arenaReactiveLights.js:84)); `BLOOM_DISPLAY_NEON` at
  0.25/0.67/0.5/0.025, owner-approved 2026-07-13 ([`scene.js:84`](../../src/scene.js:84)); and
  `0x040112` as both fog and renderer clear. **[unverified for the reactive/bloom entries]**

**Identity slot, thin delivery — keep the slot, change only the surface:** the record label,
the turntable platters, the DJ gear cluster, the booth deck slab, the truss towers (booth and
stage), the stage LED screen, the stage PA stacks, the 46-beam laser rig, the crowd
searchlights and the five-spot world rig. All of these appear ranked below with the specific
constraint on what must not move.

---

## Holds up — do not spend time here

Beyond the untouchable list: the Reflector's tuned values, the 48-band merged groove accent
mesh (the audit's claim that it breaks into a visible 64-gon is geometrically impossible —
[`RingGeometry.js:77`](../../node_modules/three/src/geometries/RingGeometry.js:77) computes both
edges at identical vertex angles), the four neon race rings (they *do* breathe, on three
independent phases, and they are not the floor's only markings), the spindle ring (a
non-tone-mapped white emissive is explicitly exempt per art-direction.md:198, and its neighbours
are equally map-free), the shaft mouth joint (the actual kill boundary is the dancefloor rim at
26.4 m, not the shaft at 44.3 — a live cart can never reach it), the 17.9 m outer void (documented
load-bearing kill space), the arena/moat laser ring (it sits within 0.1 m of the LED spoke
centreline, so it is grounded), the platform neon tubes and chevrons and rails-as-light-runs, the
Medium/Low solid floor path, the crowd placement and rake, the jumbotron screen faces, the
per-booth merge architecture, the sceneExtras five-spot rig, the 24-bulb/4-real-light cheat,
the contact-shadow ruling, and the multi-shell parallax rig **[unverified]** — the archived
"no parallax relationship" charge is false against current code.

---

## The pass

Ranked by visual impact per unit of effort, highest first.

### 1. Fix the record body's UVs — two lines (small)

`ExtrudeGeometry`'s default `WorldUVGenerator.generateTopUV` returns raw shape coordinates as
UV — in metres — so the record body's caps and its 0.28 m outer rim band get UVs spanning
roughly ±26.44 ([`ExtrudeGeometry.js:810`](../../node_modules/three/src/geometries/ExtrudeGeometry.js:810),
geometry at [`arena.js:439`](../../src/arena.js:439)). `buildVinylSurfaceTextures` never sets
`wrapS`/`wrapT` ([`arena.js:298`](../../src/arena.js:298)), so they stay ClampToEdge and every
texel outside a 1 m × 1 m patch samples the canvas border — flat `#0c0818` albedo and flat
`#8080ff` normal. The record body renders as an untextured colour while carrying two maps.
**The pass:** set `RepeatWrapping` and give `recordMat` its own texture clones with repeat scaled
to metres — the pit set already does exactly this at [`arena.js:150`](../../src/arena.js:150) —
or pass a custom UVGenerator that normalises by outerRadius. Then author the rim band as pressed
vinyl edge: matte micro-ribbing, whitened stress marks where carts hit it, grime in the bevel.

### 2. Fix the pit wall's tiling aspect — one line (small)

`repeat.set(16, 200)` on a 44.304 m-radius cylinder 600 m deep gives world panels of
2.90 × 0.375 m against a canvas cell of 85.33 × 64 px — a 7.73:1 panel against a 1.33:1 cell,
i.e. **5.8× horizontal stretch** ([`arena.js:162`](../../src/arena.js:162), [`:35`](../../src/arena.js:35)).
The rivets drawn with `arc(..., 1.6, ...)` render as 6:1 ovals; the 12 px bevel gradients are 6×
wider on vertical seams than horizontal. The comment at [`arena.js:161`](../../src/arena.js:161)
claims "~3 m panel height" when the actual height is 0.375 m — 8× off, which is how it went
unnoticed. **The pass:** `repeat.set(16, 25)` yields 2.90 × 3.0 m panels, close to the canvas cell
ratio, and every rivet, bevel and grime streak already authored starts reading. Set anisotropy on
the roughnessMap too ([`:158`](../../src/arena.js:158) omits it).

### 3. Per-deck cladding repeat — one line, restores an identity motif (small)

One shared `panelTex.repeat.set(24, 3)` and one shared `cladMat` are reused for all three deck
cylinders ([`effects.js:1441`](../../src/effects.js:1441), [`:1454`](../../src/effects.js:1454)).
On the upper deck (r 124.55, circumference 782.6 m, wall 9.8 m) one tile covers 32.6 × 3.27 m —
**9.98:1**. The 28×14 px cart silhouette lands at 3.57 m × 0.18 m and renders as a horizontal
yellow smear. The defect scales with radius, so the lower deck is 4.7:1 and the fix is per-deck
repeat, not a new texture. **The pass:** set repeat per deck from actual circumference and height
(roughly `repeat(96, 3)` on the upper band). Then add a roughness map and vertical grime streaking
under the seams.

### 4. Redraw the CART RAVE record label against its visible band (medium — highest identity payoff)

`RingGeometry(3.7, 7.0, 96)` maps UV by outerRadius, so the mesh's inner edge lands at uv radius
0.2643 = **135.3 px on the 512 px canvas** ([`arena.js:1747`](../../src/arena.js:1747)). Everything
drawn inside that is off-mesh: the entire bold-54px "CART" / bold-50px "RAVE" wordmark (max glyph
radius ~90 px), the divider rule, the destination-out hole cut at 69.1 px, the hole-lip highlight
at 72.1 px, and 3 of the 7 runout grooves (87.1 / 109.8 / 132.5 px). The three stars orbit at
133.1 ± 28.2 px and are bisected. What survives is a body gradient, two pinstripes at 230.4/220.2 px,
four hairlines and three half-stars — then `vinylDetailMat` at renderOrder 1 draws over the label
at renderOrder -1 with 0.38 alpha and veils that. **The arena's namesake ships as a blank tinted
disc.** **The pass:** redraw the canvas against canvas radius 135→256 px so the wordmark, stars and
grooves live in the annulus that renders. Then author it as an object rather than vector art:
off-register ink, a lifted edge, drink ring-stains, a hand-written catalogue number, scuffing at
the run-out land. **Constraint:** it must stay a pale paper label that takes the leader tint —
that read is the crown-jewel gameplay signal.

### 5. Put records on the turntable platters (medium — strongest identity echo available)

`platterMat = createPhysicalMaterial({ color: 0x222222, roughness: 0.12, metalness: 0.9 })`
([`arena.js:814`](../../src/arena.js:814)) — verified bare through `createPhysicalMaterial`, which
injects only `envMapIntensity`. A pristine untextured roughness-0.12 mirror disc, which is the
"pristine untextured PBR" anti-reference by construction. And the platters are **empty**: in the
arena whose entire identity is a giant worn vinyl record, [`:1257-1264`](../../src/arena.js:1257)
places exactly one platter and one dot per deck, and no record mesh exists anywhere. **The pass:**
a slipmat plus a scuffed vinyl disc reusing `buildVinylSurfaceTextures`' own groove/wear language
at small scale, with a paper label; the platter rim underneath gets strobe dots and brushed-metal
roughness instead of mirror chrome. The floor and the decks would finally be telling the same story.

### 6. The four tone-mapping omissions (small)

`bbNeonCyanMat` / `bbNeonMagentaMat` ([`effects.js:3158`](../../src/effects.js:3158)),
`neonMagentaMat` / `neonCyanMat` on the stage ([`effects.js:2857`](../../src/effects.js:2857)),
`ledScreenMat` ([`:2938`](../../src/effects.js:2938)) and `stageFrameMat` ([`:2856`](../../src/effects.js:2856))
all omit `toneMapped = false`, so they run through ACESFilmic at exposure 0.4 while every laser
20 m away explicitly bypasses it ([`:2779`](../../src/effects.js:2779), [`:2794`](../../src/effects.js:2794)).
A grep for `toneMapped` across scene.js, main.js and src/utils returns nothing — no global override
rescues them. A 16 × 8 m LED wall and the jumbotron's "neon" frame render dimmer than the beams in
front of them. **The pass:** set `toneMapped = false` on all four. The stage neon bars are also opaque,
non-additive and never pushed into any pulse list — give them `AdditiveBlending`, `userData.baseOpacity`,
and thicken from 0.08 m to ~0.15–0.2 m so they survive at 18 m.

### 7. Sky laser ring — a half-step indexing accident (small)

8 rim masts sit at `angle = (i + 0.5) * Math.PI * 0.25` = 22.5° + 45°i, r = decks[2].r1, topY 32.9
([`effects.js:1350`](../../src/effects.js:1350)). The 8 sky beams sit at `(i / 8) * Math.PI * 2` = 45°i
at the identical radius, y 33.2 ([`effects.js:3058`](../../src/effects.js:3058)). Same radius, base
heights 0.3 m apart, **exactly 22.5° out of phase** — the arena built the fixtures this band needed
and then aimed every beam into the gaps between them. **The pass:** change the beam angle to
`(i + 0.5) * Math.PI * 0.25` and raise base y to the mast top so the beams leave the beacon tip. (The
palette half of the original claim was refuted — 0xff00ff/0x00ffff are `CART_COLORS.pink`/`.blue`, a
subset of the shared palette, not a divergence.)

### 8. Dress the stage — the cheapest large win in the level (large)

Verified by exhaustion: the complete `stageGroup` inventory is stageBase, stageSkirt, 8 truss poles,
24 tower braces, 2 top-span poles, 11 span braces, ledScreen, ledFrame, 12 speaker cabinets, 12 face
discs, 4 neon bars, 6 SpotLights and 6 targets ([`effects.js:2826-2998`](../../src/effects.js:2826)).
No DJ booth, no CDJs, no monitor wedges, no cable runs, no flight cases, no risers, no barriers, no
performer, no PA flying hardware. A 24 × 10.4 m deck with two truss towers and four speaker columns
standing on it and nothing else. **The pass:** a hand-placed static dressing kit, all merged — a centre
DJ booth with a scrim front, a CDJ/mixer slab with emissive jog-wheel dots, two downstage monitor
wedges, three or four stacked flight cases with stencilled lettering, gaffer-taped cable runs off the
back, and one performer silhouette reusing the crowd person layer with an arms-up variant. A hazer
stage-left motivates the fog.

### 9. A haze layer over the dancefloor, and beams that terminate in it (large)

The direction's literal mood line is "fog catching lasers" and it does not happen in any frame. The
level has three haze systems — 160 booth sprites, the pit throat cylinder, the pit void discs — and
**all three are localised away from the dancefloor**. The booth puffs sit 4 m up and ~30 m out; the
5 world spots ring r 18.48; the crowd searchlights rake r 12–36 at floor level. The ambient dust is
260 motes in a π·35²·30 = 115,454 m³ volume = **0.00225 motes/m³**, dropping to 0.5× on Medium and
0.35× on Low ([`effects.js:82`](../../src/effects.js:82), [`qualityTiers.js:85`](../../src/utils/qualityTiers.js:85)).
Sparse fireflies, not a medium. **The pass:** keep the rainbow motes exactly as they are — they are the
level's signature — and add a separate low, ground-hugging layer over the dancefloor and pit rim:
3–5 large soft additive quads or a shallow shell at y 0.1–1.5 with a noise-scrolled alpha map,
`toneMapped:false`, `fog:false`, mirror-excluded, opacity 0.02–0.05. Budget it as a tier item the way
the booth puffs already are. **Hard constraint from the verifier:** any beam volume added here must be
Reflector-safe or mirror-excluded by construction — additive `toneMapped:false` cones wrote HDR white
into the Reflector once already and were deleted for it
([`effects.js:1693`](../../src/effects.js:1693)).

### 10. Floor wear decals — the "trashed and swept a hundred times" vocabulary (large)

Verified absent exhaustively: a case-insensitive search for skid|decal|spill|gaffer|cableRun|scuffArc|damp
across `arena.js` and `levels/classicRecord.js` returns zero hits, and classicRecord.js is 16 lines that
only call `initArena`. The only floor wear that exists is the generic set inside
`buildVinylSurfaceTextures` — 36 radial scratches, 28 dust blotches, one sheen band, four run-in grooves
([`arena.js:246`](../../src/arena.js:246), [`:266`](../../src/arena.js:266)). None of it is use-specific.
**The pass:** a separate transparent ring layer above `vinylDetailMesh` (renderOrder between 1 and 2) so
it composites independently of the mirror-safety clamp. In priority order: cart skid arcs concentric with
the two race radii (14.2 / 22.6 m); damp patches as roughness-only darkening near the pit rim; 4–6 spilled-
drink rings with dark rims and dried centres; gaffer-tape runs from the booth decks; a cable run over the
record edge. **Hard constraint:** the record spins at 0.35 rad/s
([`main.js:5220`](../../src/main.js:5220)) and every floor layer is its child — traffic wear parented to
the record smears away from where carts actually drive. World-locked decal geometry is required.

### 11. Give the six booth-metal consumers a normal and roughness map (medium)

`buildBoothMetalTexture` returns **one** CanvasTexture — no normal or roughness sibling — and it is
consumed as `map:` by trussLegMat, trussCrossMat, mixerMat, deckMat, coneMat, platMats and panelMats
([`arena.js:320-403`](../../src/arena.js:320), consumers at :768, :774, :782, :791, :806, :877, :903).
Every consumer is a metal (metalness 0.4–0.88), and albedo on a metal barely reads: with no roughnessMap
the specular response is perfectly uniform, so painted-on bolts and seams never catch a passing laser.
Its two neighbours in the same file both carry the full stack — the pit wall has map + normalMap 0.85 +
roughnessMap + vertexColors + clearcoat 0.45 ([`:1982`](../../src/arena.js:1982)), the vinyl detail ring
has map + normalMap + roughnessMap ([`:1542`](../../src/arena.js:1542)). `repeat.set(2,2)` is also baked
onto the shared object at [`:400`](../../src/arena.js:400), so per-prop tiling is impossible without
cloning. **The pass:** return `{map, normalMap, roughnessMap}` like `buildPitSurfaceTextures` does — the
seam/bolt/plate draw calls are already positioned, re-render them to a height buffer — and clone per prop
family so repeat is tunable.

### 12. Booth truss: texel density and the missing diagonals (medium)

Truss legs are `UNIT_BOX` instance-scaled to 0.12 × 6 × 0.12 ([`arena.js:1132`](../../src/arena.js:1132));
BoxGeometry UVs are 0..1 per face and instance scale does not touch UV, so with repeat 2×2 over a 4×4 plate
grid each leg face shows plate cells of **~1.5 cm × 75 cm — 50:1** and bolts ~1 px wide. This is why the
archived "truss is untextured" impression keeps recurring: it *is* textured, it just does not resolve.
Separately, `TRUSS_BRACE_LEVELS` = 4 emits four axis-aligned horizontal boxes per level and there is **no
diagonal member anywhere in `buildBooths`** — 16 towers of byte-identical ladder, not truss
([`arena.js:1137-1167`](../../src/arena.js:1137)). The same defect exists on the stage: six braces per
tower, each a `BoxGeometry(1, 0.1, 0.1)` **and** a `BoxGeometry(0.1, 0.1, 1)` both positioned at the tower
centre axis — an axis-aligned plus, never a diagonal between poles
([`effects.js:2885`](../../src/effects.js:2885)). **The pass:** add diagonal web members as extra matrices
in the existing InstancedMesh (cost stays one draw), vary brace spacing slightly per tower, and scale UVs
by world dimensions at build time for the small-cross-section props. On the stage, drop metalness 0.9 →
~0.5 and roughness 0.32 → ~0.6 so it stops reading as polished chrome.

### 13. The pit's three bare structure materials (medium)

`ribMat` (0x1c1528, metalness 0.88, roughness 0.32), `ringBeamMat` (0x221830, 0.9, 0.28) and `pipeMat`
(0x2a1838, 0.95, 0.2) carry **no maps of any kind** and no vertexColors, bolted directly onto a wall that
carries map + normalMap + roughnessMap + vertexColors ([`arena.js:2046`](../../src/arena.js:2046),
[`:2056`](../../src/arena.js:2056), [`:2066`](../../src/arena.js:2066)). Because the wall consumes an
authored depth gradient and the ribs do not, the ribs stay flat 0x1c1528 all the way down while the wall
fades to black — the un-authored surface gets *more* conspicuous with depth. The pipes at metalness 0.95 /
roughness 0.2 are mirror-polished, in the arena whose brief is "lived in after countless chaotic nights".
**The pass:** one shared painted-steel map set across all three — reuse the pit panel roughness/normal at a
tighter repeat rather than authoring new art. Then paint chipped to bare metal on rib faces where carts
strike, rust below each ring-beam intersection, condensation on the pipes, flange geometry where pipes
cross beams. Raise pipe `radialSegments` 6 → 10 and roughness 0.2 → ~0.5. Instance the 16 ribs, 8 pipes
and 8 stubs while you are in there (~30 of 52 draw calls). Note [`:2123`](../../src/arena.js:2123)
allocates `stubGeo` inside the loop — 8 identical geometries.

### 14. Stage deck slab — flip the material, then author it (medium)

`stageBaseMat = createPhysicalMaterial({ color: 0x0a0a1a, metalness: 0.85, roughness: 0.28 })` on
`BoxGeometry(24, 0.4, 10.4)` plus a 23.6 × 1.25 × 10.0 skirt ([`effects.js:2838`](../../src/effects.js:2838),
[`:2865`](../../src/effects.js:2865)). A near-black 24 m plate at metalness 0.85 / roughness 0.28 is a
mirror-polished chrome sheet by definition — both named anti-references at once, on the biggest single
surface on the stage, facing the authored vinyl floor. **The pass:** roughness → ~0.75–0.85, metalness →
~0.1–0.2, then a deck albedo + roughness pair: ply/tread seams on a 1.2 m module, gaffer-tape X marks and
taped cable runs, heel scuffs and paint scrape at the downstage edge, a darker worn crew track. Skirt gets
black wrap with wrinkles and tour-case rub.

### 15. The stadium's four structural materials (medium)

`shellMat` 0x1a1630 / 0.35 / 0.75, `moatMat` 0x181428 / 0.55 / 0.62, `bayMat` 0x10101c / 0.45 / 0.72,
`bayAccentMat` 0x1a1428 / 0.55 / 0.55 — four flat near-black purples with zero maps and no vertexColors
([`effects.js:849`](../../src/effects.js:849), [`:1108`](../../src/effects.js:1108)). The verifier struck
the "largest untextured area" superlative (the two biggest consumers are under-seat backer cones deliberately
offset below the tread so they never show), but the genuinely visible bare shell stands: the full-ring
mid-deck front wall (~7.3k m², [`:1017`](../../src/effects.js:1017)), both riser faces, the parapet, the two
deck-break floors, the cheeks, and the stage-bay lathe ([`:1132`](../../src/effects.js:1132)) — the
highest-traffic architecture in the level, a bare lathe. **The pass:** one shared procedural concrete/painted-
steel canvas set (albedo + roughness) authored the way [`arena.js:33`](../../src/arena.js:33) already does the
pit panels — form-tie marks and pour seams on the moat and bay, powder-coat chipping and rust bleed on the
risers and parapet, boot polish on the bay apron. Reuse across all four with different tiling; no new geometry.

### 16. Jumbotron core box — the underside is what the chase cam sees (medium)

`bbCore = BoxGeometry(12.4, 3.6, 12.4)` on `createPhysicalMaterial({ color: 0x333344, metalness: 0.85,
roughness: 0.3 })` ([`effects.js:3155`](../../src/effects.js:3155), [`:3173`](../../src/effects.js:3173)) —
pristine untextured PBR plus esports chrome, hung at world (0, 15, 0) directly over a 26.4 m dancefloor. The
verifier narrowed it usefully: the four vertical faces are ~93% clad by screens, scanline planes and neon
frame bars, so **the genuinely exposed unauthored area is the 12.4 × 12.4 m underside** — exactly the face a
chase cam looks up at. The spine terminates at world y 30.8 in open air, nearest structure 79 m away radially,
with a code comment saying so. **The pass:** a plated-steel map set on the core — panel seams, bolt rings,
cable-entry plates, dust on the top face, grime streaks under the screen frames — with the underside getting
the most attention. Terminate the spine in real rigging: a short truss square, 4 chain-motor bodies, slack
cable loops.

### 17. Light masts — 12 boxes doing a hero-adjacent job (medium)

`BoxGeometry(0.5, 17, 0.5)` on `MeshStandardMaterial({ color: 0x1a1826, metalness: 0.7, roughness: 0.5 })`,
no maps ([`effects.js:1344`](../../src/effects.js:1344), [`:1360`](../../src/effects.js:1360)). The comment
calls them "slim truss masts". Four of them ground the crowd searchlights at exactly matching angle, radius
and height — the coupling is exact, not approximate. The same repo already builds real instanced truss on a
plated-steel map for the booth towers, so this is placeholder geometry standing beside a neighbour that solves
the identical problem. **The pass:** reuse the booth `trussLegMat`/`trussCrossMat` and the instanced leg+brace
builder so the masts become 4-leg lattice towers; add a yoke/clamp head where the searchlight sits and a cable
drop. Same fix covers the 20 parapet beacon posts — and hoist `postMat`/`tipMat` out of their loop
([`:1634`](../../src/effects.js:1634), [`:1642`](../../src/effects.js:1642)): `mergeStaticMeshesByMaterial`
keys on `material.uuid`, so 40 per-loop materials each land in a bucket of one and nothing merges.

### 18. Crowd bulbs — ~71% of them are inside the shell (small fix, medium payoff)

24 additive spheres at radius 54.3–89.3 with `y = 1 + rand*6`, while the lower-bowl seating surface is
`-3.0 + (r - 47) * 0.4` — passing y=1 at r=57 and y=7 at r=72
([`effects.js:1757`](../../src/effects.js:1757), [`:794`](../../src/effects.js:794)). 24.3% are buried below
the seating surface outright; beyond r 73.55 they sit behind the cladding cylinder and beyond r 78.2 behind the
full-ring mid-deck front wall, which spans y -3 to 11.9 while bulb y never exceeds 7. **About 17 of 24 are
invisible from the field**, and some of the four real PointLights are among them, lighting the shell from
inside. **The pass:** key y off the deck surface at the sampled radius (the same `surfaceY` expression already
used for crowd placement) plus a 2–4 m hang. Then hang them from something — a thin instanced festoon between
the masts, or short truss drops — and add a dark cap/socket so the powered ones read as fixtures.

### 19. The crowd never responds to anything (small–medium)

`sampleArenaReactive(nowMs)` is sampled at [`effects.js:1882`](../../src/effects.js:1882) and consumed by the
searchlights, the moat glow and `stadiumPulseMats` — **the crowd instance loop at
[`:1959-2008`](../../src/effects.js:1959) never reads it.** The audience bounces on a fixed three-tier hash
through a KO, through a leader change, forever. And the rates are far below any rave tempo: the mid tier is
0.95 Hz, high 1.43 Hz, low 0.48 Hz. Separately the crowd material is `MeshBasicMaterial({ color: 0xffffff })`
for all three layers ([`:645`](../../src/effects.js:645)), so the four searchlights, four crowd PointLights and
six stage spots pass through 5000 instances with zero effect — in a rave, the beam sweeping across the crowd
*is* the shot. **The pass:** feed `reactive.intensityMul` and `koT` into baseFreq/baseAmp in the same
round-robin loop (one multiply per instance) and add a KO spike. Keep MeshBasic, but modulate `instanceColor`
by a cheap analytic "is a searchlight pointing near me" term from the four sweep angles already computed at
[`:1900`](../../src/effects.js:1900). Desaturate the base palette 25–35% first so a lit hit has somewhere to go
— all five tints are currently the same fully-saturated `CART_COLORS` primaries as the player carts, which is
why the stands read as a candy field.

### 20. One beat clock (medium)

Nothing in the venue is tempo-locked. `stadiumPulseMats` breathes at `sin(nowSec * 1.3 + i * 1.7)` = 0.207 Hz
= **12.4 BPM** ([`effects.js:1955`](../../src/effects.js:1955)); the real spread across the venue is 3–29 BPM
— crowdGlow 3.3, bulbs 14.3, stage LED 19, billboard 28.6, ambient accent 7.5. Every element free-runs on its
own phase offset. There is no audio analyser, no beat clock and no BPM constant anywhere in arena code; the only
`bpm: 128` in the repo is the 2D menu's own config ([`cart-rave-menu.js:134`](../../src/cart-rave-menu.js:134)).
Laser motion is a single-axis sine at 0.3–0.5 rad/s with one genuine event break: a 320 ms KO punch. The leader
branch is dead — `ARENA_LEADER_TINT_ENABLED = false` forces `hasLeader` false permanently
([`arenaReactiveLights.js:18`](../../src/arenaReactiveLights.js:18)), so all four tuned `leaderMix` constants
(0.16 / 0.14 / 0.12 / 0.55) are permanently on the else branch. **The pass:** one exported arena beat clock
(phase + downbeat flag, 128 BPM — no audio analysis needed) with three subscribers: `stadiumPulseMats`, the spot
intensity wobble, and beam-shell opacity. Keep the existing sine as the base sweep. Add an occasional 8-bar cue
that fans the stage band or blacks the rig for one beat. Separately: **decide the leader tint in this pass** —
re-enable at the existing low mixes or delete the four dead branches. Do not leave it half-wired.

### 21. Laser beam primitive — port the recipe that already exists 30 m away (medium)

All 46 beams are `CylinderGeometry(radius, radius, length, 8)` — untapered, 8 segments, capped — with
`MeshBasicMaterial` carrying no map, no alphaMap, no gradient ([`effects.js:2768`](../../src/effects.js:2768),
[`:2772`](../../src/effects.js:2772)). The correct recipe is in the same level: the sceneExtras spotlight beams
are 3 nested **tapered** open cylinders at 16 segments (sourceRadius/floorRadius 0.42/1.15, 0.72/2.05,
1.05/3.15) driven by a 2×128 alpha-gradient map so both the aperture and the floor foot dissolve
([`sceneExtras.js:711`](../../src/sceneExtras.js:711), texture at [`:660`](../../src/sceneExtras.js:660)).
**The pass:** taper the sheath, `openEnded: true`, add the gradient map, raise radialSegments 8 → 12, and add a
soft additive aperture flare at the base. Keep the white core and the additive/`toneMapped:false` treatment.

### 22. Fixture bodies where beams and lights come from (medium)

The stage laser fan and the six stage spots emit from the same six bare points on a `BoxGeometry(0.1, 0.1, 1)`
span brace — two rigs, zero hardware ([`effects.js:3012`](../../src/effects.js:3012),
[`:2977`](../../src/effects.js:2977)). The 20 deck-ring beams sit 0.15 m above a lit deck strip (well grounded)
but still have no pod. The sceneExtras five-spot rig — the level's best-authored light — has no fixture at
y=25 either; the gradient's zero-alpha top is being used to hide the missing lamp. **The pass:** author one
reusable moving-head (yoke + can + clamp, powder-coated black, three slots of geometry) and instance it at the
stage truss points, the deck lips and the sceneExtras sources, each rotated to its beam, with a visible
power/DMX drop. On the moat ring, low-profile floor cans with a base plate and a cable tail.

### 23. Stage spotlights are effectively dead (small)

`new THREE.SpotLight(color, 3, 30, Math.PI / 6, 0.5)` — six arguments, so decay defaults to 2
([`effects.js:2981`](../../src/effects.js:2981)). Over the ~16.5 m throw to the deck that gives
3 / 16.5² × 0.75 ≈ **0.008** before the arena's 0.4 exposure — roughly 9× dimmer than the crowd searchlights.
The level's own calibration proves the value is wrong: [`sceneExtras.js:772`](../../src/sceneExtras.js:772)
sets intensity 22 with the comment that 12 read as a dull grey wash. **The pass:** raise into the 12–22 range
or set decay to 1.5 to match the searchlights, and stagger per-light intensity flicker with the six colours
rotating on a shared phase so the stage reads as a programmed rig.

### 24. The crowd is bowling pins and the glowsticks do not glow (medium)

The person variant is exactly two primitives: `BoxGeometry(0.48, 0.85, 0.32)` + `SphereGeometry(0.2, 8, 6)`
([`effects.js:498`](../../src/effects.js:498)). No arms, legs, neck, shoulders or stance variation — 33% of
the audience, standing beside a 45-part cart silhouette. World height is 0.38–0.68 m, so they are **shorter than
the carts next to them**. The glowstick variant is named for a prop that cannot emit: `setColorAt` is called
exactly once per instance and never again anywhere in the file, so InstancedMesh carries one colour for body and
stick together — the stick physically cannot be brighter, and at 0.022–0.039 m world thickness it is sub-pixel
at stadium distance ([`:513`](../../src/effects.js:513), [`:827`](../../src/effects.js:827)). **The pass:**
3–4 authored silhouette variants at ~100 tris (arms-up, arms-crossed, shoulder-lean, hooded) with stubby limbs
and a shoulder taper, added as extra layers alongside the existing three. Split the glowstick into its own
additive `toneMapped:false` InstancedMesh sharing the person transforms, thickened to ~0.12 m, so it blooms while
the body stays dark.

### 25. The DJ gear cluster — 2 m from the spawn camera every round (medium)

`deckGeo = CylinderGeometry(0.5, 0.5, 0.08, 16)` — a hockey puck with no tonearm, pitch fader, start button or
target light anywhere in the entire gear block ([`arena.js:788`](../../src/arena.js:788), block read at
[`:1203-1281`](../../src/arena.js:1203)). `coneGeo = CylinderGeometry(0.3, 0.3, 0.04, 12)` is a flat 12-sided
disc wearing the truss's plate-metal grid — not a cone, no dust cap, no surround, no basket, no bolts
([`:804`](../../src/arena.js:804)); the woofers are the same defect one size down and share the material
([`:811`](../../src/arena.js:811)). `knobMat` is the one booth material that skips `createPhysicalMaterial`
entirely — `MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.8 })`, five octagonal chrome
posts spanning 1.0 m of a 2.6 m panel, leaving 62% of the mixer face empty
([`:818`](../../src/arena.js:818), [`:1266`](../../src/arena.js:1266)). The mixer face itself wears the generic
4×4 plate grid where channel strips, faders, VU ladders and a crossfader belong, plus a flat unmapped emissive
washing booth hue evenly across 2.6 m ([`:902`](../../src/arena.js:902)). **The pass:** one authored driver
geometry and material reused at two scales; a low box deck body with a recessed platter well plus a coarse
tonearm silhouette (that alone transforms the read at gameplay distance); real knob shapes spread across the full
panel; and one canvas builder for the mixer face with an emissiveMap so only the LEDs glow. The merge pass is
per-material, so new materials created once and shared across all four booths cost one draw each — these are
affordable.

### 26. Booth deck slab — the only Rule 1 allowlist entry running albedo-only (large)

`platMats` = map + booth hue + scalar roughness 0.48 + metalness 0.55 + unmapped emissive
([`arena.js:875`](../../src/arena.js:875)). It passes Rule 1 (it has a map) but it is the one allowlisted
Cart Rave surface without normal or roughness — the pit wall has the full stack, the vinyl detail ring has all
three. One uniform gloss across 7 × 5 m, and the flat emissive lifts the whole slab uniformly, flattening the
plate detail under it. Carts spawn on this every round and every player looks at it from 3 m. The generic scuffs
and grime streaks *do* land here at a workable 3.5 × 2.5 m tile — what is missing is placement-specific wear.
**The pass:** roughnessMap + normalMap from the upgraded `boothMetalTex`; replace the flat `emissive` with an
emissiveMap so only plate edges and seams glow; then four launch scuff arcs at the front lip, gaffer strips over
cable runs, a chipped front edge, grime pooled at the rail feet. Do not change shape, hue assignment or collider.

### 27. Speaker cabinets, stacks, and the sunk bottom row (medium–large)

Booth cabinets are a single `BoxGeometry(0.9, 1.6, 0.9)` with `boothGrilleTex` as the one map, so **back, sides,
top and bottom all render speaker cloth** ([`arena.js:796`](../../src/arena.js:796)); the weave is correctly
scaled at ~4.4 mm cells but `buildBoothGrilleTexture` never sets `anisotropy`, so it filters at 1 while the plate
texture uses 4 — grazing-angle shimmer. No feet, tilt, corner caps, handle recess or connector plate. On the
stage, 12 identical `BoxGeometry(2, 2, 2)` cubes with a flat unlit 0x222222 disc glued on
([`effects.js:2948`](../../src/effects.js:2948)) — and the deck top is y 1.55 while the bottom row is centred at
1.5, so **1.05 m of each 2 m bottom cabinet is inside the deck** (the face discs are partially buried, not absent
— they clear by 0.55 m). **The pass:** split the booth cabinet into tolex/ply body plus a front-face grille, add
corner caps, a side handle recess, feet and a rear connector plate with a cable to the mixer; set anisotropy 4.
On the stage, author one line-array cabinet and instance it angled down toward the pit, raise the bottom row onto
the deck, add a subwoofer row. A 0.5% scale on the reactive kick sells "speakers vibrate".

### 28. Vinyl floor delivery — density, anisotropy, and the compositing budget (medium)

Two related items on the hero surface. **Density:** with no `repeat` set, 512 px covers 26.4 m of radius = 19.4
texels/m — one texel per 5.15 cm, 10.3 cm on Low — for 36 scratch strokes and 28 blotches total. (The verifier
corrected two supporting figures: a land+valley cycle is 5.4 texels, not 2.7, so the mid-distance flattening
claim is weaker than stated; and anisotropy 4 is a house constant at all 15 call sites in the repo, not a
Cart-Rave regression — `getMaxAnisotropy()` is never called anywhere.) **Compositing:** the shipped High path
draws the maps on a ring at opacity 0.38 over a Reflector tinted 0x111111, whose overlay blend returns ~1% of
anything below 0.5. The albedo grooves are authored as `rgba(62,42,88, 0.07)` over `#0c0818` — a ~3.5/255 sRGB
delta — then multiplied by 0.38, which is **below 8-bit quantization**. Only the normalMap (scale 0.45) and the
roughnessMap actually carry the grooves to screen. **The pass:** keep the base texture as the record. Add a small
tiling RepeatWrapping grunge/normal detail tile at 2–4 m repeat so groove-scale detail dies into surface-scale
detail rather than into flat grey. Then split the display layer: keep the ~0.38 specular pass for the mirror
interaction and add a second pass carrying **only roughness + normal** at full strength — roughness breakup is
what makes worn vinyl read and it carries no blowout risk. Do not raise opacity blindly; 0.38 and the 0x111111
tint exist together to kill the documented white-pool blowout in front of the green booth
([`arena.js:1458`](../../src/arena.js:1458)). Re-shoot that angle with `npm run shoot` before and after.

### 29. Close the 0.30 m gap in the arena's edge silhouette (medium)

The mirror plane sits at local y 0.441 because `reflectorYOffset` = visualRecordTopY 0.14 + **`concentricRings.yOffset` 0.3** + 0.001 — a groove-height constant being read as a floor-plane height
([`arena.js:1502`](../../src/arena.js:1502), [`config.js:44`](../../src/config.js:44)). So the play plane floats
0.301 m above the slab top with open air between, and the arena's outer silhouette is a 4 cm-thick mirror disc
with a separate 0.28 m slab hanging 30 cm below it. From any camera below the play plane — the fall/KO cam, the
spectator orbit — the FrontSide-only Reflector vanishes and the slab's top cap is exposed, which is the face with
the broken ClampToEdge UVs from item 1. **The pass:** do not move the play plane (physics, spawn heights and the
booth gap all key off y=0). Raise `visualRecordY` or thicken `VISUAL_RECORD_THICKNESS` so the slab top sits
directly under the mirror, then author the resulting outer band as pressed vinyl edge.

### 30. Two smaller, cheap ones

**Seat wear (medium):** the seat canvas contains zero `Math.random` calls — fixed 8-across, aisle hard-coded at
`i % 4 === 3`, two alternating tones, one row divider — tiled `repeat(40, 5)`, so it is perfectly periodic and
completely unworn ([`effects.js:864`](../../src/effects.js:864)). No gum, cup rings, missing seats or taped rows,
because no per-texel variation exists at all. Add a roughness map off the same canvas plus a light grime layer,
a handful of punched-dark missing seats, and aisle litter. **Keep the exact palette** — the comment records that
a rainbow version was rejected for reading as a cartoon LED wall, and that restraint is correct.

**Pit depth ticks (small):** five `BoxGeometry(0.8, 0.12, 0.08)` dashes spread 72° apart, one per depth, on a
278.4 m circumference — 0.287% each, none repeating around the ring, so any camera sees one or two floating
dashes ([`arena.js:2233`](../../src/arena.js:2233)). The comment names "depth marker numerals" and the geometry
delivers none. Either finish it — actual stencilled numerals on a painted plate, repeated 8–12 times around each
ring, paint half worn off, lower ones barely legible — or cut it. Cutting costs nothing visually.

### 31. Booth dressing: side panels, diamonds, spindle dots, fog puffs (small–medium)

`sidePanelMats` is a plain `MeshBasicMaterial` at opacity 0.14 additive on a 4.0 × 1.0 m quad with no map, no
gradient and no falloff, never pulsed ([`arena.js:886`](../../src/arena.js:886)). `diamondGeo` is
`PlaneGeometry(0.5, 0.8).rotateZ(π/4)` — a rotated rectangle with four straight edges — sitting 2 cm proud of it,
additive with uniform coverage to the polygon edge ([`:915`](../../src/arena.js:915)). `dotMats` is
`MeshBasicMaterial({ color })` and nothing else, an unlit 16 cm chip standing in for a spindle target light
([`:910`](../../src/arena.js:910)). And all 160 fog puffs share one perfectly symmetric three-stop radial
gradient with no noise or edge structure, so overlapping puffs stack into a soft even ellipse rather than smoke
([`:976`](../../src/arena.js:976)). **The pass:** turn the side panel into a tensioned scrim or printed banner
with weave, sag, creases and grommets (the three neon strips built over it already pulse, so the region is
animated — only the panel is flat). Delete the diamond or promote it to a real LED sign panel with a dark bezel
and an emissiveMap glyph. Fold the spindle dot into the platter rebuild. Give the fog 3–4 noise-based puff
variants — note that per-sprite rotation is not reachable: `SpriteMaterial.rotation` is per-material and the
40-puffs-per-booth material sharing is a recorded perf fix.

### 32. The truss beacon tips — downgraded, still worth a pass (medium)

The original call of `bare_filler` was **overturned to `reads_thin`**: the claim that it is "the lone
non-breathing emissive" is false (platMats, panelMats, sidePanelMats, diamondMats and dotMats are all
non-breathing too), and comparing an exempt emissive against an allowlisted hero surface is something the
direction doc explicitly forbids. What survives is real but smaller: `trussLightGeo` is
`BoxGeometry(0.5, 0.3, 0.5)` with no child housing, lens, yoke or clamp, and `buildBooths` contains **zero light
constructors** — the only lights in arena.js are the spindle and the two pit lights, all outside the booth
builder, and booths sit 30.4 m out, beyond the spindle light's 30 m range
([`arena.js:779`](../../src/arena.js:779), [`:1168`](../../src/arena.js:1168)). Also note
[`:1168`](../../src/arena.js:1168) records this as a deliberate choice, not an unfinished stub. **The pass:** the
fixture *slot* is identity; author a moving-head/par-can with a dark housing on a yoke and an emissive lens face
only, using the shared plate map on the shell, clamped to the truss. Push the lens into `boothNeonMeshes` so it
breathes.

---

### [unverified] — lighting and atmosphere

These six come from the group whose verify pass died. Two of them are **partially corroborated by verified
evidence from other groups** and are noted as such; the rest are unchecked.

- **The IBL is a neutral photo-studio room.** One PMREM bake of three's stock `RoomEnvironment` at
  `environmentIntensity` 0.6, shared by every level ([`scene.js:272`](../../src/scene.js:272)) — so every metal
  and clearcoat in an underground warehouse rave reflects neutral grey, and the vinyl floor needed
  `clampFloorEnv` to drop to ~0.06 as a workaround. Sundial already proves the fix and the swap plumbing:
  a 128×64 canvas equirect assigned on load ([`zanzibarPlatform.js:577`](../../src/levels/zanzibarPlatform.js:577)).
  **Corroboration:** the floor-and-pit verifier independently confirmed `scene.environmentIntensity` = 0.6 and
  established that `userData.envMapIntensityScale` is a **no-op** for any material without an owned envMap
  ([`WebGLRenderer.js:2693`](../../node_modules/three/src/renderers/WebGLRenderer.js:2693)) — so the pit wall's
  1.45, ribMat's 1.2, ringBeamMat's 1.25 and pipeMat's 1.3 all do nothing. Authoring a Cart Rave probe tints
  every reflection with the room's own neon and removes the root cause of the floor clamp. Medium.
- **The five world spots are always perfectly vertical.** The aim target is set to `(lightPos.x, platformTopY,
  lightPos.z)` — identical XZ to the lamp — so the beams never tilt, rake, converge or cross; the pools just slide
  along an 18.48 m circle at 0.04 Hz ([`sceneExtras.js:823`](../../src/sceneExtras.js:823)). Five vertical pillars
  orbiting slowly is architectural lighting, not a rave rig, and it is a pure math change in the existing loop.
  Medium.
- **The beam cones vary only along their length.** The alpha map is 2 px wide, so alpha is flat across the shell —
  which is why a hollow cylinder reads brightest at its silhouette rims, the opposite of a real shaft
  ([`sceneExtras.js:702`](../../src/sceneExtras.js:702)). Add a fresnel/view-dot term, a slow scrolling noise
  offset, and raise the inner shell to 24 segments. Medium. Related: the floor pools are clean unbroken circles
  over a floor deliberately given 36 hairline scratches, and the mesh is 5.6 m while the real 20.6° cone from
  y=25 lands ~9.4 m — a shared rotating gobo texture fixes both. Small.
- **The ambient dust is self-lit confetti.** 260 motes with baked rainbow vertex colours from `CART_COLORS`, so a
  mote glows magenta inside the green spot, inside the blue spot, and in pitch darkness
  ([`effects.js:377`](../../src/effects.js:377)). Real airborne dust is neutral and takes its colour from the beam
  crossing it — which is exactly the "fog catches coloured lasers" read the arena is missing. Neutralize to
  near-white at lower opacity and tint each mote toward the nearest spot's current colour on a slow interval,
  keeping count and drift. Medium.
- **The reactive system feeds one fixture.** Five subsystems sample `accentColor`, but four gate on
  `leaderMix > 0 || koT > 0` and `leaderMix` is permanently 0, so at rest the magenta↔cyan cycle reaches only the
  spindle PointLight ([`arenaReactiveLights.js:119`](../../src/arenaReactiveLights.js:119)). Same mechanism means
  **entering Sudden Death visibly changes one lamp's hue**. Give the cycle a second always-on low-amplitude
  channel the gated consumers can read. Small. **Corroboration:** the lasers verifier independently confirmed the
  dead leader branch.
- **LOW loses the entire identity layer.** `wantSky` false means `initSceneExtras` is never called — no spotlights,
  no beam shells, no pools, no sky — while `isLowQualityMode()` skips all 160 fog sprites and `laserBudget: "off"`
  kills all 46 beams, the 4 searchlights and the 6 stage spots
  ([`main.js:2510`](../../src/main.js:2510), [`qualityTiers.js:62`](../../src/utils/qualityTiers.js:62)). The tier
  cuts are individually defensible; the aggregate was never judged as a frame. Define a minimum identity set that
  survives — the 5 SpotLights without cone shells, or baked light-pool decals plus the inner shell only. Medium.

### [unverified] — sky and space

- **Tick `sceneExtras.update` on the attract loop.** It is called exactly once in the codebase, inside the game
  frame loop ([`main.js:5226`](../../src/main.js:5226)), so on the menu — the first 3D frame every player sees —
  the dome's `uTime` is pinned at 0 and the club smoke renders as a motionless still, the parallax never applies,
  and the spotlights never drift. The update already early-outs on `!skyRoot.visible`. Cheapest item in the whole
  audit. Small.
- **The UFOs are `MeshBasicMaterial({ color: 0x888888 })`** — flat neutral mid-grey, unlit, unmapped, on a
  12-segment hemisphere reading 48–61 px with visible ~16 px chords ([`sceneExtras.js:461`](../../src/sceneExtras.js:461)).
  The bitter part is placement: at 5.7–18.2° elevation they are the **only** space props that intersect the
  ~11–18° band the camera can see past the parapet. Everything well-authored is out of frame and the worst thing
  in the file is in it. Large.
- **Three "soft" things that cannot be soft.** The nebulae, the planet atmosphere halo and the moon are all
  `MeshBasicMaterial` with a constant colour and constant opacity — every fragment identical, so what draws is a
  hard-edged flat ellipse with no falloff at the silhouette, despite comments calling them "soft additive nebula
  blips" and "soft atmosphere halo" ([`sceneExtras.js:276`](../../src/sceneExtras.js:276),
  [`:355`](../../src/sceneExtras.js:355), [`:313`](../../src/sceneExtras.js:313)). The halo is a 198 px ring of flat
  3% pink with a hard circular edge — worse than no halo. The fix is one line of reuse: `createRadialTexture` at
  [`:29`](../../src/sceneExtras.js:29) already exists and the galaxies already use it.
- **The outer ground disc, grid and horizon layer cannot be seen at all.** A sightline from camera height h to the
  disc's inner edge crosses r=124 at `y = 0.0335h − 2.977`, so clearing the 35.5 m parapet requires **h > 1149**;
  the tallest camera in the game is the countdown flyover at 14 m. The "grid" is also not a grid — `wireframe: true`
  on a 64-segment RingGeometry draws 64 spokes plus triangulation diagonals, a starburst
  ([`sceneExtras.js:546`](../../src/sceneExtras.js:546)). Four draw calls of nothing. **Conflict to resolve:** the
  lighting group rated the horizon fog cylinder and the violet glow band `holds_up` while the sky group rated both
  `reads_thin` and recommended deleting them. Both reads are unverified. The sky group's arithmetic (the glow band
  adds under one 8-bit code value after ACES at 0.4) is the more specific of the two.
- **The sky is excluded from the vinyl mirror wholesale.** Correct for the 2200-point star clouds; it also sweeps in
  the one-draw sky dome ([`main.js:2541`](../../src/main.js:2541)). Registering per-object rather than per-root
  would let the dome into the reflection. **Caution:** the lasers verifier proved the analogous "the sceneExtras
  beams demonstrate the fix" claim is **false** — those beam groups are excluded too, and adding additive
  `toneMapped:false` geometry to that RT is the exact failure already on record. Treat any un-exclusion as a
  regression risk, not a free win.

---

## Open questions for Wyatt

**1. Does a literal space skybox serve an underground warehouse party, or fight it?** The file ships two skies
bolted together. Sky A is the neon void dome — domain-warped smoke ribbons in the cart palette, described in its own
comments as "swirling club smoke". Sky B is literal outer space: 3580 stars, 3 nebulae, a moon, a ringed gas giant
with a halo, 2 galaxies, an orbiting station, 2 flying saucers. The dome says *we are inside, under smoke and
lights*; the gas giant says *this arena floats in orbit*. Three facts, all **[unverified]**, should shape the call.
(a) The player barely sees any of it: the parapet is a full 360° lathe at r 124 rising to y 35.5, subtending
10.8–17.4° from a 6 m eye, and the chase camera's top-of-frame is +16.1° at base FOV — so the visible sky is roughly
a 0–5° sliver. Every hand-placed landmark sits above it (station 17.5°, moon 20.2°, planet 24.1°, galaxies 24.1° and
31.8°, nebulae 30–70°); only the UFOs intersect the band, and they are the worst-authored objects in the file.
(b) The cost of changing course is near zero right now — SKYBOX-1 turned this rig on for the first time ever on
07-30 and it is still logged as "Wyatt eyes owed", so no player has formed an attachment to it. (c) The three
options genuinely trade off: **cut space** (delete nebulae, moon, planet group, galaxies, UFOs; re-read the star
shells as haze specks; spend everything on the dome — cheapest, removes ~22 draws, most on-direction, and loses
whatever "this arena is somewhere strange" the space props were buying); **commit to space** (author maps on the
planet and moon, a real ring plane, a structured galaxy, replace the saucers, and lower every landmark to 12–18°
so it clears the parapet — most expensive, and it puts the sky in permanent tension with the mood line); or
**open the bowl** (break the parapet or raise the chase camera so any sky investment actually reaches the frame —
the only option that makes sky money pay, and the only one that is an arena-layout change with gameplay
consequences). There is a fourth reading nobody has tested: that a smoke-and-stars ceiling reads as *outdoor
festival* rather than *warehouse*, which is a different party but not necessarily a worse one.

**2. Should the beams come back into the mirror, or stay out?** The vinyl record is a reflective hero surface and
it currently shows carts, booths, stage and stadium against a flat clear colour where every light source should be.
That is the arena's most characteristic reflection and it is switched off. But the exclusion is not neglect — it is
a documented policy with a stated reason (crowd instances drowning out the carts), and the one time additive
`toneMapped:false` cones were allowed into that RT they produced the shipped green-booth white sheet. The verified
finding here is that **no rig in this level demonstrates a safe beam-in-mirror**; the "sceneExtras already solved
it" claim was checked and is false. So the question is whether to spend real effort making beams Reflector-safe
(floor-pool quads at aim points, or a separate low-dynamic-range beam variant for the reflection pass) or accept a
mirror that shows hardware and carts but never light. There is also a middle option, **[unverified]**: let the five
SpotLights back into the mirror pass without their cone geometry — lights add no draw calls and it would align the
reflection's light count with the main pass.

**3. Leader tint: finish it or delete it?** `ARENA_LEADER_TINT_ENABLED = false` with four already-tuned mix
constants (0.16, 0.14, 0.12, 0.55) sitting on permanently-dead branches. Re-enabling at those low mixes was
specifically tuned to avoid the muddy single-accent wash that got it disabled — but it also means the ambient
magenta↔cyan cycle would finally reach more than one lamp. Deleting it makes the reactive system honest about how
small it actually is. Either is defensible; leaving it half-wired is the one option that is not.

**4. How dark should the pit be, and for what reason?** Verified: neither pit light reaches the wall — `pitRimFill`
has distance 28 against a wall at 44.304 (contribution exactly zero) and `pitUplight` delivers ~0.007 there. The
shaft's visible surface is lit almost entirely by IBL. But the verifier also established that **the darkness is
authored on purpose** — a short falloff gradient with a recorded "creepier void read" comment, four haze discs of
climbing opacity, five decaying glow rings. So the question is not "is the lighting broken" but "do you want the
plated panels you paid for to be visible at all?" A ring of 6–8 low-intensity violet lights at r ~40 just below the
mouth would make the rivets and ribs read; keeping it as-is means item 13's map work is largely wasted and should be
descoped instead.

**5. Do the crowd searchlights need beams, or does the room need haze?** The two verify passes disagreed on where to
book this. The crowd-and-stage verifier upheld `reads_thin` on the searchlights themselves (no beam volume, so four
of the arena's most important moving lights are invisible above floor level). The lasers verifier corrected the same
element to `holds_up` — the rig is well authored, exactly grounded on its masts, palette-consistent, with per-index
sweep speeds and an intensity wobble, and the missing beam is a **level-wide medium problem**, not this element's
defect. Both are factually right. The call is whether you fix it at the fixture (beam shells on four lights) or at
the room (a dancefloor haze layer that makes every existing light read). The room fix is more expensive and fixes
more.

---

## What this pass must not become

The failure mode is **a texturing sweep that makes Cart Rave read as a generic dark stadium with neon trim.**
Concretely, five ways to lose it:

**Do not put maps on the emissive.** The direction exempts `toneMapped: false` neon explicitly, and the cart contract
states that wear maps on emissive kill the bloom contribution and break the palette. Two findings in this audit were
overturned precisely for holding exempt emissives to the hero-surface standard. The magenta/cyan rim tori, the four
booth hues, the pit glow ladder and the race rings must stay clean light.

**Do not brighten the pit or the room to show off new material work.** Blacks staying black is Rule 3, the darkness
is authored with a stated "creepier void read" intent, and the whole point of the contrast device is that neon
explodes off it. If a new map only reads when the exposure goes up, the map is wrong, not the exposure.

**Do not turn the wear language into grime for its own sake.** The vinyl floor's 36 hairline play-wear scratches
work because they are *play wear on a record* — radial, rotationally coherent, caused by a stylus. The Sundial deck's
46 traffic-wear scuff arcs work because they are where people walk. Generic dirt sprayed over everything is the same
failure as pristine PBR, one step sideways. Every mark should answer "what did this?"

**Do not lose the record.** The floor spins at 0.35 rad/s and every layer parented to it turns with it. The
concentric/radial discipline is not a limitation to work around — it is why the arena reads as a turntable rather than
as a disc with stuff on it. World-locked puddles, off-axis decals and asymmetric grime will visibly rotate and the
illusion dies. Likewise the label must stay a pale paper label that takes the leader tint, and the platters must gain
records rather than lose their circular read.

**Do not let "real venue hardware" swallow the Saturday-morning-cartoon register.** The direction asks for
handcrafted and full of personality, *not photoreal* — readable silhouettes, dense small details that reward looking.
Comic Sans in the billboard font rotation is on-register, not a mistake. If the truss, the fixtures, the flight cases
and the cable runs arrive as accurate touring-industry modelling, Cart Rave becomes a competent virtual concert venue
and stops being a game where the audience is shopping carts.
