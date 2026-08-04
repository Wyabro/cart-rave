# Cart Clash — Control Flow Map (how modules actually reach each other)

**Document purpose:** [Game_Architecture.md](./Game_Architecture.md) explains *what* the systems
are. This file explains *how they call each other* — specifically the four indirection seams that
make `grep` and static call-graph tools give the wrong answer about this codebase.

**Read this before:** any cross-module change, any "who calls this?" question, any refactor that
moves a function between modules. If you are about to conclude "nothing calls this function,"
check it against § Invisible edges first — you are probably wrong.

**Anchors are symbols, never line numbers.** Every code location below is a link whose text is a
literal string in the target file — e.g. [`registerGameCallbacks`](../../src/netcode.js). Search
the symbol; there is nothing to keep in sync. `tests/architecture.test.js` resolves every one of
these anchors and fails if a symbol stops existing, so a rename breaks the build instead of
silently rotting the doc. **Do not reintroduce path-plus-line-number refs** — the same test
rejects any citation carrying a line number.

---

## The one-paragraph version

Cart Clash is ~142 `.js` files with **~754 `export function` and 5 classes** — it is a free-function
codebase, not an OO one. Modules are stateful singletons consumed via `import * as X`
(`src/main.js` alone has 14 namespace imports). But the highest-traffic edges are **not imports**.
Four subsystems reach each other through *injected callback objects*, a *string-keyed wire
protocol*, and *zustand store subscriptions*. None of those leave a syntactic trace. An agent that
only follows imports will see the utility leaves and miss the entire orchestration spine.

---

## Invisible edges — the four seams

### 1. `main.js` → netcode: the `callbacks` object

**Do not grep for callers of netcode's game hooks. There are none in the normal sense.**

`src/netcode.js` declares a module-scope mutable [`let callbacks = {`](../../src/netcode.js) holding
**~40 no-op default stubs** — `updateCartMaterialsFromSlots`, `teleportCartToSpawn`,
`onLocalKillConfirm`, `onAnnouncerFall`, `colorHexForSlot`, and so on. Every internal use inside
netcode is `callbacks.foo(…)`. The stubs are replaced exactly once at startup:

```
src/main.js       bootstrapNetcodeEntryFromUrl(…)
  → src/gameSession.js  Netcode.registerGameCallbacks(buildNetcodeGameBridge(…))
  → src/netcode.js  registerGameCallbacks(deps)
    → registerCallbacks({ … })  — merges over the defaults
```

Anchors: [`bootstrapNetcodeEntryFromUrl`](../../src/main.js) →
[`export function bootstrapNetcodeEntryFromUrl`](../../src/gameSession.js) →
[`export function registerGameCallbacks`](../../src/netcode.js).

The bundle itself is built by [`buildNetcodeGameBridge`](../../src/gameSession.js) in
`src/gameSession.js` — that function is the real seam, and it is the right place to look when you
need to know which orchestration implementation backs a given `callbacks.*` name.

**`sessionBridgeCtx` is written once** via
[`buildSessionBridgeContext`](../../src/gameSession.js) in
[`sessionBridgeCtx.current = buildSessionBridgeContext({`](../../src/main.js) — that factory
merges the former two write sites (netcode/gameplay bridge + teardown patch). Teardown keys
arrive as deps; they are not owned by `gameSession.js`. Runtime input/trigger rebinding lives in
[`wireNetcodeRuntimeRefs`](../../src/gameSession.js) (called from main via a thin local packer).

Until MAIN-1 finishes extracting domains, do not invent a third write path around the factory.

**Consequence:** `callbacks.updateCartMaterialsFromSlots()` in netcode is really
[`function updateCartMaterialsFromSlots`](../../src/orchestration/cartOrchestration.js) in
`cartOrchestration.js` (wired through the session bridge). The names usually match, but the edge
is invisible — and when a name *doesn't* match, only `buildNetcodeGameBridge` will tell you.

**When adding a hook:** add the stub to the `callbacks` literal in `netcode.js` *and* wire the real
implementation in `buildNetcodeGameBridge`. Miss the second step and you get a silent no-op, not
an error. This is the single most common way to "land" a change that does nothing.

### 2. `main.js` → gameLoop / levelManager / simulation: `deps` objects

Same pattern, different shape — the dependency bundle is passed **as an argument**, not
registered globally. `deps.` appears **~399 times across `src/`**.

- **[`export function runGameLoop`](../../src/gameLoop.js)`(loopState, callbacks)`** — called from
  `main.js`. Every physics/frame decision inside is `deps.isHost()`, `deps.getRoundState()`,
  `deps.runFixedPhysicsStep({…})`, `deps.getSimulationCallbacks(true)`.
- **[`export function initLevelManager`](../../src/levelManager.js)`(dependencies)`** — also called
  from `main.js`. Its contract exists **only as a JSDoc**
  [`LevelManagerDeps`](../../src/levelManager.js) typedef — a ~20-property interface
  (`getMenuVisible`, `performLevelLoad`, `finalizeArenaForPlay`, `maskMenuPreviewSwap`,
  `warmupAfterLevelSwap`, …). That typedef is the contract; read it before touching level swaps.

**Consequence:** the call graph for a frame is `main.js → runGameLoop → deps.* → back into main.js`.
It is a loop through an object, not a chain of imports.

### 3. `main.js` is the composition root (MAIN-1)

**Structurally important and easy to get wrong.** After MAIN-1, domain bodies live under
`src/orchestration/*` and escape via the `callbacks` / `deps` / `sessionBridgeCtx` seams.
[`async function main()`](../../src/main.js) is wiring: context creation, factory calls, bridge
keys. Extraction map: [main-1.md](../planning/main-1.md) §6 / appendix.

Inner helpers that remain in `main()` are late-bound wiring (quality handlers, harness capture,
GLB prefetch arming) — not domain logic. Searching for `import { startLevelMusic }` still returns
nothing; it ships from [`createMenuPlayEntry`](../../src/orchestration/menuPlayEntry.js).

- A static call-graph tool that only follows imports will still miss the callback/deps spine.
- Carving this seam was **MAIN-1** in [BACKLOG.md § Tech Debt](../planning/BACKLOG.md#tech-debt).

### 4. Client ↔ server: string-keyed `MSG.*` dispatch

The wire protocol is the **only** link between `src/` and `party/`. There is no shared function
call. Constants are single-sourced in [shared/protocol.js](../../shared/protocol.js).

Both sides dispatch with a flat `if (type === MSG.x)` chain, **with bodies inlined** rather than
delegating to named handlers:

- **Server:** `CartRaveServer.`[`async onMessage`](../../party/index.ts) in `party/index.ts` — a
  ~500-line method, twelve branches (`keepalive`, `join`, `colorPick`, `cartLook`, `readyToggle`,
  `playAgain`, `requestTurnCredentials`, `sdpOffer`, `sdpAnswer`, `iceCandidate`, `hostRound`,
  `hostSpawn`).
- **Client:** the mirror chain in [src/netcode.js](../../src/netcode.js) — a long run of
  [`if (type === MSG.`](../../src/netcode.js) branches, `keepalive` first through `spillBonus` last.

**To trace a message end-to-end:** grep the `MSG.` key — e.g. `MSG.hostRound` — and read the two
branches it lands in. That is the whole edge. Nothing else connects the planes.

**Which plane carries what** (see AGENTS.md § Architecture Invariants — this is an invariant, not a
preference):

| Plane | Transport | Carries |
|---|---|---|
| Control | WebSocket (`party/index.ts`) | lobby, slots, round lifecycle, WebRTC signaling, `hostSpawn` |
| Gameplay | WebRTC DataChannel (`src/netcode/p2p.js`) | `hostTransform` (40Hz binary), `clientInput`, `spill`, `directive`, `spillBonus` |

Kill-feed falls/collisions ride the **JSON tail of the host snapshot**, not a message of their own.

**Reap overrides (test-only):** silent-connection reap uses `getReapTimeoutMs()` /
`getReapThrottleMs()` from [`party/constants.ts`](../../party/constants.ts) (defaults
`REAP_TIMEOUT_MS` 20s · `REAP_THROTTLE_MS` 5s). Party-do tests call
`setReapOverrides({ timeoutMs, throttleMs })` so a joiner keepalive can trigger reap without
waiting 20s; `setReapOverrides(null)` restores production defaults. Production never calls the
setter. Both the onMessage throttle gate and `#reapSilentConnections` → `listSilentConnectionsToReap`
5th arg read the getters (onConnect calls the same method).

### 5. Zustand stores: mutation → reaction

Six stores in `src/stores/` (`gameStore`, `audioStore`, `settingsStore`, `challengeStore`,
`unlockStore`, `cartTuningStore`), ~109 `getState`/`setState`/`subscribe` sites. A `setState`
anywhere fires subscribers elsewhere with **zero syntactic link**. The complete subscriber set —
each cell links the subscribing file and anchors on its actual `subscribe` call:

| Store | Subscribers |
|---|---|
| `gameStore` | [`gameStore.subscribe`](../../src/analytics/gameplayAnalytics.js) · [`gameStore.subscribe`](../../src/announcer/announcerDirector.js) · [`gameStore.subscribe`](../../src/directives/directiveEngine.js) · [`gameStore.subscribe`](../../src/utils/gameplayDiagnostics.js) |
| `challengeStore` | [`challengeStore.subscribe`](../../src/analytics/gameplayAnalytics.js) · [`challengeStore.subscribe`](../../src/cart-rave-menu.js) · [`challengeStore.subscribe`](../../src/main.js) · [`challengeStore.subscribe`](../../src/utils/gameplayDiagnostics.js) |
| `audioStore` | [`audioStore.subscribe`](../../src/audioManager.js) |
| `unlockStore` | [`unlockStore.subscribe`](../../src/cart-rave-menu.js) · [`unlockStore.subscribe`](../../src/utils/gameplayDiagnostics.js) |
| `settingsStore`, `cartTuningStore` | read via `getState()`; no subscribers |

(The four `gameStore` cells are four different files — hover the link to see which.)

**Consequence:** changing what a `gameStore` field means silently changes announcer behavior,
directive scheduling, and analytics. Those four are the blast radius of every `gameStore` shape
change. `gameStore` / `gameState` dual-import surface is tracked as **STORE-1** in the backlog.

---

## Other things that don't grep

- **Levels load through a table, not imports.** [`export const LEVEL_IMPORTERS`](../../src/levels/index.js)
  in `src/levels/index.js` maps level id → dynamic
  `() => import("./backroomsSupermarket.js").then(m => m.initBackroomsSupermarket)`. All four
  ~3,000-line level modules are reachable **only** through this table. `src/levels/index.js` is a
  loader, not a barrel.
- **Three.js behavior is data-driven.** ~313 `userData` references and ~40 `.traverse()` calls.
  Keys like [`raveGltfPartRole`](../../src/cartRaveGltf.js), `userData.cartVisual`,
  `userData.deathState`, `userData.cameraMode`, `userData.followState` are state machines keyed off
  scene-graph annotations — concentrated in [src/cartRaveGltf.js](../../src/cartRaveGltf.js). No
  call edges exist to find; grep the `userData` key instead.
- **DOM custom events** — a small seam, 4 names only: `cartrave:menu`, `cartrave:level-changed`,
  `cartrave:customization-changed`, `cartrave:round-started` (~13 sites; dispatched from
  [`cartrave:level-changed`](../../src/cart-rave-menu.js) in the menu, consumed at
  [`cartrave:round-started`](../../src/main.js) and friends in `main.js`). There is no custom
  emitter class.
- **Rapier collisions** — one callback:
  [`drainCollisionEvents`](../../src/simulation.js)`((h1, h2, started) => …)` in
  `src/simulation.js`.
- **Howler lifecycle** — [`onload:`](../../src/audioManager.js) / [`onplay:`](../../src/audioManager.js)
  / [`onend:`](../../src/audioManager.js) in `src/audioManager.js`.
- **No tsconfig path aliases.** All imports are relative. Vite aliases exist only under
  `mode === "production"` (aliasing `@dimforge/rapier3d-simd` → `@dimforge/rapier3d`) and for
  test-time Rapier stubbing — both in `vite.config.js`.
- **Types are JSDoc, not TypeScript.** `allowJs: true, checkJs: true, strict: false, noEmit: true`.
  Only `party/*.ts` is real TypeScript. Tools expecting TS annotations will find nothing in `src/`.

---

## Recipe: tracing an edge

1. **Direct import?** Grep the symbol. ~563 static imports resolve normally — most utility code is
   honestly wired and needs nothing special.
2. **Nothing found, and it's a netcode hook?** Look in `buildNetcodeGameBridge`
   ([src/gameSession.js](../../src/gameSession.js)), then the `callbacks` literal in `netcode.js`.
3. **Nothing found, and it's frame/physics/level?** It's a `deps.*` property — read the JSDoc
   `@typedef` on the consumer (`GameLoopState`/`PhysicsStepDeps` in `gameLoop.js`,
   `LevelManagerDeps` in `levelManager.js`), then the call site in `main.js`.
4. **Crosses client/server?** Grep the `MSG.` key, read both `if (type === MSG.x)` branches.
5. **Reacts to state?** Check the store table above.
6. **Still nothing?** It's probably an inner function of `main()` — search within that closure
   before concluding it's dead.

**Naming works in your favor.** Functions are long and domain-prefixed —
`updateWaterDeathFx`, `updateRaveGltfCasterRollPivot`, `updateRemoteCartNetTargets`,
`disposeSceneExtras`. Only ~5% of exports collide on a bare name (`init` ×3, `update` ×2 among
exports). A grep for a full symbol name is usually unambiguous — the problem is never collision,
it's indirection.
