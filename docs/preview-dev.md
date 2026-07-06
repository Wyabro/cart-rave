# Local Development and Preview Workflow

Use **local Wrangler dev** for day-to-day multiplayer and physics testing. Deploy to Cloudflare only when you need a public shareable URL.

## Daily Development (recommended)

Run the unified dev script which starts the Vite client dev server and the Wrangler local worker dev server:

```bash
npm run dev:next-level
```

Then open **http://127.0.0.1:3000/** to play. The client automatically connects to the local worker running on **port 1999** (see local environment detection in `src/netcode.js`).

### Two-Terminal Alternative

If you prefer to keep client and server logs separated:

```bash
# Terminal 1 — Client
npm run dev

# Terminal 2 — Server Worker
npm run dev:party
```

---

## Technical Stack & Configuration

| Component | Technology / Config | Role |
|-----------|---------------------|------|
| **Multiplayer backend** | [partyserver](https://github.com/threepointone/partyserver) | Durable Object room coordinator + WebSocket control plane (lobby, round, WebRTC signaling, kill feed) |
| **Real-time transport** | WebRTC DataChannels (`src/netcode/p2p.js`) | Peer-to-peer host transforms, client input, and spill events (bypass the server) |
| **Local worker runner** | [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) | Simulates Cloudflare Workers and Durable Objects locally |
| **Build & Dev server** | Vite | Bundles client code (`src/`) and serves static assets |
| **Config definition** | `wrangler.jsonc` | Declares Durable Object bindings, assets directory, and DO migrations |

The server (`party/index.ts`) has **no physics engine**. The client chosen as the **host** calculates physics for all slots and broadcasts transforms **peer-to-peer over WebRTC DataChannels** — not through the server.

---

## Cloudflare Deployment

To deploy both the static client assets and the server-side Durable Object to the public Cloudflare worker:

```bash
npm run ship
```

This runs `npm run build` (bundling Vite into `dist/`) followed by `npx wrangler deploy`.

- **Deployed URL:** `https://cart-rave.wyabro.workers.dev/`
- **Real-time Tail logs:** To watch production server console logs in real time, run:

```bash
npx wrangler tail
```

---

## Production vs. Preview Projects

Since the migration to Cloudflare Workers, we use a single unified deployment target (`wrangler.jsonc`).
- For local testing, Wrangler isolates SQLite / Durable Object storage to your local `.wrangler/` cache directory.
- Deploys to Cloudflare publish to the production worker (`cart-rave`). Avoid deploying untested worker code to prevent interrupting active matches.

For the latest release priorities, see [ROADMAP.md](./ROADMAP.md).
