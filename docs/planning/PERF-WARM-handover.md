# Handover: PERF-WARM — the play-entry (round-start) freeze

**Date:** 2026-07-21
**Project:** Cart Clash (`C:\Users\wyatt\cart-rave`)
**Branch:** `cart-clash` (confirm with `git status`)
**Priority:** **LOW.** Cosmetic + substantially hardware-bound. The user-visible bug this
came out of (**COUNTDOWN-ABORT-1**) is **shipped and verified fixed** (`cbb0c7f`, STATUS
2026-07-21). The countdown now survives these freezes cleanly. Only pick this up if perceived
round-start smoothness becomes a priority — it is not blocking anything.

> **Do not re-chase shader compilation.** It is exonerated (see §3). Do not re-chase the
> countdown clock — SYNC-1 was always correct. The freeze does NOT restart the countdown.

---

## 1. What the freeze is

A main-thread stall at round start (between `play-entry` and the first countdown frames).
It is **variable and cache/hardware-dependent**, which is the whole difficulty:

| Machine | Observed | Nature |
|---|---|---|
| Host (RTX 4090) | 400ms (warm shader cache, cap-189) → 1426ms (cold, cap-184) | main-thread (`ltSum≈dt`) |
| Non-host (Intel UHD Gen11, 7GB RAM) | up to **22s** (cap-167/175) | mostly NON-JS (`ltSum` ≪ `dt`) = OS paging / GPU stall |

The non-host case is **hardware-bound** (7 GB shared-memory Gen11 iGPU, `msaa_is_slow`
workaround, repeated HLSL compiles — see the Intel Edge `chrome://gpu` in the STATUS
2026-07-21 REFRAME entry). It is unlikely to be fully fixable in software.

## 2. Instrumentation already in place (live, build ≥ `af0c936`)

All emit into the F8 bundle. Pull with `npm run captures:pull` (→ `.diag-captures/playtest/`).

- **`longframe.spans[]`** — named attribution for a frozen frame. Spans wired so far:
  `physics.step`, `vfx.shatter`, `pa.sting`, `warm.compile`, `warm.render.default`,
  `warm.render.flyover`, `warm.anchors`, `warm.audioKickoff`. Source: [src/utils/perfSpans.js](../../src/utils/perfSpans.js)
  (`mark(name, fn)` times a sync call; `spansOverlapping()` attaches spans to a longframe).
- **`warmupCompile` perf event** — `compileMs`, `materials`, `parallelCompile`. Source:
  [src/scene.js](../../src/scene.js) `patchSafeCompileAsync`.
- **`buildFreshness`** in every bundle + boot `[build] <sha>` banner (`window.__ccBuild`).
  ALWAYS confirm `buildFreshness.stale === false` before trusting a capture.

### Read a capture's warm freezes
```bash
node -e "const fs=require('fs');const f=fs.readdirSync('.diag-captures/playtest').find(x=>x.startsWith('cap-189-')&&!x.includes('meta'));const j=JSON.parse(fs.readFileSync('.diag-captures/playtest/'+f));for(const e of j.events){if(e.type==='longframe'&&e.dtMs>150)console.log('t='+e.t,'dt='+e.dtMs,'ltSum='+(e.lt||[]).reduce((a,b)=>a+b.d,0),'spans='+JSON.stringify(e.spans));if(e.ch==='boot'&&/play-|carts-ready/.test(e.type))console.log('t='+e.t,e.type);}"
```

## 3. What is RULED OUT (with evidence)

- **Shader compilation** — `warm.compile` span is 4–23ms across every capture;
  `parallelCompile: true` on both machines. The sync `compile()` inside `compileAsync`
  is trivial. (This killed the original "shader-warm blocks the main thread" theory.)
- **VFX-anchor install** — all four (`installShatterProgramWarmup` /
  `installKoHitmarkerProgramWarmup` / `installWaterFxProgramWarmup` /
  `installRamStreakProgramWarmup`) are idempotent (module-cached group, early return).
  `warm.anchors` never fired (<4ms). Confirmed in [src/cartShatter.js:1053](../../src/cartShatter.js),
  [src/effects/koHitmarkerFx.js:251](../../src/effects/koHitmarkerFx.js),
  [src/effects/waterDeathFx.js:1704](../../src/effects/waterDeathFx.js), [src/effects.js:2527](../../src/effects.js).
- **Audio kickoff** — `warm.audioKickoff` never fired (<4ms). Not the cost.

## 4. Leading hypothesis (unproven — start here)

In cap-189 the 400ms freeze lands at `t=20538`, **AFTER `carts-ready` (t=20534)** — i.e.
OUTSIDE `warmupActiveSceneShaders`, which none of the `warm.*` spans cover. The most likely
owner is **the first real round-start render frame**: `beginRoundFlyover()` +
`gameLoop`'s first `composer.render()` at the wide fly-over camera pose (new render-target
state / draw calls that pose exercises). `warm.render.flyover` only covers the *pre-warm*
prime inside `warmupActiveSceneShaders`, not this first live frame.

### Next concrete step
Add a span around the gameLoop's `composer.render()` **for the first N frames after a round
starts** (gated so it isn't a per-frame cost all game). Then one host countdown F8 attributes
the post-`carts-ready` freeze. Entry points:
- `startCountdown` → `beginRoundFlyover` in [src/main.js](../../src/main.js) (~line 4366).
- The frame render lives in the gameLoop / `frameVisuals` (`composer.render()`), see
  [src/frameVisuals.js](../../src/frameVisuals.js) and [src/gameLoop.js](../../src/gameLoop.js).

## 5. If confirmed — candidate fixes (biggest lever last)

1. **Prime the fly-over pose render earlier** — the fly-over warm render already exists in
   `warmupActiveSceneShaders` (`warm.render.flyover`); ensure it renders from the EXACT
   `beginRoundFlyover` pose/FOV so the first live frame hits no new state. (Cheap, targeted.)
2. **Spread round-entry work across frames** — if the freeze is diffuse setup, slice it so no
   single frame blocks >~50ms (same idea rejected for compile, but may fit render/setup).
3. **Non-host only — reduce memory/GPU pressure at `low` tier** — smaller RTs, drop the
   fly-over prime, lower `renderScale`. The 7GB Gen11 is the real wall; this is mitigation,
   not a fix. Audit composer MSAA usage (`msaa_is_slow` on Intel) in [src/scene.js](../../src/scene.js).

## 6. Capture recipe (paired, honest)

1. Hard-reload BOTH machines; confirm console `[build] <sha>` matches `git rev-parse --short HEAD`.
2. Host = 4090 (party server picks it first). Enter a **quickplay** round.
3. Press **F8 during/just after the countdown** — the round-start freeze sits in the event ring.
4. `npm run captures:pull`; read with the §2 snippet. Verify `buildFreshness.stale===false`.

## 7. Context you'll want

- Two-PC setup: 4090 desktop (host) + Intel UHD laptop (non-host). Party server picks the
  4090 as host first, so getting the Intel to host needs manual room control (open A1 item).
- The whole investigation trail is in **[STATUS.md](../STATUS.md)** "Last updated" (2026-07-21
  entries, newest first): stale-cache guard → F8 coverage → REFRAME → COUNTDOWN-ABORT-1 fix →
  verified. Read those before re-deriving anything.
- Gates: `npm run qa` (typecheck+test+knip), `npm run build` when client changes, `npm run ship`
  (build + wrangler deploy). Report results by number; verify served bytes post-deploy.
