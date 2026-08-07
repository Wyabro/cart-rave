# PERF-PASS-1 Waves 3–4 — HANDOFF

**This document is written for a fresh session.** It assumes no memory of the previous one.
Read it top to bottom before touching code. Every line ref was verified 08-03 at HEAD `6404fbd`
and re-checked 08-04 at `adbe6ca` (only `main.js` and `backroomsSupermarket.js` moved since; the
`main.js` refs below are unchanged).

> **Status: UNPARKED 08-04 — Wyatt unparked PERF-PASS-1 and acked Wave 3.**
> Wave 3 = this plan's plumbing commit + the nine-cell sweep + the cost menu. **Wave 4 ships
> nothing until Wyatt picks from that menu and acks separately.**
>
> Order of operations for Wave 3:
> 1. ✅ This file committed to `docs/planning/perf-pass-1-handover.md`, linked from the
>    PERF-PASS-1 rows in `docs/STATUS.md` and `docs/planning/BACKLOG.md`. A plan under
>    `.claude/plans/` is not in the repo's cold-start read order
>    (`docs/BRIEFING.md` → `AGENTS.md` → `docs/STATUS.md`), so a third window would never find it.
>    The repo already uses this pattern — `art-pass-sundial-handover.md`,
>    `fight-night-ui-handover.md`, `PERF-WARM-handover.md`.
> 2. The plumbing commit (`applySceneAblation` + two call sites + the `main.js:2430` pairing + tests).
> 3. Deploy, then Wyatt runs the sweep. Cost menu built from what comes back.

---

## Context — why this card exists

Wyatt's Run 8 verdict: *"all three have less than passable fps on the intel machine. i want the
goal to be 60 FPS on low on the intel machine."*

His three binding decisions, already made — **do not re-litigate them**:

1. **Pass bar = AVERAGE 60** — mean frame time ≤ 16.7 ms across a round. Not p95.
2. **Cost menu first.** Measure and cost each candidate cut, bring him a menu with before/after
   stills. **No visual change ships without his sign-off on that specific cut.**
3. **Cart Rave (`classicRecord`) alone.** Not Storerooms, not Sundial.

### What is already done (do not redo)

**Wave 1 shipped and deployed** (`aeb83aa`, Worker `7aa288d7`). It added the only instrument that
can see the 60 fps bar: five counters on `window.__ccLoopDbg` (`timed`, `sumMs`, `over16`,
`simMs`, `visMs`) plus a per-round window in `src/utils/gameplayDiagnostics.js` surfaced at
`snapshot.perf.loopRound` (live) and `snapshot.perf.rounds[]` (last 8).

**Wave 2 measured it** (cap-239, Intel UHD 0x8A56, Low, solo, 3 NPCs, 1910×915 @ DPR 1):

| | |
|---|---|
| `meanMs` | **20.934** → **47.8 fps** |
| gap to 16.7 ms | **4.2 ms (20%)** |
| `cpuMeanMs` | 10.438 — **49.9% of frame** (the ≥85% "CPU-bound" gate was NOT met) |
| `simMeanMs` | **0.985** — physics and gameflow are effectively free |
| `visMeanMs` | **9.454** — the visual update, which includes draw submission |
| `unaccountedMeanMs` | 10.496 — present-wait + GPU execution |
| over 16.7 ms | 49.8% of frames · over 33 ms: 24.3% |

**Read that as: this is a geometry/submission problem, not a code-optimisation problem.** ~9.5 of
the 10.4 CPU ms is submitting draws, so cutting geometry should pay **twice** — less CPU
submission *and* less GPU execution.

**Two more facts that shape the work:**

- **renderScale is already spent.** The watchdog demotes Low's 0.75 by `RENDER_SCALE_MUL_STEPS`
  `[1, 0.85, 0.7]` → effective **0.525** (~0.48 MP). A 73% fragment cut bought almost nothing, so
  the frame is **not fill-bound**. Do not propose resolution as a lever.
- **Cart Rave is the outlier, not the platform.** At `?preset=low`: **548,185 triangles / 114 draw
  calls**, vs Storerooms 241,409 / 90 and Sundial 214,641 / 124.

### The ranking, and why it is not what it looks like

| block | triangles at Low | share of 548,185 | source |
|---|---|---|---|
| **Crowd cart-silhouette layer** — 416 instances × ~480 tris | **~200,000** | **36%** | counted from source |
| Crowd person + glowstick layers | ~27,000 | 5% | counted from source |
| Stadium bowl (lathe shells, seats, parapet) | ~32,000 | 6% | prior scene probe, not re-counted |

`buildCrowdCartSilhouetteGeometry` is documented as ~480 tris in `src/effects.js`; capacities are
`[0.52, 0.33, 0.15] × 5000` = 2600/1650/750; Low's `crowdCount: 800` → ratio 0.16 → **416 cart
instances**. That comment also records this geometry was already the dominant cost once (13.5M
tris before it was rebuilt) — proven territory.

**The bowl looks like the biggest thing and is not.** Measure it anyway; expect to keep it.

---

## What Wave 3 must produce

**A cost menu. Not shipped cuts.** One row per candidate: measured Δms, triangle delta, and a
before/after still pair. Wyatt picks; Wave 4 ships only what he picks.

---

## ✅ WAVE 3 RESULT — swept 08-04 (cap-240…248, build `7a91535`, Worker `c052bcc5`)

**Sweep is valid.** Nine cells, Intel UHD, `?preset=low`, Cart Rave, solo host + 3 NPCs, 61–69 s
each. Every cell: `straddledDemotion: false`, `buildFreshness.stale: false`, `rsm 1/1`. **A-B-A
drift = 0.041 ms** (`none` 23.768 → 23.809) against the ±1.5 ms void threshold.

**Baseline = 23.788 ms → 42.0 fps.** Deltas vs the mean of both `none` cells:

| token | mean ms | Δms | fps | over 16.7 ms | verdict |
|---|---|---|---|---|---|
| `pitlights` | 20.909 | **−2.88** | 47.8 | 25.0% | **candidate** — 0 triangles cut |
| `stadium` | 21.130 | **−2.66** | 47.3 | 26.5% | **candidate** — −43 of 147 draws; also cuts `crowdGlow` |
| `stagerig` | 22.688 | −1.10 | 44.1 | 34.5% | noise (<1.5) — subtree is only 1,748 tris |
| `billboard` | 22.695 | −1.09 | 44.1 | 35.6% | noise (<1.5) |
| `crowdcarts` | 23.664 | −0.12 | 42.3 | 41.2% | **null result** — cut 219,648 tris (39.9%) |
| `crowd` | 24.119 | +0.33 | 41.5 | 43.5% | **null result** — cut 246,816 tris (44.8%) |
| `bulbs` | 24.642 | +0.85 | 40.6 | 46.2% | noise/falsifier |

### The geometry model in this document is FALSIFIED. Do not re-derive it.

The ranking above was built on "Cart Rave is 548k triangles, the crowd cart layer is 36% of them,
cutting geometry pays twice." **It does not.** Removing 39.9% of the arena's triangles moved the
frame by **−0.12 ms**; removing 44.8% made it **0.33 ms slower**. Both cuts were confirmed applied
— the 416-instance layer reads `visible: false` in a live round on the dev build, so this is not
the silent un-ablate the §4 hazard warned about. It was checked precisely because the null result
is what that failure looks like.

**What actually pays is per-fragment shading, not vertices.** The two winners are the only two
cells that cut fragment work: `pitlights` removes 3 PointLights from the standard-material light
loop across every shaded pixel (and cuts **zero** geometry), and `stadium` removes 29% of all draw
calls plus the bowl's large screen-covering surfaces and the additive `crowdGlow` ring (overdraw).
Triangle count is not the currency on this box; shaded pixels and light-loop length are.

**Practical noise floor is ≈ ±1 ms per cell**, not the 0.041 ms the A-B-A pair suggests: two cells
that should have been ~0 landed at +0.85 (`bulbs`) and +0.33 (`crowd`), wrong-signed. The plan's
1.5 ms threshold is therefore correctly placed, and only the two candidates clear it.

### Two corrections to this card's own numbers

1. **The gap to 60 is 7.1 ms (30%), not 4.2 ms (20%).** cap-239 read 20.934 ms while straddling a
   renderScale demotion (`rsm` 0.85→0.7). Every cell of this sweep held `rsm 1/1`, so the honest
   clean-Low baseline is **23.788 ms / 42.0 fps**.
2. **"renderScale is already spent" rests on that same demoted capture.** Within this sweep it is
   untestable (rsm was pinned at 1 in all nine cells), but the box read ~2.9 ms faster at the lower
   effective scale. That is suggestive, not proven — the two readings differ in session and boot
   path too. **Flagged for Wyatt, not acted on.** It stays his call.

**Even both candidates together do not reach the bar:** 23.788 − 2.88 − 2.66 = **18.25 ms
(54.8 fps)** if they were additive, and they are not guaranteed to be (`stadium` changes the
fragment load that `pitlights` also acts on). 60 fps at Low needs a lever beyond this menu.

**Stills:** `shots/cost-menu/` — 7 tokens × `classic` and `classic-edge`, `--t 0` pinned.
`billboard` has no still (never built on the `includeJuice:false` shoot path) and `stagerig` sits
outside both camera poses; neither is a candidate, so neither still is owed.

### ⚠ SESSION DRIFT — the Intel box loses ~5 ms over ~37 min. Bracket every future cell.

Wyatt picked `pitlights` **but kept the spindle**, so the shipped cut is the two pit lights only —
an unmeasured variant. The `pitfill` token (`87182fc`, Worker `88e5b8fc`) was added to price it.
**Two attempts, neither usable:**

- **cap-249 — void.** URL said `ablate=pitfall` (typo), *and* the token was not deployed yet.
  An unknown token hides nothing and boots the same harness path, so it is a baseline cell.
  `buildFreshness` did not warn and could not: the bundle was live, it just predated the token.
- **cap-250/251 — void.** Cells were clean (build `87182fc`, no straddle, `rsm 1/1`) but the
  machine was degrading faster than the effect.

Every unablated cell of the day, by wall clock:

| T+min | cell | mean ms |
|---|---|---|
| 0 | `none` (cap-240) | 23.768 |
| 12 | `none` (cap-248) | 23.809 |
| 30 | `pitfall` = unablated (cap-249) | 25.778 |
| 35 | **`pitfill` (cap-250)** | **26.329** |
| 37 | `none` (cap-251) | 28.870 |

**Baseline drift: +5.102 ms (+21.5%) over 37 minutes, accelerating** (+2.0 ms to T+30, then
+3.1 ms in 7 min). `pitfill` ran *before* its baseline, inside the ramp, so its delta reads
**−2.54 ms** against the T+37 `none`, **−1.66 ms** against the trend interpolated to T+35, and
**+0.55 ms** against the T+30 unablated cell. A range of +0.55 to −2.54 is not a measurement.
**Nothing was shipped on it.**

**Consequences — both bind future work on this card:**

1. **A single baseline is not enough on this machine.** Every future timing cell needs an
   **A-B-A bracket** (`none` → cut → `none`) on a cooled box, with the prior tab closed between
   cells so WebGL contexts do not stack. The morning sweep stayed valid *only* because its
   bracket closed at 0.041 ms — that was a property of that session, not of the machine.
2. **The floor moves faster than the levers.** ~5 ms lost over half an hour swamps the entire
   cost menu (best single cut: 2.88 ms). Before more budget goes into 2–3 ms cuts, the drift
   itself is the more valuable target. **Not attributed** — thermal throttling, background load,
   and accumulated browser/GPU state across cells are all live candidates and none is ruled out.
   Do not assume thermal; that is the run-4 "GC metronome" error (**HARNESS-NULL-1**) waiting to
   happen again.

### Wave 4 — SHIPPED 08-04 on Wyatt's explicit call, WITHOUT a bracketed number

`arenaFillLights` (`b754e12`, Worker `9b8b1fbe`). Low `false`, Medium/High `true`. Drops
`pitUplight` + `pitRimFill`; **`spindleLight` deliberately untouched** — Wyatt kept the record's
pink/cyan accent. Classic gained its first `applyQualityTier`, following the Storerooms pattern;
`classicRecord.js` returns `initArena`'s object verbatim, so `main.js`'s `levelApplyQualityTier`
hook reaches it. The ablation call moved **inside** that function, last, so a live tier change
cannot un-ablate a `?ablate=` session.

**The number is a range, not a value: −1.66 to −2.54 ms, and the range includes +0.55.** Shipped
anyway because Wyatt said to, with the caveat stated. **Do not quote a single figure for this
lever anywhere.** If a bracketed cell is ever run, correct the `@property` in `qualityTiers.js`
and this section together.

Verified before deploy (dev, real browser, scene state — the definitive check for a
visibility lever): Low → spindle `true`, `pitUplight` `false`, `pitRimFill` `false`; High → all
three `true`. Post-deploy, the production `scene-*.js` chunk reads `arenaFillLights:!1` /
`!0` / `!0` across the three tiers. **No shoot comparison was made:** neither Classic capture pose
sees down the shaft, so a still pair would have been a null diff dressed up as evidence.

**Owed: Wyatt's playtest** — (1) prod, Cart Rave, Low: look into the shaft after a KO — darker,
**still not pure black** (standing rule); (2) spindle reads deliberately lit, not orphaned;
(3) High unchanged; (4) F8 mid-round at Low.

**The card is NOT closed.** Best case this lever leaves the box at ~46 fps against a 60 bar, on a
baseline that itself drifts +5 ms/37 min. What remains: a bracketed re-measure, and the drift
investigation, which is worth more than any remaining cut on the menu.

---

## The code change — one commit, then measurement only

### 1. `applySceneAblation` in `src/utils/debugParams.js`

**Extend the tokens `?ablate=` already accepts — do NOT add a new flag.** The template is
`applyPostFxAblation`, **lines 293–334**. Copy its shape exactly:

```js
export function applyPostFxAblation(passes) { … }   // :305 body
// reads: const p = getDebugParams(); const has = (name) => p.ablate.has(name);
// per target: if (passes.X && (has(alias) || has("all"))) { X.enabled = false; ablated.push(name); }
// returns:  { ablated: [...new Set(ablated)] }        // :333
```

Write `applySceneAblation(targets)` in the same file, duck-typed on `.visible`, accepting
`{ [token]: {visible:boolean} | Array<{visible:boolean}> | null }`. Return the same
`{ ablated: string[] }` shape.

**`debugParams.js` has ZERO imports** (the only `three` reference is a JSDoc type at :338). Keep
it that way — tools and tests import this module in isolation.

### 2. Call site A — `src/effects.js`, end of `applyRaveExtrasQuality`

`applyRaveExtrasQuality` is **:1887–1925** (body :1896). Append the ablation call at the end so it
wins over everything the tier just set.

`effects.js` does **not** currently import from `debugParams.js` — its `./utils/` imports are
`getQualityKnobs`, `mergeStaticMeshesByMaterial`, `registerMirrorExclude`. Adding the edge is
fine, but **run `npm run arch` before committing** or `arch:check` red-gates.

Verified target refs (all module-level in `effects.js` unless noted):

| Token | Ref | Notes |
|---|---|---|
| `crowdcarts` | `crowdLayers[0].mesh` | InstancedMesh. `crowdCarts` (:214) is a module alias for the same object — setting one is enough. |
| `crowd` | `crowdLayers[i].mesh` for all i | array of `{mesh, baseY, capacity, fullCount}` (:221) |
| `stadium` | `stadiumGroup` (:237) | `THREE.Group \| null` |
| `stagerig` | `stageGroup` (:268) | `THREE.Group \| null` |
| `billboard` | `billboardGroup` (:306) | Group. **Its two PointLights are `const` locals inside `initBillboard` (:3279, :3282) with no module handle** — but they are children of the group, and three skips invisible subtrees, so hiding the group removes their contribution too. Do not go hunting for them. |
| `bulbs` | `crowdPointLightEntries[i].bulb` | The 24 additive meshes are **not** a group. Only handle is this array (:261), entries `{light, bulb, index, baseOpacity}`; only the first 4 have a non-null `.light`. |

### 3. Call site B — `src/arena.js`, inside `initArena`

`spindleLight` (:1671), `pitUplight` (:2469), `pitRimFill` (:2472) are **function-local `const`s
inside `initArena`** (starts :1571). Only `spindleLight` is on the returned object (:2790).
`pitUplight` / `pitRimFill` are **not returned** — their only other refs are the local `sceneRoots`
array (:2604-2606, for dispose) and the local `update` closure.

**So the `pitlights` call must live inside `initArena`, near the end, where all three are in
scope.** Do not try to reach them from `main.js` (it only holds the arena result) and do not add a
new export to expose them.

`arena.js` **already imports `getDebugParams`** at **:13** (used at :1602). **Add
`applySceneAblation` to that existing import line** — do not add a new module dependency, and do
not inline a local copy of the ablation logic. There is one helper; both call sites use it.

### 4. ⚠ The re-show hazard — close it, do not "confirm" it

Ablation survives because `main.js` calls `setRaveExtrasVisible` then `applyRaveExtrasQuality` in
that order on both live paths:

- **:2243–2244** (tier change) — `setRaveExtrasVisible(levelWantsExtras)` then
  `if (levelWantsExtras) applyRaveExtrasQuality(knobs)`
- **:2722–2723** (level load) — same pair

**`main.js:2430` calls `setRaveExtrasVisible(...)` with NO following `applyRaveExtrasQuality`.**
Traced: that is `onPreviewSwapComplete`, which runs only on the **menu preview** path
(`src/levelManager.js:255-260`), and it is followed by `finalizeArenaShellForMenu` →
`ensureRaveAttractShell` → a paired `applyRaveExtrasQuality`. Play entry pairs again. So a
**mid-round F8 is fine** provided ablation sits at the end of `applyRaveExtrasQuality`.

**Do all three anyway — leaving this as an open "confirm" is exactly how someone skips it and
ships a silent un-ablate:**

1. Ablation call at the **end of `applyRaveExtrasQuality`** (primary mechanism).
2. **Change `:2430` to the same pair** as `:2243-2244` / `:2722-2723` — `setRaveExtrasVisible`,
   then `applyRaveExtrasQuality` when extras are wanted.
3. Tests (see below) — **not** a vague "pin the `main.js` call order", which is not testable as
   written.

**Why it matters:** a cell that silently un-ablates measures Δms ≈ 0 and reads as *"this cut is
worthless."* That is the most expensive failure available on this card — it would retire the best
candidate on the board.

---

## The sweep — nine cells, ~25 min of play, on Wyatt's Intel box

He runs this; you cannot. He has done it four times and will do it again.

**URL for every cell:**
`https://cart-rave.wyabro.workers.dev/?diag=1&preset=low&level=classicRecord&ablate=<token>`

1. Deploy first. Hard-reload on the Intel box; F8 warns on a stale bundle — if it shouts, reload.
2. Solo, host, **3 NPCs**, Cart Rave. Enter **through the menu**, not a direct room link.
3. Play ~**60–90 s**, then **F8 mid-round** — `loopRound` is computed live, so there is no need to
   reach the podium. `npm run captures:pull`.
4. Read `snapshot.perf.loopRound.meanMs`. **Discard any cell where `straddledDemotion` is true.**

| # | Token | Cut | Tris | Prior |
|---|---|---|---|---|
| 1 | `crowdcarts` | cart-silhouette layer only | ~200k (36%) | **High** — best ms-per-visual-cost on the board; stands stay full of people |
| 2 | `crowd` | all 3 crowd layers | ~227k (41%) | **High** — empty seats, big read loss |
| 3 | `pitlights` | spindle + pit uplight + rim fill | 0 | Med — drops the standard-material light loop 5→2 in every fragment shader |
| 4 | `stadium` | bowl shell | ~32k (6%) | Low–Med — **measure, expect to keep.** ⚠ `crowdGlow` is a **child of `stadiumGroup`** (`effects.js:1027`), so this token also kills the glow ring — say so on the menu row or Wyatt will read it as a bigger cut than bowl geometry alone. |
| 5 | `stagerig` | stage geometry | ? | Low–Med |
| 6 | `billboard` | billboard group + its 2 PointLights | small | Low–Med — **stills need the in-round path, see below** |
| 7 | `bulbs` | 24 additive spheres | ~2.7k | **≈0 — a falsifier, not a candidate.** If this measures >1 ms the whole model is wrong and the ranking must be redone. |
| — | `none` | nothing | 0 | plumbing control + A-B-A drift check |

**Run `none` FIRST and LAST.** If the two baselines differ by more than **±1.5 ms mean**, the
machine drifted (thermal, background work) and the sweep is void — re-run.

**Do not combine tokens.** The effects are not additive (`crowd` and `crowdcarts` overlap; killing
lights changes every other cell's fragment cost) and combos destroy attribution.

**Treat any delta under ~1.5 ms as noise and do not ship a cut for it.** HARNESS-NULL-1 is still
open — no rig has a real null arm, so run-to-run variance on that machine is unquantified. The
A-B-A pair is a drift check, not a variance estimate.

---

## The stills — how Wyatt judges the visual cost

**Not by image diff.** Classic's visual null floor is **15.9%** (`docs/guides/visual-qa.md`), so a
before/after diff on this arena is noise.

```bash
npm run shoot -- --url https://cart-rave.wyabro.workers.dev/ --shot classic --preset low --t 0 --ablate <token> --out shots/cost-menu/classic-<token>.png
```

`tools/shoot.mjs:56-57` already forwards `--ablate` into `?ablate=`, so no tools change is needed
(`tools/` is frozen during a game card anyway). Use `--shot classic` and `--shot classic-edge` —
some cuts only read from the floor. `--t 0` pins animation phase so two shots are comparable.

`?perfPump` is set by shoot and is **irrelevant here** — a still frame does not care. That
separation is the point: the rig you cannot trust for milliseconds is fine for pixels.

### ⚠ The still protocol has to split — shoot cannot see the billboard

**The menu/capture path builds the arena shell with `includeJuice: false`**
(`main.js:2562-2565`, `:2702-2705`, `:2752-2754`). The **billboard and the lasers only exist after
play entry** (`includeJuice: true`). So `npm run shoot … --ablate billboard` compares two frames in
which the billboard **was never built** — a useless still pair that reads as "this cut changes
nothing visually".

- **Shell tokens — use `shoot`:** `crowdcarts`, `crowd`, `stadium`, `stagerig`, `bulbs`,
  `pitlights`.
- **`billboard` — use an in-round screenshot** (or a documented juice-on capture path). **Do not
  ask Wyatt to judge the billboard from shoot PNGs.**

The **Δms** for `billboard` is still valid either way, because that comes from an in-round F8, not
from the shoot path. It is only the *visual* half that shoot cannot answer.

---

## Wave 4 — ship only what Wyatt picks (needs its own ack)

**Do not start this until the menu has been delivered and he has picked.** One commit per picked
lever. Medium and High are untouched by construction.

**`src/utils/qualityTiers.js` is the sanctioned mechanism and the only one.** It is a single table
read through `getQualityKnobs()` — a knob value is not a second code path. Preference order,
strictly:

1. **Change an existing Low value first — zero new surface.** `crowdCount: 800 → <measured>` is a
   one-line diff, and if the crowd cell carries the win the card can end there. **Try this before
   any new knob** — the `crowd` cell measures the whole `crowdCount` curve because cost is linear
   in instance count, so you do not need to sweep 800/400/200 separately.
2. **Add one boolean knob only for a cut he actually picked.** Candidates, with their chokepoints:

| picked cut | knob | Low | Med/High | chokepoint |
|---|---|---|---|---|
| crowd cart silhouettes | `crowdCartShare` (0–1) | `0` | `1` | `applyCrowdBudget` (`effects.js:1872-1885`) — per-layer ratio instead of one global ratio. ⚠ **A share of 0 is not the same as the ablation you measured**: that function floors partial counts at 1 (`Math.max(fullCount > 0 ? 1 : 0, …)`, `:1881-1883`), so share 0 still draws one cart silhouette while `?ablate=crowdcarts` set `visible = false` — a true zero. **Make share 0 mean `count = 0` (or `visible = false` on that layer), or the shipped lever will not reproduce the measured Δms.** |
| pit/spindle fill lights | `arenaFillLights` | `false` | `true` | ⚠ **Classic has no `applyQualityTier` yet.** The `levelApplyQualityTier` hook at `main.js:2259-2261` is real, but only Storerooms returns the function (`backroomsSupermarket.js:3743`, typedef `:3378`); `arena.js` and `zanzibarPlatform.js` do not. So this means **adding `applyQualityTier` to Classic's level result**, following the Storerooms pattern — not merely "wiring through" something that already exists. |
| bowl shell | `stadiumShell` | `false` | `true` | ⚠ **Not the `skyExtras` shape.** The bowl is built *inside* `initCrowd` (`effects.js:892+`), not behind its own init, so skipping construction is **surgery on a shared function**, not a copy of an existing gate. Gate the stadium block within `initCrowd`, and **confirm crowd placement does not read the built bowl meshes** (seat-lift math uses the deck geometry) before assuming it can be skipped. |
| stage rig | `stageRig` | `false` | `true` | `initStage` (skip construction) |
| billboard | `billboard` | `false` | `true` | `initBillboard` (skip construction) |

Each new knob gets a `@property` line in the `QualityKnobs` typedef carrying its **measured ms** —
the existing entries (`renderScale`, `skyExtras`, `crowdCount`) all record their motivation and
this must match.

3. **Never a URL flag, a `CONFIG` key, or a fourth tier below Low.** Low is already the floor the
   watchdog demotes into; making Low cheaper is the sanctioned move.

**If a cut ships as "skip construction", verify the null-tolerance rather than assuming it:**
`setRaveExtrasVisible` (`effects.js:1843-1870`) and `applyRaveExtrasQuality` already null-check
their groups — confirm, don't trust this sentence.

**Then remove the probe.** Delete `applySceneAblation` and both call sites in the final commit —
everything picked is a tier value by then. *Recommendation, to be overruled if you disagree: keep
it.* It is ~25 lines inside an already-permanent documented debug surface, and this card re-runs
for Storerooms (241k tris) and Sundial (215k), at which point deleting and re-adding is churn.

**Verify per lever:** `npm run qa`; `tests/qualityTiers.test.js` asserts the new Low value **and**
that Medium/High are unchanged (it already asserts `extrasLasers` per tier — follow that shape);
`npm run shoot` at both Classic poses showing Low changed and **High pixel-identical** to the
pre-commit shot; then ship and Wyatt re-runs the Wave 2 protocol — `rounds[0].pass === true`, or
the lever did not land.

---

## Traps that produce confident wrong answers

1. **`?perfPump` fakes 60.** It replaces rAF with a MessageChannel loop gated to 16.6 ms
   (`src/utils/perfPump.js:23,34`). Every headless rig sets it. Confirmed live: a **4090** reports
   `meanMs 16.816 / 59.5 fps` under it. **Never read fps from a headless rig.**
2. **Missing `?preset=low` arms the watchdog**, which demotes renderScale mid-window and blends
   two renderers. This already happened on cap-239 — `straddledDemotion` caught it. `?preset=`
   also pins the tier, which is the only way to hold Low still.
3. **`?ablate` forces harness mode.** `debugParams.js:232` —
   `harness: harness || Boolean(params.get("ablate")) || …`. Any value, `none` included, flips
   harness on and takes the "warm world ASAP" boot path. **A baseline without the param boots
   differently from every ablated cell**, so `ablate=none` must be present on the baseline too.
4. **`main.js:2430`** — see §4 above.
5. **`shoot.mjs` renders on a real GPU by default now** (SHOOT-SOFTGL-1) and writes a
   `gpuVendor` sidecar next to every capture — check `software` there before trusting a still.
   Scene-graph counts (draw calls, triangles) are valid on SwiftShader; timing is not.
6. **`__cartRavePerf.scene` is DEV-only.** Against production it silently reads empty and a probe
   looks like "the thing never built".

---

## Verification and gates

- **`tests/debugParams.test.js`** — `applySceneAblation` token parsing: each token hides only its
  own target, `all` hides everything, `none` (and an unknown token) hides nothing, a null target
  is skipped, and the returned `ablated[]` is deduped. This is the primary new test file.
- **A wiring test** that ablation survives a `setRaveExtrasVisible(true)` → `applyRaveExtrasQuality`
  sequence — i.e. the thing that would actually break. Do **not** write a test that tries to assert
  `main.js` call ordering; it is not testable as written and will be deleted by the next person.
- `npm run qa` — was **108 spec files / 1309 tests** at the time of writing. Report by number;
  never hardcode a stale total.
- `npm run arch` before commit (new `effects.js → debugParams.js` import edge).
- **Update the flag list in the `debugParams.js` header comment** (`:6-28`) when the scene tokens
  are added — it is the documented surface and it is currently post-FX only.
- Production build green.
- Push, then `npm run verify:head`. Never claim done without it.

## Process rules — these are not optional

- **Plan → Wyatt ack → apply, per wave.** This document plans Wave 3 **and** Wave 4; each takes
  its own ack. **Wave 3 was acked 08-04**; Wave 4's shape is not decidable until the menu comes
  back, and it needs its own.
- **One card at a time.** `tools/`, `.claude/hooks/`, `.agents/` are frozen during a game card.
- **Ship only on "ship it".** Never `git add -A`; commit with an explicit pathspec.
- Full rules: `AGENTS.md`. Cold-start door: `docs/BRIEFING.md` → `AGENTS.md` → `docs/STATUS.md`.

## Do NOT

- Ship any visual cut without Wyatt picking it. The deliverable is a menu.
- Add a `CONFIG` key, a new URL flag, or a fourth quality tier below Low. Wave 4's mechanism is
  `src/utils/qualityTiers.js` and nothing else.
- Touch Medium or High. This card is the Low path in Cart Rave only.
- Bisect for a regression. The box has never held 60 (run 5: 54% of frames over 33 ms) and is
  currently **better** than that floor. There is nothing to bisect.
- Reach for renderScale. It is already spent.

## Critical files

- `src/utils/debugParams.js` — `applyPostFxAblation` :293–334 (template); `harness:` :232
- `src/effects.js` — `applyRaveExtrasQuality` :1887–1925; `applyCrowdBudget` :1872–1885;
  `setRaveExtrasVisible` :1843–1870; target refs :214/:221/:237/:261/:268/:306
- `src/arena.js` — `initArena` :1571; `spindleLight` :1671; `pitUplight` :2469; `pitRimFill` :2472;
  `getDebugParams` already imported :13
- `src/main.js` — re-assert pairs :2243–2244 and :2722–2723; **unpaired call :2430**
- `src/utils/qualityTiers.js` — Wave 4 only; every shipped lever lands here
