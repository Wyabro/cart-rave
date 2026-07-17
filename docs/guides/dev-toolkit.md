# The Cart Clash developer toolkit (umbrella guide)

**What is this?** The one-page map of every diagnostic surface, headless rig, and debug
lever in the project, plus the rules for extending them so the toolkit stays one coherent
thing instead of a pile of one-offs. Deep guides:
[diagnostics.md](./diagnostics.md) (gameplay hub + rigs) ·
[netcode-harness.md](./netcode-harness.md) (2-client rig) ·
[visual-qa.md](./visual-qa.md) (screenshots / black frames).

## The one command

```bash
npm run battery                                   # auto-starts dev:local, runs every rig
npm run battery -- --url http://127.0.0.1:3000/   # attach to a running stack (faster)
npm run battery -- --only gameharness             # one rig · --skip soak,hostMigration drops steps
npm run battery -- --visual --qa                  # opt-in: black-frame battery + typecheck/tests/knip
```

`tools/battery.mjs` runs every headless rig **sequentially against one shared dev stack**
(they share the quickplay room — never parallelize them), aggregates the exit codes, prints
one summary, and writes a JSON report to `.diag-captures/`. Exit contract (shared by every
rig): **0** all green · **1** a check failed · **2** setup error. Failed scenarios also
auto-drop a bug-capture bundle (JSON + screenshot) in `.diag-captures/`.

Stack handling (all rigs, via `maybeStartDevStack`): a **full** running stack
(:3000 + :8787 both answering) is attached to automatically — no flag needed; **half** a
stack (one port held — usually a zombie `workerd` or another session's server) is a fast
exit 2 with the fix, because blind-starting `dev:local` onto a held port loses the bind
race and `dev-local.mjs` then kills the whole stack mid-run (kill-on-child-exit is
deliberate fail-fast for interactive dev). If the auto-started stack dies mid-battery,
remaining steps are skipped with one clear message instead of timing out one by one.
Zombie cleanup: `Get-Process workerd | Stop-Process -Force`.

Default steps: `gameharness` (roundflow, unlockFunnel, arenas, soak) → `netharness`
spawnlock → mpIntegration → hostMigration. Opt-in: `--visual` (blackframes), `--qa`.

## Surface map

| Surface | Flag | Global | What it's for |
|---|---|---|---|
| Gameplay diagnostics hub | `?diag=1` | `window.__ccDiag` | Read-only probes + event ring buffer + capture bundles; DEV-only `control` levers |
| Netcode test hook | `?nettest=1` | `window.__ccTest` | 2-client state (`getState`, `getSelfCart`, `hostInputDebug`) |
| Loop liveness | (either flag) | `window.__ccLoopDbg` | `frames / resumeZeroed / chronicSlow / maxDt / lastDt` |
| Visual QA harness | `?harness=1` | `window.__cartRave` | `settle`, `stats()`, ablation for shoot/blackframes |
| DEV perf probe | (DEV build) | `window.__cartRavePerf` | `renderer/scene/camera/composer` refs for profiling + the `resources` probe |
| Debug panel | `?debug` / `?tune` (DEV) | Tweakpane | Playtest Tools folder (Force SD, grant KOs, directives, unlock gates), postFX + feel knobs |
| Bug capture | `Ctrl+Shift+D` (DEV + `?diag`) | — | Capture bundle → console + clipboard |

Namespace rule: new gameplay diagnostics belong under `__ccDiag`; netcode-specific under
`__ccTest`; `__cartRave*` is the visual-QA family. All are inert without their flag.

## What `__ccDiag` gives you (the framework core)

- **Probes** (`__ccDiag.snapshot()`): `round, score, announcer, directive, camera, boot,
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
   append one line to `STEPS` in `tools/battery.mjs`.

Principles (the netcode-harness philosophy — keep them): production code paths, structured
state over DOM, deterministic control via existing proven levers, flag-gated zero-cost
instrumentation, and every failure leaves a capture bundle behind.

## Known blind spots (still human / still open)

Feel and taste (combat weight, bloom look, audio mix, FTUE comprehension), real-hardware
tiers and phones, silent-drop host migration (Playwright can't kill a socket without
closing the page), host-tab backgrounding across machines, and headless SwiftShader
inflating any load-time magnitudes (mechanisms are real, milliseconds aren't). The full
register: [../playtest/README.md](../playtest/README.md).
