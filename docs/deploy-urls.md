# Cart Rave — production URLs and PartyKit verification

Quick reference so agents do not have to rediscover hosts from `partykit.json`, the CLI, and `main.js`.

## Static game (Vercel)

| Resource | URL |
|----------|-----|
| Production site | `https://www.cartrave.lol/` |
| Game entry (ESM) | `https://www.cartrave.lol/main.js` |

When checking a fresh deploy, send cache-busting headers (for example `Cache-Control: no-cache`) — CDN caching has masked updates before.

## PartyKit (multiplayer server)

| Source | Value |
|--------|--------|
| `partykit.json` → `name` | `cart-rave` |
| Deployed base URL (`npx partykit list` / `npx partykit info`) | `https://cart-rave.wyabro.partykit.dev` |

Hostname pattern on the managed platform:

`https://<partykit.json name>.<PartyKit account slug>.partykit.dev`

The account slug (`wyabro` here) is **not** in `partykit.json`; it comes from the PartyKit account used when running `partykit deploy`.

### Client wiring (`main.js`)

- `PARTYKIT_PUBLIC_HOST = "cart-rave.wyabro.partykit.dev"` (no scheme; see below).
- `PartySocket` is constructed with `party: "main"` and `room` from `resolvedPartyRoomFromUrl()` (`?room=` when valid, else `quickplay`).

### WebSocket URL (canonical for realtime)

`partysocket` builds the socket URL as:

`wss://<host>/parties/<party>/<room>`

So for production:

`wss://cart-rave.wyabro.partykit.dev/parties/main/<room>`

Example default room:

`wss://cart-rave.wyabro.partykit.dev/parties/main/quickplay`

Local dev uses `partyHostFromWindowLocation()` (for example `127.0.0.1:1999`) with the same `/parties/main/<room>` path shape and `ws://` where appropriate.

### HTTP GET and “worker bundle” checks

Plain HTTP GET to the deploy host root returns **404**. GET to a party path (for example `https://cart-rave.wyabro.partykit.dev/parties/main/quickplay`) returns **500** with a short body such as `No onRequest handler` — this project’s server does not implement `onRequest`; the edge worker is driven by WebSocket upgrades and PartyKit routing, **not** by serving a public `.js` artifact you can download and `Select-String` like `main.js`.

So **there is no canonical “worker bundle” URL** on `*.partykit.dev` for grep-based production verification of minified server code.

## How to verify Party **server** changes match `main`

1. **Source at the deployed commit** (repo contract), after `git fetch`:

   ```powershell
   git show origin/main:party/index.ts | Select-String -Pattern 'data\.connId = conn\.id','conn\.id !== this\.#hostId'
   ```

   For a specific fix commit (example security commit `b270200`):

   ```powershell
   git merge-base --is-ancestor b270200 origin/main
   git show b270200:party/index.ts | Select-String -Pattern 'data\.connId = conn\.id','conn\.id !== this\.#hostId'
   ```

2. **Deploy**: Run `npx partykit deploy` from repo root after merging (or confirm your pipeline does), so the edge worker matches `main`.

3. **Runtime**: `npx partykit tail` while joining a room and sending traffic.

## Related commands

```bash
npx partykit list
npx partykit info
npx partykit deploy
npx partykit tail
```
