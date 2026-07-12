# Cart Clash — Backlog (audited 2026-07-12)

**What is this?** Every known open item, deduplicated across STATUS, ROADMAP, the netcode
deep-dive, and the July pass records — grouped by discipline, prioritized. **Why does it
exist?** So open work lives in one place instead of scattered tables. **Who should read
it?** Whoever is picking the next piece of work. **Related:**
[STATUS.md](../STATUS.md) (health + focus), [ROADMAP.md](./ROADMAP.md) (phased plan),
[netcode-deep-dive.md](./netcode-deep-dive.md) (full hazard writeups).

Priorities: **Critical** = blocks the Version 2 release · **High** = should land before V2
ships · **Medium** = V2-window polish, ship-without-it acceptable · **Low** = post-launch /
opportunistic. Resolved items were removed in the 2026-07-12 audit (they live in
[completed-work.md](./completed-work.md)); do not re-add them.

---

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| **Critical** | **NET-1 — two-browser full-round runtime smoke** | The V2 gate. Join, color pick, ready, full round, SD overtime, podium, play again, disconnect/rejoin + feel/HUD parity. Run together with the [Living Store](./living-store-test-plan.md) and [host migration](./host-migration-test-plan.md) checklists. Keep every window visible (hidden tab freezes rAF); use `127.0.0.1`. |
| **Critical** | **NET-CLK-1 — split Party vs host clock offsets** | One EWMA feeds three clock domains → countdown snap, HUD fighting the timer, skewed round end. Fix direction in [netcode-deep-dive.md](./netcode-deep-dive.md). |
| **Critical** | **NET-MIG-2 — ghost exorcism can leave `#hostId === null`** | Solo refresh / sole-human edge wedges the room. |
| High | VFX-1 endgame: promote display-referred bloom to default | Root cause fixed (D-VFX-2); Storerooms shipped (`98317c1`). Needs Classic/Sundial look check + threshold/strength tune with Wyatt, then delete the `?rtmode` fork paths. |
| High | Push the stabilization commits | `b9e8fb8`..`3754949` sit unpushed pending playtest. Remote is authoritative — nothing above them counts as done. |
| High | NET-CLK-2 — podium gate mixes host `startedAtMs` with DO `now` | Server can reject legitimate `host_round`. |
| High | NET-MIG-1 — promote restores poses, not kill credit | Post-migration hits misattribute. |
| High | NET-BUF-1 — spawn buffer uses DO time; live snapshots use host time | Interp buffer timebase mismatch at round start. |
| High | NET-MIG-3 — freeze window ends before the new host's DataChannel is up | Ghost colliders / rubber-band on migration; pair with the live migration test plan. |
| Medium | NET-PRES-1 — unreliable falls/collisions: loss and duplicate fan-out | Duplicate reactor fire is the worse half. |
| Medium | NET-CLK-3 — hit window / directives mix `Date.now` with round clock | |
| Medium | NET-SD-1 — SD can untie on score while the flag stays true | |
| Medium | Deeper server-authoritative logic | Host can fabricate final scores; decide what the Worker must validate. Prerequisite for the leaderboard. |
| Medium | `structuredClone` → flat serializer in `party/index.ts` | Deliberate deferral: only after NET-1 + profiling data (ROADMAP Phase 5). |
| Low | Persistent leaderboard (Supabase) | Treat host-asserted scores as untrusted input (see above). |
| Low | Quickplay arena rotation | Deferred by Wyatt (D-STAB-2); the rematch-seam recipe is documented in the [decision log](../archive/decision-log-2026-07.md). Needs a masked-transition reveal animation. |

## Art

| Pri | Item | Notes |
|-----|------|-------|
| High | Bloom look sign-off (Classic/Sundial) | Art half of the VFX-1 endgame above — dark arenas + punchy neon identity must survive display-referred bloom (standing look rule: low exposure, restrained bloom — don't brighten; see [archive/audits/visual-audit.md](../archive/audits/visual-audit.md)). |
| Medium | Pattern customize UI — blocked on cartrave4 body UVs | Pattern system fully wired except the picker tab; body UVs are fragmented. Plan: bake a 2nd UV channel in Blender ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)), then add the PATTERNS tab. |
| Low | Asset filename rebrand (`cart-rave-base*.glb` etc.) | Separate deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Medium | Recorded announcer VO | Pipeline is done and data-driven ([announcer.md](../reference/announcer.md)) — drop `public/sounds/announcer/<locale>/…`, zero code changes. Blocked on recordings. |
| Medium | Sudden Death music + ambient arena bed | Pass 5 deferrals — asset-gated. |
| Low | Deeper Howler upgrade | Spatial audio, pooling, volume groups (ROADMAP "Future Modernization"). |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| **Critical** | **Drain the Wyatt playtest queue** | Passes 4 & 5 + stabilization + bloom A/B are all behavior/look-changing and unvalidated. One session covers it — checklist in [STATUS.md](../STATUS.md). |
| Medium | Taste-tuning follow-ups from Pass 4 | Deliberately-kept knobs listed in D-GP4-1 (nitro duty-cycle, `maxImpulse` vs boost, air control, readability HUD adds) — only reopen with playtest evidence. |
| Medium | Clutch slow-mo (Pass 5 deferral) | Taste-gated; prototype only after the queue drains. |
| Low | Death-cam "follow killer" revisit | Attempted 07-10, reverted as a regression — revisit carefully or drop. |
| Low | Animate the customize sunglasses-tab camera zoom | The 1.35× snap reads as a cart-size glitch (testers reported it as a bug). |
| Low | Subtle monetization path | Cosmetic unlocks could support it — idea stage only. |

## Tech Debt

| Pri | Item | Notes |
|-----|------|-------|
| Medium | V2 shipping checklist + final QA doc | Create when the milestone above is in sight. |
| Low | BUNDLE-1 — menu/game code-split | **Blocked** (D-PERF-3): no clean seam; needs a gameplay-cluster-behind-one-dynamic-boundary refactor + NET-1 smoke first. Do not chip at it piecemeal. |
| Low | TypeScript 7 migration | Stay on TS 6.0.3 — TS 7 native flags ~849 JSDoc `object` errors; needs a real migration pass. |
| Low | Vite 500 kB chunk-size hint | Cosmetic build warning; unrelated to the fixed `rolldownOptions` rename. |
| Low | Brand cutover debt | Worker name, DO class, `cartRave*` storage keys, module filenames — all intentionally frozen; see [brand.md](../brand.md) for the cutover checklist. |

## Future Ideas (post-launch)

- WebGPU compute shaders for targeted VFX (shatter, particles) — re-evaluate after mobile perf is proven; no physics rewrite.
- Economy/XP progression beyond lifetime unlocks — only if reopened deliberately.
- Domain + full rebrand cutover ceremony (new Worker, storage migration, asset renames) as one planned event.
