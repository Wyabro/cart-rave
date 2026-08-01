# AGENTS.md — Cart Clash

**This is the canonical rules file for this repository.** Cursor and Google Antigravity
read it natively; Claude Code reads it when pointed here. `.cursorrules`, `CLAUDE.md`, and
`GEMINI.md` should defer to this document for invariants. If any other doc disagrees
with this file about how the stack works, **this file and the code win** — go verify against
the tree, then fix the other doc.

**Product name is Cart Clash.** Deploy host, Worker name, and some code IDs still say
`cart-rave` until domain cutover — see [docs/brand.md](docs/brand.md). All wording —
player copy, announcer lines, docs — follows [docs/style-guide.md](docs/style-guide.md).

**Session rehydration (read first when cold):** read [docs/BRIEFING.md](docs/BRIEFING.md) —
generated from STATUS.md, **committed to git so every tool sees it without running anything**:
phase, the one active item, waiting-on-Wyatt vs agent work, do-nots, gates. Then this file,
then [docs/STATUS.md](docs/STATUS.md) for full context and gotchas. If you can run npm,
**`npm run dashboard`** adds the observed-evidence Command Center (git HEAD, gate/battery
results, captures) — see Commands below. The full numbered protocol lives **once** in
STATUS.md's rehydration block; link it, never restate it.
**Codebase map:** [docs/ARCHITECTURE.json](docs/ARCHITECTURE.json) — generated + committed
machine-readable manifest: every file's owning system, dependency edges, fragile systems,
pitfalls, and a `do_not_break` block. Read it before touching an unfamiliar system;
`npm run dashboard` also renders the human-facing architecture map (link on the Command
Center). Regenerate with `npm run arch` after structural changes — `health:check` fails if it drifts.
Architecture snapshot: [docs/planning/project-state.md](docs/planning/project-state.md).
Deep reference: [docs/reference/Game_Architecture.md](docs/reference/Game_Architecture.md).

**Paste-able session opener** — for any tool that does not auto-read repo files (Grok Build,
fresh web chats), paste this verbatim to start a session:

```text
You are working on Cart Clash (repo cart-rave, branch cart-clash). Read docs/BRIEFING.md,
then AGENTS.md, then the top of docs/STATUS.md, and follow them. Plan → Wyatt ack → apply
before any edit (ACTIVE CARD names the card, not permission to code). One card / one lever
at a time. Gates: npm run qa — report results by number. Ship only on Wyatt's explicit
"ship it"; never git add -A. Never claim "done" without pulling cart-clash and verifying HEAD.
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
dead, and `main.js` is a single 4,500-line closure holding ~84 unexported inner functions. That
file is the map.

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
- **Physics:** **Rapier3D** — runs **client-side on the host only**, host-authoritative.
- **Build / dev:** **Vite**.
- **State:** Zustand stores (`src/stores/`). Audio: Howler.js. Touch: nipplejs. Debug UI: Tweakpane.

### Commands

- **Deploy:** `npm run ship` = `vite build && npx wrangler deploy`.
- **Dev (client only):** `npm run dev` (Vite).
- **Dev (server only):** `npm run dev:party` (`npx wrangler dev`, local Durable Object).
- **Dev (both, preferred):** `npm run dev:local` (aliases: `dev:cart-clash`, `dev:next-level`).
- **Gates:** `npm run qa` (alias of `check` = `status:size` + typecheck + test + knip +
  `briefing` + `health:check`). Also `npm test`, `npm run typecheck`,
  `npm run build` (Vite → `dist/`). CI runs `npm run qa` + production build on
  push/PR to `cart-clash` / `main`. Exact-HEAD release gate (complete battery
  evidence): `npm run release:check` — battery stays out of ordinary PR CI.
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
  `npm run briefing` alone refreshes BRIEFING.md; `health:check` fails when it lags STATUS.md. Bug
  capture (F8 / auto on error+assert) + production analytics (`/api/analytics`) live in the
  same layer: [docs/guides/observability.md](docs/guides/observability.md).
- **Architecture layer:** `npm run arch` — regenerates the committed `docs/ARCHITECTURE.json`
  manifest (write-only-on-change; agents read it) and `.diag-captures/architecture.html` (the
  human map, linked from the dashboard). The system taxonomy is curated in
  `tools/lib/archMap.mjs`; a new file under `src/`/`party/`/`shared/` that no system claims
  fails `health:check` with `ARCH_UNMAPPED_FILE` until you assign it there. Runs inside
  `npm run qa`, so the map can't silently rot.

---

## ARCHITECTURE INVARIANTS

- **Host-authoritative.** The first client in a room becomes host and runs **all** Rapier
  physics (humans + NPCs). The host is the single source of truth.
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
- **Color logic uses `CART_COLORS` in `src/config.js`.** Do not modify that object or the
  `mesh.traverse()` material logic — it is the "Original Rave" source of truth
  (pink / blue / green / yellow / neonOrange).
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
- **Diff before apply.** Same as HOW WORK step 0: plan → Wyatt ack → apply. No exception
  for "the card was obvious" or "BRIEFING said ACTIVE CARD."
- **Update `docs/STATUS.md`** after meaningful steps (focus / next / gotchas / decisions).
- **Visual bugs:** use ablation + shoot/blackframes before large postFX rewrites
  ([docs/guides/visual-qa.md](docs/guides/visual-qa.md)).

### Enforcement

Two of the rules above are enforced by the harness, not by trust. Both live in
`.claude/hooks/` and are wired from the committed `.claude/settings.json`, so they travel
with a clone. **Claude Code only** — Cursor / Antigravity / Grok get `npm run verify:head`
and this document, not mechanical blocking.

- **`guard-git-add.mjs`** (PreToolUse on Bash/PowerShell) denies whole-worktree staging:
  `git add -A` / `.` / `./` / `:/` / `:` / `:(top)` / `*` / `--all`, combined short flags
  like `-Av`, and every `git commit -a` form. Explicit paths, `-p`, `-u <path>`, and
  `--amend` pass. A `permissions.deny` list in `settings.json` backs it up if the hook is
  disabled or errors — but that list is **glob-only**, so `-vA`, `:`, `:(top)` and a
  literal `*` are hook-only. `settings.json` is strict JSON, not JSONC: never put a comment
  in it, or every hook in the file stops loading.
- **`guard-stop-drift.mjs`** (Stop) blocks a "done / verified" claim when
  `verify:head` says the tree is drifted — unpushed commits, behind the upstream, or
  modified tracked files (untracked is ignored). Restating honestly, e.g. **"applied,
  unpushed"**, is not a claim and passes. It blocks at most twice per session and never
  twice for the same unchanged drift state.
- **Known gap:** bare `git add -u` stages every tracked modification — the same hazard —
  but is not blocked, because `git add -u <path>` is legitimate and common.
- **Escape hatches:** `CART_CLASH_SKIP_HOOKS=1` (both), `SKIP_GIT_GUARD=1`,
  `SKIP_STOP_GUARD=1`. These are read from the Claude Code process env, never parsed out of
  a command string — so `SKIP_GIT_GUARD=1 git add -A` is still blocked. Both hooks fail
  open: any error in them exits 0 rather than wedging a session.

Separately, `.git/hooks/pre-commit` and `post-commit` regenerate `docs/BRIEFING.md` +
`docs/ARCHITECTURE.json` and refresh the Command Center on every commit. **They are
local-only and untracked — a fresh clone does not get them**, and must be recreated by
hand. Bypass both with `SKIP_DOCS_HOOK=1`.

---

## HOW WORK IS EXECUTED

The same loop in every tool — Cursor, Antigravity, Grok, Claude, terminal. This exists
because a full day was once lost grinding one task; the loop caps that at ~45 minutes.

- **0. Plan → ack → apply.** Before any multi-file or behavior-changing edit: write a short
  plan (goal · files · asserts · risks), wait for Wyatt's **explicit ack**, then apply.
  BRIEFING's **ACTIVE CARD** names the card — it is **not** permission to code. Reading the
  card and starting to edit is a process bug.
- **One card / one lever at a time.** Exactly one active item, one change, one retest.
  New ideas go to [BACKLOG.md](docs/planning/BACKLOG.md) — recording an idea ≠ changing
  priorities.
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
  `origin/cart-clash` HEAD + `npm run briefing` fresh + STATUS.md updated. Behavior changes
  additionally need Wyatt's playtest on production before they count.

---

## MODEL / TOOL ROUTING

How Wyatt routes work across agents:

- **Claude Code** — verification, cross-file reasoning, hard debugging, docs.
- **Cursor (Fable)** — cross-file refactors.
- **DeepSeek** — mechanical known-file / known-line edits, diagnostics.
- **Antigravity** — exploratory agentic tasks.
- **Grok / other** — same standing rules; rehydrate via `docs/BRIEFING.md` + this file
  (`GROK.md` at the root is the thin pointer; if the tool can't auto-read files, use the
  paste-able session opener at the top of this document).

Any prompt written **for** an agent goes in its own fenced code block. Confirm options with
Wyatt before writing long prompts. For new gameplay systems, player-facing features, or
ambiguous "done" tasks, ask **"what should the player see / feel / do when this works?"**
before starting.

---

## WHAT'S OFF-LIMITS

- **`docs/archive/handovers/` and `docs/archive/audits/` are historical archives — do not edit.**
- **`CLAUDE.md` / `GEMINI.md` / `GROK.md` / `.cursorrules` / `.cursor/rules/cart-clash.mdc`
  are pointer files.** Real rules live here in `AGENTS.md`; do not restate the stack table,
  invariants, or gate chain in them (they rot independently — the gate description already
  did once). Tool-specific extras only.
- **`docs/BRIEFING.md` is generated** (`npm run briefing`) — never hand-edit it; edit
  STATUS.md and regenerate.
- **Do not recreate deleted files** — notably `cart-rave-menu.html` (see the menu-markup
  invariant) and the legacy `partykit.*.json` files.
- **Do not port open-world WebGPU engines** into this game. Visual QA *process* tools are fine;
  LAAS-style terrain/vegetation stacks are not.
