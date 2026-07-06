# Cart Rave — Architecture

**Single source of truth for how Cart Rave actually works.** This file consolidates what was
previously spread across `Game_Architecture.md`, the tech-stack sections of `docs/README.md`
and `docs/project-state.md`, and `.cursorrules`. Every number here was verified against
`src/config.js`, `src/netcode.js`, `src/netcode/p2p.js`, and `party/index.ts` at the time of
writing — if you change tuning in code, update this file (or delete the claim).

Rules and invariants live in [`AGENTS.md`](../AGENTS.md) at the repo root; this file is the
"how it works" reference behind those invariants.

---

## 1. Executive summary

Cart Rave is a browser-based **4-player physics sumo** game. Neon shopping carts drive on an
arena — a vinyl-record ring (Classic), a Backrooms supermarket, or a floating sundeck
(Zanzibar). Score by ramming opponents off the edge or into voids. Rounds run **150 seconds**;
highest score wins, with Sudden Death on ties.

The shape of the system:

- **Client-rendered 3D** (Three.js) with **client-side physics** (Rapier3D).
- **Host-authoritative multiplayer**: one client (the host) simulates physics for everyone,
  including NPCs.
- **Two network planes:**
  - a **control plane** — a `partyserver` Durable Object over WebSocket (`partysocket`) for
    lobby, slot assignment, round lifecycle, WebRTC signaling, and the kill feed;
  - a **data plane** — **WebRTC DataChannels, peer-to-peer**, for real-time host transforms,
    client input, and spill VFX events.
- **Single Cloudflare Worker** serves the static client (`dist/` via the `ASSETS` binding)
  **and** hosts the Durable Object room. There is no separate static host (Vercel is not used).

---

## 2. Technology stack

- **Three.js** — rendering, scene, camera, post-processing, all visuals. Geometry is
  procedural (no third-party 3D models).
- **Rapier3D** — real-time physics. Runs on the **host client only**; the server has no
  physics engine. Arena colliders are `convexHull` + primitives (no trimeshes) after the
  July 2026 stability pass.
- **`partyserver`** (npm) — Durable Object rooms + WebSocket lifecycle + lobby/round state on
  Cloudflare Workers. `party/index.ts` is the DO class `CartRaveServer`. This is the
  `partyserver` **library**, not the PartyKit hosted platform (migrated off PartyKit, June 2026).
- **`partysocket`** (npm) — client WebSocket (`src/netcode.js`).
- **WebRTC** — peer-to-peer DataChannels (`src/netcode/p2p.js`); Cloudflare Calls provides TURN.
- **Vite** — dev server and production build (`dist/`).
- **Wrangler** — Worker bundle + asset upload + deploy (`wrangler.jsonc`).
- **Zustand** (`src/stores/`), **Howler.js** (audio), **nipplejs** (touch), **Tweakpane** (debug).

### Levels

| Level | File | Shape |
|-------|------|-------|
| Classic Record (default) | `src/levels/classicRecord.js` | Vinyl ring + center hole; dancefloor is a RING collider so carts fall through the center |
| Backrooms Supermarket | `src/levels/backroomsSupermarket.js` | Square carpet floor + four corner voids; `roundCuboid` floor edges (0.15 radius) |
| Zanzibar Platform | `src/levels/zanzibarPlatform.js` | Floating octagonal steel sundeck in a dynamic sunset seascape |
| Test Arena | `src/levels/testArena.js` | Dev-only scratch level |

Level is chosen in the menu, persisted in `localStorage` (`cartRaveLevel`), and mirrored into
the Zustand `settingsStore`. The server broadcasts the authoritative `levelId` in `MSG.hello`
and every `MSG.round` so late-joiners and rematches stay in sync.

---

## 3. Runtime architecture

### Host-authoritative physics

- The **first connected client** becomes the **host**.
- The host simulates **all** physics (humans + NPCs), produces authoritative transforms, and
  broadcasts them to peers over WebRTC (below).
- Non-host clients send **input** to the host over WebRTC and render remote carts from a
  buffered/interpolated stream. The local human cart uses **client-side prediction** with host
  reconciliation, so solo play and host-in-multiplayer have zero input lag.

### Room and slot model (4 slots)

- Every room has **four slots**. Empty slots are filled by **NPCs**; a human claims a slot by
  picking a color (the NPC holding that color is swapped out; a displaced NPC is recolored to
  the unused 5th color, not renamed).
- Slot assignment and host selection are managed server-side and broadcast to clients.
- **Solo** play reuses the multiplayer path (a private `soloXXXXXX` room with 3 NPCs).
- **Drop-in/drop-out:** humans can join mid-round; a matching NPC is swapped for the human
  (the host teleports the cart to its spawn booth) and the slot score resets to 0.

---

## 4. Network transport — two planes

### Control plane — `partyserver` WebSocket

Client connects with `partysocket` to
`wss://<host>/parties/cart-rave-server/<room>` (see `src/netcode.js`; `party` name is
`"cart-rave-server"`, room defaults to `quickplay`). The server (`party/index.ts`) handles:

- **Lobby:** `join`, `colorPick`, `cartLook`, `readyToggle`, `playAgain`.
- **Round lifecycle:** `hostRound` in, round/phase broadcasts out (carries authoritative
  `levelId`).
- **WebRTC signaling:** `requestTurnCredentials` (mints Cloudflare Calls TURN tokens, 2h TTL),
  `sdpOffer`, `sdpAnswer`, `iceCandidate` relayed between peers.
- **Kill feed:** `hostEventCollision`, `hostEventFall` (validated: slot ids clamped to 0–3,
  combo tier/multiplier sanitized) relayed to all clients.
- **Ghost exorcism, reaping, keepalive** (see §7).
- **`spill`:** a residual host-only WS relay handler still exists server-side, but the client
  now emits spill events over WebRTC (below), so the WS path is effectively unused.

**The server never simulates physics.** It relays and validates.

### Data plane — WebRTC DataChannels (peer-to-peer)

`src/netcode/p2p.js` manages `RTCPeerConnection` lifecycle, one `"physics"` DataChannel per
peer (`binaryType: "arraybuffer"`), ICE/TURN, and SDP exchange via the control-plane relay.
The host creates a channel per non-host peer; non-host clients receive via `ondatachannel`.
Input is buffered and flushed on `onopen` so nothing drops during connection setup or host
migration.

- **Host → peers:** `MSG.hostTransform` at **40 Hz** (`CONFIG.net.hostSendHz`) via
  `P2P.sendToAll(...)` (`src/netcode.js`, host send loop). Payload carries per-cart
  position/quaternion/velocity, boost/hop/spill/cargo flags, `seq`, `tHost`, and `levelId`.
- **Client → host:** `MSG.clientInput` at up to **60 Hz** (`CONFIG.net.clientInputHz`) via
  `P2P.sendToPeer(hostId, …)`. **Deduplicated:** a frame is sent only on axis change, nitro
  edge (press or release, sent immediately so charge-boost hold time is accurate), hop, or a
  100 ms heartbeat.
- **Spill VFX:** `sendP2PEvent(...)` → `P2P.sendToAll(...)`.

On `MSG.hostMigrated`, both sides tear down all peers (`P2P.closeAllConnections()`), re-init
P2P, request fresh TURN credentials, and reconnect to the new host.

---

## 5. Netcode tuning (verified against `src/config.js` `CONFIG.net`)

| Concern | Value | Key |
|---------|-------|-----|
| Host transform rate | 40 Hz | `hostSendHz` |
| Client input rate | 60 Hz | `clientInputHz` |
| Interpolation delay | 75 ms | `interpBufferMs` |
| Extrapolation cap | 50 ms | `extrapolationCapMs` |
| Snapshot buffer cap | 64 | `stateBufferMaxSize` |
| Keepalive interval | 5000 ms | `keepaliveIntervalMs` |
| Host-migration input freeze | 300 ms | `hostMigrationFreezeMs` |
| Clock resync interval | 30000 ms | `clockResyncIntervalMs` |

**Interpolation.** Non-host clients render remote carts behind the latest snapshot by
`interpBufferMs` (75 ms): the interp target is `Date.now() − serverClockOffsetMs − 75ms`. If
the buffer has no "after" snapshot, velocity extrapolation is allowed up to
`extrapolationCapMs` (50 ms), then carts hold last-known state.

**Client-side prediction + reconciliation** (`CONFIG.net.prediction`, non-host local cart only):

- Positional / rotational / velocity error correction rates: `reconcilePosRate: 8`,
  `reconcileRotRate: 6`, `reconcileVelRate: 5` (1/s).
- **Hard teleport** when error exceeds `maxCorrectionM: 4.0` m (covers respawns and large desyncs).
- Ignore correction below `minErrorM: 0.12` m (anti-jitter).
- **Yaw-only reconcile** (`yawOnlyReconcile: true`): corrects heading only during normal
  driving; local physics owns pitch/roll; full slerp fallback only when flip state disagrees
  (up-vector dot < 0.6).

**Clock synchronization** (`src/netcode.js`, `updateServerClockOffset`): the first 3 samples
form a **median-of-3** baseline (a single bad first sample would otherwise poison the estimate).
Steady state is an **EWMA** that rejects >500 ms outliers. Every `clockResyncIntervalMs`
(30 s) a fresh 3-sample median is blended **20%** into the running offset
(`offset*0.8 + median*0.2`) to arrest slow client-clock drift without a visible timer jump.
The offset resets to 0 on host promotion and on reconnect.

**Host migration.** If the host disconnects, the server promotes the oldest surviving
connection and broadcasts `MSG.hostMigrated`. The new host receives the last cached snapshot
and resumes NPC control. Server invariant: `#lastSeq` resets to `-1`. Client invariant: clear
`netStateBuffer` and reset clock offset; tear down and re-init all P2P connections.

---

## 6. Round lifecycle and HUD

Phase progression: **Lobby → Countdown (3s, all humans ready) → Running (150s) → Podium**, then
return to booths.

- Rounds start **only** via `MSG.gameStart`; there are no tick-level auto-starts in `update()`.
- **Ready-up gate:** humans start `isReady:false`, NPCs are always ready; the server
  broadcasts `gameStart` only when all humans are ready. Countdown cancels if a human leaves
  during the 3 s window.
- Round length is **150 s / 2.5 min**, host-authoritative. `CONFIG.round.durationMs`
  (`150000`) **must** equal `ROUND_DURATION_MS` in `party/index.ts` (`150_000`).
- **Podium:** host enters the `podium` phase; the physics substep and `hostTransform`
  broadcast pause. Results show final scores, winner highlight, Play Again (host only), Main
  Menu, personal stats, and session match history (last 10, in-memory until tab close).
- HUD/results show **player names** (not P1–P4), driven by the username system and 3D floating
  name labels above every cart.

---

## 7. Scoring, combos, and reliability

### Scoring (host-authoritative)

- A knockout is detected when a cart falls below `CONFIG.fall.yThreshold` (−10 m) during the
  running phase. Attribution credits a recent rammer within `CONFIG.scoring.hitWindowMs`
  (2500 ms). Planar distance from origin classifies center-hole vs edge falls.
- Base points: outer-edge knock +1, center-hole/void knock +2. Bonuses stack: critical
  (high-speed, `criticalVelocityThreshold` 11 m/s), target (victim is current leader), jackpot
  (critical + target).
- **Rampage combo** (`CONFIG.combo`): host-authoritative multiplier tiers — 1.5× RAMPAGE,
  2.0× SAVAGE, 3.0× CARNAGE — with a 5 s decay (`decayMs: 5000`). Decay runs in a dedicated
  second pass **after** all fall scoring for the frame to avoid an order-of-operations race.
- All-zero rounds (no one scored) do not count toward personal stats.

### Reliability: reaping and ghost exorcism

Platform "connection is live" cannot be trusted alone. An **activity reaper** removes
connections silent for >20 s (clients keepalive every 5 s; idle pickers with no `color_pick`
in >30 s are also reaped). **Ghost exorcism** (`party/index.ts`): when a client reconnects with
the same `clientId` but a new `connId`, the stale ghost connection and its slot/pending-picker
state are removed before the new session is admitted, preventing zombie hosts and duplicate
slots.

---

## 8. Operations

### URLs

| Resource | URL |
|----------|-----|
| Production game + Worker | `https://cart-rave.wyabro.workers.dev/` |
| Durable Object room (WS) | `wss://cart-rave.wyabro.workers.dev/parties/cart-rave-server/<room>` |
| Error log endpoint | `https://cart-rave.wyabro.workers.dev/api/log-error` (returns 204) |

The client auto-detects context: on `localhost` / `127.0.0.1` it targets `localhost:1999`
over `ws://`; in production it uses `wss://…/parties/cart-rave-server/<room>` (room from the
`?room=` query, default `quickplay`).

### Deploy and verify

- **Deploy:** `npm run ship` = `vite build && npx wrangler deploy` — publishes the client
  assets and the Durable Object worker together.
- **Tail logs:** `npx wrangler tail`.
- **Verify deployment, not local state:** confirm shipped client changes against the fetched
  deployed asset (cache-busting to avoid CDN masking). Deployed DO state may not match
  `main` unless explicitly deployed.
- **Durable Object state persists across deploys.** Deploying does not reset in-memory DO
  room state; it persists until all connections close and the DO evicts. Resetting between
  builds may require forcing eviction.

---

## 9. Status and pending work

- **Phase 4 (Multiplayer & Infrastructure)** is active; Phase 3 content is complete. Forward
  priorities live in [ROADMAP.md](./ROADMAP.md).
- **Pending:** two-browser multiplayer runtime smoke test; DO-state eviction between builds.
- **`main.js` is still the central wiring hub (~2,500 lines).** An ongoing extraction has
  pulled out `bootstrap.js`, `levelManager.js`, `ui/audioControls.js`, `ui/graphicsToggles.js`,
  `ui/cameraFraming.js`, `ui/menuStats.js`, and `ui/pauseOverlay.js`, among others — but it is
  not yet "thin." Treat "thin orchestrator" as a direction, not a current fact.

---

## 10. Provenance

This file supersedes `docs/Game_Architecture.md` (removed). Per-session detail lives in
`docs/handovers/` and code audits in `docs/audits/` — both are **historical archives** and are
not edited. Where those disagree with this file, this file and the code are authoritative.
