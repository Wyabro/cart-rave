# ART-PASS-SUNDIAL-1 — Session Handover

> Working doc for finishing the Sundial Station art pass. Read this, then
> [art-audit-sundial.md](./art-audit-sundial.md), then `git log --oneline` on `cart-clash`,
> then verify current state yourself before touching anything.

## TL;DR

- **Waves 1, 2 and 3 are shipped, pushed and deployed.** Ten commits, listed below.
  Production Version `22837ee6-2560-4099-8a05-f5747173f382`.
- **Remaining: Waves 4, 5 and 6**, specified in full below — the original plan lived in a
  Claude plans directory outside this repo, so **this document is now the spec**. Do not go
  hunting for it.
- **OQ5 and OQ6 are answered and shipped.** OQ3 and OQ8 are still open and are Wyatt's calls.
- **The audit is `[unverified]` throughout.** Every claim in it that was checked this pass
  held up, but two needed correcting. **Verify each remaining claim against the code before
  fixing it** — that rule earned its place four separate times.
- **Read "Traps that cost time" before your first capture.** One of them silently invalidates
  any capture-based claim about anything that animates.

## What shipped

| Wave | Lever | Commit | Evidence |
|---|---|---|---|
| 1 | Sky ramp finishes at the waterline | `2c5b3fc` | waterline red step **+128/+126/+110 → −21/−12/−2** (target <30); water pixels unmoved |
| 1 | IBL sun blob was exactly 180° out | `16157b0` | correctness-only, no look claim |
| 2 | Water is a dielectric + owns its `envMap` | `a07fa7e` | `metalness 0.82→0.02`, `ior 1.333`; envMap probed attached |
| 2 | Water detail pack (6 knobs) | `7b1a8a2` | off-axis glitter breakup sd 80.4 → 81.9 |
| 2 | Glint distance falloff + Low gets it | `da225dd` | contribution far +0.01 / near +0.57 |
| 3 | Settlement lights | `4566349` | **0 → 46 px lit.** Zero before — not dim, absent |
| 3 | Gate beacons breathe per frame | `285ac61` | capture-unverifiable, see SHOOT-ANIM-1 |
| 3 | Ship glow soft disc (was a 3×3 px square) | `102ed31` | map + size 3→6 |
| 3 | Ships on Low | `03b12f0` | hoisted out of `runDecor` so they glide, not teleport |
| 3 | Alien city windows + seeded layout | `aa4b69c` | 28 → **85** points; layout fingerprint stable across loads |
| 3 | Wind farm: three blades, 10–15 RPM | `fbc3a4e` | was ONE 24 m slab at 4 RPM |
| 3 | Islands: haze ladder cut, ridges jittered | `74cec52` | four materials → one, **measured lossless** |
| 3 | Gas giant: limb, terminator, ring occlusion, moon | `543c16a` | disc was flat `[103,62,92]` edge to edge |
| — | OQ5: Sundial's own bloom threshold | `93c3deb` | frame bloom **55.6% → 18.7%**, parity with Classic |

## Traps that cost time — read before capturing anything

0. **The audit that scoped this card was wrong about more than half of Wave 6.** Six of eleven
   Wave 6 audit items were **misdiagnosed** — measuring first changed the outcome every time, and
   twice it stopped a regression that was about to ship as a fix. [art-audit-sundial.md](./art-audit-sundial.md)
   is still marked `[unverified]`: **verify each item against the tree before fixing it.** Moved
   here from STATUS.md on 08-03 (STATUS-TRIM-1) — it is a standing warning about this card's own
   source document, not session status.
1. **~~`shoot-gpu` freezes ALL per-frame level animation.~~ CLOSED — SHOOT-ANIM-1, `6b27283`.**
   The attract loop now ticks `levelUpdate` + `sceneExtras.update` before its render, so
   animated properties are capturable. Gate opacity now changes on every rendered frame
   (11/23 sampled rAF ticks — the attract loop throttles to ~30fps, so roughly every other
   tick renders) where it used to hold `0.55` for 0/23. **Use `--t <ms>`** to pin a phase:
   `--t 1000` puts gate opacity at exactly `0.6066653819`, matching `0.45 + sin(1000×0.0009)×0.2`
   analytically. Prove a pulse by capturing two phases and comparing them. Animated knobs no
   longer need to ship on code-reading plus arithmetic.

   **But two captures of the same pinned phase still differ**, because arena *construction* is
   unseeded (`Math.random()` ×56 in `zanzibarPlatform.js` alone, including procedural texture
   painting). Measured null floors, same phase, two browser sessions: **Sundial ~1.2%**
   (1.22% and 1.21% on two independent pairs), **Classic ~15.9%**. Judge a Sundial phase
   change against ~1.2%, not zero — `--t 0` vs `--t 250` reads 2.61%, and the full swing
   (`--t 1745` vs `--t 5236`, sin +1 → −1) reads 15.01%. On Classic the construction floor
   swamps everything; `--t` does not make Classic captures reproducible.
2. **`lookAt` + a baked gradient is guilty until measured.** Two levers had a sign error in the
   same class: the glint's fog ramp (`da225dd`) and the gas giant's terminator (`543c16a`).
   Both were built, captured, measured backwards, and flipped. Derive the screen-space
   direction explicitly (`screen-right = normalize(cross(viewDir, up))`, dot it with the vector
   to the sun) **and** confirm it in a capture.
3. **Shoot a noise floor before believing a diff.** The hologram and water animate between
   captures. Two shots of *identical code* give `pctDiff>2 ≈ 0.55%`; `maxAbs` hit **98** on that
   noise pair, so `maxAbs` is meaningless here. Area past threshold is the number that
   separates signal from animation.
4. **The ocean is unlit except along the sun path.** Both standard cameras frame water that is
   either fogged (25–90%) or off-axis, where a normal map has nothing to modulate — the wide
   camera measured the entire water detail pack as **0.71% against a 0.55% floor**, i.e.
   nothing. Use `--cam "-24,12,20,-80,2,66"`.
5. **Minification breaks naive greps of deployed assets.** `0.505` becomes `.505`, hex seeds
   become decimal. A first post-deploy check reported four changes "missing" that were all
   present. Check the local `dist/` chunk with the same pattern before concluding anything
   about prod.
6. **`import("/src/…")` from a page probe returns a duplicate module instance** under Vite dev,
   with its own module state — `getQualityTier()` reported `"high"` on a `?preset=low` page.
   **Use the built scene as the tier tell**: Low builds no ocean normal map, High does.
7. **Always pass an explicit `--cam`.** A `--shot` bookmark alone is not guaranteed frozen or
   HUD-free.

## Cameras that earned their keep

```
wide deck        --shot sundial --cam "0,17,32,0,1.2,0"
sun / waterline  --shot sundial --cam "26,5.5,2,-51,5.5,65.7"
chase height     --shot sundial --cam "0,2.4,26,0,1.4,0"
podium close     --shot sundial --cam "0,4.2,11,0,2.6,0"
near sun-side water (the only camera that sees water work)
                 --shot sundial --cam "-24,12,20,-80,2,66"
island azimuth   --shot sundial --cam "29.7,7,-4.2,-297,3,42.3"
alien city       --shot sundial --cam "-21.3,9,21.2,269,45,-268"
wind farm        --shot sundial --cam "-5.1,9,-29.6,49.2,22,285.8"
gas giant        --shot sundial --cam "-30,8,-1.5,349.6,140,17.5"
foam / waterline  --url "…?preset=high&level=zanzibar&" --cam "0,14,62,0,-6,30"
```

Low-tier captures need the URL form, since `shoot-gpu` has no `--preset` flag:
`--url "http://127.0.0.1:3210/?preset=low&level=zanzibar&"`. On the 4090 the harness
auto-detects HIGH, so unforced captures are HIGH.

## Wave 4 — the deck (next up)

One lever per commit unless marked as a pack.

12. **Hazard band inset** *(pack: inset + wear)* — `octPath((apothem - 1.7) / COS_HALF)`.
    Verified: `octPath`'s argument is a **circumradius**; deck apothem 31.7, band centreline
    lands at 27.716, leaving **3.984 m** of bare steel outboard. Plus wear.
13. **Prop grounding** — one `createStaticContactShadowCluster` call covering 8 bollards,
    4 masts, the podium base ring and the booth legs. This helper is called **0×** in Sundial
    and 2× in Storerooms; it isn't even imported here. **No new API needed** — the existing
    signature takes `{x, z, radiusX, radiusZ, opacity}` placements, so "directional" is **two
    placements per prop**: a tight round foot patch plus a longer, fainter, elongated streak
    offset along `-sunDir`. **Wyatt's ruling: directional static shadows are for level props
    only.** Carts keep the same flat circle — no ellipse, no height shrink, no per-arena bias.
    **Do not touch `contactShadows.js:328-330`.** Record the precedent in `art-direction.md`
    **in the same commit**.
14. **Fascia + deck normal map** — the fascia is bare `0x2e333d / 0.38 / 0.85` around
    8 × 26.26 m of the most-looked-at line in the arena; `panelTex` is already built in the
    same function.
15. **Circle-on-octagon, all three** — bolt rings walked along the `octPath` polyline at a fixed
    pitch, an `octPath` apron, and the crown ring rebuilt as eight straight segments.
16. **Sun-shadow decal + god rays** *(pack)* — bake the gnomon shadow into `buildDeckTexture`
    where `SUN_AZIMUTH` is already in scope; restore the shafts to their authored opacities and
    add 2–3 instances that actually rake the plate.
16b. **Ambient dust sun lobe** — `effects.js:96-98`, `:362-374`. Pass `SUN_AZIMUTH` through
    `setAmbientDustStyle`, weight spawn density and per-mote brightness by
    `0.35 + 0.65*max(0, cos(θ − sunAz))²`. Same particle count, same draw call. **This and
    items 13/15/16 are the four things that make raking light read *without taking light away*.**
17. **Podium crown plate + ramp** — octagon inset inside apothem 6.098 to kill the 5.23 cm
    overhang, an authored crown texture, and the ramp's wall-texture grille re-authored as
    transverse tread plate. **OQ3 resolves here** — `art-direction.md` allowlists "Sundial —
    center podium" and records it as passing, but the crown plate has zero maps. The doc is
    false either way today; correct its status line **in the same commit**.
18. **Deck density** — **RE-SCOPED 08-02, measured. Do not build the original card.**

    The original said: a tiling detail layer mirroring `arena.js:1423-1451`, biased grime
    (salt bloom at seams, spray climbing from the rim, sun-bleach off `SUN_AZIMUTH`), skid
    arcs, legible decals. Two things are wrong with it.

    First, the reference is wrong — `arena.js:1423-1451` is booth turntable gear. The real
    tiling-detail precedent is `arena.js:150-182` (tiled map/normal/roughness at
    `repeat.set(32, 8)`) feeding `arena.js:1710-1741`, the translucent vinyl detail mesh laid
    over the floor with `renderOrder = 1` and `visible = !isLowQualityMode()`.

    Second, and fatally: **paint does not read on this deck.** Median luminance, wide camera:

    | surface | median | note |
    |---|---|---|
    | neon rim strip (emissive) | **153.2** | the only thing that reads |
    | painted hazard band | 16.4 | 6× the plate, still dim |
    | painted podium apron ring | 3.3 | indistinguishable from bare steel |
    | bare deck plate | 2.6 | 96.9% of the deck sits at 0–15 |

    For scale, Classic Record's floor median is 10.6 and Storerooms' is 71.3 — Sundial is a
    genuine outlier, and it already carries the *highest* per-arena exposure (1.32 vs 1.0).
    Every material lever was measured live and none of them fixes it: sun key 9.93°→20° gives
    +8%, metalness 0.62→0.15 gives +27%, deck albedo ×8 gives +177% (median 7.2, still below
    Classic). Exposure, fog density and the hemi are off-limits by the Do-not list.

    So grime, skid arcs and decals would all land in a band where 97% of the deck already
    sits. They cannot read. This was demonstrated three independent ways — item 13's contact
    shadows, item 14's albedo/normal maps, and direct material manipulation.

    **The re-scope (Wyatt, 08-02): stop painting density, add emissive geometry instead.**
    Additive, so it satisfies the "never take light away" rule; visible by construction,
    because it uses the one material family measured to read.

    - **18a — dial face. SHIPPED.** The apron ring rebuilt from `ctx.arc` paint into eight
      straight emissive segments on `neonYellowMat`, plus 24 graduations (every third major)
      and a heavier datum bar at `SUN_AZIMUTH` for the gnomon shadow to read against. Bright
      pixels (≥128) in the podium view 5.1% → 5.9%. Absorbs item 15's "octPath apron".
    - **18b+ — remaining density must also be emissive or additive.** Do not reopen grime.

    **This same finding governs items 15, 17 and 19.** They are surface-paint levers on the
    same black plate. Their geometry halves (octagonal bolt rings, the crown plate inset, the
    bollard segment count and flange) are still worth doing as silhouette and correctness
    work — but expect no visible value from anything painted, and say so rather than shipping
    it as a look change.
19. **Bollards** — per-instance yaw + scale jitter, 16–20 radial segments, base flange.

## Wave 5 — the hologram

Items 20–25. Delete the two `needsUpdate` lines (a 512×128 re-upload **per frame** to move a
uniform), halve the scroll rates, build a standing gnomon blade, add a projector + instability
layer, and drive it off `koT` / `intensityMul`. **Never `accentColor`** — it cycles pink→cyan.
Verified: `sampleArenaReactive` is not imported and `update()` is pure `Math.sin`, so the
hologram is not match-reactive today.

## Wave 6 — correctness and cleanup

- **Item 26 must be re-scoped, not taken as written.** Wave 2 gave the water an owned `envMap`,
  so its `0.58` is now a **live, intentional clamp** — do not delete or flatten it. What remains
  is the **five** other knobs (deckTop 0.45, deckSide 0.35, fascia 0.6, capPlate 0.8,
  conduit 0.4, plus the `structMat`/`pylonMat`/`podium*` scales). For each: either adopt the
  `clampFloorEnv` pattern (`arena.js:1651`) where the surface genuinely needs per-material
  reflectivity, or delete only the true no-ops and their `userData` twins. **Do not let Wave 6
  undo Wave 2.**
- **Item 36 moved up** — OQ6 is answered: **Low is a shipping look**. Low already gained the
  foam ring, the glint, the ships and a `roughness 0.5` ocean. Audit item 36 is now about what
  is *still* missing on Low, chiefly the hologram.
- Item 30 — `panelTex` at 4.5:1 and 44:1 stretch. The `uvMeters` pattern from the Storerooms
  shelf steel (`f8d296c`) transfers directly.
- Item 31 — impact-ripple normal added in **world** space where three's `normal` is **view**
  space.
- Correctness batch: items 26–28, 35. Seven `toneMapped:false` flags that are no-ops on
  Medium/High and *inverted* on Low; the dead spindle-light contract and its false comment; the
  stale booth JSDoc; and the `lodProps` registration carrying the **same camera-to-origin bug
  fixed in Storerooms** (`6ece86c`) — `far: 95` in a 34.3 m arena, inert for all three props.
  **That one cannot be proven by capture** (SHOOT-ANIM-1): use a `getLevelLodNodeCount()` A/B,
  a unit test, and a real match.

## Resolved — Wyatt's calls

- **OQ3** — resolved 08-02 in `9a59271`. It was worse than the audit said: "center podium" is
  three materials and **two** were bare `color + roughness + metalness` (`podiumTopMat` and
  `capPlateMat`), not just the crown plate. Fixed in the code, so `art-direction.md`'s "every
  allowlisted surface passes" line is true again rather than weakened.
- **OQ8 — STYLISE.** Keep the 9.93° key and the 1.87° disc; the 8° gap is deliberate. **Do not
  "fix" it.**

  The key is what sculpts the deck, and dropping it to meet the disc guts that:

  | | key at 9.93° | key at 1.87° |
  |---|---|---|
  | hemi : key on a horizontal deck | 2.32 : 1 | **12.26 : 1** |
  | key's directional contribution | 100% | **18.9%** |

  That is audit §7's objection, and it stands. Wave 4's rule is additive-only; this would take
  shaping away.

  **The instrument matters more than the answer here.** A runtime sweep of *whole-deck frame mean*
  said the key elevation barely mattered — and it was right about brightness and useless about
  raking, because the hemi dominates that mean and the measurement is post-exposure. A ~1.5% frame
  figure was quoted from it during planning; **it is not in the tree and must not be cited.** If
  this is ever reopened, measure **sun-facing vs anti-sun-facing vertical surfaces** — bollard
  flanks, podium frustum sides — never whole-deck mean.

  Both "up" paths, recorded so neither is lost: raise the disc to y≈75 m (`SUN_HEIGHT` up at the
  current `SUN_DISTANCE` 430), **or** pull `SUN_DISTANCE` 430 → ~80 keeping `SUN_HEIGHT = 14`.
  They carry different composition costs; neither was evaluated.

  `SUN_KEY_DISTANCE` (added in item 16) single-sources the key's angle, so the light and the
  god-ray tilt now move together if this is ever revisited.

## Owed to Wyatt's playtest — no capture can settle these

- Do the gate beacons **breathe** rather than step?
- Do the ship engine glows read as glows rather than squares?
- Do the ships **glide** on a phone, or stutter?
- Do the turbines read as machinery at 10–15 RPM?
- Does the sun still read hot enough at bloom threshold 0.68 (frame bloom fell 55.6% → 18.7%)?
- The Low-tier arena generally — it changed more than any other tier this pass.
- Carried from Storerooms: does the suction lip band read as "committed" or as a game marker,
  and does the racking read as used steel or just a darker wall?

## Explicitly out of scope

The **five gulls** (`:1598`) and the **star-field FOV placement** are named in the audit's own
coverage gap as never audited by anyone. **Deferred — not this pass.** The stars land +46°→+90°,
i.e. zenith-only and outside the chase FOV, which tops out near +27°.

## Do not

- **Do not fix a bright horizon by darkening the arena** — not exposure, not fog density, not
  the hemi. Fog density and exposure are both off-limits; the Wave 1 fix was a mapping bug.
- **Do not let "make the raking light read" become "take light away."** Additive only.
- **Do not let pink or cyan back in.** No `accentColor` in the hologram; do not implement the
  booth JSDoc's pink/cyan rails; do not "fix" the two stale "cyan" comments over amber code.
- **Do not reshape the octagon or the podium.** Surface and placement only. The one sanctioned
  geometry change is making round things octagonal, never the reverse.
- **Do not turn the wear pass into a grime pass** — salt, sun-bleach, spray staining, rust bleed.
- **Do not reinstate per-cart directional blob shadows** (see item 13).

## Process notes

- **A second agent session shares this worktree** and commits to the same branch. Check
  `git log --oneline -5` before assuming a commit is yours. Stage by explicit path, and stage +
  commit in **one command** — a pathspec-less commit from the other session swept this
  session's staged docs into `284bef1` during a gap of seconds.
- **`SKIP_DOCS_HOOK=1` for source-only commits.** The pre-commit hook regenerates
  `BRIEFING.md` and `ARCHITECTURE.json`, and `ARCHITECTURE.json` embeds BACKLOG — so without
  the flag it will fold another session's in-flight BACKLOG rows into your commit. Use the hook
  normally when *you* are the one editing STATUS or BACKLOG.
- **Check `git show --stat HEAD` after every commit**, not just the staged diff.
- **`npm run qa` goes red for reasons that are not yours.** Seen this session: the workerd pool
  timing out (`connect ETIMEDOUT 127.0.0.1:6054`), doc canaries timing out against another
  session's in-flight writes, and a syntax error in a test file being actively edited. Run the
  `unit` project alone to isolate, and **do not commit over a red gate** — wait for it to clear.
- **STATUS.md has a hard 8,000-token budget** and hit 7,993 this session. It was trimmed to
  ~7,456 by moving the closed Storerooms narrative into its audit doc. Check
  `node tools/status-size.mjs` before adding to it.
