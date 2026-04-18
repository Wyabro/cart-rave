# Cart Rave (prototype)

Browser prototype: **Three.js** rendering, **Rapier3D** physics, optional **PartyKit** handshake. Carts are **fully procedural** (no GLTF or external models): wire basket, open chassis, chunky casters, and emissive neon materials live in **`cart.js`**. Caster **yaw** follows planar velocity (damped, with a little wobble at speed); **wheel roll** is derived from speed and `WHEEL_RADIUS`. Rapier uses a **single cuboid** per cart for collisions—visuals are a separate layer synced to each body every frame.

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

## Arena (dancefloor)

The floor is a **ring** (outer radius + inner hole), not a solid disc:

- **Visual:** `ExtrudeGeometry` from a circular shape with a hole (beveled top/bottom for a smoother inner lip). **Neon torus rims** on outer and inner edges.
- **Physics:** one static **Rapier trimesh** built from the same mesh vertices/indices as the visual, so carts can fall through the **center hole**. The floor mesh rotates for vibe; the collider stays fixed (hole is axis-aligned with rotation).

Tuning lives under **`CONFIG.record`** in **`main.js`** (e.g. `radius`, `innerRadius`, `thickness`, `y`, friction).

## Carts & tuning

- **Visuals:** edit the exported constants at the top of **`cart.js`** (basket, chassis, wheels, caster behavior). **`main.js`** imports `buildCart`, `updateCartVisuals`, and `resetCartVisualState`.
- **Physics / feel:** **`CONFIG.cart`**, **`CONFIG.driving`**, **`CONFIG.ramming`**, **`CONFIG.fall`** in **`main.js`**. Collider size is `CONFIG.cart.size` (half-extents are derived in code). Center-of-mass is adjusted for tipping (see comments around cart spawn / mass properties in **`main.js`**—not a full mass pipeline).
- **Spawn height:** `CONFIG.cart.spawn.y` is tuned to reduce the initial drop onto the floor (which can cause a brief, ugly tilt/roll as contacts resolve) and to better align the visual wheels with the floor.

## NPC test scaffolding (not “slot fill”)

For multi-cart testing, **`CONFIG.npcCount`** in **`main.js`** spawns that many **AI-driven** carts (same wander/steer logic as the original single AI). **`0`** = player only. Colors rotate from a small test palette so carts are easy to tell apart. This is **temporary**—not the host-authoritative NPC fill from the jam plan.

## Camera

Third-person follow uses **`CONFIG.camera`** (`followBack`, `followUp`, `lookAhead`, `lookUp`, damping, etc.). Portrait/wide aspect adjusts **FOV** within `minFov` / `maxFov` clamp bounds.

## PartyKit (handshake only)

The static game and the PartyKit server run as **two local processes**:

1. **PartyKit dev server** (WebSocket party). The client expects **`127.0.0.1:1999`**; pin the port if something else grabbed it first:

   ```bash
   npx partykit dev -p 1999
   ```

2. **Static site** (serves `index.html` + `main.js`; `partysocket` loads from the import map CDN):

   ```bash
   python -m http.server 8085
   ```

Open the static URL. With both running, you should see **`connected to party`** in the **browser console** and in the **`partykit dev` terminal** when the socket opens.

**Production party:** deploy the server separately to PartyKit (not Vercel):

```bash
npx partykit deploy
```

After deploy, set **`PARTYKIT_PUBLIC_HOST`** in **`main.js`** to your PartyKit host (for example `your-project.your-user.partykit.dev`) so the production static site can open the pipe.

## Controls

- **WASD** or **arrow keys** — drive
- **Space** — horn
- **M** or the **speaker button** (bottom of the screen) — mute / unmute all audio

## Sounds

Optional files in **`sounds/`**:

- **`music.mp3`** — background music (first click or key starts playback)
- **`horn.wav`** / **`horn.mp3`** — horn clip (synth honk if missing)
