## Execution order (the plan)

Current status: Steps 1–15 shipped. Session 22 additions shipped: multiplayer slot hijacking fix, mobile gate (client + server), quickplay auto-continue (commit 468dbe9), fallback username (commit 0376e55), mid-round join auto-ready (commit 4f16c2d), mid-round join respawn (commits 7e68573, fd2d663 — working for Friends, broken for Quickplay mid-round, deferred), stage lasers, crowd searchlights, pulsing crowd lights, crowd cart MeshBasicMaterial. Environment from Session 21 shipped: ground plane, pit wall, crowd silhouettes, main stage with animated spotlights.
1. ✅ Deploy to cartrave.lol via Vercel
2. ✅ PartyKit server + client handshake
3. ✅ Procedural cart models with caster wheels
4. ✅ Multiplayer sync for 2 human carts (host-authoritative, 60Hz input, 20Hz transforms)
5. ✅ NPC fill for empty slots
6. ✅ Slot sync + non-host respawn fix
7. ✅ Vibe Jam widget tag in index.html (jam compliance)
8. ✅ Round structure + HUD overlay: countdown/running/podium loop + timer/scores/status
9. ✅ Results screen: final scores, Play Again, Vibe Jam exit portal link, match history
10. ✅ Menu shell (DOM, CSS/SVG background, mode buttons, username, volume/mute, mobile detection)
11. ✅ Mode routing + color picker (server-gated, atomic slot assignment, 5 colors, neonOrange)
12. ✅ In-game polish + URL flows / Ready-Up System (Esc overlay, Quit to Menu, shared-URL flow, portal bypass, server-driven start)
13. ✅ Menu integration + audio (Sessions 14–19)
    - Menu buttons wired (Solo, Quickplay, Friends, Portal)
    - Color picker wired to game cart color system
    - Volume/mute wired from menu to game audio
    - Menu music (`sounds/menu.mp3`) with 2-second crossfade
    - Default volume 25%
    - In-game HUD volume/mute widget (top-right)
    - Green swirly portal button on menu (Rick-and-Morty style)
    - Friends invite screen (room link auto-copy + copy button + enter game + back)
    - Friends link cleaned to `?room=` only
    - Favicon added
14. ✅ Username system (Session 19)
    - Username sent with join message
    - localStorage sync via MutationObserver
    - 3D floating name labels above all carts (player + NPCs)
    - Name labels update on slot changes via `updateNameLabelsRef` pattern
    - HUD score boxes show names instead of P1/P2/P3/P4
    - Timer moved to top-left to avoid HUD audio widget overlap
    - Null cart crash guard added
15. ✅ Spawn booths: per-booth colors, trusses, SPAWN BOOTH text, DJ gear, neon edges, platforms close to arena with gap (no ramp)

### Remaining (pre-submission) — Priority Order

**Visual Polish (priority 1):**
- HUD overhaul: restyle all in-game HUD elements (ready-up UI, countdown, score boxes) to match menu visual style
- Crowd lighting: crowd area too dark, add more lights to illuminate crowd carts
- Stage lasers: currently thin/hard to see, increase visibility
- Crowd carts: colors present but dim/underwhelming, improve brightness
- Sky/skybox: add space nebula theme with stars and occasional UFOs
- Spawn platform fog: low-lying fog rolling off spawn platforms
- Cart faces: add stylized mouths and sunglasses as eyes to player carts
- Spawn booth redesign: replace current booth with more intricate/detailed design
- DJ screen logo: place Cart Rave logo on the void DJ screen
- Vibe Jam billboard: add billboard somewhere in arena background
- In-world exit portal: driveable "Enter Portal" object in the arena, navigates to https://vibej.am/portal/2026 (same tab)

**Physics Tuning (priority 2):**
- Step 20: hole radius audit (resolve 12-13% vs 15-20%), NPC hole awareness, spotlight count/colors, general physics feel tuning

**Essentials (priority 3):**
- Esc overlay: never built — implement per spec (controls section, volume slider, mute toggle, resume button, quit to menu)
- Step 16: Results screen names — show names instead of player numbers
- Step 17: Friend flow fix — friends opening room link should see menu first
- NPC names: randomize from comedy pool per lobby, not static
- Portal button: results screen portal should navigate same tab, not open new tab
- Verify: Solo is strictly single-player, Quickplay drops into strangers lobby, results screen stats work in Solo, match history works in Solo, hard refresh ready-up bug status

**Post-essentials (priority 4):**
- Step 22: Pre-submission cleanup + multiplayer playtest checklist
- .cursorrules update with final state
- Step 18: Stats tracking fix if broken (cut candidate)
- Step 19: Lag mitigation (cut candidate)
- Step 23: Supabase leaderboard (stretch)