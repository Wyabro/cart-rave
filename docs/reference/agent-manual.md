# Agent operating manual — Cart Clash

> **Deep reference. Not always-on.** Always-on rules live in root [`AGENTS.md`](../../AGENTS.md)
> (~2k tokens). Agents load **this file on demand** when the task needs stack detail,
> full process, playtest authoring, enforcement internals, or skill-routing depth.
>
> **Read when:** multi-file wave planning · debugging process/gates/hooks · playtest console
> authoring · cross-module architecture work · anything the slim AGENTS points here for.
>
> **Do not** restate this whole file into the system prompt. Progressive disclosure:
> BRIEFING → slim AGENTS → this manual only as needed.
>
> **Tool defaults (2026-08):** Grok and Codex are **equal** heavy-lift drivers. Cursor =
> IDE/backup. Claude is demoted. If older prose below still says "Claude first," slim
> AGENTS.md routing wins.

---

# Full rules body (expanded)

**Canonical always-on rules:** root `AGENTS.md`. **This file** is the on-demand expansion.
Pointer files must not restate stack/invariants/gates. If any other doc disagrees about how
the stack works, **AGENTS.md and the code win** — verify against the tree, then fix the other doc.
**Product name is Cart Clash.** Deploy host, Worker name, and some code IDs still say
`cart-rave` until domain cutover — see [docs/brand.md](docs/brand.md). All wording —
player copy, announcer lines, docs — follows [docs/style-guide.md](docs/style-guide.md).

**Session rehydration (read first when cold):** read [docs/BRIEFING.md](docs/BRIEFING.md) —
generated from STATUS.md, **committed to git so every tool sees it without running anything**:
phase, the one active item, waiting-on-Wyatt vs agent work, do-nots, gates. Then this file,
then [docs/STATUS.md](docs/STATUS.md) for full context and gotchas. If you can run npm,
**`npm run dashboard`** adds the observed-evidence Command Center (git HEAD, gate/battery
results, captures) — see Commands below. **This paragraph is the rehydration protocol** — it
lives here, once. Do not restate it in STATUS.md or anywhere else.
**Codebase map:** [docs/ARCHITECTURE.json](docs/ARCHITECTURE.json) — generated + committed
machine-readable manifest: every file's owning system, dependency edges, fragile systems,
pitfalls, and a `do_not_break` block. **Look files up in it; never read it whole — it is
~30,000 tokens.** For the file you are about to touch:
`Select-String -Path docs/ARCHITECTURE.json -Pattern <filename> -Context 4,12`.
`npm run dashboard` also renders the human-facing architecture map (link on the Command
Center). Regenerate with `npm run arch` after structural changes — `health:check` fails if it drifts.
Architecture snapshot: [docs/planning/project-state.md](docs/planning/project-state.md).
Deep reference: [docs/reference/Game_Architecture.md](docs/reference/Game_Architecture.md).
Art direction: [docs/reference/art-direction.md](docs/reference/art-direction.md) — canonical
look doc (per-arena budgets, cart material contract, five falsifiable rules). Read before any
material, lighting, or postFX change.

**Paste-able session opener** — for any tool that does not auto-read repo files (Grok Build,
fresh web chats), paste this verbatim to start a session:

```text
You are working on Cart Clash (repo cart-rave, branch cart-clash). Read docs/BRIEFING.md,
then AGENTS.md, then the top of docs/STATUS.md, and follow them. Plan → Wyatt ack → apply
before any edit (ACTIVE CARD names the card, not permission to code). Ack is per WAVE: one
plan covering every lever in the wave plus its playtest checklist, one ack, then execute —
one commit per lever, stopping if a lever fails its asserts. One card at a time. Do not touch
tools/ or .claude/hooks/ during a game card. Gates: npm run qa — report results by number.
Ship only on Wyatt's explicit "ship it"; never git add -A. Never claim "done" without pulling
cart-clash and verifying HEAD.
```

**History lives in [docs/archive/](docs/archive/README.md), not in STATUS.md.** STATUS.md
carries only the current session window; older session logs and full-text decisions are rolled
into dated archive files indexed by [archive/README.md](docs/archive/README.md). When you need
the *why* behind past work, grep the archive for the symbol or date — do not read those files
whole, and do not assume STATUS.md is the complete record.

**Before any cross-module change, read
[docs/reference/control-flow.md](docs/reference/control-flow.md).** Most high-traffic edges in this
codebase are *not* imports — they run through injected `callbacks`/`deps` objects, the string-keyed
`MSG.*` wire protocol, and zustand subscriptions. Grep alone will tell you a live function is
dead, but it will not show you those wired edges — control-flow.md is the map for those.
(`main.js` was a single ~4,500-line closure before the BUNDLE-1 split, 08-05; it is now a
**1,287-line** composition root. The god-file mass moved, not away: `netcode.js`, `effects.js`,
`simulation.js`, and `hud.js` are each 3,000+ lines now.)

Cart Clash is a browser-based **4-player shopping-cart physics sumo** game. Neon shopping
carts battle on arena floors; ram opponents off the edge or into voids to score.
Rounds run **150 seconds**; highest score wins (Sudden Death on ties). Production:
<https://cart-rave.wyabro.workers.dev/>. Active development on the **`cart-clash`** branch
toward Version 2.

---

## STACK (verified facts only)

- **Hosting / backend:** Cloudflare Workers + Durable Objects, deployed via **`wrangler`**
  (`wrangler.jsonc`; DO class `CartRaveServer`, SQLite migration `v1`, static client served
  from the `dist/` `ASSETS` binding). There is **no** separate static host — the Worker
  serves the client and hosts the room. It is **not** the PartyKit hosted platform.
- **Room / connection server:** the **`partyserver`** npm library (`party/index.ts`) for
  room + WebSocket lifecycle, slot management, and lobby/round state. Client uses
  **`partysocket`** (`src/netcode.js`) for the control-plane WebSocket.
- **Realtime game transport:** **WebRTC DataChannels, peer-to-peer** (`src/netcode/p2p.js`).
  Host transforms, client input, and grocery-spill events bypass the server entirely (see
  Architecture Invariants). Cloudflare Calls mints TURN credentials via the server.
- **Rendering:** **Three.js** (arenas + Draco cart GLBs under `public/models/`).
- **Physics:** **Rapier3D** — runs **client-side**, host-authoritative. The host is the single
  source of truth; predicting clients step the same world locally. The server never simulates.
- **Build / dev:** **Vite**.
- **State:** Zustand stores (`src/stores/`). Audio: Howler.js. Touch: nipplejs. Debug UI: Tweakpane.

### Commands

- **Deploy:** `npm run ship` = `vite build && npx wrangler deploy`.
- **Dev (client only):** `npm run dev` (Vite).
- **Dev (server only):** `npm run dev:party` (`npx wrangler dev`, local Durable Object).
- **Dev (both, preferred):** `npm run dev:local` (aliases: `dev:cart-clash`, `dev:next-level`).
- **Gates:** `npm run qa` (alias of `check` — **the chain is defined once, by `check` in
  package.json**; currently `status:size` → typecheck → test → knip → `briefing:check` →
  `arch:check` → `health:check`). Every step is **read-only**: qa never regenerates or
  dirties the tree — regeneration happens in the pre-commit hook, `npm run dashboard`, or
  `npm run refresh`. Also `npm test`, `npm run typecheck`, `npm run build` (Vite →
  `dist/`). CI runs `npm run qa` + production build on push/PR to `cart-clash` / `main`.
  Exact-HEAD release gate (complete battery evidence): `npm run release:check` — battery
  stays out of ordinary PR CI.
- **Remote sync:** `npm run verify:head` — asks the remote directly (`git ls-remote`, zero
  writes) whether this tree is ahead / behind / dirty. Exit 0 in sync · 1 drift · 2 setup
  error; `-- --json` for tooling. Deliberately **not** in `qa` (a network call must never
  gate CI or offline QA); it runs inside `release:check` and in the Stop hook below.
- **Visual QA:** `npm run shoot`, `npm run compare`, `npm run blackframes`,
  `npm run qa:visual` (short black-frame battery) — see
  [docs/guides/visual-qa.md](docs/guides/visual-qa.md). URL flags: `?ablate=`, `?postmin=`,
  `?shot=`, `?cam=`, `?freeze=`, `?harness=1`, `?hud=0`.
- **Headless regression sweep:** `npm run battery` — every diagnostic rig (gameplay +
  netcode scenarios) against one dev stack, one tally, JSON report in `.diag-captures/`.
  Individual rigs: `npm run gameharness` / `npm run netharness` / `npm run perf:profile`.
  Toolkit map + extension contract: [docs/guides/dev-toolkit.md](docs/guides/dev-toolkit.md).
- **Command Center:** `npm run dashboard` — regenerates `docs/BRIEFING.md` then
  `.diag-captures/dashboard.html` (+ `health.json`, the same model for agents) from git +
  battery reports + capture bundles + STATUS/BACKLOG. Read-only, never hand-edited; leads
  with "what should I work on next?". **BRIEFING.md is the committed cold-start door; the
  dashboard adds observed evidence** — the markdown it reads stays canonical.
  `npm run briefing` alone refreshes BRIEFING.md; `briefing:check` / `health:check` fail when it lags STATUS.md. Bug
  capture (F8 / auto on error+assert) + production analytics (`/api/analytics`) live in the
  same layer: [docs/guides/observability.md](docs/guides/observability.md).
- **Architecture layer:** `npm run arch` — regenerates the committed `docs/ARCHITECTURE.json`
  manifest (write-only-on-change; agents read it) and `.diag-captures/architecture.html` (the
  human map, linked from the dashboard). The system taxonomy is curated in
  `tools/lib/archMap.mjs`; a new file under `src/`/`party/`/`shared/` that no system claims
  fails `health:check` with `ARCH_UNMAPPED_FILE` until you assign it there. Freshness is
  checked (read-only, `arch:check`) inside `npm run qa`; regeneration happens in the
  pre-commit hook, so the map can't silently rot.

---

## ARCHITECTURE INVARIANTS

- **Host-authoritative.** The first client in a room becomes host and runs all **authoritative**
  Rapier physics (humans + NPCs). The host is the single source of truth — predicting clients
  step the same world locally for feel, but never own the outcome.
- **The server never simulates physics.** `party/index.ts` (a `partyserver` Durable Object)
  does validation (`party/roundValidation.ts`), slot management, ready-up/round lifecycle,
  **WebRTC signaling** (SDP/ICE relay + Cloudflare Calls TURN minting), host selection
  (`party/hostSelection.ts`), **ghost exorcism**, and connection reaping. Kill-feed events
  do **not** relay through the server — falls/collisions ride the host snapshot's JSON tail
  on the DataChannel (the old `hostEventFall`/`hostEventCollision` relays were deleted
  2026-07-06). Do not move collision logic server-side.
- **Real-time telemetry is peer-to-peer, not server-relayed.** Host transforms (40Hz,
  `CONFIG.net.hostSendHz`), client input (sent per 60Hz fixed-step sample — no Hz knob), and spill
  events travel over WebRTC DataChannels (`src/netcode/p2p.js`): `P2P.sendToAll` from the
  host, `P2P.sendToPeer(hostId, …)` from clients. Do **not** route these back through the
  WebSocket. The WebSocket carries only lobby, signaling, and round-lifecycle messages;
  kill-feed falls/collisions ride the P2P snapshot tail.
- **Color logic uses `CART_COLORS` in `src/config.js`.** The palette hexes are **brand-aligned**
  (ART-PALETTE-1, 08-13) — they must match the 2D roster `PALETTES.classic.players` in
  `cart-rave-menu.js` (pink / blue / green / yellow / neonOrange; pure spectral hexes are
  off-brand). The `mesh.traverse()` material logic stays frozen.
- **Rounds start only via `MSG.gameStart`.** No tick-level auto-starts in `update()`.
- **Win condition:** 150 seconds (timer) or Sudden Death / last-standing paths. Round length
  is **single-sourced** as `ROUND_DURATION_MS` in `shared/roundConstants.js` (`150_000`);
  both `src/config.js` (`CONFIG.round.durationMs`) and `party/roundValidation.ts` import it —
  do not re-introduce a hardcoded duplicate. **Last-cart-standing (3s flourish) is effectively
  SD-only today:** timed-round respawn is 1s, so the flourish aborts when victims return.
  Ties resolve by most-recent scoring hit / Sudden Death.
- **No camera lerp/slerp smoothing.** It was intentionally removed. Do not reintroduce it.
- **`index.html` is canonical for menu markup.** `cart-rave-menu.html` was deleted (stale
  duplicate); do not recreate it. `src/cart-rave-menu.js` has its own color/name state that
  game wiring overrides via localStorage + event listeners in `initMenu()`.
- **Null-guard all cart access.** slots can momentarily hold no cart during join/leave/host
  migration; every cart access must guard against null.
- **Host migration:** on host disconnect the server promotes the oldest surviving connection;
  the new host receives the last cached snapshot and resumes NPC control. `#lastSeq` resets to
  `-1` server-side; the receiving client clears its state buffer and tears down + re-inits P2P.
- **Naming freeze:** do not rename Worker/host/`cartRave*` storage keys without a deliberate
  cutover plan ([docs/brand.md](docs/brand.md)).

---

## ENGINEERING PRINCIPLES

The invariants above say what not to break. These say **what a good diff looks like here** —
they are about the shape of the code, not the process around it. Each one is meant to be
falsifiable against a diff: if you cannot point at the line that violates it, it does not apply.

- **Delete the old path; do not keep it alive.** No compatibility layers, fallbacks, dual code
  paths, or migration shims for code this repo owns. The thing you replaced leaves in the **same
  commit** as its replacement. There is exactly one deployed bundle — there is no old client to
  stay compatible with. **Three carve-outs, where compat is real:** `cartRave*` **localStorage
  keys** (persisted on players' machines), **Worker / DO names** (naming freeze,
  [docs/brand.md](docs/brand.md)), and **`MSG.*` wire shapes mid-round** (a host and its clients
  can straddle a deploy). Everywhere else, delete it.
- **Simplest implementation that fully meets the current requirement.** No speculative
  abstraction, no indirection with a single caller, no knob "for later". **A `CONFIG` key or a
  `?flag` is a permanent second code path** — every future change has to reason about both sides
  of it. Add one only when a human turns it at runtime, and name that human in the plan.
- **Grow in layers; never trade a working product for unfinished complexity.** Smallest version
  that works end to end first, then add on top of something that already works. If the session
  ends with the game less playable than it started, that was not a step forward.
- **Keep concerns separated — prefer the module that already owns the concern.** Extract a new
  file only when there is a clear system home for it, not by default. **Never default to
  `main.js`** — even at its post-BUNDLE-1 size (1,287 lines) it is still the shared boot
  composition root every system threads through
  ([docs/reference/control-flow.md](docs/reference/control-flow.md)). A new file no system claims
  red-gates `health:check` with `ARCH_UNMAPPED_FILE`, and the mapping lives in
  `tools/lib/archMap.mjs`, which is **frozen during a game card** — so do not invent a home
  mid-card; file the `archMap` entry to BACKLOG.
- **Use what is already installed before writing your own.** Three.js, Rapier, zustand, Howler,
  partyserver / partysocket, nipplejs, Tweakpane. **Check the library's docs and types before
  concluding it cannot do the thing** — that assumption is how hand-rolled reimplementations get
  in. A new package needs a reason stated in the plan. (Standing exception: no open-world WebGPU
  engines — see off-limits.)
- **No stopgaps.** "Temporary", "for now", and "we'll replace this later" do not belong in
  committed code. If the right fix is out of scope, **do not ship the wrong one** — file it to
  [BACKLOG.md](docs/planning/BACKLOG.md) and leave the code alone. A diagnostic probe is the one
  exception, and the commit that removes it is planned in the same wave.

---

## STANDING BEHAVIORAL RULES

- **Verify before you speak.** Grep the tree, read the file, run the gate. If you have not
  confirmed something, say so — do not guess with confident structure.
- **Never say "done" or "verified" without git-pulling `cart-clash` and confirming the change
  is actually in HEAD.** The remote is authoritative; a local grep is not. Post-deploy, fetch
  the deployed asset and `Select-String` for the new code — local grep alone has produced
  false positives.
- **Report gate results by number.** Prefer `npm run qa` before claiming done. Also run
  `npm run build` when the change touches the client bundle. State the actual numbers you
  saw (test count drifts; do not hardcode stale totals).
- **No unpushed claims.** If you changed something locally, call it **"unpushed"** until it
  lands on `origin/cart-clash`.
- **Own mistakes plainly.** No apology loops, no hedging filler, no "great catch" replies to
  corrections. State what was wrong and move on.
- **When a claim disagrees with the code, the code wins.** Fix the claim; do not rewrite the
  code to match a stale claim.
- **Behavior-changing changes require a human playtest on production after deploy.**
- **PowerShell environment:** `Select-String`, not `grep`; single-line commit messages
  (`-m "…"`). `room.getConnections()` returns an **iterator** — use spread or `for…of`,
  never `.map().join()`.
- **Diff before apply.** Same as HOW WORK step 0: plan → Wyatt ack → apply, acked **per wave**.
  No exception for "the card was obvious" or "BRIEFING said ACTIVE CARD."
- **Update `docs/STATUS.md` at wave boundaries, not per lever** (focus / next / gotchas /
  decisions). One STATUS edit per wave, not one per commit — a docs-only commit between every
  lever is how 137 of 374 commits in a fortnight came to touch nothing but `docs/`.
- **Visual bugs:** use ablation + shoot/blackframes before large postFX rewrites
  ([docs/guides/visual-qa.md](docs/guides/visual-qa.md)).
- **Never hand Wyatt a URL before the thing it exercises is in the deployed bundle.** Deploy →
  fetch the production chunk → `Select-String` for the new symbol → *then* give him the link. A
  flag that does not exist fails **silently** (`debugParams` ignores unknown `?ablate=` tokens by
  design) and `buildFreshness` will not warn, because the bundle genuinely is live — it just
  predates the feature. On 08-04 this void'd a capture and a round of his play.
- **Playtest console must be ready before Wyatt's turn.** Same failure shape as the URL rule
  above. Writing `Owed: Wyatt playtest` in chat or STATUS prose is not a seed. Before you tell
  him to play (after ship, after closing PASSes, or when handing a FAIL retest): add a BACKLOG
  `## Playtest owed` row, run `npm run playtest:console`, then confirm `.diag-captures/playtest-queue.json`
  lists each owed card (system rows excepted) with a one-line goal, **non-empty numbered `steps`**,
  and deploy context that matches reality (`DEPLOYED` + SHA/Worker — never "unpushed" / "after
  ship" once it is live). A card that only links to a plan doc is **not** ready — put the
  checklist in the BACKLOG Playtest-owed Notes as `<br>1.` / `<br>2.` steps
  ([docs/playtest/README.md](docs/playtest/README.md)). `health:check` fails
  `PLAYTEST_STEPLESS` (owed, no steps) and `PLAYTEST_PARENT_UNSEEDED` (STATUS ✅ CLOSED still
  says playtest owed, no covering card). Do not hand him the console path until that check passes.
- **One issue per playtest card — his rule, 08-05.** A card id is one thing he can pass or fail on
  its own. A ship with four fixes seeds **four cards**, not one card with seven steps; numbered
  steps are the sub-steps of a single check, never a list of unrelated checks. If two steps could
  disagree about PASS/FAIL, they are two cards. **Why:** MAIN-1's retest bundled four fixes, a
  regression sweep, a look judgement and a hitch hunt onto one id, so a real defect (the toast
  drawn under the boost slab, now HUD-TOAST-Z-1) came back buried inside an overall PASS and never
  reached the tally. His words: he does not want to *"pass most of a card while having issues with
  a few here and there"*. Full authoring rule: [BACKLOG.md § Playtest console seed](docs/planning/BACKLOG.md).
- **His time and the context window are both budgets, and neither is yours to spend quietly.**
  Concretely: **move files with shell commands, never re-emit a document you already have**
  (relocating a 350-line plan by retyping it was this session's single largest spend); **never
  `grep -C` `BACKLOG.md`/`STATUS.md`** — their rows are essay-length single lines, so "a little
  context" is thousands of tokens (use line-ranged reads); **one docs commit and one `npm run qa`
  per wave**, not per finding — each docs commit drags a briefing + arch regeneration behind it.

### Enforcement

**Shared process authority (all tools):** root `AGENTS.md` + git hooks
(`tools/git-hooks/pre-commit` / `post-commit`, installed by **`npm run setup`**) that
regenerate `docs/BRIEFING.md` + `docs/ARCHITECTURE.json`, plus **`npm run verify:head`**.
Bypass docs hooks with `SKIP_DOCS_HOOK=1`.

**Claude PreToolUse hooks** (`.claude/hooks/`, `.claude/settings.json`) are **optional
leftover for Claude only** — not the source of process authority. Grok / Codex / Cursor
do not depend on them. They fail open and are covered by `tests/claudeHooks.test.js`.
Details: [docs/guides/hook-enforcement.md](docs/guides/hook-enforcement.md).

- **Claude escape hatches (that runtime only):** `CART_CLASH_SKIP_HOOKS=1`,
  `SKIP_GIT_GUARD=1`, `SKIP_PATH_GUARD=1`, `SKIP_STOP_GUARD=1` — read from the Claude
  process env, never from command strings.

---

## HOW WORK IS EXECUTED

The same loop in every tool — Cursor, Antigravity, Grok, Claude, terminal. This exists
because a full day was once lost grinding one task; the loop caps that at ~45 minutes.

- **0. Plan → ack → apply, and the unit of ack is a WAVE.** Before any multi-file or
  behavior-changing work: write one plan covering **every lever in the wave** (goal · files ·
  asserts · risks), ending with the **playtest checklist** — what Wyatt should look at when it
  lands, written *before* the work rather than reconstructed after. Wyatt acks the wave once;
  then execute the levers straight through. BRIEFING's **ACTIVE CARD** names the card — it is
  **not** permission to code. Reading the card and starting to edit is a process bug.
  - **Ack granularity ≠ commit granularity.** Still **one lever per commit**, gates green
    before each. Only the approval round-trip batches, because ~36 of them across a six-wave
    pass is the difference between an afternoon and two days.
  - **Mid-wave abort.** If a lever fails its asserts, or Wyatt stops the wave, the wave stops
    there. The remaining levers need a fresh ack or an explicit "continue" — a wave ack is not
    a blank cheque.
- **The fast lane: one file, nothing player-visible → skip the wave doc, keep the ack.**
  The wave loop above is correct for a six-lever pass and crushing for a one-line fix; without a
  smaller gear, a small fix costs what a big one costs. **Qualification is mechanical, not a
  judgement call** — all of these must hold: **one file** · fixes only the stated symptom ·
  **no new file** · no new
  dependency · **no new `CONFIG` key or URL flag** · touches nothing in ARCHITECTURE INVARIANTS.
  Any one of these disqualifies it outright: `main.js` · `party/` · `src/netcode*` · Rapier /
  physics · **any player-visible behaviour change**. What the fast lane still costs: a **one-line
  intent to Wyatt** ("fix X in Y, assert Z") → his go → apply → `npm run qa` green by number →
  one commit → push → `verify:head`. **The ack is not what gets skipped** — the wave *document*,
  the playtest checklist, and the per-lever STATUS edit are. **If a fast-lane change grows past
  its qualification mid-flight, stop and write the wave plan** — finishing it in the fast lane is
  the exact moment an hour becomes a day.
- **One card at a time.** Exactly one active item. New ideas go to
  [BACKLOG.md](docs/planning/BACKLOG.md) — recording an idea ≠ changing priorities.
- **Reachability gate — a target number is not a card.** Before a card whose done-condition is a
  *measurement* rather than something Wyatt can look at (fps bars, memory ceilings, load budgets),
  answer two questions in the plan: **"is this reachable on the target hardware, and what evidence
  would tell us it is not?"** and **"what is this worth in Wyatt's time?"** — a stated cell/minute
  budget he acks with the wave. Without both, the card has no state at which it is allowed to
  stop, and it will consume sessions indefinitely. **PERF-PASS-1 (08-04) is the worked example:**
  two hours and ~25 minutes of his play produced one shipped lever worth *somewhere* between
  +0.55 and −2.54 ms, against a 60 fps bar the box may not be physically capable of. The falsified
  premise was worth finding; the cost of finding it was not agreed in advance. **A card that
  cannot close does not belong in the active slot next to a game that needs finishing.**
- **Falsify cheapest-first.** When a plan rests on one premise ("the crowd is 36% of triangles, so
  cutting it pays"), the first measurement's job is to **kill that premise**, not to price every
  option. Run the 2–3 cells that would prove it wrong; only sweep the full menu once it survives.
  On 08-04 nine cells were run where three would have produced the same falsification, and the
  other six were spent pricing candidates the premise had already invalidated.
- **Freeze the operating system during a game card.** While a game card is active, no commits
  to `tools/`, `.claude/hooks/`, `.agents/`, or Command Center styling. A hook that misfires
  mid-card gets its escape hatch (`SKIP_GIT_GUARD=1` / `SKIP_PATH_GUARD=1` /
  `SKIP_STOP_GUARD=1`) and a BACKLOG entry — **not** a fix in this session. Tooling is repaired
  in its own dedicated block. This rule exists because on 08-02, 16 of 25 commits in one
  three-hour window were the machine maintaining itself while an art pass waited.
- **Timebox: ~45 minutes or 3 failed attempts on one approach — whichever hits first, STOP.**
  Before attempt #4, write a 5-line findings entry to STATUS.md: what was tried, what is now
  ruled out, current best hypothesis, evidence for it, and the next cheapest test. Grinding
  past this point without writing it down is how a day disappears.
- **Escalation ladder, in order:** (1) the timeboxed attempts → (2) the findings write-up →
  (3) switch approach from knob-turning to root-cause forensics (instrument, capture,
  attribute — the PERF-WARM lesson: spans named the owner; guessing at levers got reverted;
  the procedure is `.agents/skills/systematic-debugging/SKILL.md`, which every tool can read) →
  (4) hand off per MODEL / TOOL ROUTING below, or ask Wyatt. Handing off with a findings
  write-up is a success, not a failure.
- **Definition of done:** gates green **by number** + pushed + pulled-and-verified in
  `origin/cart-clash` HEAD + `npm run briefing` fresh + STATUS.md updated — except that
  **fast-lane commits may defer the STATUS.md update to the next wave boundary**. Behavior
  changes additionally need Wyatt's playtest on production before they count, and it is not
  his turn until the regenerated console shows non-empty steps and accurate deploy context.
  `health:check` now fails the wave (`PLAYTEST_STEPLESS` / `PLAYTEST_PARENT_UNSEEDED`) if
  that seed is missing or stepless.

---

## MODEL / TOOL ROUTING

How Wyatt routes work across agents (**updated 2026-08 — Claude demoted**):

| Tool | Role |
|------|------|
| **Grok** | Equal primary heavy lift — implementation, investigation, docs |
| **Codex** | Equal primary heavy lift — implementation, investigation, mechanical depth |
| **Cursor** | IDE surface + backup refactors |
| **Qwen / others** | Secondary heavy lift when chosen |
| **Claude** | Demoted / cancel path — not default; no process designed around it |

No single “main driver” yet — Grok and Codex are **equals**. Rehydrate via
`docs/BRIEFING.md` + root `AGENTS.md` (+ this manual on demand). Root `GROK.md` is the thin
Grok pointer.

**Skills reach every runtime.** Same convention — a `skills/` dir under each config root
(`.grok` · `.codex` · `.cursor` · `.claude` · `.gemini` · `.copilot` · `.config/opencode`).

- **Repo-scoped** — `.agents/skills/`; **`npm run skills:sync`** fans out. A runtime counts
  as installed when its `skills/` dir already exists. `health:check` still gates the
  **repo Claude mirror only** (legacy path — not process authority); missing
  `~/.grok/skills` must never fail `npm run qa`.
- **Machine-level third-party** — clone to `~/.agent-skills/<name>` (or copy into
  `~/.grok/skills` + `~/.codex/skills`). **Do not vendor large packs into `.agents/skills/`.**
  Shared today: img2threejs, i-have-adhd, frontend-design; plus selected skills from
  [davidondrej/skills](https://github.com/davidondrej/skills) at user level.

Pruning: `skills:sync` may prune the owned repo mirror; **never** prune shared user-level dirs.

Any prompt written **for** an agent goes in its own fenced code block. Confirm options with
Wyatt before writing long prompts. For new gameplay systems, player-facing features, or
ambiguous "done" tasks, ask **"what should the player see / feel / do when this works?"**
before starting.

---

## WHAT'S OFF-LIMITS

- **`docs/archive/handovers/` and `docs/archive/audits/` are historical archives — do not edit.**
- **`CLAUDE.md` / `GEMINI.md` / `GROK.md` / `.cursorrules` / `.cursor/rules/cart-clash.mdc`
  are pointer files.** Always-on rules live in root `AGENTS.md`; depth lives in this manual.
  Do not restate the stack table, invariants, or gate chain in pointer files (they rot).
- **`docs/BRIEFING.md` is generated** (`npm run briefing`) — never hand-edit it; edit
  STATUS.md and regenerate.
- **Do not recreate deleted files** — notably `cart-rave-menu.html` (see the menu-markup
  invariant) and the legacy `partykit.*.json` files.
- **Do not port open-world WebGPU engines** into this game. Visual QA *process* tools are fine;
  LAAS-style terrain/vegetation stacks are not.
