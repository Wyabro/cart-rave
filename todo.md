# Cart Rave — Todo & Roadmap

**Last Updated:** June 23, 2026

## Current Status

- **Core Game**: Fully playable, host-authoritative multiplayer with client-side prediction (non-host)
- **Physics & Feel**: Version 1 driving core restored + tipping tuned
- **Phase**: Content & Features — Backrooms level shipped, touch controls in progress
- **Modular Structure**: Core systems extracted to `src/`; `main.js` remains the live entry point and game wiring hub

---

## Active Roadmap

### Phase 2 — Polish & Balance ✅ **Completed**
- [x] NPC AI improvement (less suicidal + more varied behavior)
- [x] Ramming force & boosted ramming tuning
- [x] Collision "oomph", particles, and screen shake
- [x] Boost streaks (more anime/dramatic)
- [x] Audio polish (procedural SFX improved, good enough for now)
- [x] Hole rim behavior (smooth tipping/sliding)
- [x] Final boost/nitro balance pass

### Phase 3 — Content & Features (Next Priority)
- [x] New level: "Backrooms Supermarket" (`src/levels/backroomsSupermarket.js`)
- [x] Mobile / touch controls support (in-game joystick + Boost/Hop; menu touch UX)
- [ ] More cart customization options
- [ ] Spectator mode / chaos features

### Phase 4 — Netcode & Technical
- [ ] Client prediction improvements (if needed)
- [ ] Explore server-authoritative options
- [ ] Better lag compensation

### Phase 5 — Release Prep
- [ ] Menu overhaul + new name/domain
- [ ] Subtle in-game monetization / ads
- [ ] Performance optimization pass
- [ ] Pre-submission checklist

---

## Completed / Shipped (Historical Record)

### Core Multiplayer & Foundation
- Full modular refactor (main.js thin orchestrator)
- PartyKit server + client handshake
- Multiplayer sync for human carts (host-authoritative)
- NPC fill for empty slots
- Slot sync + non-host respawn fix
- Username system + color picker
- Round structure + HUD (countdown / running / podium)
- Results screen + Play Again + exit portal
- Main menu shell + mode routing
- In-game polish + URL flows + Ready-Up system
- Friend flow + personal stats
- Portal system (exit + return portals)

### Visuals & Environment
- Procedural cart models with caster wheels
- Spawn booths redesign
- Ground plane, pit wall, crowd silhouettes, main stage
- Skybox (stars, nebula, UFOs, planets, horizon fog)
- Crowd lighting + searchlights + point lights
- Stage lasers, fog, ambient light, spindle light
- Record label, void wall gradient, leader glow
- Vibe Jam billboard + in-world exit portal
- Esc overlay + menu integration

### Physics & Gameplay Feel
- Physics tuning (restitution, angularDamping, maxPitchRoll)
- Version 1 driving core restored + tipping behavior
- Ramming system + boosted ramming
- Collision particles, screen shake, trash bursts
- Nitro boost system + visual/audio feedback
- Wheel screech, hop, fall-off, nitro SFX
- Real cart crash sound sample

### Polish & Quality of Life
- Touch controls (in-game) + rotate prompt for mobile
- Mobile detection (replaces old desktop-only blocking)
- Audio system (separate music/SFX volume, procedural SFX)
- Kill feed, score bar, HUD overhaul
- Stats tracking + match history
- Performance fixes (menu perf, refresh stutter, etc.)
- Bug fixes across many sessions (ghost carts, host migration, etc.)
- Console log cleanup + dead code removal

### Stretch / Post-Jam Ideas (Deferred)
- Supabase global stats
- Crazy Carts mode (solo 8 NPCs)
- 5–8 player scaling
- Audio-reactive crowd/lighting
- Volumetric light shafts + better crowd
- Cart faces (sunglasses + expressions)

---

## Notes

- Phase 2 (Polish & Balance) is now complete.
- We are shifting focus to **content and new features**.
- Old session-based tracking has been archived for history.

**Next Task**: Decide on the first item from Phase 3 (recommended: start the new level).
