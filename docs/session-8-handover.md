# Session 8 Handover — Multiplayer Netcode Wiring

Date: 2026-04-19

## Server (`party/index.ts`) — current state

- **Implemented**: room state + host election + host migration + late-join snapshot.
  - Maintains `hostId`, `slots` (4 slots, NPC default; humans replace NPCs on connect; revert on disconnect), `carts` cache, minimal `round`, and `seq`.
  - On connect: assigns host if none, assigns a human to a slot, and immediately sends a **`hello`** snapshot containing:
    - `slots`, `round`, `carts`, `hostId`, `youConnId`, `serverNowMs`, `roomId`, `seq`, `path`
  - On host disconnect: chooses a new host from remaining connections and broadcasts `host_migrated`. **Carts continue from last cached transforms** (no re-init).
- **Implemented**: `client_input` relay to host only.
  - Any client may send `{ type:"client_input", seq, tClient, input:{ throttle, steer, nitro } }`.
  - Server forwards to host only (not broadcast) with `connId` attached.
- **Diagnostics**: server logs full `hello` payload body via `JSON.stringify(helloPayload)` in the “sending hello…” log line.

## Client (`main.js`) — current state

### What exists (netcode pieces are written)

- **Message type constants** exist inline (`MSG.*`), incl. `hello`, `state`, `host_migrated`, `client_input`, `host_transform`.
- **Slot-based local player resolution** exists:
  - `youConnId` variable
  - `localSlotIndexForConn(connId)` and `localCartForConnId()`
- **Netcode helpers exist** (intended wiring):
  - `setAuthorityMode(...)`
  - `startHostSendLoop()` (20Hz `host_transform`)
  - `startInputSendLoop()` (20Hz `client_input` from non-host)
  - message handlers for `hello` / `state` / `host_migrated` (authoritative vs render-only)
- **Interpolation buffer**: `CONFIG.net.interpBufferMs = 150` is present.

### What is NOT wired (root cause of current breakage)

- **Legacy PartySocket IIFE still runs at page load** near the bottom of `main.js`:
  - It connects and logs `"connected to party"`.
  - It logs incoming messages, but **does not apply `hello`**, does not set `youConnId`, does not set `isHost`, and does not start the host loop / input forwarding.
- Because of this, the new netcode code is effectively bypassed, and the page behaves like a hybrid of old local sim + incomplete net plumbing.

## Scope cuts locked into `.cursorrules`

- **CUT (jam)**: server-synced dancefloor rotation. Jam build uses local time for rotation; server-synced time is post-jam.
- **CUT (jam)**: dancefloor physics drag (floor is visual-only; no “push carts via rotating floor”).
- **Kept in-scope**: room code in URL (`?room=ABCD`), but it is **not implemented yet**.

## Known-good stability note (PartyKit dev)

- When there is **exactly one** `workerd` listening on `:1999`, the 2-device repro did **not** produce `Uncaught ... Error: internal error`.
- When multiple `workerd` processes/listeners existed, `internal error` lines appeared intermittently and behavior was ambiguous.

## Current test gap / must-fix-next

- **Solo play is currently broken**: camera follows slot 0 fallback; `youConnId` never updates; net authority never establishes; controls/AI don’t behave as “solo first-class”.
- **Do not add more netcode** until the existing netcode is actually wired.

## What needs to happen next (wiring task)

- **Replace the legacy PartySocket IIFE** with a proper netcode init that:
  1. Creates one PartySocket
  2. On `open`: sends `join`
  3. On `message`:
     - On `hello`: set `youConnId`, apply `slots`/`carts` snapshot, set `hostId`, call `setAuthorityMode(hostId === youConnId)`
     - On `host_migrated`: update `hostId`, re-evaluate host, and if becoming host, resume from last carts cache and start the 20Hz send loop
     - On `state` (non-host): push into interpolation buffer, render 150ms behind latest
     - On `client_input` (host): map `connId` -> `slot` via `slots[].connId`, apply inputs to that cart’s controls (host keeps its own local slot local)
  4. Ensures **solo first-class**: first client should become host immediately on `hello`, so local input + NPC AI + physics run without waiting on any second device.

## Important guidance for next agent

- **Do not rewrite the netcode helpers**; they already exist. The problem is wiring/entrypoint: the legacy IIFE bypasses them.
- Re-run the “single workerd on :1999” cleanliness check before any LAN testing.

