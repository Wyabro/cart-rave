# Diagnostics framework (`window.__ccDiag` + the gameplay E2E rig)

**What it is.** A cohesive, extensible diagnostic layer that lets a developer (or an
automated rig) **observe** gameplay runtime state and a **history of what happened**, and
drive a solo round headlessly to assert invariants that were previously only checked by a
human playing (`docs/playtest/solo-checklist.md`). It is the general-purpose sibling of the
two specialist harnesses — the netcode 2-client rig
([netcode-harness.md](./netcode-harness.md)) and the visual QA harness
([visual-qa.md](./visual-qa.md)) — and it deliberately shares their conventions so the whole
toolkit feels like one thing.

- Hub core: [`src/utils/diagnostics.js`](../../src/utils/diagnostics.js) — `window.__ccDiag`,
  installed **only** under `?diag=1` (zero cost otherwise).
- Game wiring: [`src/utils/gameplayDiagnostics.js`](../../src/utils/gameplayDiagnostics.js) —
  registers read-only probes and subscribes to the stores to emit events.
- Node rig: [`tools/gameharness.mjs`](../../tools/gameharness.mjs) — single-client solo
  scenarios.
- Shared plumbing: [`tools/lib/harness.mjs`](../../tools/lib/harness.mjs) — arg parsing,
  dev-stack lifecycle, Playwright bring-up, the pass/fail tally, and the exit-code contract,
  reused by **both** `gameharness.mjs` and `netharness.mjs`.

## Run it

```bash
# Terminal 1 — persistent dev stack (Vite :3000 + Wrangler :8787)
npm run dev:local

# Terminal 2 — run the gameplay rig against it
npm run gameharness -- --url http://127.0.0.1:3000/
# or a single scenario:
node tools/gameharness.mjs --url http://127.0.0.1:3000/ --scenario roundflow
```

Flags: `--url <base>` (attach to a running stack; omit to auto-start `dev:local`),
`--scenario roundflow|unlockFunnel` (default: all), `--headed` (visible browser).
**Exit codes (shared contract): `0` all checks passed, `1` a check failed, `2` harness/setup
error.** Same as `netharness`, `shoot`, `blackframes`. The 2-client netcode rigs may also
exit `3` = inconclusive (starved client loop — see
[netcode-harness.md](./netcode-harness.md)); the battery reports it without going red.

Both rigs run a **stack preflight** before launching browsers: an HTTP probe of the Vite
client and the Worker party endpoint with a 10 s timeout. A wedged `workerd` keeps its port
open but never answers (seen 2026-07-15 — every client sat in lobby forever and the failure
read as a game bug); the preflight turns that into a fast exit 2 with the fix in the message
(kill all `workerd`, restart `dev:local`).

## The `window.__ccDiag` surface (read-only, `?diag=1`)

`?diag=1` installs the hub and works in **prod builds too** (read-only QA), exactly like
`?nettest` / `?harness`. When the flag is absent nothing is installed and the emission sites
are a single boolean read.

- `__ccDiag.snapshot()` — run every registered probe and return
  `{ round, score, announcer, directive, camera, boot, ai, unlocks, challenges, config, perf,
  resources, runtime }`. `snapshot("round")` runs just one. A throwing probe degrades to
  `{ error }` for that namespace instead of breaking the read. The `runtime` probe carries
  browser/device context (userAgent, GPU class + renderer, quality tier, DPR, deviceMemory,
  cores, viewport). The `boot` probe carries the **`cr:*` boot timeline**
  (`play-entry` → `world-init-start` → `world-ready` → `carts-ready`, stamped via
  `src/utils/bootTimeline.js`; `world-ready − world-init-start` = the cold-load stall window,
  i.e. the NET-2 mechanism). The `resources` probe is the **leak sentinel** — live
  geometry/texture/program/scene-node/Howler/heap counts (via the DEV `__cartRavePerf`
  probe; fields are null in prod builds).
- `__ccDiag.events(sinceSeq?)` — the bounded (512) event ring buffer. Each record is
  `{ seq, t, ch, type, …data }`. Channels: `round` (phase / sudden-death), `score`, `ko`
  (with attribution), `announcer` (every accepted PA event), `unlock`, `challenge`, `boot`
  (one event per `markBootPhase`), `error` (the gameLoop circuit breaker's faults **plus**
  window `error`/`unhandledrejection`, mirrored in errorReporter.js), and `assert` — the
  **invariant watchdog**: observe-only violations of pure structural rules
  (`src/utils/invariants.js`; today: illegal round-phase transitions, the "wedged round"
  bug class). Poll `__ccDiag.tail` for a cursor.
- `__ccDiag.probes()` — the registered namespaces.
- `__ccDiag.control` — **DEV-only** scenario levers, `null` in production and in read-only
  QA sessions. Each reuses an existing proven production path (never a new mutation route):
  `rewindRoundClock(remainMs)` (the Force-Sudden-Death clock trick — fast-ends a running
  round), `grantKos(level, n)` (the unlock funnel), `setScores(scores)` (crown a winner).
- `__ccDiag.captureBundle({ scenario, reason })` — assemble a self-contained **bug-capture
  bundle**: `{ bundleVersion, scenario, reason, capturedAt (ISO), phase, flags, tail, seed,
  eventCounts, events, snapshot }`. Pure read (never mutates); JSON-serializable so it ships to
  disk or clipboard. `seed` is always `null` — there is no exposed gameplay RNG seed (arena pick
  is unseeded).
  Bundles are `bundleVersion: 2`: they carry a `build` stamp ({ sha, builtAt }, baked by
  vite.config.js `define`) so every capture is attributable to its exact build. Three ways
  to trigger a capture:
  - **In-app hotkey** — `F8` (or legacy `Ctrl+Shift+D`; DEV build + `?diag` only) logs the
    bundle, copies its JSON to the clipboard, and downloads it as a `.json` file. The
    "player reports a bug on screen → dev presses the key" path.
  - **Automatic** — any `error`/`assert` event auto-assembles a bundle one tick later and
    retains the last 3 under `__ccDiag.captures()` (debounced 5 s, max 5/session, so an
    error loop can't spin bundle assembly). After a crash, the evidence is already waiting.
  - **Harness** — `dumpFailureBundle(page, { scenario, label })` (`tools/lib/harness.mjs`) writes
    `<scenario>-<label>-NNN.json` + a Playwright screenshot to `.diag-captures/` (gitignored).
    Both rigs call it automatically when a scenario's checks fail. Rigs also persist their
    per-check tally via `--tallyOut <file>` (the battery passes this automatically).

## Two primitives make new modules cheap

```js
// A read-only namespaced snapshot — wired once from accessors the system already exposes.
registerDiagProbe("round", () => ({ phase: getRoundState().phase, /* … */ }));

// A structured event — a NO-OP when ?diag is absent, so production sites call it freely.
recordDiagEvent("ko", "kill", { victim, attacker, comboTier });
```

`recordDiagEvent` is the reusable win: it turns "did the announcer fire?", "did scoring
credit the right cart?", and "did the round wedge at a seam?" from eyeballing into a
queryable log. Round/score/unlock/challenge events are derived by **subscribing** to the
Zustand stores (zero store edits); KO, announcer, and fatal-error events are emitted at their
own source chokepoints (`koReactors` diagnostics reactor / `announcerManager.announce` /
`gameLoop` catch) because they carry attribution the stores don't hold.

## What the rig proves today (was manual)

- **roundflow** — solo round advances lobby→countdown→running→podium; the PA fires
  `countdown_3/2/1/go` at the start and `victory` for a crowned winner; the game loop stays
  alive; a round fast-ends to the expected winner; **zero sim errors** over the round; phase
  transitions land in the event log; and the **solo rematch seam works** — clicking the real
  PLAY AGAIN button off the results panel lands in a fresh countdown with all scores reset.
  (Automates `solo-checklist.md` §A "no wedge at any seam" and the countdown/results reveal.)
- **unlockFunnel** — with real locks enforced (`cartRaveDevUnlocks=off`), granting 10 KOs on
  Cart Rave unlocks The Storerooms, logs the unlock event, and the unlock **survives a full
  page reload** (persistence). (Automates the §C progression funnel without grinding.)
- **arenas** — every arena (Cart Rave / Storerooms / Sundial) cold-boots into a solo round
  via the production menu path (localStorage `cartRaveLevel`), reaches RUNNING with the
  right level loaded, has its boot timeline stamped, fast-ends to podium, and logs **zero
  error events and zero invariant asserts**. (Automates the playtest kit's Session 0
  per-arena stability baseline.)
- **soak** — the leak sentinel: N solo rematch cycles (`--soakCycles`, default 3) with a
  short drive each round, sampling the `resources` probe at every podium. Asserts
  geometry/texture/program/scene-node/Howler counts **stay flat across cycles** (tolerances
  in the scenario), plus zero errors/asserts. Every past leak (suction rings, boost rings,
  countdown pulse, VFX dispose) would have tripped this gate. Heap is reported but not
  gated (GC noise). (Automates the structural half of the Session 4 long-session soak.)
- **hostMigration** (2-client, in `netharness`) — clean host departure: host + mid-round
  joiner in quickplay, then the host context closes. Asserts the survivor is promoted to
  host, the room lands in a sane phase, NPC slots come back under the new host (`kind ===
  "npc"` from the net slot — `cart.isNpc` is false even on a healthy host, don't use it),
  a round runs, the new host can drive its own cart, and no sim errors. The **silent-drop**
  (20 s reap) case still needs the manual plan — Playwright can't kill a socket without
  closing the page.
  ```bash
  npm run netharness -- --url http://127.0.0.1:3000/ --scenario hostMigration
  ```
- **hostReload** (2-client, in `netharness`) — mid-round **host tab reload** (A6b): same
  bring-up as hostMigration, then `page.reload()` on the host (not context close). Asserts
  the survivor is promoted and playable, the reloaded tab auto-rejoins as a **non-host**
  (sole-host invariant), `menuVisible === false` / `axisWired === true` (07-17 menu-over-
  game race), the rejoined client drives, and zero sim errors on both clients.
  ```bash
  npm run netharness -- --url http://127.0.0.1:3000/ --scenario hostReload
  ```
- **mpIntegration** (2-client, in `netharness`) — the netcode↔gameplay seam: host starts a
  match, a second client joins mid-round, and the rig asserts INVARIANTS (not exact timing):
  both stay connected with correct host/non-host roles, the joiner controls its own cart (local
  + host-authoritative view both move), a scored round syncs across both clients, the podium
  crowns the **same** winner on both, the PA fires the right result per client (winner→`victory`,
  loser→`defeat`), the quickplay rematch returns both to a fresh round with reset scores, and
  neither client logs a sim error. Run it with:
  ```bash
  npm run netharness -- --url http://127.0.0.1:3000/ --scenario mpIntegration
  ```
  (`npm run netharness` alone still runs only `spawnlock`, unchanged.)

## AI stall watchdog (dev-only, `?diag`)

[`src/utils/aiStallWatchdog.js`](../../src/utils/aiStallWatchdog.js) is a passive observer wired
into the host physics frame ([`gameLoop.js`](../../src/gameLoop.js), guarded by
`__ccDiagActive` + `phase==="running"`). It samples every NPC's horizontal speed + position and,
when one sits with near-zero meaningful movement in the same behavior past a threshold (2.5s —
deliberately **above** the AI's own 1.1s self-recovery window, so only unrecovered stalls flag),
emits **one** `recordDiagEvent("ai", "stall_detected", { slot, npcId, personality, state,
durationMs, x, z, speed, target })`, debounced per episode and re-armed on recovery. It **only
observes — it never touches AI behavior.** The `state` string is synthesized
(paused/reversing/contestingPodium/avoiding/seeking) because the AI has no discrete state enum.
The `roundflow` rig logs any stalls it sees as passive evidence; query them anytime with
`__ccDiag.events().filter(e => e.type === "stall_detected")`.

## Extending it

Add a probe or an event channel by calling `registerDiagProbe` / `recordDiagEvent` from the
system you're instrumenting — no core change. Add a scenario as a function
`scenario<Name>(browser, baseUrl, tally)` in `gameharness.mjs`, reuse `makeClient`,
`waitForState`, `holdKey`/`releaseKey` from `tools/lib/harness.mjs`, and assert with
`tally.check(name, pass, detail)` (feeds the tally + exit code). Prefer reading structured
state via `__ccDiag` over scraping the DOM. Keep any new in-page instrumentation behind the
`__ccDiagActive` guard so it stays zero-cost in production.

One command runs every rig: **`npm run battery`** — see the umbrella guide,
[dev-toolkit.md](./dev-toolkit.md), for the sweep, the surface map, and the extension
contract (probes / events / invariants / boot phases / scenarios / rigs).

Natural next modules on this foundation: a camera-framing assertion pass, a results-screen
scenario, a `--baseline` compare mode for `perf:profile` (turn the static perf snapshot into
a regression gate), and new invariants in `src/utils/invariants.js` (score/spectator rules).
*(Done: the AI stall watchdog, mpIntegration, the `cr:*` boot timeline, the `resources`
leak probe + `soak` scenario, the `arenas` scenario, the phase-transition invariant
watchdog, and the battery orchestrator.)*
