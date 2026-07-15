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
error.** Same as `netharness`, `shoot`, `blackframes`.

## The `window.__ccDiag` surface (read-only, `?diag=1`)

`?diag=1` installs the hub and works in **prod builds too** (read-only QA), exactly like
`?nettest` / `?harness`. When the flag is absent nothing is installed and the emission sites
are a single boolean read.

- `__ccDiag.snapshot()` — run every registered probe and return
  `{ round, score, announcer, directive, camera, boot, ai, unlocks, challenges, config, perf }`.
  `snapshot("round")` runs just one. A throwing probe degrades to `{ error }` for that
  namespace instead of breaking the read.
- `__ccDiag.events(sinceSeq?)` — the bounded (512) event ring buffer. Each record is
  `{ seq, t, ch, type, …data }`. Channels: `round` (phase / sudden-death), `score`, `ko`
  (with attribution), `announcer` (every accepted PA event), `unlock`, `challenge`, `boot`,
  `error` (the gameLoop circuit breaker's faults). Poll `__ccDiag.tail` for a cursor.
- `__ccDiag.probes()` — the registered namespaces.
- `__ccDiag.control` — **DEV-only** scenario levers, `null` in production and in read-only
  QA sessions. Each reuses an existing proven production path (never a new mutation route):
  `rewindRoundClock(remainMs)` (the Force-Sudden-Death clock trick — fast-ends a running
  round), `grantKos(level, n)` (the unlock funnel), `setScores(scores)` (crown a winner).

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
  transitions land in the event log. (Automates `solo-checklist.md` §A "no wedge at any
  seam" and the countdown/results reveal.)
- **unlockFunnel** — with real locks enforced (`cartRaveDevUnlocks=off`), granting 10 KOs on
  Cart Rave unlocks The Storerooms and logs the unlock event. (Automates the §C progression
  funnel without grinding.)

## Extending it

Add a probe or an event channel by calling `registerDiagProbe` / `recordDiagEvent` from the
system you're instrumenting — no core change. Add a scenario as a function
`scenario<Name>(browser, baseUrl, tally)` in `gameharness.mjs`, reuse `makeClient`,
`waitForState`, `holdKey`/`releaseKey` from `tools/lib/harness.mjs`, and assert with
`tally.check(name, pass, detail)` (feeds the tally + exit code). Prefer reading structured
state via `__ccDiag` over scraping the DOM. Keep any new in-page instrumentation behind the
`__ccDiagActive` guard so it stays zero-cost in production.

Natural next modules on this foundation: a camera-framing assertion pass, an AI-behavior
watchdog (stall/lemming detection off the `ai` probe), a results-screen scenario, a boot/asset
timeline (extend the single `cr:menu-ready` mark into a `cr:*` sequence surfaced on the `boot`
channel), and a soak scenario (N rematches, assert no growing hitch off the `perf` probe).
