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
| `?rtmode=half\|float\|byte\|bloombyte` | VFX-1: composer/bloom RT A/B (half=default) |
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
npm run qa          # typecheck + vitest + knip (same as CI)
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

## UI QA checklist (menus / HUD / overlays)

Correctness rules for menu chrome, HUD, and transition overlays — the DOM/2D
layer, not the arena render. Distilled from the anti-slop design law
(https://pols.dev/slop.md), keeping only the objectively-checkable rules and
dropping the marketing-page taste guidance (our look is intentionally dark +
neon — see [[cart-rave-look-dark]], and we own our type/stickers). Run this
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
