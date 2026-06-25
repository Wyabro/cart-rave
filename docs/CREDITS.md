# Credits (Third‑Party)

This document lists third‑party libraries, services, and assets used by **Cart Rave**.

Runtime dependencies come from `package.json` and are bundled by Vite unless noted otherwise.

---

## Libraries (runtime + tooling)

| Category | Name | Where used | Version | License | Link |
|---|---|---|---|---|---|
| Rendering | Three.js | Client (`src/`, Vite-bundled) | `^0.164.1` | MIT | `https://github.com/mrdoob/three.js` |
| Physics | Rapier (Rapier3D) | Client — host-authoritative physics (`src/simulation.js`, etc.) | `^0.19.3` | Apache-2.0 | `https://github.com/dimforge/rapier` |
| Animation | anime.js (`animejs`) | Client UI animations (`src/animations.js`) | `^4.0.0` | MIT | `https://github.com/juliangarnier/anime` |
| Multiplayer | PartyKit | Server worker + local dev CLI (`party/index.ts`) | `0.0.115` | MIT | `https://github.com/partykit/partykit` |
| Networking | `partysocket` | Client WebSocket (`src/netcode.js`) | `^1.1.16` | MIT | `https://www.npmjs.com/package/partysocket` |
| Build | Vite | Dev server + production build (`dist/`) | `^6.3.5` | MIT | `https://github.com/vitejs/vite` |
| Debug UI (dev-only) | lil-gui | Post-processing debug panel (`src/postFxDebug.js`; tree-shaken in prod) | `^0.21.0` | MIT | `https://github.com/georgealways/lil-gui` |
| Dead-code analysis (dev-only) | Knip | `npm run knip` | `^6.20.0` | ISC | `https://github.com/webpro/knip` |
| Debug console (dev-only) | Eruda | Loaded from CDN on localhost / LAN only (`index.html`) | Not pinned | MIT | `https://github.com/liriliri/eruda` |

**Three.js examples** (same MIT license as Three.js): `CSS2DRenderer`, `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass`, `FXAAShader`, `RoomEnvironment`, `Reflector`, `BufferGeometryUtils` — imported from `three/examples/jsm/` in `src/`.

---

## Fonts

Loaded via Google Fonts in `index.html`.

| Font | License | Link |
|---|---|---|
| Bungee | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Bungee` |
| Bungee Shade | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Bungee+Shade` |
| Space Mono | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Space+Mono` |
| Archivo Black | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Archivo+Black` |
| Share Tech Mono | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Share+Tech+Mono` |

---

## Services / hosted dependencies

| Name | Purpose | Link |
|---|---|---|
| PartyKit / Cloudflare Workers | Multiplayer hosting for the party server | `https://www.partykit.io/` |
| Vercel | Static hosting for the game client | `https://vercel.com/` |
| Google Fonts | Web font delivery | `https://fonts.google.com/` |
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
| `cart-crash.wav` | SFX | Unknown | Source not recorded in repo |

Most in-game SFX are **procedural** (Web Audio API oscillators in `src/audio.js` / `src/audioSetup.js`). `cart-crash.wav` is the only bundled collision sample.

---

## 3D models & geometry

**No third-party 3D models.** All cart and scene geometry is **procedurally generated in code** (`src/cart.js`, `src/arena.js`, `src/levels/`, `src/visuals.js`, etc.) using Three.js primitives and custom mesh builders.

---

## Textures / images

| Asset | Source | Notes |
|---|---|---|
| `public/favicon.ico`, `favicon-*.png`, `apple-touch-icon.png`, `android-chrome-*.png` | Project / generated | App icons |
| In-game textures | Procedural or code-generated | No external texture packs documented |
