# Cart Rave

Cart Rave is a browser-based **4-player** physics sumo game for **Cursor Vibe Jam 2026**.
You drive neon shopping carts on a slowly rotating club dancefloor ring with a hole in the center.
Last cart standing wins.

**Stack:** Three.js (rendering), Rapier3D (physics), PartyKit (multiplayer), Vercel (static hosting).

## Play

- **Production:** `https://www.cartrave.lol/`
- **Room URLs:** `https://www.cartrave.lol/?room=ABCD`
  - `?room=ABCD` joins PartyKit room `"ABCD"` (alphanumeric only, 2–16 chars).
  - Missing/invalid `?room=` falls back to `"quickplay"`.

## Run locally

Open via a local server (ES modules + audio need HTTP, not `file://`):

```bash
python -m http.server 8085
```

Then open `http://localhost:8085/` (or any free port; **5173** is often reserved on Windows).

Alternatively:

```bash
npx http-server -p 8085
```

For PartyKit (below), install dependencies once:

```bash
npm install
```

## Controls

- **WASD / Arrow keys**: drive
- **Shift**: nitro / ram boost
- **Space**: horn
- **M** or the on-screen speaker button: mute toggle

## Arena (dancefloor ring)

The arena is a **ring** (outer radius + inner hole), not a solid disc:

- **Visual**: emissive neon tile grid + fog + club props.
- **Physics**: Rapier ring collider so carts can fall through the **center hole**.
- **Jam cut**: floor rotation is **visual-only** (no physics drag).

Tuning lives under `CONFIG.record` in `main.js`.

## Carts & tuning

- Procedural cart visuals + physics live in `main.js` under `CONFIG.cart`, `CONFIG.driving`, `CONFIG.ramming`, `CONFIG.fall`, etc.
- Caster wheels yaw toward velocity (damped) so drifts read correctly.

## Multiplayer (PartyKit)

Server logic lives in `party/index.ts`. The party name is `main`.

**Model: host-authoritative.**
- One connected human is the **host** and runs physics.
- The host broadcasts `host_transform` snapshots (~20 Hz).
- Non-host clients send `client_input` and render interpolated snapshots.
- Rooms are always **4 slots**; unused slots are **NPCs**.

### Slot mapping and connection liveness

- The server broadcasts `slots` whenever slot assignments change (connect/disconnect/join metadata).
- The client listens for `slots` and updates `netSlots` live (not just at `hello`).
- The server reconciles orphaned `"human"` slots on `onConnect` using `room.getConnections()` and prunes zombie entries from its internal `#connections` map.
- **Activity-based reaper**: PartyKit's `onClose` is not guaranteed to fire (tab crash, network drop, phone sleep, phantom sockets the runtime hasn't GC'd), so the server tracks `#lastSeenAtMs` per connection and forcibly removes any that hasn't sent a message in **20 seconds**. Reaped slots revert to NPC; if the reaped conn was host, `#ensureLiveHost()` promotes the oldest surviving connection and broadcasts `host_migrated`.
- **Client keepalive**: the client sends a `keepalive` ping every **5 seconds** regardless of round phase or role. This keeps legitimate players alive during lobby / countdown / podium when the host's `host_transform` loop is paused. The 20s / 5s ratio gives 4× safety margin against dropped packets.

### Host migration

On clean host disconnect (`onClose`) or reaper-driven removal, the server picks the oldest surviving connection as the new host, resets `#lastSeq = -1`, and broadcasts `host_migrated`. Clients receiving `host_migrated` apply the last cached cart snapshot before assuming authority, avoiding visual pops when the baton passes.

### Respawn rules (host)

- Fall detection / respawn checks apply to **all slots** (humans and NPCs) when `y < CONFIG.fall.yThreshold`.
- NPC-only behaviors (e.g. opportunistic ram boost AI) still run only for `slot.kind === "npc"`.

### Rounds and results

- Rounds progress through phases: `lobby` → `countdown` → `running` → `podium`. Host drives transitions via `host_round`; server relays.
- Host physics (substep loop, fall/respawn, NPC AI) and `host_transform` broadcast are gated on `roundPhase === "running"` — the world is frozen during countdown and podium.
- The podium overlay shows final scores, a **Play Again** button (host-only; triggers `rematchResetWorld` and a fresh countdown), and a link to the [Vibe Jam 2026 portal](https://vibej.am/portal/2026).
- In-memory match history (capped at 10) is retained client-side for the session.

### PartyKit dev server (local)

The static game and the PartyKit server run as two local processes:

1. **PartyKit dev server** (WebSocket party). Pin the port so the client can find it:

   ```bash
   npx partykit dev -p 1999
   ```

2. **Static site** (serves `index.html` + `main.js`; `partysocket` loads from the import map CDN):

   ```bash
   python -m http.server 8085
   ```

Open the static URL from:

- **Local dev**: `http://localhost:8085/` (or `http://127.0.0.1:8085/`)
- **LAN testing (phone / other PC)**: serve on all interfaces and open via your LAN IP

```bash
serve . -l tcp://0.0.0.0:8085
```

When the page hostname is **LAN** (`192.168.*`, `10.*`, `172.16–31.*`), the client routes PartySocket to **local PartyKit dev** (`127.0.0.1:1999`) instead of trying `{lan-ip}:1999`.

**Production party:** deploy the server separately to PartyKit (not the static host):

```bash
npx partykit deploy
```

After deploy, set **`PARTYKIT_PUBLIC_HOST`** to your PartyKit host (for example `cart-rave.wyabro.partykit.dev`, **no** `https://` prefix) so a production static site can reach the party. If `PARTYKIT_PUBLIC_HOST` is empty, non-localhost pages default to **`{pageHostname}:1999`**, which is only useful when you intentionally proxy WebSockets to that port.

## Jam notes

Project decisions and constraints live in `.cursorrules`.

## Sounds

Optional files in **`sounds/`**:

- **`music.mp3`** — background music (first click or key starts playback)
- **`horn.wav`** / **`horn.mp3`** — horn clip (synth honk if missing)
