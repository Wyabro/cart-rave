# SHEET-1 — `npm run sheet`, an in-match HUD contact-sheet tool

**STATUS: ACK'D 2026-07-30 · READY — NOT STARTED** (canvas-hide HUD shots · DOM pin ·
`harness:1` · small default matrix). **Both gates cleared 2026-07-31** — ANLX-ATTRACT-1
closed on a live two-client prod probe, and the analytics DO was reset (20,000 rows → 0).

*Why it was gated, past tense:* every `npm run sheet` cell boots a solo round, which is
exactly the traffic ANLX-ATTRACT-1 was about — running it first would have pumped junk into
the DO and muddied that card's acceptance signal. With the card closed and the ring cleared,
that traffic is now free to generate.

Line references re-verified against HEAD `d324687` (docs-only commits since the plan was
written; no tool or `src/` file below moved). `tools/lib/harness.mjs`, `tools/shoot.mjs`,
`tools/compare.mjs` and `src/utils/visualHarness.js` are untouched since the plan was written;
ANLX-ATTRACT-1 added lines to `src/main.js` *below* every reference cited here, so
`main.js:1843` / `:5450` / `:5528-5541` all still resolve.

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
| Boot into a live solo round, no clicks | `?room=solo` (`main.js:1830-1837` — **not** `:1816-1823`, that is the testdrive/`engagedRoom` cleanup); `gameharness.mjs:92-97` |
| Dev stack up before any cell | `maybeStartDevStack` + `preflightStack` (`gameharness.mjs:487-488`), `CLIENT_PORT` 3000 (`harness.mjs:30`) |
| **Loop actually runs** | `makeClient` → `Emulation.setFocusEmulationEnabled` (`harness.mjs:274`) |
| Anti-throttle launch | `launchClientBrowser` (`harness.mjs:222`) |
| Phase wait, per-cell labelled | `waitForState(page, s => s?.phase === "running", { read: readRound, label })` |
| Arena selection | `makeClient`'s `o.storage` → `cartRaveLevel` |
| Deterministic match state | `__ccDiag.control.setScores()` / `rewindRoundClock()` |
| Image diffing | `tools/compare.mjs` (MAE; its own exit is non-zero >5 MAE / >2 % diff — **`sheet` ignores that exit code**, see Verification 3) |

## Changes — 2 commits

**1 · `makeClient` context passthrough** (`tools/lib/harness.mjs:255`)
It hardcodes `viewport: { width: 900, height: 600 }`. Add optional `viewport`,
`reducedMotion`, and explicit `deviceScaleFactor: 1` (matching `shoot.mjs:162` and
`tabhidden.mjs:470-471`). Defaults unchanged; existing rigs untouched.

**2 · `tools/sheet.mjs` + `npm run sheet`** (add the `"sheet"` script entry to
`package.json` — it is part of this commit, not assumed)

Per cell: `launchClientBrowser` → `makeClient({ params:{room:"solo",diag:"1",perfPump:"1",
harness:"1"}, storage:{ cartRaveLevel }, viewport, reducedMotion })` →
`waitForState(phase==="running")` → pin → settle → screenshot.

- **Bring the dev stack up once, before any cell.** Reuse `maybeStartDevStack` +
  `preflightStack` from `tools/lib/harness.mjs` exactly as `gameharness.mjs:487-488` does,
  against `CLIENT_PORT` 3000 (`harness.mjs:30` — the Vite port from `vite.config.js`, not
  5173). Without it the tool silently assumes a hand-started server and every cell burns its
  full boot timeout instead of failing once; `preflightStack` already emits the right message
  (including the wedged-workerd hint, `harness.mjs:196-201`).

- **`harness:"1"` is required.** `installVisualHarness` only runs when
  `dbg.harness || dbg.freeze || dbg.cam || dbg.ablate.size || dbg.hideHud` (`main.js:5450`);
  without it `__cartRave.settle` is undefined. `harness=1` alone is right — `freeze`/`cam`
  lock the camera (`main.js:5460-5462`) and `hud=0` hides the subject.
- **Fresh page per cell** — a post-boot viewport change does not re-run the entrance cascade.
- **No `freeze=1` in-match.**
- **State pin — do NOT copy `gameharness.mjs:60-71`.** `rewindRoundClock(remainMs)` *sets*
  remaining time (`src/globals.d.ts:90`), so `rewindRoundClock(1200)` = "1.2 s left" — a
  **fast-end** lever that would race podium mid-capture. Pin mid-round:
  `setScores({0:2,1:1,2:0,3:0})` then `rewindRoundClock(90_000)`, then one `settle`.
  90 000 is in range: the levers reject `remainMs > roundDurationMs` (150 000,
  `devControl.js:44`).
- **Assert the pin actually applied.** Both levers are host-gated **and**
  running-round-gated (`devControl.js:26-34`) and return `{ ok, message, reason }` — a
  refusal is a silent no-op otherwise. Check `ok` on both calls and fail the cell with the
  returned `reason` (`host-required` / `round-not-running` / `bad-args`). Solo satisfies the
  host gate: `netcode.js:2264-2268` sets `isHost = true` + `setAuthorityMode(true)` for
  `solo`/`testdrive`, and the phase gate is satisfied by waiting for `phase==="running"`
  first.
- **Do not trust the "DEV-only" comments on `__ccDiag.control`.** Three of them are stale —
  `diagnostics.js:290-291`, `src/globals.d.ts:75-76`, `devControl.js:1`. The truth is
  `main.js:1577`: control attaches when `import.meta.env.DEV || diagUrlFlags().enabled`, so
  `?diag=1` carries the levers in prod builds too (host-gated; see `main.js:1572-1576`).
  Filed as DIAG-DOC-1. This tool runs on the Vite DEV stack either way, so it is availability
  you can rely on — the `ok` assert above is for the host/phase gates, not for existence.
- **Full `{w,h}` tuples:**

  | Set | Cells |
  |---|---|
  | **Default** | `1920×1080`, `390×844`, + one `1920×1080` reduced-motion |
  | UI-SCALE union (`--all`) | `3440×1440`, `1920×1080`, `1512×982`, `1366×768`, `768×1024`, `390×844` |
  | FIGHT-VERIFY pairs (`--all`) | `1025×600`, `1024×768`, `768×1024`, `380×800` |

- Flags: `--viewports=WxH,WxH` · `--arenas=…` · `--reduced-motion` · `--all`. **Default arena
  `classicRecord` only.** `--reduced-motion` = RM for every selected viewport, **deduped by
  `{w,h,rm}`** → `1920`, `390`, `1920+RM`, `390+RM`, not a stacked duplicate.
- **What the RM cell actually shows.** It differs via the HUD's own
  `@media (prefers-reduced-motion: reduce)` rules — `hud.css:769` (feed row) and
  `hud.css:1845` (urgent timer, charged boost fill) — plus the menu entrance cascade if that
  still runs (`tabhidden.mjs:471` is about the *menu*, not in-match). So an RM/non-RM delta is
  a **different CSS branch**, not "the same layout with motion off"; read it that way.
- Output per cell: full-viewport PNG **and** a chrome-only `*-hud.png`, in this **order** —
  the hide happens *between* the two shots, never before both:

  > `settle` → pin + assert both levers `ok` → **full-viewport PNG** → hide canvas +
  > `.cart-nametag` → **`*-hud.png`** → restore both.

  **Do not clip to `#hud`** — it is `position: fixed; inset: 0; pointer-events: none`
  (`src/ui/styles/hud.css:4,23-26`), a transparent full-viewport overlay, so its rect is the
  whole frame and the live canvas composites through. Instead **hide, shoot, restore**:

  1. `document.querySelector("canvas").style.visibility = "hidden"` — the same handle
     `visualHarness.js:134` falls back to. Note `window.__cartRave` (`visualHarness.js:200`)
     exposes no canvas getter; `deps.getCanvas` is internal (wired `main.js:5457`), so the
     query selector is the only page-reachable route, not a shortcut.
  2. **Also hide the CSS2D nametags** — `addStyleTag({ content: ".cart-nametag { visibility:
     hidden }" })`. Hiding the canvas alone does **not** remove them: `labelRenderer.domElement`
     is a separate `div` appended to `document.body` at z-index 19985 (`main.js:1633-1644`),
     so nametags keep drawing over the chrome shot and track live cart poses — pure run-to-run
     xy drift. Target the class (`main.js:3678`), not the container: that div carries no id or
     class, only inline styles, so any selector for it would key off inline-style text.

  Chosen over clipping opaque widgets (brittle against the very layout changes this catches).
  Needed at capture time because `compare.mjs` takes only `--a --b --out --threshold`
  (`:44-66`) — no clip/mask flag.
- `index.html` montage using the **same card pattern** as `dashboard.mjs:255-262` (own page, does
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
3. `compare.mjs` on the ≥1920 `*-hud.png` pairs — **printed, never gating.** The MAE is a
   number to look at; it is **not** added to the `CheckTally` and cannot fail the run.
   **Exit-code contract:** `npm run sheet` exits 0 when the DOM pin held (step 2) and both
   PNGs exist for every cell. A bad MAE never produces a non-zero exit.

   It cannot be a hard gate, and this is not a threshold-tuning problem — do not "fix" it
   back into one. Two drift sources: CSS2D nametags (removed by the `.cart-nametag` hide
   above) and **the kill feed, which is irreducible** — feed plates are HUD chrome, and NPC
   KOs land at different wall-clock times each run. The pin fixes scores and the clock, not
   KO timing.
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
