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

1. Run `npx playwright install chromium` once on this machine if shoot tools fail to launch.
2. Baseline black-frame battery on Classic / Storerooms / Sundial:
   `npm run blackframes -- --shot classic --frames 60`
3. Continue flicker plan env triage ([planning/plan-flicker-fix-and-classic-audit.md](./planning/plan-flicker-fix-and-classic-audit.md)).
4. When profiling: fixed `?shot=` + `?preset=` + `?freeze=1` before claiming a win.

## Open issues (top)

| ID | Issue | Notes |
|----|--------|--------|
| VFX-1 | Intermittent pure-black frames | Environment-first (NVIDIA/ANGLE); app A/B tools now available |
| PERF-1 | Level-swap + menu weight | Foundations landed; needs measured pass |
| NET-1 | Two-browser full-round smoke | Code hardened; gate not closed |
| BRAND-1 | Domain / Worker cutover | Frozen until deliberate cutover |

## Key decisions log

- **D-VIS-1** (2026-07-11): Borrow LAAS *process* only (STATUS, shoot/compare, ablation, bookmarks). Do not port WebGPU open-world systems.
- **D-DOC-1** (2026-07-11): `AGENTS.md` restored from branch `docs/agent-config-rewrite` (never merged to `cart-clash`). STATUS did **not** replace it — STATUS = session memory; AGENTS = standing rules.
- **D-VIS-2** (2026-07-11): Harness uses WebGL + Playwright page screenshots (not WebGPU headless recipes).
- **D-VIS-3** (2026-07-11): `?cam=` implies freeze (camera lock). Ablation reapplied after quality toggles via `reapplyAblation()`.

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

2026-07-11 — initial STATUS + visual QA toolchain.  
Verified: `npm run shoot -- --shot classic` produces a clean Classic Record arena PNG (`?hud=0`).
