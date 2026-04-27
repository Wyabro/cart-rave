# Cart Rave — Project State

**Last updated:** End of Session 17, April 23, 2026
**Deadline:** Cursor Vibe Jam 2026, May 1, 2026 @ 13:37 UTC (~7.5 days out)
**Production:** https://www.cartrave.lol/
**Repo:** https://github.com/Wyabro/cart-rave (flat at root, `main` branch)
**Latest deployed commit:** `fix(ready): checkAllReady ignores human slots with dead connections`

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
* **Single-File Editing:** `main.js` is ~4,087 lines. When providing code fixes, provide ONLY the specific function or block being changed. Do not output the full file.
* **No Build Step:** Do not add package.json dependencies. All Three.js and Rapier3D imports must remain as CDN esm.sh URLs.

### File structure (flat at root)

Same as Session 16. Key files:
- `index.html` (257 lines) — static shell, import map, Vibe Jam widget
- `main.js` (~4,087 lines) — all client logic
- `cart.js` — procedural cart builder (imported by main.js)
- `party/index.ts` (~635 lines) — PartyKit server (Durable Object)
- `package.json` — dev deps + `npm run ship` script
- `.cursorrules` — design spec and AI guardrails

---

## 3. OPEN BUG: Ready-Up After Hard Refresh (BLOCKING)

### Symptom
Solo mode: play a round → hard refresh browser → re-enter Solo → pick color → click Ready → game does NOT start. Clicking again toggles back to "CLICK TO READY". Persists across attempts.

### Root Cause
PartyKit's `room.getConnections()` returns the stale (pre-refresh) connection as "live" for an unpredictable duration. All ready-up checks filter by this API, so the orphan human slot (old connId, `isReady: false`) blocks `#checkAllReady()` even though we added connection-aware filtering. The old connection is genuinely still in `getConnections()` during the race window.

### Attempted Fixes (all deployed, none sufficient)
1. Clear `#countdownTimerHandle` in `playAgain` handler
2. Reset phase from podium to lobby in `onConnect`
3. Orphan reconciliation in `readyToggle` (check `getConnections()`)
4. Call `#checkAllReady()` in `onClose`
5. Filter `#checkAllReady` to only count human slots with live connections

### Recommended Fix
**Stop relying on `room.getConnections()`.** In `onConnect`, before `#assignHumanToSlot(conn.id)`, check if any existing human slot has a `connId` that is different from `conn.id`. If found, take over that slot directly (overwrite `connId`, reset `isReady`, skip `#assignHumanToSlot`). This prevents two human slots from existing simultaneously. See Session 17 handover for implementation details.

---

## 4. Step Status

| Step | Status |
|------|--------|
| 1–10 | ✅ Shipped |
| 11 (color picker) | ✅ Fixed Session 17: NPC colors no longer block human picks; NPC displacement on pick works |
| 12 (ready-up, URL flows) | ⚠️ Play Again works. URL flows work. **Hard refresh race bug is OPEN** (see §3) |
| 13 (stats) | ✅ Shipped Session 17: localStorage stats, menu display, results display, Main Menu button |
| 14 (lag mitigation) | Not started |
| 15 (spawn platform) | Not started |
| 16 (physics/visual tuning) | Not started |
| 17 (eye candy) | Not started |
| 18 (pre-submission cleanup) | Not started |

---

## 5. Known Issues & Audit Items

### Blocking
- **Ready-up hard refresh race** (§3 above)

### Non-Blocking
- **NPC hole avoidance** — `pickAiTarget()` has edge bias but no center-hole exclusion zone. NPCs drive into the hole regularly. (Step 16)
- **`physicsSpinRadPerSec`** — dead config value at line 156 of main.js, never referenced. (Step 18 removal)
- **`roundAutoStarted`** — dead variable at line ~443, never read. (Step 18 removal)
- **`interpBufferMs`** — still 150ms, spec says reduce to 100ms. (Step 14)
- **Solo room codes** — use `solo-XXXXXX` with hyphen; spec says alphanumeric only, no hyphens. Cosmetic.
- **Esc overlay** — Step 12a spec (controls, volume, mute, resume, Quit to Menu) was never built.
- **Diagnostic logs** — 32 `console.log` calls including `[diagnostic]` blocks. (Step 18 removal)

---

## 6. Execution Order (Updated)

Current priority: fix the ready-up refresh race (§3), then continue with Steps 14+.

1. ✅ Steps 1–13 (shipped)
2. **FIX: Ready-up refresh race** (blocking — see §3)
3. Step 14: Lag mitigation (interpBufferMs, local hop SFX, camera lerp)
4. Step 15: Spawn platform with ramp
5. Step 16: Physics/visual tuning (hole radius, spotlight count, NPC hole awareness)
6. Step 17: Eye candy (lighting, equalizer pulses, fog, DJ booth)
7. Step 18: Pre-submission cleanup (remove logs, dead code, final QA)
8. Step 19: STRETCH — Supabase leaderboard
9. Step 20: Ship

Cut points in order: Supabase (19), eye candy depth (17), spawn platform (15). Everything through 14 + 16 + 18 is core.

---

## 7. Session 17 Commit Log

1. `fix(protocol): route Play Again through server ready-up gate + fix ship script`
2. `fix(color-pick): let humans pick NPC-held colors + displace NPC to unused color`
3. `fix(results): use actual slot color for winner title instead of palette index`
4. `feat(stats): personal stats tracking + display on menu and results screen` — `b612b1b`
5. `fix(play-again): clear countdown timer handle before re-checking ready state` — `3f8bc8b`
6. `fix(phase): reset server phase from podium to lobby on new human connect` — `0d30b0d`
7. `fix(ready): reconcile orphan human slots on readyToggle to prevent stale blocks` — `d07d1aa`
8. `fix(ready): re-evaluate ready state after connection close cleans up orphan slot` — `d54ceff`
9. `fix(ready): checkAllReady ignores human slots with dead connections`
