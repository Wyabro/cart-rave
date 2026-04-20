# Cart Rave (prototype)

Browser prototype: **Three.js** rendering, **Rapier3D** physics, optional **PartyKit** multiplayer (**host-authoritative** sim: one client runs physics and streams transforms; others interpolate). Carts are **fully procedural** (no GLTF or external models): wire basket, open chassis, chunky casters, and emissive neon materials live in **`cart.js`**. Caster **yaw** follows planar velocity (damped, with a little wobble at speed); **wheel roll** is derived from speed and `WHEEL_RADIUS`. Rapier uses a **single cuboid** per cart for collisions—visuals are a separate layer synced to each body every frame.

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

For PartyKit (below), install dev dependencies once:

```bash
npm install
```

## Arena (dancefloor)

The floor is a **ring** (outer radius + inner hole), not a solid disc:

- **Visual:** `ExtrudeGeometry` from a circular shape with a hole (beveled top/bottom for a smoother inner lip). **Neon torus rims** on outer and inner edges. On top of the disc, a **45rpm-style** surface treatment: **hairline concentric grooves** (dark grey on the near-black vinyl), a **cyan label ring**, a **white spindle ring** around the center hole, and **“CART RAVE”** drawn on a **canvas texture** in two curved arcs (top and bottom) so the title stays readable as the floor spins. Grooves are confined to an annulus so they do not cross the label area.
- **Physics:** one static **Rapier trimesh** built from the same mesh vertices/indices as the visual, so carts can fall through the **center hole**. The floor mesh rotates for vibe; the collider stays fixed (hole is axis-aligned with rotation).

Tuning lives under **`CONFIG.record`** in **`main.js`** (e.g. `radius`, `innerRadius`, `thickness`, `y`, friction). Decorative surface layers are under **`CONFIG.record.surface`**: **`concentricRings`** (groove count, width, color, inner/outer radius, `yOffset`), **`labelDisc`**, **`spindleRing`**, and **`labelText`** (arc radius/angle, font, colors, `yOffset`).

## Carts & tuning

- **Visuals:** edit the exported constants at the top of **`cart.js`** (basket, chassis, wheels, caster behavior). **`main.js`** imports `buildCart`, `updateCartVisuals`, and `resetCartVisualState`.
- **Physics / feel:** **`CONFIG.cart`**, **`CONFIG.driving`**, **`CONFIG.ramming`**, **`CONFIG.fall`** in **`main.js`**. Collider size is `CONFIG.cart.size` (half-extents are derived in code). Center-of-mass is adjusted for tipping (see comments around cart spawn / mass properties in **`main.js`**—not a full mass pipeline).
- **Spawn height:** `CONFIG.cart.spawnHeight` is tuned to reduce the initial drop onto the floor (which can cause a brief, ugly tilt/roll as contacts resolve) and to better align the visual wheels with the floor. Horizontal placement uses `CONFIG.cart.spawnRingRadius` and fixed slot angles (see `main.js`).

## NPC test scaffolding (not “slot fill”)

For multi-cart testing, **`CONFIG.npcCount`** in **`main.js`** spawns that many **AI-driven** carts (same wander/steer logic as the original single AI). **`0`** = player only. Colors rotate from a small test palette so carts are easy to tell apart. This is **temporary**—not the host-authoritative NPC fill from the jam plan.

## Camera

Third-person follow uses **`CONFIG.camera`** (`followBack`, `followUp`, `lookAhead`, `lookUp`, damping, etc.). Portrait/wide aspect adjusts **FOV** within `minFov` / `maxFov` clamp bounds.

## PartyKit (multiplayer)

Server logic lives in **`party/index.ts`** (see **`partykit.json`** for entry). The room party name is **`main`** (must match the client `PartySocket` config in **`main.js`**).

**Model:** up to **four slots** (humans fill in join order; empty slots stay **NPC**). The **designated host** runs **Rapier** and the full game tick; it sends periodic **`host_transform`** updates (~**20 Hz**, see **`CONFIG.net.hostSendHz`**). **Non-host** clients send **`client_input`** only and render **interpolated** snapshots (**~150 ms** buffer, **`CONFIG.net.interpBufferMs`**). If the host disconnects, the PartyKit server **migrates** host to the next connected human (oldest join order).

The static game and the PartyKit server run as **two local processes**:

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

## Netcode debugging helpers

Client-side helpers in `main.js`:

- `window.__debug()`: dumps useful netcode state (host/client role, IDs, slot info).
- `window.__log(label, payload)`: structured debug log helper.
- `__msgCounts`: in/out message counters (useful for quickly spotting bad loops or missing messages).

Server-side helper in `party/index.ts`:

- `debug_log` message handler: enables a “phone → PartyKit server” log bridge during LAN testing.

## Controls

- **WASD** or **arrow keys** — drive
- **Shift** — ram boost (nitro); networked as **`client_input`** when you are not the PartyKit host
- **Space** — horn
- **M** or the **speaker button** (bottom of the screen) — mute / unmute all audio

## Sounds

Optional files in **`sounds/`**:

- **`music.mp3`** — background music (first click or key starts playback)
- **`horn.wav`** / **`horn.mp3`** — horn clip (synth honk if missing)
