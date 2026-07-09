# Handover: Post-FX black-frame flicker vs HDR grade

**Date:** 2026-07-09  
**Project:** Cart Clash (`C:\Users\wyatt\cart-rave`)  
**Branch:** expect `cart-clash` / active V2 work (confirm with `git status`)  
**Level involved:** The Storerooms (`backrooms` / `src/levels/backroomsSupermarket.js`) but flicker is **post-pipeline**, not level-specific  
**Human (Wyatt):** Frustrated with look regressions — prioritize **visual quality matching the pre-bug HDR look** and **no black-frame flicker**. Do not thrash aesthetics again without a clear A/B plan.

---

## 1. Read first (files)

| File | Why |
|------|-----|
| `src/scene.js` | Composer, bloom, arcade/VHS shader, pixel-ratio helpers, RT types |
| `src/config.js` → `CONFIG.postFx` | exposure, bloom, VHS, fog |
| `src/frameVisuals.js` | `composer.render()`, `prepareComposerFrame` |
| `src/ui/cameraFraming.js` | resize / pixel-ratio wiring |
| `src/main.js` | `applyLoadedLevelSideEffects` (VHS + fog on Storerooms), visual deps |
| `src/levels/backroomsSupermarket.js` | fluorescents, hemi/ambient (only if grade still wrong after post-FX fixed) |
| `index.html` | `#game` canvas CSS (`position: fixed; z-index: 0`) |
| `src/cart-rave-menu.css` | `.cr-root { z-index: 10 }` (menu clickability) |

---

## 2. The bug (what the human sees)

Intermittent **pure black** regions over the 3D view:

- Full frame black, or hard **half-screen** slabs (left **or** right)
- **HUD + CSS2D name labels still draw** (HTML overlay OK; WebGL/post path fails)
- Black is pure `#000` (matches `body` background), not Storerooms fog color
- Happens on **ultrawide desktop and mobile mode**
- Human confirmed: **not a resolution-only issue** (repro across sizes)

Screenshots from session (session assets; pattern description):

1. Full black + scoreboard/announcer UI still visible  
2. Left half black, right half normal 3D  
3. Right half black, left half normal 3D  

---

## 3. Hard A/B findings (do not re-litigate)

| Configuration | Flicker | Visual grade |
|---------------|---------|--------------|
| **Default EffectComposer (HalfFloat full-frame RTs)** + original bloom order (beauty → bloom → OutputPass) | **YES — flicker** | **Good** — correct fog, bloom, dark arena |
| **UnsignedByte full-frame composer RTs** + original HDR bloom knobs on pre-tonemap buffer | **No flicker** | **Bad** — blown bloom, plastic CA/warp, wrong fog |
| **UnsignedByte** + crushed exposure/lights + ultra-low bloom | **No flicker** | **Worse** — washed out, milky, flat |
| Cap HalfFloat composer long-edge (~2K) only | **Still flicker** | Good when visible |
| Human: mobile + multiple res | **Still flicker with HalfFloat** | — |

**Conclusion from human playtests:**

- Flicker tracks **float color buffers in the post chain** (at least **HalfFloat**), **not** primarily canvas resolution/DPR.
- **UnsignedByte stops flicker** but the naive HDR pipeline (bloom before tone-map on byte-clipped linear) **destroys the look**.
- Do **not** “fix” grade by slamming exposure/ambient/fluorescents without a pipeline that can represent the old look.

---

## 4. Desired end state

1. **No intermittent pure-black frames** (full or partial).  
2. **Visual match** to the good HalfFloat look:
   - Dark liminal fog on Storerooms  
   - Controlled neon/fluorescent bloom (not plastic halos)  
   - Subtle VHS/CCTV on Storerooms only  
3. Menu remains clickable (`#game` under `.cr-root`).  
4. Minimal thrash of level art unless post-FX is proven fixed.

---

## 5. Current code state (2026-07-09 Phase 1 harness)

**Branch:** `cart-clash` (verify with `git status`)

**Phase 0 baseline (before isolation harness):** tree had rejected experiment:
```
RenderPass → OutputPass → UnrealBloomPass → ArcadeFx → FXAA
composer RT + bloom mips: UnsignedByte
bloom knobs: display-referred (threshold ~0.58, strength ~0.3)
```
Human: stable but grade “shit again”. Menu z-index kept.

**Now:** Phase 1 isolation harness in `createComposer()` + `CONFIG.postFx.isolationTest`.

| Control | How |
|---------|-----|
| Default test | `CONFIG.postFx.isolationTest: "A"` |
| Override | URL `?postfx=A` … `?postfx=E` (hard-refresh) |
| Console | `[postFx isolation X] …` on boot |

| Test | Composer RT | Bloom | OutputPass | Order | Knobs |
|------|-------------|-------|------------|-------|-------|
| **A** (current) | HalfFloat | OFF | ON | Output→bloom | HDR `bloom` |
| B | HalfFloat | ON (stock HF mips) | OFF | bloom→Output | HDR |
| C | UnsignedByte | OFF | ON | Output→bloom | HDR |
| D | UnsignedByte (byte mips) | ON | ON | **bloom→Output** | HDR |
| E | UnsignedByte (byte mips) | ON | ON | **Output→bloom** | `bloomDisplay` |

- `#game { z-index: 0 }`, `.cr-root { z-index: 10 }` — **keep**.
- Do **not** thrash Storerooms lights/exposure during Phase 1.

### Phase 1 results log (human playtest 2–3 min each)

| Test | Flicker (Y/N / notes) | Grade notes | Date |
|------|----------------------|-------------|------|
| A | _pending_ | | |
| B | _pending_ | | |
| C | _pending_ | | |
| D | _pending_ | | |
| E | _pending_ | | |

**Success criteria:** *HalfFloat-era Storerooms grade, zero black slabs, 5+ min playtest desktop + narrow window.*

---

## 6. Root-cause hypothesis (best current)

**Primary:** Writing / sampling **HalfFloat (RGBA16F) color attachments** in the EffectComposer path is unreliable on this user’s stack (Windows + browser ANGLE and also “mobile mode”). Failures present as **cleared/black tiles or full targets**, sometimes half-frame (partial present / driver quirk).

**Secondary (when forced to UnsignedByte badly):**

- Pre-tonemap bloom on **byte-clipped linear** → entire fluorescent panels sit at ~1.0 → huge soft halos + plastic CA.  
- Compensating with lower lights/exposure → washed fog, loss of Storerooms identity.

**Not the main cause (ruled down by human):**

- Composer long-edge / MP caps alone  
- VHS grain alone (was first suspect; half-frame pure black + HUD OK points at RT/clear/composite)

**Also touched this session (mostly fine / keep):**

- VHS shader soften (jitter, noise, vignette edge order, UV clamp) — secondary  
- Menu z-index fix — keep  
- Storerooms art polish (wallpaper, pile scale, doors, EXIT sign) — **separate from post-FX bug**

---

## 7. What was tried (chronology)

1. Softened VHS / vignette / UV clamp — **did not stop half/full black**.  
2. Opaque clear + `clearAlpha = 1` + scissor reset — partial hygiene, **not sufficient**.  
3. **UnsignedByte composer** — **kills flicker**, **breaks HDR bloom grade**.  
4. Restore HalfFloat + original bloom — **look good, flicker back**.  
5. Cap composer resolution (~2K HalfFloat) — **flicker still** (human: any res + mobile).  
6. LDR crush (low exposure, low lights, low bloom) — **stable but washed**.  
7. Post-tonemap bloom order + strip HalfFloat from bloom mips — **attempted stable+grade; human rejected look**.

---

## 8. Recommended investigation plan for next chat

### Phase 0 — Baseline (15 min)

1. `git status` / diff `src/scene.js`, `src/config.js`.  
2. Note exact pass order and RT `type` for composer + bloom.  
3. Agree success criteria with human in one sentence:  
   *“HalfFloat-era Storerooms grade, zero black slabs, 5+ min playtest desktop + narrow window.”*

### Phase 1 — Isolate float vs bloom vs OutputPass (A/B only, no art thrash)

Run **one change at a time**, hard-refresh, human playtest 2–3 min:

| Test | Setup | Expect if hypothesis holds |
|------|--------|----------------------------|
| A | HalfFloat composer, **bloom disabled** | Flicker? → float RTs, not bloom logic |
| B | HalfFloat composer, bloom on, **OutputPass disabled** (if safe) | Narrow which pass |
| C | UnsignedByte composer, **bloom disabled**, OutputPass on | Stable + grade without bloom |
| D | UnsignedByte, bloom on, **pre-tonemap order** (old: bloom then Output) | Stable + bad bloom (known) |
| E | UnsignedByte, bloom on, **post-tonemap order** | Stable; grade TBD |

Log results in a table in this file or chat.

### Phase 2 — Fix paths (pick based on Phase 1)

**If HalfFloat flickers even with bloom off:**

- Prefer **stable UnsignedByte main path**.  
- Rebuild grade without float:
  - Beauty → tone map (OutputPass) → **optional** bloom (byte mips only) → arcade.  
  - Or beauty → arcade with **no UnrealBloomPass**, fake glow via emissive only temporarily.  
- Do **not** lower Storerooms hemi/ambient/fluorescents as the first lever; fix tonemap/bloom order and knobs first.  
- Target reference: exposure `0.4`, fog `CONFIG.postFx.fog.backrooms`, bloom “punchy neon / dark floor” like Classic + old Storerooms HalfFloat look.

**If only bloom HalfFloat mips flicker:**

- Keep HalfFloat **composer** only if proven stable.  
- Force bloom mips to UnsignedByte (`stabilizeBloomTargets` pattern) and retune.  

**If FloatType (32f) works where HalfFloat doesn’t:**

- Try composer RT `type: THREE.FloatType` (heavier; may still fail on ANGLE). One clean A/B only.

**If flicker is clear/scissor/viewport race:**

- Instrument: before/after `composer.render`, log `getRenderTarget`, drawingBuffer size, scissor.  
- Ensure no pass leaves `setRenderTarget` / scissor dirty (Reflector is Classic-only; Storerooms has no Reflector).

### Phase 3 — Grade lock (only after stable)

1. Match fog density/color and midtone darkness to human-approved HalfFloat screenshots if available.  
2. Bloom: neon carts + fixture cores only; no room-wide milk.  
3. VHS: keep subtle (`CONFIG.postFx.vhs`); don’t use VHS to hide grade bugs.  
4. Playtest Classic + Storerooms + Zanzibar so Classic neon bloom doesn’t regress.

### Phase 4 — Cleanup

- Remove dead experiments (`computeComposerPixelRatio` if unused, LDR comments).  
- Document final pipeline in `scene.js` header comment + one line in `docs/planning/project-state.md`.  
- Do not leave “temporary” exposure/light hacks in `backroomsSupermarket.js` without comment + reason.

---

## 9. Key implementation notes

### EffectComposer + custom RT

```js
// If you pass a custom WebGLRenderTarget into EffectComposer:
// - Pass CSS/logical size, not physical (width * dpr).
// - Composer multiplies by pixelRatio in setSize — physical-size RT doubles resolution.
```

### Stock UnrealBloomPass

- Always allocates **HalfFloat** mips in constructor.  
- `setSize` resizes but **does not change type**.  
- After construction, must **dispose + replace** RTs if you want UnsignedByte mips (see `stabilizeBloomTargets` if still present).

### Pass order semantics

| Order | Meaning |
|-------|---------|
| Bloom → OutputPass | Classic three.js HDR: bloom in linear HDR, then tonemap |
| OutputPass → Bloom | Display-referred bloom; works without HDR headroom; needs different thresholds |

### Menu / canvas stacking (fixed this session — keep)

```css
#game { position: fixed; inset: 0; z-index: 0; }
.cr-root { z-index: 10; } /* must stay above canvas or menu is unclickable */
```

---

## 10. Suggested “good look” reference knobs (pre-bug HDR era)

These were the **intended** HDR-path values before LDR thrash (restore as target when using a true HDR-capable path):

```js
toneMappingExposure: 0.4
bloom: { strength: 0.34, radius: 0.34, threshold: 0.76, smoothWidth: 0.14 }
// Storerooms fog
fog.backrooms: { color: 0x1a1510, density: 0.029 }
// Storerooms fill (don’t nerf first)
HemisphereLight intensity ~1.42, Ambient ~0.74
lit fluorescent emissiveIntensity ~1.42
```

VHS (Storerooms only via `applyLoadedLevelSideEffects`):

```js
vhs: { amount: ~0.28, noise: ~0.05, trackPeriodSec: ~26 }
```

---

## 11. Out of scope / do not regress

- Storerooms **art pass** (carpet/wallpaper, furniture pile scale `PIECE_SCALE`/`PACK`, doors 2×, EXIT sign, no hole clutter) — already done; don’t undo while hunting post-FX.  
- Physics floor lockstep tests (`tests/backroomsFloor.test.js`) — unrelated.  
- PartyKit / netcode — unrelated.

---

## 12. First message template for next agent

```text
Read docs/planning/handover-postfx-black-frames.md fully.

Goal: zero pure-black intermittent frames AND restore the good HalfFloat-era
Storerooms grade (fog, bloom, not washed).

Hard constraints from human A/B:
- HalfFloat full post path = flicker (any res, mobile too)
- Naive UnsignedByte + pre-tonemap HDR bloom knobs = stable but plastic/washed
- Resolution caps alone did not fix flicker

Start with Phase 1 isolation tests (one change at a time, human playtests).
Do not thrash backrooms lights/exposure until pipeline order + RT type are decided.
Keep menu z-index fix (#game under .cr-root).
```

---

## 13. Personal note for the next agent

Wyatt already endured several full look-quality swings. **Ship isolation evidence before more “tune everything” passes.** Prefer boring stable pipeline + matched reference knobs over clever half-fixed HDR. If you must choose temporary sacrifice: **stable + slightly less bloom** beats **pretty + black halves**, but the real goal is both — get there with Phase 1 data, not vibes.
# Handover: Post-FX black-frame flicker vs HDR grade

**Date:** 2026-07-09  
**Project:** Cart Clash (`C:\Users\wyatt\cart-rave`)  
**Branch:** expect `cart-clash` / active V2 work (confirm with `git status`)  
**Level involved:** The Storerooms (`backrooms` / `src/levels/backroomsSupermarket.js`) but flicker is **post-pipeline**, not level-specific  
**Human (Wyatt):** Frustrated with look regressions — prioritize **visual quality matching the pre-bug HDR look** and **no black-frame flicker**. Do not thrash aesthetics again without a clear A/B plan.

---

## 1. Read first (files)

| File | Why |
|------|-----|
| `src/scene.js` | Composer, bloom, arcade/VHS shader, pixel-ratio helpers, RT types |
| `src/config.js` → `CONFIG.postFx` | exposure, bloom, VHS, fog |
| `src/frameVisuals.js` | `composer.render()`, `prepareComposerFrame` |
| `src/ui/cameraFraming.js` | resize / pixel-ratio wiring |
| `src/main.js` | `applyLoadedLevelSideEffects` (VHS + fog on Storerooms), visual deps |
| `src/levels/backroomsSupermarket.js` | fluorescents, hemi/ambient (only if grade still wrong after post-FX fixed) |
| `index.html` | `#game` canvas CSS (`position: fixed; z-index: 0`) |
| `src/cart-rave-menu.css` | `.cr-root { z-index: 10 }` (menu clickability) |

---

## 2. The bug (what the human sees)

Intermittent **pure black** regions over the 3D view:

- Full frame black, or hard **half-screen** slabs (left **or** right)
- **HUD + CSS2D name labels still draw** (HTML overlay OK; WebGL/post path fails)
- Black is pure `#000` (matches `body` background), not Storerooms fog color
- Happens on **ultrawide desktop and mobile mode**
- Human confirmed: **not a resolution-only issue** (repro across sizes)

Screenshots from session (session assets; pattern description):

1. Full black + scoreboard/announcer UI still visible  
2. Left half black, right half normal 3D  
3. Right half black, left half normal 3D  

---

## 3. Hard A/B findings (do not re-litigate)

| Configuration | Flicker | Visual grade |
|---------------|---------|--------------|
| **Default EffectComposer (HalfFloat full-frame RTs)** + original bloom order (beauty → bloom → OutputPass) | **YES — flicker** | **Good** — correct fog, bloom, dark arena |
| **UnsignedByte full-frame composer RTs** + original HDR bloom knobs on pre-tonemap buffer | **No flicker** | **Bad** — blown bloom, plastic CA/warp, wrong fog |
| **UnsignedByte** + crushed exposure/lights + ultra-low bloom | **No flicker** | **Worse** — washed out, milky, flat |
| Cap HalfFloat composer long-edge (~2K) only | **Still flicker** | Good when visible |
| Human: mobile + multiple res | **Still flicker with HalfFloat** | — |

**Conclusion from human playtests:**

- Flicker tracks **float color buffers in the post chain** (at least **HalfFloat**), **not** primarily canvas resolution/DPR.
- **UnsignedByte stops flicker** but the naive HDR pipeline (bloom before tone-map on byte-clipped linear) **destroys the look**.
- Do **not** “fix” grade by slamming exposure/ambient/fluorescents without a pipeline that can represent the old look.

---

## 4. Desired end state

1. **No intermittent pure-black frames** (full or partial).  
2. **Visual match** to the good HalfFloat look:
   - Dark liminal fog on Storerooms  
   - Controlled neon/fluorescent bloom (not plastic halos)  
   - Subtle VHS/CCTV on Storerooms only  
3. Menu remains clickable (`#game` under `.cr-root`).  
4. Minimal thrash of level art unless post-FX is proven fixed.

---

## 5. Current code state (end of this session — may be mid-experiment)

**Likely current pipeline in `createComposer()` (verify in tree):**

```
RenderPass → OutputPass → UnrealBloomPass → ArcadeFx (VHS) → FXAA
```

- Composer RTs forced to **`THREE.UnsignedByteType`** (custom RT passed into `EffectComposer`).  
- `stabilizeBloomTargets()` rebuilds UnrealBloomPass mips as **UnsignedByte** (stock pass hardcodes HalfFloat).  
- Bloom knobs retuned for **post-tonemap / display-referred** input (`CONFIG.postFx.bloom` threshold ~0.58, strength ~0.3).  
- Human feedback: **look still unacceptable** (“shit again”) — this is **not** the accepted solution.  
- `#game { z-index: 0 }`, `.cr-root { z-index: 10 }` — keep (menu was broken when canvas stacked above menu).

**Treat current tree as unstable experiment.** Next agent should verify `createComposer` / `CONFIG.postFx` with a read of disk, not this doc alone.

---

## 6. Root-cause hypothesis (best current)

**Primary:** Writing / sampling **HalfFloat (RGBA16F) color attachments** in the EffectComposer path is unreliable on this user’s stack (Windows + browser ANGLE and also “mobile mode”). Failures present as **cleared/black tiles or full targets**, sometimes half-frame (partial present / driver quirk).

**Secondary (when forced to UnsignedByte badly):**

- Pre-tonemap bloom on **byte-clipped linear** → entire fluorescent panels sit at ~1.0 → huge soft halos + plastic CA.  
- Compensating with lower lights/exposure → washed fog, loss of Storerooms identity.

**Not the main cause (ruled down by human):**

- Composer long-edge / MP caps alone  
- VHS grain alone (was first suspect; half-frame pure black + HUD OK points at RT/clear/composite)

**Also touched this session (mostly fine / keep):**

- VHS shader soften (jitter, noise, vignette edge order, UV clamp) — secondary  
- Menu z-index fix — keep  
- Storerooms art polish (wallpaper, pile scale, doors, EXIT sign) — **separate from post-FX bug**

---

## 7. What was tried (chronology)

1. Softened VHS / vignette / UV clamp — **did not stop half/full black**.  
2. Opaque clear + `clearAlpha = 1` + scissor reset — partial hygiene, **not sufficient**.  
3. **UnsignedByte composer** — **kills flicker**, **breaks HDR bloom grade**.  
4. Restore HalfFloat + original bloom — **look good, flicker back**.  
5. Cap composer resolution (~2K HalfFloat) — **flicker still** (human: any res + mobile).  
6. LDR crush (low exposure, low lights, low bloom) — **stable but washed**.  
7. Post-tonemap bloom order + strip HalfFloat from bloom mips — **attempted stable+grade; human rejected look**.

---

## 8. Recommended investigation plan for next chat

### Phase 0 — Baseline (15 min)

1. `git status` / diff `src/scene.js`, `src/config.js`.  
2. Note exact pass order and RT `type` for composer + bloom.  
3. Agree success criteria with human in one sentence:  
   *“HalfFloat-era Storerooms grade, zero black slabs, 5+ min playtest desktop + narrow window.”*

### Phase 1 — Isolate float vs bloom vs OutputPass (A/B only, no art thrash)

Run **one change at a time**, hard-refresh, human playtest 2–3 min:

| Test | Setup | Expect if hypothesis holds |
|------|--------|----------------------------|
| A | HalfFloat composer, **bloom disabled** | Flicker? → float RTs, not bloom logic |
| B | HalfFloat composer, bloom on, **OutputPass disabled** (if safe) | Narrow which pass |
| C | UnsignedByte composer, **bloom disabled**, OutputPass on | Stable + grade without bloom |
| D | UnsignedByte, bloom on, **pre-tonemap order** (old: bloom then Output) | Stable + bad bloom (known) |
| E | UnsignedByte, bloom on, **post-tonemap order** | Stable; grade TBD |

Log results in a table in this file or chat.

### Phase 2 — Fix paths (pick based on Phase 1)

**If HalfFloat flickers even with bloom off:**

- Prefer **stable UnsignedByte main path**.  
- Rebuild grade without float:
  - Beauty → tone map (OutputPass) → **optional** bloom (byte mips only) → arcade.  
  - Or beauty → arcade with **no UnrealBloomPass**, fake glow via emissive only temporarily.  
- Do **not** lower Storerooms hemi/ambient/fluorescents as the first lever; fix tonemap/bloom order and knobs first.  
- Target reference: exposure `0.4`, fog `CONFIG.postFx.fog.backrooms`, bloom “punchy neon / dark floor” like Classic + old Storerooms HalfFloat look.

**If only bloom HalfFloat mips flicker:**

- Keep HalfFloat **composer** only if proven stable.  
- Force bloom mips to UnsignedByte (`stabilizeBloomTargets` pattern) and retune.  

**If FloatType (32f) works where HalfFloat doesn’t:**

- Try composer RT `type: THREE.FloatType` (heavier; may still fail on ANGLE). One clean A/B only.

**If flicker is clear/scissor/viewport race:**

- Instrument: before/after `composer.render`, log `getRenderTarget`, drawingBuffer size, scissor.  
- Ensure no pass leaves `setRenderTarget` / scissor dirty (Reflector is Classic-only; Storerooms has no Reflector).

### Phase 3 — Grade lock (only after stable)

1. Match fog density/color and midtone darkness to human-approved HalfFloat screenshots if available.  
2. Bloom: neon carts + fixture cores only; no room-wide milk.  
3. VHS: keep subtle (`CONFIG.postFx.vhs`); don’t use VHS to hide grade bugs.  
4. Playtest Classic + Storerooms + Zanzibar so Classic neon bloom doesn’t regress.

### Phase 4 — Cleanup

- Remove dead experiments (`computeComposerPixelRatio` if unused, LDR comments).  
- Document final pipeline in `scene.js` header comment + one line in `docs/planning/project-state.md`.  
- Do not leave “temporary” exposure/light hacks in `backroomsSupermarket.js` without comment + reason.

---

## 9. Key implementation notes

### EffectComposer + custom RT

```js
// If you pass a custom WebGLRenderTarget into EffectComposer:
// - Pass CSS/logical size, not physical (width * dpr).
// - Composer multiplies by pixelRatio in setSize — physical-size RT doubles resolution.
```

### Stock UnrealBloomPass

- Always allocates **HalfFloat** mips in constructor.  
- `setSize` resizes but **does not change type**.  
- After construction, must **dispose + replace** RTs if you want UnsignedByte mips (see `stabilizeBloomTargets` if still present).

### Pass order semantics

| Order | Meaning |
|-------|---------|
| Bloom → OutputPass | Classic three.js HDR: bloom in linear HDR, then tonemap |
| OutputPass → Bloom | Display-referred bloom; works without HDR headroom; needs different thresholds |

### Menu / canvas stacking (fixed this session — keep)

```css
#game { position: fixed; inset: 0; z-index: 0; }
.cr-root { z-index: 10; } /* must stay above canvas or menu is unclickable */
```

---

## 10. Suggested “good look” reference knobs (pre-bug HDR era)

These were the **intended** HDR-path values before LDR thrash (restore as target when using a true HDR-capable path):

```js
toneMappingExposure: 0.4
bloom: { strength: 0.34, radius: 0.34, threshold: 0.76, smoothWidth: 0.14 }
// Storerooms fog
fog.backrooms: { color: 0x1a1510, density: 0.029 }
// Storerooms fill (don’t nerf first)
HemisphereLight intensity ~1.42, Ambient ~0.74
lit fluorescent emissiveIntensity ~1.42
```

VHS (Storerooms only via `applyLoadedLevelSideEffects`):

```js
vhs: { amount: ~0.28, noise: ~0.05, trackPeriodSec: ~26 }
```

---

## 11. Out of scope / do not regress

- Storerooms **art pass** (carpet/wallpaper, furniture pile scale `PIECE_SCALE`/`PACK`, doors 2×, EXIT sign, no hole clutter) — already done; don’t undo while hunting post-FX.  
- Physics floor lockstep tests (`tests/backroomsFloor.test.js`) — unrelated.  
- PartyKit / netcode — unrelated.

---

## 12. First message template for next agent

```text
Read docs/planning/handover-postfx-black-frames.md fully.

Goal: zero pure-black intermittent frames AND restore the good HalfFloat-era
Storerooms grade (fog, bloom, not washed).

Hard constraints from human A/B:
- HalfFloat full post path = flicker (any res, mobile too)
- Naive UnsignedByte + pre-tonemap HDR bloom knobs = stable but plastic/washed
- Resolution caps alone did not fix flicker

Start with Phase 1 isolation tests (one change at a time, human playtests).
Do not thrash backrooms lights/exposure until pipeline order + RT type are decided.
Keep menu z-index fix (#game under .cr-root).
```

---

## 13. Personal note for the next agent

Wyatt already endured several full look-quality swings. **Ship isolation evidence before more “tune everything” passes.** Prefer boring stable pipeline + matched reference knobs over clever half-fixed HDR. If you must choose temporary sacrifice: **stable + slightly less bloom** beats **pretty + black halves**, but the real goal is both — get there with Phase 1 data, not vibes.
