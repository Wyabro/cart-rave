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
