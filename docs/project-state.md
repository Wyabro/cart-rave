
# Cart Rave — Project State

**Last updated:** End of Session 16, April 23, 2026
**Deadline:** Cursor Vibe Jam 2026, May 1, 2026 @ 13:37 UTC (~8 days out)
**Production:** https://www.cartrave.lol/
**Repo:** https://github.com/Wyabro/cart-rave (flat at root, `main` branch)
**Latest deployed commit:** `Step 12 Complete` — `feat(ready-up): implement server-driven lobby gate and neon HUD button`

---

## 1. Project Overview & Goal

Cart Rave is a browser-based **4-player physics sumo game**. Players drive neon shopping carts on a slowly rotating club dancefloor shaped like a vinyl record with a hole in the center. You ram opponents off the edge or into the center hole to score points. Rounds are 60 seconds.

**Stack:**
- **Three.js** — rendering (r128 via CDN)
- **Rapier3D** — physics (via CDN, no bundler)
- **PartyKit** — multiplayer server (WebSocket relay, room-based)
- **Vercel** — static hosting for the client
- **No build step.** Everything is served as static ES modules via CDN. Import map in `index.html` resolves `three`, `@dimforge/rapier3d-compat`, and `partysocket` to esm.sh URLs.

**Design doc:** `.cursorrules` at repo root contains the original spec and constraints. Treat it as the source of truth for design intent.

**Goal:** Ship a polished, fun, multiplayer-capable entry for Vibe Jam 2026. The "win state" is: a friend can click cartrave.lol, pick a color, get in a round, have fun for 3-5 rounds, and want to share it.

---

## 2. Current Architecture

**AI Modding Constraints:**
* **Host-Driven Physics:** The first connected client is the host and calculates all Rapier3D physics. The PartyKit server only relays inputs and state.
* **Single-File Editing:** `main.js` is ~3,400 lines. When providing code fixes, provide ONLY the specific function or block being changed. Do not output the full file.
* **No Build Step:** Do not add package.json dependencies. All Three.js and Rapier3D imports must remain as CDN esm.sh URLs.

### File structure (flat at root)

cart-rave/
├── index.html              # Entry point, import map, CDN scripts
├── main.js                 # ~3,450 lines — client logic, physics loop, UI, networking
├── cart.js                 # 479 lines — procedural cart mesh generator
├── party/
│   └── index.ts            # ~500 lines — PartyKit server (authoritative room state)
├── partykit.json           # PartyKit config
├── vercel.json             # Vercel static hosting config
├── package.json            # Dev dependencies only (npm run ship added Session 16)
├── sounds/                 # Audio assets (horn, boost, ambient)
├── deferred/               # Code that's been temporarily parked
├── docs/                   # Session handovers (session-8 … session-16), project-state.md, etc.
└── .cursorrules            # Original design doc + behavioral rules for Cursor


**Single-file client intentionally.** No bundler, no framework. Every feature lives in `main.js`. Functions are namespaced by prefix comments (`// --- Ramming ---`, `// --- Scoring ---`, etc.) but there are no modules.

### Core loops and how they connect

**Physics loop (fixed timestep, host-authoritative):**
- `stepOnce()` in main.js runs physics at 60Hz regardless of render rate.
- Only the **host** (the first client to connect to a room, or the migrated host if the original leaves) runs the actual physics simulation.
- Host publishes cart transforms to PartyKit via `MSG.hostTransform` every physics tick.
- Non-host clients are pure viewers: they receive transforms and interpolate into a ring buffer (`netStateBuffer`, interpBufferMs = 150).

**Input loop:**
- Clients publish input (WASD, shift, space) via `MSG.input` to PartyKit.
- Host consumes inputs tagged with sender `connId` and applies them to the correct cart's rigid body.

**Round phase machine (Server-Gated as of Step 12):**
- States: `lobby` → `countdown` (3s) → `running` (60s timer) → `podium`
- Start transition now driven entirely by `MSG.gameStart` from PartyKit server.
- Host broadcasts phase via `MSG.hostRound` which contains `{phase, startedAtMs, countdownStartedAtMs, winnerSlotIndex, scores}`.
- Clients update their local phase state from received messages (main.js ~line 707).

**Networking layer:**
- `party/index.ts` is a PartyKit room. It does **NOT** simulate physics or validate gameplay — it relays messages between connected clients.
- Server-side responsibilities: connection tracking, slot assignment (4 slots: 0/1/2/3, each "human" or "npc"), `isReady` state checking, host election, protocol version check (currently `PROTOCOL_VERSION = 2`).
- Server broadcasts `MSG.slots` when slot assignments change (someone joins/leaves, toggles ready, NPCs fill empty slots).
- When host leaves, server picks the oldest remaining human connection as new host via `becomingHost` message.

**Input spoofing protection (Session 13):** Server forces `data.connId = connection.id` on input messages so clients can't impersonate each other.

### Scoring system (fully host-authoritative, added Session 13-14)

- On every ram collision (main.js ~line 2360-2405), the host records `lastHitBy.set(victimSlotIndex, { attackerSlotIndex, wasCritical, timestamp })`.
- `wasCritical` is true when `speed >= CONFIG.scoring.criticalVelocityThreshold` (currently 11.0).
- When a cart's y-position falls below `CONFIG.fall.yThreshold` (-6), if there's a `lastHitBy` entry within the last 2500ms, points are credited to the attacker.
- **Scoring formula (main.js ~line 3030-3060):**
  - Base: 1 point (edge fall) or 2 points (center hole — within `innerRadius + 2` of origin)
  - `+1` if `wasCritical`
  - `+1` if victim was the current leader (target bonus)
- Max single-hit score: 4 points (center hole + critical + target bonus)
- Host broadcasts `roundScores` to clients via `sendHostRound()` on every scored hit (Session 15 fix, commit `4c3c045`).

---

## 3. Completed Features

### Ready-Up System & Colors (Session 16)
- **Server Gating:** `party/index.ts` tracks `isReady` status for all slots. A `#countdownTimerHandle` ensures `MSG.gameStart` is atomic and cancellable.
- **NPC Reset:** `#convertHumanSlotToNpc` explicitly resets `slot.isReady = false` to prevent departed humans from triggering ghost-starts.
- **UI:** A pulsing neon HUD button triggers `MSG.readyToggle` and changes from "CLICK TO READY" to "READY!".
- **Color Consistency:** `CART_COLORS` object established as the strict source of truth for the 5 player colors. `mesh.traverse()` applies `emissive` hexes so groups glow correctly in the 3D scene.

### Networked multiplayer (Sessions 1-13)
- 4-slot rooms via PartyKit with auto-NPC fill for empty seats
- Host-authoritative physics with client interpolation
- Host migration when original host disconnects
- URL-based room joining (`?room=ABCD`)
- Input spoofing protection
- Protocol version gating (clients with mismatched version handled by server)

### Core gameplay
- Procedural wire-grid shopping carts (cart.js) with slot-based colors.
- Rotating vinyl-record dancefloor with ring collider and center hole
- Cart physics: WASD driving, tank-style in-place rotation, drift mechanics, lateral grip
- Ram system with impulse spreading over 3 physics steps, `minSpeed 0.8`
- Ram boost (nitro): `boostedMaxSpeed: 26` when Shift held, with streak mechanics and visual streak effects
- Horn (Space key) with NPC opportunistic horn response
- Fall detection with `respawnDelayMs: 600` back to spawn position
- NPCs with opportunistic ram behavior and basic pathing

### Round structure (Sessions 12-15)
- Lobby → 3s countdown → 60s running → podium flow
- Host-only phase transitions, broadcast to clients
- Countdown "GET READY 3/2/1" text in HUD
- Running timer display `:45` style
- Live score display (4 slot boxes with current scores, local player highlighted with white border)
- Results overlay with winner announcement, final scores, match history (last 10 rounds), Play Again, Vibe Jam portal exit

### Scoring (Sessions 13-15)
- Edge fall (+1), center hole (+2), critical bonus (+1), target-the-leader bonus (+1)
- 2500ms hit attribution window
- DRAW declaration when round ends with all slots at 0 (Session 15, Bug 2)
- Last-cart-standing override: when only 1 human remains alive after 2+ started, 3s "LAST CART STANDING!" flourish then podium crowns that human (Session 15, Bug 3/3.5)
  - Gates: must be 30s+ into round AND survivor must have scored ≥1 point (Session 15)
  - Cancels if survivor falls during the 3s flourish window (Session 15)
  - Intentionally crowns the surviving human even if NPCs outscored them

### Polish
- Fog, spotlights, emissive tile grid on dancefloor
- Cart trail/streak effects during ram boost
- Low-HP timer pulse (seconds display turns red under 10s)
- Bungee + Major Mono Display webfonts for neon aesthetic
- Session 15 driving feel tune: `maxSpeed 14→17`, `accel 110→150`, `ramming.strength 6→8`, `criticalVelocityThreshold 13.5→11.0`

---

## 4. Current Blockers & Bugs

### None actively blocking. Session 16 locked in the Step 12 architecture.

### Known minor issues (not blockers)

**Match history UI is confusing.**
- Current format: `P1 won — 0, 0, 3, 1 (t=11:55:50 PM)`
- Problem: requires you to know that comma-separated numbers are P1/P2/P3/P4 scores in order. Also when the last-cart-standing override fires, "P1 won" with 0 points next to another player's higher score looks like a bug to anyone who doesn't know the rule.
- Priority: fix before jam submission. Not post-jam. Y-Dawg explicitly flagged this.

**Diagnostic one-shot logs still present.**
- Session 15 removed the per-second `[diag] slot mapping @ frame N` spam (commit `d436a01`).
- Remaining `[diagnostic] ...` logs (nitro first boost, spawn layout @ frame 30, dancefloor surface render @ frame 15, etc.) are one-shots at specific sim frames. They fire once per session and stop. Not spam, but should probably be cleaned before final jam submission for a professional console.
- Locations: main.js lines 1931, 2678, 2808, 2965, 3042 (approximate), 3345.

**Wire field naming mismatch (pre-existing, Session 13).**
- main.js `hostRound` payload uses `winnerSlotIndex` field name.
- party/index.ts `RoundState` type calls it `winnerSlotId`.
- Works because JSON doesn't care, but worth unifying.

**PROTOCOL_VERSION enforcement not verified.**
- Bumped 1→2 in Session 14 for DRAW sentinel support. Should grep party/index.ts to confirm there's actually a version-mismatch rejection path. Not a bug today because deploys are atomic.

### Deferred audit items (flagged Session 13-14, never addressed)

- **Step 14d:** interp buffer empty-state handling on non-host clients when they first join
- **Step 16:** hole radius tuning, spotlight count optimization, NPC awareness of hole position
- **Step 18:** dead config check — some CONFIG values may no longer be read anywhere

### Untested scenarios

- **Step 12 Ready-Up Sync** — Need to verify on production that two humans in the same room correctly trigger/cancel the 3s countdown via the HUD button.
- **Session 15 driving/scoring tuning feel (solo)** — Y-Dawg has not playtested solo since maxSpeed/accel bumped. Scoring feel may also need re-tuning now that base speed is higher and carts more easily crit.
- **Last-cart-standing override full happy path with 2 humans** — we verified the cancel path (both fall close together, no premature win). We inferred the arm path works. We have not explicitly seen the "LAST CART STANDING!" text appear on screen during a clean 2-human round where one falls and stays fallen 3 seconds. Need to confirm.

---

## 5. Next Steps

### Before jam submission (required)

1. **Verify Step 12 Multiplayer Sync.** Open two tabs, join the same room, and click Ready. Confirm the server `startsAtMs` properly kicks off the local client countdowns.
2. **Playtest the driving tuning solo.** Confirm maxSpeed 17, accel 150, crit threshold 11, ram strength 8 all feel right together. Adjust if not.
3. **Fix match history UI clarity.** Don't defer to post-jam. Options include: label headers "P1  P2  P3  P4" above the score row, use a table format, or show the winning slot highlighted. Y-Dawg wants this addressed "later" meaning this session or next, not post-jam.
4. **Clean remaining one-shot `[diagnostic]` logs.** Five or six sites to remove. Single commit.
5. **Verify Bug 3 happy path.** Confirm "LAST CART STANDING!" text appears during a 2-human round where one person falls off and stays fallen 3s while the other is alive and has scored ≥1 point and 30s+ have elapsed.
6. **Step 10b: menu DOM.** Referenced in Session 14 handover as "its own fresh Cursor agent session. Substantial." Has not been started. This is the lobby/join UI — currently players just drop into quickplay or use `?room=` URL. Needed for a polished first impression.
7. **Step 9 results screen polish.** The results overlay works functionally but Session 12-13 notes flag "neon glow, low-timer pulse, Bungee + Major Mono Display fonts" as polish items to verify are applied.
8. **Interp buffer tune attempt.** Session 13 flagged trying `interpBufferMs 150→100` after scaling tests. Not urgent, but worth trying late in development if network feels laggy.
9. **Step 13: Stats Tracking.** Implement `wins`, `matches`, and `total points` persistence in `localStorage` and display on menu/results screen.

### Nice-to-have (if time permits)

- Color picker UI (5 options including neonOrange, first-come-first-served) — Session 14 "Step 10"
- Supabase integration for persistent match history / leaderboard — referenced in Session 13 cut order
- 5-8 player scaling — referenced in Session 13 cut order
- Post-jam ideas (explicitly do not touch during crunch): crowd of ravers, volumetric light shafts, cart faces/sunglasses, separate spawn platform with jump-onto-arena mechanic

### Cut order if time runs short (from Session 13)

1. Skip Supabase
2. Skip additional polish
3. Skip 5-8 player scaling
4. Ship the 4-player version as-is

---

## 6. Critical Workflow Notes

### Production verification rule (Session 13)

**Never trust local grep to confirm a prod deploy.** Local grep has produced false positives twice. After pushing, verify with:

```bash
curl -sL [https://cartrave.lol/main.js](https://cartrave.lol/main.js) | Select-String "<identifier>"
