# Visual QA guide

Process tooling inspired by [LAAS / fable5-world-demo](https://github.com/Braffolk/fable5-world-demo) — **screenshot harness, ablation flags, and STATUS discipline** — not their WebGPU open-world engine.

Session memory: [docs/STATUS.md](../STATUS.md).

---

## One-time setup

```bash
npm i -D playwright sharp
npx playwright install chromium
```

`sharp` is only required for `npm run compare` (side-by-side PNG). Shoot / blackframes need Playwright only.

---

## URL debug surface

| Flag | Effect |
|------|--------|
| `?ablate=bloom,arcade,fxaa,vhs,output` | Disable named post passes |
| `?postmin=1` | No bloom / arcade / fxaa (RenderPass + OutputPass only) |
| `?freeze=1` | Pin camera (no attract orbit / chase) |
| `?cam=x,y,z[,lx,ly,lz]` | Lock camera pose (look-at origin if look omitted) |
| `?level=classicRecord\|backrooms\|zanzibar` | Force arena (writes `cartRaveLevel`) |
| `?preset=low\|medium\|high` | Session quality tier (not persisted) |
| `?shot=classic\|classic-edge\|storerooms\|sundial\|sundial-edge` | Named bookmark (level + cam) |
| `?harness=1` | Install `window.__cartRave` + warm world ASAP |
| `?hud=0` | Hide main menu chrome (clean arena shots) |
| `?perfPump` | DEV: keep rAF ticking in hidden tabs |
| `?blackmon=1` | VFX-1: live black-frame monitor (L/R slab split); `__blackMon.summary()` |
| `?bloompipe=display\|hdr` | Bloom pipeline (display=default, the VFX-1 fix; hdr=legacy split) |
| `?nettest=1` | Install `window.__ccTest` (netcode 2-client rig — [netcode-harness.md](./netcode-harness.md)) |
| `?diag=1` | Install `window.__ccDiag` gameplay diagnostics (probes + event log — [diagnostics.md](./diagnostics.md)) |

Examples:

```
http://localhost:5173/?shot=classic&freeze=1&harness=1
http://localhost:5173/?shot=storerooms&ablate=bloom&harness=1
http://localhost:5173/?postmin=1&shot=sundial&harness=1
```

### `window.__cartRave` (when harness is on)

| API | Purpose |
|-----|---------|
| `ready` / `worldReady` | Boot + arena warm gates |
| `settle(n)` | Wait N animation frames |
| `sampleBlack()` | Downscaled black-pixel ratio (flicker) |
| `stats()` | Draw calls / triangles / size |
| `reapplyAblation()` | Re-force URL ablate after quality toggles |
| `applyCam()` | Re-pin `?cam=` pose |

---

## Everyday gate

```bash
npm run qa          # full read-only gate chain — defined by `check` in package.json (same as CI)
npm run qa:visual   # short black-frame battery (needs Playwright + optional dev server)
```

CI: `.github/workflows/check.yml` runs `npm run qa` on push/PR to `cart-clash` / `main`.
Visual shoot tools are **not** in CI yet (WebGL/headless flakiness) — run locally when
changing postFX or arenas.

---

## CLI tools

### Screenshot

```bash
# Dev server auto-starts on :5173 if not running
npm run shoot -- --shot classic --out shots/classic.png
npm run shoot -- --shot sundial --ablate bloom --out shots/sundial-no-bloom.png
npm run shoot -- --url http://127.0.0.1:5173/ --noserver --shot storerooms
```

### Look-critical capture (real GPU)

```bash
node tools/shoot-gpu.mjs --out shots/x.png --shot classic-edge --cam "34,4,0,46,-16,0"
```

Use this instead of `npm run shoot` whenever the *look* is the thing being judged.
`shoot.mjs` passes no GPU flags (trap #1 below); this copies `perf-profile.mjs --gpu`'s
launch args and **records the actual `UNMASKED_RENDERER`** in a sidecar `.json` next to
the image. If that says SwiftShader/llvmpipe, the capture is not proof — it warns.

`--cam "x,y,z,lx,ly,lz"` is usually required: the named `?shot=` bookmarks frame the
arena overview, not whatever surface you changed.

> **Read the amplified diff panel, not the percentage.** `npm run compare`'s middle panel
> shows *where* pixels changed. Two captures taken in separate browser sessions differ
> substantially with your change contributing nothing — on Classic by 15–30%. Three separate
> 08-01 findings (ART-PASS-CLASSIC-1 L1's first capture, L4, L5) had all of their "evidence"
> sitting in that variance. A number alone has never once been sufficient here.
>
> That variance was long attributed to *crowd animation*. It is not — SHOOT-ANIM-1 proved the
> crowd was frozen in every capture, and the rave dressing is still frozen today. The real
> cause is that arena **construction is unseeded**: `Math.random()` runs at build time for
> procedural textures and decor scatter (56 call sites in `zanzibarPlatform.js` alone), so
> every page load paints a different arena. Measured with animation *pinned* (`--t 500`), where
> animation cannot contribute: Classic still differs by 15.89%. Same mechanism, different name.

### Capturing animated properties (`--t`)

Level animation is driven by the attract loop (SHOOT-ANIM-1). Without `--t` it free-runs, so a
capture lands on whatever phase it caught. `--t <ms>` pins it to one timestamp:

```bash
node tools/shoot-gpu.mjs --shot sundial --t 0   --out shots/a.png
node tools/shoot-gpu.mjs --shot sundial --t 250 --out shots/b.png
npm run compare -- --a shots/a.png --b shots/b.png
```

**Judge the delta against the arena's construction-noise floor, not against zero.** Measured,
same pinned phase, two browser sessions:

| Arena | Null floor (`pctDiff>2`) | Notes |
|---|---|---|
| Sundial | **~1.2%** | 1.22% and 1.21% on two independent pairs |
| Classic | **~15.9%** | floor swamps the signal — `--t` does not make Classic reproducible |

Sundial reference points: `--t 0` vs `--t 250` = 2.61%; `--t 1745` vs `--t 5236` (the full
`sin` swing, +1 → −1) = 15.01%. Pick a Δt near half the property's period — a small Δt on a
slow pulse can sit under the floor, which is a framing artifact, not a null result.

**Backrooms is not reproducible even with `--t`** — `furnitureSpotlight.update` is a stateful
integrator driven by `Math.random()`, and a constant pinned `t` gives it `dt = 0`.

#### Classic Record specifics

The rave dressing — crowd, stage lights, LED screen — animates in captures as of SHOOT-ANIM-2.
Four things to know before you trust a Classic capture:

- **Use `--t 500` or higher, never `--t 0`.** `lastLedUpdate` and `bbLastRedraw`
  (`effects.js:279`/`:318`) both init to `0` and gate on `nowMs - latch`, so at `t = 0` neither
  threshold is crossed and the LED screen and billboard keep their construction content. At any
  non-zero pinned `t` they redraw once and then hold, which is correct for that phase.
- **A pinned crowd is only partially posed.** `updateCrowd` rewrites one round-robin batch of
  instanced crowd carts per call (`effects.js:2021`), so under a constant `t` the same batch is
  chosen every time and the rest hold their rest pose. Searchlights, bulb pulse, glow ring and
  stadium pulse materials *are* fully correct under pinning. For crowd-cart motion specifically,
  free-run reads truer than pinned.
- **Lasers and the billboard are absent from every capture, not frozen.** The menu path builds
  the shell with `includeJuice: false` (`main.js:2615`) and captures boot through that path.
  Do not report "the lasers didn't change" — they are not there.
- **The record spin and the whole VHS layer are still static.** The spin is delta-accumulated
  and slow-mo-coupled, so it stays game-loop-only. The VHS layer is dead everywhere, in
  gameplay too — see FX-TIME-1.

**Worked example — why the amplified panel beats the number.** SHOOT-ANIM-2's acceptance pair
was `--t 500` vs `--t 6783` (6283 ms = exact antiphase for both `sin` terms): **36.24%** against
a **14.51%** same-phase floor. Only ~2.5×, which on its own is not convincing at that floor. The
panels settled it — the null showed *crowd speckle alone on a black floor*, while the signal
added searchlight shafts, stage-light columns and deck rim rings. Structured features that
appear only in the signal are the result; speckle in both is construction randomness.

### Compare two PNGs

```bash
npm run compare -- --a shots/before.png --b shots/after.png --out shots/cmp.png
```

Prints mean absolute channel error + % pixels above threshold. Writes `a | amp-diff | b`.

### Black-frame battery

```bash
npm run blackframes -- --shot classic --frames 60
npm run blackframes -- --shot storerooms --frames 48 --report shots/black-storerooms.json
```

Fails if any frame’s black ratio ≥ `--max-ratio` (default `0.92`) or consecutive near-full-black frames exceed `--max-full` (default `2`).

### Tab-hidden reveal guard

```bash
npm run tabhidden                  # both scenes: menu + round
npm run tabhidden -- --scene round # round-start HUD only
npm run tabhidden -- --hold 2000 --report shots/tabhidden.json
```

Automates **UI checklist rule #1** (invisible-content trap). Marks the tab hidden
and **freezes rAF** (no `perfPump`), then returns to the foreground (resuming and
flushing deferred frames, faithful to Chrome) and asserts nothing is stranded.
Two scenes:

- **menu** — replays the menu entrance so its cascade stalls mid-flight, then
  asserts every `.cr-menu-enter-pending` target is visible again.
- **round** — boots `?room=solo`, catches the live countdown (COUNTDOWN_MS, shared/roundConstants.js), freezes the rAF
  game loop through the whole countdown → running transition, then asserts the
  HUD caught up (timer + score boxes visible, no frozen countdown digit).

Each scene first proves it actually stalled while hidden (menu targets at
`opacity:0`; HUD stuck pre-running) — so a green run means the recovery genuinely
worked, not that the test was a no-op. Exit 1 if anything is stranded.

The **round** scene needs the arena to warm (WebGL), which flakes headless like
`shoot`/`blackframes`; the tool pre-warms physics deps and retries once
(`--round-timeout`, `--round-retries`). Local only — not in CI. `--hold`/`--settle`
tune the background window; `--scene menu|round|all` picks scenes.

---

## Traps that cost real time (07-30 — CARGO-VIS-1 / CARGO-HUD-1 / SKYBOX-1)

Learned the hard way while building one-off rigs. Each of these produced a **confident wrong
answer**, not an error, so none of them announce themselves.

1. **`shoot.mjs` passes no GPU flags.** Headless falls back to SwiftShader, which is blurry and
   raises a full-screen "graphics running in software mode" modal that covers the shot. For
   look-critical captures launch Chromium yourself with
   `--enable-gpu --ignore-gpu-blocklist --use-gl=angle` (and dismiss the modal if it still
   appears). `tools/perf-profile.mjs --gpu` does this, and every run now records the actual
   `UNMASKED_RENDERER` as `gpuVendor` — check it before trusting absolute numbers.

2. **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js`, `if (import.meta.env.DEV)`).
   Against **production** it does not exist, so `scene?.traverse(...)` silently yields nothing
   and a probe reads as "the thing never built". Verify prod **visually** (screenshot + the
   build stamp in the corner). `__cartRave.stats()` does exist in prod (it is `?harness=1`, not
   DEV-gated) but its `drawCalls`/`triangles` read `renderer.info` after a settle and often
   come back as `1`. `import("/src/…")` is the same trap — dev server only; prod is bundled.

3. **The game exposes no mutable cart refs, deliberately.** `__ccTest.state()` and
   `__cartClashCargo()` both return mapped copies. Drive gameplay state through `CONFIG` levers
   **before carts spawn** (e.g. set `cargo.baselinePoints` from the menu, then enter play), not
   by poking cart objects.

4. **Assert cargo//life state at COUNTDOWN, not mid-round.** A few seconds into a live round the
   NPCs have already rammed each other and `stripLifeCargo` has fired, so a "stripped" readout
   is *true state*, not a bug. Countdown is the only moment every cart sits at its spawn value.

5. **Enter play via the menu's `cartrave:menu` event, not `?room=solo`,** when the warm path
   matters: a direct room boot never takes the `warm: true` branch (it settles against the
   4000 ms default budget). Dispatch
   `new CustomEvent("cartrave:menu", { detail: { action: "solo" } })` after the idle warm.

6. **Some scene objects only get positioned inside their `update()`** — and the menu attract
   loop does **not** tick `sceneExtras.update`. A rig that samples during attract can catch
   objects at their construction default (the SKYBOX-1 UFOs sat at world origin, in the KO pit).
   Sample in a live round too before concluding something is misplaced.

---

## Suggested workflow

1. Reproduce: `?shot=…&harness=1&freeze=1`
2. Ablate: `?ablate=bloom` → `arcade` → `fxaa` → `?postmin=1`
3. Capture before/after with `npm run shoot`
4. Diff with `npm run compare`
5. For intermittent black frames: `npm run blackframes -- --shot classic --frames 90`
6. Log results + decision in [STATUS.md](../STATUS.md)

---

## Bookmarks (`?shot=`)

| Id | Level | Intent |
|----|--------|--------|
| `classic` | classicRecord | Three-quarter overview |
| `classic-edge` | classicRecord | Edge / void read |
| `storerooms` | backrooms | Aisle overview |
| `sundial` | zanzibar | Deck overview |
| `sundial-edge` | zanzibar | Edge / water read |

Defined in `src/utils/debugParams.js` → `VISUAL_BOOKMARKS`.

---

## Arena-render checklist (the 3D look)

The look rules for the arena render live in
**[docs/reference/art-direction.md](../reference/art-direction.md)** — canonical, and the file
the dangling `[[cart-rave-look-dark]]` link used to point at. Five falsifiable rules, checked
before signing off any material, lighting, or postFX change:

1. **No pristine hero surface** — every allowlisted hero material carries at least one authored
   or procedural map. Bare `color + metalness + roughness` is a defect.
2. **No screen filter outside The Storerooms** — measured on the *resting* arcade uniforms
   after level load, not on a live frame (event juice spikes from that base).
3. **Blacks stay black** — per-arena luma floor via `npm run shoot`, drift guarded by
   `npm run compare`.
4. **Silhouette rule** — threshold a frame to pure black/white; every cart and kill edge stays
   identifiable.
5. **Cart neon clears its background** — measured contrast against the busiest background that
   arena can put behind a cart.

Rules 1 and 2 fail today by design; see the art-direction doc for status and per-arena budgets.

---

## UI QA checklist (menus / HUD / overlays)

Correctness rules for menu chrome, HUD, and transition overlays — the DOM/2D
layer, not the arena render. Distilled from the anti-slop design law
(https://pols.dev/slop.md), keeping only the objectively-checkable rules and
dropping the marketing-page taste guidance (the arena look is owned by
[art-direction.md](../reference/art-direction.md), and we own our type/stickers). Run this
before signing off any menu or HUD change.

1. **Nothing gated on an animation completing.** Content must be present and
   readable even if its entrance never fires. Reveals that start at `opacity:0`
   / translated-away and rely on JS, WAAPI, or `animation-timeline` strand the
   content as a blank void when a tab is backgrounded or the rAF loop is frozen
   — a failure mode we already hit (hidden-tab rAF freeze, WAAPI never finishing
   in hidden tabs). Animate things already on screen; never hide existence
   behind motion. **Verify:** `npm run tabhidden` (automated — freezes rAF with
   the tab hidden mid-entrance, then asserts nothing is stranded invisible on
   return), or manually background the tab mid-transition and confirm nothing is
   missing.

2. **Centering is verified, not eyeballed.** HUD badges, countdown digits, KO
   callouts, sticker glyphs. In SVG, `text-anchor:middle` only centers
   horizontally — you still need `dominant-baseline:central` (or a measured
   `dy`) for vertical, and a glyph's optical center ≠ its bounding-box center.
   **Verify:** zoom into the element and check it sits dead-center.

3. **Clip-paths / notches don't crop live text.** Any `clip-path`,
   `overflow:hidden`, notched panel, or fixed-height row must clear the text
   past the cut by more than it removes. **Verify:** zoom the clipped edge and
   confirm no caps/descenders are shaved (podium lower-thirds, sticker frames).

4. **Every control actually responds to a click.** No dead buttons, tabs, or
   toggles that look interactive but do nothing. **Verify:** real pointer click
   on each control in the browser (menu, arena select, customize UI).

5. **Blur / gradient surfaces: no banding, no leaking shadow.** On our dark
   surfaces a banded gradient or a boxy drop-shadow silhouette reads as broken.
   Gradients need fine grain/noise; shadows stay tight, low-offset, and
   directional (a bad blur is worse than no blur). **Verify:** zoom a gradient
   panel for stripes and any glass/shadow edge for a hard rectangle behind it.

6. **HUD text clears its background by a real contrast gap.** Text over a dark
   arena with bloom is where legibility dies. **Verify:** read every HUD label
   against the brightest and busiest arena background it can sit over — if in
   doubt, push contrast further (a text-shadow scrim beats dim ink).
