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

**Screen filters: CRT on all arenas, VHS Storerooms only.** The CRT arcade layer
(aberration/scanlines/vignette) applies to every arena. VHS is identity in The Storerooms
only.

**Palette (ART-PALETTE-1, 08-13):** `CART_COLORS` in [`src/config.js`](../../src/config.js) is
**brand-aligned** — its hex values are the 2D roster (`PALETTES.classic.players` in
`cart-rave-menu.js`, and the `--color-*` tokens in `tokens.css`). Pure spectral hexes
(`0xff00ff`, `0x00ffff`, `0x00ff00`, `0xffff00`) are off-brand and must not reappear as cart
neon. The `mesh.traverse()` material logic stays frozen. Arena neon may use brand-family hexes;
anything not in the brand set is a per-arena art call, not a palette change.

### Per-arena moods diverge under one emotional umbrella

The umbrella is the *emotion* — excitement, chaos, fun. It is not a palette, and it is not a
brightness. Each arena expresses it differently, and an arena is not broken for differing:

- **Cart Rave (`classicRecord`)** — underground warehouse party. Neon cutting darkness, fog
  catching lasers, damp concrete, a dance floor that has been trashed and swept a hundred times.
- **The Storerooms (`backrooms`)** — liminal fluorescent: drab, uncanny, quietly wrong.
  **It stays liminal.** It is not a warehouse rave and must not be pushed toward one. Its
  VHS/CCTV layer and its near-silence are identity here, not deficiencies.
- **Sundial Station (`zanzibar`)** — golden-hour mood arena, warm and open. It is *not dark*,
  and its exposure budget of `0.528` — the highest of the four — is correct behavior rather than
  a violation of anything.

  **The sun key and the sun disc do not agree, by intent (D-SUNDIAL-OQ8, 08-02).** The key light
  sits at **9.93°** elevation while the visible disc sits at **1.87°** on the waterline. That 8°
  gap is deliberate stylisation, not a bug: the disc has to sit on the horizon for the sunset to
  read, and the key has to stay high enough to sculpt the deck — at 1.87° it would retain only
  18.9% of its directional contribution while the hemi went from 2.32:1 over it to 12.26:1.
  **Do not reconcile them.** `SUN_KEY_DISTANCE` in `zanzibarPlatform.js` single-sources the key's
  angle so the light and every raking effect move together if this is ever reopened.

  **Sundial's plate is measured, and paint does not read on it**: bare deck median luminance
  **2.6**, painted hazard band **16.4**, emissive rim strip **153** (Classic's floor median is
  10.6, Storerooms' 71.3). Rule 1 below is a material-correctness floor — satisfying it does not
  make a surface visible here. Additive/emissive detail reads; painted detail does not. Check
  before proposing painted density.

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
| **Cart Rave** | Vinyl floor — albedo + normal + roughness, with groove lands/valleys, 36 hairline radial play-wear scratches, dust and fingerprint blotches ([`arena.js:180`](../../src/levels/arena.js:180)). Pit wall — albedo + normal + roughness plated panels ([`arena.js:33`](../../src/levels/arena.js:33)). Booths — metal + grille albedo ([`arena.js:320`](../../src/levels/arena.js:320)). |
| **The Storerooms** | ~9 builders — carpet, wallpaper, ceiling, concrete, prop-surface (carton/cardboard), furniture (wood/fabric/metal/plastic) — plus wet-floor, tape, and arrow canvases ([`backroomsSupermarket.js:150`](../../src/levels/backroomsSupermarket.js:150)–`596`). |
| **Sundial Station** | ~12 builders — deck albedo + deck roughness (plate seams, bolt rings, rust streaks, 46 traffic-wear scuff arcs, hazard band), water normal, foam, panel, vent grille, hazard stripe, hologlyphs ([`zanzibarPlatform.js:144`](../../src/levels/zanzibarPlatform.js:144)+). |
| **The carts** | **None.** Zero maps on any slot ([`cart.js:118`](../../src/carts/cart.js:118)–`152`). |

So "preserve what we've established" holds further than a first read suggests. The arenas
already speak this material language — the vinyl's play wear and the deck's traffic scuffs are
the wear vocabulary this document describes, authored before it was written down. **The one
genuine gap is the carts**, which is also the highest-visibility surface in the game.

For the arenas the question is therefore *not* "add maps." It is coverage and consistency:
which authored surfaces still read thin next to their neighbors, and which elements are bare
filler sitting beside well-authored ones. That is a per-element art pass, tracked per level —
not a texturing sweep.

When authoring anything new, read the existing builders first: the vinyl floor
([`arena.js:180`](../../src/levels/arena.js:180)) for wear, the Sundial deck
([`zanzibarPlatform.js:146`](../../src/levels/zanzibarPlatform.js:146)) for use-driven grime,
and the Storerooms furniture builders for material variety.

---

## Per-arena look budget

Current values. ART-EXPO-1 closed 2026-08-06; ART-FILTER-2 (unwrap arcade to all arenas)
closed 2026-08-12. The exposure and arcade rows below are their result, and the Rule 3 luma
floors those values produce are recorded above.

| Knob | Where | Current |
|---|---|---|
| Tone mapping | `applyRendererColorGrading()`, [`scene.js:632`](../../src/scene.js:632) | ACESFilmic |
| Exposure (per arena) | [`config.js:519`](../../src/config.js:519) | `classicRecord 0.4` · `backrooms 0.4` · `zanzibar 0.528` · `testArena 0.4`. Absolute values — the global lock and its multiplier are both gone. Resolved by `resolveArenaExposure()`. |
| Exposure (no arena) | [`config.js:527`](../../src/config.js:527) | `0.4` — customize cart preview, which grades its own renderer |
| Bloom (`?bloompipe=hdr` only) | [`config.js:546`](../../src/config.js:546) | `0.34 / 0.34 / 0.76 / 0.14` |
| Bloom — Cart Rave | `BLOOM_DISPLAY_NEON`, [`scene.js:86`](../../src/scene.js:86) | `0.25 / 0.67 / 0.5 / 0.025` |
| Bloom — Sundial | `BLOOM_DISPLAY_SUNDIAL`, [`scene.js:109`](../../src/scene.js:109) | `0.25 / 0.67 / **0.68** / 0.025` — D-SUNDIAL-OQ5, split off NEON `93c3deb`; threshold is the only knob moved |
| Bloom — Storerooms | `BLOOM_DISPLAY_STOREROOMS`, [`scene.js:73`](../../src/scene.js:73) | `0.62 / 0.4 / 0.62 / 0.1` |
| Bloom — Test Drive | `BLOOM_DISPLAY_TESTDRIVE`, [`scene.js:121`](../../src/scene.js:121) | `0.2 / 0.5 / 0.7 / 0.05` |
| Arcade (CRT) | [`config.js:573`](../../src/config.js:573) | aberration `0.003`, scanlines `1.8`, vignette `0.5` — **all arenas** (ART-FILTER-2) |
| VHS | [`config.js:582`](../../src/config.js:582) | amount `0.3` — Storerooms only |
| Fog — Cart Rave | [`config.js:593`](../../src/config.js:593) | `0x040112` @ `0.0065` |
| Fog — Storerooms | [`config.js:596`](../../src/config.js:596) | `0x1a1510` @ `0.029` |
| Fog — Sundial | [`config.js:600`](../../src/config.js:600) | `0xff5a22` @ `0.00355` |

Bloom profile selection: `resolveDisplayBloomConfig()`,
[`scene.js:132`](../../src/scene.js:132) — four branches, one per row above.

---

## Cart material contract

For **CART-MODEL-1** (the Blender rebuild). This section is the spec the new cart is authored
against; it does not wait on ART-MAT-1, which is the separate runtime card that applies maps to
the shipped game.

**Slots and their required maps.** Current cart materials are at
[`cart.js:118`](../../src/carts/cart.js:118)–`152`, all `createPhysicalMaterial` with no maps of any
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

## Contact shadows — level props vs carts

**Decided 08-02 (D-SUNDIAL-SHADOW-1).** Directional static contact shadows are a **level-prop
affordance only.**

- **Level props** may use `createStaticContactShadowCluster`
  ([`contactShadows.js:362`](../../src/contactShadows.js:362)) with two placements per prop: a
  tight round foot patch, plus a longer, fainter, elongated streak offset along `-sunDir` and
  yawed to match. Sundial grounds its eight bollards and its podium base ring this way.
- **Carts do not.** Every cart on every arena keeps the same flat, centered circle — no ellipse,
  no height shrink, no per-arena light bias. That is the Run-6 ruling and it is still in force;
  an earlier Zanzibar sun offset on carts read as "detached" in playtest.

Two mechanical notes before adding placements:

1. **`yaw` is applied as `rotation.z`, never `rotation.y`.** The blob is built with
   `rotation.x = -PI/2`, and under three's default XYZ Euler order a `rotation.y` on top of that
   tilts the quad *out* of the floor — measured normal `(sin yaw, cos yaw, 0)`, i.e. edge-on and
   invisible at ±90°.
2. **Placements off the play surface are dropped silently, not clamped.** Check the foot against
   the arena's own octagon first. Sundial's beacon masts (31.98 m, base at y = −0.25, mounted on
   the fascia) and its spawn booths (36.45 m, over open water on 7 m legs) cannot be grounded at
   all, and its bollard streak offsets are sized so all eight clear the 31.9 m ceiling.

---

## Falsifiable rules

Rule 1 is checkable against source today and still fails on the carts. **Rule 2 passes as of
2026-08-12 (ART-FILTER-2).** Rules 3–5 are procedures whose per-arena baselines were blocked on
ART-EXPO-1 / ART-FILTER-1 landing, because capturing them first would have baselined a look that
was about to change. Rule 3's baselines are now recorded; 4 and 5 are still open.

### Rule 1 — no pristine hero surface

Every material on the hero-surface allowlist carries at least one authored or procedural map
(albedo, roughness, or normal). A bare `color + metalness + roughness` call is a defect.

**Allowlist** (not "every `createPhysicalMaterial` call site"):

- Carts — chrome, basket/frame, tires, face trim
- Cart Rave — vinyl record floor, pit wall, booth deck, **turntable platters**
- Sundial Station — deck plate, center podium

**Ruling 2026-08-01 (Wyatt), turntable platters are hero, not dressing.** By size they look
like booth clutter and the exemption below would cover them. It does not apply: in a
vinyl-record arena a blank turntable next to an authored vinyl floor reads as unfinished
theme, not as optional detail. Identity decides the allowlist here, not scale. The general
principle: a prop that carries the arena's theme is a hero surface however small it is.

**Exempt:** emissive neon (`toneMapped: false`), `testArena`, and small dressing props (booth
ribs, truss, stage clutter). Exempt surfaces must not be given dummy maps to satisfy the rule.

**Status today: every arena surface on the allowlist PASSES. The carts FAIL** — no maps on any
slot ([`cart.js:118`](../../src/carts/cart.js:118)). The rule is not a texturing backlog for the
arenas; it is a floor that the arenas already clear and the carts do not. Automatable later as
a static check over the allowlist.

**OQ3, resolved 2026-08-02.** That status line was **false when written**, and by more than the
audit caught. "Sundial Station — center podium" is three materials, and two of them were bare
`color + roughness + metalness` calls: `podiumTopMat` (the crown face) and `capPlateMat` (the
polished plate on it). Only `podiumSideMat` carried a map (`grilleTex`). The line is true again
because the **code** was fixed, not because the rule was weakened — the crown face now carries
world-scaled `panelTex` plus its normal, and the cap plate carries the panel normal at a tight
repeat (relief, not an albedo grid: painting a panel pattern onto a 0.22-roughness disc would
read as a decal on a mirror). Neither is a dummy map.

Two cautions this left behind. **A map multiplies `color`** — `panelTex`'s base is `#272b33`,
so a surface already coloured near that must go white or it darkens; the Sundial fascia lost
70% of its luminance to exactly this before it was caught. And **this rule is not a look
promise on a dark arena**: Sundial's deck plate measures median luminance 2.6, so a map can
satisfy Rule 1 and still be invisible. Rule 1 is a material-correctness floor. Whether a
surface *reads* is a separate question, answered by measurement.

### Rule 2 — no screen filter outside The Storerooms

**The test reads the resting base, not a live frame** — any live frame will violate a naive
version of this rule, because event juice is allowed to spike from that base.

**Measurement:** resting `uAberration`, `uScanlineDensity`, and `uVignette`, read after
`applyLoadedLevelSideEffects` ([`levelOrchestration.js:240`](../../src/orchestration/levelOrchestration.js:240))
with the Tweakpane closed — its arcade sliders write the same uniforms live, so a stale tweak
reads as a gate failure.

**Status: PASSES** as of 2026-08-06 (ART-FILTER-1), measured on a real GPU across all four
arenas:

| Arena | uAberration | uScanlineDensity | uVignette | VHS |
|---|---|---|---|---|
| `classicRecord` | 0 | 0 | 0 | 0 |
| `zanzibar` | 0 | 0 | 0 | 0 |
| `testArena` | 0 | 0 | 0 | 0 |
| `backrooms` | 0.003 | 1.8 | 0.5 | 0.3 |

Event juice still spikes from that base — the impact pulse and KO flash capture
`pulse.baseVignette` / `baseAberration`
([`cartOrchestration.js:268`](../../src/orchestration/cartOrchestration.js:268)) and return to it
([`frameVisuals.js:626`](../../src/frameVisuals.js:626)–`637`). The gate clears any in-flight
pulse on level load; without that, a pulse live across an arena swap restores the previous
arena's values over the gated uniforms and the CRT comes back on Classic.

**A zero uniform is not automatically "off".** The vignette's `smoothstep` runs with edge0
(`0.8`) above edge1 (`0.5 * uVignette`) at every shipping value, and under that reversed
interpolation the corner sample only moves `0.485 → 0.587` across `uVignette 0.5 → 0` — writing
0 alone would leave ~41% corner darkening and fail this rule while appearing to satisfy it. The
shader therefore fades the whole effect out below `uVignette 0.5`
([`scene.js:571`](../../src/scene.js:571)); the fade saturates at 0.5, so Storerooms and every
pulse peak are bit-identical to the pre-card look. A hard `> 0.001` cutoff instead of a fade
would pop the corners in a pulse's final frame (`0.580 → 1.0` in one step).

### Rule 3 — blacks stay black

Per-arena luma floor captured with `npm run shoot`, drift guarded by `npm run compare`. Raising
an arena's exposure may not lift its darkest decile.

**Baselines, 2026-08-06** (post ART-FILTER-1 + ART-EXPO-1, real GPU, 1280×720, Rec.709 luma on
sRGB bytes 0–255; `floor` = mean of the darkest decile):

| Arena | floor | median | mean | pure-black % |
|---|---|---|---|---|
| Cart Rave (`classicRecord`) | 0.00 | 5.72 | 21.37 | 16.0% |
| Sundial (`zanzibar`) | 0.18 | 6.54 | 16.82 | 21.8% |
| The Storerooms (`backrooms`) | 1.36 | 83.98 | 64.84 | 3.9% |

Shots: `--shot classic`, `--shot sundial`, `--level backrooms --cam "0,8,16,0,0.5,0"`. Reproduce
the numbers with `npm run compare` — its per-image luma line prints floor / median / mean /
pure-black %, computed as Rec.709 luma on raw sRGB bytes (0.2126R + 0.7152G + 0.0722B, no
linearization) with floor = darkest-decile mean (**ART-LUMA-TOOL-1**, 08-13).

**Read the floor together with the black %.** Classic and Sundial sit at a floor of ~0 with a
fifth of the frame already pure black, so the floor column has almost no headroom to register a
small lift — median and mean are the sensitive drift indicators there. The Storerooms is the
only arena whose floor is meaningfully above zero.

**These are post-vignette-removal numbers and are not comparable to pre-08-06 captures.** The
CRT vignette was crushing the corners of every arena; removing it on Classic/Sundial raised
their mean (Classic 19.76 → 21.37) while leaving the floor at 0. Blacks stayed black — the
change added corner brightness, it did not lift the low end. Storerooms was unaffected by both
levers (floor 1.36 → 1.36, median 83.91 → 83.98).

### Rule 4 — silhouette rule

Threshold a captured frame to pure black and white. Every cart and every kill edge must remain
identifiable. Borrowed from *Paper Mario*: if the silhouette doesn't read, no amount of surface
detail rescues the frame. `baseline: TBD`.

### Rule 5 — cart neon clears its background

Measured contrast between cart emissive and the busiest background it can sit over, per arena.
The Storerooms is the precedent — the steel-blue grazing rim light exists specifically because
warm environment plus warm carts collapsed. Live values are `0x8aa0c8` @ `0.28`
([`backroomsSupermarket.js:3589`](../../src/levels/backroomsSupermarket.js:3589)); cite live
code here, not the archives, which record the shipped-M5 numbers `0x7a8fc0` @ `0.2` from before
the value drifted. **Sundial now carries the same lever** — `0x3a6088` @ `0.3` with an authored
target 1.2 m up and off-centre
([`zanzibarPlatform.js`](../../src/levels/zanzibarPlatform.js), search `coolFill`), raised from
`0.22` aimed at the arena's exact centre. `baseline: TBD` — and it stays TBD deliberately: per
the note above, Rules 3–5 baselines belong to ART-EXPO-1 / ART-FILTER-1, and capturing one
immediately after changing the very light it measures would baseline a look that is still
moving.

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

## Tooling — procedural props from a reference image

**img2threejs** (v1.4.3, Apache-2.0) rebuilds the object in a reference image as a procedural
Three.js factory function — primitives, extrudes, generated canvas textures, no external art.
**Deliberately not vendored** into `.agents/skills/` — it is 146 files, and a committed copy
would recreate the `hallmark` bloat deleted 08-02. Instead: **one payload, every runtime.**
Canonical clone at `~/.agent-skills/img2threejs` (neutral, so no single tool owns it),
junctioned into each runtime's `skills/` dir. All seven use the same convention. One
`git pull` in the canonical dir updates all of them; a copy-per-runtime would cost 7× the
disk and 7 separate updates — which is what the Cloudflare skills currently do (2.0 MB and
320 files duplicated in both `.claude` and `.cursor`).

```bash
git clone --depth 1 https://github.com/img2threejs/img2threejs.git "$HOME/.agent-skills/img2threejs"
# then, per runtime (PowerShell, no admin needed):
#   New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\img2threejs" `
#            -Target "$env:USERPROFILE\.agent-skills\img2threejs"
# repeat for: .cursor .grok .codex .gemini .copilot .config\opencode
```

**Who can actually run it.** It is a *program*, not a document — it needs a local shell,
Python 3.10+, and file writes. Linked and working today: **Claude Code · Cursor · Grok CLI**.
Junctions are pre-placed for **Codex · Gemini/Antigravity · Copilot · OpenCode**, whose config
dirs exist but whose CLIs are not yet on PATH. **Grok *web chat* and DeepSeek cannot run it at
all** regardless of where the markdown sits — no local filesystem. For those, the output is
something another tool generates and they then edit.

**Reach for it** when a card needs a genuinely *new* hard-surface prop authored from a reference
image — a new arena's prop set, or a single new object such as Sundial Wave 5's gnomon blade.

**Do not reach for it** when the card refines geometry that already exists. Its own `SKILL.md`
scopes it to new generation only; `refine-code` corrects within one reconstruction pass and does
not edit an existing builder. **Every ART-PASS lever so far has been the second kind** — the
hazard-band inset, the fascia normal map, the contact-shadow clusters, the bollard jitter.

**Two costs, both real.** It emits **TypeScript**, and `src/` is JSDoc'd JS under `tsc --noEmit`,
so each object needs converting — and a new `src/` file must be claimed in
`tools/lib/archMap.mjs` or `health:check` red-gates `ARCH_UNMAPPED_FILE`. It also runs
**80k–180k tokens per object**: a deliberate spend, never a casual reach.

**It produces no UVs**, so it does not serve **CART-MODEL-1**, which needs a GLB carrying a
second UV channel for the patterns work.

## Open cards

- ~~**ART-FILTER-1** — gate the arcade pass to The Storerooms at rest.~~ Closed by ART-FILTER-2 (2026-08-12): arcade CRT unwrapped to all arenas.
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
