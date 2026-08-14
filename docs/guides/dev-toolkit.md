# The Cart Clash developer toolkit (umbrella guide)

**What is this?** The one-page map of every diagnostic surface, headless rig, and debug
lever in the project, plus the rules for extending them so the toolkit stays one coherent
thing instead of a pile of one-offs. Deep guides:
[diagnostics.md](./diagnostics.md) (gameplay hub + rigs) ·
[netcode-harness.md](./netcode-harness.md) (2-client rig) ·
[visual-qa.md](./visual-qa.md) (screenshots / black frames) ·
[observability.md](./observability.md) (bug capture · analytics · living dashboard).

## The Command Center (the health view)

```bash
npm run dashboard        # generate .diag-captures/dashboard.html + health.json
```

A GENERATED project command center — "what should I work on next?", the agent briefing
(handoff facts + do-not list + cold-start read order), latest battery gates with
per-check detail, capture bundles awaiting triage (with screenshots), STATUS open
issues / active queue, backlog shape, perf snapshot, recent commits, and links to every
other tool (playtest console, guides). Read-only; never hand-edited — the markdown it
parses (STATUS / BACKLOG / handoff) stays canonical. Agents read `health.json` (same
model). See [observability.md](./observability.md).

```bash
npm run verify:head      # is this tree actually in sync with its upstream?
```

The dashboard's "in sync with origin/…" chip reads the **local** `origin/<branch>` ref, so
it is only as fresh as the last manual fetch — this tree once showed that chip green
against a ref ten hours stale. `verify:head` asks the remote directly via `git ls-remote`
(zero writes: no ref updates, no `FETCH_HEAD`, no lock contention with a concurrent agent
session) and reports unpushed / behind / dirty-tracked. Exit 0 in sync · 1 drift · 2 setup
error; `-- --json` for tooling. It runs inside `npm run release:check` and backs the Stop
hook in AGENTS.md § Enforcement — but stays out of `npm run qa`, because a network call
must never gate CI or offline work.

## The one command

```bash
npm run battery                                   # auto-starts dev:local, runs every rig
npm run battery -- --url http://127.0.0.1:3000/   # attach to a running stack (faster)
npm run battery -- --only gameharness             # one rig · --skip soak,hostMigration drops steps
npm run battery -- --visual --qa                  # opt-in: black-frame battery + typecheck/tests/knip
```

### Unit tests + Workers DO harness

```bash
npm test                 # prepare:party-do + Vitest projects (unit + party-do)
npm run test:party-do    # Workers pool only — CartRaveServer WebSocket smoke (A5b/A6a)
```

`vitest.config.js` defines two projects: **unit** (Node / happy-dom under `tests/`, excluding
`tests/party-do/`) and **party-do** (`vitest.party.config.js` + `@cloudflare/vitest-pool-workers`).
`prepare:party-do` ensures a minimal `dist/index.html` so wrangler ASSETS boots; party WS routes
never fetch ASSETS.

**Reap overrides (test-only):** `setReapOverrides({ timeoutMs, throttleMs })` in
[`party/constants.ts`](../../party/constants.ts) shortens the silent-connection reaper for
party-do tests (production stays 20s / 5s). Pass `null` to clear. Do not call from production
paths. Covered in `tests/party-do/cartRaveServer.test.js` (silent-drop + ghost 4010).

`tools/battery.mjs` runs every headless rig **sequentially against one shared dev stack**
(they share the quickplay room — never parallelize them), aggregates the exit codes, prints
one summary, and writes a JSON report to `.diag-captures/`. Exit contract (shared by every
rig): **0** all green · **1** a check failed · **2** setup error · **3** inconclusive (the
2-client rigs only: client loop starved even after a recovery retry — no evidence either
way; the battery prints INCONCLUSIVE and does **not** fail the sweep, so red = regression).
Failed scenarios also auto-drop a bug-capture bundle (JSON + screenshot) in `.diag-captures/`.

Stack handling (all rigs, via `maybeStartDevStack`): a **full** running stack
(:3000 + :8899 both answering) is attached to automatically — no flag needed; **half** a
stack (one port held — usually a zombie `workerd` or another session's server) is a fast
exit 2 with the fix, because blind-starting `dev:local` onto a held port loses the bind
race and `dev-local.mjs` then kills the whole stack mid-run (kill-on-child-exit is
deliberate fail-fast for interactive dev). If the auto-started stack dies mid-battery,
remaining steps are skipped with one clear message instead of timing out one by one.
Zombie cleanup: `Get-Process workerd | Stop-Process -Force`.

Default steps: `gameharness` (roundflow, unlockFunnel, arenas, soak) → `netharness`
spawnlock → mpIntegration → hostMigration → hostReload → teardownRejoin. Opt-in:
`--visual` (blackframes), `--qa`.

## Surface map

| Surface | Flag | Global | What it's for |
|---|---|---|---|
| Gameplay diagnostics hub | `?diag=1` | `window.__ccDiag` | Read-only probes + event ring buffer + capture bundles; host-gated `control` when wired under `?diag=1` (DEV or prod) |
| Netcode test hook | `?nettest=1` | `window.__ccTest` | 2-client state (`getState`, `getSelfCart`, `hostInputDebug`) |
| Loop liveness | (either flag) | `window.__ccLoopDbg` | `frames / resumeZeroed / chronicSlow / maxDt / lastDt` |
| Visual QA harness | `?harness=1` | `window.__cartRave` | `settle`, `stats()`, ablation for shoot/blackframes |
| DEV perf probe | (DEV build) | `window.__cartRavePerf` | `renderer/scene/camera/composer` refs for profiling + the `resources` probe |
| Developer panel | `?debug` / `?tune` (DEV; `H` toggles) | Tweakpane + `window.CartClashDev` | Registry-backed Game State / Progression / Events / Systems actions plus `help` autocomplete; existing postFX + feel knobs remain |
| Bug capture (manual) | `F8` / `Ctrl+Shift+D` (`?diag` — works in prod builds too, `31ee861`) | — | Capture bundle → console + clipboard + downloaded .json. Bundles also log `perf/longframe` events (frames >100 ms, rate-limited) for hitch forensics |
| Bug capture (auto) | (any `error`/`assert` event, `?diag`) | `__ccDiag.captures()` | Last 3 auto-assembled bundles, debounced + session-capped |
| Gameplay analytics | on by default (`?analytics=off` opts out) | `__ccDiag.snapshot("analytics")` | Event-level batches → `/api/analytics` (prod) / console.debug (DEV) — [observability.md](./observability.md) |

Namespace rule: new gameplay diagnostics belong under `__ccDiag`; netcode-specific under
`__ccTest`; `__cartRave*` is the visual-QA family. All are inert without their flag.

## In-game developer actions

In a Vite DEV build, press `H` or open with `?debug` and expand **Developer**. Buttons and
the command bar execute the same registry entries and report the same structured result.
Start with `help`, or use `window.CartClashDev.help()` / `.run("status")` from the console.
Core commands cover `sd`, `rewind`, `scores`, local-only `directive`, `kos`, `unlocks`,
`announce`, `capture`, `diag`, `blackmon`, `mute`, `flags`, and `status`.

Round score, clock, KO, and Sudden Death actions all use one DEV control object. The same
object is attached as `__ccDiag.control` when `?diag=1`; the diagnostics read hub is not
installed merely because the panel is open. `capture` therefore requires diagnostics and
directs the developer to `diag on` when absent. Directive forcing remains local-only in
multiplayer: a non-host mismatch self-reverts and is not evidence of a real desync.

The panel owns DEV actions only. `__ccDiag` remains the probe/event/capture hub,
`__ccTest` remains the netcode harness, and `__cartRave*` remains visual QA. The panel may
print or toggle their URL flags but does not absorb their APIs.

## What `__ccDiag` gives you (the framework core)

- **Probes** (`__ccDiag.snapshot()`): `net` (pendingInputs count/age — sampling-starved vs
  unacked —, connectionState, ack/dead flags, arena-rotation + menu gates, plus `axisWired`
  = is the input-axis ref live [`false` = the 07-17 menu-return input freeze] and
  `migFreezeRemMs` = host-migration freeze window remaining), `audio`
  (AudioContext state, mute, volumes, music playing, drop-in splash registered),
  plus `round, score, announcer, directive, camera, boot,
  ai, unlocks, challenges, config, perf, resources, runtime`. Notables:
  - `boot.timeline` — the `cr:*` boot marks (`play-entry`, `world-init-start`,
    `world-ready`, `carts-ready`, `menu-ready`). `world-ready − world-init-start` is the
    cold-load stall window — the NET-2 join-freeze mechanism, now measurable on any device.
  - `resources` — geometries / textures / programs / scene nodes / Howler instances / JS
    heap. The **leak sentinel** read (needs the DEV `__cartRavePerf` probe; nulls in prod).
- **Events** (`__ccDiag.events(sinceSeq)`): channels `round, score, ko, announcer, unlock,
  challenge, boot, error, assert, ai, scenario`. Notables:
  - `error` — gameLoop circuit-breaker faults **plus** window `error` /
    `unhandledrejection` (mirrored in errorReporter.js), so "zero errors" checks and
    capture bundles see page errors too.
  - `assert` — **invariant watchdog** violations. Today: illegal round-phase transitions
    (`src/utils/invariants.js`, pure + unit-tested). Observe-only, never intervenes.
- **Capture bundles** (`captureBundle` / `Ctrl+Shift+D` / harness auto-dump) — snapshot +
  events + device context, self-contained JSON for offline investigation.

## What the rigs prove without a human

| Scenario | Rig | Was manual as |
|---|---|---|
| `roundflow` — phase machine, PA sequence, fast-end, rematch seam, zero errors | gameharness | solo-checklist §A |
| `unlockFunnel` — KO credit crosses a real lock + persists across reload | gameharness | solo-checklist §C |
| `arenas` — all 3 arenas cold-boot, run, fast-end cleanly; boot timeline stamped | gameharness | playtest Session 0 |
| `soak` — N rematch cycles, **resource counts stay flat** (`--soakCycles N`) | gameharness | playtest Session 4 (structural half); the whole leak bug class |
| `spawnlock` — mid-round joiner drives off spawn | netharness | NET-2 report probe |
| `mpIntegration` — roles, score sync, same winner, victory/defeat PA, rematch | netharness | 2-browser smoke complement |
| `hostMigration` — clean host departure, survivor promoted, NPCs handed back | netharness | migration plan (clean-close half) |
| `hostReload` — mid-round host tab reload; survivor host; old host rejoins as client | netharness | A6b / host-reload mid-round |
| `teardownRejoin` — menu-return teardown before rejoin (axis re-wire) | netharness | 07-17 input freeze |

Static perf snapshots (draw calls / GPU ms per arena × tier): `npm run perf:profile`
(`tools/perf-profile.mjs`, predates the shared lib — attach with `--url`, note it defaults
to :5173). Natural extension: a `--baseline` compare mode to turn it into a regression gate.

## How to extend (the contract)

1. **New observable state** → `registerDiagProbe(ns, fn)` in `gameplayDiagnostics.js`,
   reading accessors the system already exposes. Pure reads only.
2. **New "did X happen" evidence** → `recordDiagEvent(channel, type, data)` at the source
   chokepoint. It's a no-op without `?diag`, so production sites call it unconditionally.
3. **New invariant** → a pure predicate in `src/utils/invariants.js` + a test, emitted as
   an `assert` event from the system that owns the transition. Observe, never intervene.
4. **New boot phase** → `markBootPhase("name")` (`src/utils/bootTimeline.js`) — stamps a
   `cr:*` performance mark (prod-safe) and mirrors it to the `boot` channel.
5. **New scenario** → a `scenario<Name>(browser, baseUrl, tally)` function in
   `gameharness.mjs` (solo) or `netharness.mjs` (2-client), built from
   `tools/lib/harness.mjs` helpers (`makeClient`, `waitForState`, `holdKey`, `CheckTally`,
   `dumpFailureBundle`). Read `__ccDiag`/`__ccTest`, never scrape the DOM.
6. **New rig** → build on `tools/lib/harness.mjs` (preflight + exit contract for free) and
   append one line to `STEPS` in `tools/battery.mjs`. Support `--tallyOut` (free via
   `CheckTally.finish(path)`) so the battery report carries your per-check detail.
7. **New analytics event** → `trackEvent(name, props)` (`src/analytics/analytics.js`) from a
   store subscription or existing chokepoint in `gameplayAnalytics.js`. Event-level only —
   if it could fire every frame, aggregate first (see matchStats → `match_ended`).
8. **New dashboard section** → a collector in `tools/lib/projectHealth.mjs` (degrade to
   null, parsers pure + unit-tested) + a render block in `tools/dashboard.mjs`.
9. **New enforcement hook** → `.claude/hooks/*.mjs`, wired from the committed
   `.claude/settings.json` (strict JSON — a comment there drops every hook). Export the
   pure matcher behind an `isMain` guard so `tests/claudeHooks.test.js` can drive it; a
   matcher nobody tests reads as enforced while enforcing nothing. Fail open — any error
   exits 0, never wedges a session. Name an escape-hatch env var in the file header, read
   from the process env and never parsed out of the command string. Document what it
   blocks, its gaps, and the bypass in [hook-enforcement.md](./hook-enforcement.md).

Principles (the netcode-harness philosophy — keep them): production code paths, structured
state over DOM, deterministic control via existing proven levers, flag-gated zero-cost
instrumentation, and every failure leaves a capture bundle behind.

## Known blind spots (still human / still open)

Feel and taste (combat weight, bloom look, audio mix, FTUE comprehension), real-hardware
tiers and phones, silent-drop host migration (Playwright can't kill a socket without
closing the page), host-tab backgrounding across machines, and headless SwiftShader
inflating any load-time magnitudes (mechanisms are real, milliseconds aren't). The full
register: [../playtest/README.md](../playtest/README.md).
