# Art direction — Cart Clash

> **Canonical.** When this file and any other doc, code comment, or archived audit disagree
> about the look, this file wins. Settled with Wyatt 2026-08-01. Supersedes the "dark arenas +
> punchy neon, never brighten" rule — see [§ Supersession](#supersession).

## The law

**A frame fails if a surface reads as untouched — clean, generic, and machine-made.**

Every hero surface in this game is a real object that has survived a lot of nights. If you can
look at a cart, a floor, or a wall and not find wear on it, that surface is not finished. This
is the one assertion a single screenshot can fail.

The arena floors already pass it. The carts do not, and neither does every prop standing next
to a well-authored surface — see [§ what is already authored](#what-is-already-authored--read-this-before-assuming-a-surface-is-bare).

---

## The direction

Cart Clash is **handcrafted and full of personality, not photoreal** — everyday retail
environments turned into tactile dioramas. The lighting model stays physically based. The
craft lives in the **materials**, not in a shading trick.

Take the warmth and material tactility of *Yoshi's Woolly World* and *LittleBigPlanet*, the
readable silhouettes and environmental storytelling of *Paper Mario*, and the grounded lighting
and material definition of modern fantasy realism. Add the surface language of *Scorn* — its
tactility, aging, and physicality only, never its body horror or grotesquerie.

Underneath the playful exterior is a real night out at a rave. Neon cuts through darkness, fog
catches colored lasers, speakers vibrate, concrete is damp, carts are scratched and dented, and
the place feels lived in after countless chaotic nights. **The darkness is a contrast device,
not a mood** — it exists so the color and energy explode off the screen. An underground
warehouse party, not a horror film: there is mystery just past the lights, but the overwhelming
emotion is excitement, chaos, and fun.

The world should read as a Saturday-morning cartoon built from real, tangible objects:
colorful, stylized, highly readable, and dense with small details that reward looking.

### Settled axes

**Surface inventory: real materials, worn.** Concrete, powder-coated steel, scuffed plastic,
gaffer tape, damp asphalt, cracked vinyl. "Handcrafted" means *authored wear and surface
detail* — it does **not** mean the world is built from felt, yarn, or cardboard. Woolly World
and LBP are references for warmth and tactility, not for literal craft materials.

**Diorama: figurative only.** Cozy, tactile, hand-placed. No scale cues, no tilt-shift, no
camera tricks, no oversized-detail miniature read.

**Brightness: per arena, no global number.** Each arena's exposure and bloom budget comes from
its own theme. The global `toneMappingExposure: 0.4` lock is retired. Blacks stay genuinely
black; the punch comes from lit surfaces and emissive, not from flattening the low end.

**Screen filters: Backrooms only.** The CRT/VHS arcade layer is a per-arena device, not a
global veneer. It is identity in The Storerooms and noise everywhere else.

**Frozen:** `CART_COLORS` and the `mesh.traverse()` material logic in
[`src/config.js`](../../src/config.js) remain the "Original Rave" invariant per AGENTS.md.
**This document does not authorize hex edits.** Only ART-PALETTE-1 may unfreeze them.

### Per-arena moods diverge under one emotional umbrella

The umbrella is the *emotion* — excitement, chaos, fun. It is not a palette, and it is not a
brightness. Each arena expresses it differently, and an arena is not broken for differing:

- **Cart Rave (`classicRecord`)** — underground warehouse party. Neon cutting darkness, fog
  catching lasers, damp concrete, a dance floor that has been trashed and swept a hundred times.
- **The Storerooms (`backrooms`)** — liminal fluorescent: drab, uncanny, quietly wrong.
  **It stays liminal.** It is not a warehouse rave and must not be pushed toward one. Its
  VHS/CCTV layer and its near-silence are identity here, not deficiencies.
- **Sundial Station (`zanzibar`)** — golden-hour mood arena, warm and open. It is *not dark*,
  and its `arenaExposureMul` of `1.32` is correct behavior rather than a violation of anything.

### Anti-references

Name these when a frame fails, so the failure is specific:

- **Rocket League / esports chrome** — pristine clearcoat metal, product-lit. The HUD direction
  doc already rejected this for the 2D layer (see
  [`hud-art-direction-2026-07-09.md`](../archive/session-notes/hud-art-direction-2026-07-09.md),
  read-only archive); the 3D layer is held to the same standard.
- **Pristine untextured PBR** — a material with no maps. The carts are the standing example.
- **Cel-shaded toon** — no ramp shading, no inverted-hull outlines, no gradient maps. That is a
  different game.
- **Literal craft materials** — felt, yarn, cardboard-as-world. Warmth, not arts-and-crafts.
- **Oppressive horror dark** — darkness that reads as dread rather than as contrast.

### What is already authored — read this before assuming a surface is bare

**Corrected 2026-08-01.** An earlier draft of this file claimed Cart Rave and Sundial Station
were untextured PBR. That was wrong — it generalized from the carts without checking the arena
files. The real inventory:

| Arena | Authored surfaces today |
|---|---|
| **Cart Rave** | Vinyl floor — albedo + normal + roughness, with groove lands/valleys, 36 hairline radial play-wear scratches, dust and fingerprint blotches ([`arena.js:180`](../../src/arena.js:180)). Pit wall — albedo + normal + roughness plated panels ([`arena.js:33`](../../src/arena.js:33)). Booths — metal + grille albedo ([`arena.js:320`](../../src/arena.js:320)). |
| **The Storerooms** | ~9 builders — carpet, wallpaper, ceiling, concrete, prop-surface (carton/cardboard), furniture (wood/fabric/metal/plastic) — plus wet-floor, tape, and arrow canvases ([`backroomsSupermarket.js:150`](../../src/levels/backroomsSupermarket.js:150)–`596`). |
| **Sundial Station** | ~12 builders — deck albedo + deck roughness (plate seams, bolt rings, rust streaks, 46 traffic-wear scuff arcs, hazard band), water normal, foam, panel, vent grille, hazard stripe, hologlyphs ([`zanzibarPlatform.js:144`](../../src/levels/zanzibarPlatform.js:144)+). |
| **The carts** | **None.** Zero maps on any slot ([`cart.js:118`](../../src/cart.js:118)–`152`). |

So "preserve what we've established" holds further than a first read suggests. The arenas
already speak this material language — the vinyl's play wear and the deck's traffic scuffs are
the wear vocabulary this document describes, authored before it was written down. **The one
genuine gap is the carts**, which is also the highest-visibility surface in the game.

For the arenas the question is therefore *not* "add maps." It is coverage and consistency:
which authored surfaces still read thin next to their neighbors, and which elements are bare
filler sitting beside well-authored ones. That is a per-element art pass, tracked per level —
not a texturing sweep.

When authoring anything new, read the existing builders first: the vinyl floor
([`arena.js:180`](../../src/arena.js:180)) for wear, the Sundial deck
([`zanzibarPlatform.js:146`](../../src/levels/zanzibarPlatform.js:146)) for use-driven grime,
and the Storerooms furniture builders for material variety.

---

## Per-arena look budget

Current values, recorded as the starting point rather than as targets. ART-EXPO-1 and
ART-FILTER-1 own moving them and will record the resulting baselines here.

| Knob | Where | Current |
|---|---|---|
| Tone mapping | `applyRendererColorGrading()`, [`scene.js:591`](../../src/scene.js:591) | ACESFilmic |
| Exposure (global) | [`config.js:495`](../../src/config.js:495) | `0.4` — **lock retired**, per-arena budget replaces it |
| Exposure (per arena) | [`config.js:501`](../../src/config.js:501) | `zanzibar: 1.32`; unlisted arenas `1.0` |
| Bloom (`?bloompipe=hdr` only) | [`config.js:522`](../../src/config.js:522) | `0.34 / 0.34 / 0.76 / 0.14` |
| Bloom — Cart Rave + Sundial | `BLOOM_DISPLAY_NEON`, [`scene.js:84`](../../src/scene.js:84) | `0.25 / 0.67 / 0.5 / 0.025` |
| Bloom — Storerooms | `BLOOM_DISPLAY_STOREROOMS`, [`scene.js:73`](../../src/scene.js:73) | `0.62 / 0.4 / 0.62 / 0.1` |
| Arcade (CRT) | [`config.js:545`](../../src/config.js:545) | aberration `0.003`, scanlines `1.8`, vignette `0.5` — **global today, should be Storerooms-only** |
| VHS | [`config.js:554`](../../src/config.js:554) | amount `0.3` — correctly level-gated already |
| Fog — Cart Rave | [`config.js:565`](../../src/config.js:565) | `0x040112` @ `0.0065` |
| Fog — Storerooms | [`config.js:567`](../../src/config.js:567) | `0x1a1510` @ `0.029` |
| Fog — Sundial | [`config.js:571`](../../src/config.js:571) | `0xff5a22` @ `0.00355` |

Bloom profile selection: `resolveDisplayBloomConfig()`,
[`scene.js:107`](../../src/scene.js:107).

---

## Cart material contract

For **CART-MODEL-1** (the Blender rebuild). This section is the spec the new cart is authored
against; it does not wait on ART-MAT-1, which is the separate runtime card that applies maps to
the shipped game.

**Slots and their required maps.** Current cart materials are at
[`cart.js:118`](../../src/cart.js:118)–`152`, all `createPhysicalMaterial` with no maps of any
kind:

| Slot | Current | Required maps |
|---|---|---|
| Chrome (handle, caster stems) | `metalness 0.95, roughness 0.28, clearcoat 0.55` | roughness **required** (wear breakup), normal for scrape; albedo optional |
| Basket wire / frame body | painted from `CART_COLORS` | albedo + roughness **required**; chipping at contact edges |
| Tires | `metalness 0.2, roughness 0.78` | roughness + normal **required**; sidewall scuff, tread grime |
| Face trim (lenses, bridge, mouth) | `metalness 0.88, roughness 0.42, clearcoat 0.4` | roughness **required**; keep lenses clean by contrast |
| Neon frame | emissive, `toneMapped: false` | **none — exempt.** Wear maps on emissive kill the bloom contribution and break the palette. |

**UV expectations.** A second UV channel is required. The existing `cartrave4` body UVs are
fragmented, which is the standing blocker on the PATTERNS customize UI; the rebuild is the
moment to fix it. Channel 0 stays for color/pattern; channel 1 carries wear and grime so it can
tile independently of the paint.

**Texel density.** Consistent across slots — the cart is seen at 3–8 m in the chase camera and
close-up in the menu preview ([`ui/cartPreview.js`](../../src/ui/cartPreview.js)). Author for
the menu preview; it is the harsher of the two.

**Wear language.** Edge scuffing on impact faces (front basket rim, corner posts), basket-wire
chipping down to bare metal, rim scrape on the caster housings, grime settling in crevices and
weld seams. **Dents are authored in geometry, not faked in normal maps** — a dent that doesn't
change the silhouette doesn't read at gameplay distance.

**Silhouette.** The cart must remain identifiable as a pure black shape (see Rule 4). Wear may
not soften or clutter the outline.

---

## Falsifiable rules

Rules 1 and 2 are checkable against source today and **both fail today** — that is deliberate.
Rules 3–5 are procedures whose per-arena baselines are captured by ART-EXPO-1 and ART-FILTER-1;
capturing them before those cards move the look would baseline a look that is about to change.

### Rule 1 — no pristine hero surface

Every material on the hero-surface allowlist carries at least one authored or procedural map
(albedo, roughness, or normal). A bare `color + metalness + roughness` call is a defect.

**Allowlist** (not "every `createPhysicalMaterial` call site"):

- Carts — chrome, basket/frame, tires, face trim
- Cart Rave — vinyl record floor, pit wall, booth deck
- Sundial Station — deck plate, center podium

**Exempt:** emissive neon (`toneMapped: false`), `testArena`, and small dressing props (booth
ribs, truss, stage clutter). Exempt surfaces must not be given dummy maps to satisfy the rule.

**Status today: every arena surface on the allowlist PASSES. The carts FAIL** — no maps on any
slot ([`cart.js:118`](../../src/cart.js:118)). The rule is not a texturing backlog for the
arenas; it is a floor that the arenas already clear and the carts do not. Automatable later as
a static check over the allowlist.

### Rule 2 — no screen filter outside The Storerooms

This rule has two halves, because the measurement point does not exist in the code yet.

**Smell test today:** `CONFIG.postFx.arcade` is non-zero
([`config.js:545`](../../src/config.js:545)) and
[`scene.js:1168`](../../src/scene.js:1168)–`1173` writes it into the pass **once, inside
`createComposer()`**, from global config. Every level inherits it at composer-create time.
There is **no per-level arcade write** — `applyLoadedLevelSideEffects` gates VHS only
(`main.js` ~2448). So the rule fails today, globally, by construction.

**Target, after ART-FILTER-1:** resting `uAberration`, `uScanlineDensity`, and `uVignette` read
`0` for `classicRecord` and `zanzibar` when measured after `applyLoadedLevelSideEffects`,
mirroring the VHS gate. Event juice may spike **from that base** — the impact pulse and KO
flash capture `pulse.baseVignette` / `baseAberration`
([`main.js:1110`](../../src/main.js:1110)) and return to it
([`frameVisuals.js:630`](../../src/frameVisuals.js:630)–`634`). **The test reads the base, not
a live frame** — any live frame will violate a naive version of this rule.

**Status today: FAILS**, globally.

### Rule 3 — blacks stay black

Per-arena luma floor captured with `npm run shoot`, drift guarded by `npm run compare`. Raising
an arena's exposure may not lift its darkest decile. `baseline: TBD` — ART-EXPO-1 records.

### Rule 4 — silhouette rule

Threshold a captured frame to pure black and white. Every cart and every kill edge must remain
identifiable. Borrowed from *Paper Mario*: if the silhouette doesn't read, no amount of surface
detail rescues the frame. `baseline: TBD`.

### Rule 5 — cart neon clears its background

Measured contrast between cart emissive and the busiest background it can sit over, per arena.
The Storerooms is the precedent — the steel-blue grazing rim light exists specifically because
warm environment plus warm carts collapsed. Live values are `0x8aa0c8` @ `0.28`
([`backroomsSupermarket.js:3394`](../../src/levels/backroomsSupermarket.js:3394)); cite live
code here, not the archives, which record the shipped-M5 numbers `0x7a8fc0` @ `0.2` from before
the value drifted. `baseline: TBD`.

---

## Supersession

This document replaces **"dark arenas + punchy neon, never brighten"** as the governing look
rule. That rule originated as one line of owner feedback on a single over-bloomed build
(2026-07-08: *"too bright, bloom too much — I liked how dark it was"*), recorded in
[`docs/archive/audits/visual-audit.md`](../archive/audits/visual-audit.md) and copy-pasted
outward from there. It was never an art direction — it was an exposure value, and the repo had
already outgrown it in two of three arenas.

`docs/archive/**` is edit-forbidden per AGENTS.md, so the archived copies stand as historical
record. **They are superseded by this file, not corrected in place.**

Also superseded: the dangling `[[cart-rave-look-dark]]` reference formerly in
[`docs/guides/visual-qa.md`](../guides/visual-qa.md) — it pointed at a canonical look doc that
never existed. This is that doc.

Live copies of the old rule that remain as annotated historical comments:
[`config.js:494`](../../src/config.js:494),
[`tokens.css:244`](../../src/ui/styles/tokens.css:244), and the two playtest checklists.

## Open cards

- **ART-FILTER-1** — gate the arcade pass to The Storerooms at rest.
- **ART-EXPO-1** — retire the global exposure lock; per-arena budget.
- **ART-MAT-1** — authored maps on the **carts** (the only Rule 1 failure). Largely absorbed by
  CART-MODEL-1, which authors against the contract above.
- **ART-PASS-\<level\>** — per-level art pass: which authored surfaces read thin, which
  elements are bare filler beside well-authored neighbors, what must not change. Audited one
  level at a time.
- **ART-PALETTE-1** — reconcile 3D `CART_COLORS` with the 2D tokens. Only card that may
  unfreeze the invariant.
- **CART-MODEL-1** — the Blender rebuild, authored against the cart material contract above.
  **Not blocked by ART-MAT-1.**
