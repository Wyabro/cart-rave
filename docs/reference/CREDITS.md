# Credits (Third‑Party)

This document lists third‑party libraries, services, and assets used by **Cart Clash**.

Runtime dependencies come from `package.json` and are bundled by Vite unless noted otherwise.

---

## Libraries (runtime + tooling)

| Category | Name | Where used | Version | License | Link |
|---|---|---|---|---|---|
| Rendering | Three.js | Client (`src/`, Vite-bundled) | `^0.185.1` | MIT | `https://github.com/mrdoob/three.js` |
| Physics | Rapier (Rapier3D) | Client — host-authoritative physics (`src/simulation.js`, etc.) | `^0.19.3` | Apache-2.0 | `https://github.com/dimforge/rapier` |
| Animation | anime.js (`animejs`) | Client UI animations (`src/animations.js`) | `^4.0.0` | MIT | `https://github.com/juliangarnier/anime` |
| Multiplayer | `partyserver` | Cloudflare Worker DO backend (`party/index.ts`) | `^0.5.8` | MIT | `https://github.com/threepointone/partyserver` |
| Networking | `partysocket` | Client WebSocket (`src/netcode.js`) | `^1.1.16` | MIT | `https://www.npmjs.com/package/partysocket` |
| Build / Deploy | Wrangler | Worker bundle & asset uploader CLI | `^3.0.0` | MIT | `https://github.com/cloudflare/workers-sdk` |
| Build | Vite | Dev server + production build (`dist/`) | `^6.3.5` | MIT | `https://github.com/vitejs/vite` |
| Touch Controls | `nipplejs` | Mobile virtual analog joystick (`src/touchControls.js`) | `^1.0.4` | MIT | `https://github.com/yoannmoinet/nipplejs` |
| State Management | Zustand | UI & settings state store (`src/stores/`) | `^5.0.14` | MIT | `https://github.com/pmndrs/zustand` |
| Sound Engine | Howler.js | Audio playback, pooling, and spatial groups (`src/audio.js`) | `^2.2.4` | MIT | `https://github.com/goldfire/howler.js` |
| Debug UI | Tweakpane | Neon debug & settings pane (`src/postFxDebug.js`, etc.) | `^4.0.5` | MIT | `https://github.com/cocopon/tweakpane` |
| Dead-code analysis | Knip | Unused export audit tool (`knip.json`) | `^6.20.0` | ISC | `https://github.com/webpro/knip` |
| Debug console | Eruda | Loaded from CDN on localhost / LAN only (`index.html`) | Not pinned | MIT | `https://github.com/liriliri/eruda` |

**Three.js examples** (same MIT license as Three.js): `CSS2DRenderer`, `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass`, `FXAAShader`, `RoomEnvironment`, `Reflector`, `BufferGeometryUtils` — imported from `three/examples/jsm/` in `src/`.

---

## Fonts

Self-hosted under `public/fonts/` (`fonts.css` + latin woff2). Refresh with `npm run fonts:fetch`.

| Font | Role | License | Link |
|---|---|---|---|
| Road Rage | Display / titles | SIL OFL-1.1 | `https://fonts.google.com/specimen/Road+Rage` |
| Russo One | UI headers | SIL OFL-1.1 | `https://fonts.google.com/specimen/Russo+One` |
| Goldman | Mono / body UI (400, 700) | SIL OFL-1.1 | `https://fonts.google.com/specimen/Goldman` |
| Michroma | HUD timer | SIL OFL-1.1 | `https://fonts.google.com/specimen/Michroma` |
| Space Grotesk | HUD labels (400–700) | SIL OFL-1.1 | `https://fonts.google.com/specimen/Space+Grotesk` |
| Bungee | Boot splash / kill feed | SIL OFL-1.1 | `https://fonts.google.com/specimen/Bungee` |
| Space Mono | Boot mono / debug (400, 700) | SIL OFL-1.1 | `https://fonts.google.com/specimen/Space+Mono` |

Fallbacks only (not shipped): system-ui, Archivo Black (CSS fallback for Bungee).

---

## Services / hosted dependencies

| Name | Purpose | Link |
|---|---|---|
| Cloudflare Workers | Serverless host for assets + partyserver Durable Objects | `https://workers.cloudflare.com/` |
| unpkg | CDN fallback for Eruda (local/LAN dev only) | `https://unpkg.com/` |
| jsDelivr | CDN fallback for Eruda (local/LAN dev only) | `https://www.jsdelivr.com/` |

---

## Audio (`public/sounds/`)

| File | Type | Source | License / notes |
|---|---|---|---|
| `menu.mp3` | Music | Created with [Suno](https://suno.com/) | Licensed to project author via Suno |
| `music.mp3` | Music | Created with Suno | Licensed to project author via Suno |
| `song2.mp3` | Music | Created with Suno | Licensed to project author via Suno |
| `song3.mp3` | Music | Created with Suno | Licensed to project author via Suno |
| `song4.mp3` | Music | Created with Suno | Licensed to project author via Suno |
| `cart-crash`, `Boost`, `Death`, `Hop`, `Floor`, `Charge_up`, `countdown_*` | SFX | Project / recorded | Shipped as `.ogg` with `.mp3` fallbacks (Safari has no Ogg Vorbis support); source not individually recorded in repo |

Bundled SFX ship in both `.ogg` (primary) and `.mp3` (Safari/iOS fallback) formats under `public/sounds/`. Some additional in-game feedback is **procedural** (Web Audio API oscillators in `src/audio.js` / `src/audioSetup.js`). Raw `.wav` masters and unused loops were removed during the July 2026 production-readiness pass.

---

## 3D models & geometry

**Cart body (first-party asset):** the playable cart uses a project-owned GLB (`cartrave4` / related masters under `art/models/`, Draco runtime under `public/models/`). Pattern masks sample a second UV channel — see [cart-pattern-reuv.md](../guides/cart-pattern-reuv.md). Compress with `npm run compress:rave-gltf`.

**Arenas and most scene dressing** are **procedurally built in code** (`src/arena.js`, `src/levels/`, `src/sceneExtras.js`, etc.) from Three.js primitives and custom mesh builders — not third-party marketplace packs.

> **Note (July 2026):** Arena floor colliders use `convexHull` + primitive colliders (cuboids) rather than trimesh for stability and performance.

---

## Textures / images

| Asset | Source | Notes |
|---|---|---|
| `public/favicon.ico`, `favicon-*.png`, `apple-touch-icon.png`, `android-chrome-*.png` | Project / generated | App icons |
| In-game textures | Procedural or code-generated | No external texture packs documented |

---

**Last Updated:** July 4, 2026