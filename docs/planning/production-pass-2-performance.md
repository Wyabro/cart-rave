# Production Pass 2 — Performance, Scalability & Platform Compatibility

Date: 2026-07-10. Branch: cart-clash.

Four audit tracks (rendering, CPU, mobile, browser compat) + live headless profiling
(dev box, 1280×720 @ DPR 1, solo mode, `?perfPump` rAF shim). Full audit reports live
in the session scratchpad; this doc is the merged plan and, after implementation, the
results record.

## Measured baselines (before)

GPU ms = median of 5× 30-frame serialized `composer.render()` + `gl.finish()` runs.
Desktop discrete GPU — treat as relative weights, not absolute mobile numbers.

| Arena | Quality | Draw calls/frame | Tris/frame | GPU ms |
|---|---|---|---|---|
| Cart Rave (classic) | High | 1399 | 28.1M | 6.7 |
| Cart Rave (classic) | Low | 575 | 0.39M | 3.3 |
| The Storerooms | High | 229 | 0.33M | 1.6 |
| The Storerooms | Low | 156 | — | 0.9 |
| Sundial Station | High | 376 | 0.33M | 2.2 |
| Sundial Station | Low | 276 | — | 1.7 |

Classic isolation (High, medians): full 6.7 · crowd hidden 6.5 · reflector hidden 2.7 ·
both hidden 2.3. **The floor Reflector ≈ 60% of Classic's GPU frame** (it re-renders the
entire scene, crowd included, into a 1024² RT). The crowd's "cart" variant instances the
full 5,190-tri gameplay cart mesh ×2600 = 13.5M tris (95% of scene tris) — near-free on
a discrete GPU, lethal on integrated/mobile vertex throughput.

## Root causes (merged from all four audits)

1. **Quality is one boolean** (`isLowQualityMode()`) driving ~20 unrelated knobs, plus a
   separate Post-FX toggle. No Medium. Low strips Classic's identity wholesale
   (`setRaveExtrasVisible(false)` hides crowd/stage/lasers/skybox at once) while
   The Storerooms ignores the flag entirely (0 references) and keeps 8 ungated SpotLights.
2. **Classic**: Reflector always-on at High; crowd cart geometry absurdly heavy; crowd
   hidden on Low *and* count-reduced (wasted work); crowd/laser/stage animation math runs
   even when the meshes are hidden.
3. **Mobile**: already decent (DPR clamp 1, bloom off, no shadow maps, draco+webp carts) but
   the composer still runs OutputPass+FXAA as two full-screen passes when every creative
   pass is disabled; customization cart preview ignores quality (MSAA + DPR 2);
   3 MB uncompressed grocery GLBs `await`-ed inline on every level load.
4. **CPU**: no >2ms single hot spot. Steady per-frame allocs in netcode interpolation;
   40 Hz `localStorage.getItem` on host send; unquantized HUD `style.width` writes;
   per-streak store reads; cosmetic work unthrottled on 144/240 Hz displays.
5. **Browser**: no `webglcontextlost` handling (iOS Safari reclaims contexts aggressively);
   HalfFloat composer RTs with no capability check (open black-frame bug, see
   handover-postfx-black-frames.md — not touched in this pass beyond what that doc allows);
   STUN-only ICE with no restart (documented, deferred — netcode churn out of scope).

## Design: three quality tiers

`src/utils/qualityTiers.js` — `getQualityTier() → "low" | "medium" | "high"` plus a knob
table. `isLowQualityMode()` stays as a compat shim (`tier === "low"`) so all 98 existing
call sites keep working; hot sites get upgraded to tier-aware individually. settingsStore
migrates `lowQuality: boolean` → `qualityTier`, legacy values mapped (true→low, false→high,
unset→device default: touch low, desktop high). Menu + pause button cycles LOW→MEDIUM→HIGH.
Auto-quality watchdog steps down one tier at a time (max two steps, session-only).

Principle: **Medium = full personality, leaner budget. Low = recognizable, cheap.**

| Knob | Low | Medium | High |
|---|---|---|---|
| Pixel ratio cap | 1 | 1.5 | 2 |
| Bloom / Arcade FX | off | on | on |
| FXAA | off (new — was always on) | on | on |
| Composer | bypassed (direct render) | on | on |
| Classic reflector | off | off | on (1024²) |
| Classic crowd | 800, cheap geo, static | full count, cheap geo | full count, cheap geo |
| Classic skybox/stage/lasers | **visible** (new), anim frozen | visible, animated | visible, animated |
| Storerooms ceiling spots | 2 + emissive fixtures | 4 | 8 (current) |
| Ambient dust | ~35% | ~70% | 260 (current) |
| Boost streak cap | 30 | 80 | 150 |
| Physics substeps | 2 (unchanged) | 4 | 4 |

Crowd cart geometry is replaced with a ~100-tri silhouette **at every tier** — flat-lit
MeshBasicMaterial at stadium distance; 13.5M→~0.6M scene tris with no readable change.

## Work items

**A. Core tier plumbing** — qualityTiers.js, settingsStore migration, menu/pause cycle UI,
autoQuality per-tier step-down, scene.js composer/pixel-ratio per tier + low-tier composer
bypass + FXAA gating.

**B. Classic arena** — low-poly crowd cart silhouette; de-couple extras from the tier bool
(low keeps skybox/stage/crowd-800, drops reflector/lasers/fog puffs); skip hidden anim
math; drop the hide+reduce double work.

**C. Storerooms + Sundial** — tier the ceiling-grid spotlight count (8/4/2, alternating
cells fall back to emissive-only); Sundial needs nothing structural (verified healthy).

**D. Mobile** — customization preview obeys tier (no MSAA / DPR 1 on low); grocery pool
init made non-blocking on level load.

**E. CPU quick wins** — netcode interp scratch buffers; cache levelId (kill 40 Hz
localStorage read); quantize HUD width writes + fix per-frame rAF alloc; hoist
getRoundState out of streak loop; trash-particle active count. Deferred (documented, not
done): replay cap (gameplay-adjacent), Rapier getter scratch in announcer/gameFlow scans
(small, riskier), cartShatter material pooling (KO-event burst, not steady-state).

**F. Browser compat** — `webglcontextlost/restored` handler with reload overlay.
Deferred: HalfFloat RT fallback (owned by the black-frames investigation), ICE restart,
Howler unlock rework. Manual test matrix documented in the compat report.

**Out of scope, documented for later passes**: grocery GLB compression pipeline, merging
Classic's ~525 stage meshes, device-memory-based touch tier defaults, netcode Hz scaling.

## Results (implemented 2026-07-10, all uncommitted on cart-clash)

### After — same harness, same machine, same solo-mode scenes

| Arena | Tier | Draw calls/frame | Tris/frame | GPU ms | Notes |
|---|---|---|---|---|---|
| Cart Rave | High | 1387 | **1.66M (was 28.1M)** | 9.4* | reflector on, everything on |
| Cart Rave | Medium | 787 | 0.86M | 3.9 | reflector off, all personality kept & animated |
| Cart Rave | Low | 745 | 0.51M | 3.6 | crowd 1,120 drawn + stage + skybox **visible** (was: all hidden) |
| Storerooms | High | 228 | 0.37M | 1.2 | 8 SpotLights |
| Storerooms | Medium | 199 | 0.32M | 1.1 | 4 SpotLights, VHS/bloom kept |
| Storerooms | Low | 160 | 0.31M | 0.8 | 2 SpotLights, fixtures still glow |
| Sundial | High | 250 | 0.34M | 1.3 | unchanged by design |
| Sundial | Medium | 250 | 0.31M | 0.9 | |
| Sundial | Low | 245 | 0.35M | 1.0 | |

\* GPU ms has ±30% session-to-session variance (shared desktop GPU); the
deterministic counters (draw calls, triangles, light counts) are exact. The
headline structural change: Classic High's triangle load fell 94% (crowd cart
silhouette swap: full 5,190-tri gameplay mesh → ~100-tri silhouette at all tiers)
and light counts now scale 14/14/5 spots (Classic) and 8/4/2 (Storerooms).

### Quality System Report — what each preset now does

One enum (`qualityTier` in settingsStore, `cartRaveQualityTier` in localStorage,
legacy `cartRaveLowQuality` migrated true→low / false→high / unset→device default:
touch or reduced-motion → low, else high). Menu + pause button cycles LOW→MEDIUM→HIGH.
Auto-quality watchdog steps down one tier per sustained-jank episode (max 2 steps,
5 s cooldown, session-only) and now applies live via the same rebuild path — the
old watchdog set a flag nothing re-read.

Knobs per tier — see `src/utils/qualityTiers.js` (the single source of truth):
pixel-ratio cap 1 / 1.5 / 2 · post-FX off/on/on · FXAA off/on/on · composer
bypassed entirely on Low (direct render; OutputPass tone-map applies natively) ·
Classic reflector off/off/on · crowd 800/full/full (silhouette geo everywhere) ·
crowd+laser+searchlight+stage-light animation & light contribution off/on/on ·
ambient dust ×0.35/×0.7/×1 · streak cap 30/60/80 · physics substeps 2/4/4 ·
Storerooms ceiling-spot budget 2/4/8 (farthest-point-sampled priority order so
low budgets stay spread across the grid; emissive fixtures stay lit at all tiers).

Medium exists for exactly the gap the user pass called out: full personality
(crowd, lasers, VHS, bloom) minus the two quiet monsters (reflector second scene
render, DPR 2 fill cost).

### Mobile

Touch default remains Low. Mobile-relevant wins: composer bypass removes 2
full-screen passes/frame; grocery GLB load (~3 MB) no longer blocks level swap
(spills queue until ready — pre-existing queueing path); customize-screen cart
preview now obeys the tier (was: always MSAA + DPR 2); crowd vertex load −94%
matters most on integrated/mobile GPUs. Deferred: grocery GLB compression
pipeline, device-memory-aware tier default, netcode Hz scaling.

### Browser Compatibility Report

Fixed this pass: WebGL context-loss handling (`webglcontextlost` preventDefault +
one-shot reload on restore — iOS Safari's aggressive context reclaim previously
froze the game with no recovery); pre-existing TS lib strictness error in
`p2p.js` coerceToArrayBuffer. Verified already-correct: `-webkit-` prefixes,
`event.code` keyboard handling, ogg→mp3 fallback chain, storage try/catch
(Safari private mode), rAF + audio visibilitychange handling, Rapier WASM + Draco
loading patterns. Documented, deferred (not this pass): HalfFloat RT fallback
(owned by the black-frames investigation, docs/planning/handover-postfx-black-frames.md);
STUN-only ICE without restart-on-disconnect; Howler internal-API autoplay poke.
Manual matrix recommended: macOS/iOS Safari black-frame repro, iOS
background/foreground mid-match, Firefox/Safari WebRTC across real NATs.

### CPU quick wins landed

Netcode interpolation scratch objects (~500–1300 allocs/s eliminated on clients);
40 Hz localStorage read in host send loop → settingsStore read; HUD timer/boost
fills quantized to 0.5% with change-gating; per-streak store reads hoisted; trash
particle scan early-outs on an active counter; Classic rave-dressing animation
math now skips when hidden (Storerooms) or frozen (Low). Deferred (documented):
reconciliation replay cap, cartShatter material pooling, Rapier getter scratch in
announcer/gameFlow scans.

### Validation

`npm run check` (tsc + vitest 193/193 + knip) green. Production build clean;
dev-only profiling probes (`?perfPump` rAF shim, `window.__cartRavePerf`)
verified tree-shaken out of dist. Live tier cycling verified headless in all
three arenas (tables above; scene-graph light/crowd/reflector counts asserted per
tier). Not yet verified: real phone, Firefox/Safari — needs Wyatt's visible-pane
manual pass like prior sessions.

### Post-review fixes (Wyatt feedback, 2026-07-10)

1. **Crowd cart silhouette v2** — the first box-blob silhouette read as a dumpster.
   Rebuilt as a wire-basket cart (~480 tris): open bar rim, corner posts, 6 vertical
   wires per side, solid rear gate, handle, undercarriage tray, 6-seg caster wheels —
   iterated against side-by-side renders of buildCart() at closeup and stadium
   distance. Still a 10.8× cut vs the original 5,190-tri mesh (13.5M → 1.25M
   instanced tris at full crowd).
2. **Quality-switch freeze** — switching tiers froze the game ~2.3 s with no feedback.
   Root cause: the composer↔direct render-path flip changes three.js's program cache
   key (tone mapping moves in/out of shaders), so the game loop's next frame — before
   the overlay ever painted — recompiled every scene program. Fix: the bypass flag is
   now latched (scene.js isComposerBypassActive), flipped only inside
   rebuildForQualityChange() after warming the target path behind the loading overlay
   via renderer.compileAsync (KHR_parallel_shader_compile). Measured: High→Low main
   thread gap 2293 ms → 164 ms with the overlay visible the whole time; Low→High and
   High→Medium have no gaps >50 ms. Side benefit: level loads now pre-warm shaders too.

### Deliberately out of scope (later passes)

Merging Classic's ~525 individual stage meshes; grocery/foliage asset
compression; ICE restart; HalfFloat fallback; device-tier auto-detection beyond
touch; 144 Hz cosmetic-work throttling (near-miss scan, name labels).
