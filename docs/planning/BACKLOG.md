# Cart Clash — Backlog (open work only)

**What is this?** Every known **open** item, deduplicated — grouped by discipline, prioritized.
**Why does it exist?** So open work lives in one place instead of scattered tables.
**Who should read it?** Whoever is picking the next piece of work.
**Related:** [STATUS.md](../STATUS.md) (declared phase + focus), [ROADMAP.md](./ROADMAP.md)
(phase definitions), [completed-work.md](./completed-work.md) (shipped),
[netcode-deep-dive.md](./netcode-deep-dive.md) (hazard writeups).

### House rules (BACKLOG-GATE-1, 08-06)

The 08-06 audit found five ways this file had drifted from itself — a stale glance box, four
closed cards left as stub rows, a duplicate-subject card, a "fully drained" block that wasn't, a
row claiming "awaiting playtest" after the Work order recorded it closed. `npm run health:check`
now catches the **mechanical** subset of that (see `validateBacklogHygiene` in
[projectHealthValidation.mjs](../../tools/lib/projectHealthValidation.mjs)) — everything below is
the part a gate can't hold, which is why it's written down instead:

- **One card = one row = one source of truth.**
- **Closing a card = delete its row + write it up in [completed-work.md](./completed-work.md) +
  add its ID to the [closed do-not-reopen list](#closed--do-not-reopen-reference), same session.**
  Skip the third step and the gate goes blind for that ID forever.
- **The row deletion rides in the SAME commit as the code** (BACKLOG-GATE-3, 08-07) — not in a
  later docs sweep. Between the fix landing and the row disappearing, this file says the card is
  open, and whoever cold-starts in that window picks work that is already done. It happened twice
  in two days: SPAWN-SUNDIAL-GAP-1 shipped 08-06 in `92c44f2` under *another card's subject* and
  sat open until 08-07, and HOLE-FRICTION-COMBINE-1's row was still here while its fix and its
  PASS were both already committed. With two agents running, that window is the whole failure.
- **One card ID per code commit subject.** Two claims in one commit is how an ID lands on a diff
  that does not contain its change — `c8f65d8` advertised "bump zanzibar gap to 3.75" while
  holding only CSS and a test, so `git log --grep` answered for a fix that was somewhere else.
  The `commit-msg` hook now refuses this shape; docs commits may still name every card they close.
- **Every row carries an ID, including prose-named ones.** An ID is the only join key
  `npm run backlog:audit` has — a row named only in prose is invisible to it forever.
- **Grep the file for your subject before filing a new ID.** The gate cannot catch a duplicate
  subject under a different name — KBM-TOAST-1 shipped as a fresh card for CSS STATES-DEAD-1
  already owned.
- **Work-order blocks are order only, never state.** State lives in the row; a block claiming
  "fully drained" is prose, not a check. Blocks are **1–7 high→low** (NOW → LATER); closed
  cards leave the index the same session their row is retired — do not keep strike archaeology.
- **Notes are a brief, not an essay.** Long is fine when the card needs it; padding is not.
- **The glance box is generated — `npm run backlog`, never hand-edit it.** `health:check` fails if
  it's stale; the command fixes that in one write.
- **Run `npm run backlog:audit` at wave end.** It asks git whether an open row's own cited lever
  has already been touched under some other card's name — the one thing no markdown check can see.
  It is a report, not a gate, and deliberately not in `npm run qa`: measured precision is roughly
  one real hit per six, which is fine for a human reading ten lines and fatal for a blocking gate.

### Status at a glance

*(The Work-order Block/State table just below is hand-maintained — kept in sync by whoever closes
or reorders a card, same as before. The Department table further down is different: it's generated,
see its own marker comment, and `health:check` gates its freshness — it cannot silently drift the
way the Block table still can.)*

**Work order — high priority → low**, block by block (open cards only; closed history lives in
[completed-work.md](./completed-work.md)):

| Block | State | Next action |
|-------|-------|-------------|
| **1** — NOW (player-facing correctness) | ✅ clear | RAPIER-MAJOR-1 + RAPIER-MAJOR-PT-2 closed 08-13 |
| **2** — PRE-SHIP (before public post) | ✅ clear | NPC-BOOST cluster closed 08-11 |
| **3** — WYATT LANE (blocked on you) | 👤 ongoing | ANNOUNCER-RERECORD-1 · SHIP-1 D-tier cut/keep |
| **4** — PERF RESIDUAL (measure-first) | 🟡 queued | WARM-SOLO-1 · PERF-WATCH-1 · NET-PERF-1 |
| **5** — SWEEP (cheap Lows) | ✅ clear | Closed 08-11 |
| **6** — LAUNCH DAY | ⏳ waiting | **SHARD-PT-2** — 5th concurrent human → `quickplay2` (needs real traffic) |
| **7** — LATER (post-launch / parked) | 🧊 parked | TRUST-1 · leaderboard · BRAND-1 · taste-gated Design · Future Ideas · do-not-pick list |

**Department tables — how much open work is where** (🟢 = shippable, everything else needs work):

<!-- BEGIN GENERATED counts — npm run backlog. Do not hand-edit. -->
| Department | Open | High | Medium | Low |
|---|---:|---:|---:|---:|
| [Engineering](#engineering) | 17 | 0 | 4 | 12 (+1 partial) |
| [Art](#art) | 6 | 0 | 0 | 6 |
| [Audio](#audio) | 2 | 0 | 1 | 1 |
| [Design / Gameplay](#design--gameplay) | 7 | 0 | 2 | 5 |
| 🟢 [Playtest owed](#playtest-owed) | 9 | 0 | 6 | 3 |
| [Tech Debt](#tech-debt) | 12 | 0 | 4 | 8 |

**53 open rows total.**
<!-- END GENERATED counts -->

*(This box is generated by `npm run backlog` — BACKLOG-GATE-1, 08-06 — and cannot drift again by
construction; edit the department tables below and regenerate, never this block by hand. History:
it previously read 87 while Tech Debt was missing MONTAGE-ESC-1's High count entirely and
Engineering/UI-UX each carried a closed card in their High column. Four ✅-stub rows were deleted
the same pass — **NET-LOOK-ACC-1** · **LOAD-SCALE-1** · **TOUCH-HOVER-1** · **UI-SCALE-1** —
closures live in [completed-work.md](./completed-work.md), never as placeholder rows here.)*
Everything in **Playtest owed** already shipped — those rows are just waiting on Wyatt's eyes, not
on more engineering. That's usually the fastest place to look for "what do I personally need to go
do." **As of 08-07, ONBOARD-SIZE-PT-1 and SPAWN-SUNDIAL-GAP-1 PASSed and closed** (see
completed-work.md); the live `Owed:` markers left are SHARD-PT-2 (deferred to launch day) and
AQ-RING-CLEAR-1 (a reserve lever rather than a check).

---

Priorities: **Critical** = blocks Version 2 · **High** = should land before V2 ·
**Medium** = V2-window polish · **Low** = post-launch / opportunistic.

Completed rows are **not** kept here — move them to [completed-work.md](./completed-work.md).

**Playtest console seed:** when a shipped change still needs a human check, put
`Owed: Wyatt playtest — ID — one-line check` in the Notes cell (or STATUS active-queue status).
**Write the check for the person doing it, not for the agent that shipped it.** The console
renders the headline as the goal and each `<br>N.` segment as a numbered step, verbatim and
untruncated — so a card is exactly as clear as its Notes cell. Name what to look at and what
would count as wrong, in the words a player would use; keep file paths, function names and
commit hashes out of the steps and in the surrounding prose where they belong. If a card is
owed on a row whose Notes are an engineering writeup (STATUS open issues, say), put the
checklist on its **Playtest owed** row — the console prefers whichever row actually has steps.
`npm run dashboard` / `npm run playtest:console` rebuilds `.diag-captures/playtest-console.html`
from those phrases. Remove or rewrite to `Wyatt playtest PASS` when closed.
`health:check` fails `PLAYTEST_STEPLESS` (owed, no `<br>N.` steps) and
`PLAYTEST_PARENT_UNSEEDED` (a STATUS ✅ CLOSED row still says playtest is owed, but no
covering Playtest-owed card exists). Chat or STATUS "Playtest owed:" prose is not a seed.
**One issue per card — a card id is one thing Wyatt can pass or fail on its own.** Do not seed a
whole ship as a single multi-step card. MAIN-1's residual retest (08-04) put four separate fixes,
a regression sweep, a look judgement and a hitch hunt on **one** id, so a mixed result had nowhere
to go: it came back as an overall PASS carrying *"3 pass, but the toast is drawn under the boost
bar"* — a real defect (now **HUD-TOAST-Z-1**) riding inside a green verdict, invisible to the
tally and to every later regeneration. **Wyatt asked for this explicitly on 08-05:** he does not
want to pass most of a card while a few things inside it are broken. So a wave that ships four
fixes seeds **four cards**, one per fix, each with its own steps and its own verdict; shared setup
belongs in the card context or PREFLIGHT, not copied into each. Numbered `<br>N.` steps are the
sub-steps of **one** check (get here → do this → look at that), never a list of unrelated checks —
if two steps could disagree about PASS/FAIL, they are two cards.
The console sorts **solo-checkable cards first, two-machine cards last**. Rig is guessed from
the row text (`two clients`, `both machines`, `non-host`, …) and defaults to solo; tag the
Item cell `[solo]`/`[1pc]` or `[2pc]` to override the guess. Tag any row whose *steps* mention a
second client but whose *evidence* is single-machine — otherwise it sinks to the bottom unread.

**Do not re-add a closed ID without new evidence.** The full list (100+ IDs) moved out of the
way — it's an agent grep-target, not something a human needs to read top to bottom — see
[Closed / do-not-reopen reference](#closed--do-not-reopen-reference) at the very end of this file.

**Absorbed into another card, not closed on their own** (do not re-add as standalone rows):
**ART-MAT-1** → CART-MODEL-1 (closed 08-09) · **ONBOARD-1** → ONBOARD-SLIDES-1.

**Pre-ship 07-19 rows** tagged *(pre-ship 07-19)* are parked polish — pick up when Wyatt
names them; they do not auto-queue over STATUS.

**Pre-ship batch (07-31, Wyatt-named):** rows tagged `[pre-ship]` are **in scope before
ship** — not parked. Wyatt asked they all land pre-ship; priority still ranks order inside
that set.

**SHIP-1 tiers (07-20):** pre-ship ordering now lives in [SHIP-1.md](./SHIP-1.md).
Rows tagged `[SHIP-1 A–E]` are pre-ship, drained tier by tier; untagged rows default to
post-launch unless Wyatt pulls them forward.

---

## Work order (2026-08-07 — high → low)

**This index is order only** — card content stays in the department tables below (one card = one
row = one source of truth). Pick from the top open block; one card at a time; plan → ack per wave.
When a card closes: **delete its line here** the same session its department row is retired to
[completed-work.md](./completed-work.md). Do not leave closed archaeology in this index.

**How to read blocks:** 1 is what agents should start next; 3 is Wyatt-only; 6 waits for launch
traffic; 7 is post-launch or parked. Priority ranks *inside* a block too (top first).

**Block 1 — NOW (player-facing correctness / High).** Land these before polish.

**Block 2 — PRE-SHIP (should land before the public post).** Best-first among open Medium pre-ship work.

**Block 3 — WYATT LANE (off the agent queue until you unblock).**
- **Announcer re-records** `[SHIP-1 E3]`
- **SKYBOX-DIR-1** — keep / cut / re-author the space skybox.
- **CARGO-BAY-INSTANCE-1 stability call** — is cargo-bay fill pattern frozen enough to instance?
- **SHIP-1 D-tier** — cut persistent leaderboard from launch, or schedule its own phase. Decide once; deciding late is the only wrong option.

**Block 4 — PERF RESIDUAL (measure-first / instrument; not a reopen of PERF-PASS-1).**
1. **WARM-SOLO-1** — only on real weak-GPU telemetry.
2. **PERF-WATCH-1** — auto-quality step-up path decision.
3. **NET-PERF-1** residual / **NET-PERF-3** — only if F8 still shows rubber-band / alloc pressure.


**Block 5 — SWEEP (cheap Lows; one commit each).** Schedule against a quiet window; items that need a look end with you in-game.
5. Opportunistic Low neighbors when idle: **MOTION-A11Y-1** (needs definition of done first) · **COUNTDOWN-QUICKPLAY-1** · **countdown survives menu return** · **CHAL-PODIUM-DEDUPE-1** · **ZAN-BOLLARD-CLASS-1** (filed 08-13).

**Block 6 — LAUNCH DAY (cannot close before the public post).**
- **SHARD-PT-2** — 5th concurrent Quickplay human overflows to `quickplay2` instead of "couldn't join". Rig-proven 5/5; prefer analytics (`quickplay_shard_assigned` with `hops > 0` or non-default shard). Not a FAIL for lack of five people before launch day.

**Block 7 — LATER (post-launch / parked / do not pick now).**
- **TRUST-1** → persistent leaderboard / player stats `[SHIP-1 D]` (only if Block 3 keeps D in scope).
- **BRAND-1** — domain / rebrand ceremony (frozen until ship).
- Trigger-gated / instrument-gated: **SHADOW-HAZARD-SEAM-1** (next arena) · **AQ-RING-CLEAR-1** (reserve) · **PERF-9CELL-1** (parked with closed parent).
- Structure debt after multiplayer is proven: **DIR-1** · **GLTF-1** · **DUAL-1** · **TS-1** · **TOOL-1** · Vite chunk hint · **BACKLOG-GATE-2**.
- Art/background Lows: **CLAD-REPEAT-1** · **LOD-PITRING-1** · **SHELF-RAIL-1** · **ART-PALETTE-1** · sunglasses materials · asset filename rebrand · **ART-LUMA-TOOL-1**.
- Taste-gated Design / Future Ideas rows — only on new evidence or explicit pull-forward.
- **SHIP-1** living checklist row stays as the ship-doc pointer until ship.

---
## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| Low | MOTION-A11Y-1 — `prefers-reduced-motion` doesn't actually reduce any motion | **Filed 08-05, spun out of TIER-DEFAULT-1's lever 4.** The OS accessibility flag was, until TIER-DEFAULT-1 closed, silently forcing the graphics quality tier to Low (cap-287/288: the same Intel box booted Low with Windows animations on and Medium with them off). TIER-DEFAULT-1 fixed the *tier* side (reduced-motion now demotes one rung inside `defaultTierForCaps()` — [gpuCaps.js](../../src/utils/gpuCaps.js) — instead of hard-pinning Low), but that was always an interim: reduced-motion should reduce **motion**, not graphics fidelity. Nothing currently reads the flag for motion at all. Candidates once picked up: attract-camera spin/drift, cart-impact screen shake, KO/win screen flash, any continuous idle animation loop. Needs a definition-of-done pass (which motions, how much) before it's a code card. |
| Low | COUNTDOWN-QUICKPLAY-1 — empty quickplay countdown connect-wait edge case | In empty quickplay games, countdown either waits for player connection before starting or skips part of it. Documented from F8 captures (184–196); parked in backlog per Wyatt (07-22). |
| 🟡 Partial | NET-PERF-1 — reconcile rewind-replay cost | Caps shipped; residual if retest still rubber-bands. |
| Low | NET-PERF-3 — p2p per-message buffer copy | Only batch if F8 shows alloc pressure after NET-PERF-1. |
| Low | COUNTDOWN-LEAK-1 — Countdown timer survives menu return *(pre-ship 07-19)* | Stale countdown UI on main menu. |
| Medium | WARM-SOLO-1 — solo post-`carts-ready` stall (WARM-IGPU-1 residual) | Laptop A cap-206 (**solo**) took a 6.4s longtask ~1.9s after `carts-ready`, inside the countdown. WARM-IGPU-1's Lever A does **not** cover it: arena rotation is quickplay-only, and solo's flyover warm already runs inside `ensureSessionCartsReady`. Proxy evidence says the residual is driver-side first-draw cost (a 13.1s menu-warm frame carried only 235ms of attributed span time), so raising budgets will not help. Candidate mechanism worth checking first: scene content added *after* the warm pass (CSS2D nametags, cargo bays — CARGO-RACE-1's self-heal adds 18–30 meshes per cart, announcer/VFX) introduces new materials whose programs link at the first live countdown draw. **Work only on real telemetry** (`warmupSettle` / longframe spans from a weak-GPU playtester), never on speculation — no iGPU hardware available to reproduce. |
| Medium | PERF-WATCH-1 — auto-quality step-up path | Watchdog demotion is irreversible per session (no step-up anywhere; DEV-only warn; 2 tier steps + 2 renderScale steps; attract render-cost and game frame-delta both judged against one 20.5ms bar). Decide after WARM-IGPU-1 P0b telemetry shows how often it bites. |
| Medium | PARTY-SERIALIZE-1 — `structuredClone` → flat serializer in `party/index.ts` | Only after profiling shows it matters. |
| Medium | LEADERBOARD-1 — Persistent leaderboard / player stats `[SHIP-1 D2]` | Needs TRUST-1. |
| Low | QP-ROTATE-PT-1 — Quickplay rotation live 2-browser check | Reconfirm after **QP-ORDER-1** (sequential rotation). Live multi-client smoke only. |
| Low | CONN-DEADCODE-1 — dead code in `party/index.ts` | Remove unused `#clamp`, the `void reaped/reconciled` no-ops, and unused teardown return values. Grep tests for return-value assertions first. Filed from the 08-12 prod-surface audit. |
| Low | CONN-SNAPSHOT-PURE-1 — `#snapshot()` has a side effect | It calls `#ensureLiveHost()`, which can broadcast and reset the round. Redundant at its single call site (`onConnect` repairs host just before). Remove the internal call; add a pre-snapshot-repair comment at the call site. |
| Low | CONN-SPAWN-SANITIZE-1 — `hostSpawn` carts stored unvalidated | Server keeps host-supplied `carts` verbatim and echoes it into late-join hellos. Sanitize permissively (require `p` only, length ≤ 4). Bounded by WS_SIGNALING_MAX today. |
| Low | SNAP-SPARSE-1 — sparse cart slots emit a phantom cart at origin | `hostSendTick` leaves holes in the carts array; the encoder turns a hole into a zeroed cart. Add a session-scoped warning guard; a protocol-level present-bitmask is the real fix. |
| Low | CONN-SOURCETRUTH-1 — two connection sources of truth | `#connections` vs `getConnections()` reconciled by hand in several paths. Consolidate. |
| Low | PARTY-ENVTYPE-1 — untyped `Env` bindings | `env: Record<string, any>` in Worker/DO. A typo in a binding name is a runtime 500. Add a typed interface. |
| Low | ZAN-BOLLARD-CLASS-1 — Sundial bollards + gnomon classify as "floor", not "edge" | **Filed 08-13 from the Sundial audit.** Deck bollards and the gnomon ride `recordColliderHandles` → `classifyEnvironmentCollision` (simulation.js:3175) maps them to "floor" while booth legs are "edge" — contradicts the file's own convention. Near-zero impact (playFloorImpact ≈ playEdgeImpact); classification-only. |


## Art

| Pri | Item | Notes |
|-----|------|-------|

| Low | CLAD-REPEAT-1 — stand cladding shares one repeat across three deck radii | **Was ART-PASS-CLASSIC-1 L4; dropped 08-01 and demoted, because the surface is barely visible.** The defect is real and measured: one `panelTex.repeat.set(24, 3)` (`effects.js:1441`) feeds one shared `cladMat` across three decks (`effects.js:1454`) whose r1 = 73/100/124 m and wallH = 12.2/10.6/9.8 m, so the authored 2:1 cart-silhouette motif renders **2.09×0.22 m on deck 0 and 3.55×0.18 m on deck 2** — 4.7× and 9.9× distorted, and inconsistent between rings. **Why it was dropped:** cladding sits at `deck.r1 + 0.55`, directly behind seating spanning r0→r1, so from every in-arena viewpoint tried the crowd and seats occlude it; a before/after GPU capture showed *zero* delta on the cladding itself (the 31% pixel diff was animated-crowd noise). A surface you cannot see does not earn a mid-table slot. Fix if ever picked up: per-deck material+texture clone like the seat loop (`effects.js:990`), `U = round(circumference / wallH)`, `V = 1` — the largest square tile each wall fits. |
| Low | LOD-PITRING-1 — the pit-ring dressing's cull radius is arguably inverted | **Filed 08-02**, split out of audit item 3. `registerLevelLodNode(pitDressing.group, { far: 48 })` — but `buildPitRingDressing` lays its silhouettes on a band at `OUT = 45.5` m radius ([backroomsSupermarket.js:2205](../../src/levels/backroomsSupermarket.js:2205)) around a group at the origin. So the ring is visible while the camera is near arena centre (far from the dressing) and **hides once the camera passes 48 m from centre — i.e. exactly when it gets close to part of the ring.** Distance-to-centre is the wrong metric for a ring centred on that point; the pit dressing either wants per-cluster nodes (one per side) or no LOD at all, since it is a handful of merged silhouettes. `doorways` (far 55, on the walls at 56) has the same shape and should be judged in the same pass. Lower priority than LOD-UNCANNY-1 because this is background dressing beyond the kill edge, not a fall marking. |
| Low | SHELF-RAIL-1 — the booth rails are the shiniest thing in a dead room | **Filed 08-02**, split out of audit item 4 rather than folded in as a silent ride-along. `railMat` ([backroomsSupermarket.js:2948](../../src/levels/backroomsSupermarket.js:2948)) is the **booth** rails, a different surface from the shelf steel, and separately the lowest-roughness / highest-metalness pair in the file — so under the RoomEnvironment PMREM it reads as polished chrome in a room where nothing else is polished. Item 4's new `buildShelfSteelTexture()` is a natural donor, but the rails also want their own roughness call, and doing both in one commit would have made the item-4 capture ambiguous. Also parked here: **per-bay board segmentation** (break each 114 m shelf board into bays with a 4 cm gap so the run reads as bolted sections) — a geometry/merge change, not a material one, and the audit lists it under the same item. |
| Low | ART-LUMA-TOOL-1 — luma metric in `npm run compare` | Rule 3's luma floors were computed with a one-off scratchpad script because `tools/` is frozen during a game card. Fold a darkest-decile / median / mean luma readout into [compare.mjs](../../tools/compare.mjs) (it already decodes both PNGs via sharp) so drift is guardable by the committed tool. Baselines to reproduce are in [art-direction.md](../reference/art-direction.md) Rule 3. |
| Low | ART-PALETTE-1 — reconcile 3D and 2D neon | 3D is frozen on pure `CART_COLORS` (`0xff00ff`); 2D banned those hexes as off-brand and uses `#ff2bd6`. **The only card permitted to unfreeze the AGENTS.md invariant.** |
| Low | ASSET-RENAME-1 — Asset filename rebrand (`cart-rave-base*.glb` etc.) | Deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Medium | ANNOUNCER-RERECORD-1 — Announcer re-records (Wyatt) `[SHIP-1 E3]` | Shorter directive takes + odd lines. Pipeline drop-in. |
| Low | HOWLER-UPGRADE-1 — Deeper Howler upgrade `[SHIP-1 E3]` | Spatial, pooling, volume groups. |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| Medium | TASTE-P4-1 — Taste-tuning follow-ups from Pass 4 | Only reopen with playtest evidence (D-GP4-1). |
| Medium | CLUTCH-SLOMO-1 — Clutch slow-mo (Pass 5 deferral) | Taste-gated. |
| Low | SWIRL-REVIVE-1 — Turntable swirl force revive | Scoped prototype via DIR-1 — taste-gated. |
| Low | KO-DOOMED-1 — KO "doomed" presentational cue | Idea stage. |
| Low | DEATHCAM-KILLER-1 — Death-cam "follow killer" revisit | Previously reverted. |
| Low | MONETIZE-1 — Subtle monetization path | Idea stage only. |
| Low | RUMBLE-STRENGTH-1 — Controller vibration strength *(pre-ship 07-19)* | |

## Playtest owed

Stuff that shipped and still needs your eyes on **production**
(https://cart-rave.wyabro.workers.dev — hard-refresh first).  
**Exception:** cards marked *pushed but not yet deployed* are **not on prod** — use `npm run dev`,
or ship first. *(No row currently carries that mark: the three that did — RESULTS-PT-1 ·
ORIENT-TOAST-PT-1 · SPAWN-SUNDIAL-PT-1 — all PASSed on dev 08-06. The older NET-AUDIT-\* exception
here was dead text too: those ids closed and have no rows.)*
Console: `npm run dashboard` → playtest console. Mark closed by rewriting Notes to
`Wyatt playtest PASS — …` (drop the `Owed:` line).

Finished and removed from this list: **FIX-MIG-PT-1** (PASS 08-05 on prod `a65d3c9` — host close
shows toast on the survivor after one FAIL + bare A→B residual), **SEC-DIAG-PT-1 · SEC-DIAG-PT-2 · SEC-DIAG-PT-3 ·
ONBOARD-FLAG-PT-1** (PASS 08-05 on prod `fbe8163`, **4/4, no FAIL** — the first two cards of the
pre-launch Work order. PT-2 earned its separate id: it is the card that would have caught a gate
refusing *everywhere*, which would have read as a pass on PT-1 while killing live repro. PT-3 was
closed on pulled evidence — cap-285/286, complete bundles on the deployed sha — not on the
on-screen confirmation, which Wyatt correctly declined to call proof. **ONBOARD-FLAG-PT-1 carries a
named limit:** step 2's fast SOLO click was never performed — *"i cannot click solo that fast so i
think this is a non issue lol"* — so the skip path holds by construction (single write site, past
both guards, asserted in `tests/onboardFirstRun.test.js`) rather than by that click. He is right
that the 600 ms window is hard to hit on purpose; the fix is free either way. Detail:
[completed-work.md](./completed-work.md)), **FV-FRIENDS-1**, **FV-REMATCH-1** (PASS 08-02),
**HOST-TAB-1** · **FX-TIME-1** · **SHADOW-ORDER-1** (PASS 08-04 — 3/3, no FAIL),
**MAIN-1** (both passes 08-04), **BUNDLE-E-PT-1** (PASS 08-05, 6/6 — the deferred-callback seam
is proven live on prod), **STORE-PLAT-WALL-1** (PASS 08-05 — the arena cliff stops carts; its
own fix then produced STORE-PIT-WEDGE-1), **STORE-PIT-WEDGE-1** (PASS 08-05 — the band is
driveable; the sticky-walls residual became STORE-WALL-SLIDE-1), **STORE-WALL-SLIDE-1** (PASS
08-05 — *"feels way better"*; chain closed with no residual), **WALL-SLIDE-CLASSIC-1** (PASS 08-05
— *"feels good"*; same lever on Cart Rave's pit rim), **the six HUD-TOAST-Z-1 cards** (PASS 08-05 on `100842ad`,
**6/6, no FAIL** — TOAST-BOOST-1 · TOAST-NARROW-1 · TOAST-PAUSE-1 · TOAST-PHONE-1 · TOAST-QUICK-1 ·
TOAST-LOBBY-1; every occlusion case split out and judged separately, and all six held —
TOAST-NARROW-1 is the one that proved the measured offset does real work rather than
coincidentally matching a constant), **FIX-EMISSIVE-1 · FIX-EMISSIVE-2** (PASS 08-05 on
`a7dfd8f7` — blowout gone and the classic leader stays dimmer, so the cache-owned trim holds in
the real renderer, not just in the unit seam. **The look note that came back with it is a
different mechanism and is filed as CART-COLOR-DEPTH-1, not as a residual on this card**). **Run 8 (08-03), 15 PASS, all removed:** CAM-READY-1 ·
CC-PT-1 · FV-BOOT-1 · FV-HUD-1 · FV-LOAD-1 · FV-SILVER-1 · LOAD-POSTER-1 · PIT-PT-1 ·
RESULTS-ACT-1 · ROUND-WEDGE-1 · SHADOW-TILT-1 · SOLO-PT-1 · SUNDIAL-PT-1 · UNLOCK-PT-1 ·
UNLOCK-TOAST-1. **Also retired from BACKLOG 08-04 (✅ → completed-work):** PERF-INSTR-1 ·
SPAWN-PT-1 · CAM-PT-1 · HOST-TOAST-1 · plus every other checked Engineering/Art/Audio/UI/Tech
Debt row that was still sitting with a ✅ badge. Detail in
[completed-work.md](./completed-work.md). **A PASS must delete the row the same session it is
reported** — before Run 8 nothing wrote a verdict back here, so passed cards reseeded the
console every regeneration and got re-run. The export now says so out loud. **08-06 export, 5/5
PASS, removed:** UI-P2-HUD-PT-1 · UI-P2-PAUSE-PT-1 · UI-P2-RESULTS-PT-1 · TOUCH-HOVER-PT-1 ·
NET-LOOK-ACC-1. Detail: [completed-work.md](./completed-work.md). Two look nits surfaced in
UI-P2-HUD-PT-1's notes and are filed fresh below (**KILLFEED-PHONE-1**, **ORIENT-TOAST-Z-1**)
rather than folded into that PASS.
**08-07, 1/1 PASS, removed:** FRIENDS-LEVEL-PT-1 — deployed `ec23ccb9`. Friends host's menu pick
now wins the room, confirmed live. Its engineering row (**FRIENDS-LEVEL-1**) closes with it.
Detail: [completed-work.md](./completed-work.md).
**Second 08-06 export — 10/10 PASS, 0 FAIL, all removed:** ART-EXPO-PT-1 · ART-FILTER-PT-1 ·
ART-FILTER-PT-2 · DIFF-FRIENDS-PT-1 · ONBOARD-SLIDES-PT-1 · ONBOARD-SLIDES-PT-2 ·
ONBOARD-SLIDES-PT-3 · ORIENT-TOAST-PT-1 · RESULTS-PT-1 · SPAWN-SUNDIAL-PT-1. The largest clean
sweep so far, and the first where every *shipped-not-deployed* card was judged on `npm run dev`
rather than waiting on a ship. **Four of the ten passed with a note, and none of the notes is a
residual on its own card** — they are filed as five fresh rows (**FRIENDS-LEVEL-1** ·
**ONBOARD-SCROLL-1** · **ONBOARD-SIZE-1** · **ONBOARD-ATTRACT-1** · **SPAWN-SUNDIAL-GAP-1**),
following the FIX-EMISSIVE-1 precedent: a note that names a *different mechanism* than the card
checked is a new card, not a reason to hold the PASS open. Detail:
[completed-work.md](./completed-work.md).

**08-09 export — 5/5 PASS, 0 FAIL, 1 SKIP, all five PASS cards removed:**
**CHUNK-DEFER-PT-1 · MENU-SWAP-FLASH-1 · SD-MUSIC-LPF-1 · VOICE-BUS-1 · CHUNK-DEFER-PT-2**.
Both CHUNK-DEFER checks passed, so the parent **CHUNK-DEFER-1** engineering row also closed;
the one SKIP, **SHARD-PT-2**, remains open for launch-day traffic. Detail:
[completed-work.md](./completed-work.md).
**08-12, 1/1 PASS, removed:** **PA-QUIET-PT-1** — Wyatt PASS on `npm run dev:local`. Parent **PA-QUIET-1** closes with it. Detail: [completed-work.md](./completed-work.md).
**08-13, 1/1 PASS, removed:** **MENU-MUSIC-PT-1** — Wyatt PASS on prod `11e5e48f`. Parent **MENU-MUSIC-2** closes with it. Detail: [completed-work.md](./completed-work.md).
**08-13, 2/2 PASS, removed:** **RAPIER-MAJOR-PT-1 · RAPIER-MAJOR-PT-2** — Wyatt PASS on `npm run dev:local` for PT-1 and on prod after hard-refresh for PT-2 (two-browser Friends drive + joiner KO agreement). Parent **RAPIER-MAJOR-1** closes with PT-2. Deployed `524bd4db`. Detail: [completed-work.md](./completed-work.md).
**08-13, 2/2 dependency levers PASS, removed:** **DEPS-MAJOR-1** — direct `sharp@0.35.3` and `@cloudflare/vitest-pool-workers@0.21.2`. Sharp compare smoke passed with `meanAbs=0.000`; party-do passed 45/45; full QA, production build, and Wrangler dry-run passed. Scoped audit findings fell from 9 to 4; remaining findings are unrelated Vite/PostCSS/nanoid paths. Detail: [completed-work.md](./completed-work.md).
**08-13 export — 9 PASS, 0 FAIL, 3 SKIP; all nine PASS cards removed:**
**CARGO-BAY-INSTANCE-PT-1 · CARGO-BAY-INSTANCE-PT-2 · CONN-TRACK-LEAK-PT-2 ·
NPC-BOOTH-TARGET-PT-1 · NPC-TYPE-DRAW-PT-1 · NPC-TYPE-DRAW-PT-2 · PA-COMBO-PT-1 ·
STORE-1-PT-1 · STORE-MUSIC-PT-1**. Parent **PA-COMBO-1** and **NPC-TYPE-DRAW-1**
close with their checks. **CARGO-BAY-INSTANCE-PT-3 · CONN-TRACK-LEAK-PT-1 · SHARD-PT-2**
remain open with their original steps. Detail: [completed-work.md](./completed-work.md).

| Pri | Item | Notes |
|-----|------|-------|
| Medium | PERF-9CELL-1 — Intel Low 9-cell PERF sweep `[solo]` | ⏸ **PARKED 08-05 with its parent PERF-PASS-1.** It came back **FAIL 08-05** with *"idk what you are asking me to do here"*, and that was the card's fault, not Wyatt's: it said "run the handover's 9-cell matrix" and left the actual protocol 300 lines deep in a 484-line doc, so the console showed him a 25-minute measurement sitting with no cells in it. **MOOT 08-06 — parent PERF-PASS-1 CLOSED with the bar unmet** (Wave 5 cells null/unproven, stadium kept). If it is ever reopened, the sweep is runnable off this row: **URL** `https://cart-rave.wyabro.workers.dev/?diag=1&preset=low&level=classicRecord&ablate=<token>`; **setup** Solo host, 3 NPCs, Cart Rave, entered *through the menu* (not a room link), Low tier, box cooled between cells; **per cell** play 60–90 s → **F8 mid-round** (`loopRound` is live, no podium needed) → `npm run captures:pull` → read `snapshot.perf.loopRound.meanMs`, discarding any cell where `straddledDemotion` is true. **Tokens in order:** `none` → `crowdcarts` → `crowd` → `pitlights` → `stadium` → `stagerig` → `billboard` → `bulbs` → `none`. **`none` runs FIRST and LAST**; if the two baselines differ by more than ±1.5 ms mean the box drifted and the whole sweep is void. **Never combine tokens** — the effects are not additive and combos destroy attribution. Full rationale, per-token expectations and the stills protocol: [perf-pass-1-handover.md](./perf-pass-1-handover.md#the-sweep--nine-cells-25-min-of-play-on-wyatts-intel-box). |
| Medium | PERF-TIER-PT-1 — high-lite tier boots + game runs `[solo]` | Wyatt playtest PASS 08-12 — high-lite boots correctly, reflector absent, quality menu shows 4 options, frame times stable. |
| Medium | PROBE-WARM-RT-PT-1 — first-KO program cache miss `[solo]` | Wyatt playtest PASS 08-12 — programs count stable across first KO, no mid-round warmupCompile events. |
| Low | SHARD-PT-2 — fifth human overflows to quickplay2 `[2pc]` | **Owed: Wyatt playtest — SHARD-PT-2 — the 5th concurrent Quickplay human lands on quickplay2 instead of "couldn't join".** Launch-day / public-post check — needs five real humans (Wyatt deferred 08-05). Rig already 5/5; SHARD-PT-1 PASSed on prod `9c333d1`. Prefer analytics: any `quickplay_shard_assigned` with `hops > 0` or `shard !== quickplay` counts.<br>1. When five humans can join Quickplay at once (public post), watch the 5th seat.<br>2. FAIL if they get the dead-end couldn't-join toast with no hop. PASS if they seat on an overflow shard (or analytics shows hops greater than 0).<br>3. Skip / leave open until launch day — do not FAIL for lack of five people. |
| Low | AQ-RING-CLEAR-1 — autoQuality clear sample ring on every window eval | **Reserve only** if Wave 2 entry grace still demotes on retest. Comment in autoQuality.js already notes the ring can poison up to 3 windows. Own commit if needed; not in main batch path. |
| Medium | CONN-TRACK-LEAK-PT-1 — Friends host-leave migration still works `[2pc]` | **Owed: Wyatt playtest — CONN-TRACK-LEAK-PT-1 — the host closing their tab hands the room to the survivor.** CONN-TRACK-LEAK-1 (`9439cd2`, deployed `5ae6f69b`) refactored the server's onClose teardown; this checks that path live on prod.<br>1. Two browsers, same Friends code, both seat.<br>2. Close the host's tab (do not use a LEAVE button).<br>3. FAIL if the survivor is stuck with no host or the round can never start. PASS if the survivor becomes host and can start the round. |
| Medium | CARGO-BAY-INSTANCE-PT-3 — other players see the same cargo `[2pc]` | **Owed: Wyatt playtest — CARGO-BAY-INSTANCE-PT-3 — the other player sees your cargo fill, not an empty bay.** Same parent; two machines.<br>1. Two browsers, same Friends room on prod. Both seat and start.<br>2. Score on one cart until its bays fill. Look at that cart from the other browser.<br>3. FAIL if the other player sees empty bays, a different fill, or missing models. PASS if both screens show the same groceries. |
| Low | MENU-MUSIC-2B-PT-1 — one menu song at a time, no overlap `[solo]` | **Owed: Wyatt playtest — MENU-MUSIC-2B-PT-1 — the menu plays one song at a time, never two on top of each other.** Regression fix for the two-song overlap (MENU-MUSIC-2 reverted the start-index write ordering). Prod after hard-refresh. Deployed `7de7f87`.<br>1. Load the menu on prod (hard-refresh first).<br>2. Click once anywhere so the first gesture starts the menu music.<br>3. Listen through the first song until it hands off to the second.<br>4. FAIL if two songs ever overlap, especially right after the click or during the handoff. PASS if exactly one song is audible the whole time. |
| Medium | CHALLENGE-EXPAND-PT-1 — six challenge entries and three new finishes `[solo]` | **Owed: Wyatt playtest — CHALLENGE-EXPAND-PT-1 — the expanded challenge rotation and its three new sunglasses stay readable, persistent, and useful.** This work is not deployed; use `npm run dev:local`.<br>1. Open Challenges, complete one of the new daily goals, and confirm the progress card, completion toast, menu badge, analytics event, and results receipt update once.<br>2. Open Customize → Sunglasses, inspect all nine finishes, unlock and equip Obsidian, Hazard, and Pearl, then refresh and confirm the choices persist.<br>3. Check the challenge screen at desktop, portrait phone, and short landscape sizes: all four daily and two weekly cards are readable, completed states are clear, the list scrolls, and BACK/DONE remain reachable.<br>4. FAIL if a card is missing, progress resets, a finish is unavailable after its goal, or any layout clips/overlaps. PASS if all six challenges and nine finishes remain easy to use. |

## UI / UX

| Pri | Item | Notes |
|-----|------|-------|

## Tech Debt

Jam-era structure that still works but accrues cost. Prefer seams after multiplayer is proven.
Priorities below are post-gate unless Wyatt pulls them forward.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Low | ORGANIZE-1 | Codebase organization pass — Wave 3 | **Filed 08-10 from the root-organization wave.** Remaining items after Waves 1–2 (5 src moves, barrel, art previews): **(a)** Move remaining loose `src/` files into existing subdirs — `gameFlow.js`, `gameLoop.js`, `gameSession.js` → `src/orchestration/`; `frameVisuals.js`, `contactShadows.js`, `visuals.js` → `src/effects/`; `cart.js` → `src/physics/`. Each move needs two-direction import sweeps. `gameState.js` was deleted by STORE-1. **(b)** Split `src/effects.js` (138 KB) into `src/effects/` now that the barrel exists (`229b324`). **(c)** Organize `tests/` into subdirectories mirroring `src/` (~160 test files). **(d)** Consolidate ~80 loose baseline/comparison PNGs in `shots/` into feature-named folders. **(e)** Delete stale `.blend` scratch files from `art/` root. **Do not execute during stabilization — file only.** |
| Medium | SHADOW-HAZARD-SEAM-1 | Pre-build contact-shadow hazard API | **Filed 08-04** when MAIN-1 cut the infeasible C2 hoist. Player bug closed by SHADOW-ORDER-1 (`6560552` — explicit hazards at cluster create). Seam remains: `setContactShadowHazards` still runs after `loadLevel` (`applyLoadedLevelSideEffects`); `levelHazards` is **output** of the builder, so “hoist before builder returns” is circular. Closing generically needs static/pre-build hazard data (or keep the per-cluster explicit-passing pattern). **Not** a MAIN-1 lever — level-module design. Trigger: next arena that grounds outboard props during construction without an explicit hazards override. |
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | **Created 07-20** — [SHIP-1.md](./SHIP-1.md), living doc; row stays as pointer until ship. |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Prerequisite for trusted leaderboard. Builds on SRV-TEST-1 helpers. `[SHIP-1 D1]` *(was also an Engineering row — deduped 08-01)* |
| Low | GLTF-1 | Drop legacy cart GLTF layout path | |
| Low | DUAL-1 | Delete leftover dual-era paths | |
| Low | TS-1 | TypeScript on hot paths / TS 7 | Stay on TS 6.x for the gate. |
| Low | TOOL-1 | Tooling residue | |
| Low | VITE-CHUNKWARN-1 — Vite 500 kB chunk-size hint | Cosmetic. |
| Low | BRAND-1 | Brand / domain cutover ceremony | Frozen — [brand.md](../brand.md). |
| Low | BACKLOG-GATE-2 | promote `BACKLOG_WORKORDER_CLOSED_HAS_ROW` from warn to error | **Filed 08-06 alongside BACKLOG-GATE-1**, the mechanical hygiene gate on this file (`validateBacklogHygiene` in [tools/lib/projectHealthValidation.mjs](../../tools/lib/projectHealthValidation.mjs), wired into `health:check`). That one check ships as **warn**, not error, because it parses hand-rewritten Work-order prose rather than a table — a nearest-left-before-✅ heuristic that had one documented false positive during design (PERF-9CELL-1, fixed by narrowing the window) and could plausibly produce another as the Work order's phrasing evolves. **This card is the owner of "when does it stop being provisional":** promote it to error after 2–3 Work-order rewrites land clean with zero `BACKLOG_WORKORDER_CLOSED_HAS_ROW` warnings in `health:check`'s output. If a false positive shows up first, narrow the heuristic instead and reset the counter. |

### Explicitly *not* tech debt (do not “modernize” these)

| Topic | Why leave it |
|-------|----------------|
| Host-**authoritative** Rapier (clients may predict) | Architecture invariant — clients step the same world locally for feel; the host is sole authority and the server never simulates. [AGENTS.md](../../AGENTS.md). |
| Zustand + KO event reactors | Current and coherent. |
| partyserver + WebRTC P2P split | Control plane vs gameplay plane is correct. |
| Big `config.js` knob table | Fine if knobs stay centralized; DIR-1 stops mid-round mutation. |

## Future Ideas (post-launch)

- Domain + full rebrand cutover (BRAND-1).
- DIR-1 runtime modifier stack if Living Store grows mutators.
- GLTF-1 legacy layout deletion after cartrave4-only sign-off.

---

## Closed / do-not-reopen reference

Every ID below is **closed** — full writeups live in [completed-work.md](./completed-work.md).
This list exists so nobody re-files a closed card without new evidence; agents grep it, humans
can skip it entirely. Relocated here from the top of the file 08-06 — it was never `##`-scannable
prose, and pushing 100+ IDs at anyone before they've seen a single open item was the biggest single
readability tax this file had. Nothing else on this page changed.
**Closing a card = delete its row + write it up in [completed-work.md](./completed-work.md) + add
its ID here, same session.** Skip the third step and the card is invisible to `health:check`'s
`BACKLOG_CLOSED_ID_HAS_ROW` gate forever — that check only catches a reopen of an ID already on
this list, so an unlisted closure stays a silent hole from the moment it closes. **`NET-CLK-*` is a
documentation wildcard, not a real lock:** the gate's id matcher reads it as the literal token
`NET-CLK`, so a specific `NET-CLK-2` would not actually collide with it.

NPC-BOOTH-TARGET-1, NIGHT-SHIFT-BLOCKOUT-1, NIGHT-SHIFT-CITY-1, CART-MODEL-1, SHADES-MAT-1, MENU-CART-1, FRIENDS-JOIN-LAYOUT-1, FRIENDS-LEVEL-1, FRIENDS-LEVEL-PT-1, ONBOARD-ATTRACT-1,
ONBOARD-ART-1,
ONBOARD-SLIDES-1, ONBOARD-SLIDES-PT-1, ONBOARD-SLIDES-PT-2, ONBOARD-SLIDES-PT-3,
RESULTS-1, RESULTS-PT-1, ART-FILTER-1, ART-FILTER-PT-1, ART-FILTER-PT-2, ART-EXPO-1,
ART-EXPO-PT-1, DIFF-FRIENDS-1, DIFF-FRIENDS-PT-1, SPAWN-SUNDIAL-1, SPAWN-SUNDIAL-PT-1,
ORIENT-TOAST-Z-1, ORIENT-TOAST-PT-1,
MONTAGE-ESC-1, RAPIER-DEFAULT-MAX-1, KBM-TOAST-1, RESULTS-GLOW-1, DIAG-NET-CAPTURE-1,
SHOOT-SOFTGL-1,
NET-1, NET-2, NET-MIG-3, NET-PRES-1, NET-SD-1, HOST-ROLE-1,
HOST-CAP-1, VFX-1, NET-CLK-*, NET-BUF-1, BOOT-PERF-1, COUNTDOWN-SYNC-1, HUD-FEED-1,
MENU-HINT-1, DIAG-DOC-1, ANLX-VIEW-1, ANLX-ATTRACT-1, ANLX-BULK-1, MP-FX-1, ARENA-COL-1,
SRV-TEST-1, HYGIENE-1, SKYBOX-1, SEC-BEACON-1, SEC-UNLOCK-1, SEC-ROUTE-1, SEC-TOKEN-1,
CARGO-RACE-1, CARGO-VIS-1, CARGO-WT-1, CARGO-HUD-1, CARGO-HUD-1a, SHEET-1, AI-DIFF-1,
HIT-FEEL-1, ARENA-BAL-1, INPUT-KB-1, SOLO-DIFF-1, LOD-UNCANNY-1, FX-TEXDISPOSE-1,
PIT-DEPTH-1, PIT-COL-INSET-1, SPAWN-BACKROOMS-1, CAM-OPEN-1, UNLOCK-ORDER-1,
CC-TOKEN-1, CC-STRIPE-1, CC-LABEL-1, CC-ICON-1, MENU-MUSIC-VOL-1, MENU-LOCK-HINT-1,
GIT-INDEX-1, GIT-INDEX-2, ART-PASS-1, ART-PASS-CLASSIC-1, NET-SIM-1, PRE-PODIUM-1,
FIGHT-VERIFY-1, ROUND-WEDGE-1, SHOOT-ANIM-1, SHOOT-ANIM-2, FX-TIME-1, HOOK-INDEX-1,
STOP-DIRT-1, SUNDIAL-DECK-DETAIL-1, HOST-TAB-1, MAIN-1, PERF-INSTR-1, SPAWN-PT-1,
CAM-PT-1, HOST-TOAST-1, BRIEF-DIGEST-1, SKILLSYNC-PRUNE-1, SHADOW-TILT-1,
SHADOW-ORDER-1, BUNDLE-1, HARNESS-GEO-1, FIX-MIG, **SHOOT-LEVEL-1 — retracted 08-05, was
never a bug** (`FREE_LEVEL = "zanzibar"`, so a default shot already *is* Sundial),
QUICKPLAY-SHARD-1, ARCH-DRIFT-1, DIAG-UPLOAD-GEN-1, UI-SCALE-RESULTS-PHONE-1,
UI-SCALE-RESULTS-WIDE-1, UI-SCALE-FEED-PHONE-1, NET-AUDIT-INPUT-1, NET-AUDIT-SLOTS-LOOK-1,
NET-AUDIT-SLOTS-READY-1, PT-CARD-SPLIT-1, PT-CONSOLE-READY-1, HOOK-COMMENT-1, CC-ESC-1,
HARNESS-NULL-1, HARNESS-FRIENDS-1, HARNESS-FREEZE-1, ATTRACT-JANK-1, SEC-DIAG-1, ONBOARD-FLAG-1,
TIER-DEFAULT-1, DEPLOY-STALE-HTML-1, NET-LOOK-ACC-1, UI-SCALE-1, TOUCH-HOVER-1, LOAD-SCALE-1,
TOUCH-JOY-DEAD-1, BACKLOG-GATE-1, PERF-PASS-1, ONBOARD-SIZE-1, ONBOARD-SIZE-PT-1,
CONNSTATE-REFLIP-1, LASTHITBY-MUTATE-1, FREEZE-TELEMETRY-1,
SIM-CALLBACK-FREEZE-1, REMATCH-NULLGUARD-1, CROWD-INSTANCE-RANGE-1, RAM-CONTACT-STALE-1,
NET-P2P-DIAG-1, SD-SPECTATOR-WIRE-1, ART-EXPO-DUMP-1, ONBOARD-SCROLL-1,
BLOOM-SIGNOFF-1, DEFEAT-READ-1, SKYBOX-DIR-1,
HIT-SFX-VAR-1,
RESULTS-CRAMP-1, RESULTS-UNLOCK-TOAST-1, PODIUM-FOCUS-1, PAUSE-CTRL-CHART-1,
DEPS-MAJOR-1.
COLOR-ID-1, COMBAT-READ-1, GAMEPAD-LOBBY-1, PACE-KO-1,
AI-ARENA-SELFKO-1, ARENA-SELFKO-PT-1, ARENA-SELFKO-PT-2, LOAD-TIPS-1.
PERF-RENDERINFO-1, NET-RING-1, AUDIO-MASTER-1, STATES-DEAD-1,
HOLE-FRICTION-COMBINE-1, SPAWN-SUNDIAL-GAP-1, CHUNK-MEMBER-1, RECORD-MED-1,
CART-COLOR-DEPTH-1, PAD-MENU-1, ARENA-BUMPER-HINT-1, UI-FRAME-1, ESC-PANEL-1, SHADES-ZOOM-1.
CART-FORK-SWIVEL-1, KILLFEED-PHONE-1, PATTERNS-UI-1.
CHUNK-DEFER-1, CHUNK-DEFER-PT-1, CHUNK-DEFER-PT-2, SD-MUSIC-LPF-1, VOICE-BUS-1,
MENU-SWAP-FLASH-1.
ANLX-GEO-1, ANLX-PAGEHOST-1, ANLX-GLITCH-1, DEV-LOOP-1, DEPLOY-MAP-1, MENU-SFX-1, CARGO-BAY-INSTANCE-1, CAPTURE-RING-LIMIT-1, CARGO-LATCH-1, CARGO-LATCH-PT-1, NPC-BOOST-2, NPC-BOOST-2-PT-1, NPC-BOOST-1, AI-EASY-SOFTEN-1, BOOTH-RAIL-COL-1, SUNDIAL-LOW-WATER-1, UI-SCALE-P2-MEDIA-1, ORIENT-HINT-SCROLL-1, DEV-GRAPH-1, DEV-GRAPH-2, LOOP-SAFETY-2, CUSTOMIZE-PERF-1, PROBE-WARM-RT-1, PERF-TIER-1, STORE-1, PLAYTEST-SEED-1, PA-QUIET-1, PA-QUIET-PT-1, STORE-MUSIC-1, MENU-MUSIC-2, MENU-MUSIC-PT-1.
CARGO-BAY-INSTANCE-PT-1, CARGO-BAY-INSTANCE-PT-2, CONN-TRACK-LEAK-1, CONN-TRACK-LEAK-PT-2,
NPC-BOOTH-TARGET-PT-1, NPC-TYPE-DRAW-1, NPC-TYPE-DRAW-PT-1, NPC-TYPE-DRAW-PT-2,
PA-COMBO-1, PA-COMBO-PT-1, STORE-1-PT-1, STORE-MUSIC-PT-1, RAPIER-MAJOR-1, RAPIER-MAJOR-PT-1,
RAPIER-MAJOR-PT-2, NET-QUIT-RETRY-1, CHAL-MENU-REBUILD-1, CHAL-ROTATE-RECORD-1, CHAL-ROTATE-REPEAT-1,
CHAL-DEAD-EXPORT-1, ZAN-REACTIVE-ALLOC-1, BINARY-F32NAME-1, CONSOLE-HI-1, CHAL-PODIUM-DEDUPE-1, ROUND-CLOCKDOMAIN-1.
