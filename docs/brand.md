# Cart Clash — Naming Freeze

**Last updated:** July 8, 2026  
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
| **Production host** | `cart-rave.wyabro.workers.dev` | Until a domain cutover |
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
| `zanzibar` | **ZANZIBAR PLATFORM** |

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

---

## History

- Jam / early post-jam product name: **Cart Rave**  
- Rebrand target: **Cart Clash** (UI/meta largely done July 2026)  
- Dev branch formerly called `next-level` → **`cart-clash`**  
- This freeze exists so half-renamed docs stop fighting each other.
