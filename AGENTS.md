# AGENTS.md — Cart Rave

**This is the canonical rules file for this repository.** Cursor and Google Antigravity
read it natively; Claude Code reads it when pointed here. `.cursorrules`, `CLAUDE.md`, and
`GEMINI.md` are thin pointer files that defer to this document. If any other doc disagrees
with this file about how the stack works, **this file and the code win** — go verify against
the tree, then fix the other doc.

Cart Rave is a browser-based **4-player shopping-cart physics sumo** game. Neon shopping
carts battle on club dancefloors; ram opponents off the edge or into the voids to score.
Rounds run **150 seconds**; highest score wins (Sudden Death on ties). Production:
<https://cart-rave.wyabro.workers.dev/>. Active development on the `next-level` branch toward
Version 2 (rebrand target: "Cart Clash").

Deep architecture reference: [docs/architecture.md](docs/architecture.md).

---

## STACK (verified facts only)

- **Hosting / backend:** Cloudflare Workers + Durable Objects, deployed via **`wrangler`**
  (`wrangler.jsonc`; DO class `CartRaveServer`, SQLite migration `v1`, static client served
  from the `dist/` `ASSETS` binding). There is **no** separate static host — the Worker
  serves the client and hosts the room. It is **not** the PartyKit hosted platform.
- **Room / connection server:** the **`partyserver`** npm library (`party/index.ts`) for
  room + WebSocket lifecycle, slot management, and lobby/round state. Client uses
  **`partysocket`** (`src/netcode.js`) for the control-plane WebSocket.
- **Realtime game transport:** **WebRTC DataChannels, peer-to-peer** (`src/netcode/p2p.js`).
  Host transforms, client input, and grocery-spill events bypass the server entirely (see
  Architecture Invariants). Cloudflare Calls mints TURN credentials via the server.
- **Rendering:** **Three.js** (procedural geometry; no third-party 3D models).
- **Physics:** **Rapier3D** — runs **client-side on the host only**, host-authoritative.
- **Build / dev:** **Vite**.
- **State:** Zustand stores (`src/stores/`). Audio: Howler.js. Touch: nipplejs. Debug UI: Tweakpane.

### Commands

- **Deploy:** `npm run ship` = `vite build && npx wrangler deploy`.
- **Dev (client only):** `npm run dev` (Vite, port 3000).
- **Dev (server only):** `npm run dev:party` (`npx wrangler dev`, local Durable Object on port 1999).
- **Dev (both, recommended on `next-level`):** `npm run dev:next-level` (client + local Wrangler worker).
- **Gates:** `npm test` / `npx vitest run` (21/21), `npm run typecheck` (`tsc --noEmit`, 0 errors),
  `npm run build` (Vite → `dist/`). `npm run knip` for dead-export analysis.

---

## ARCHITECTURE INVARIANTS

- **Host-authoritative.** The first client in a room becomes host and runs **all** Rapier
  physics (humans + NPCs). The host is the single source of truth.
- **The server never simulates physics.** `party/index.ts` (a `partyserver` Durable Object)
  does validation, slot management, ready-up/round lifecycle, **WebRTC signaling**
  (SDP/ICE relay + Cloudflare Calls TURN minting), kill-feed relay
  (`hostEventFall` / `hostEventCollision`), **ghost exorcism**, and connection reaping.
  Do not move collision logic server-side.
- **Real-time telemetry is peer-to-peer, not server-relayed.** Host transforms (40Hz,
  `CONFIG.net.hostSendHz`), client input (60Hz, `CONFIG.net.clientInputHz`), and spill
  events travel over WebRTC DataChannels (`src/netcode/p2p.js`): `P2P.sendToAll` from the
  host, `P2P.sendToPeer(hostId, …)` from clients. Do **not** route these back through the
  WebSocket. The WebSocket carries only lobby, signaling, round, and kill-feed messages.
- **Color logic uses `CART_COLORS` in `src/config.js`.** Do not modify that object or the
  `mesh.traverse()` material logic — it is the "Original Rave" source of truth
  (pink / blue / green / yellow / neonOrange).
- **Rounds start only via `MSG.gameStart`.** No tick-level auto-starts in `update()`.
- **Win condition:** 150 seconds (`CONFIG.round.durationMs` **must** equal `ROUND_DURATION_MS`
  in `party/index.ts` — both are `150000`), or last-cart-standing after a 3-second flourish.
  Ties resolve by most-recent scoring hit / Sudden Death.
- **No camera lerp/slerp smoothing.** It was intentionally removed. Do not reintroduce it.
- **`index.html` is canonical for menu markup.** `cart-rave-menu.html` was deleted (stale
  duplicate); do not recreate it. `src/cart-rave-menu.js` has its own color/name state that
  game wiring overrides via localStorage + event listeners in `initMenu()`.
- **Null-guard all cart access.** Slots can momentarily hold no cart during join/leave/host
  migration; every cart access must guard against null.
- **Host migration:** on host disconnect the server promotes the oldest surviving connection;
  the new host receives the last cached snapshot and resumes NPC control. `#lastSeq` resets to
  `-1` server-side; the receiving client clears its state buffer and tears down + re-inits P2P.

---

## STANDING BEHAVIORAL RULES

- **Verify before you speak.** Grep the tree, read the file, run the gate. If you have not
  confirmed something, say so — do not guess with confident structure.
- **Never say "done" or "verified" without git-pulling `next-level` and confirming the change
  is actually in HEAD.** The remote is authoritative; a local grep is not. Post-deploy, fetch
  the deployed asset and `Select-String` for the new code — local grep alone has produced
  false positives.
- **Report gate results by number.** `npx vitest run` must stay **21/21**, `npm run typecheck`
  must return **0 errors**, `npm run build` must succeed. State the actual numbers you saw.
- **No unpushed claims.** If you changed something locally, call it **"unpushed"** until it
  lands on `origin/next-level`.
- **Own mistakes plainly.** No apology loops, no hedging filler, no "great catch" replies to
  corrections. State what was wrong and move on.
- **When a claim disagrees with the code, the code wins.** Fix the claim; do not rewrite the
  code to match a stale claim.
- **Behavior-changing changes require a human playtest on production after deploy.**
- **PowerShell environment:** `Select-String`, not `grep`; single-line commit messages
  (`-m "…"`). `room.getConnections()` returns an **iterator** — use spread or `for…of`,
  never `.map().join()`.
- **Diff before apply.** Prefer targeted, isolated diffs; wait for ack, then apply.

---

## MODEL / TOOL ROUTING

How Wyatt routes work across agents:

- **Claude Code** — verification, cross-file reasoning, hard debugging, docs.
- **Cursor (Fable)** — cross-file refactors.
- **DeepSeek** — mechanical known-file / known-line edits, diagnostics.
- **Antigravity** — exploratory agentic tasks.

Any prompt written **for** an agent goes in its own fenced code block. Confirm options with
Wyatt before writing long prompts. For new gameplay systems, player-facing features, or
ambiguous "done" tasks, ask **"what should the player see / feel / do when this works?"**
before starting.

---

## WHAT'S OFF-LIMITS

- **`docs/handovers/` and `docs/audits/` are historical archives — do not edit.**
- **`.cursorrules`, `CLAUDE.md`, `GEMINI.md` are pointer files.** Real rules live here in
  `AGENTS.md`. Keep the pointers thin.
- **Do not recreate deleted files** — notably `cart-rave-menu.html` (see the menu-markup
  invariant) and the legacy `partykit.*.json` files.
