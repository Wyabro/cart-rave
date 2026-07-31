# SHEET-1 — `npm run sheet`, an in-match HUD contact-sheet tool

**STATUS: ACK'D 2026-07-30** (canvas-hide HUD shots · DOM pin · `harness:1` · small default
matrix). **NOT STARTED — BLOCKED.**

Line references re-verified against HEAD `34fdad4`. `tools/lib/harness.mjs`, `tools/shoot.mjs`,
`tools/compare.mjs` and `src/utils/visualHarness.js` are untouched since the plan was written;
ANLX-ATTRACT-1 added lines to `src/main.js` *below* every reference cited here, so
`main.js:1843` / `:5450` / `:5528-5541` all still resolve.

**Do not start until BOTH clear, or Wyatt explicitly says cut ahead:**
1. **ANLX-ATTRACT-1** — verified live, not merely shipped.
2. **Analytics-DO reset.**

Ordering matters beyond politeness: every `npm run sheet` cell boots a solo round, which is
exactly the traffic ANLX-ATTRACT-1 is about. Running this first pumps more junk into the DO
and muddies that card's acceptance signal (the <3 s draw cluster ceasing to grow).

## Context

`shoot.mjs` is menu-only (`hud=0` by default, waits on attract, no sweep, no montage —
`shoot.mjs:46,:212`) and `blackframes.mjs` samples black-pixel ratios, not images. Nothing in
the toolkit can reach an **in-match** frame at N viewports, which is what the responsive work
needs.

### What SHEET-1 actually unblocks — narrowed

**In scope: in-match HUD responsive sweep + reduced-motion stills.**

Explicitly **not** unblocked, and not to be claimed later:

- **Cold-boot loading screens** — `makeClient` seeds `cartRaveBootSeen: "1"` (`harness.mjs:260`),
  so the splash is skipped by construction; `phase==="running"` is already past mode-entry.
- **Die-cut hover/press surfaces** — needs interaction, not a still.
- **UI-SCALE-1 Pass 1 identity** — Pass 1 is menu CSS, and `shoot.mjs` already takes
  `--w`/`--h`/`--menu` (`:136-137`, `:46`). Keep `shoot` for that.

So FIGHT-VERIFY-1 and UI-SCALE-1 are *partly* unblocked. Do not oversell it.

### Blackframes pre-check — resolved, off this card's path

**False-black disproven.** `npm run blackframes -- --shot classic --frames 30` → 0.5517 PASS;
live browser `settle()` + `sampleBlack()` → 0.2042. A cleared WebGL buffer reads ~1.0 in both.

**Frame-to-frame freshness remains unproven** — `blackframes` hardcodes `freeze=1` (`:44`) and
the browser run was a hidden tab. Irrelevant: contact sheets use Playwright `page.screenshot()`.

## Reuse — `tools/lib/harness.mjs` is most of this card

| Need | Existing |
|---|---|
| Boot into a live solo round, no clicks | `?room=solo` (`main.js:1816-1823`); `gameharness.mjs:92-97` |
| **Loop actually runs** | `makeClient` → `Emulation.setFocusEmulationEnabled` (`harness.mjs:274`) |
| Anti-throttle launch | `launchClientBrowser` (`harness.mjs:222`) |
| Phase wait, per-cell labelled | `waitForState(page, s => s?.phase === "running", { read: readRound, label })` |
| Arena selection | `makeClient`'s `o.storage` → `cartRaveLevel` |
| Deterministic match state | `__ccDiag.control.setScores()` / `rewindRoundClock()` |
| Image diffing | `tools/compare.mjs` (MAE; non-zero >5 MAE / >2 % diff) |

## Changes — 2 commits

**1 · `makeClient` context passthrough** (`tools/lib/harness.mjs:255`)
It hardcodes `viewport: { width: 900, height: 600 }`. Add optional `viewport`,
`reducedMotion`, and explicit `deviceScaleFactor: 1` (matching `shoot.mjs:135` and
`tabhidden.mjs:469-471`). Defaults unchanged; existing rigs untouched.

**2 · `tools/sheet.mjs` + `npm run sheet`**

Per cell: `launchClientBrowser` → `makeClient({ params:{room:"solo",diag:"1",perfPump:"1",
harness:"1"}, storage:{ cartRaveLevel }, viewport, reducedMotion })` →
`waitForState(phase==="running")` → pin → settle → screenshot.

- **`harness:"1"` is required.** `installVisualHarness` only runs when
  `dbg.harness || dbg.freeze || dbg.cam || dbg.ablate.size || dbg.hideHud` (`main.js:5450`);
  without it `__cartRave.settle` is undefined. `harness=1` alone is right — `freeze`/`cam`
  lock the camera (`main.js:5460-5462`) and `hud=0` hides the subject.
- **Fresh page per cell** — a post-boot viewport change does not re-run the entrance cascade.
- **No `freeze=1` in-match.**
- **State pin — do NOT copy `gameharness.mjs:60-71`.** `rewindRoundClock(remainMs)` *sets*
  remaining time (`globals.d.ts:90`), so `rewindRoundClock(1200)` = "1.2 s left" — a
  **fast-end** lever that would race podium mid-capture. Pin mid-round:
  `setScores({0:2,1:1,2:0,3:0})` then `rewindRoundClock(90_000)`, then one `settle`.
- **Full `{w,h}` tuples:**

  | Set | Cells |
  |---|---|
  | **Default** | `1920×1080`, `390×844`, + one `1920×1080` reduced-motion |
  | UI-SCALE union (`--all`) | `3440×1440`, `1920×1080`, `1512×982`, `1366×768`, `768×1024`, `390×844` |
  | FIGHT-VERIFY pairs (`--all`) | `1025×600`, `1024×768`, `768×1024`, `380×800` |

- Flags: `--viewports=WxH,WxH` · `--arenas=…` · `--reduced-motion` · `--all`. **Default arena
  `classicRecord` only.** `--reduced-motion` = RM for every selected viewport, **deduped by
  `{w,h,rm}`** → `1920`, `390`, `1920+RM`, `390+RM`, not a stacked duplicate.
- Output per cell: full-viewport PNG **and** a chrome-only `*-hud.png`.

  **Do not clip to `#hud`** — it is `position: fixed; inset: 0; pointer-events: none`
  (`src/ui/styles/hud.css:4,23-26`), a transparent full-viewport overlay, so its rect is the
  whole frame and the live canvas composites through. Instead **hide the canvas, shoot,
  restore**: `document.querySelector("canvas").style.visibility = "hidden"` (the handle
  `visualHarness.js:134` falls back to). Chosen over clipping opaque widgets (brittle against
  the very layout changes this catches) and over dropping pixel compare (loses the only
  automated signal). Needed at capture time because `compare.mjs` takes only
  `--a --b --out --threshold` (`:44-66`) — no clip/mask flag.
- `index.html` montage using the **same card pattern** as `dashboard.mjs:256` (own page, does
  not extend that file). Each card prints **both `qualityTier` and `gpuClass`** from
  `page.evaluate(() => window.__ccDiag.snapshot("runtime"))` (`gameplayDiagnostics.js:322-327`).
  Traps: the field is **`qualityTier`** (camelCase — `quality_tier` is the CaptureLog column),
  and the probe reads **settingsStore**, not the session force from `getQualityTier()`, so it
  can read higher than what rendered. `gpuClass` beside it is what surfaces the SwiftShader/LOW
  story Risk #1 is about.

## Verification

`npm run qa` (report by number). Tools-only — no `src/` change, no `npm run build`.

**Determinism asserted on the DOM, not PNG bytes.** Two runs, then:

1. `npm run sheet` exits 0, two PNGs per cell, no blank/missing cells.
2. **The pin held:** `__ccDiag.snapshot("score").scores` (`gameplayDiagnostics.js:136-139`)
   exactly `{0:2,1:1,2:0,3:0}`; `__ccDiag.snapshot("round").remainingMs` (`:82`) within ~1 s
   of `90_000` (HUD is second-granularity, `hud.js:706`); DOM cross-check on `hud-timer-num`
   (`hud.js:1424`) and the value nodes inside `hud-scoreValueWrap` (`:1523`).
3. `compare.mjs` on the ≥1920 `*-hud.png` pairs under a small MAE threshold.
4. Eyeball one `390×844` cell: a real in-match HUD, not a menu.

The montage must state on its face that it is a **layout baseline, not a golden render**.

## Risks

1. **Layout reference, not visual fidelity.** `launchClientBrowser` passes no GPU flags →
   SwiftShader → LOW tier → spotlights/lasers/skybox off. Same trap recorded for `shoot.mjs`.
   Printing tier + gpuClass per cell is the mitigation.
2. **Wall-clock** — controlled by the small default matrix.
3. Every cell depends on `?room=solo`; pass a per-cell `label` to `waitForState` so a boot
   regression reads as one cause, not nine.
4. Timebox 60–90 min; stop at 3 failed attempts / 45 min on any stage and write findings.

Out of scope: FIGHT-VERIFY-1's own pass, UI-SCALE-1, loading-screen and hover/press capture,
menu Pass-1 identity, the `sampleBlack` freshness question, `src/`.
