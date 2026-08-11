# Cart Clash — Deploy map

Three lanes. Do not invent a second Cloudflare “prod.”

| Lane | Job | Command |
|------|-----|---------|
| **Local** | Daily test | `npm run dev:local` → `http://127.0.0.1:3000/` |
| **Cloudflare** | Public prod | **“ship it”** → `npm run ship` |
| **Glitch** | Festival copy of public | **“ship glitch”** → `npm run ship:glitch` (only after prod is good) |

## Cloudflare (one Worker)

Worker name stays **`cart-rave`**. One `npm run ship` updates **both** hosts:

| URL | Role |
|-----|------|
| **https://www.cartclash.lol/** | Share this with players (prefer `www` if apex DNS is bad) |
| **https://cartclash.lol/** | Same Worker (apex) |
| **https://cart-rave.wyabro.workers.dev/** | Same build — agent/bookmark twin, **not** a separate staging env |

Rooms / signaling use the **page host** when it is in `WORKER_PAGE_HOSTS` (`src/config.js`). Local uses `:8787`.

Post-ship (DEPLOY-STALE-HTML-1): poll `GET /` + every hashed asset until **0×404**, then confirm a symbol. Do not share the live URL in a dirty window.

## Glitch (separate)

Static festival CDN. Multiplayer still talks to **public** CF (`cartclash.lol`).

```powershell
npm run build
$env:GLITCH_DEPLOY_TOKEN = "gl_deploy_..."   # shell only — never commit
$env:GLITCH_ACTIVATE = "1"
npm run ship:glitch
```

Version defaults to `GLITCH_GAME_VERSION` in `src/analytics/glitchConfig.js`. Override with `GLITCH_VERSION` if needed.

## Chat → command

| Wyatt says | Agent runs |
|------------|------------|
| **ship it** | `npm run qa` then `npm run ship` (CF only) |
| **ship glitch** | `npm run ship:glitch` (Glitch only) |
| (daily test) | `npm run dev:local` — do **not** deploy to try a tweak |

## Verify

```bash
npx wrangler tail
```

Join a room and watch for unhandled server exceptions. Full gates: `npm run qa` (report by number).
