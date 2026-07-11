# Cart Clash — STATUS (session source of truth)

> **Rehydration protocol** (agent or human resuming cold):
> 1. Read **this file** fully (session focus / next / gotchas).
> 2. Read root [AGENTS.md](../AGENTS.md) for standing rules and invariants (canonical).
> 3. Read [planning/project-state.md](./planning/project-state.md) for architecture snapshot.
> 4. Read [planning/ROADMAP.md](./planning/ROADMAP.md) only for open future work.
> 5. Jump to **Current focus** and **Next actions** below — do not re-plan from scratch.
> 6. Update this file after every meaningful step. Prefer short decision logs over new handover novels.
>
> Visual QA tooling: [guides/visual-qa.md](./guides/visual-qa.md)  
> Naming freeze: [brand.md](./brand.md)

## Mission (1 paragraph)

Ship **Cart Clash** Version 2: a polished solo-first 4-player shopping-cart physics brawler
(Three.js + Rapier + PartyKit on Cloudflare). Product name is Cart Clash; Worker/host IDs may
still say `cart-rave` until domain cutover. Prefer evidence (screenshots, black-pixel samples,
two-browser smokes) over vibes for graphics and multiplayer gates.

## Hard rules digest

- Do not re-open items listed under **Do not re-open** in project-state §5 without new evidence.
- Naming: UI says Cart Clash; storage/Worker IDs stay `cartRave*` until deliberate migration.
- Solo polish before deep multiplayer features (ROADMAP philosophy).
- No silent pure-black WebGL frames as an accepted “look.”
- Prefer quality-preserving perf fixes; measure before and after when possible.

## Current focus

**Visual QA toolchain (LAAS-inspired process, not engine)** — landed in-tree:

- `docs/STATUS.md` (this file)
- URL debug surface: `?ablate=`, `?postmin=`, `?cam=`, `?freeze=`, `?level=`, `?preset=`, `?shot=`, `?harness=1`
- `window.__cartRave` harness (`settle`, `sampleBlack`, `stats`)
- CLI: `npm run shoot`, `npm run compare`, `npm run blackframes` (Playwright; see visual-qa guide)

**Still open (game, not tooling):** black-frame flicker environment triage, profiling-driven
perf pass, multiplayer two-browser smoke, menu/domain cutover.

## Next actions

1. Prefer **`npm run qa`** before claiming done (CI runs the same on push/PR).
2. Baseline black-frame battery when touching postFX:
   `npm run qa:visual` or `npm run blackframes -- --shot classic --frames 60`
3. Continue flicker plan env triage ([planning/plan-flicker-fix-and-classic-audit.md](./planning/plan-flicker-fix-and-classic-audit.md)).
4. When profiling: fixed `?shot=` + `?preset=` + `?freeze=1` before claiming a win.
5. Multiplayer two-browser smoke checklist still open (ROADMAP Phase 4).

## Open issues (top)

| ID | Issue | Notes |
|----|--------|--------|
| VFX-1 | Intermittent pure-black frames | Environment-first (NVIDIA/ANGLE); app A/B tools now available |
| PERF-1 | Level-swap + menu weight | Measured pass done (D-PERF-1..3); arena-chunk prefetch + honest `three` chunk shipped |
| NET-1 | Two-browser full-round smoke | Code hardened; gate not closed |
| BRAND-1 | Domain / Worker cutover | Frozen until deliberate cutover |
| BUNDLE-1 | Menu/game code-split blocked | `index` chunk is one entangled cluster; no clean menu/game seam (see D-PERF-3) |

## Key decisions log

- **D-VIS-1** (2026-07-11): Borrow LAAS *process* only (STATUS, shoot/compare, ablation, bookmarks). Do not port WebGPU open-world systems.
- **D-DOC-1** (2026-07-11): `AGENTS.md` restored from branch `docs/agent-config-rewrite` (never merged to `cart-clash`). STATUS did **not** replace it — STATUS = session memory; AGENTS = standing rules.
- **D-VIS-2** (2026-07-11): Harness uses WebGL + Playwright page screenshots (not WebGPU headless recipes).
- **D-VIS-3** (2026-07-11): `?cam=` implies freeze (camera lock). Ablation reapplied after quality toggles via `reapplyAblation()`.
- **D-PERF-1** (2026-07-11): PERF-1 measured pass. Local dev "2s first level-swap" is a **Vite dev-transform artifact** (chunk on-demand compile), NOT a prod cost — proven by pre-warming chunks (→~0ms). Do not chase it. Added `?perf=1` (DEV) per-phase swap breakdown in `commitLevelLoad`.
- **D-PERF-2** (2026-07-11): Shipped `prefetchLevelChunks()` (`src/levels/index.js`) — idle-warm now prefetches the two **non-selected** arena chunks so menu arena-switching never waits on a lazy `import()`. Verified: before, only selected arena warm; after, all three. Quality-neutral.
- **D-PERF-3** (2026-07-11): `vite.config.js` now uses `codeSplitting.groups` (not `manualChunks` hints). Fixes the misleading 650 kB "animejs" chunk — it was ~92% **Three.js core** (animejs/adapters/three drags three in; manualChunks folded it there). Now: honest `three` ~gz176 + `animejs` ~gz18. **Zero bytes saved** (no dup — index/addons import three from that chunk), naming/cache-line only. **BUNDLE-1**: real menu/game code-split is blocked — `Netcode` (132 uses, incl. `resolveCartNeonHex` at menu), `HUD` (per-frame `isEscOverlayVisible`), and even "isolated" `touchControls`/`announcer` are statically imported by menu-coupled `hud.js`/`netcode.js`. No clean seam; needs full gameplay-cluster-behind-one-dynamic-boundary refactor + NET-1 smoke before it moves any bytes.

## Gotchas (append-only)

- EffectComposer path: RenderPass → Bloom → OutputPass → Arcade(VHS) → FXAA. `renderer.toneMapping` is a no-op into composer RTs without OutputPass.
- VHS is level-gated via `uVhsAmount` (Storerooms only); `?ablate=vhs` zeros the uniform without killing arcade CRT.
- Half-res bloom RTs: strength compensated via `bloomHalfResStrengthMul`.
- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- `localStorage` keys remain `cartRave*` until brand migration.
- Playwright default headless shell can differ from full Chrome; tools request Chromium channel when available.

## Architecture map (debug surface)

```
src/utils/debugParams.js    URL parse, bookmarks, ablation apply
src/utils/visualHarness.js  window.__cartRave for automation
src/scene.js                createComposer (+ outputPass ref for ablation)
src/main.js                 boot side effects, harness install, cam lock in loop
src/ui/menuAttract.js       respects freeze / locked cam
tools/shoot.mjs             screenshot at bookmark / cam
tools/compare.mjs           side-by-side + mean-abs
tools/blackframes.mjs       multi-frame black-pixel battery
docs/guides/visual-qa.md    how to run
```

## Last updated

2026-07-11 — PERF-1 measured pass: arena-chunk prefetch + honest `three`/`animejs` chunks shipped; BUNDLE-1 (menu/game split) scoped + blocked (D-PERF-1..3).  
2026-07-11 — initial STATUS + visual QA toolchain.  
Verified: `npm run shoot -- --shot classic` produces a clean Classic Record arena PNG (`?hud=0`).
