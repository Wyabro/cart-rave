# Cart Clash — Control Flow Map (how modules actually reach each other)

**Document purpose:** [Game_Architecture.md](./Game_Architecture.md) explains *what* the systems
are. This file explains *how they call each other* — specifically the four indirection seams that
make `grep` and static call-graph tools give the wrong answer about this codebase.

**Read this before:** any cross-module change, any "who calls this?" question, any refactor that
moves a function between modules. If you are about to conclude "nothing calls this function,"
check it against § Invisible edges first — you are probably wrong.

**Anchors are symbol names first, line numbers second.** Line numbers drift; search the symbol.

---

## The one-paragraph version

Cart Clash is ~136 `.js` files with **679 `export function` and 5 classes** — it is a free-function
codebase, not an OO one. Modules are stateful singletons consumed via `import * as X`
(`src/main.js` alone has 14 namespace imports). But the highest-traffic edges are **not imports**.
Four subsystems reach each other through *injected callback objects*, a *string-keyed wire
protocol*, and *zustand store subscriptions*. None of those leave a syntactic trace. An agent that
only follows imports will see the utility leaves and miss the entire orchestration spine.

---

## Invisible edges — the four seams

### 1. `main.js` → netcode: the `callbacks` object

**Do not grep for callers of netcode's game hooks. There are none in the normal sense.**

`src/netcode.js` declares a module-scope mutable `let callbacks = { … }` (~line 230) holding
**~40 no-op default stubs** — `updateCartMaterialsFromSlots`, `teleportCartToSpawn`,
`onLocalKillConfirm`, `onAnnouncerFall`, `colorHexForSlot`, and so on. Every internal use inside
netcode is `callbacks.foo(…)`. The stubs are replaced exactly once at startup:

```
src/main.js:314  Netcode.registerGameCallbacks(buildNetcodeGameBridge(…, gameSession))
  → src/netcode.js  registerGameCallbacks(deps)   (~line 328)
    → registerCallbacks({ … })  — merges over the defaults
```

The bundle itself is built by **`buildNetcodeGameBridge`** in
[src/gameSession.js](../../src/gameSession.js) — that function is the real seam, and it is the
right place to look when you need to know which `main.js` implementation backs a given
`callbacks.*` name.

**Consequence:** `callbacks.updateCartMaterialsFromSlots()` in netcode is really
`updateCartMaterialsFromSlots` in `src/main.js` (~line 646). The names usually match, but the
edge is invisible — and when a name *doesn't* match, only `buildNetcodeGameBridge` will tell you.

**When adding a hook:** add the stub to the `callbacks` literal in `netcode.js` *and* wire the real
implementation in `buildNetcodeGameBridge`. Miss the second step and you get a silent no-op, not
an error. This is the single most common way to "land" a change that does nothing.

### 2. `main.js` → gameLoop / levelManager / simulation: `deps` objects

Same pattern, different shape — the dependency bundle is passed **as an argument**, not
registered globally. `deps.` appears **~399 times across `src/`**.

- **`runGameLoop(loopState, callbacks)`** — [src/gameLoop.js](../../src/gameLoop.js) `runGameLoop`,
  called at `src/main.js:4748`. Every physics/frame decision inside is `deps.isHost()`,
  `deps.getRoundState()`, `deps.runFixedPhysicsStep({…})`, `deps.getSimulationCallbacks(true)`.
- **`initLevelManager(dependencies)`** — [src/levelManager.js](../../src/levelManager.js), called at
  `src/main.js:2149`. Its contract exists **only as a JSDoc `@typedef LevelManagerDeps`** — a
  ~20-property interface (`getMenuVisible`, `performLevelLoad`, `finalizeArenaForPlay`,
  `maskMenuPreviewSwap`, `warmupAfterLevelSwap`, …). That typedef is the contract; read it before
  touching level swaps.

**Consequence:** the call graph for a frame is `main.js → runGameLoop → deps.* → back into main.js`.
It is a loop through an object, not a chain of imports.

### 3. `main.js` is one 4,500-line closure

**Structurally important and easy to get wrong.** `src/main.js` has only ~29 top-level function
declarations. `async function main()` spans **lines 714–5219** and contains **~84 inner functions**
— `startLevelMusic`, `onLocalKillConfirm`, `triggerSpillNetcode`, `bootstrapNetcodeFromMenu`,
`rebuildForQualityChange`, `finalizeArenaShellForMenu`, and so on.

These are **never exported and never imported**. They escape the closure *only* by being stuffed
into the `callbacks` / `deps` bundles above. So:

- Searching for `import { startLevelMusic }` returns nothing. It is not dead code.
- A static call-graph tool renders `main.js` as one enormous node with almost no outbound edges —
  exactly backwards from reality.
- Carving this seam is tracked as **MAIN-1** in
  [BACKLOG.md § Tech Debt](../planning/BACKLOG.md#tech-debt). Until then, expect the closure.

### 4. Client ↔ server: string-keyed `MSG.*` dispatch

The wire protocol is the **only** link between `src/` and `party/`. There is no shared function
call. Constants are single-sourced in [shared/protocol.js](../../shared/protocol.js).

Both sides dispatch with a flat `if (type === MSG.x)` chain, **with bodies inlined** rather than
delegating to named handlers:

- **Server:** `CartRaveServer.onMessage` in [party/index.ts](../../party/index.ts) — starts ~line
  801, runs ~450 lines, twelve branches (`keepalive`, `join`, `colorPick`, `cartLook`,
  `readyToggle`, `playAgain`, `requestTurnCredentials`, `sdpOffer`, `sdpAnswer`, `iceCandidate`,
  `hostRound`, `hostSpawn`).
- **Client:** the mirror chain in [src/netcode.js](../../src/netcode.js) (~lines 2070–2434).

**To trace a message end-to-end:** grep the `MSG.` key — e.g. `MSG.hostRound` — and read the two
branches it lands in. That is the whole edge. Nothing else connects the planes.

**Which plane carries what** (see AGENTS.md § Architecture Invariants — this is an invariant, not a
preference):

| Plane | Transport | Carries |
|---|---|---|
| Control | WebSocket (`party/index.ts`) | lobby, slots, round lifecycle, WebRTC signaling, `hostSpawn` |
| Gameplay | WebRTC DataChannel (`src/netcode/p2p.js`) | `hostTransform` (40Hz binary), `clientInput`, `spill`, `directive`, `spillBonus` |

Kill-feed falls/collisions ride the **JSON tail of the host snapshot**, not a message of their own.

### 5. Zustand stores: mutation → reaction

Six stores in `src/stores/` (`gameStore`, `audioStore`, `settingsStore`, `challengeStore`,
`unlockStore`, `cartTuningStore`), ~109 `getState`/`setState`/`subscribe` sites. A `setState`
anywhere fires subscribers elsewhere with **zero syntactic link**. The complete subscriber set:

| Store | Subscribers |
|---|---|
| `gameStore` | [analytics/gameplayAnalytics.js:82](../../src/analytics/gameplayAnalytics.js), [announcer/announcerDirector.js:341](../../src/announcer/announcerDirector.js), [directives/directiveEngine.js:88](../../src/directives/directiveEngine.js), [utils/gameplayDiagnostics.js:284](../../src/utils/gameplayDiagnostics.js) |
| `challengeStore` | [analytics/gameplayAnalytics.js:129](../../src/analytics/gameplayAnalytics.js), [cart-rave-menu.js:1896](../../src/cart-rave-menu.js), [main.js:2133](../../src/main.js), [utils/gameplayDiagnostics.js:324](../../src/utils/gameplayDiagnostics.js) |
| `audioStore` | [audioManager.js:20](../../src/audioManager.js) |
| `unlockStore` | [cart-rave-menu.js:1798](../../src/cart-rave-menu.js), [utils/gameplayDiagnostics.js:312](../../src/utils/gameplayDiagnostics.js) |
| `settingsStore`, `cartTuningStore` | read via `getState()`; no subscribers |

**Consequence:** changing what a `gameStore` field means silently changes announcer behavior,
directive scheduling, and analytics. Those four are the blast radius of every `gameStore` shape
change. `gameStore` / `gameState` dual-import surface is tracked as **STORE-1** in the backlog.

---

## Other things that don't grep

- **Levels load through a table, not imports.** `LEVEL_IMPORTERS` in
  [src/levels/index.js](../../src/levels/index.js) (~line 16) maps level id → dynamic
  `() => import("./backroomsSupermarket.js").then(m => m.initBackroomsSupermarket)`. All four
  ~3,000-line level modules are reachable **only** through this table. `src/levels/index.js` is a
  loader, not a barrel.
- **Three.js behavior is data-driven.** ~313 `userData` references and ~40 `.traverse()` calls.
  Keys like `userData.raveGltfPartRole`, `userData.cartVisual`, `userData.deathState`,
  `userData.cameraMode`, `userData.followState` are state machines keyed off scene-graph
  annotations — concentrated in [src/cartRaveGltf.js](../../src/cartRaveGltf.js). No call edges
  exist to find; grep the `userData` key instead.
- **DOM custom events** — a small seam, 4 names only: `cartrave:menu`, `cartrave:level-changed`,
  `cartrave:customization-changed`, `cartrave:round-started` (~13 sites, e.g.
  `src/cart-rave-menu.js:1545`, `src/main.js:2757`). There is no custom emitter class.
- **Rapier collisions** — one callback: `eventQueue.drainCollisionEvents((h1, h2, started) => …)`
  in [src/simulation.js](../../src/simulation.js) (~line 2717).
- **Howler lifecycle** — `onload` / `onplay` / `onend` in
  [src/audioManager.js](../../src/audioManager.js) (~lines 300–355).
- **No tsconfig path aliases.** All imports are relative. Vite aliases exist only under
  `mode === "production"` and for test-time Rapier stubbing (`vite.config.js:66-75`).
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
6. **Still nothing?** It's probably an inner function of `main()` (lines 714–5219) — search within
   that range before concluding it's dead.

**Naming works in your favor.** Functions are long and domain-prefixed —
`updateWaterDeathFx`, `updateRaveGltfCasterRollPivot`, `updateRemoteCartNetTargets`,
`disposeSceneExtras`. Only ~5% of exports collide on a bare name (`init` ×3, `update` ×2 among
exports). A grep for a full symbol name is usually unambiguous — the problem is never collision,
it's indirection.
