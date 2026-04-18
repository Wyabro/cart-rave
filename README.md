# Cart Rave (prototype)

Open via a local server (module + audio need HTTP, not `file://`):

```bash
python -m http.server 5173
```

Then open `http://localhost:5173/`.

## PartyKit (step 2 — handshake only)

The static game and the PartyKit server run as **two local processes**:

1. **PartyKit dev server** (WebSocket party). The client expects **`127.0.0.1:1999`**; pin the port if something else grabbed it first:

   ```bash
   npx partykit dev -p 1999
   ```

2. **Static site** (same as before — serves `index.html` + `main.js`; `partysocket` loads from the import map CDN):

   ```bash
   python -m http.server 5173
   ```

Open `http://localhost:5173/`. With both running, you should see **`connected to party`** in the **browser console** and in the **`partykit dev` terminal** when the socket opens.

**Production party:** deploy the server separately to PartyKit (not Vercel):

```bash
npx partykit deploy
```

After deploy, set `PARTYKIT_PUBLIC_HOST` in `main.js` to your PartyKit host (for example `your-project.your-user.partykit.dev`) so the production static site can open the pipe.

## Controls
- **WASD** or **arrow keys** — drive
- **Space** — horn
- **M** or the **speaker button** (bottom of the screen) — mute / unmute all audio

## Sounds
Optional files in `sounds/`:
- **`music.mp3`** — background music (first click or key starts playback)
- **`horn.wav`** / **`horn.mp3`** — horn clip (synth honk if missing)
