# Cart Rave — Game Architecture & Design Notes (Consolidated)

**Document purpose:** A single, professional reference that consolidates the working notes in `docs/` into a coherent view of **how Cart Rave is built**, how multiplayer works, how releases are verified, and what work remains.

**Last updated context:** July 2026 — post-jam, Phase 4 (Multiplayer & Infrastructure), working toward Version 2. See [ROADMAP.md](./ROADMAP.md) for current priorities and [project-state.md](./project-state.md) for the live snapshot.

**Source material:** Derived from `docs/` (handover notes in `handovers/`, audits in `audits/`, and operational checklists).

---

## Executive summary

**Cart Rave** is a browser-based **4‑player physics sumo** game. Players drive neon shopping carts on a club dancefloor shaped like a vinyl record (a ring with a center hole). Players score by knocking opponents off the edge or into the hole. Rounds are designed to run **150 seconds** (2.5 minutes), and the highest score wins.

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
- **Post-jam additions:** Backrooms and Zanzibar levels, touch controls, rampage combo system, grocery spill VFX, Zustand store architecture, Vite build, `bootstrap.js` / `levelManager.js` extractions. Client-side prediction is now active for non-host local carts. Server-authoritative level sync via `MSG.round`. Combo decay runs in a dedicated second pass to prevent scoring race conditions.

---

## Technology stack (as referenced in docs)

- **Three.js**: rendering, scene, camera, post-processing, and visuals
- **Rapier3D**: physics (simulation runs on the host client)
- **partyserver**: Durable Object rooms + WebSocket relay + lightweight server state on Cloudflare Workers
- **Vite**: dev server and production build (`dist/`)
- **Cloudflare Workers**: static hosting for the client + Durable Object hosting for multiplayer relay

**Levels:** Classic Record (vinyl ring + center hole), Backrooms Supermarket (square floor + corner voids), Zanzibar Platform (floating octagonal sundeck in sunset seascape).

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

### Core behaviors (documented)

- **Late-join snapshot:** On connect, the server sends a `hello` payload with the current room state:
  - host id, slot assignments, cached cart state, round/phase state, sequence counters, and metadata.
- **Input relay:** Clients send `client_input` messages; the server forwards these **only to the host**.
- **State broadcast:** The host emits periodic transform snapshots (documented at ~20 Hz) for all carts; the server broadcasts these to all peers.
- **Host migration:** If the host disconnects, the server elects a successor and broadcasts a host-migration event. Carts continue from last-known transforms rather than reinitializing.

### Smoothing and latency handling

- Clients use an **interpolation buffer** to render behind the latest snapshot to trade latency for stability.
- A documented tuning value exists for this buffer (~100 ms with intent to reduce).

---

## Round lifecycle and HUD (high-level)

### Phase model (as referenced in docs)

Notes describe a phase progression along the lines of:

- **Lobby / waiting**
- **Countdown**
- **Running**
- **Podium / results**

HUD and results work shipped over time to support:

- Countdown messaging
- Running timer (150s / 2.5 min)
- Score display per slot (P1–P4)
- Results/podium overlay with final scores, "PLAY AGAIN" (host only), and Main Menu

---

## Scoring system (audit-based summary)

The scoring system was reviewed against the design intent in a dedicated audit note. The implementation is primarily host-driven and generally follows:

- **Fall-based scoring:** A knockout is detected when a cart falls below a configured vertical threshold during the running phase on the host.
- **Attribution:** Recent collisions/ram events are used to attribute the knockout to an attacker within a time window.
- **Center-hole vs edge:** Planar distance from origin is used to classify center-hole knockouts versus non-center falls.
- **Bonuses and stacking:** Bonus conditions can stack on top of base points (critical + target + combo multiplier).
- **Rampage combo system:** A host-authoritative combo multiplier (1.5x RAMPAGE, 2.0x SAVAGE, 3.0x CARNAGE) with 5-second decay timer running in a dedicated second pass to prevent order-of-operations race conditions with fall scoring.

The audit notes also emphasize:

- Where the implementation matches intent
- Where behavior differs from spec (including tie-handling, critical condition definitions, and early-end conditions)
- What remains to align scoring outcomes with the intended ruleset

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
- **Smoothing/latency tuning** (interpolation buffer and perceived non-host lag).

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

### Near-term (Phase 4 — active)

**Primary source:** [ROADMAP.md](./ROADMAP.md)

- Multiplayer runtime smoke test (two browsers, one room)
- Host migration hardening
- Netcode math hardening (buffer flood, clock drift)
- Server-authoritative options evaluation

### Content and features (Phase 3 — complete)

- Touch controls (shipped)
- Level 3: Zanzibar Platform (shipped)
- Daily/Weekly challenges (shipped)
- Rampage combo system (shipped)
- Grocery spill VFX (shipped)

### Technical and release (Phase 5 — deferred)

- Lag mitigation, performance pass
- Menu overhaul, rename + new domain (Version 2 release)
- `structuredClone` performance optimization for DO broadcasts

See also [post-jam-ideas.md](./post-jam-ideas.md).

---

## Appendix: Notes on documentation provenance

- This consolidated file intentionally avoids duplicating raw session narratives, commit hashes, or code-level line references unless they communicate an architectural principle.
- For deeper implementation-specific detail, per-session handovers (`docs/handovers/`) and audits (`docs/audits/`) remain the canonical historical record.

