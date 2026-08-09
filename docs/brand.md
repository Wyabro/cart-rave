# Cart Clash — Naming Freeze

**Last updated:** July 10, 2026  
**Status:** Canonical. Prefer this file when docs or comments disagree.

This freezes product naming so "Cart Rave" / `next-level` thrash stops mid-V2. Infra IDs that would break deploys or wipe player data stay legacy until a deliberate cutover.

---

## Canonical names

| Layer | Canonical value | Notes |
|-------|-----------------|-------|
| **Product name** | **Cart Clash** | UI, titles, meta, docs, announcer copy |
| **Active branch** | **`cart-clash`** | Not `next-level` (retired name) |
| **Production branch** | `main` | Stable/shipped |
| **Daily local multiplayer** | `npm run dev:local` | Aliases: `dev:cart-clash`, `dev:next-level` (deprecated) |
| **GitHub repo folder** | `cart-rave` | Repo path may lag product name |
| **Cloudflare Worker name** | `cart-rave` | **Do not rename casually** — new Worker + URL |
| **Production host** | `cartclash.lol` | Custom domain on Worker `cart-rave`; `cart-rave.wyabro.workers.dev` stays staging |
| **Durable Object class** | `CartRaveServer` | Wrangler migration-bound; leave until planned migration |
| **PartySocket `party` id** | `cart-rave-server` | Must match server routing |
| **localStorage keys** | `cartRave*` | Keep until a one-shot migration ships |
| **Window boot bridge** | `__cartRave*` / `window.CartRave` | Keep; `window.CartClash` is an alias |
| **Asset paths** | `cart-rave-base*.glb`, etc. | Filename renames are a separate asset pass |
| **Module filenames** | `cart-rave-menu.js`, `cartRaveGltf.js` | Code identifiers; rename only with a dedicated refactor |

---

## Product vs level names

**Product** is always **Cart Clash**. The original jam name is preserved as a **level tribute** on the first arena only.

| Level id | Display name |
|----------|----------------|
| `classicRecord` | **CART RAVE** (neon vinyl arena — jam tribute) |
| `backrooms` | **THE STOREROOMS** |
| `zanzibar` | **SUNDIAL STATION** (working name "Zanzibar Platform" retired 2026-07-09; level id stays `zanzibar`) |

- Boot chrome, meta, menu shell, PWA: **Cart Clash** (product)
- Classic level card, classic mode-entry loader, classic arena billboards: **CART RAVE** (level tribute)
- Do not rename the product back to Cart Rave; do not strip the classic level tribute without an explicit decision

---

## What not to change without a cutover plan

1. `wrangler.jsonc` `name`, DO `class_name`, migrations  
2. `STORAGE_KEYS` string values in `src/utils/storage.js` (and raw key reads in netcode)  
3. `PartySocket({ party: "cart-rave-server" })`  
4. Public model/sound URLs under `/models/cart-rave-*`  

When those change, ship: storage migration, Worker alias or dual-route, and a deploy checklist.

### Cutover ceremony checklist (BRAND-1 — one planned event)

Do these together; do not drip-rename mid-V2:

1. New Cloudflare Worker name + production host (or custom domain) with dual-route / alias during transition.
2. Durable Object class rename only with a Wrangler migration plan (or accept a new DO namespace).
3. `PartySocket({ party: … })` id match on client and server.
4. One-shot `localStorage` migration for every `cartRave*` key (`src/utils/storage.js` + raw netcode reads).
5. Asset path renames under `/models/cart-rave-*` (and any sound URLs) + cache-bust.
6. Module/window identifiers (`cart-rave-menu.js`, `cartRaveGltf.js`, `__cartRave*`, `window.CartRave`) only if still needed after UI already says Cart Clash.
7. Drop deprecated script aliases (`dev:next-level`) and leftover console tags (`[CartRave]`) in the same pass.
8. Deploy checklist + post-deploy verify: join room, ready, full round, storage still has cosmetics.

Tracked as **BRAND-1** in [planning/BACKLOG.md](./planning/BACKLOG.md).

---

## History

- Jam / early post-jam product name: **Cart Rave**  
- Rebrand target: **Cart Clash** (UI/meta largely done July 2026)  
- Dev branch formerly called `next-level` → **`cart-clash`**  
- This freeze exists so half-renamed docs stop fighting each other.
