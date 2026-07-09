# Cart Clash — Boot / Load / Asset / Level Pipeline Audit

**Date:** July 8, 2026  
**Branch:** `cart-clash`  
**Scope:** First paint → menu interactive → level preview → first match entry. Static assets, Worker serving, music, cart GLB, **and arena level load/swap**.  
**Status:** Audit only (no code changes in this pass).

---

## Executive summary

| Metric (approx.) | Value |
|------------------|--------|
| `public/` total | **~50 MB** |
| `dist/` total (existing build) | **~54 MB** |
| Largest classes | GLB ~36 MB · MP3 ~27 MB · OGG ~24 MB |
| Primary cart (hot path) | `cartrave4-draco.glb` **~0.7 MB** |
| Uncompressed cart masters | In **`art/models/`** only (not shipped); runtime DRACO pair ~1.1 MB |
| Game music (4 × ogg+mp3) | **~20 MB** files; **lazy until play** (menu music still eager) |
| Level modules (source) | Classic thin wrapper · Backrooms **~67 KB / 1.5k lines** · Zanzibar **~33 KB / 800 lines** |
| Level network assets | **None** — arenas are procedural JS + canvas textures |
| Level Vite chunks (prod maps) | Small (tens of KB of JS; maps optional) |
| Groceries on level swap | **First load only** for GLBs/pool; later swaps clear active spills (`groceryPool.init` idempotent) |

**Already good:** inline splash, deferred Rapier, dynamic level imports, menu preview quality path (128 reflector), play finalize / idle reflector upgrade, same-level play-entry skip when warm.

**Biggest wins (full pipeline, ranked):**

| # | Win | Domain |
|---|-----|--------|
| 1 | Lazy game music (don't preload 4 tracks at menu) | Boot bandwidth |
| 2 | Cache-Control on Worker static assets | Return visits |
| 3 | **Don't dispose+re-init grocery pool on every level swap** | Level swap cost |
| 4 | DRACO→DRACO before multi‑MB cart fallbacks | Failure path |
| 5 | Keep `.blend` / fat masters out of ship path | Deploy size |
| 6 | Soften Backrooms rebuild cost (grid / merge) if menu preview feels hitchy | Level CPU |
| 7 | Fonts self-host / subset | FOUT / offline |

---

## Part A — Boot & static assets

### A.1 Boot sequence

```
index.html
  ├─ Inline boot splash CSS
  ├─ Google Fonts (7 families, print→all)
  ├─ Deferred +2.5s menu audio probe
  └─ main.js
        ├─ Splash dismiss, error reporting
        ├─ prefetchRaveGltf() (async)
        ├─ AudioManager: menu music + loadGamePlaylist×4 preload:true  ← BOOT TAX
        ├─ Scene / menu
        └─ Play: Rapier WASM → bootstrapWorldCore → level load → groceries
```

### A.2 Static asset inventory (public)

| Class | ~Size | Role |
|-------|------:|------|
| Cart uncompressed fallbacks | ~14 MB | Cold path after Draco fail |
| Cart Draco primary + legacy | ~1.1 MB | Hot path |
| `art/cartrave4.blend` + `art/models/*.glb` | masters | Source only — not under `public/` |
| Groceries ×6 | ~2.9 MB | Spill VFX; re-fetched on each level init today |
| Menu + 4 game tracks ×2 codecs | ~25 MB | One codec used per browser |
| Draco decoder | ~0.7 MB | Cart + groceries |

### A.3 Static-asset issues

1. **Game music preloads during menu** (`main.js` + `audioManager.loadGamePlaylist` `preload: true`).  
2. **Cache-Control on Worker ASSETS** — implemented in `party/index.ts` (`withAssetCacheHeaders`): hashed `/assets/*` → 1y immutable; `/models|sounds|draco` + media ext → 7d + SWR.  
3. **Cart GLB fallback order** — implemented: primary Draco → legacy Draco → uncompressed cartrave4 → legacy uncompressed.  
4. **Fat masters + possible `.blend` in `public/`**.  
5. **Google Fonts CDN** (7 families).  

*(Detail tables for A.3 live in the original asset section intent; implement later with the ranked table at the end.)*

---

## Part B — Level loading

### B.1 Architecture

| Piece | Role |
|-------|------|
| `src/levels/index.js` | `loadLevel` — **dynamic import** per level id (code-split) |
| `src/levelManager.js` | Menu preview vs full quality, debounce, play-entry rebuild |
| `src/bootstrap.js` | `ensureWorldBootstrapped` (Rapier + first arena), `enterPlayMode` |
| `src/main.js` `commitLevelLoad` | dispose old level → `loadLevel` → **GroceryPool.init** |
| Level inits | Synchronous geometry + physics build after chunk fetch |

**Level ids:** `classicRecord` | `backrooms` | `zanzibar` | `testArena`

**Classic** is a thin wrapper around `arena.js` (vinyl + Reflector + booths).  
**Backrooms / Zanzibar** are large self-contained procedural builders (canvas textures, lots of meshes/colliders). **No external level GLB/HDR.**

### B.2 When levels load

```
Menu idle (world not ready)
  └─ scheduleMenuLevelPreview → SKIPPED ("arena warms on play entry")
       Only works if Rapier world already bootstrapped and no carts.

First Solo / Quickplay / Friends
  └─ enterPlayMode
       ├─ await in-flight preview/rebuild promises
       ├─ if !arenaReady: rebuildLevelIfNeeded → full swap
       ├─ ensureWorldBootstrapped (Rapier WASM ~1.5 MB + first loadLevel)
       └─ mode-entry loading overlay

Menu level card change (only after world warm + no carts)
  └─ debounced 120ms + requestIdleCallback
       └─ swapLoadedLevel(menuPreview: true)
            reflectorTextureSize = 128
            +500ms later: idle finalize → full extras / materials

Same level, already full quality at play
  └─ arenaReady short-circuit (good)
```

### B.3 Per-swap work (`commitLevelLoad`)

On **every** level change (preview or full):

1. `disposeLevel()` — previous arena meshes/colliders/textures.  
2. `GroceryPool.dispose` — tear down **66** bodies + instanced meshes + materials/textures.  
3. Dynamic `import()` of level chunk (cached by browser after first visit).  
4. Sync `init*()` — build all geometry, canvas textures, Rapier colliders.  
5. **`GroceryPool.init` again** — **re-download/decode 6 grocery GLBs** + rebuild pool.  
6. Side effects (rave extras on/off, hazards, fog, etc.).

**This is the main level-loading smell:** groceries are not level-specific, but they pay full reload cost on every arena swap (menu preview included once world is warm).

### B.4 Quality / cost by level

| Level | Network after first visit | Main cost |
|-------|---------------------------|-----------|
| Classic Record | Chunk tiny; Reflector RT | Ring geometry, Reflector 128→256, rave extras on finalize |
| The Storerooms | Larger JS chunk | Floor grid **76×76**, carpet/wallpaper/ceiling canvas tex, pillars/shelves, void shafts, contact shadows |
| Zanzibar | Medium JS chunk | Deck/podium convex hulls, sky/water/glint canvas textures, bollards, open void |
| Groceries (coupled) | **~2.9 MB every swap** | Draco GLTF ×6 + pool alloc |

Reflector sizes: **preview 128**, **play 256** (`levelManager.js`). Upgrade deferred via `requestIdleCallback` (good).

### B.5 Level issues (ranked)

#### B-1 — Grocery pool re-init on every level swap (High)

**Where:** `main.js` `commitLevelLoad` → dispose + `GroceryPool.init`.  
**Impact:** Menu level flipping (after world warm) and play-entry swaps re-fetch ~2.9 MB models and rebuild physics pool unnecessarily.  
**Fix direction:** Init groceries once per world lifetime; on level swap only `releaseAll` / clear instances, keep geometries and bodies (or rebind world without reloading GLTFs). Cache loaded GLTF scenes in module scope after first load.

#### B-2 — First play pays stacked cold starts (High for first match)

First Solo stacks:

1. Rapier WASM (~1.5 MB) compile  
2. Level chunk + procedural build  
3. Grocery GLBs  
4. Cart GLB (if prefetch incomplete)  
5. Game music (if still preloaded at boot, already competing earlier)

**Fix direction:** Idle warm after menu shown (optional `ensureWorldBootstrapped` on idle for default level only); lazy music (Part A); grocery once; keep cart prefetch.

#### B-3 — Menu preview unavailable until world exists (Medium / intentional)

`previewMenuLevelIfNeeded` no-ops if world not bootstrapped. Level cards don't preview geometry until something has warmed physics (or user has played once in session).

**Tradeoff:** Avoids Rapier on pure menu browsers.  
**If you want previews earlier:** idle warm default level only (not all three).

#### B-4 — Backrooms rebuild is the heaviest CPU path (Medium)

`FLOOR_GRID_CELLS = 76`, large merged meshes, multiple canvas textures. Menu preview still runs full `initBackroomsSupermarket` (only Reflector size differs for Classic-style paths; Backrooms has no Classic Reflector in the same way).

**Fix direction (later):** lower preview grid resolution; or cache last built level graph keyed by id+quality; or skip full physics until play for preview-only (harder).

#### B-5 — Double finalize paths (Low)

Preview schedules finalize at +500ms idle; play entry also finalizes. Generally correct, but easy to race if user spam-clicks modes while finalize runs — already has some gates (`canSafelyRebuildLevel` requires no carts).

#### B-6 — Level chunks already code-split (Good)

`LEVEL_IMPORTERS` dynamic import — no need to bundle all three arenas into the main entry. Keep it.

#### B-7 — No external level textures (Good)

Procedural canvas textures = no extra PNG/HDR waterfalls. Cost is CPU/GPU at build time, not CDN megabytes for arenas themselves.

---

## Part C — Combined load timeline (mental model)

```
t0     HTML + splash CSS
t1     main chunk + three + howler …
t2     menu interactive; game music still downloading (today)
t3     cart Draco prefetch in flight
—— user picks Solo ——
t4     mode overlay; Rapier WASM (first time)
t5     loadLevel(selected) + GroceryPool ×6 GLB
t6     carts spawn after hello; countdown
```

Ideal after fixes:

```
t0–t2  same, but no game music fetch
t2+    optional idle: Rapier + default level only
—— Solo ——
t4     if warm: finalize only; groceries already live
t5     first game track loads on playGameMusic
```

---

## Part D — Recommended fix order (when you start)

Safe vs cart customization work: **1–4 and grocery/level items do not require menu pattern rewrites.** Avoid deep `cartRaveGltf` material edits if you're in customization; loader fallback order is separate.

| Order | Fix | Effort | Impact | Files (approx.) |
|------:|-----|--------|--------|-----------------|
| 1 | Lazy game playlist | S | Boot bandwidth | `audioManager.js`, `main.js` (music only) |
| 2 | Worker asset Cache-Control | S | Return visits | `party/index.ts` |
| 3 | Grocery pool: load once, reset on swap | M | Level swap + play entry | `groceryPool.js`, `main.js` `commitLevelLoad` |
| 4 | Cart GLB fallback: Draco before fat | S | Failure path | `cartRaveGltf.js` loader only |
| 5 | Move `.blend` / drop fat GLBs from ship path | **Done** | `art/` masters; runtime Draco only |
| 6 | Optional idle warm default level | **Done** — `scheduleIdleWorldWarm` in `main.js` (~1.8s + idle) |
| 7 | Backrooms preview LOD / grid | **Done** — preview 40 cells / play 76; physics cuboids unchanged |
| 8 | Font subset/self-host | **Done** — `public/fonts/` latin woff2 + `fonts:fetch`; no Google CDN |

---

## Part E — Verification checklist (when implementing)

### Boot / assets

- [ ] Menu Network: no `song*.ogg|mp3` / `music.ogg` until match start.  
- [ ] Menu music still works after gesture.  
- [ ] `Cache-Control` on `/models/cartrave4-draco.glb` and hashed `/assets/*.js` in prod or wrangler.  
- [ ] Forced primary cart fail → small legacy Draco, not 5–8 MB first.

### Levels

- [ ] First Solo: progress labels advance; no double full rebuild for same level.  
- [ ] After world warm, flip Classic → Storerooms → Zanzibar: **no second grocery GLB waterfall** in Network.  
- [ ] Dispose still safe (no grocery leak / ghost colliders).  
- [ ] Preview reflector 128 then upgrade on Classic without visible stuck low-res forever.  
- [ ] Quickplay with `?room=` still gets arena before countdown.  
- [ ] Low quality mode still skips heavy reflector path.

---

## Appendix — code pointers

| Concern | Location |
|---------|----------|
| Boot splash / deferred menu audio | `index.html` |
| Game playlist preload | `src/main.js`, `src/audioManager.js` |
| Cart GLB chain + prefetch | `src/cartRaveGltf.js`, `src/main.js` |
| ASSETS no cache headers | `party/index.ts` |
| Level dynamic import | `src/levels/index.js` |
| Preview vs full / debounce | `src/levelManager.js` |
| Play entry stack | `src/bootstrap.js` `enterPlayMode` |
| dispose + grocery every swap | `src/main.js` `commitLevelLoad` |
| Grocery load all 6 GLBs | `src/effects/groceryPool.js` `init` / `dispose` |
| Classic arena / Reflector | `src/arena.js` |
| Backrooms heavy build | `src/levels/backroomsSupermarket.js` |
| Zanzibar seascape | `src/levels/zanzibarPlatform.js` |
| Mode-entry overlay | `src/ui/loadingScreen.js` |

---

## Non-goals

- Multiplayer netcode audit  
- Cart customization / patterns  
- Scoring  
- Re-encoding music masters  
- Full Lighthouse score targets  
