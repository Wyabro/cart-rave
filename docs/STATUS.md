# Cart Clash — Production Dashboard & Session Status

**What is this?** The first document anyone (human or agent) reads: declared project
phase, mission, blockers, and what happens next. It doubles as the session source of truth.
**Why does it exist?** So nobody has to read weeks of historical docs to know where the
project stands. **Is it current for declarations?** Yes — this file owns phase, mission,
active card, blockers, and phase-exit checklist. **Observed evidence** (git HEAD, qa/battery
results, dirty state) lives in the generated Command Center — run **`npm run dashboard`**
(`.diag-captures/dashboard.html` + `health.json`). Do not hand-maintain gate/HEAD claims here.

> **Rehydration protocol** (agent or human resuming cold — this list is the single source; other docs link here):
> 1. Read [BRIEFING.md](./BRIEFING.md) — generated, committed, always in git: phase · the one active item · do-nots.
> 2. Read root [AGENTS.md](../AGENTS.md) for standing rules, invariants, and how work is executed (canonical).
> 3. Read **this file** for declared phase / mission / blockers / gotchas detail.
> 4. If you can run npm: **`npm run dashboard`** → `.diag-captures/health.json` / Command Center HTML for **observed evidence** (git HEAD, gates, captures). File-only tools skip this — BRIEFING.md carries the declared essentials.
> 5. Read [planning/ROADMAP.md](./planning/ROADMAP.md) + [planning/BACKLOG.md](./planning/BACKLOG.md) only for open future work.
> 6. Do not re-plan from scratch; do not re-open settled decisions ([archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md)) without new evidence.
> 7. Update this file after every meaningful step, then run `npm run briefing` — one-line decision index entries here, long rationale in the decision log.
>
> Doc map: [docs/README.md](./README.md) · Dev toolkit: [guides/dev-toolkit.md](./guides/dev-toolkit.md) · Observability: [guides/observability.md](./guides/observability.md) · Visual QA: [guides/visual-qa.md](./guides/visual-qa.md) · Netcode harness: [guides/netcode-harness.md](./guides/netcode-harness.md) · Diagnostics: [guides/diagnostics.md](./guides/diagnostics.md) · Naming freeze: [brand.md](./brand.md)

## Mission (1 paragraph)

Ship **Cart Clash** Version 2: a polished solo-first 4-player shopping-cart physics brawler
(Three.js + Rapier + partyserver on Cloudflare). Product name is Cart Clash; Worker/host IDs
stay `cart-rave` until domain cutover. Prefer evidence (screenshots, black-pixel samples,
two-browser smokes) over vibes for graphics and multiplayer gates.

### Release phases

Orientation only — **advance the ▶ marker only on Wyatt’s explicit instruction.** Agents may
report phase-exit eligibility; they must not move the marker. Command Center renders this
strip separately from observed readiness (evidence never changes declared phase).

- ✅ Foundation — engine, arenas, carts, physics
- ✅ Core gameplay — KOs, scoring, Living Store, solo AI
- ✅ Multiplayer — P2P netcode, host authority, migration
- ✅ Production systems — passes 1–5, tooling, observability
- ▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC
- ⬜ Release candidate — queue drained, exact-HEAD evidence green, tech-debt triage
- ⬜ Ship — domain cutover, external testers, wide URL

## Project health — declared (evidence is generated)

**Phase = Playtesting & stabilization** (declared). Run 7 closed; NET-1 / NET-2 / NET-MIG-3
are **completed evidence**, not phase completion. Release candidate stays todo until Wyatt
advances the marker.

| Signal | Where to look |
|---|---|
| Gates / battery / git sync | `npm run dashboard` → `health.json` (`observed`, `readiness`) |
| Prod deploy / live bundle | Ephemeral handoff + collectors — not hand-maintained here |
| Multiplayer live smoke | STATUS queue + backlog IDs (NET-1 etc.) as evidence of passes |

## Major systems completed

Full record: [planning/production-passes.md](./planning/production-passes.md) and
[planning/completed-work.md](./planning/completed-work.md).

- **Core game** — host-authoritative MP + rewind-and-replay prediction; solo reuses the same path (private room + 3 NPCs); 3 elevated arenas; 2.5-min rounds + Sudden Death.
- **Presentation** — sticker-language menus/HUD/overlays, Store PA announcer, attract-mode menu, per-arena bloom, VFX/audio juice, distinct Defeat screen.
- **Arena audio** — per-arena ambient beds + reactive crowd + SD tension + per-arena music ([ambience.md](./reference/ambience.md), [music.md](./reference/music.md)).
- **Gameplay/AI** — Pass 4 bot fixes, proximity aggression, Sundial rim nav, intensity-scaled ram SFX.
- **Systems** — Living Store, scoring/KO event fan-out, lifetime unlocks, challenges, match stats.
- **Performance** — 3-tier quality, arena opts, chunk prefetch, boot/load pass, half-res bloom, LOD, auto-quality.
- **Netcode hardening** — WebRTC P2P plane, binary snapshots, host-migration handoff + round validation.
- **Tooling** — visual QA, netcode/gameplay harnesses, `npm run battery`, CI gate, observability + Command Center.

## Current focus

**Playtesting and stabilization.** Tier A drained; Tier B/C, the security sweep and the
analytics gating are closed — full evidence in
[completed-work.md](./planning/completed-work.md) (**B1 AI-DIFF-1** shipped `49bfc2a`).
**ANLX-ATTRACT-1 closed 07-31** and the **analytics DO has been reset** (both
before-external-testers items are done); the ring now starts clean.

Run 7 mission closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 landed (loss-on-drop residual accepted). Stay in this phase until Wyatt advances the marker.

**Fight Night UI** merged (`56dfa61`). FIGHT-VERIFY-1 **agent half closed 08-01** — three new
on-demand rigs (`podium` · `loadshots` · `states`) now cover results, both loading screens and
every interactive state. **Wyatt half still owed**, and no tool can claim it: real-match
HUD/results *feel*, the two-client friends room (the CHECKOUT LINE lobby has never rendered
anywhere), the non-host podium branch, and the parked MP confetti/wilt bug
([handover](./planning/fight-night-ui-handover.md)).

Playtest console: `npm run dashboard` → [.diag-captures/playtest-console.html](../.diag-captures/playtest-console.html)
(seed: STATUS needs-Wyatt + BACKLOG `Owed: Wyatt playtest`). F8 + `npm run captures:pull`.

**Warm residual:** WARM-IGPU-1 closed; solo stall = WARM-SOLO-1 ([plan](./planning/warm-igpu-1.md)).

**Art pass.** ART-PASS-CLASSIC-1 **complete** (L1 `316c74f` · L2 `beebe81` · L3 `d59fd92` ·
L5 `5fc1c1e` correctness-only; L4 dropped → CLAD-REPEAT-1). All three arenas audited
([cart-rave](./planning/art-audit-cart-rave.md) · [storerooms](./planning/art-audit-storerooms.md) ·
[sundial](./planning/art-audit-sundial.md)) — confidence differs per doc, respect the
`[unverified]` markers; Sundial is leads, not findings. **Storerooms item 1 (`ef5b35e`) — visual
debt settled 08-02.** It shipped on code verification alone because `?shot=storerooms` does not
frame the shelf walls; a before/after aimed square at the side-0 wall
(`node tools/shoot-gpu.mjs --shot storerooms --cam "-12,5.3,44,-12,5.3,55"`, ANGLE/D3D11 RTX 4090)
shows **0 of 60 in-frame slots stocked before, 42 after** — five levels of bare board becoming a
stocked wall, with the amplified ×4 diff black except for the new cartons. Real look win, recorded
in the audit. **Caveat:** `skipThreshold` was not retuned, so the wall went ~329 → ~612 boxes —
*filled in is not final density*, and the audit's retune stays open. **SHELF-PICK-1 closed 08-02**
— the `pick` colour hash at `:2057` carried the same negative-modulo bug and `ef5b35e` had not
fixed it; one line, verified on the same camera (12 cartons recolour, **zero** geometry change —
the right signature for a colour-only fix). Arena-wide blue 111 → 208 slots, beige 301 → 204, red
unchanged at 200 (`pick === 0` is the one bucket JS `%` never mis-signs, which is why the bug hid).
Both halves of audit item 1 are now shipped **and** looked at. **Item 3 (floor-decal LOD) fixed
08-02** — the decals registered as a group left at the origin, so `updateLevelLod` was testing
camera-to-arena-*centre* and blinking all ~22 fall markings together; now per-mesh, `far` unchanged.
Live A/B: LOD node count **4 → 25**. Split out as **LOD-UNCANNY-1 · LOD-PITRING-1 · LOD-CLOCK-1**.
**Carry this forward: `updateLevelLod` does not run in the `shoot-gpu` attract path** (proved — props
past their `far` still draw at 41 m and 52 m from centre), so LOD changes cannot be verified by
capture. Use the node-count probe + unit tests, and a real match for the in-frame read.
**Item 2 (pile spotlight) fixed 08-02** — the emissive fixture sat *inside* the dead ceiling panel
for cell (2,2) with 5 mm clearance, so the flicker rendered to nobody; dropped to `CEILING_Y - 0.75`
with a U-channel housing and stems. Captured from under the pile: dark slab → visible work light.
Side-effect check on the pile itself came back black-but-for-dust, so no intensity retune.
**Item 5 (suction telegraph) fixed 08-02** — the ring's inner fade zeroed the glow across exactly
the 0.9 m where suction is 63–100% of peak, and the flat annulus floated ~0.5 m over the sloping
chamfer (hidden only *because* the alpha was zero there, so the two had to move together). Now a
tessellated annulus taking Y from `getFloorSurfaceY`, plus `mix(0.50, 1.0, …)` so the lip holds half
strength. Brightness measured, not assumed: frame mean **+0.22%** against a **0.02%** noise floor —
not strict parity, and strict parity would have cost ~a third of the ring's output. **Owed: Wyatt
playtest — item 5 — does the lip band read as "committed" without becoming a game marker.**
**Item 4 (shelf steel) done 08-02** — gated on a capture first per the L4 lesson, and it **passed
the gate**: head-on the new cartons do hide the racking, but from a reachable chase position along
the run the steel is ~40% of frame with 74 flat untextured uprights. Authored a **new**
`buildShelfSteelTexture()` (the shared furniture `metal` builder feeds the pile and was left alone)
plus **world-scaled UVs** via a new optional `uvMeters` on `pushFadeBox` — without those the map was
meaningless, since a unit-box clone keeps 0..1 UVs on a 0.16 m upright and a 114 m board alike.
Brightness measured both ways because §8 forbids darkening this arena: **−4.94%** in the steel-heavy
frame, **−0.03%** (noise floor) from the arena bookmark. Split out: **SHELF-RAIL-1** (booth rails +
per-bay board segmentation). **All five Storerooms pass items are now closed.**

### Do not

Standing prohibitions — fed into [BRIEFING.md](./BRIEFING.md) and the Command Center firewall.

- **Plan → Wyatt ack → apply.** BRIEFING's active-card heading names the card — it is **not** a green light to edit. No multi-file or behavior-changing work without an explicit ack, even when the card looks obvious.
- Ship only on Wyatt's explicit "ship it" — and never `git add -A` (concurrent agent sessions).
- One card / one lever at a time; new ideas go to [BACKLOG](./planning/BACKLOG.md), not into scope.
- Do not advance the ▶ phase marker — Wyatt only; agents report eligibility.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH) without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.

### Done when (Playtesting & stabilization)

- [x] Run 7 playtest mission closed (P0–P6 · NH · NET-1 · LS-1 · RC-1 A/B/C · CAM-1 · HUD-MENU-1)
- [x] **NET-2** quickplay/mid-join cart driveable without long freeze — Wyatt PASS (~3s to drive)
- [x] **NET-MIG-3** host-migration ghost feel — Wyatt PASS + live deploy verified
- [x] **NET-PRES-1** fall/collision event-id dedupe (duplicate face) — code landed; loss-on-drop residual accepted
- [x] **NET-SD-1** sole-leader SD self-fall / untied wipeout — crowns fallback winner
- [ ] Stabilization residual named by Wyatt (or explicit “no active card / wait”)
- [ ] Phase exit only on Wyatt instruction → Release candidate

### Active queue (strict — one at a time)

Live queue = [SHIP-1.md](./planning/SHIP-1.md) tiers; Run 7 is archived evidence.

Closed 07-21→07-31 (incl. ANLX-* · SEC-* · SHEET-1 · HUD-FEED/MENU-HINT/HUD-CHIPS · HOST-CAP-1 ·
BOOT-PERF-1 · Run 7 strip) → [completed-work.md](./planning/completed-work.md). Live only below.

| # | What | Status |
|---|------|--------|
| **LOD-CLOCK-1** | level LOD throttle uses host-adjusted time | ✅ **SHIPPED 08-02** — `updateLevelLod(camera, now)`; stall unit test + main.js source assert. Applied, unpushed. |
| **ASSET-CACHE-1** | fixed-name assets 7d cache stale after deploy | ✅ **SHIPPED 08-02** — `shared/assetCache.js`; fixed-name → 1h + 5m SWR; hashed `/assets/*` unchanged. Applied, unpushed. |
| **QP-ORDER-1** | quickplay rotates sequential, not random | ▶ **ACTIVE 08-02** — next in A→B→C insert (Sundial still parked). |
| **ART-PASS-SUNDIAL-1** | Sundial art pass — 6 waves, one lever per commit | 🅿️ **PARKED 08-02** — for LOD-CLOCK-1 · ASSET-CACHE-1 · QP-ORDER-1 sequence; restore after C. Step 0 done; Wave 1 sky-gradient remap owns waterline red step +128/+110. [audit](./planning/art-audit-sundial.md). |
| **DIAG-TIER-1** | capture `runtime.qualityTier` reports effective tier | ✅ **SHIPPED 08-02** — three fields on real runtime probe; `tests/gameplayDiagnostics.runtime.test.js` ×3. Applied, unpushed. |
| **FIGHT-VERIFY-1** | owed fight-night verification | 🟢 **agent half DONE** 08-01 — podium/loadshots/states + focus-ring. Residual = **Playtest owed** cards (BACKLOG) — console-seeded; not this parent row. |
| **HOST-CAP-1** | weak-host toast residual | ✅ **SHIPPED** 08-01 — `score < 50` once/hostship; prod Version `76ebdc37` (HEAD `423008f`) |
| **BOOT-PERF-1** | idle warm gen-cancel | ✅ **SHIPPED** 08-01 — mid-flight retarget; same deploy |
| MAIN-1 / BUNDLE-1 | main.js seam / code-split | 📋 post-gate |
| BRAND-1 | Domain cutover | 🧊 frozen |

### Next actions

1. **QP-ORDER-1** (active) → then restore **ART-PASS-SUNDIAL-1**.
1b. Closed 08-02: **LOD-CLOCK-1** · **ASSET-CACHE-1**. **ART-PASS-SUNDIAL-1 parked** — Wave 1 when restored.
1c. **ROUND-WEDGE-1 parked 08-02** for the Sundial pass. Phase A shipped `d4a7718`; Phase B needs its own ack.
2. **Playtest console** — owed cards in BACKLOG `## Playtest owed (08-01 session)`.
3. Closed 08-01 Wyatt PASS: **PAUSE-ROW-1** · **MENU-CMD-FEEL-1** · **FOCUS-CYAN-1**.
   Still open tooling: **HARNESS-FRIENDS-1**.
   Closed 08-02: **DIAG-TIER-1** · **LOD-CLOCK-1** · **ASSET-CACHE-1**.

**07-31 lesson (short):** verification tools only see branches they enter — add the matching
viewport/pointer cell in the same commit as any scoped CSS. Prefer one real clip when it
disagrees with a green sweep.

**08-01 lesson:** the focus-ring bug (`e5efbfe`) was found by *reading the cascade while
planning*, before a line of tooling existed — an unscoped `!important` in `loadingScreen.css`
had silently outranked every designed focus state game-wide. Two of the three biggest finds
this pass (that, plus MENU-CMD-FEEL-1) are rules that are *present and dead*, which geometry
sign-off cannot see. Assert the **delta**, not the declaration.

**Do-not-relearn (short):** `?devUnlocks=off` is a **prod** lever (never DEV-gate). Don’t grep
`dist/` for `devUnlocks` or minified `min-width:` (range syntax). Pass `isDev` into helpers under
test. Forward DO 429s from Worker log routes. `rewindRoundClock(ms)` **sets remaining**. Analytics
list = newest 1000 rows only — bucket by day; prove gates with live `__ccDiag.snapshot("analytics")`.
Measure wrap height into CSS vars (`--cr-hintbar-h`). Absolute children of `overflow-y:auto`
scroll with content → use `fixed` for chrome. Flex `nowrap` + all `flex-shrink:0` needs a **row**
`max-width` before ellipsis works.

**Open High:** ROUND-WEDGE-1 · UI-SCALE-1 · FIGHT-VERIFY-1 · RESULTS-1 · CART-MODEL-1 · bloom.

## Open issues (top)

Full categorized backlog: [planning/BACKLOG.md](./planning/BACKLOG.md).  
Closed IDs (NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1, VFX-1, PLAY-1, …) live in
[completed-work.md](./planning/completed-work.md) — not here.

| ID | Issue | Status |
|----|--------|--------|
| ROUND-WEDGE-1 | Host-hide → MAX reject → podium⇄running storm | 🚫 **parked 08-02** (Sundial pass) — Phase A **shipped** `d4a7718`, `pausedWallMs` MAX-only in `roundValidation.ts` (+tests); MIN wall latch frozen. Does **not** claim cap-217 closed; Phase B deferred. |
| WARM-SOLO-1 | Solo post-`carts-ready` stall (WARM-IGPU residual) | 📋 telemetry-gated — [warm-igpu-1.md](./planning/warm-igpu-1.md) |
| MAIN-1 | Carve `main.js` seam (enables BUNDLE-1) | 📋 Post-gate |
| BUNDLE-1 | Menu/game code-split | 🚫 Blocked on MAIN-1 |
| BRAND-1 | Domain / Worker cutover | 🧊 Frozen until deliberate cutover ([brand.md](./brand.md)) |

## Recommended next milestone

**Stabilize in place** — keep Playtesting & stabilization until Wyatt advances. Completed
evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1) stays on the board as proof, not as RC entry.
When named: other residual or RC exit criteria in [ROADMAP.md](./planning/ROADMAP.md).

## Decision index

One line each; full text in [archive/decision-log-2026-07.md](./archive/decision-log-2026-07.md). Newest first.

- **D-SUNDIAL-OQ6** (08-02): **Low is a shipping look.** Sundial Wave 2 water is authored to
  survive Low (touch default; today Low drops the hologram, all four ocean detail systems and
  both golden-hour signatures — see the HIGH/LOW A/B in `.diag-captures/sundial-LOW-*.png`).
  Audit item 36 moves up out of Wave 6.

- **D-ROUND-WEDGE-1-A** (08-01): Host-hide MAX cushion = server `pausedWallMs` (sum of committed
  host-domain `startedAtMs` increases on running→running). MAX reject only when
  `now - runningAnchor - pausedWallMs > ROUND_DURATION_MS + 15_000` (non-SD). MIN stays
  wall-only (`now - runningAnchor`). No shared-anchor bump; Phase B client breaker separate.

- **D-BOOT-PERF-1** (07-31): Idle warm not sticky-first-wins — mid-flight picker bumps gen;
  stale flight must not latch done; newer serializes after prior. Tab/suppress unchanged.

- **D-HOST-CAP-1** (07-31): Weak-host toast = local host + join-time `score < 50` only
  (strict `<`; neutral 50 silent); once per hostship. Min-spec = accepted fact.

- **D-ANLX-BULK-1** (07-31): Short scripted match ends (tool/diag on prod) are non-product.
  Product metrics = `matchesByArena` / mode / result with `duration_ms >= MIN_MATCH_DURATION_MS`
  (3000) and non-null; byName + window stay raw (P-A). Client skips non-null short
  `match_ended` only — do not also drop null duration in the same change. Shared constant in
  `shared/analyticsConstants.js`, not `roundConstants.js`.

- **D-SHEET-1** (07-31): A verification tool must prove its subject is present, not merely
  that it ran. `npm run sheet` twice shipped green cells that showed the wrong thing — one
  captured the PAUSE overlay (the store pin survives pausing, so all checks passed), and
  every early cell showed an empty kill feed that read as "fine" when it meant UNVERIFIED
  (`.hud-feed` is `display:none` while empty). Hence the subject-is-HUD gate and the DEV-only
  `forceKillFeed` lever. Corollary accepted: cross-run image MAE can never gate this tool —
  opponent names and the directive are randomised per run and there is no gameplay RNG seed,
  so the DOM pin is the gate and MAE is printed only.

- **D-CARGO-VIS-1** (07-30): The CARGO-WT-1-era "pile stays under the rim" invariant is
  reversed — a boss/full bay is SUPPOSED to crest the rim. Layer-2 grid slots solve against
  bay-local `rimY` (from `box.max.y`, minus bay parent offset); do not "fix" the pile back
  under the rim.
- **07-20 → 07-23 (D-FIGHTNIGHT-1 · D-HIT-FEEL-1 · D-HIT-FEEL-QUEUE-1 · D-ARENA-COL-1 · D-MPFX-1 · D-COUNTDOWN-1 · D-ARCH-1 · D-PARITY-1 · D-COUNTDOWN-SYNC-1-CLOCK · D-COUNTDOWN-WARM-1 · D-COUNTDOWN-SYNC-1 · D-HOSTHITCH-1 · D-SHIP-1 · D-TRUTH-1 · D-READY-1)** — rolled out of this index 08-01; full text
  preserved verbatim in [decision-log-2026-07.md](./archive/decision-log-2026-07.md).
- **D-FRIENDS-REJOIN-1** (08-01): Friends-room refresh keeps explicit **JOIN LOBBY** (no
  quickplay-style auto-rejoin). Private rooms stay opt-in; only `?room=quickplay` auto-rejoins
  when a username is saved (`main.js` ~1849–1859). Audit finding closed as accepted UX — do not
  “fix” parity without a new product call.
- **07-11 → 07-17 (D-CONTENT-1 · D-HARDEN-1 · D-NET-CLK-MIG · D-TERM-1 · D-STAB-1/2 ·
  D-PERF-1/2/3 · D-GP4-1 · D-VFX-1/2 · D-VIS-1/2/3 · D-DOC-1)** — rolled out of this index
  07-31; full text in [decision-log-2026-07.md](./archive/decision-log-2026-07.md), which
  gained verbatim entries for the four that had none.

## Hard rules digest

- Do not re-open items under **Verified healthy / non-issues** in [project-state.md §5](./planning/project-state.md) without new evidence.
- Naming: UI says Cart Clash; storage/Worker IDs stay `cartRave*` until deliberate migration.
- Solo polish before deep multiplayer features (ROADMAP philosophy).
- No silent pure-black WebGL frames as an accepted “look”.
- Prefer quality-preserving perf fixes; measure before and after.
- Behavior-changing work requires a human playtest before it counts as done.
- **Phase marker is manual** — agents report eligibility; Wyatt advances ▶.

## Gotchas (append-only)

- EffectComposer path, DEFAULT (`?bloompipe=display`): RenderPass → OutputPass → Bloom → Arcade(VHS) → FXAA. `?bloompipe=hdr` swaps to Bloom → OutputPass; OutputPass is never last in either. `renderer.toneMapping` is a no-op into composer RTs without OutputPass — except on the lowest tier, which bypasses the composer entirely (`composerBypass`) and tone-maps natively.
- VHS is level-gated via `uVhsAmount` (Storerooms only); `?ablate=vhs` zeros the uniform without killing arcade CRT.
- Half-res bloom RTs: strength compensated via `bloomHalfResStrengthMul`.
- Hidden-tab rAF freezes the loop unless `?perfPump` (DEV) is set — shoot tools should pass it.
- **Joining quickplay mid-round runs a cold world bootstrap that blocks the main thread;** resume-guard (`dt>0.25s → accumulator=0`) can starve input sampling → cart frozen at spawn until clear. This is NET-2 class — harness documents it ([guides/netcode-harness.md](./guides/netcode-harness.md)).
- **Netcode 2-client rig:** two clients MUST be separate `chromium.launch()` processes; add per-page focus + `?perfPump`. Prefer persistent `npm run dev:local` via `--url`.
- `localStorage` keys remain `cartRave*` until brand migration.
- Rapier WASM: standard build default; SIMD opt-in only (borrow error).
- Concurrent agent sessions may `git add -A` — commit surgically when working alongside one.
- Diagnostics globals namespace is `__cc*` (`__ccTest` / `__ccDiag` / `__ccLoopDbg`).
- **`window.__cartRavePerf.scene` is DEV-ONLY** (`main.js:1543`) — in prod it does not exist, so scene-graph probes silently return empty and read as "not built". `import("/src/…")` likewise only resolves against the dev server. **Verify prod visually** (screenshot + build stamp), not by scene introspection; `__cartRave.stats()` drawCalls often reads 1 after a settle.
- A round that ends with **no scores is a legitimate draw** → neither `victory` nor `defeat`.
- Rapier `world.castRay(...)` reads `.handle` off the exclude args — pass Collider/RigidBody objects, never raw handles.
- **`MSG.readyToggle` without a `ready` field is a TOGGLE** — programmatic ready must send `{ ready: true }`.
- `material.envMapIntensity` is a **no-op against `scene.environment`** in this three version — only `scene.environmentIntensity` or a material-owned `envMap` scales IBL.
- Battery reports without provenance are visible history only — never green readiness evidence. Prefer complete exact-HEAD runs.
- **Before any public / external-tester playtest: reset the analytics DO** so aggregates are not polluted by dev/harness traffic. Token-gated (SEC-TOKEN-1): `DELETE` with `Authorization: Bearer <ERROR_LOG_TOKEN>` on `/api/analytics` (same secret as `analytics:pull`; never `?token=`). Then re-pull / dashboard after the playtest window.
- **Stop-hook `stop_hook_active` is inverted from the obvious reading:** `true` means "already continuing because of a prior block" → **return success / do not re-block**; `false` is the normal first Stop where the guard should run. Verified against the shipped `claude` binary, not the docs — `WebFetch` summarized a truncated docs page and confidently reported the opposite polarity *and* a wrong block cap (real cap is 8, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Inverting it disables the guard on every normal turn while still looking wired up. Grep the binary before trusting a doc summary on hook payload semantics.
- **`.claude/settings.json` is strict JSON, not JSONC** — a `//` comment there can fail parsing and silently drop *every* hook in the file. Caveats belong in the hook headers and AGENTS.md § Enforcement.
- **Claude Code permission rules are globs, never regex** — `|` alternation inside `Bash(...)` matches nothing. A space before `*` enforces a word boundary (`Bash(ls *)` ≠ `lsof`), rules match each `&&`/`;`/`|` subcommand independently, and a broad deny beats a narrower allow.

## Last updated

2026-08-02 (ASSET-CACHE-1) — `assetCacheControlForPath` in `shared/assetCache.js`; fixed-name
models/sounds/fonts → `max-age=3600, stale-while-revalidate=300`; hashed `/assets/*` stay
1y immutable. QP-ORDER-1 next. Applied, unpushed.

2026-08-02 (LOD-CLOCK-1) — `updateLevelLod(camera, now)` so host-clock corrections cannot stall
LOD throttle. Stall unit test + main.js source assert. Applied, unpushed.

2026-08-02 (DIAG-TIER-1) — Runtime probe reports effective `qualityTier` + `qualityTierStored` +
`qualityTierOverride`. Real-probe tests ×3. ART-PASS-SUNDIAL-1 re-active after brief park.
Applied, unpushed.

2026-08-01 (tooling stabilization + enforcement hooks) — gates read-only; tracked
`tools/git-hooks/`; session-scoped Stop/GIT-INDEX guards; `verify:head`. Full text:
[archive/status-log-2026-08-01-tooling.md](./archive/status-log-2026-08-01-tooling.md).

2026-08-01 (three skills vendored: brainstorming · writing-skills · systematic-debugging) —
all adapted from obra/superpowers into `.agents/skills/` and heavily trimmed; escalation
ladder step (3) now names systematic-debugging; `npm run skills:sync` + the `SKILLS_UNSYNCED`
health gate keep the gitignored `.claude/skills/` mirror honest (CI-skipped). Load-bearing
rules + scoping decisions: [archive/status-log-2026-08-01-skills.md](./archive/status-log-2026-08-01-skills.md).

2026-08-01 (playtest console seeded) — BACKLOG `## Playtest owed (08-01 session)` carries
10 `Owed: Wyatt playtest` cards (RESULTS-ACT-1 · FV-* · HOST-TOAST-1). Regen:
`npm run playtest:console`. FIGHT-VERIFY parent no longer seeds the console.

2026-08-01 earlier (HOST-CAP-1 + BOOT-PERF-1 shipped; FIGHT-VERIFY-1 agent half closed) —
Shipped HEAD `423008f` / Worker Version `76ebdc37`. Full battery green 6/6
(`battery-2026-08-01T03-31-21-188Z.json`). Playtest console auto-seeds from STATUS/BACKLOG.
STATUS size trim; INPUT-KB-1 closed. FIGHT-VERIFY agent half: four phases
(`e5efbfe` · `533afa9` podium · `37a232a` loadshots · `9f5c9b5` states).

> **Older entries are archived — search them when you need history this file no longer carries.**
> Index with date ranges: [archive/README.md](./archive/README.md).
> - 2026-08-01 tooling — [archive/status-log-2026-08-01-tooling.md](./archive/status-log-2026-08-01-tooling.md) (gates read-only · git-hooks · Stop/GIT-INDEX guards)
> - 2026-07-30 → 07-31 — [archive/status-log-2026-07-30-to-31.md](./archive/status-log-2026-07-30-to-31.md) (HUD phone PASS · seven-card 07-30 closeout; full 07-30 day log linked inside)
> - 2026-07-23 — [archive/status-log-2026-07-23.md](./archive/status-log-2026-07-23.md) (Fight Night UI redesign merged `56dfa61` + deployed; owed prod verification → FIGHT-VERIFY-1; MP confetti/wilt parked)
> - 2026-07-22 — [archive/status-log-2026-07-22.md](./archive/status-log-2026-07-22.md) (AI-DIFF-1 ship · ANLX-VIEW-1 · COUNTDOWN-ARM-1 · A6b false green + fix · plan→ack firewall)
> - 2026-07-21 — [archive/status-log-2026-07-21.md](./archive/status-log-2026-07-21.md) (ARCH · PARITY · PERF-WARM root cause + reverted gate · WRAP · COUNTDOWN-ABORT-1)
> - 2026-07-20 → 07-21 — [archive/status-log-2026-07-20-to-21.md](./archive/status-log-2026-07-20-to-21.md)
> - 2026-07-19 → 07-20 — [archive/status-log-2026-07-19-to-20.md](./archive/status-log-2026-07-19-to-20.md)
> - 2026-07-16 → 07-18 — [archive/status-log-2026-07-16-to-18.md](./archive/status-log-2026-07-16-to-18.md)
> - 2026-07-14 → 07-15 — [archive/status-log-2026-07-14-to-15.md](./archive/status-log-2026-07-14-to-15.md)
>
> They are history, not current truth — `git log` and the code are authoritative.
