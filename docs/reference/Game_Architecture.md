# Cart Clash — Game Architecture & Design Notes (Consolidated)

**Document purpose:** A single, professional reference that consolidates the working notes in `docs/` into a coherent view of **how Cart Clash is built**, how multiplayer works, how releases are verified, and what work remains. Product naming freeze: [brand.md](../brand.md).

**Last updated context:** July 10, 2026 — post-jam, Phase 4 (Multiplayer & Infrastructure), working toward Version 2. HUD redesign, Sundial Station flagship, progression unlocks, and **Living Store** (cargo + PA directives) are in tree. See [ROADMAP.md](../planning/ROADMAP.md) for open priorities and [project-state.md](../planning/project-state.md) for the live snapshot.

**Source material:** Derived from `docs/` (handover notes in `archive/handovers/`, audits in `archive/audits/`, and operational checklists).

---

## Executive summary

**Cart Clash** is a browser-based **4‑player physics sumo** game. Players drive neon shopping carts across three arenas (vinyl **Cart Rave** ring, liminal **Storerooms**, floating **Sundial Station**). Players score by knocking opponents off edges or into voids/holes. Rounds run **150 seconds** (2.5 minutes); highest score wins. **Living Store:** the cargo bay is a live scoreboard, and the Store PA issues short mid-round rule mutators (directives).

At a high level, the architecture is:

- **Client-rendered 3D** with real-time physics simulation
- **Host-authoritative multiplayer**: one client simulates physics for everyone
- **partyserver** room server on Cloudflare Workers for connection management, slot assignment, and message relay
- **Static hosting** for the game client and assets; **Vite** builds `dist/` for production

---

## Goals and “definition of done”

- **Primary goal:** A friend can open the live site, pick a color, join a round quickly, play multiple rounds, and want to share it.
- **Original jam constraints (still largely true):**
  - Floor rotation is **visual-only** (no physics drag / spin forces applied to carts).
- **Post-jam additions:** Storerooms + Sundial Station (level id `zanzibar`), touch controls, rampage combo system, grocery spill VFX, KO Event reactors, Zustand stores, Vite build, `bootstrap.js` / `levelManager.js` extractions, client-side prediction, server-authoritative level sync via `MSG.round`, UI CSS in `src/ui/styles/` (including design tokens), WebRTC P2P DataChannel gameplay sync, lifetime unlocks, center-stage HUD, Living Store (cargo + directives — [living-store.md](./living-store.md)).

---

## Technology stack (as referenced in docs)

Pinned ranges and licenses live in [CREDITS.md](./CREDITS.md) / `package.json`. Snapshot:

- **Three.js** (`^0.185.1` / r185): rendering, scene, camera, post-processing, and visuals
- **Rapier3D** (`@dimforge/rapier3d` `^0.19.3`): physics (simulation runs on the **host client** only)
- **Zustand** (`zustand/vanilla` `^5.0.14`): UI/settings stores
- **Howler.js** (`howler` `^2.2.4`): music/SFX; procedural stings via Web Audio helpers
- **anime.js** (`animejs` `^4.5.0`), **Tweakpane** (`^4.0.5`), **nipplejs** (`^1.0.4`)
- **partyserver** (`^0.5.8`) + **partysocket** (`^1.3.0`): Durable Object rooms, WebSocket control plane
- **WebRTC DataChannels** + **Cloudflare Calls TURN** (API-minted credentials): gameplay P2P plane
- **Vite** (`^8.1.4`) + **vite-plugin-wasm** (`^3.6.0`) → `dist/`; **Wrangler** (`^4.110.0`) deploys Worker + `ASSETS`
- **Cloudflare Workers**: static hosting for the client + Durable Object hosting for multiplayer relay
- **Vitest** / **happy-dom** / **knip** / TypeScript **6.x** (`tsc --noEmit`) — quality gate via `npm run check`

**Levels** (display names; see [brand.md](../brand.md)):

| Level id | Display name | Shape |
|----------|--------------|--------|
| `classicRecord` | **CART RAVE** | Vinyl ring + center hole |
| `backrooms` | **THE STOREROOMS** | Square floor + corner voids |
| `zanzibar` | **SUNDIAL STATION** | Floating sundeck + sunset seascape |

---

## Runtime architecture (conceptual model)

### Host-authoritative physics

- The **first connected client** becomes the **host**.
- The host:
  - Simulates **all physics** (humans + NPCs).
  - Produces authoritative transforms/snapshots and broadcasts them to peers.
- Non-host clients:
  - Send **inputs** to the host.
  - Render remote carts from buffered/interpolated snapshots for smoothness.

### Room and slot model (4 slots)

- The system maintains **four slots**.
- Slots are filled with:
  - **Humans** when available (humans replace NPCs on connect)
  - **NPCs** as defaults/fallbacks
- Slot assignment and host selection are managed server-side and broadcast to clients.

---

## Multiplayer message flow (partyserver ↔ clients)

Hybrid topology: **WebSocket control plane** (PartyKit / `party/index.ts`) + **WebRTC gameplay plane** (`src/netcode/p2p.js`).

### Core behaviors (documented)

- **Late-join snapshot:** On connect, the server sends a `hello` payload with the current room state:
  - host id, slot assignments, cached cart state, round/phase state, sequence counters, and metadata.
- **Inputs & transforms (P2P):** Non-hosts send `client_input` on the host DataChannel; the host broadcasts binary transform snapshots at ~**40 Hz** when P2P is open. The WebSocket is **not** the gameplay relay for inputs/transforms (legacy “server forwards inputs” notes are stale).
- **State broadcast format:** Hybrid binary — 16 B header + 52 B/cart + JSON tail (`collisions` / `falls` / active directive). Decoder rejects truncated buffers and `numCarts > 4` (`src/netcode/binary.js`).
- **Host migration:** If the host disconnects, the server elects a successor and broadcasts `host_migrated`. Clients close all peers, re-init P2P, and continue from last-known transforms. **Known edges** (clock domains, null-host after ghost exorcism, hit-attribution not transferred, spawn vs live buffer timebases): [planning/netcode-deep-dive.md](../planning/netcode-deep-dive.md) — read before a deep multipath pass.
- **Session teardown:** `disconnectPartySession()` closes the Party socket **and** all WebRTC peers/DataChannels (menu return must not leak old channels).
- **Join reject cleanup:** `#rejectPendingConn` only sends `joinRejected` and closes the socket; `onClose` owns map/slot cleanup so a never-assigned picker does not take the human→NPC path.

### P2P connection lifecycle

- **Host is the offerer:** `ensureHostPeerConnections()` on `MSG.slots` / TURN-ready opens offers to every other human peer. Non-hosts answer.
- **ICE `"disconnected"` is transient:** 5 s grace before teardown; `"failed"` / `"closed"` tear down immediately (`p2p.js`).
- **Mid-match recovery:** Host keepalive (~5 s) runs `maintainHostPeerConnections()` — re-offers missing/dead/channel-down peers with per-peer cooldown (`CONFIG.net.p2pReconnectCooldownMs`) and a stuck-negotiation timeout (`p2pConnectingTimeoutMs`). Does not re-offer during ICE disconnect grace.

### Smoothing and latency handling

- Clients use an **interpolation buffer** to render remotes slightly in the past (`CONFIG.net.interpBufferMs`, currently **75 ms**).
- Host applies remote inputs after a short jitter buffer (`inputJitterBufferMs`, typically 40 ms).
- Non-host local cart: client-side prediction + rewind/replay reconciliation against host snapshots.

---

## Round lifecycle and HUD (high-level)

### Phase model (as referenced in docs)

Notes describe a phase progression along the lines of:

- **Lobby / waiting**
- **Countdown**
- **Running**
- **Podium / results**

HUD and results work shipped over time to support:

- Region-based HUD (match / standings / events / stage / pod / utility) with design tokens (`src/ui/styles/tokens.css`)
- **Center Stage** (`src/ui/centerStage.js`) — one-moment-at-a-time arbiter for announcer + challenge toasts
- Countdown messaging, running timer (150s / 2.5 min), sticker scoreboard chips, kill feed, boost charge
- Touch-specific layout (`#hud.hud-touch`); mute-only audio chrome in-match
- Results/podium overlay with final scores, match superlatives, challenge progress, "PLAY AGAIN" (host), Main Menu
- Announcer callouts ("The Store PA") — see [announcer.md](./announcer.md)
- Living Cargo bay fill as a field-readable scoreboard (`src/cargoLoad.js`)
- PA **directives** HUD chip + focus callouts (`src/directives/`, host-scheduled mini-mutators)

---

## Scoring system (audit-based summary)

The scoring system was reviewed against the design intent in a dedicated audit note. The implementation is primarily host-driven and generally follows:

- **Fall-based scoring:** A knockout is detected when a cart falls below a configured vertical threshold during the running phase on the host.
- **Attribution:** Recent collisions/ram events are used to attribute the knockout to an attacker within a time window.
- **Kill zones:** Center-hole (Classic), corner voids (Storerooms, elevated base), outer edge, and Sundial high-ground bonus when the crediting ram was from the podium. Classification feeds `buildKOEvent` / `reward`.
- **Bonuses and stacking:** Critical, leader, high-ground, and combo multiplier can stack; score floats show the breakdown.
- **Rampage combo system:** Host-authoritative combo multiplier (1.5× RAMPAGE, 2.0× SAVAGE, 3.0× CARNAGE) with 5-second decay in a dedicated second pass.
- **Reactors:** match stats → challenges → local kill-confirm → arena VFX → kill feed → announcer. As-built: [scoring-event-system.md](./scoring-event-system.md).

---

## Operational notes: environments, URLs, and verification

### Production endpoints (documented)

- **Static site:** `https://cart-rave.wyabro.workers.dev/` (Worker hosts assets + DO)
- **partyserver host pattern:** `https://<project-name>.<account-slug>.workers.dev`
  - Example: `https://cart-rave.wyabro.workers.dev`

### WebSocket canonical shape

The partyserver realtime URL shape is:

- `wss://<host>/parties/<party>/<room>`
- For example: `wss://cart-rave.wyabro.workers.dev/parties/main/quickplay`

### Verification guidance (documented practice)

The docs emphasize that verification should avoid false confidence from local state:

- **Client verification:** Confirm shipped client changes against the deployed static asset (using cache-busting / no-cache techniques to avoid CDN masking updates).
- **Server/DO verification:** Deploy state may not match GitHub `main` unless explicitly deployed; verify via wrangler runtime tailing where applicable (`npx wrangler tail`).

### Important platform characteristic: persistent server state

Cloudflare Durable Object state is described as **persisting across deploys**. This informs operational expectations:

- Deploying does **not** inherently reset in-memory Durable Object state (such as active lobby states or room state storage) unless we force eviction or manually wipe state.
- Production may retain state until all connections close and the DO evicts from memory.

---

## Reliability strategy: heartbeats and reaping stale connections

Several notes focus on avoiding “ghost host” / zombie connection issues:

- **Problem:** platform-level connection liveness cannot be relied upon as the only oracle (crashes, sleep, dead sockets, tabs disappearing uncleanly).
- **Approach:** an activity-based “reaper” model:
  - Clients send periodic keepalive traffic.
  - The server tracks last activity per connection and removes stale ones after a timeout.
  - Host handoff proceeds from this repaired “live set.”

This is treated as a core resiliency feature for real-world multiplayer behavior.

---

## Known issues and risk register (as described in docs)

The docs capture a mix of blocking issues, non-blocking issues, and “must verify” items. Highlights include:

- **Multiplayer runtime smoke test pending** (two-browser integration not yet verified).
- **Persistent Durable Object state** across deploys may retain stale room state.
- **Smoothing/latency tuning** (interpolation buffer and perceived non-host lag).
- **Black-frame flicker** on some Windows + Chromium + NVIDIA stacks (see planning flicker plan).
- **Living Store multiplayer** paths verified solo; two-browser checklist deferred ([living-store-test-plan.md](../planning/living-store-test-plan.md)).

---

## Process and safety rules (how the project is worked on)

The handover notes repeatedly stress process discipline for reliability:

- **Verify reality, not assumptions**
  - Production behavior checks are required for behavior-changing work.
  - Local greps are not treated as sufficient evidence of deployment state.
- **Be cautious with platform quirks**
  - Treat “connection is live” as a hypothesis unless heartbeats confirm it.
  - Be mindful of data structures returned by platform APIs (iterators vs arrays).
- **Keep changes small and testable**
  - Prefer targeted diffs and isolated fixes with verification between them.

---

## Roadmap themes (what's next)

### Near-term (active)

**Primary source:** [ROADMAP.md](../planning/ROADMAP.md)

- Multiplayer runtime smoke test (two browsers, one room) — includes Living Store checklist + [netcode-deep-dive.md](../planning/netcode-deep-dive.md) hazards
- Black-frame flicker triage
- Menu overhaul + domain cutover
- Deeper performance pass (level swap / menu / profiling)

### Content and features (shipped foundations)

- Touch controls; daily/weekly challenges; rampage combo
- Level 3 **Sundial Station** (+ Classic / Storerooms elevation)
- Announcer ("The Store PA"); center-stage HUD redesign
- Lifetime cosmetic + level unlocks; match-stat spine
- **Living Store** — cargo scoreboard + PA directives ([living-store.md](./living-store.md))

### Technical and release (later)

- Remaining perf / WebGPU experiments
- Domain cutover after naming freeze
- `structuredClone` performance optimization for DO broadcasts

See [ROADMAP.md](../planning/ROADMAP.md) for open post-jam priorities.

---

## Appendix: Notes on documentation provenance

- This consolidated file intentionally avoids duplicating raw session narratives, commit hashes, or code-level line references unless they communicate an architectural principle.
- For deeper implementation-specific detail, handovers (`docs/archive/handovers/`), audits (`docs/archive/audits/`), and session notes (`docs/archive/session-notes/`) remain the historical record.

