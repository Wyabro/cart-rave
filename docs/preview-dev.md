# Preview dev workflow (`next-level` branch)

Use **local PartyKit** for day-to-day multiplayer work. Deploy only when you need a **public shareable URL**.

## Daily development (recommended)

One command — Vite client + preview PartyKit worker:

```bash
npm run dev:next-level
```

Then open **http://127.0.0.1:3000/** and test Solo / Quickplay / Friends as usual. The client talks to the local preview worker at **port 1999** (same as production `dev:party` wiring in `netcode.js`).

### Two-terminal alternative

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run dev:party:preview
```

## Config files

| File | Project | Purpose |
|------|---------|---------|
| `partykit.json` | `cart-rave` | Production worker + static host |
| `partykit.preview.json` | `cart-rave-preview` | Preview worker + static host (separate deploy target) |

Both use the same `party/index.ts` relay — preview is an isolated PartyKit project so `next-level` experiments do not touch production.

## Deploy (secondary — shareable URL only)

Only when someone off your machine needs to hit the preview build:

```bash
npm run build:party-static
npm run deploy:preview
```

Deployed host pattern: `https://cart-rave-preview.<account>.partykit.dev`

**Note:** Frequent preview deploys can hit Cloudflare Workers custom-domain limits on the shared `partykit.dev` zone. Prefer local dev above.

## Production (main branch)

| Task | Command |
|------|---------|
| Local prod config | `npm run dev` + `npm run dev:party` |
| Ship client + worker | `npm run ship` |

See also [deploy-urls.md](./deploy-urls.md) for production hostnames and verification. Forward-looking priorities: [ROADMAP.md](./ROADMAP.md).
