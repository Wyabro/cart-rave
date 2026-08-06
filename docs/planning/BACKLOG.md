# Cart Clash — Backlog (open work only)

**What is this?** Every known **open** item, deduplicated — grouped by discipline, prioritized.
**Why does it exist?** So open work lives in one place instead of scattered tables.
**Who should read it?** Whoever is picking the next piece of work.
**Related:** [STATUS.md](../STATUS.md) (declared phase + focus), [ROADMAP.md](./ROADMAP.md)
(phase definitions), [completed-work.md](./completed-work.md) (shipped),
[netcode-deep-dive.md](./netcode-deep-dive.md) (hazard writeups).

### Status at a glance

*(Hand-maintained summary, kept in sync with the sections below by whoever closes or reorders a
card. If it ever drifts, the [Work order](#work-order-2026-08-05-audit--the-queue-wyatt-works-down)
narrative and the department tables further down are the source of truth, not this box.)*

**Work order — where the ship-bar queue stands**, block by block:

| Block | State | Next action |
|-------|-------|-------------|
| **A** — ship bar (launch blockers) | 🟡 6/7 closed | **NET-LOOK-ACC-1** — shipped, awaiting Wyatt playtest (unblocks Pattern customize UI C3) |
| **B** — pre-ship batch (16 items, best-first) | 🟡 in progress | #1 **UI-SCALE-1** Pass 2 shipped, awaiting playtest; #2 **ONBOARD-SLIDES-1** is next once #1 closes |
| **C** — perf program | 🔵 parked | Wyatt's call to unpark; next step when he does is the **PERF-9CELL-1** sweep |
| **D** — Wyatt-parallel (off the agent queue) | 👤 ongoing | CART-MODEL-1, HIT-SFX-VAR-1 (needs his clips), bloom sign-off, art-direction calls |
| **E** — ship-gate decision | 🔵 needs a call | Cut D-tier (persistent leaderboard) from launch, or schedule it as its own phase |
| **F** — sweep-day batch (Lows, one commit each) | ⚪ not started | **RAPIER-DEFAULT-MAX-1** first (prose-only fix), then 6 more small items |
| **G** — tooling-window batch | 🟢 fully drained | — |

**Launch-day only (can't test before the public post):** SHARD-PT-2 — 5th concurrent human needs
to land on `quickplay2`; rig already 5/5 in browsers, this just needs real traffic.

**Department tables — how much open work is where** (🟢 = shippable, everything else needs work):

| Department | Open | High | Medium | Low |
|---|---:|---:|---:|---:|
| [Engineering](#engineering) | 24 | 2 | 12 | 9 (+1 partial) |
| [Art](#art) | 16 | 2 | 6 | 8 |
| [Audio](#audio) | 5 | 0 | 3 | 2 |
| [Design / Gameplay](#design--gameplay) | 9 | 0 | 3 | 6 |
| 🟢 [Playtest owed](#playtest-owed) | 8 | 5 | 1 | 2 |
| [UI / UX](#ui--ux) | 14 | 4 | 5 | 5 |
| [Tech Debt](#tech-debt) | 14 | 0 | 5 | 9 |

**90 open rows total.** Everything in **Playtest owed** already shipped — those rows are just
waiting on Wyatt's eyes, not on more engineering. That's usually the fastest place to look for
"what do I personally need to go do."

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
**ART-MAT-1** → CART-MODEL-1 · **ONBOARD-1** → ONBOARD-SLIDES-1.

**Pre-ship 07-19 rows** tagged *(pre-ship 07-19)* are parked polish — pick up when Wyatt
names them; they do not auto-queue over STATUS.

**Pre-ship batch (07-31, Wyatt-named):** rows tagged `[pre-ship]` are **in scope before
ship** — not parked. Wyatt asked they all land pre-ship; priority still ranks order inside
that set.

**SHIP-1 tiers (07-20):** pre-ship ordering now lives in [SHIP-1.md](./SHIP-1.md).
Rows tagged `[SHIP-1 A–E]` are pre-ship, drained tier by tier; untagged rows default to
post-launch unless Wyatt pulls them forward.

---

## Work order (2026-08-05 audit — the queue Wyatt works down)

**This index is order only** — card content stays in the department tables below (one card = one
row = one source of truth). Filed from the pre-launch audit after Wyatt confirmed launch is a
**public post (itch/Reddit)**. One card at a time, plan → ack per wave, as always. When a card
closes, strike it here the same session its row is retired.

**Block A — ship bar (launch blockers, strict order):**
1. ~~**SEC-DIAG-1**~~ — ✅ **CLOSED PASS 3/3 08-05** on prod `fbe8163` ([completed-work.md](./completed-work.md))
2. ~~**ONBOARD-FLAG-1**~~ — ✅ **CLOSED PASS 08-05** on prod `fbe8163`, with a named limit on the skip-click ([completed-work.md](./completed-work.md))
3. ~~**QUICKPLAY-SHARD-1**~~ — ✅ **CLOSED 08-05, SHARD-PT-1 PASS on prod `9c333d1`.** Overflow hop, not a seat-finder — full writeup in [completed-work.md](./completed-work.md); the Engineering row was retired 08-05. SEC-DIAG-1's regression bar met in units and live. ⚠️ **SHARD-PT-2 deferred to the public playtest** — it needs five real humans, which Wyatt does not have; the overflow itself is rig-proven 5/5 in real browsers. **Launch-day check, do not lose it.**
4. ~~**FIX-MIG**~~ — ✅ **CLOSED PASS 08-05** on prod `a65d3c9` (FIX-MIG-PT-1). Disconnect reason + toast + continuous tests; bare A→B handoff residual fixed. [completed-work.md](./completed-work.md)
5. ~~**ATTRACT-JANK-1**~~ — ✅ **CLOSED 08-05** on prod `5983896`. Premise was wrong: the box was **idle** (3–6 ms frames), running the reduced-motion path at 1.25 fps, so SHOOT-ANIM-1's new level animation advanced in 800 ms steps. Levers A (pin the reduced-motion clock) + B (age stale samples out of the auto-quality ring, which had demoted the session from the menu on frames 16 s gone). Throttle-beat hypothesis **refuted** by measurement; swap-grace hypothesis never fired. Lever A's on-screen result is a **named limit** — held by construction, not by a look at the menu. [completed-work.md](./completed-work.md)
**Re-ordered 08-05 (second pass).** Blocks A and B were re-ranked by *unblocking value* — what
makes the next card cheaper or its verdict trustworthy — not by severity alone. Each item names
what it unblocks; that clause is the reason it sits where it sits. Block B now carries its own
1..N numbering (it previously restarted at 6 and collided with Block A).

**Block A — ship bar (launch blockers, strict order). One left:**

6. ~~**TIER-DEFAULT-1**~~ — ✅ **CLOSED 08-05, Wyatt PASS on both real boxes.** Expanded past the
   seated narrow lever into a 6-class GPU taxonomy + pure `defaultTierForCaps()` policy, shipped as
   five separately-acked commits (taxonomy, one-shot stored-tier migration, host-capability scores,
   reduced-motion rung, 4K guard), deployed (`ship`, Worker `d91f34a6`, entry `index-BKAcELHu.js`).
   Full writeup: [completed-work.md](./completed-work.md). **Block C is now unblocked to start.**
7. **NET-LOOK-ACC-1** — ⏳ **SHIPPED 08-06 (`1198d26`, prod Worker `3cfb33f8`), awaiting Wyatt
   playtest — not closed.** `patternId`/`sunglassesStyle` now ride the wire alongside `lookHex`
   (party/index.ts Slot + both handlers, netcode.js send/fingerprint/diff, customization.js
   remote-human resolvers); a peer's sunglasses style additionally caches every slots broadcast
   ([cartOrchestration.js](../../src/orchestration/cartOrchestration.js)) so it lands correctly on
   that cart's next KO respawn (style is baked into cloned GLTF materials — no live rebuild, by
   design). `npm run qa` 7/7 green (6 new tests); dev-verified with two real network clients (not
   Wyatt's eyes) — see the Playtest owed row below. **Unblocks:** in Quickplay everyone except the
   host is a non-host, so this is the *majority* player's view of the customization pride loop —
   and it must PASS before **Pattern customize UI (C3)**, or patterns ship onto a wire only just
   proven to carry them.
   *(DEPLOY-STALE-HTML-1 closed 08-05 — [completed-work.md](./completed-work.md).)*

**Block B — pre-ship batch (after A, best first; own numbering):**
1. **UI-SCALE-1 — Pass 1 ✅ shipped + PASSed 08-05; Pass 2 ⏳ shipped 08-06, awaiting Wyatt
   playtest.** Pass 1 (root scale + `cart-rave-menu.css`, `9e2ec60`..`f057abe`) is done and
   playtest-verified 3/3. **Pass 2** — the same clamp→rem conversion on `hud.css` (`dacca48`),
   `results.css` (`271c5cc`), `pauseOverlay.css` (`5cbc63f`), `announcer.css`/`stickers.css`/
   `loadingScreen.css` (`8c65bd7`) — shipped. **LOAD-SCALE-1 closed** below (already fixed by
   LOAD-POSTER-1, this wave only verified it at HEAD). **TOUCH-HOVER-1 shipped** (`78acdb4`) —
   see its own row. `npm run qa` 7/7 throughout; MAE identity-gated at 1920×1080/3440×1440 on
   every file (chrome-shot noise floor measured at ~1.7–6.4 depending on surface — kill-feed/
   NPC-name/cart-color RNG bleeds into the region, confirmed by same-code-state recapture, not a
   regression); `npm run states` 252/259 (same 4 pre-existing menu-reachability FAILs as
   baseline). **Not closed** — no human has looked at Pass 2 on a real screen yet; playtest cards
   below. **First in B on purpose:** it changes the unit system every other UI card is authored in,
   so RESULTS-1, COLOR-ID-1, UI-FRAME-1, ESC-panel, ONBOARD-SLIDES-1 and MENU-CART-1 are all cheaper
   after it and all get re-done if they land first. Highest unblock-per-card on the board.
2. **ONBOARD-SLIDES-1** — absorbs ONBOARD-1; shares its copy with LOAD-TIPS-1, which is why
   LOAD-TIPS-1 sits below it rather than above.
3. **RESULTS-1** — the last big screen still on the old layout; author it after #1's units exist.
4. **ART-FILTER-1 + ART-EXPO-1** — agent-executable art infra. **Unblocks the High bloom sign-off**,
   whose success criteria come from these two, so bloom cannot be judged before they land.
5. **CART-COLOR-DEPTH-1** — definition session first (2–3 candidate treatments side-by-side;
   **not a code card until "deeper" is agreed**). Moved up: it sets the colour language that
   COLOR-ID-1's glyphs and any later cart art are read against.
6. **COLOR-ID-1** — slot glyphs; the colourblind gap in a hue-only 4-player brawler. After #1
   (HUD units) and #5 (colour language).
7. **SPAWN-SUNDIAL-1** — Sundial platform-leg colliders; carts currently ghost through the supports.
8. **LOAD-TIPS-1** — skip if #2 covered it.
9. **VOICE-BUS-1** — gives the announcer its own volume; **also decides AUDIO-MASTER-1**, which is
   why that Tech Debt row stays parked until this lands.
10. **SD music low-pass** `[SHIP-1 E3]`
11. **RECORD-MED-1** — Medium-tier floor parity. Judge it *after* TIER-DEFAULT-1, which changes who
    ever sees Medium.
12. **CHUNK-MEMBER-1** — cold-visit chunk membership; the profile a public post maximizes.
13. **MENU-CART-1** — main-menu cart under the name plate. After #1 and after NET-LOOK-ACC-1, since
    it reuses the same look-sync path.
14. **NPC-BOOST-1** — measure session only; retune is a separate ack.
15. **UI-FRAME-1 + ESC scoring panel** `[SHIP-1 E1]` look pair.
16. **Controller menu nav polish.**

**Block C — perf program (evidence-gated; ⏸ unpark is Wyatt's call).** Re-ordered 08-05; null arm
shipped 08-06. Order: **TIER-DEFAULT-1 landed** → **HARNESS-NULL-1 ✅ CLOSED 08-06** (headless
`perf-profile --null` only; provisional-n3 on RTX 4090 — does **not** unpark PERF-PASS-1 or replace
F8 A-B-A) → read cap-254–260 → **PERF-9CELL-1** sweep (still ⏸ with PERF-PASS-1) → PERF-PASS-1
re-entry bracketed A-B-A with a "55 fps at Low or park" reachability ack → then PERF-WATCH-1 /
PERF-TIER-1 / PROBE-WARM-RT-1 / WARM-SOLO-1 as attribution dictates. Before any ablate ranking on
`perf-profile`, re-run `--null` on that machine/adapter.

**Block D — Wyatt-parallel (off the agent queue, any time):** CART-MODEL-1 (absorbs ART-MAT-1;
unblocks Pattern UI C3 via the 2nd UV channel — the single biggest unblocker Wyatt owns) ·
HIT-SFX-VAR-1 clips + announcer re-records (HIT-SFX-VAR-1 is **blocked on Wyatt providing clips**,
nothing else) · bloom sign-off (after B#4) · SKYBOX-DIR-1 call · Defeat-screen look call ·
owed playtests as they seed.

**Launch-day checks (cannot be done before the public post — carry these into the ceremony):**
- **SHARD-PT-2** — the 5th concurrent human overflows onto `quickplay2` instead of "couldn't join".
  Deferred 08-05: it needs five real humans. Rig-proven 5/5 in real browsers, and SHARD-PT-1 passed
  on prod, so the residual risk is *live infrastructure under real concurrency*, not the mechanism.
  First real moment it can be observed is the public post. **Read it from analytics rather than
  trying to catch it live:** `quickplay_shard_assigned { shard, hops }` answers it in aggregate with
  no coordination — any row with `hops > 0` is an overflow that worked, and any `shard` other than
  `quickplay` means a real player was seated past the old four-human ceiling. Zero rows past shard 1
  means the cap was never reached, which is not a failure and not evidence either way.

**Block E — ship-gate decision Wyatt must make once:** SHIP-1's **D tier (TRUST-1 → persistent
leaderboard)** is formally pre-ship but is ~a week of work the audit's two-week frame did not
schedule. Either cut D from the launch gate (leaderboard ships post-launch) or schedule it as
its own phase — deciding late is the only wrong option.

**Block F — sweep-day batch (Lows, batch 2–4 between big cards, one commit each).** Ordered 08-05
so the prose-only correction goes first: **RAPIER-DEFAULT-MAX-1** is load-bearing false prose (it
is the stated reason Classic's walls take no restitution rule), so anyone who opens a physics card
before it is fixed reasons from a wrong model of what Rapier does. Then SPINDLE-COLOR-DEAD-1 ·
BOOTH-RAIL-COL-1 · SUNDIAL-LOW-WATER-1 · CART-FORK-SWIVEL-1 · STATES-DEAD-1 · RESULTS-GLOW-1 ·
SFX slider.

**Block G — tooling-window batch (`tools/`/hooks frozen during game cards — run when no game card
is active).** Ordered 08-05 by what each one prevents from recurring — the two cards that stopped
the *next* playtest export from repeating the two failures this queue had already paid for (a
multi-issue card hiding a real defect inside a green PASS, and an owed card shipped with no
runnable steps, which is exactly how PERF-9CELL-1 FAILed on 08-05): **PT-CARD-SPLIT-1 ✅ CLOSED
08-06** and **PT-CONSOLE-READY-1 ✅ CLOSED 08-06** (writeups in
[completed-work.md](./completed-work.md)). **HARNESS-NULL-1 ✅ CLOSED 08-06**. **HOOK-COMMENT-1
✅ CLOSED 08-06** (one-line stale comment) · **CC-ESC-1 ✅ CLOSED 08-06**. **HARNESS-FRIENDS-1 ✅
CLOSED 08-06** and **HARNESS-FREEZE-1 ✅ CLOSED 08-06** — same `netharness.mjs` scenario lane, one
tooling commit each (writeups in [completed-work.md](./completed-work.md)). **Block G tooling
batch is now fully drained.** **ARCH-DRIFT-1 removed — closed**, shipped `91b39aa`.

**Do not pick (blocked / trigger-gated / post-launch):** WARM-SOLO-1 (needs real weak-GPU
telemetry) · PROBE-WARM-RT-1 / NET-RING-1 (instrument-first, live inside Block C) ·
CARGO-LATCH-1 · COUNTDOWN-QUICKPLAY-1 · NET-PERF-1/3 · SHADOW-HAZARD-SEAM-1 (trigger: next
arena) · structuredClone serializer (profile first) · Customize perf pass (measure first) ·
countdown-survives-menu-return · STORE-1 · DIR-1 · GLTF-1 ·
DUAL-1 · TS-1 · TOOL-1 · Vite chunk hint · ART-PALETTE-1 · CLAD-REPEAT-1 · LOD-PITRING-1 ·
SHELF-RAIL-1 · sunglasses materials (E2, with an art wave) · asset filename rebrand · taste-gated
Design rows · BRAND-1 (ship ceremony) · Future Ideas.

---

## Engineering

| Pri | Item | Notes |
|-----|------|-------|
| High | *(NET-LOOK-ACC-1 shipped 08-06, moved to [Playtest owed](#playtest-owed) below)* | |
| Medium | SPAWN-SUNDIAL-1 — Sundial platform-leg colliders `[pre-ship]` | **Half closed 08-02.** The spawn inset shipped in `e64f1a3` via `booth.gapDistanceByLevel` — Sundial's booths and spawn ring both moved +0.75m outward with no level-file edit. **Still owed:** colliders on the platform legs. `buildZanzibarBooths` ([zanzibarPlatform.js:3745](../../src/levels/zanzibarPlatform.js:3745)) builds four 11m legs plus cross-braces per booth as **visual meshes only** — the deck cuboid at `:3828` is the sole `createCollider` in the builder, so carts ghost straight through the supports. ART-PASS-SUNDIAL-1 is closed (Run 8) — leg colliders are unblocked; still open work. |
| Low | BOOTH-RAIL-COL-1 — Storerooms booth rails/dividers are visual-only | **Split out 08-05 from STORE-PLAT-WALL-1's misfiling** — real, but *not* what Wyatt reported, and explicitly out of that card's scope. On the four elevated spawn booths, only the deck cuboid gets a collider ([backroomsSupermarket.js:3278](../../src/levels/backroomsSupermarket.js:3278)); the low back rail, side bars, corner posts and cubicle divider are mesh-merge visuals with no physics. **Note the sides are an open handrail** — a bar 1.8 m above the deck with nothing beneath it — so "make the sides solid" would be an invisible barrier where the player sees a gap. Wyatt's ruling 08-05 if this is ever picked up: posts only, back rail matches its visible 0.55 m (a cart may ram over it; there is a 4.35 m carpet apron behind each booth, so going over lands on floor, not in the pit), and **crates stay ghost**. Same shape as SPAWN-SUNDIAL-1. Low: nobody has reported it in play. |
| Medium | RECORD-MED-1 — Cart Rave record floor looks wrong on Medium (vs Low and High) | **Filed 08-04 from Wyatt.** Medium quality's vinyl/record surface reads weird next to Low and High on the same machine. **Likely mechanism (not yet measured):** `QUALITY_KNOBS.medium.reflector = false` ([qualityTiers.js:77](../../src/utils/qualityTiers.js:77)) so `setReflectorVisible(false)` shows the solid floor ([arena.js:1795](../../src/arena.js:1795)), but the record **body** is still built on the High material path because construction only branches on `isLowQualityMode()` ([arena.js:1601](../../src/arena.js:1601)) — Medium is not Low, so it gets High clearcoat/metalness/normal stack *plus* the Medium solid floor and postFX/bloom that Low disables. Low = opaque Low body + solid floor + no composer; High = translucent body + Reflector + vinyl detail. Medium is a hybrid nobody signed off. **Do not fold into PERF-PASS-1** — that card is Cart Rave cost, not look parity. **Cheapest repro:** `?preset=low` / medium / high on classicRecord, same camera, shoot three stills. **Pass:** Medium reads as a deliberate step between Low and High (or matches Low's solid-floor look cleanly), not a broken middle. |
| Low | RAPIER-DEFAULT-MAX-1 — the combine-rule sweep's docs claim Rapier defaults restitution to `Max`; it defaults to `Average` | **Filed 08-05 while applying SUNDIAL-OBSTACLE-SLIDE-1, and it corrects the card that shipped immediately before it.** `ColliderDesc` sets **both** `frictionCombineRule` **and** `restitutionCombineRule` to `Average` — read it directly at [collider.js:861-862](../../node_modules/@dimforge/rapier3d/geometry/collider.js), not inferred. Four places assert otherwise, all from WALL-SLIDE-CLASSIC-1 (`00ef1cb`): the comment at [arena.js:2548](../../src/arena.js:2548) ("Rapier's default is Max"), the last test in [classicPitWalls.test.js](../../tests/classicPitWalls.test.js) and its rationale, that commit's own message, and its entry in [completed-work.md](./completed-work.md). **Consequence:** Classic's containment lip and shaft staves deflect at **0.40 / 0.45**, not the 0.50 / 0.60 the comments claim (cart restitution 0.3, [config.js:87](../../src/config.js:87)). **This is a claim error, not a behaviour bug — do not "fix" the numbers.** WALL-SLIDE-CLASSIC-1 was signed off on prod `a028cb8a` *at the real effective values*, so the felt deflection is already accepted; raising it to the documented figures would change a passed card's feel on the strength of a comment. **Scope if picked up: edit the three claims to say Average, keep every collider value byte-identical.** Worth doing because the false premise is load-bearing prose — it is the stated reason the Classic walls take no restitution rule, and the next editor reading it will reason from a wrong model of what Rapier does. If a higher deflection is ever actually wanted there, that is a separate tuning card with its own playtest. |
| Low | SPINDLE-COLOR-DEAD-1 — Classic still declares and returns a colour pair nobody reads | **Filed 08-03**, found while closing Sundial audit item 28 and deliberately left out of that commit (Wyatt's instruction: do not expand into Classic). Sundial's spindle "colour contract" turned out to be dead — `main.js` destructured `spindleLightColorPink`/`Cyan` into locals and never read them — so `60486c9` moved the cycle into Sundial's own `update()` and deleted the locals, Sundial's returns and its typedef. **Classic was not touched and still declares the pair at [arena.js:1672](../../src/arena.js:1672) and returns it at [:2786](../../src/arena.js:2786),** while its live reactive path uses `reactive.accentColor` ([:2753](../../src/arena.js:2753)) instead. So the pair looks dead there too. `backroomsSupermarket` keeps its own pair on purpose, labelled inert, for API shape. **Check before deleting** whether anything reads Classic's pair through the shared level-result shape (`levels/index.js` types them optional, so the type system will not tell you). Cosmetic only — no player-visible effect either way. |
| High | PERF-PASS-1 — low-end performance is worse across the board | **⏸ PARKED BY WYATT 08-04 (STATUS is the authority — this row briefly said ACTIVE after the same-day unpark for Wave 3, then Wyatt parked it for HOST-TAB-1; HOST-TAB-1 has since closed PASS, so unparking is his call, evidence-first: cap-254–260 + the owed 9-cell sweep before any knob). Plan for Waves 3–4, with verified line refs and the sweep protocol: [perf-pass-1-handover.md](./perf-pass-1-handover.md) — read it before touching this card.** Wave 3 delivers a **cost menu**, not shipped cuts; no visual cut ships without Wyatt picking it. Wyatt scoped pass bar to **Cart Rave only**, mean ≤ 16.7 ms (avg 60). **Wave 1 instrument SHIPPED** (`aeb83aa`) — `meanMs`/`fps`/`over16` + CPU split per RUNNING window; gate is **PERF-INSTR-1** (one Intel Low capture, never under `?perfPump`). No visual cut without Wyatt sign-off. Deliberately no long-lived Owed seed on this parent until a cut ships. *(Older "all three arenas" wording below is historical context from the filing.)* <br>**Filed 08-03 from his Run 8 report**, alongside ATTRACT-JANK-1 below. Report is a felt regression on weak hardware, not a number, so this card is **measure-first and nothing else until there is a delta**: the standing rule from run-4's "GC metronome" error (**HARNESS-NULL-1**) is that adjacency is not attribution. **Known floor to measure against:** run 5 put the Intel UHD iGPU at LOW at **54% of frames over 33 ms** — that is the pre-existing smoothness floor, so "bad on the Intel box" is only evidence if it is *worse than that*. **Method:** bisect recent batches on the Intel box, **prod not dev** — dev-only probes (`__cartRavePerf.scene`, `import("/src/…")`) lie in prod, and dev-server timing is not the shipped bundle. Candidate surface added since the last known-good measurement is large (Sundial god rays + hologram, the three LOAD-POSTER-1 loading scenes, octagon/holo work, FX layers), which is exactly why a bisect beats guessing. **Do not** start tuning tier knobs before a measurement — `PERF-TIER-1` and `PERF-WATCH-1` are the levers *after* attribution, not instead of it. Related: WARM-SOLO-1 (weak-GPU first-draw stalls), PROBE-WARM-RT-1.<br>**MEASURED 08-03 (Wyatt) — and the card now has a target, which it did not before.** His words: *"all three have less than passable fps on the intel machine. i want the goal to be 60 FPS on low on the intel machine. i took an f8 cap on all three levels."* **That is a spec, not a bug report** — the card stops being "is it worse?" and becomes "hit 60 fps at Low on the Intel UHD box in Cart Rave, Storerooms and Sundial". Note it reframes the known floor rather than clearing it: run 5 measured that box at Low at 54% of frames over 33 ms, i.e. it has **never** held 60, so this is a perf program against an absolute bar, not a regression hunt — do not spend the budget bisecting for a culprit that may not exist. Three F8 captures exist; pull with `npm run captures:pull` and attribute before touching a single knob. **PERF-TIER-1 / PERF-WATCH-1 are levers after attribution.** **ATTRIBUTED 08-03 from his own three captures (cap-236/237/238, build `2c18057`, Intel UHD, `quality_tier: low`, solo, host).** **Read them as one session, not three** — all three are F8 presses inside a single page load, so they share one event ring and the loop counters are **cumulative**; per-capture percentages understate the last arena badly (Cart Rave reads 16.1% cumulative but **27.8%** once diffed). Diffed segments: **Sundial → Storerooms 48.9 fps avg, 10.2% of frames over 33 ms**; **Storerooms → Cart Rave 38.2 fps avg, 27.8% over 33 ms**. **Cart Rave is roughly twice as expensive as the other two** and is where the budget goes first. **Two conclusions that change the plan:** (1) **This is steady-state frame cost, not stalls** — `over66` moves by only 2 and 4 across those segments and `warmupCompile` is a healthy 141 ms / 116 materials, so warm-up, shader compile and hitching are all cleared and the levers are per-frame cost (renderScale, post chain, draw calls / overdraw), **not** warm-up work. (2) **The box is far better than its own documented floor, so there is no regression to hunt** — run 5 put it at **54%** of frames over 33 ms; it is now 10–28%. His report is still correct, but the true statement is "it has never been 60", not "it got worse", so do **not** spend the card bisecting. **Caveat:** each segment carries ~16 s and ~24 s of menu/transition, which is cheaper than gameplay, so in-arena fps is somewhat *worse* than these averages — a per-arena isolation run is the next measurement, not a knob. **And the loop only counts `over33`/`over66`, so nothing currently measures the 16.7 ms bar the target is set at** — closing that instrumentation gap is step one. |
| Low | MOTION-A11Y-1 — `prefers-reduced-motion` doesn't actually reduce any motion | **Filed 08-05, spun out of TIER-DEFAULT-1's lever 4.** The OS accessibility flag was, until TIER-DEFAULT-1 closed, silently forcing the graphics quality tier to Low (cap-287/288: the same Intel box booted Low with Windows animations on and Medium with them off). TIER-DEFAULT-1 fixed the *tier* side (reduced-motion now demotes one rung inside `defaultTierForCaps()` — [gpuCaps.js](../../src/utils/gpuCaps.js) — instead of hard-pinning Low), but that was always an interim: reduced-motion should reduce **motion**, not graphics fidelity. Nothing currently reads the flag for motion at all. Candidates once picked up: attract-camera spin/drift, cart-impact screen shake, KO/win screen flash, any continuous idle animation loop. Needs a definition-of-done pass (which motions, how much) before it's a code card. |
| Low | CARGO-LATCH-1 — `cargoLoad.js` carries the same round-anchor latch as FIX-DIRPAUSE | **Filed 08-04** while fixing FIX-DIRPAUSE (`e7dd92e`), and deliberately left untouched there (out of scope by instruction). Same bug class: a latch that compares against the stored round-start anchor and treats **any** change as a new round, so a pause-compensation shift (which mutates `roundStartedAtMs` and then calls a shift helper) can be read as a round boundary and re-fire the overflow announce. The directive-engine fix was to shift the latch's anchor by the same delta inside `shiftDirectiveTimersBy`; check whether the same shape applies here, and whether cargo's latch is even reachable from the solo-pause and host-tab-return paths before spending a card on it. |
| Low | COUNTDOWN-QUICKPLAY-1 — empty quickplay countdown connect-wait edge case | In empty quickplay games, countdown either waits for player connection before starting or skips part of it. Documented from F8 captures (184–196); parked in backlog per Wyatt (07-22). |
| 🟡 Partial | NET-PERF-1 — reconcile rewind-replay cost | Caps shipped; residual if retest still rubber-bands. |
| Low | NET-PERF-3 — p2p per-message buffer copy | Only batch if F8 shows alloc pressure after NET-PERF-1. |
| Medium | Customize screen performance pass *(pre-ship 07-19)* | Measure before tuning. |
| Low | Countdown timer survives menu return *(pre-ship 07-19)* | Stale countdown UI on main menu. |
| Medium | WARM-SOLO-1 — solo post-`carts-ready` stall (WARM-IGPU-1 residual) | Laptop A cap-206 (**solo**) took a 6.4s longtask ~1.9s after `carts-ready`, inside the countdown. WARM-IGPU-1's Lever A does **not** cover it: arena rotation is quickplay-only, and solo's flyover warm already runs inside `ensureSessionCartsReady`. Proxy evidence says the residual is driver-side first-draw cost (a 13.1s menu-warm frame carried only 235ms of attributed span time), so raising budgets will not help. Candidate mechanism worth checking first: scene content added *after* the warm pass (CSS2D nametags, cargo bays — CARGO-RACE-1's self-heal adds 18–30 meshes per cart, announcer/VFX) introduces new materials whose programs link at the first live countdown draw. **Work only on real telemetry** (`warmupSettle` / longframe spans from a weak-GPU playtester), never on speculation — no iGPU hardware available to reproduce. |
| Medium | PROBE-WARM-RT-1 — VFX program anchors may be holding the wrong program key | Instrument-first; **no behavior claim until measured**. `outputColorSpace` and `toneMapping` are both pushed into three's program cache key (`getProgramCacheKeyParameters`) and both switch on `renderer.getRenderTarget() === null` — `outputColorSpace` unconditionally, not just for `toneMapped` materials. `compileAsync` (`main.js:2664`) binds no RT, so the anchors compile the **default-framebuffer** variant; the `composer.render()` prime (`:2679`) builds correct RT-variant keys only for what it actually *draws*, and the anchors are `visible=false` at `y=-500` (`koHitmarkerFx.js:259`, `cartShatter.js:1062` — both comments say "render skips them"). If that holds, the anchors' stated job (next KO is a cache hit) is defeated and the first shatter/KO/water/ram spawn links synchronously mid-round. **Measure first:** `renderer.info.programs.length` across the first KO. Fix only if it climbs — bind any non-XR RT around the anchor compile (1×1 scratch is enough; only `=== null` is tested). Making the anchors visible does *not* work: they are off-camera and cull. Pairs with WARM-SOLO-1 — same symptom class, different mechanism (that one is new content added after the warm; this one is the right content under the wrong key). Source: `ryancampbell/kart-royale` `src/core/Prewarm.ts`. **W0.1 evidence 08-03 (cap-229 @ c418bd9):** after Cart Rave play-shader settled at materials=497, a mid-round `warmupCompile` at materials=505 + **6.5 s** longtask/`warmupSettle` poll fired ~8 s into running — late program link signature consistent with RT-variant miss. Still measure-first; not in PLAYTEST-BATCH-0803 scope. |
| Medium | NET-RING-1 — decode-ring reject counters (review C-03) | Instrument-first. Rejects (dup/ooo seq etc.) burn ring slots AFTER decode; `netStateBuffer` retains ring-owned cart arrays by reference (`netcode.js:1422→1434`); true margin = 96−rejects, not 32, and only bites when consumption stalls. Count rejects-since-oldest-buffered; the copy-into-pooled-record fix only if counters show real traffic. |
| Medium | NET-P2P-DIAG-1 — WebRTC peer recovery is invisible in prod captures | **Filed 08-06** from a Copilot netcode review — *the only one of its seven risk areas that survived checking* (its other six were either already handled or already tested; see the review triage below). The recovery **logic** is fine and is not the card: `maintainHostPeerConnections` ([netcode.js:2366](../../src/netcode.js:2366)) already skips ICE `disconnected` for grace self-heal, skips fresh negotiations under `p2pConnectingTimeoutMs`, rate-limits per peer via `peerReconnectNotBeforeMs`, force-closes only non-`missing` peers before re-offering, clears the cooldown on health-ok, prunes dead conn ids ([:3146](../../src/netcode.js:3146)) and clears the whole map on migration/teardown ([:1977](../../src/netcode.js:1977), [:2438](../../src/netcode.js:2438), [:3715](../../src/netcode.js:3715)). **The gap is telemetry, not behaviour:** the reconnect path logs `devLog` (dev-only) and a bare `console.warn` on offer failure — **no `recordDiagEvent`** — so a host thrashing re-offers at the 3 s cooldown against one wedged peer produces an F8 capture with nothing in it. That is precisely the shape a player reports as "the other cart froze" and we cannot attribute after the fact. **Lever:** emit a `net` diag event on each recovery attempt (connId, `health.reason`, `health.ageMs`, attempt count since last health-ok) and on offer rejection; keep the existing rate-limit as the event rate-limit so a wedged peer cannot flood the ring. **Instrument-only — do not retune `p2pReconnectCooldownMs` / `p2pConnectingTimeoutMs` in the same commit;** those values have never been measured against a real failure and changing them alongside the instrument destroys the attribution the instrument exists to provide. Pairs with NET-RING-1 (both are counters-before-fixes). |
| Medium | DIAG-NET-CAPTURE-1 — `host_send_gap` fires into the ring but never triggers an upload | **Filed 08-06** from the same review. `recordDiagEvent("net", "host_send_gap", …)` already fires at >250 ms with a 1 s rate-limit ([netcode.js:832](../../src/netcode.js:832)), and the arrival side tracks `gapMaxMs` / `gapsOver100` in `netFlowStats` — but `AUTO_CAPTURE_CHANNELS` is `new Set(["error", "assert"])` ([diagnostics.js:51](../../src/utils/diagnostics.js:51)), so the `net` channel never reaches `scheduleAutoCapture`. **Consequence:** the evidence for the open *host 1–8 s freezes while FOCUSED near KO/PA* item only exists if Wyatt happens to hit F8 during the freeze — which is exactly when he is playing and will not. **Lever:** a narrow trigger, not a channel promotion — adding `"net"` to `AUTO_CAPTURE_CHANNELS` wholesale would upload on every routine net event. Gate on the event *type* plus a severity threshold (e.g. `host_send_gap` with gap > 1000 ms) and a per-session upload cap, then let the existing `scheduleAutoCapture` → `uploadAutoCapture` path do the rest — that path is already generation-guarded (DIAG-UPLOAD-GEN-1, closed 08-05) and drain-testable (DIAG-FLAKE-2), so **this is a trigger card, not an upload-plumbing card; do not reopen either.** `src/` only — no `tools/` edit, so it is not frozen during a game card. Pull with `npm run captures:pull` as usual. |
| Medium | PERF-WATCH-1 — auto-quality step-up path | Watchdog demotion is irreversible per session (no step-up anywhere; DEV-only warn; 2 tier steps + 2 renderScale steps; attract render-cost and game frame-delta both judged against one 20.5ms bar). Decide after WARM-IGPU-1 P0b telemetry shows how often it bites. |
| Medium | PERF-TIER-1 — `high-lite` tier rung | `DISCRETE_GPU_RE` puts a 1660 Ti in the same discrete→High bucket as a 4090; High→Medium cuts 4 knobs at once (DPR 2→1.25, reflector off, crowd, lasers). Blocked on HYGIENE-1's `--dpr` profiling — tier table may be tuned against an inverted ranking (512px reflector is DPR-invariant; full-screen cost ×4 at DPR 2). **Still open after TIER-DEFAULT-1 (closed 08-05):** that card deliberately declined NVIDIA/AMD model-number parsing (bottom-heavy taxonomy only — the classifier now separates entry-level discrete from full discrete, but does not split full discrete further), so a 1660 Ti still lands in the same discrete→High bucket as a 4090. This row is what closes that gap, once unblocked. |
| Medium | `structuredClone` → flat serializer in `party/index.ts` | Only after profiling shows it matters. |
| Medium | Persistent leaderboard / player stats `[SHIP-1 D2]` | Needs TRUST-1. |
| Low | Quickplay rotation live 2-browser check | Reconfirm after **QP-ORDER-1** (sequential rotation). Live multi-client smoke only. |

## Art

| Pri | Item | Notes |
|-----|------|-------|
| Medium | CART-COLOR-DEPTH-1 — cart colours read pastel (classic) and too dark (patterned) | **Filed 08-05 from Wyatt's FIX-EMISSIVE-1 pass:** *"they dont read blown out but they have a sort of pastel look to them i wish they could have a bit deeper color like vibrant and contrasty but not overly reactive to bloom… also patterned carts have the same problem but they are actually too dark."* **NOT a residual of FIX-EMISSIVE and not an intensity knob** — that card trimmed emissive intensity and did what it said; this is chroma. **Two different mechanisms, which is why the two cart types diverge.** (1) *Pastel, non-patterned:* body albedo is already the pure neon hex (`RAVE_GLTF_BODY_TINT_STRENGTH = 1` → `setHex(neonHex)`, [cartRaveGltf.js:222](../../src/cartRaveGltf.js:222)) and same-hue emissive is added on top; as that light climbs the strong channels clip at 1.0 while the weak channel keeps rising, so the channel RATIO compresses toward 1:1:1 — white. Lowering intensity moves down the same curve, it does not restore chroma. (2) *Too dark, patterned:* [`PATTERN_OVERLAY_TINT_SCALE = 0.22`](../../src/cartPatterns.js:49) at `PATTERN_OVERLAY_OPACITY = 0.95` multiplies the patterned area toward 22% of the tint — a heavy darkening across the whole pattern, independent of (1). **The constraint rules out the obvious fix:** "not overly reactive to bloom" + Classic's bloom threshold `0.5` ([scene.js:89](../../src/scene.js:89)) means raising emissive would bloom more, not read deeper. The levers are saturation and albedo contrast — candidates: a saturation boost on the emissive reference hex (`emissiveRefHexForNeonHex`/`cartEmissiveIntensityForHex`, [utils.js](../../src/utils.js)), a darker authored albedo so emissive supplies chroma rather than washing it, and raising `PATTERN_OVERLAY_TINT_SCALE` for (2). **DEFINITION OF DONE IS AMBIGUOUS — do not open this as a code card.** "Vibrant and contrasty" is not yet a number, the two symptoms may not share a fix, and Classic's ~15.9% construction-noise floor means `npm run compare` cannot judge it. First step is agreeing what "deeper" looks like — most likely a cheap side-by-side of 2–3 candidate treatments for Wyatt to pick from, since he is the instrument here. Related and still deliberately separate: Classic's `BLOOM_DISPLAY_NEON` profile, untuned since 07-13. |
| Low | SUNDIAL-LOW-WATER-1 — Low still skips the ocean normal map | **Filed 08-03**, the one residual after Sundial audit item 36 was otherwise closed. `waterNormalTex` is still built inside `if (!lowQ)` ([zanzibarPlatform.js:1427](../../src/levels/zanzibarPlatform.js:1427)), so Low's ocean has no ripple normal — the audit asked to keep it ("a 256 px canvas built once; one extra texture fetch, not a pass"). Everything else item 36 named is now on Low and was verified in source 08-03: foam ring (built on every tier with an explicit D-SUNDIAL-OQ6 comment), sun-path glint (ungated), 2 of 3 god-ray shafts (`rakeCount = lowQ ? 2 : 3`), a Low-specific ocean roughness of 0.5, and the reduced hologram — core + one glyph band + one ring — shipped in Wave 5 `0428f17`. Filed rather than built because Wave 6's close-out lever was scoped as verification only. Cheap; check the cost on the Intel UHD box, which is the min-spec smoothness floor. |
| Low | CART-FORK-SWIVEL-1 — the un-painted fork piece still does not steer with its caster | **Filed 08-02**, split out of CART-FORK-1 rather than folded in, because it is behaviour and that card was a one-line material fix. `tripo_part_23` is now correctly roled `fork` (`cartRaveGltf.js`), but it appears in **no** entry of `RAVE_GLTF_V4_FORK_GROUPS`, so it stays static while the caster it belongs to swivels. Its mirror twin `tripo_part_22` **is** in the BR group's `forkParts` and does swivel, which is the asymmetry to close. By position (`[-0.148, 0.197, +0.236]`, from the master GLB accessor bounds) it belongs to the **BL** group, whose `forkParts` is currently `["tripo_part_5", "tripo_part_21"]`. Cheap now that the role is right — `buildRaveGltfCaster` only accepts meshes already roled `fork` (`cartRaveGltf.js` ~:1963), so before CART-FORK-1 it could not have been added at all. **Check before shipping:** whether the piece is rigid with the fork legs or is authored at the connector, since `captureRaveGltfCasterRestTransforms` bakes rest transforms from whatever is in the list; and confirm `classifyCartrave4AnimRole` still lets it animate (centreY 0.197 and maxDim 0.056 are both well under the 0.38 / 0.48 static cutoffs, so it should). Verify by steering in a live match — the attract capture path does not exercise caster swivel. |
| High | Bloom look sign-off (Classic/Sundial) `[SHIP-1 E2]` | Art half of closed VFX-1. Success criteria now come from **ART-EXPO-1 / ART-FILTER-1**, not "dark arenas + punchy neon" — see [art-direction.md](../reference/art-direction.md). |
| Medium | Wilting-groceries Defeat screen reads as "confetti / something good" `[SHIP-1 E2]` | Needs art-direction call before code — see [art-direction.md](../reference/art-direction.md). Effects already fire (see closed **PRE-PODIUM-1**); this row is **look only**. MP observation closed (**FV-WILT-1** Wyatt PASS 08-04). |
| High | CART-MODEL-1 — new cart basket/model `[SHIP-1 C1]` | Wyatt-led Blender work completing the prototype-era cart design. Author against the **cart material contract** in [art-direction.md](../reference/art-direction.md) (required maps per slot, 2nd UV channel, wear language). While in Blender: clean body UVs / 2nd UV channel — unblocks patterns ([cart-pattern-reuv.md](../guides/cart-pattern-reuv.md)); fold **CART-FORK-1** if convenient. **Absorbed 08-05: ART-MAT-1** (authored maps on the carts) — arenas already author maps, carts were the only Rule 1 miss, and that work is this card's material contract, so it is no longer a separate row. |
| Low | CLAD-REPEAT-1 — stand cladding shares one repeat across three deck radii | **Was ART-PASS-CLASSIC-1 L4; dropped 08-01 and demoted, because the surface is barely visible.** The defect is real and measured: one `panelTex.repeat.set(24, 3)` (`effects.js:1441`) feeds one shared `cladMat` across three decks (`effects.js:1454`) whose r1 = 73/100/124 m and wallH = 12.2/10.6/9.8 m, so the authored 2:1 cart-silhouette motif renders **2.09×0.22 m on deck 0 and 3.55×0.18 m on deck 2** — 4.7× and 9.9× distorted, and inconsistent between rings. **Why it was dropped:** cladding sits at `deck.r1 + 0.55`, directly behind seating spanning r0→r1, so from every in-arena viewpoint tried the crowd and seats occlude it; a before/after GPU capture showed *zero* delta on the cladding itself (the 31% pixel diff was animated-crowd noise). A surface you cannot see does not earn a mid-table slot. Fix if ever picked up: per-deck material+texture clone like the seat loop (`effects.js:990`), `U = round(circumference / wallH)`, `V = 1` — the largest square tile each wall fits. |
| Low | LOD-PITRING-1 — the pit-ring dressing's cull radius is arguably inverted | **Filed 08-02**, split out of audit item 3. `registerLevelLodNode(pitDressing.group, { far: 48 })` — but `buildPitRingDressing` lays its silhouettes on a band at `OUT = 45.5` m radius ([backroomsSupermarket.js:2205](../../src/levels/backroomsSupermarket.js:2205)) around a group at the origin. So the ring is visible while the camera is near arena centre (far from the dressing) and **hides once the camera passes 48 m from centre — i.e. exactly when it gets close to part of the ring.** Distance-to-centre is the wrong metric for a ring centred on that point; the pit dressing either wants per-cluster nodes (one per side) or no LOD at all, since it is a handful of merged silhouettes. `doorways` (far 55, on the walls at 56) has the same shape and should be judged in the same pass. Lower priority than LOD-UNCANNY-1 because this is background dressing beyond the kill edge, not a fall marking. |
| Low | SHELF-RAIL-1 — the booth rails are the shiniest thing in a dead room | **Filed 08-02**, split out of audit item 4 rather than folded in as a silent ride-along. `railMat` ([backroomsSupermarket.js:2948](../../src/levels/backroomsSupermarket.js:2948)) is the **booth** rails, a different surface from the shelf steel, and separately the lowest-roughness / highest-metalness pair in the file — so under the RoomEnvironment PMREM it reads as polished chrome in a room where nothing else is polished. Item 4's new `buildShelfSteelTexture()` is a natural donor, but the rails also want their own roughness call, and doing both in one commit would have made the item-4 capture ambiguous. Also parked here: **per-bay board segmentation** (break each 114 m shelf board into bays with a 4 cm gap so the run reads as bolted sections) — a geometry/merge change, not a material one, and the audit lists it under the same item. |
| Medium | SKYBOX-DIR-1 — does a space skybox serve an underground-warehouse-party mood? | **Direction question, not a defect.** The 08-01 audit measured the visible sky as a ~0–5° sliver and found the arena's worst-authored props (3580 stars, gas giant, 2 UFOs) are the ones sitting in it — turned on for the first time by SKYBOX-1 (07-30, +54 draw calls). Either commit to it and author it properly, or cut it and spend the budget on the room. Wyatt's call; do not resolve inside an art-pass lever. Split out of ART-PASS-CLASSIC-1. |
| Medium | ART-FILTER-1 — arcade pass gated to The Storerooms | The CRT layer (aberration/scanlines/vignette) is written once in `createComposer` from global config, so every level inherits it. Add a per-level gate mirroring the VHS gate (`main.js` ~2448); preserve the impact-pulse base capture (`main.js` ~1110 / `frameVisuals.js` ~630). Before/after `npm run shoot` on all three arenas. Satisfies Rule 2. |
| Medium | ART-EXPO-1 — retire the global exposure lock | Replace the single `toneMappingExposure: 0.4` with a per-arena budget alongside `arenaExposureMul`. Captures the Rule 3 luma-floor baselines into [art-direction.md](../reference/art-direction.md). Fresh sign-off with before/after shots. |
| Low | ART-PALETTE-1 — reconcile 3D and 2D neon | 3D is frozen on pure `CART_COLORS` (`0xff00ff`); 2D banned those hexes as off-brand and uses `#ff2bd6`. **The only card permitted to unfreeze the AGENTS.md invariant.** |
| Medium | Pattern customize UI `[SHIP-1 C3]` | Unblocked by CART-MODEL-1's re-UV. |
| Low | Sunglasses finish materials broken `[SHIP-1 E2]` | |
| Low | Asset filename rebrand (`cart-rave-base*.glb` etc.) | Deliberate asset pass — [brand.md](../brand.md). |

## Audio

| Pri | Item | Notes |
|-----|------|-------|
| Medium | HIT-SFX-VAR-1 — more cart hit SFX variety `[pre-ship]` | Current hit clips are too repetitive. **Blocked on Wyatt providing new sound clips**; then wire into the hit pool (random / cooldown / velocity tiers — pick cheapest that reads varied). |
| Medium | Announcer re-records (Wyatt) `[SHIP-1 E3]` | Shorter directive takes + odd lines. Pipeline drop-in. |
| Medium | Sudden Death music low-pass `[SHIP-1 E3]` | Audio-graph surgery (shared Howler bus). |
| Low | VOICE-BUS-1 — announcer has no volume of its own | **Filed 08-05 from the pre-launch audit.** The announcer — the game's signature audio feature — rides the SFX bus with no level control: [announcerManager.js](../../src/announcer/announcerManager.js) has no volume handling, and settings offer only on/off (`announcerVoiceEnabled` / `announcerCalloutsEnabled` in [settingsStore.js](../../src/stores/settingsStore.js)). **Scope:** a voice slider as a third category alongside music/SFX in [audioStore.js](../../src/stores/audioStore.js) + [audioControls.js](../../src/ui/audioControls.js). **Decide AUDIO-MASTER-1 in the same ack** (Tech Debt: `_masterVol` is write-only dead state — wire it as a real master or delete it) and mind that row's clamp warning: store domain is 0..1.15, Howler ceiling 1.0. This is the narrow slice of the `[SHIP-1 E3]` Howler-upgrade row's "volume groups". |
| Low | Deeper Howler upgrade `[SHIP-1 E3]` | Spatial, pooling, volume groups. |

## Design / Gameplay

| Pri | Item | Notes |
|-----|------|-------|
| Medium | NPC-BOOST-1 — NPCs feel like they boost "better" than players | **Filed 08-04 from external playtester perception.** Not yet measured — do not retune knobs on vibes. **Known asymmetry by design:** humans use charge-release nitro (`boostCharge` 1.5s to full, then burst) while NPCs fire **instant** boost (`triggerRamBoost` `{ instant: true }`, [main.js:4388](../../src/main.js:4388) / [config.js:164](../../src/config.js:164)) so bots never freeze charging in traffic. Shared caps: same `durationSec` / `boostedMaxSpeed` / cooldown family; NPCs also get aim-cone + range gates and solo rubberband nitro mul. Hard difficulty tightens aim (`boostAlignmentAngleDegDelta: -12`). **Why a tester can still feel "bots better":** zero charge tax, opportunistic auto-fire when aimed, gold/charged trail language only on human full-charge release (so NPC boosts look "cleaner"/more frequent). **Method before code:** Solo Medium/Hard, note human charge delay vs bot instant windows; if still unfair after knowing the design, options are (a) short NPC wind-up, (b) slightly lower NPC boostedMaxSpeed/accel, (c) looser player charge (`boostChargeTimeMs`), (d) leave it and teach charge in ONBOARD-SLIDES-1. Related: closed HIT-FEEL-1 / AI-DIFF-1. |
| Medium | Taste-tuning follow-ups from Pass 4 | Only reopen with playtest evidence (D-GP4-1). |
| Medium | Clutch slow-mo (Pass 5 deferral) | Taste-gated. |
| Low | Turntable swirl force revive | Scoped prototype via DIR-1 — taste-gated. |
| Low | KO "doomed" presentational cue | Idea stage. |
| Low | Death-cam "follow killer" revisit | Previously reverted. |
| Low | Animate the customize sunglasses-tab camera zoom | |
| Low | Subtle monetization path | Idea stage only. |
| Low | Controller vibration strength *(pre-ship 07-19)* | |

## Playtest owed

Stuff that shipped and still needs your eyes on **production**
(https://cart-rave.wyabro.workers.dev — hard-refresh first).  
**Exception:** NET-AUDIT-* is **unpushed** as of seed — use `npm run dev` (or ship first).
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
console every regeneration and got re-run. The export now says so out loud.

| Pri | Item | Notes |
|-----|------|-------|
| High | UI-P2-HUD-PT-1 — in-match HUD reads right after the rem conversion `[phone]` | **Owed: Wyatt playtest — UI-P2-HUD-PT-1 — the in-match HUD looks the same as before, just scaled sanely on your phone.** Shipped 08-06 (`dacca48`), deployed 08-06 (prod Worker `f2b389d6`). `hud.css`'s 108 saturated clamps converted to rem; the 08-05 phone/orientation patches were left untouched on purpose.<br>1. On your phone, play a solo round.<br>2. Look at the score chips, timer, kill feed, and boost bar — do they read as the same design as before (just appropriately sized for the phone), or does anything look tiny, oversized, cut off, or overlapping?<br>3. PASS if nothing looks wrong. FAIL with a screenshot of whatever's off. |
| High | UI-P2-PAUSE-PT-1 — pause overlay reads right after the rem conversion `[solo]` | **Owed: Wyatt playtest — UI-P2-PAUSE-PT-1 — the Esc pause screen looks the same as before.** Shipped 08-06 (`5cbc63f` + `78acdb4`), deployed 08-06 (prod Worker `f2b389d6`).<br>1. Mid-round, press Esc.<br>2. Check the PAUSED panel: title, audio sliders, controls list, RESUME/RESTART/MAIN MENU buttons — proportionate, nothing crowded or oddly sized?<br>3. Hover the buttons with a mouse — do RESUME etc. still light up on hover like before? (This is also the TOUCH-HOVER-1 check's fine-pointer control case — hover should be unchanged on a mouse, only touch changes.)<br>4. PASS if it reads exactly like before. FAIL with a screenshot. |
| High | UI-P2-RESULTS-PT-1 — results/podium screen reads right after the rem conversion `[solo]` | **Owed: Wyatt playtest — UI-P2-RESULTS-PT-1 — the results podium looks the same as before, crown icon included.** Shipped 08-06 (`271c5cc`), deployed 08-06 (prod Worker `f2b389d6`). The winner's crown icon's font-size changed from a bare `15px` to `0.9375rem` (identical at scale 1) because it also sizes an SVG via `1.15em` — this is the one site worth a specific look.<br>1. Finish a solo round.<br>2. On the results podium, check the winner's crown icon above their name, the rank cards, and the match receipt panel — sized and positioned like before?<br>3. PASS if it all reads the same. FAIL with a screenshot, especially if the crown looks wrong. |
| High | TOUCH-HOVER-PT-1 — buttons don't stay lit after a tap `[phone]` | **Owed: Wyatt playtest — TOUCH-HOVER-PT-1 — tapping a button on your phone doesn't leave it looking hovered/lit afterward.** Shipped 08-06 (`78acdb4`), deployed 08-06 (prod Worker `f2b389d6`). Before this, a tap set `:hover` and it stuck until you tapped elsewhere; automated checks (`npm run states`' touch-hover survey) now read 0/9 on the menu, but no human has tapped it yet.<br>1. On your phone: tap READY in a lobby, tap the mute button, and (after a round) tap a results-screen button.<br>2. After each tap, look at the button you just tapped — does it stay visually "lit"/lifted/highlighted after your finger leaves it, the way a desktop mouse-hover would show?<br>3. PASS if buttons return to their normal look right after the tap (a brief press flash is fine — that's `:active`, not the bug). FAIL if a button stays lit until you tap something else, and say which button. |
| High | NET-LOOK-ACC-1 — non-host sunglasses + pattern now replicate `[2pc]` | **Owed: Wyatt playtest — NET-LOOK-ACC-1 — your peer's real pattern and sunglasses show on their cart instead of classic pattern / silver-mirror glasses.** Shipped 08-06 (`1198d26`, prod Worker `3cfb33f8`) — `patternId`/`sunglassesStyle` now ride the wire alongside `lookHex`; color already worked, this closes the other two fields the original NET-AUDIT-SLOTS-LOOK-1 PASS flagged as wrong. Dev-verified with two real network clients (wire payload + resolver both correct, 8/8) — this is the first real human check. **Use a Friends lobby** (Quickplay's NPCs don't carry these fields, so a 2-human Quickplay room is fine too but a Friends room guarantees no NPC noise).<br>1. On two machines, before starting a round, each of you picks a **different** pattern and a **different** sunglasses style in Customize (a custom hue too, if you like).<br>2. Within a couple seconds, each of your screens should show the OTHER player's real pattern and glasses on their cart in the lobby — not plain/classic pattern, not the default silver-mirror glasses.<br>3. Start the round. PASS if both peers' real pattern + glasses are still correct once carts spawn and stay correct through play.<br>4. Known limit, not a fail: if you change sunglasses again from Customize **after** the round has already started, your peer won't see the new glasses until your cart's next KO respawn (glasses are baked into the cart model, no live swap — pattern *does* update live, no delay). |
| Medium | PERF-9CELL-1 — Intel Low 9-cell PERF sweep `[solo]` | ⏸ **PARKED 08-05 with its parent PERF-PASS-1 — deliberately NOT seeded to the console.** It came back **FAIL 08-05** with *"idk what you are asking me to do here"*, and that was the card's fault, not Wyatt's: it said "run the handover's 9-cell matrix" and left the actual protocol 300 lines deep in a 484-line doc, so the console showed him a 25-minute measurement sitting with no cells in it. **PERF-PASS-1 has been parked since 08-04**, so the sweep was queued ahead of the card that consumes it. **Do not reseed this until Wyatt unparks PERF-PASS-1.** When he does, it is runnable straight off this row — no handover round-trip: **URL** `https://cart-rave.wyabro.workers.dev/?diag=1&preset=low&level=classicRecord&ablate=<token>`; **setup** Solo host, 3 NPCs, Cart Rave, entered *through the menu* (not a room link), Low tier, box cooled between cells; **per cell** play 60–90 s → **F8 mid-round** (`loopRound` is live, no podium needed) → `npm run captures:pull` → read `snapshot.perf.loopRound.meanMs`, discarding any cell where `straddledDemotion` is true. **Tokens in order:** `none` → `crowdcarts` → `crowd` → `pitlights` → `stadium` → `stagerig` → `billboard` → `bulbs` → `none`. **`none` runs FIRST and LAST**; if the two baselines differ by more than ±1.5 ms mean the box drifted and the whole sweep is void. **Never combine tokens** — the effects are not additive and combos destroy attribution. Full rationale, per-token expectations and the stills protocol: [perf-pass-1-handover.md](./perf-pass-1-handover.md#the-sweep--nine-cells-25-min-of-play-on-wyatts-intel-box). |
| Low | SHARD-PT-2 — fifth human overflows to quickplay2 `[2pc]` | **Owed: Wyatt playtest — SHARD-PT-2 — the 5th concurrent Quickplay human lands on quickplay2 instead of "couldn't join".** Launch-day / public-post check — needs five real humans (Wyatt deferred 08-05). Rig already 5/5; SHARD-PT-1 PASSed on prod `9c333d1`. Prefer analytics: any `quickplay_shard_assigned` with `hops > 0` or `shard !== quickplay` counts.<br>1. When five humans can join Quickplay at once (public post), watch the 5th seat.<br>2. FAIL if they get the dead-end couldn't-join toast with no hop. PASS if they seat on an overflow shard (or analytics shows hops greater than 0).<br>3. Skip / leave open until launch day — do not FAIL for lack of five people. |
| Low | AQ-RING-CLEAR-1 — autoQuality clear sample ring on every window eval | **Reserve only** if Wave 2 entry grace still demotes on retest. Comment in autoQuality.js already notes the ring can poison up to 3 windows. Own commit if needed; not in main batch path. |

## UI / UX

| Pri | Item | Notes |
|-----|------|-------|
| Medium | MENU-CART-1 — main-menu 3D cart under player name | **Filed 08-04 from Wyatt.** Reuse the customize `CartPreview` ([cartPreview.js](../../src/ui/cartPreview.js) — already mounted only while customize is open via [cart-rave-menu.js:900](../../src/cart-rave-menu.js:900)) on the **main menu under the name plate** so players admire color/pattern/sunglasses without opening Customize. **Not** a second GLB loader path — same `CartPreview` instance or a shared factory; sync look from localStorage/store the same way `syncCartPreviewLook` does. **Constraints:** must not fight menu attract perf (ATTRACT-JANK-1 / PERF-PASS-1) — pause/hide when customize open; consider Low tier still-frame or lower DPR; one WebGL context only if the stack already shares the game canvas (prefer CSS overlay viewport into existing pattern, do not spawn a second full rAF renderer if avoidable). **Pass:** main menu shows your cart under your name; changing color/pattern in Customize updates it when you return; no extra hitch on weak machines. Pairs with SHIP-1 C / customize pride; not blocked on CART-MODEL-1. |
| High | ONBOARD-SLIDES-1 — how-to-play as click-through visual slides `[pre-ship]` | Replace wall-of-text “how to play” with a **slideshow**: card-by-card slides the player can click through, each with GIF / short animation / picture so rules land fast. Keep Solo-as-tutorial stance. Needs asset list (slide topics + art) before full polish. **Absorbed 08-05: ONBOARD-1** (`[SHIP-1 E4]` first-run controls card) — it was already marked "fold into this card", so it is no longer a separate row; if a one-shot controls reminder is still wanted *after* slides ship, file it fresh with its own evidence rather than reviving the stub. |
| Medium | COLOR-ID-1 — player identity is hue-only in a 4-player brawler | **Filed 08-05 from the pre-launch audit.** Player identity is carried entirely by neon hue — `--hud-player-accent` drives HUD scoreboard rows and the kill feed, cart bodies carry slot neon — with **no secondary channel anywhere**, so colorblind players (~5% of a public audience) cannot reliably tell four carts apart. The repo already knows the rule: [hud.css:1826](../../src/ui/styles/hud.css:1826) says warn/urgent "must never be hue-only" — this extends it to identity. **Scope: slot glyphs only** (a per-slot shape marker on HUD scoreboard rows + kill-feed entries; optionally over carts) — explicitly **not** a full colorblind mode or palette remap, and does not touch the frozen `CART_COLORS` invariant (ART-PALETTE-1 owns that). Patterns/sunglasses already differentiate carts visually when unlocked — glyphs close the gap for the default classic-heavy grid. |
| Low | LOAD-TIPS-1 — loading screen teaches nothing while it has the player's full attention | **Filed 08-05 from the pre-launch audit.** [loadingScreen.js](../../src/ui/loadingScreen.js) renders zero tips or hint strings — the mode-entry wait is dead air for a first-time player about to enter a 4-cart brawl. **Scope:** a small rotating tip line (charge boost, hop, directives, combo tiers, sudden-death rules) on the loading screen. Topic list overlaps ONBOARD-SLIDES-1 — if slides land first, source tips from the same copy; if this lands first, it is the cheapest 80% of that card's value. Layout note: the loading screen's scale problem is **LOAD-SCALE-1** (owned by the UI-SCALE-1 pass) — don't fix geometry here, just add the line inside the existing centre stage. |
| High | RESULTS-1 — results screen layout redesign `[SHIP-1 E1]` | |
| Medium | Controller menu navigation polish *(pre-ship 07-19)* | Modal-scoping shipped 07-20; remaining = polish + pad-in-hand validation. |
| Medium | UI-FRAME-1 — premium frame/panel styling pass `[SHIP-1 E1]` | |
| Medium | ESC scoring panel refresh `[SHIP-1 E1]` | |
| Low | Main-menu SFX slider `[SHIP-1 E3]` | |
| Low | *(LOAD-SCALE-1 ✅ closed 08-06 — [completed-work.md](./completed-work.md))* | |
| Low | STATES-DEAD-1 — interactive-state CSS for elements that no longer render | **Found 07-31 by `npm run states`** (FIGHT-VERIFY-1 Phase B) via its reachability family, which enumerates every `:hover`/`:active`/`:focus-visible` rule from the live CSSOM and asserts each one matches a live element on some visited screen. Seven subjects match nothing, on any of the 11 screens the tool sweeps (menu · customize + its sunglasses and patterns tabs · settings · challenges · how-to · in-match HUD · pause · results podium · touch in-match): **(1) `.cr-touch-btn`** (`cart-rave-menu.css:182`, `:active`) and **(2) `.cr-kbm-toast-close`** (`:178`, `:hover`/`:active`) — both class names appear in **zero `.js`/`.ts`/`.html` files repo-wide**; the CSS is all that is left of them. **(3) `.cr-level-btn`** (`:529` `:hover:not(.cr-level-btn--disabled)`, `:2400` inside the designed focus ring, `:3289` in the reduced-motion block) — the arena radiogroup at `index.html:703` carries the `hidden` attribute and its own comment calls it a "hidden radiogroup: arena data source"; the visible control is the `.cr-arena-page` pager. That also means the nine-selector designed focus ring at `:2398-2409` is an **eight**-selector ring in practice. **(4-6) `a`, `select`, `[role="button"]`** — three of the five element types listed in the unscoped fallback ring at `src/ui/loadingScreen.css:577`; no `<select>` and no `role="button"` element exists anywhere, and the only `<a>` elements created are transient download links (`main.js:5604`, `postFxDebug.js:190/241`). Harmless defensive CSS, but it means that rule is doing two-fifths of the work it looks like it does. All seven are held in `DECLARED_UNREACHABLE` in `tools/states.mjs` with these reasons, printed on stdout every run and in the montage banner — **and if any of them ever starts matching again the run says so out loud**, so declaring them does not hide a future regression. |
| High | TOUCH-HOVER-1 — ⏳ shipped 08-06 (`78acdb4`), awaiting Wyatt playtest | Gated all 11 remaining `:hover` rules across the six UI-SCALE-1 Pass 2 files behind `@media (hover: hover) and (pointer: fine)` (Pass 1 L5's pattern) — full worklist and cascade-order notes in the commit. **Verified:** `npm run states` 252/259 (4 pre-existing menu-reachability FAILs, none new); the aggregate touch-hover-latch survey on the touch-menu screen now reads **0/9** (was 2/5 when this row was filed). The two originally-named offenders, `.cr-reroll` and `.cr-plate .cr-plate-btn`, are `cart-rave-menu.css` selectors already covered by Pass 1 L5 — this row's own 11 sites were the six-file remainder. **Not closed** — no phone tap check yet; see Playtest owed. |
| High | UI-SCALE-1 — Pass 1 ✅ PASSed 08-05; Pass 2 ⏳ shipped 08-06, awaiting Wyatt playtest | Two passes per [responsive-scale-migration.md](./responsive-scale-migration.md): fluid root + rem clamps; media queries stay px. **Pass 1** (`9e2ec60`..`f057abe`) — `tokens.css` root scale, `cart-rave-menu.css` fully converted, ≤768 reflow answered "phone = fewer elements", menu hover gated. Playtest: UI-SCALE-RESULTS-PHONE-1 / -WIDE-1 / UI-SCALE-FEED-PHONE-1 all PASS 08-05. **Pass 2** (`dacca48`, `271c5cc`, `5cbc63f`, `8c65bd7`) — the same clamp→rem conversion on `hud.css`, `results.css`, `pauseOverlay.css`, `announcer.css`, `stickers.css`, `loadingScreen.css`, base scope only (media-query internals and breakpoint reconciliation deferred — see UI-SCALE-P2-MEDIA-1 below). `npm run qa` 7/7 throughout; MAE identity-gated at 1920×1080 + 3440×1440 on every file. SHEET-1 fully used (sheet/podium/loadshots); pauseOverlay/announcer covered by a scratch capture script (no dedicated tool). **Not closed** — playtest cards below. |
| Low | UI-SCALE-P2-MEDIA-1 — Pass 2's deferred media-query cleanup | **Filed 08-06, split out of UI-SCALE-1 Pass 2 on Wyatt's pre-ack review** ("skip @media internals" — exact Pass 1 precedent, to avoid re-opening the 08-05 phone/orientation patches that already playtest-PASSed). Doc rules 5–6 remain undone: delete `@media` blocks that only adjust *size* now that the root scale covers it, and reconcile the drifted breakpoints (900, 1100, 560, and any others found) back to the documented 380/768/1024/1025 contract. Do this file-by-file, same base-clamp discipline, and re-run the relevant playtest card after each file since it touches the phone-specific rules directly this time. |

## Tech Debt

Jam-era structure that still works but accrues cost. Prefer seams after multiplayer is proven.
Priorities below are post-gate unless Wyatt pulls them forward.

| Pri | ID | Item | Notes |
|-----|----|------|-------|
| Medium | SHADOW-HAZARD-SEAM-1 | Pre-build contact-shadow hazard API | **Filed 08-04** when MAIN-1 cut the infeasible C2 hoist. Player bug closed by SHADOW-ORDER-1 (`6560552` — explicit hazards at cluster create). Seam remains: `setContactShadowHazards` still runs after `loadLevel` (`applyLoadedLevelSideEffects`); `levelHazards` is **output** of the builder, so “hoist before builder returns” is circular. Closing generically needs static/pre-build hazard data (or keep the per-cluster explicit-passing pattern). **Not** a MAIN-1 lever — level-module design. Trigger: next arena that grounds outboard props during construction without an explicit hazards override. |
| Medium | SHIP-1 | V2 shipping checklist + final QA doc | **Created 07-20** — [SHIP-1.md](./SHIP-1.md), living doc; row stays as pointer until ship. |
| Medium | STORE-1 | Collapse `gameState` facade dual import | |
| Medium | DIR-1 | Directive modifiers without mutating `CONFIG` | |
| Medium | TRUST-1 | Worker validates host-asserted outcomes | Prerequisite for trusted leaderboard. Builds on SRV-TEST-1 helpers. `[SHIP-1 D1]` *(was also an Engineering row — deduped 08-01)* |
| Low | CHUNK-MEMBER-1 | Initial-set chunk membership: `errorReporter` chunk carries netcode + the cart rig | **Filed 08-05 from the pre-launch audit. NOT a BUNDLE-1 reopen** — no warm-perf goal (that hypothesis is falsified and closed); this is initial-download-set **membership**, worth ~bytes only to **cold first-time visitors**, which is exactly the profile a public launch maximizes. The 266 KB chunk *named* `errorReporter` in the 14-file initial set (per `dist/.chunk-manifest.json` / [bundle-budget.json](../bundle-budget.json)) actually holds ~56 modules including `netcode.js`, `cartRaveGltf.js`, `bootstrap.js` and the whole `src/netcode/` folder — game-side code in the menu's critical path under a misleading name (rolldown names a catch-all chunk after its first module, so the budget file reads as "error reporting is 266 KB" when it is not). Also: a duplicate empty `captureUpload-*.js` chunk (107 B, 0 modules). **Lever:** chunking group boundaries in [vite.config.js](../../vite.config.js); the Lever-F membership gate in `size:check` makes regressions loud. **Judge on the cold profile; do not re-litigate warm `menu-ready`.** |
| Low | GLTF-1 | Drop legacy cart GLTF layout path | |
| Low | DUAL-1 | Delete leftover dual-era paths | |
| Low | TS-1 | TypeScript on hot paths / TS 7 | Stay on TS 6.x for the gate. |
| Low | TOOL-1 | Tooling residue | |
| Low | Vite 500 kB chunk-size hint | Cosmetic. |
| Low | BRAND-1 | Brand / domain cutover ceremony | Frozen — [brand.md](../brand.md). |
| Low | RESULTS-GLOW-1 | `.results-defeat .results-title { --title-glow }` never applies | **Note for later (cosmetic, pre-existing).** `main.js` sets that property **inline**, so no stylesheet rule can outrank it. Defeat still reads because the panel filter desaturates everything. Do **not** reach for `!important` unless a real look pass re-owns title styling. Not a ship blocker. |
| Low | AUDIO-MASTER-1 | `_masterVol` is write-only dead state | **Filed 08-02** during MENU-MUSIC-VOL-1. `audioManager.js:14` initialises `_masterVol = 0.575` and `restoreVolumeState` (`:233`) clamps and re-assigns it — but **nothing ever reads it**, so the "master" volume the boot path carefully restores from localStorage has no effect on any bus. Music and SFX each carry their own category volume (`_musicVol` / `_sfxVol`) and `applyAllVolumes` deliberately pins `Howler.volume(1)`, so there is no master stage left for it to feed. Either wire it up as a real third stage (product decision — it would rescale every existing user's audio) or delete it and drop `master` from the restore payload. **Do not** "fix" it by multiplying it into the Howler writes without a look at MENU-MUSIC-VOL-1's clamp: the store domain is 0..1.15 and Howler's ceiling is 1.0, so an extra 0.575 factor would silently re-scale the whole mix. Not a ship blocker; zero current behaviour. |

### Explicitly *not* tech debt (do not “modernize” these)

| Topic | Why leave it |
|-------|----------------|
| Host-**authoritative** Rapier (clients may predict) | Architecture invariant — clients step the same world locally for feel; the host is sole authority and the server never simulates. [AGENTS.md](../../AGENTS.md). |
| Zustand + KO event reactors | Current and coherent. |
| partyserver + WebRTC P2P split | Control plane vs gameplay plane is correct. |
| Big `config.js` knob table | Fine if knobs stay centralized; DIR-1 stops mid-round mutation. |

## Future Ideas (post-launch)

- WebGPU compute shaders for targeted VFX — after mobile perf; no physics rewrite.
- Economy/XP progression beyond lifetime unlocks — only if reopened deliberately.
- Domain + full rebrand cutover (BRAND-1).
- MAIN-1 → BUNDLE-1 after V2.
- DIR-1 runtime modifier stack if Living Store grows mutators.
- GLTF-1 legacy layout deletion after cartrave4-only sign-off.

---

## Closed / do-not-reopen reference

Every ID below is **closed** — full writeups live in [completed-work.md](./completed-work.md).
This list exists so nobody re-files a closed card without new evidence; agents grep it, humans
can skip it entirely. Relocated here from the top of the file 08-06 — it was never `##`-scannable
prose, and pushing 130+ IDs at anyone before they've seen a single open item was the biggest single
readability tax this file had. Nothing else on this page changed.

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
HARNESS-NULL-1, HARNESS-FRIENDS-1, HARNESS-FREEZE-1, …
