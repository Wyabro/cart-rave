# Cart Rave

**Cart Rave** is a neon-soaked **4‑player shopping-cart brawler**: slam, boost-ram, and hop your way around a club dancefloor ring — and try not to get yeeted through the **center hole**. Matches are **60 seconds** of physics chaos, and the cart with the **most points** takes the podium.

**Pitch:** *Physics sumo… with shopping carts… on a spinning record.*

## Tech stack

- **Three.js**: rendering, camera, post-processing, UI/world visuals
- **Rapier3D**: real-time physics (host-authoritative simulation)
- **PartyKit**: multiplayer rooms + WebSocket relay + lightweight server state

Client-side dependencies are loaded via an **import map** (no bundler for the game client).

## Run locally (step-by-step)

### Prerequisites

- **Node.js + npm** (to run PartyKit locally)
- **Python** (optional, for a simple static file server)

### 1) Install dependencies

From the repo root:

```bash
npm install
```

### 2) Start the PartyKit server (multiplayer backend)

Run PartyKit on the port the client expects:

```bash
npx partykit dev -p 1999
```

### 3) Serve the static site (the actual game client)

In a second terminal, from the same repo root (where `index.html` lives):

```bash
python -m http.server 8085
```

If you don’t have Python installed, you can use:

```bash
npx http-server -p 8085
```

Now open:

- `http://localhost:8085/`

### Notes

- **Do not** open via `file://` — ES modules + audio loading require HTTP.
- If you’re testing on a LAN hostname (e.g. `192.168.x.x`), the client targets local PartyKit at **`127.0.0.1:1999`**.

## Player controls

- **WASD / Arrow keys**: drive
- **Shift**: boost / ram boost
- **Space**: hop
- **M**: mute audio
- **Esc**: in-game overlay (settings + quit to menu; simulation continues)

## Gameplay basics

- **Modes**: Solo (private room + NPCs), Quickplay (public room), Friends (share a `?room=` link)
- **Scoring**: knock carts off the **edge** or into the **center hole** for points (bonuses stack for big plays)
- **Multiplayer model**: one player becomes **host** and runs the authoritative physics; everyone else sends input and interpolates snapshots

## Useful scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Starts PartyKit locally (`npx partykit dev`) |
| `npm run ship` | Push + deploy PartyKit (`git push && npx partykit deploy`) |

