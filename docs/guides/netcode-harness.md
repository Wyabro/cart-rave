# Netcode E2E harness (2-client rig)

**What it is.** A Playwright rig that drives **two real browser clients** (a host and a
mid-round joiner) into the same local `quickplay` room and asserts cross-client invariants —
e.g. "the joiner can drive its own cart off spawn, and the host's authoritative copy moves
too." It exists because the P2P prediction/reconciliation bugs it targets are **structurally
invisible to unit tests** (`tests/netcode.test.js` mocks the socket): they need two live
clients and a real WebRTC DataChannel.

- Rig: [`tools/netharness.mjs`](../../tools/netharness.mjs)
- In-page hook: [`src/utils/netTestHarness.js`](../../src/utils/netTestHarness.js) — read-only
  `window.__ccTest`, installed **only** under `?nettest=1` (zero cost otherwise).

This is the automated complement to the manual **NET-1** two-browser smoke — it does not
replace it (headless can't judge feel, and see the SwiftShader caveat below).

## Run it

```bash
# Terminal 1 — persistent dev stack (Vite :3000 + Wrangler :8787)
npm run dev:local

# Terminal 2 — run the rig against it (fast, no start/stop churn)
node tools/netharness.mjs --url http://127.0.0.1:3000/
```

Flags: `--headed` (visible browsers, for debugging), `--url <base>` (attach to an already-
running stack; omit to auto-start `dev:local`). Exit code `0` = all checks passed, `1` =
a check failed, `2` = harness/setup error, `3` = **inconclusive** — no failures, but a drive
check was skipped because the client loop stayed starved even after one recovery retry
(NET-2-class cold-load; environment noise, not regression evidence — the battery renders it
INCONCLUSIVE and stays green). The split: input **never sampled** (pendingInputs 0) + cart
still = inconclusive; input **sampled but cart still** = the real spawn-lock signature, red.
`NETHARNESS_VERBOSE=1` streams dev-server output.

The default scenario (`spawnlock`) is the "non-host cart can't leave spawn" report: host
reaches a running round, joiner joins mid-round and seats into an ex-NPC slot, then the rig
holds forward and asserts the joiner's cart leaves spawn.

> **07-17 coverage gap — CLOSED.** Every early scenario joined via a `?room=` URL, which
> skipped the menu teardown and structurally hid the real 07-17 spawn-lock —
> `returnToMenu` nulls netcode's input-axis ref and only boot re-wired it, so a human going
> solo → menu → join froze (fixed in `dabdb6b` via `wireNetcodeRuntimeRefs()` on every
> `ensureSessionCartsReady`). `teardownRejoin` now drives exactly that path and is
> regression-covered below.

Opt-in scenarios (`--scenario <name>`): **`mpIntegration`** — the netcode↔gameplay seam
(roles, joiner drive, score sync, same winner both clients, victory/defeat PA, quickplay
rematch, zero sim errors); **`hostMigration`** — clean host departure (survivor promoted,
NPCs handed off, new host drives, zero sim errors); **`hostReload`** — mid-round host tab
reload (survivor promoted, reloaded tab rejoins as non-host, menu not stuck over game);
**`teardownRejoin`** — menu-return teardown before rejoin; **`shardOverflow`** — a 5th
human overflows a full public quickplay shard onto the next one (QUICKPLAY-SHARD-1);
**`friendsLobby`** — a real friends private room: CHECKOUT LINE lobby renders, manual
ready-up (no auto-ready), countdown only arms once every live human is ready, and a
rematch that re-readies both humans without the joiner pressing ready again
(HARNESS-FRIENDS-1); **`hostFreeze`** — the host tab freezes for real via CDP
(throttled/backgrounded, not dead) and thaws: snapshot silence + bounded pose hold while
frozen, snapshots resume and `snap_gap`/`host_send_gap` fire on the first post-thaw
send/arrival, host identity unchanged (HARNESS-FREEZE-1). See
[diagnostics.md](./diagnostics.md) for what each asserts. Both rigs also preflight the
dev stack over HTTP first, so a wedged `workerd` (port open, never answers) exits 2 with
the fix in the message instead of a bogus scenario failure.

## How it works (and why each piece is needed)

- **Two separate `chromium.launch()` processes**, *not* two contexts in one browser.
  Chromium throttles the non-foreground page to ~3 fps (intensive wake-up throttling reaches
  even a `MessageChannel` loop), which starves the fixed-step sim loop. Each client gets its
  own process, plus per-page CDP `Emulation.setFocusEmulationEnabled` and
  `--disable-features=…IntensiveWakeUpThrottling` as insurance.
- **`?perfPump=1`** on both clients — the dev-only rAF shim
  ([`src/utils/perfPump.js`](../../src/utils/perfPump.js)) so a backgrounded page's sim loop
  keeps stepping. This remains a diagnostic requirement after HOST-TAB-1: the production
  hidden-host pump is host/phase-gated, while this rig needs both clients live regardless
  of authority. See the hidden-tab gotcha in [visual-qa.md](./visual-qa.md).
- **Input is real dispatched `keydown`/`keyup` on `window`** (WASD/Shift/Space) — the exact
  production input path (`getAxis` → prediction → P2P send → host apply), no source change to
  drive it.
- **`?room=quickplay`** is one shared room (main.js), so both clients land together
  deterministically with the quickplay auto-ready/mid-round-seat path. Auto-enter needs no
  DOM clicking: the rig seeds `localStorage.cartRaveUsername`, and loading `?room=quickplay`
  triggers the auto-rejoin path.
- **Cold-load gate:** a freshly-joined client blocks its main thread on world bootstrap; the
  rig waits until that stall is over (`__ccLoopDbg.maxDt` stabilizes) before driving, so it
  measures netcode and not the load.

### `window.__ccTest` surface (read-only, `?nettest=1`)

- `getState()` — `{ phase, isHost, youConnId, hostId, localSlotIndex, ackForSelf,
  latestSnapSeq, carts:[{slot,connId,kind,x,y,z,speed,spectator,shatter,…}], … }`. Under
  `?nettest` it also carries harness diagnostics: `axis`, `pending`, `counters`
  (drain/sample/send/ingest), `predict`, `mode`, `migFreezeRemMs`.
- `getSelfCart()` — own cart's live pose/velocity.
- `hostInputDebug(connId)` — host-side `{ queueLen, lastAckSeq }` for a peer (tells "host
  never received input" from "host received but never applied").
- `window.__ccLoopDbg` — `{ frames, resumeZeroed, maxDt, lastDt }` loop-liveness counters
  (only when `?nettest` set the flag; guarded per-frame otherwise).

## Key finding (2026-07-15) — the "stuck joiner cart" is NOT a netcode bug

The rig **disproved** the ackSeq/reconciliation theory for the "non-host cart can't leave
spawn" report. Across many runs, whenever the joiner's game loop is actually running, the
mid-round joiner drives correctly: cart moves, host applies input, `ackForSelf` advances,
sync holds. The frozen cart is caused by the **joiner's rAF loop being starved during the
cold-load main-thread stall on quickplay join** (Rapier + arena + shader compile). While the
thread is blocked, the resume-guard (`gameLoop.js` `dt > RESUME_GAP_S → accumulator = 0`)
zeroes the physics accumulator every slow frame, so the joiner never samples/sends input →
cart welded to spawn until it clears. That one mechanism explains all three reported
symptoms: slow load, frozen cart, "freezes a lot."

> **SwiftShader caveat.** Headless Chromium uses software WebGL, so `compileAsync` can't use
> KHR parallel shader compile and the join stall inflates to ~15 s. Real hardware is much
> faster — the *magnitude* is a headless artifact, but the *mechanism* (stall starves loop →
> cart frozen) is real. Headless therefore can't cleanly measure the first second of a join
> on real hardware; that still wants a human two-browser check.

Follow-up (the real fix, not yet built) is tracked in STATUS under the join-stall item.

## Server-side lifecycle (party-do, not this Playwright rig)

Silent-drop reaper + same-`clientId` ghost exorcism live in the Workers DO harness
(`npm run test:party-do`, `tests/party-do/cartRaveServer.test.js`). Shorten reap knobs in
tests via `setReapOverrides` in `party/constants.ts` (test-only; see
[control-flow.md](../reference/control-flow.md) § wire protocol). CDP “Offline” silent-drop
in this Playwright rig stays deferred (~20s wall clock).

## Extending the rig

Add scenarios as functions like `scenarioSpawnLock(browserHost, browserJoiner, baseUrl)`.
Reuse `makeClient`, `waitForState(page, predFn)`, `waitForColdLoadDone`, and `holdKey`/
`releaseKey`. Assert with `check(name, pass, detail)` — every check feeds the final tally and
exit code. Prefer reading structured state via `__ccTest.getState()` over scraping the DOM.
Keep any new in-page instrumentation gated behind `?nettest` (see `setNetTestActive` in
`netcode.js` and the `window.__ccNetTest` guard in `gameLoop.js`) so it stays zero-cost in
production.
