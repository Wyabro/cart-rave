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
| **1** — NOW (player-facing correctness) | ✅ clear | No High open rows (STORE-PILE-PT-1 PASS 08-14) |
| **2** — PRE-SHIP (before public post) | ✅ clear | NPC-BOOST cluster closed 08-11 |
| **3** — WYATT LANE (blocked on you) | 👤 ongoing | SHIP-1 D-tier · **WARM-QP-ROTATE-PT-1** (after ship) |
| **4** — PERF RESIDUAL (measure-first) | 🟡 queued | **WARM-QP-ROTATE-1** · WARM-SOLO-1 · PERF-WATCH-1 · NET-PERF-1 / NET-PERF-3 |
| **5** — SWEEP (cheap Lows) | 🟡 queued | MOTION-A11Y-1 · COUNTDOWN-QUICKPLAY-1 · COUNTDOWN-LEAK-1 · CART-HUE-RED-1 · BOOST-SFX-NONHOST-1 |
| **6** — LAUNCH DAY | ⏳ waiting | **SHARD-PT-2** — 5th concurrent human → `quickplay2` |
| **7** — LATER (post-launch / parked) | 🧊 parked | **DEEPSEC-2** · TRUST-1 · LEADERBOARD-1 · BRAND-1 · Tech Debt · taste-gated Design · AQ-RING-CLEAR-1 |

**Department tables — how much open work is where** (🟢 = shippable, everything else needs work):

<!-- BEGIN GENERATED counts — npm run backlog. Do not hand-edit. -->
| Department | Open | High | Medium | Low |
|---|---:|---:|---:|---:|
| [Engineering](#engineering) | 11 | 0 | 5 | 5 (+1 partial) |
| [Art](#art) | 1 | 0 | 0 | 1 |
| [Audio](#audio) | 2 | 0 | 0 | 2 |
| [Design / Gameplay](#design--gameplay) | 2 | 0 | 2 | 0 |
| 🟢 [Playtest owed](#playtest-owed) | 3 | 0 | 2 | 1 |
| [Tech Debt](#tech-debt) | 11 | 0 | 5 | 6 |

**30 open rows total.**
<!-- END GENERATED counts -->

*(This box is generated by `npm run backlog` — BACKLOG-GATE-1, 08-06 — and cannot drift again by
construction; edit the department tables below and regenerate, never this block by hand.)*
Everything in **Playtest owed** already shipped — those rows wait on Wyatt's eyes, not more
engineering. Live owed checks: **WARM-QP-ROTATE-PT-1** (after ship) · **SHARD-PT-2** (launch day). Closed PASS history lives only in
[completed-work.md](./completed-work.md).

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

## Work order (2026-08-14 — high → low)

**This index is order only** — card content stays in the department tables below (one card = one
row = one source of truth). Pick from the top open block; one card at a time; plan → ack per wave.
When a card closes: **delete its line here** the same session its department row is retired to
[completed-work.md](./completed-work.md). Do not leave closed archaeology in this index.

**How to read blocks:** 1 is what agents should start next; 3 is Wyatt-only; 6 waits for launch
traffic; 7 is post-launch or parked. Priority ranks *inside* a block too (top first).

**Block 1 — NOW (player-facing correctness / High).** ✅ clear — no High open rows.

**Block 2 — PRE-SHIP (should land before the public post).** ✅ clear.

**Block 3 — WYATT LANE (off the agent queue until you unblock).**
- **SHIP-1 D-tier** — cut persistent leaderboard from launch, or schedule its own phase. Decide once.
- **WARM-QP-ROTATE-PT-1** — non-host Quickplay overlay covers first room arena `[2pc]` (after ship).

**Block 4 — PERF RESIDUAL (measure-first / instrument; not a reopen of PERF-PASS-1).**
1. **WARM-QP-ROTATE-1** — cap-364 Intel non-host Quickplay rotate stall (real telemetry).
2. **WARM-SOLO-1** — only on real weak-GPU telemetry.
3. **PERF-WATCH-1** — auto-quality step-up path decision.
4. **NET-PERF-1** residual / **NET-PERF-3** — only if F8 still shows rubber-band / alloc pressure.

**Block 5 — SWEEP (cheap Lows; one commit each).** Quiet-window picks; browser-gated items need you in-game.
1. **MOTION-A11Y-1** — needs definition of done first (which motions, how much).
2. **COUNTDOWN-QUICKPLAY-1** · **COUNTDOWN-LEAK-1**.
3. **CART-HUE-RED-1** · **BOOST-SFX-NONHOST-1** (filed 08-13; verify before fix).

**Block 6 — LAUNCH DAY (cannot close before the public post).**
- **SHARD-PT-2** — 5th concurrent Quickplay human overflows to `quickplay2` instead of "couldn't join". Rig-proven 5/5; prefer analytics (`quickplay_shard_assigned` with `hops > 0` or non-default shard). Not a FAIL for lack of five people before launch day.

**Block 7 — LATER (post-launch / parked / do not pick now).**
- **DEEPSEC-2** — parked DeepSec residuals (token rotate + DO limiters). DEEPSEC-1 + PT-1 closed 08-15.
- **TRUST-1** → **LEADERBOARD-1** `[SHIP-1 D]` (only if Block 3 keeps D in scope).
- **BRAND-1** — domain / rebrand ceremony (frozen until ship).
- Trigger-gated: **SHADOW-HAZARD-SEAM-1** (next arena) · **AQ-RING-CLEAR-1** (reserve if autoQuality still demotes).
- Structure debt after multiplayer is proven: **DIR-1** · **GLTF-1** · **DUAL-1** · **TS-1** · **TOOL-1** · **BACKLOG-GATE-2** · **PARTY-SERIALIZE-1** · **HOWLER-UPGRADE-1**.
- Taste-gated Design: **TASTE-P4-1** · **CLUTCH-SLOMO-1** — only on new evidence or explicit pull-forward.
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
| Medium | WARM-QP-ROTATE-1 — non-host Quickplay first rotation stalls on iGPU | **Filed 08-15 from Wyatt playtest + cap-364** (Intel UHD, `igpu-basic`, Low, `cartclash.lol/?diag=1&room=quickplay`, non-host). Do not reopen **NET-2** (PASS ~3s driveable) or **WARM-IGPU-1** (closed 07-30; its plan already said live two-client rotation was unverified). Distinct from **WARM-SOLO-1** (solo, no rotation). Timeline: `play-entry` quickplay at t=556051 while Sundial is still warm; hello latches Storerooms (`backrooms`); rotation deferred while menu is up; `carts-ready` at 557076; `rotation_started` at 557085; then a 15.1s longframe (spans ~150ms attributed), a 3.15s `warm.compilePoll`, and a 6.0s `warm.render.default.play-full`; `rotation_finished` at 567472 (11.4s after play-entry). Heard `countdown_1` then `go` — missed 3 and 2. **Work from this capture**, not speculation. |
| Medium | WARM-SOLO-1 — solo post-`carts-ready` stall (WARM-IGPU-1 residual) | Laptop A cap-206 (**solo**) took a 6.4s longtask ~1.9s after `carts-ready`, inside the countdown. WARM-IGPU-1's Lever A does **not** cover it: arena rotation is quickplay-only, and solo's flyover warm already runs inside `ensureSessionCartsReady`. Proxy evidence says the residual is driver-side first-draw cost (a 13.1s menu-warm frame carried only 235ms of attributed span time), so raising budgets will not help. Candidate mechanism worth checking first: scene content added *after* the warm pass (CSS2D nametags, cargo bays — CARGO-RACE-1's self-heal adds 18–30 meshes per cart, announcer/VFX) introduces new materials whose programs link at the first live countdown draw. **Work only on real telemetry** (`warmupSettle` / longframe spans from a weak-GPU playtester), never on speculation — no iGPU hardware available to reproduce. |
| Medium | PERF-WATCH-1 — auto-quality step-up path | Watchdog demotion is irreversible per session (no step-up anywhere; DEV-only warn; 2 tier steps + 2 renderScale steps; attract render-cost and game frame-delta both judged against one 20.5ms bar). Decide after WARM-IGPU-1 P0b telemetry shows how often it bites. |
| Medium | PARTY-SERIALIZE-1 — `structuredClone` → flat serializer in `party/index.ts` | Only after profiling shows it matters. |
| Medium | LEADERBOARD-1 — Persistent leaderboard / player stats `[SHIP-1 D2]` | Needs TRUST-1. |
| Low | AQ-RING-CLEAR-1 — autoQuality clear sample ring on every window eval | **Reserve only** if Wave 2 entry grace still demotes on retest. Comment in autoQuality.js already notes the ring can poison up to 3 windows. Own commit if needed; not in main batch path. Moved out of Playtest owed 08-14 (not a human check). |


## Art

| Pri | Item | Notes |
|-----|------|-------|
| Low | CART-HUE-RED-1 — custom hue red reads as dark orange in-game `[solo]` | **Filed 08-13 from ART-PALETTE-PT-1 (Wyatt PASS with note).** The custom-color hue slider's red end renders as a dark-orange bloom in-game instead of red; the five preset `CART_COLORS` are unaffected. Art presentation pass only — the cart material traverse stays frozen. |


## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Low | HOWLER-UPGRADE-1 — Deeper Howler upgrade `[SHIP-1 E3]` | Spatial, pooling, volume groups. |
| Low | BOOST-SFX-NONHOST-1 — Non-host charge SFX cut by host nitro `b` bit | **Filed 08-13 from the BOOST-SFX-RESPAWN-1 review.** On non-host seats, `applySnapshotToCartBody` (netcode.js) stops the local charge + chargeUp SFX when a host snapshot's lingering nitro-window `b` bit lands while the client is mid-charge (host release can beat the client's after a hitch). Symptom is distinct from the respawn cut: charge sound dies AND the charge cancels (boost won't fire at release). Fix would gate the `b` authority cut against the client's own charge window. Not reproduced yet — verify on a non-host seat before fixing. |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| Medium | TASTE-P4-1 — Taste-tuning follow-ups from Pass 4 | Only reopen with playtest evidence (D-GP4-1). |
| Medium | CLUTCH-SLOMO-1 — Clutch slow-mo (Pass 5 deferral) | Taste-gated. |

## Playtest owed

Stuff that shipped and still needs your eyes on **production**
(https://cart-rave.wyabro.workers.dev — hard-refresh first).
**Exception:** cards marked *pushed but not yet deployed* are **not on prod** — use `npm run
dev`, or ship first. *(No row currently carries that mark.)*
Console: `npm run dashboard` → playtest console. Mark closed by rewriting Notes to
`Wyatt playtest PASS — …` (drop the `Owed:` line), delete the row the same session, and write
the PASS into [completed-work.md](./completed-work.md).
Deferred rows need two machines or launch-day traffic. Closed PASS archaeology lives only in
completed-work — do not restack it here.

| Pri | Item | Notes |
|-----|------|-------|
| Medium | CONN-TOASTS-1 — friends join/leave toasts, lobby + in-match `[2pc]` | **Owed: Wyatt playtest — CONN-TOASTS-1 — green "X joined" / red "X left" toasts in the friends lobby and during matches; stacked without HUD overlap; no reconnect spam.** Playtest queue steps:<br>1. Friends room: B joins → host sees green "B joined"; B leaves → red "B left"; B kills the tab mid-match → "B left" again within ~5–25s (reap broadcast).<br>2. B rejoins quickly → no left/joined spam (≤1 toast; blip cooldown).<br>3. Host drops mid-match → migration toast plus red "Host left".<br>4. Two rapid joins → both toast, stacked clear of the ready button / lobby hint row.<br>5. Solo quickplay/testdrive: no connection toasts. |
| Medium | WARM-QP-ROTATE-PT-1 — non-host Quickplay overlay covers first room arena `[2pc]` | **Owed: Wyatt playtest — WARM-QP-ROTATE-PT-1 — the overlay stays up until Storerooms is ready; the canvas does not freeze.** Parent **WARM-QP-ROTATE-1**. Use the Intel (or any Low) machine as non-host. A long overlay is not a FAIL.<br>1. Friends round on Sundial. Then both join the same Quickplay room on prod. Hard-refresh first.<br>2. Watch the non-host. Note whether the loading overlay stays up through the arena swap.<br>3. FAIL if the overlay drops and the canvas freezes, or the Intel non-host hears only countdown 1 then GO. PASS if the overlay covers the wait and both hear 3-2-1. |
| Low | SHARD-PT-2 — fifth human overflows to quickplay2 `[2pc]` | **Owed: Wyatt playtest — SHARD-PT-2 — the 5th concurrent Quickplay human lands on quickplay2 instead of "couldn't join".** Launch-day / public-post check — needs five real humans (Wyatt deferred 08-05). Rig already 5/5; SHARD-PT-1 PASSed on prod `9c333d1`. Prefer analytics: any `quickplay_shard_assigned` with `hops > 0` or `shard !== quickplay` counts.<br>1. When five humans can join Quickplay at once (public post), watch the 5th seat.<br>2. FAIL if they get the dead-end couldn't-join toast with no hop. PASS if they seat on an overflow shard (or analytics shows hops greater than 0).<br>3. Skip / leave open until launch day — do not FAIL for lack of five people. |

## Tech Debt

Jam-era structure that still works but accrues cost. Prefer seams after multiplayer is proven.
Priorities below are post-gate unless Wyatt pulls them forward.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | DEEPSEC-2 | Parked DeepSec residuals (token + DO limiters) | **Filed 08-14 with DEEPSEC-1.** Do not implement in the DEEPSEC-1 wave. Wyatt ops before public post: rotate `ERROR_LOG_TOKEN` if prod is still `69420` (`wrangler secret put ERROR_LOG_TOKEN`, update `.env.local`, confirm old token is 403). Then: sliding-window beacon + count analytics events not batches; cross-room WS connect budget and admin fail lockout in a Durable Object (not a Worker isolate `Map`); TURN mint budget that does not break 2pc on one NAT (room-cached credential); DataChannel receive rate cap after measuring 4p traffic; friends-code entropy (product change); non-host unlock corroboration (do not drop non-host unlocks). Known noise, do not reopen without new evidence: open POST beacon auth · Glitch `VITE_` token · latent `svgIcon` XSS · CI action SHA pins · pull-tool `--url` / path traversal · solo `Math.random` rooms. Do not duplicate TRUST-1. |
| Medium | SHADOW-HAZARD-SEAM-1 | Pre-build contact-shadow hazard API | **Filed 08-04** when MAIN-1 cut the infeasible C2 hoist. Player bug closed by SHADOW-ORDER-1 (`6560552` — explicit hazards at cluster create). Seam remains: `setContactShadowHazards` still runs after `loadLevel` (`applyLoadedLevelSideEffects`); `levelHazards` is **output** of the builder, so “hoist before builder returns” is circular. Closing generically needs static/pre-build hazard data (or keep the per-cluster explicit-passing pattern). **Not** a MAIN-1 lever — level-module design. Trigger: next arena that grounds outboard props during construction without an explicit hazards override. |
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | **Created 07-20** — [SHIP-1.md](./SHIP-1.md), living doc; row stays as pointer until ship. |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Prerequisite for trusted leaderboard. Builds on SRV-TEST-1 helpers. `[SHIP-1 D1]` *(was also an Engineering row — deduped 08-01)* |
| Low | GLTF-1 | Drop legacy cart GLTF layout path | |
| Low | DUAL-1 | Delete leftover dual-era paths | |
| Low | TS-1 | TypeScript on hot paths / TS 7 | Stay on TS 6.x for the gate. |
| Low | TOOL-1 | Tooling residue | |
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

DEEPSEC-1, NPC-BOOTH-TARGET-1, NIGHT-SHIFT-BLOCKOUT-1, NIGHT-SHIFT-CITY-1, CART-MODEL-1, SHADES-MAT-1, MENU-CART-1, FRIENDS-JOIN-LAYOUT-1, FRIENDS-LEVEL-1, FRIENDS-LEVEL-PT-1, ONBOARD-ATTRACT-1,
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
CHAL-DEAD-EXPORT-1, ZAN-REACTIVE-ALLOC-1, BINARY-F32NAME-1, CONSOLE-HI-1, CHAL-PODIUM-DEDUPE-1, ROUND-CLOCKDOMAIN-1, CONN-DEADCODE-1, CONN-SNAPSHOT-PURE-1, PARTY-ENVTYPE-1, CONN-SPAWN-SANITIZE-1, ZAN-BOLLARD-CLASS-1, SNAP-SPARSE-1, LOD-PITRING-1, CONN-SOURCETRUTH-1, VITE-CHUNKWARN-1, PERF-TIER-PT-1, PROBE-WARM-RT-PT-1, CHALLENGE-EXPAND-PT-1, LOD-PITRING-PT-1, MENU-MUSIC-2B-PT-1, ZAN-BOLLARD-PT-1, ANNOUNCER-RERECORD-1, LOD-DOORWAY-1, SWIRL-REVIVE-1, DEATHCAM-KILLER-1, CLAD-REPEAT-1, SHELF-RAIL-1, ART-LUMA-TOOL-1, ASSET-RENAME-1, ART-PALETTE-1.
ART-PALETTE-PT-1, CHAL-SHELF-FIT-1, CHAL-SHELF-FIT-PT-1, GAMEPAD-NAV-REPEAT-1, GAMEPAD-NAV-REPEAT-PT-1, KO-DOOMED-1, LOD-DOORWAY-PT-1, RUMBLE-STRENGTH-1, RUMBLE-STRENGTH-PT-1, SHELF-RAIL-PT-1.
ANIM-BUGS-1, ANIM-BUGS-PT-1, BOOST-SFX-RESPAWN-1, BOOST-SFX-RESPAWN-PT-1, KO-DOOMED-PT-1,
PERF-9CELL-1, ORGANIZE-1, GAMEPAD-MENU-ROUTES-1, GAMEPAD-TEXT-ENTRY-1, GAMEPAD-DIRECT-ENTRY-1,
GAMEPAD-TEXT-ENTRY-PT-1, UI-INPUT-LIFECYCLE-1.
GAMEPAD-DIRECT-ENTRY-PT-1, GAMEPAD-MENU-ROUTES-PT-1, MOBILE-SCOREBOARD-PT-1, PAUSE-CHARGE-SFX-PT-1,
SUNGLASSES-OBSIDIAN-PT-1, STORE-PILE-2, STORE-PILE-PT-1,
GAMEPAD-FRIENDS-SEATED-1, GAMEPAD-FRIENDS-SEATED-PT-1, EFFECTS-SPLIT-1,
DEEPSEC-1-PT-1, CARGO-BAY-INSTANCE-PT-3, CONN-TRACK-LEAK-PT-1, QP-ROTATE-PT-1.
