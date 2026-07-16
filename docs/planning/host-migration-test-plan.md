# Host migration — deferred live (2-client) test plan

Status: **TODO** (deferred 2026-07-11). The migration *logic* is now unit-covered — server
promote-oldest (`party/hostSelection.ts`), the client handoff (`applyHostMigration` in
`src/netcode.js`), round validation (`party/roundValidation.ts`), and the P2P size gate
(`src/netcode/p2pLimits.js`); see `tests/hostMigration.test.js`, `tests/roundValidation.test.js`,
`tests/p2pLimits.test.js` (commits `1dbb48a`, `6ee9c0b`). Those prove the rules hold. They do
**not** prove the handoff *feels* right in a real session — freeze-window timing, resume
smoothness, and drop-detection paths only exist with real clients. That is what this covers.

Related: the "Host migration mid-window" bullet in `living-store-test-plan.md` (directive
behavior during migration) — run these together.

## Setup

- Launch: `npm run dev:local`. Use `127.0.0.1` (not `localhost`) for the wrangler control
  plane. Quickplay/friends room.
- Keep **every** window visible and side-by-side — a hidden/background tab freezes its rAF
  loop and stalls that client, which will look exactly like a migration bug but isn't.
- Use **3 clients** for the promotion-ordering cases (you need a defined "oldest survivor").
  2 clients is enough for the phase/feel cases. Phone can be the 3rd.
- Label the windows by join order (C1 first, then C2, then C3) — promotion walks join order.

## Two ways a host disappears (test BOTH — different server paths)

- [ ] **Clean close** — close the host window/tab. `onClose` fires immediately →
      `#ensureLiveHost` promotes and broadcasts `MSG.hostMigrated` within a frame. Promotion
      should feel near-instant.
- [ ] **Silent drop** — DevTools → Network → **Offline** on the host (or phone airplane
      mode), leave the window open. `onClose` never fires; the activity reaper
      (`REAP_TIMEOUT_MS = 20s`) must catch it. Expect ~20s of a frozen/stale host before
      migration. Confirm it *does* eventually migrate and does not wedge the room.

## Promotion correctness (server `pickNextHostId`)

- [ ] With C1 (host), C2, C3 all human: drop C1 → **C2** (earliest remaining human) becomes
      host, not C3, not random. Repeat dropping the new host → C3.
- [ ] Drop a NON-host (C3) mid-match → **no** migration, no host glyph move, no freeze on
      anyone; C3's slot goes NPC.
- [ ] All humans but one leave → last human is host; room still playable solo-vs-NPC.

## Per-phase migration (drop the host during each)

- [ ] **Running**: new host resumes the sim; other clients freeze briefly
      (until first post-epoch snap or `hostMigrationFreezeMaxMs` 2000) then interpolate from the new host. Carts must not
      teleport or rubber-band beyond that window. **Scores are preserved** (never reset or
      decrease — server clamps monotonic). Round timer continues from where it was.
- [ ] **Countdown**: promotion happens; countdown either continues or resets cleanly to a
      legal state — no client stuck on a dead countdown.
- [ ] **Podium**: results stay stable on all clients (winner/scores unchanged); **rematch
      still works** (podium → lobby → new round) under the new host.
- [ ] **Sudden Death**: migration continues SD (validator has no upper time bound in SD);
      SD does not silently end or restart. No directive fires during SD.

## Handoff quality (the part unit tests can't judge)

- [ ] **Non-host → host**: when a client that was predicting gets promoted, its own cart
      does not jump; no "ghost" replayed inputs after the flip (prediction/input state is
      cleared in `applyHostMigration`).
- [ ] **Freeze feel**: 300ms freeze — does it read as a tiny hitch (good) or a visible stall
      (too long) / a hard snap (too short)? Tune `CONFIG.net.hostMigrationFreezeMs`.
- [ ] **Straggler snap**: a late packet from the *old* host is rejected post-migration
      (source re-point). Watch the moment of handoff for a single-frame position pop on any
      cart — should be absent or imperceptible.
- [ ] **Old host rejoins**: bring the dropped host back online → it joins as a **normal
      client**, not host; no host-glyph tug-of-war, no double-host.
- [ ] **Announcer + HUD**: `announce("new_host")` PA callout fires once, and the HUD host
      glyph moves to the new host's chip on all clients.

## Console / signal checks (have DevTools open on 2 clients)

- [ ] `[netcode]` / `[p2p]` logs show one clean migration sequence per drop (no repeated
      re-offers thrashing, no error spam).
- [ ] **No `Oversized … frame dropped` warnings during normal play** — the P2P size gate
      (`p2pLimits`) should be silent in real matches. If it fires normally, a cap is too
      tight (`MAX_SNAPSHOT_TAIL_BYTES` / `MAX_P2P_*`), not an attack.
- [ ] After resume, all clients agree on cart positions and scores (no persistent desync).

## Tuning knobs (current values, `src/config.js` → `CONFIG.net`)

| knob | value | affects |
| --- | --- | --- |
| `hostMigrationFreezeMs` | 300 | legacy min label only — freeze is not fixed 300 ms |
| `hostMigrationFreezeMaxMs` | 2000 | non-host freeze after `host_migrated` until first post-epoch snap **or** this cap |
| `interpBufferMs` | 75 | remote-cart interpolation delay (resume smoothness) |
| `hostSendHz` | 40 | host snapshot rate (how fast the new host's stream fills) |
| `turnCredentialsTimeoutMs` | 2500 | TURN wait before the new host opens peer offers |
| `REAP_TIMEOUT_MS` (server) | 20000 | silent-drop detection latency |

## Pass criteria

Migration is "good enough to ship" when, across 2–3 clients: clean-close promotes within a
frame and silent-drop within the reaper window; the **earliest** surviving human is always
chosen; scores/round state survive every phase; the freeze reads as a hitch not a stall; and
no persistent desync or console error spam follows any drop.
