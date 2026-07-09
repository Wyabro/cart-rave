# Plan: black-frame flicker fix + Classic Record visual audit

**Date investigated:** 2026-07-09 (late) · **Execute:** next session
**Prior art:** `docs/planning/handover-postfx-black-frames.md` (Grok session — A/B findings valid, fixes rejected)

---

## Investigation findings (verified today, read-only)

### Pipeline state — clean
- `createComposer()` (scene.js) is the original architecture: RenderPass → UnrealBloomPass →
  OutputPass → ArcadeFx(VHS) → FXAA, stock **HalfFloat** composer RTs. Zero leftovers from the
  Grok experiments (no isolation harness, no UnsignedByte forcing, no stabilizeBloomTargets).
- `CONFIG.postFx` is **identical to the pre-bundle baseline** (`1d11bf4`) except the added
  `vhs` block. Bloom 0.34/0.34/0.76/0.14, exposure 0.4, arcade + fog untouched.
- The VHS layer is provably inert off-Storerooms: every VHS term is gated behind
  `uVhsAmount > 0.001`, and `applyLoadedLevelSideEffects` sets it to 0 for all other levels.

### Environment fingerprint (captured from the actual machine)
```
GPU:      NVIDIA GeForce RTX 4090 — ANGLE D3D11 (vs_5_0 ps_5_0)
Browser:  Chromium 148 (Claude preview shell; Wyatt's daily browser version TBD)
WebGL2:   yes · EXT_color_buffer_half_float: yes · EXT_color_buffer_float: yes · DPR 1
```
**Key inference:** a 4090 failing intermittently on RGBA16F render targets is not a hardware
capability problem. Combined with (a) this pipeline being stable for months before the flicker
appeared, (b) repro across resolutions and "mobile mode" (same box), and (c) HUD/DOM unaffected
while WebGL goes pure `#000` (sometimes as half-screen slabs → present/compositor-shaped), the
top suspects are **environment regressions**, not app code:

| Rank | Hypothesis | Why |
|---|---|---|
| H1 | Recent **NVIDIA driver** or **Chromium/ANGLE D3D11** regression with RGBA16F attachments | timing, hardware class, symptom profile |
| H2 | **DirectComposition** partial-present interaction | hard half-screen slabs are its signature |
| H3 | App-level RT/scissor/viewport hygiene that only bites on this stack | possible but nothing found in review |
| H4 | three r185 EffectComposer regression | check release notes/issues |

Hygiene note (not the flicker, fix opportunistically): `normalize(dir)` in ArcadeFxShader is
NaN at the exact center pixel (`dir = 0`) — pre-existing, 1px, harmless, but guard it.

### Classic Record audit — no regression found
- postFx config: byte-identical to baseline (above).
- Live check (solo round, Chromium 148): countdown + in-round frames show the correct identity —
  dark arena, punchy neon, crowd/stadium/billboards/reflective record all present, 0 console
  errors, ~97 FPS. The bundled commits' Classic changes are Wyatt's own crowd/stadium/reactive
  work and looked correct in both frames.
- Remaining eyeball-only items for Wyatt (can't be triggered headlessly): leader-reactive arena
  light color, KO flash reactor, grocery spill, low-quality-mode crowd density.

---

## Execution plan (ordered cheap → expensive; stop at first success)

### Phase 0 — Environment triage (no code, ~20 min, could end the whole bug)
1. Note NVIDIA driver version + when it last updated vs. when flicker first appeared.
   Update (or roll back) the driver; retest 5 min.
2. `chrome://flags` → **"Choose ANGLE graphics backend"** → try `OpenGL`, retest.
   Flicker gone on OpenGL = confirmed ANGLE-D3D11/driver bug → report upstream, pick
   mitigation in Phase 3 with certainty.
3. Launch Chrome with `--disable-direct-composition`, retest (targets the half-screen slabs).
4. Repro in a second browser (Firefox / Edge) for one more data point.

### Phase 1 — Build the black-frame detector (small dev-only code, ~30 lines)
`?flickerprobe=1`: right after `composer.render()` (inside the rAF callback, so the read is
same-frame), `gl.readPixels` a sparse 5-point pattern every Nth frame; if all points are pure
black on a frame that shouldn't be, log timestamp + increment a counter on the FPS overlay.
**This converts "intermittent vibes" into counts** — every later A/B becomes a 2-minute
measurement instead of a long subjective playtest. (This is the piece the Grok session was
missing; its A/B table is otherwise sound.)

### Phase 2 — Isolation, measured by the detector (one toggle at a time)
| Test | Change | Distinguishes |
|---|---|---|
| A | bloom disabled (HalfFloat kept) | float RTs vs bloom internals |
| B | arcade/VHS pass disabled | rules VHS in/out for good |
| C | composer RTs → UnsignedByte (reference impl exists in `scripts/_recovered_uncommitted/src/scene.js`) | known-stable baseline |
| D | composer RTs → FloatType (32F) | 16F-specific vs all-float |
| E | bloom mips only → byte (`stabilizeBloomTargets` pattern from same backup) | composer vs bloom-mip allocation |

### Phase 3 — Fix path (pick by evidence)
- **H1/H2 confirmed (environment):** ship a runtime fallback, not a look downgrade —
  detector counts black frames in the first minute of play; past a threshold, auto-switch the
  composer to the byte path with display-referred bloom values (`CONFIG.postFx.bloomDisplay`,
  retuned properly this time) and log it. HDR look stays for unaffected machines; affected
  machines get stable-with-good-grade. Document the ANGLE-backend flag as a user workaround.
- **Bloom mips only:** force byte mips, keep HalfFloat composer, retune threshold/knee. Cheapest.
- **Full HF composer at fault + byte grade unacceptable:** hybrid — byte main chain, selective
  emissive-only bloom from a separate small RT. Only if the retuned byte grade fails review.

**Grade acceptance:** side-by-side against this session's two reference frames (Classic
countdown + in-round booth shot) and the Storerooms booth shot — dark arenas, punchy neon,
no milk. Wyatt signs off. Test all three levels.

### Cleanup (after fix lands)
- Guard the `normalize(dir)` NaN.
- Delete `scripts/_emergency_bak_20260709_003542/`, `scripts/_recovered_uncommitted/`,
  `scripts/_recover_*.py`, `scripts/_boot_check.mjs` (their only remaining value is the two
  reference implementations noted in Phase 2).
- Fold the outcome into `handover-postfx-black-frames.md` or delete it if fully resolved.
