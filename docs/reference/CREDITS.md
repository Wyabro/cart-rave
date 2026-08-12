# Credits (Third‑Party)

This document lists third‑party libraries, services, and assets used by **Cart Clash**.

**Source of truth for versions:** `package.json` ranges (and the lockfile for exact installs). Update this file when those ranges change.

Runtime dependencies are bundled by Vite unless noted otherwise.

---

## Libraries (runtime + tooling)

### Client

| Category | Name (npm) | Where used | Version | License | Link |
|---|---|---|---|---|---|
| 3D Rendering | Three.js (`three`) | Client (`src/`, Vite-bundled) | `^0.185.1` | MIT | `https://github.com/mrdoob/three.js` |
| Three types | `@types/three` | JSDoc / `tsc` typechecking | `^0.185.1` | MIT | `https://www.npmjs.com/package/@types/three` |
| Physics | Rapier3D (`@dimforge/rapier3d`, native WASM) | Client — host-authoritative physics (`src/simulation.js`, etc.) | `^0.19.3` | Apache-2.0 | `https://github.com/dimforge/rapier` |
| Physics (SIMD) | Rapier3D SIMD (`@dimforge/rapier3d-simd`, native WASM) | Client — preferred SIMD build with standard fallback (`src/physics/rapierInstance.js`) | `^0.19.3` | Apache-2.0 | `https://github.com/dimforge/rapier` |
| State | Zustand (`zustand/vanilla`) | UI & settings stores (`src/stores/`) | `^5.0.14` | MIT | `https://github.com/pmndrs/zustand` |
| Audio | Howler.js (`howler`) | Music/SFX, pooling, spatial groups (`src/audioManager.js`) | `^2.2.4` | MIT | `https://github.com/goldfire/howler.js` |
| Animation | anime.js (`animejs`) | Client UI animations (`src/animations.js`) | `^4.5.0` | MIT | `https://github.com/juliangarnier/anime` |
| Debug UI | Tweakpane (`tweakpane`) | Neon debug & settings pane (`src/postFxDebug.js`, etc.) | `^4.0.5` | MIT | `https://github.com/cocopon/tweakpane` |
| Touch | nipplejs (`nipplejs`) | Mobile virtual analog joystick (`src/touchControls.js`) | `^1.0.4` | MIT | `https://github.com/yoannmoinet/nipplejs` |
| Language | JavaScript (JSDoc) + TypeScript (`typescript`) for `tsc --noEmit` | Typecheck only — not a runtime transpile | `^6.0.3` | Apache-2.0 | `https://www.typescriptlang.org/` |

> **TypeScript:** intentionally on **6.x**. npm may report 7.x as latest; major upgrade is deferred.

### Server & infrastructure

| Category | Name (npm / product) | Where used | Version | License | Link |
|---|---|---|---|---|---|
| Multiplayer DO | `partyserver` | Cloudflare Worker Durable Object (`party/index.ts`) | `^0.5.8` | MIT | `https://github.com/threepointone/partyserver` |
| WebSocket client | `partysocket` | Client control-plane WebSocket (`src/netcode.js`) | `^1.3.0` | MIT | `https://www.npmjs.com/package/partysocket` |
| P2P transport | WebRTC DataChannels | Browser-native gameplay plane (`src/netcode/p2p.js`) | Browser native | — | — |
| TURN relay | Cloudflare Calls | API-minted TURN tokens (`party/index.ts` → Calls TURN keys) | Account API | — | `https://developers.cloudflare.com/calls/` |
| WASM bundling | `vite-plugin-wasm` | Rapier WASM in Vite builds | `^3.6.0` | MIT | `https://www.npmjs.com/package/vite-plugin-wasm` |
| Build | Vite (`vite`) | Dev server + production build (`dist/`) | `^8.1.4` | MIT | `https://github.com/vitejs/vite` |
| Deploy CLI | Wrangler (`wrangler`) | Worker bundle, local DO, asset deploy | `^4.110.0` | MIT / Apache-2.0 | `https://github.com/cloudflare/workers-sdk` |
| Static assets | Worker `ASSETS` binding | Serves Vite `dist/` from the same Worker | — | — | `wrangler.jsonc` → `assets.directory: "dist"` |

> **Wrangler peer note:** `wrangler@4.108+` optional-peers `@cloudflare/workers-types@5`, while `partyserver` still depends on workers-types **v4**. Repo uses `.npmrc` `legacy-peer-deps=true` until partyserver updates.

### Testing & quality

| Category | Name (npm) | Where used | Version | License | Link |
|---|---|---|---|---|---|
| Test runner | Vitest (`vitest`) | Unit tests (`tests/`) | `^4.1.10` | MIT | `https://vitest.dev/` |
| DOM env | happy-dom (`happy-dom`) | Vitest DOM environment | `^20.10.6` | MIT | `https://github.com/capricorn86/happy-dom` |
| Dead code | Knip (`knip`) | Unused export analysis (`knip.json`) | `^6.26.0` | ISC | `https://github.com/webpro/knip` |
| Typecheck | `tsc --noEmit` | `npm run typecheck` / `npm run check` | via TypeScript `^6.0.3` | — | — |
| Workers test pool | `@cloudflare/vitest-pool-workers` | Durable Object tests (`vitest.party.config.js`, `npm run test:party-do`) | `^0.18.7` | MIT | `https://github.com/cloudflare/workers-sdk` |
| Browser tooling | Playwright (`playwright`) | Screenshot / visual harnesses (`tools/`) | `^1.50.0` | Apache-2.0 | `https://playwright.dev/` |
| Image tooling | Sharp (`sharp`) | Screenshot compare / image processing (`tools/`) | `^0.34.0` | Apache-2.0 | `https://sharp.pixelplumbing.com/` |

### Dev-only (not an npm dependency)

| Category | Name | Where used | Version | License | Link |
|---|---|---|---|---|---|
| Debug console | Eruda | Loaded from CDN on localhost / LAN only (`index.html`) | Not pinned | MIT | `https://github.com/liriliri/eruda` |

**Three.js examples** (same MIT license as Three.js): `CSS2DRenderer`, `EffectComposer`, `OutputPass`, `RenderPass`, `ShaderPass`, `UnrealBloomPass`, `FXAAShader`, `RoomEnvironment`, `Reflector`, `BufferGeometryUtils`, `GLTFLoader`, `DRACOLoader`, `GLTFExporter` — imported from `three/examples/jsm/` in `src/`.

---

## Fonts

Self-hosted under `public/fonts/` (`fonts.css` + latin woff2). Refresh with `npm run fonts:fetch`.

| Font | Role | License | Link |
|---|---|---|---|
| Road Rage | Display / titles | SIL OFL-1.1 | `https://fonts.google.com/specimen/Road+Rage` |
| Russo One | UI headers | SIL OFL-1.1 | `https://fonts.google.com/specimen/Russo+One` |
| Goldman | Mono / body UI incl. HUD timer (400, 700) | SIL OFL-1.1 | `https://fonts.google.com/specimen/Goldman` |
| Bungee | Boot splash / kill feed | SIL OFL-1.1 | `https://fonts.google.com/specimen/Bungee` |
| Space Mono | Boot mono / debug (400) | SIL OFL-1.1 | `https://fonts.google.com/specimen/Space+Mono` |

Fallbacks only (not shipped): system-ui, Archivo Black (CSS fallback for Bungee).

---

## Services / hosted dependencies

| Name | Purpose | Link |
|---|---|---|
| Cloudflare Workers | Serverless host for assets + partyserver Durable Objects (free tier capable) | `https://workers.cloudflare.com/` |
| Cloudflare Calls | TURN credential minting for WebRTC P2P (env: `CF_ACCOUNT_ID`, `CF_CALLS_KEY_ID`, `CF_API_TOKEN`) | `https://developers.cloudflare.com/calls/` |
| unpkg | CDN fallback for Eruda (local/LAN dev only) | `https://unpkg.com/` |
| jsDelivr | CDN fallback for Eruda (local/LAN dev only) | `https://www.jsdelivr.com/` |

---

## Audio (`public/sounds/`)

| File | Type | Source | License / notes |
|---|---|---|---|
| `menu.opus` | Music | Created with [Suno](https://suno.com/) | Licensed to project author via Suno |
| `music.opus` | Music | Created with Suno | Licensed to project author via Suno |
| `song2.opus` | Music | Created with Suno | Licensed to project author via Suno |
| `song3.opus` | Music | Created with Suno | Licensed to project author via Suno |
| `song4.opus` | Music | Created with Suno | Licensed to project author via Suno |
| `cart-crash`, `cart-crash-2`, `cart-crash-3`, `kill-confirm`, `storerooms`, `water-splash`, `Boost`, `Death`, `Hop`, `Floor`, `Charge_up`, `countdown_1/2/3`, `countdown_go` | SFX | Project / recorded | Shipped as `.opus`; source not individually recorded in repo |

Per-arena ambient beds and announcer stings live under `public/sounds/ambience/` and `public/sounds/announcer/` — see [ambience.md](./ambience.md) and [announcer.md](./announcer.md).

Bundled audio ships in a single `.opus` format under `public/sounds/` — Opus has universal browser support (Chrome, Firefox, Safari, Edge), so no format fallback is needed. Some additional in-game feedback is **procedural** (Web Audio API oscillators in `src/sfxSynth.js` / `src/announcer/announcerStings.js`). Raw `.wav` masters and unused loops were removed during the July 2026 production-readiness pass.

---

## 3D models & geometry

**Cart body (first-party asset):** the playable cart uses project-owned GLBs (`cartrave4-draco.glb` + `cart-rave-base-draco.glb` under `public/models/`; masters under `art/models/`). Props include `groceries/` and `sunglasses-visor.glb`. Pattern masks sample a second UV channel — see [cart-pattern-reuv.md](../guides/cart-pattern-reuv.md). Compress with `npm run compress:rave-gltf`.

**Arenas and most scene dressing** are **procedurally built in code** (`src/levels/arena.js`, `src/levels/`, `src/sceneExtras.js`, etc.) from Three.js primitives and custom mesh builders — not third-party marketplace packs.

> **Note (July 2026):** Arena floor colliders use `convexHull` + primitive colliders (cuboids) rather than trimesh for stability and performance.

---

## Textures / images

| Asset | Source | Notes |
|---|---|---|
| `public/favicon.ico`, `favicon-*.png`, `apple-touch-icon.png`, `android-chrome-*.png` | Project / generated | App icons |
| In-game textures | Procedural or code-generated | No external texture packs documented |

---

**Last Updated:** August 12, 2026
