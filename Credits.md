# Credits (Third‑Party)

This document lists third‑party libraries, services, and any third‑party assets used by **Cart Rave**.

If an asset’s **source/license is not documented** in the repository notes, it is marked as **Not documented** rather than guessed.

---

## Libraries (runtime + tooling)

| Category | Name | Where used | Version / Reference | License | Link |
|---|---|---|---|---|---|
| Rendering | Three.js | Client (browser) | `0.164.1` (CDN import map) | MIT | `https://github.com/mrdoob/three.js` |
| Physics | Rapier (Rapier3D) | Client (host-authoritative physics) | Not documented (loaded via CDN per docs) | Apache-2.0 | `https://github.com/dimforge/rapier` |
| Multiplayer | PartyKit | Server (PartyKit room/worker) + local dev CLI | `0.0.115` (`package.json`) | MIT | `https://github.com/partykit/partykit` |
| Networking | `partysocket` | Client WebSocket | `1.1.16` (CDN import map) | MIT | `https://www.npmjs.com/package/partysocket` |
| Debug tooling (dev-only) | Eruda | Client (loaded only on local/LAN hostnames) | Not pinned (loaded from jsDelivr) | MIT | `https://github.com/liriliri/eruda` |

---

## Fonts

Fonts are loaded via Google Fonts in `index.html`.

| Font | License | Link |
|---|---|---|
| Bungee | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Bungee` |
| Bungee Shade | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Bungee+Shade` |
| Space Mono | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Space+Mono` |
| Archivo Black | SIL Open Font License 1.1 (OFL-1.1) | `https://fonts.google.com/specimen/Archivo+Black` |

---

## Services / hosted dependencies

| Name | Purpose | Link |
|---|---|---|
| PartyKit | Multiplayer hosting/runtime for the party server | `https://www.partykit.io/` |
| Vercel | Static hosting for the game client | `https://vercel.com/` |
| Cursor Vibe Jam widget | Jam embed/widget script | `https://vibej.am/` |
| unpkg | CDN used for Three.js ESM modules | `https://unpkg.com/` |
| esm.sh | CDN used for ESM packages (e.g., `partysocket`) | `https://esm.sh/` |
| jsDelivr | CDN used for Eruda (local/LAN only) | `https://www.jsdelivr.com/` |

---

## Third‑party assets

### Audio

The repository contains audio files under `sounds/`, but **the origin/license of these files is not documented in the notes** found in `docs/` or other text files.

| File | Type | Source | License |
|---|---|---|---|
| `sounds/menu.mp3` | Music | Not documented | Not documented |
| `sounds/music.mp3` | Music | Not documented | Not documented |
| `sounds/song2.mp3` | Music | Not documented | Not documented |
| `sounds/song3.mp3` | Music | Not documented | Not documented |
| `sounds/song4.mp3` | Music | Not documented | Not documented |
| `sounds/cart-crash.wav` | SFX | Not documented | Not documented |
| `sounds/horn.wav` | SFX | Not documented | Not documented |

### Models

- **Third-party models**: Not documented.
- Notes indicate procedural cart geometry and scene elements, but no external model sources are recorded in `docs/` or other text attribution files.

### Textures / images

- **Third-party textures/images**: Not documented in repository notes.

