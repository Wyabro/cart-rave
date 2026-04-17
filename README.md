# Cart Rave (prototype)

Open via a local server (module + audio need HTTP, not `file://`):

```bash
python -m http.server 5173
```

Then open `http://localhost:5173/`.

## Controls
- **WASD** or **arrow keys** — drive
- **Space** — horn
- **M** or the **speaker button** (bottom of the screen) — mute / unmute all audio

## Sounds
Optional files in `sounds/`:
- **`music.mp3`** — background music (first click or key starts playback)
- **`horn.wav`** / **`horn.mp3`** — horn clip (synth honk if missing)
