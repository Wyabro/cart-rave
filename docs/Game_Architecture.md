# Cart Rave — Game Architecture & Design Notes (Consolidated)

**Document purpose:** A single, professional reference that consolidates the working notes in `docs/` into a coherent view of **how Cart Rave is built**, how multiplayer works, how releases are verified, and what work remains.

**Source material:** This document is derived exclusively from the files in `docs/` (handover notes, audits, and operational checklists).

---

## Executive summary

**Cart Rave** is a browser-based **4‑player physics sumo** game. Players drive neon shopping carts on a club dancefloor shaped like a vinyl record (a ring with a center hole). Players score by knocking opponents off the edge or into the hole. Rounds are designed to run **60 seconds**, and the highest score wins.

At a high level, the architecture is:

- **Client-rendered 3D** with real-time physics simulation
- **Host-authoritative multiplayer**: one client simulates physics for everyone
- **PartyKit room server** for connection management, slot assignment, and message relay
- **Static hosting** for the game client and assets; no mandatory build pipeline for the client runtime

---

## Goals and “definition of done”

- **Primary goal:** A friend can open the live site, pick a color, join a round quickly, play multiple rounds, and want to share it.
- **Jam scope constraints (explicit cuts):**
  - Floor rotation is **visual-only** (no physics drag / spin forces applied to carts).
  - Deeper optimization and advanced netcode (prediction, reconciliation) are deferred.

---

## Technology stack (as referenced in docs)

- **Three.js**: rendering, scene, camera, post-processing, and visuals
- **Rapier3D**: physics (simulation runs on the host client)
- **PartyKit**: multiplayer rooms + WebSocket relay + lightweight server state
- **Vercel**: static hosting for the client

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

## Multiplayer message flow (PartyKit ↔ clients)

### Core behaviors (documented)

- **Late-join snapshot:** On connect, the server sends a `hello` payload with the current room state:
  - host id, slot assignments, cached cart state, round/phase state, sequence counters, and metadata.
- **Input relay:** Clients send `client_input` messages; the server forwards these **only to the host**.
- **State broadcast:** The host emits periodic transform snapshots (documented at ~20 Hz) for all carts; the server broadcasts these to all peers.
- **Host migration:** If the host disconnects, the server elects a successor and broadcasts a host-migration event. Carts continue from last-known transforms rather than reinitializing.

### Smoothing and latency handling

- Clients use an **interpolation buffer** to render behind the latest snapshot to trade latency for stability.
- A documented tuning value exists for this buffer (noted in docs as ~150 ms with intent to reduce).

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
- Running timer
- Score display per slot (P1–P4)
- Results/podium overlay with final scores, rematch, and outbound portal link

---

## Scoring system (audit-based summary)

The scoring system was reviewed against the design intent in a dedicated audit note. The implementation is primarily host-driven and generally follows:

- **Fall-based scoring:** A knockout is detected when a cart falls below a configured vertical threshold during the running phase on the host.
- **Attribution:** Recent collisions/ram events are used to attribute the knockout to an attacker within a time window.
- **Center-hole vs edge:** Planar distance from origin is used to classify center-hole knockouts versus non-center falls.
- **Bonuses and stacking:** Bonus conditions can stack on top of base points (with details and exact behavior evolving across sessions).

The audit notes also emphasize:

- Where the implementation matches intent
- Where behavior differs from spec (including tie-handling, critical condition definitions, and early-end conditions)
- What remains to align scoring outcomes with the intended ruleset

---

## Operational notes: environments, URLs, and verification

### Production endpoints (documented)

- **Static site:** `https://www.cartrave.lol/`
- **PartyKit host pattern:** `https://<project-name>.<account-slug>.partykit.dev`
  - Example referenced in docs: `https://cart-rave.wyabro.partykit.dev`

### WebSocket canonical shape

The PartyKit realtime URL shape is:

- `wss://<host>/parties/<party>/<room>`

### Verification guidance (documented practice)

The docs emphasize that verification should avoid false confidence from local state:

- **Client verification:** Confirm shipped client changes against the deployed `main.js` (using cache-busting / no-cache techniques to avoid CDN masking updates).
- **Server verification:** PartyKit deploy state may not match GitHub `main` unless explicitly deployed; verify via PartyKit runtime tooling and live tailing where applicable.

### Important platform characteristic: persistent server state

PartyKit/Durable Object state is described as **persisting across deploys**. This informs operational expectations:

- Deploying does **not** inherently reset in-memory server fields such as host id, slot mapping, or sequence counters.
- Production may retain “ghost” state until an explicit liveness mechanism clears it.

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

- **Ready-up / refresh race conditions** (intermittent blockers depending on connection liveness behavior).
- **Non-host lifecycle edge cases** (e.g., respawn behavior and fall handling).
- **Tie-handling correctness** (especially all-zero outcomes and deterministic tie bias).
- **Smoothing/latency tuning** (interpolation buffer and perceived non-host lag).
- **Pre-submission cleanup** items (diagnostic logs, dead variables, and remaining polish tasks).

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

## Roadmap themes (what’s next / what’s deferred)

### Near-term (jam-focused)

Notes indicate a practical ordering around:

- Stabilizing lobby/ready flows
- Color selection gating
- Rounds/results polish
- Lag mitigation tuning
- Final QA and cleanup pass before submission

### Post-jam ideas (deferred)

Ideas explicitly listed as post-jam include:

- VFX: spilling cart contents on knockover
- Online progression: persistent leaderboard (e.g., Supabase)
- Menu/UX: a drivable main menu with portals for mode selection
- Performance/networking: draw-call reduction through static mesh merges, stable damping formulas, client-side prediction, and interpolation tuning

---

## Appendix: Notes on documentation provenance

- This consolidated file intentionally avoids duplicating raw session narratives, commit hashes, or code-level line references unless they communicate an architectural principle.
- For deeper implementation-specific detail, the original per-session handovers and audits remain the canonical historical record in `docs/`.

