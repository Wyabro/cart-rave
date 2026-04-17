# Cart Rave

Browser-based physics sumo: shopping carts on a giant spinning vinyl record. Last cart on the record wins.

This repo is a **minimal prototype** (Day 1-ish): get the core physics feel working first.

## Current prototype features
- **Rotating record platform** (visual rotation; physics platform is fixed for stability)
- **2 carts with physics**: player cart + a dumb **AI wanderer**
- **Arcade driving**
  - WASD / arrow keys
  - Tank steering (turn-in-place)
  - Slight drift/slide while turning
- **Ramming boost**: collisions get a speed-scaled shove so fast hits feel punchy
- **Fall + respawn**: fall off the record → respawn quickly

## Tech
- **Three.js** (rendering, loaded via CDN)
- **Rapier3D** (physics, loaded via CDN)

## Run locally
From the repo root:

```bash
cd cart-rave
python -m http.server 5173
```

Then open `http://localhost:5173/`.

## Controls
- **W / Up Arrow**: forward
- **S / Down Arrow**: reverse
- **A/D / Left/Right**: turn
