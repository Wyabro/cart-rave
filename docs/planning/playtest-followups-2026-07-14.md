# Playtest follow-ups — 2026-07-14 (handover)

Source: Wyatt's solo playtest report (2026-07-14, RTX 4090). This session cleared the P0
crash work and the P1 correctness/polish items; the rest is handed off below. Ordered by the
original triage (P2 AI → P3 art → P4 feel), plus two carried-over items and known gotchas.

## Done this session (branch `cart-clash`, unpushed at handover)

| Commit | What |
|---|---|
| `030bc32` | gameLoop circuit breaker for unrecoverable wasm faults + dev-404 fix (+5 tests) |
| `6f5c30c` | `cr:menu-ready` boot mark — proved the "17s load" was a **dev artifact** (prod ~440ms) |
| `6db550a` | Solo countdown waits for the loading overlay to clear (+2 tests) |
| `213343c` | Resume guard for tab-focus / host-backgrounding stutter (+2 tests) |
| `f8e8e25` | Clamp Medium/Low solid-floor IBL (blown-out fix) |
| `3f6b2e0` | Dedupe the deferred solo countdown (council follow-up) |

Council (gemini + qwen) reviewed all of the above: **no merge-blockers, unanimous ship-it.**

## Carried-over follow-ups

### FU-1 — Menu-preview floor may still read bright (council-flagged, UNVERIFIED)
`f8e8e25` fixes the blown-out Medium/Low floor on the **play path** (verified by reasoning:
`bootstrapWorldCore` sets `scene.environment` before `initArena`, so `clampFloorEnv` assigns
`mat.envMap` and the clamp bites). But on a **menu-preview** level load that runs *before* the
first PMREM bake, `scene.environment` is null → `clampFloorEnv` registers the scale/intensity
but never assigns `mat.envMap`, and `refreshSceneEnvironmentMaterials` doesn't assign it either.
Per arena.js's own comment (~`:1467`), `material.envMapIntensity` may be a **no-op against the
implicit `scene.environment`** — so the menu-attract backdrop floor could still read bright until
a play-path rebuild. Gameplay is unaffected. **Action: eyeball the live Medium/Low *menu* on a
real device; if bright, assign `mat.envMap = scene.environment` in the post-bake refresh path.**

### FU-2 — Low-tier fps (no fix yet; needs real hardware / profiling)
Report: **~15 fps Cart Rave, ~20-25 Sundial, ~25 Storerooms** on Low tier with hardware
acceleration OFF (software WebGL / SwiftShader). This is a genuine profiling task — needs a real
low-tier or no-accel device (or a headless CPU-throttle profile), not guesswork. Likely levers:
per-tier draw-call / instance counts, shadow + light budgets, post-FX. Target Wyatt floated:
"3060 and up should hit High."

## P2 — AI / NPC behavior

- **AI-1 ✅ DONE (`00d497e`, unpushed) — reverse shoves off the edge now score.** Wyatt clarified
  the ask: **backing (reversing) into an opponent to knock them off should credit YOU** with the
  KO + points. It wasn't a self-fall issue. Root cause: cart-on-cart ram qualification read
  *post-step* linvel, and a reverse shove (reverseMaxSpeed 8 m/s) is arrested by Rapier's contact
  solver in the same step → reads ~0 → fails `minSpeed`/alignment → no `recordHit`, yet raw contact
  still shoves the victim off ("FELL OFF", no points). Fix: `resolveCartRamCollision` qualifies +
  attributes from the **pre-step** snapshot (`_preStepLinvel`). Uniform (Wyatt-approved) — forward
  rams now also read true impact velocity, marginally punchier. **Needs live eyeball.**
- **AI-2 ✅ DONE (`c4f2b18`, unpushed) — Storerooms center-furniture wedge.** Two backrooms-scoped
  gaps: (1) the no-reverse gate lumped the solid circular furniture in with death voids → wedged
  bots never backed off; excluded it (corner voids still forbid reverse). (2) the tangent-escape
  commit that breaks corner-void grinds ignored the furniture; added it (`circularKeepOutTangentEscape`)
  so a grinding bot circles it toward its target. **Needs live eyeball on Storerooms.**
- **AI-3 ✅ DONE (`ab0ed77`, unpushed) — edge caution.** Sundial rim avoidance engages ~5% sooner
  (band 5.0→5.25) + pushes ~5% harder inward (1.2→1.26); Cart Rave/Classic idle+patrol outer-target
  caps pulled in (0.72→0.68, 0.88→0.84). Feel literals in simulation.js. **Needs eyeball.**
- **AI-4 ✅ DONE (`2d3f08c`, unpushed) — edge-camp punish (~+15%, both levers).** Proximity aggression
  range 7→8m + commit 0.9→0.95 (uniform on all three arenas = the "same as Sundial" lever); Cart Rave
  chase reachOuter caps nudged out 0.78→0.82, 0.92→0.95 (Classic-only — kill-zone arenas rely on the
  proximity lever to avoid lemming into voids/rim). Feel literals in simulation.js. **Needs eyeball.**
- **AI-5 (likely already mitigated): occasional missed cart collisions** (Storerooms). Council read
  this as mostly a **stutter symptom** (the >66ms frame-hitch debt-drop at `gameLoop.js:95`
  teleporting carts past contacts) — the resume guard `213343c` should reduce it. Residual
  cart-vs-cart CCD weakness at high closing speed may remain; re-check before treating as its own
  bug. See `[[load-time-dev-artifact-2026-07-14]]` memory.

## P3 — Art / visuals

- **ART-1: baguette 5× bigger** (at least). Grocery cargo model.
- **ART-2: milk model ~+15% larger, and more of them** to fill the cart visually.
- **ART-3: defeat screen "missing something"** — Wyatt wants an "opposite of confetti" effect
  (the discolored Defeat screen reads as incomplete). Distinct from Victory (which he likes).
- **ART-4: Sundial podium zone ~10% bigger** (the +20%-score contest zone).

## P4 — Feel / timing (quick)

- **FEEL-1: victory camera 2.4s → 3.0s** (`winner cam`).
- **FEEL-2: Sundial podium — bots fight ~10% harder** for the +20% zone (pairs with ART-4).

## Explicitly NOT to do (Wyatt-decided)

- **Podium wheels keep spinning** after round end (visible on the winner) — **leave it**, "looks
  kind of cool."
- **Bloomfix** — **keep the current default**; do NOT promote bloomfix (that would kill VFX-1).
- **Load-time asset-pipeline surgery** — the "17s" was a dev artifact (prod ~440ms). Don't.

## Deferred (blocked on assets)

- **Audio/VO:** victory/defeat SFX, comeback-callout SFX, announcer lines — all need recorded
  assets. Systems are data-driven (see `src/announcer/`, `docs/reference/announcer.md`).

## Gotchas for the next agent

- **The in-app preview pane freezes rAF when backgrounded** — you cannot drive a full round,
  render a screenshot, or watch countdown/attract animations there (play-entry awaits rAF-based
  `yieldForPaint`). Synchronous checks (resource timing, reading `window` state, material props
  after a build) still work. For anything rAF-driven, rely on unit tests + code reasoning, and ask
  Wyatt to eyeball on a real screen.
- **Dev (`npm run dev`) ≠ prod.** Dev serves 142 unbundled modules (~17s to menu); prod is ~440ms.
  Measure perf against `npm run build` + the `preview` launch config, or the deployed asset.
- **Remote is authoritative** (AGENTS.md): don't claim "verified" without the deployed/fetched
  build. `performance.getEntriesByName("cr:menu-ready")[0].startTime` gives time-to-menu.
- Gates: `npm run qa` (typecheck + test + knip). Report counts by number.
