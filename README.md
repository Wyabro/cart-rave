# Cart Rave

**Cart Rave** is a browser-based **4-player physics sumo** game built for **Cursor Vibe Jam 2026**. You drive neon shopping carts on a slowly rotating club dancefloor ring with a center hole. **Rounds last 60 seconds** (host timer); the **highest score** wins. A round can end early only in the rare **last-cart-standing** case. Ties use the most recent scoring hit as tiebreaker.

**Pitch:** *Sumo on a dangerous spinning platform — with shopping carts.*

**Stack:** Three.js (rendering), Rapier3D (physics, host client only), PartyKit (WebSocket relay), Vercel (static hosting), esm.sh / unpkg import map — **no bundler, no build step** for the game client.

## Play

- **Production:** [https://www.cartrave.lol/](https://www.cartrave.lol/) (apex [cartrave.lol](https://cartrave.lol/) also works)
- **Room URLs:** `https://www.cartrave.lol/?room=ABCD` — joins PartyKit room `ABCD` (alphanumeric, 2–16 chars). Invalid or missing `?room=` falls back to **`quickplay`**.
- **Vibe Jam:** widget script is in `index.html`; results screen and in-world portal link to [Vibe Jam 2026 portal](https://vibej.am/portal/2026) (with `?ref=` preserved where applicable).

## Project highlights

- **Modes:** **Solo** (private room + NPCs), **Quickplay** (public), **Friends** (shareable `?room=` link).
- **Menu:** username (localStorage), personal stats, music volume/mute, neon UI; full **desktop** gameplay uses keyboard.
- **Mobile:** narrow touch devices get the **menu** (including audio controls) and a **keyboard/mouse required** toast — **3D gameplay is not started** without desktop-style input.
- **Multiplayer:** host-authoritative physics (~20 Hz snapshots), 60 Hz client input, **4 slots** always filled with humans + **NPC** comedy names.
- **Flow:** server-gated **color picker** (5 colors), **ready-up**, countdown, **60 s** round, podium **results** (names, scores, match history, Play Again, quit to menu).
- **In-game:** HUD (timer, scores, kill feed, **dual music + SFX** sliders), **Esc** overlay (controls, volume, resume, quit — game keeps running).
- **World:** procedural carts, club/stage/crowd visuals, skybox, leader **white pulsing emissive**, procedural + sample **SFX**, lazy-loaded **game music** tracks + menu loop.

Deeper architecture, jam cuts, and conventions live in **`.cursorrules`**. Session planning and known issues: **`todo.md`** and handover notes under **`docs/`**.

## Run locally

Open via a **local HTTP server** (ES modules + audio need HTTP, not `file://`):

```bash
python -m http.server 8085
```

Then open `http://localhost:8085/` (any free port is fine; **5173** is often taken on Windows).

Alternatively:

```bash
npx http-server -p 8085
```

Install **npm** deps once if you use PartyKit CLI:

```bash
npm install
```

## npm scripts

| Script        | Purpose |
|---------------|---------|
| `npm run dev` | `npx partykit dev` — local PartyKit party server |
| `npm run ship` | `git push` then `npx partykit deploy` — keep static site (e.g. Vercel) and edge party in sync |

After changing **`party/index.ts`**, run **`npm run ship`** (or at least `npx partykit deploy`) so production clients talk to the updated server.

## Controls

- **WASD / Arrow keys** — drive  
- **Shift** — nitro / ram boost  
- **Space** — hop  
- **M** or HUD speaker — mute  
- **Esc** — in-game overlay (settings + quit to menu; does not pause simulation)

## Arena (dancefloor ring)

The arena is a **ring** (outer radius + inner hole), not a solid disc:

- **Visual:** emissive floor, fog, crowd/stage/club dressing, **visual-only** slow rotation.  
- **Physics:** Rapier **ring** collider so carts can fall through the **center hole**.  
- **Jam cut:** floor rotation does **not** apply physics drag/spin to carts.

Tuning lives under `CONFIG.record`, `CONFIG.cart`, `CONFIG.driving`, etc. in `main.js`.

## Carts & tuning

- Procedural cart meshes + Rapier bodies; **caster wheels** yaw toward velocity (damped) so drifts read correctly.  
- Colors come from the shared **`CART_COLORS`** map (do not fork ad-hoc palette literals for cart materials).

## Multiplayer (PartyKit)

Server logic: **`party/index.ts`**. Party name: **`main`** (see `partykit.json`). Production host (current deploy): **`cart-rave.wyabro.partykit.dev`** — wired from `PARTYKIT_PUBLIC_HOST` in `main.js` (no `https://` in the constant).

### Model: host-authoritative

- One connected human is the **host** and runs **all** Rapier physics (humans + NPCs).  
- Host broadcasts **transform snapshots ~20 Hz** (`host_transform`).  
- Non-host clients send **input ~60 Hz** and interpolate remote carts (`interpBufferMs`).  
- **NPCs** fill empty slots; AI runs **only on the host** during `running` phase.

### Slot mapping, keepalive, reaper

- Server broadcasts **`slots`** on assignment changes.  
- **`keepalive`** from clients every **5 s**; server **reaps** silent connections after **20 s** (`#lastSeenAtMs`). Reaped humans become NPCs; host loss triggers **`host_migrated`**.  
- **`room.getConnections()`** returns an **Iterator** — spread or `for…of` before Array methods (see `.cursorrules`).

### Host migration

New host is oldest surviving connection; server resets `#lastSeq = -1` and broadcasts **`host_migrated`**. Clients apply last cached cart poses before taking authority to reduce pops.

### Rounds and results

Phases: **`lobby` → `countdown` → `running` → `podium`**. Physics + `host_transform` run only in **`running`**. Podium shows **final scores**, **Play Again** (host), main menu, stats, session history (in-memory, capped), and **Vibe Jam** portal URL.

### PartyKit dev + static site

1. **PartyKit** (fix port for the client):

   ```bash
   npx partykit dev -p 1999
   ```

2. **Static files** (same repo root as `index.html`):

   ```bash
   python -m http.server 8085
   ```

On **LAN** hostnames, the client targets **local PartyKit** at `127.0.0.1:1999` (see `main.js`).

**Production party** — deploy separately from Vercel static:

```bash
npx partykit deploy
```

For a **fork**, set `PARTYKIT_PUBLIC_HOST` in `main.js` to your PartyKit hostname (no scheme). If empty on a non-localhost page, the client may fall back to `{pageHostname}:1999` (only useful with a local WS proxy).

## Sounds (`sounds/`)

- **`menu.mp3`** — menu / crossfade source  
- **Game tracks** — `music.mp3` plus additional **MP3** tracks, **lazy-loaded** after first paint; order may shuffle per session  
- **Samples** — e.g. cart crash **wav**; many effects use **Web Audio** (procedural) for impacts, boost, crowd, etc.

## Jam compliance

- **Vibe Jam 2026** widget: `https://vibej.am/2026/widget.js` (async in `index.html`).  
- **Entry** deadline context and scope cuts: see **`.cursorrules`**.
