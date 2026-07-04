# Cart Rave — Production Deployment & Verification

Quick reference to track deployment targets, live URLs, and verification commands.

## Unified Cloudflare Deployment

In the raw **partyserver** setup, a single Cloudflare Worker hosts both the static client assets and the WebSocket Durable Object rooms. Vercel is no longer used for static hosting.

| Resource | URL | Role |
|----------|-----|------|
| **Production Game URL** | `https://cart-rave.wyabro.workers.dev/` | Serves client assets (HTML/JS/CSS/SFX) and acts as the WebSocket endpoint |
| **Durable Object Room** | `wss://cart-rave.wyabro.workers.dev/parties/main/<room>` | Real-time game room socket (`main` Durable Object class) |
| **Error Log Endpoint** | `https://cart-rave.wyabro.workers.dev/api/log-error` | Receives client-side exception forwarder payloads |

---

## Client Wiring (`src/netcode.js`)

The client automatically detects its hosting context:
- On `localhost` / `127.0.0.1`, it points to `localhost:1999` using `ws://`.
- In production, it connects to `wss://cart-rave.wyabro.workers.dev/parties/main/<room>` (`?room=` value from URL query, defaulting to `quickplay`).

---

## Deploying Updates

To deploy changes to the live site:

```bash
npm run ship
```
This builds client assets to `dist/` and runs `npx wrangler deploy` to push them alongside the Durable Object worker class.

---

## Verification Commands

To check on active connections, debug issues, or tail live production server console logs, use the Wrangler CLI:

### 1. Tail Production Server Logs
```bash
npx wrangler tail
```

### 2. Inspect Deployed Source (GitHub vs. Cloudflare)
Compare your local or main branch with the deployed worker script schema:
```bash
git show origin/main:party/index.ts | grep -E 'broadcast|onMessage|DurableObject'
```

### 3. Check for Runtime Errors
Join a room, trigger actions (e.g., collisions, custom colors, level switches), and monitor `npx wrangler tail` to verify that no unhandled server-side exceptions occur.
- Non-host connections correctly map to the new broadcast sequence.
- Late-joining clients receive the correct `#currentLevelId` authority from the Durable Object.

For the active V2 feature progression, see [ROADMAP.md](./ROADMAP.md).
