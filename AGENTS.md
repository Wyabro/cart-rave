# AGENTS.md — Cart Clash

**This is the canonical rules file for this repository.** Cursor and Google Antigravity
read it natively; Claude Code reads it when pointed here. `.cursorrules`, `CLAUDE.md`, and
`GEMINI.md` should defer to this document for invariants. If any other doc disagrees
with this file about how the stack works, **this file and the code win** — go verify against
the tree, then fix the other doc.

**Product name is Cart Clash.** Deploy host, Worker name, and some code IDs still say
`cart-rave` until domain cutover — see [docs/brand.md](docs/brand.md). All wording —
player copy, announcer lines, docs — follows [docs/style-guide.md](docs/style-guide.md).

**Session rehydration (read first when cold):** [docs/STATUS.md](docs/STATUS.md) — current
focus, next actions, gotchas. Then this file for standing rules. Architecture snapshot:
[docs/planning/project-state.md](docs/planning/project-state.md). Deep reference:
[docs/reference/Game_Architecture.md](docs/reference/Game_Architecture.md).

**Before any cross-module change, read
[docs/reference/control-flow.md](docs/reference/control-flow.md).** Most high-traffic edges in this
codebase are *not* imports — they run through injected `callbacks`/`deps` objects, the string-keyed
`MSG.*` wire protocol, and zustand subscriptions. Grep alone will tell you a live function is
dead, and `main.js` is a single 4,500-line closure holding ~84 unexported inner functions. That
file is the map.

Cart Clash is a browser-based **4-player shopping-cart physics sumo** game. Neon shopping
carts battle on arena floors; ram opponents off the edge or into voids to score.
Rounds run **150 seconds**; highest score wins (Sudden Death on ties). Production:
<https://cart-rave.wyabro.workers.dev/>. Active development on the **`cart-clash`** branch
toward Version 2.

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
- **Rendering:** **Three.js** (arenas + Draco cart GLBs under `public/models/`).
- **Physics:** **Rapier3D** — runs **client-side on the host only**, host-authoritative.
- **Build / dev:** **Vite**.
- **State:** Zustand stores (`src/stores/`). Audio: Howler.js. Touch: nipplejs. Debug UI: Tweakpane.

### Commands

- **Deploy:** `npm run ship` = `vite build && npx wrangler deploy`.
- **Dev (client only):** `npm run dev` (Vite).
- **Dev (server only):** `npm run dev:party` (`npx wrangler dev`, local Durable Object).
- **Dev (both, preferred):** `npm run dev:local` (aliases: `dev:cart-clash`, `dev:next-level`).
- **Gates:** `npm run qa` (alias of `check` = typecheck + test + knip). Also
  `npm test`, `npm run typecheck`, `npm run build` (Vite → `dist/`). CI runs `npm run qa`
  on push/PR to `cart-clash` / `main` (`.github/workflows/check.yml`).
- **Visual QA:** `npm run shoot`, `npm run compare`, `npm run blackframes`,
  `npm run qa:visual` (short black-frame battery) — see
  [docs/guides/visual-qa.md](docs/guides/visual-qa.md). URL flags: `?ablate=`, `?postmin=`,
  `?shot=`, `?cam=`, `?freeze=`, `?harness=1`, `?hud=0`.
- **Headless regression sweep:** `npm run battery` — every diagnostic rig (gameplay +
  netcode scenarios) against one dev stack, one tally, JSON report in `.diag-captures/`.
  Individual rigs: `npm run gameharness` / `npm run netharness` / `npm run perf:profile`.
  Toolkit map + extension contract: [docs/guides/dev-toolkit.md](docs/guides/dev-toolkit.md).
- **Project health dashboard:** `npm run dashboard` — generates `.diag-captures/dashboard.html`
  (+ `health.json`) from git + battery reports + capture bundles + STATUS/BACKLOG. Read-only,
  never hand-edited; leads with "what should I work on next?". Bug capture (F8 / auto on
  error+assert) + production analytics (`/api/analytics`) live in the same layer:
  [docs/guides/observability.md](docs/guides/observability.md).

---

## ARCHITECTURE INVARIANTS

- **Host-authoritative.** The first client in a room becomes host and runs **all** Rapier
  physics (humans + NPCs). The host is the single source of truth.
- **The server never simulates physics.** `party/index.ts` (a `partyserver` Durable Object)
  does validation (`party/roundValidation.ts`), slot management, ready-up/round lifecycle,
  **WebRTC signaling** (SDP/ICE relay + Cloudflare Calls TURN minting), host selection
  (`party/hostSelection.ts`), **ghost exorcism**, and connection reaping. Kill-feed events
  do **not** relay through the server — falls/collisions ride the host snapshot's JSON tail
  on the DataChannel (the old `hostEventFall`/`hostEventCollision` relays were deleted
  2026-07-06). Do not move collision logic server-side.
- **Real-time telemetry is peer-to-peer, not server-relayed.** Host transforms (40Hz,
  `CONFIG.net.hostSendHz`), client input (sent per 60Hz fixed-step sample — no Hz knob), and spill
  events travel over WebRTC DataChannels (`src/netcode/p2p.js`): `P2P.sendToAll` from the
  host, `P2P.sendToPeer(hostId, …)` from clients. Do **not** route these back through the
  WebSocket. The WebSocket carries only lobby, signaling, and round-lifecycle messages;
  kill-feed falls/collisions ride the P2P snapshot tail.
- **Color logic uses `CART_COLORS` in `src/config.js`.** Do not modify that object or the
  `mesh.traverse()` material logic — it is the "Original Rave" source of truth
  (pink / blue / green / yellow / neonOrange).
- **Rounds start only via `MSG.gameStart`.** No tick-level auto-starts in `update()`.
- **Win condition:** 150 seconds (timer) or Sudden Death / last-standing paths. Round length
  is **single-sourced** as `ROUND_DURATION_MS` in `shared/roundConstants.js` (`150_000`);
  both `src/config.js` (`CONFIG.round.durationMs`) and `party/roundValidation.ts` import it —
  do not re-introduce a hardcoded duplicate. **Last-cart-standing (3s flourish) is effectively
  SD-only today:** timed-round respawn is 1s, so the flourish aborts when victims return.
  Ties resolve by most-recent scoring hit / Sudden Death.
- **No camera lerp/slerp smoothing.** It was intentionally removed. Do not reintroduce it.
- **`index.html` is canonical for menu markup.** `cart-rave-menu.html` was deleted (stale
  duplicate); do not recreate it. `src/cart-rave-menu.js` has its own color/name state that
  game wiring overrides via localStorage + event listeners in `initMenu()`.
- **Null-guard all cart access.** slots can momentarily hold no cart during join/leave/host
  migration; every cart access must guard against null.
- **Host migration:** on host disconnect the server promotes the oldest surviving connection;
  the new host receives the last cached snapshot and resumes NPC control. `#lastSeq` resets to
  `-1` server-side; the receiving client clears its state buffer and tears down + re-inits P2P.
- **Naming freeze:** do not rename Worker/host/`cartRave*` storage keys without a deliberate
  cutover plan ([docs/brand.md](docs/brand.md)).

---

## STANDING BEHAVIORAL RULES

- **Verify before you speak.** Grep the tree, read the file, run the gate. If you have not
  confirmed something, say so — do not guess with confident structure.
- **Never say "done" or "verified" without git-pulling `cart-clash` and confirming the change
  is actually in HEAD.** The remote is authoritative; a local grep is not. Post-deploy, fetch
  the deployed asset and `Select-String` for the new code — local grep alone has produced
  false positives.
- **Report gate results by number.** Prefer `npm run qa` before claiming done. Also run
  `npm run build` when the change touches the client bundle. State the actual numbers you
  saw (test count drifts; do not hardcode stale totals).
- **No unpushed claims.** If you changed something locally, call it **"unpushed"** until it
  lands on `origin/cart-clash`.
- **Own mistakes plainly.** No apology loops, no hedging filler, no "great catch" replies to
  corrections. State what was wrong and move on.
- **When a claim disagrees with the code, the code wins.** Fix the claim; do not rewrite the
  code to match a stale claim.
- **Behavior-changing changes require a human playtest on production after deploy.**
- **PowerShell environment:** `Select-String`, not `grep`; single-line commit messages
  (`-m "…"`). `room.getConnections()` returns an **iterator** — use spread or `for…of`,
  never `.map().join()`.
- **Diff before apply.** Prefer targeted, isolated diffs; wait for ack, then apply.
- **Update `docs/STATUS.md`** after meaningful steps (focus / next / gotchas / decisions).
- **Visual bugs:** use ablation + shoot/blackframes before large postFX rewrites
  ([docs/guides/visual-qa.md](docs/guides/visual-qa.md)).

---

## MODEL / TOOL ROUTING

How Wyatt routes work across agents:

- **Claude Code** — verification, cross-file reasoning, hard debugging, docs.
- **Cursor (Fable)** — cross-file refactors.
- **DeepSeek** — mechanical known-file / known-line edits, diagnostics.
- **Antigravity** — exploratory agentic tasks.
- **Grok / other** — same standing rules; rehydrate via `docs/STATUS.md` + this file.

Any prompt written **for** an agent goes in its own fenced code block. Confirm options with
Wyatt before writing long prompts. For new gameplay systems, player-facing features, or
ambiguous "done" tasks, ask **"what should the player see / feel / do when this works?"**
before starting.

---

## WHAT'S OFF-LIMITS

- **`docs/archive/handovers/` and `docs/archive/audits/` are historical archives — do not edit.**
- **`CLAUDE.md` / `GEMINI.md` are pointer files.** Real rules live here in `AGENTS.md`.
  Keep the pointers thin. `.cursorrules` may carry brand/stack extras — keep them consistent
  with this file.
- **Do not recreate deleted files** — notably `cart-rave-menu.html` (see the menu-markup
  invariant) and the legacy `partykit.*.json` files.
- **Do not port open-world WebGPU engines** into this game. Visual QA *process* tools are fine;
  LAAS-style terrain/vegetation stacks are not.
