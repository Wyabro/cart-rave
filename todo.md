Execution order (the plan)
Current status: Steps 1–15 shipped. Sessions 21–23 visual polish and fixes shipped. Session 24 in progress.

✅ Deploy to cartrave.lol via Vercel
✅ PartyKit server + client handshake
✅ Procedural cart models with caster wheels
✅ Multiplayer sync for 2 human carts (host-authoritative, 60Hz input, 20Hz transforms)
✅ NPC fill for empty slots
✅ Slot sync + non-host respawn fix
✅ Vibe Jam widget tag in index.html (jam compliance)
✅ Round structure + HUD overlay: countdown/running/podium loop + timer/scores/status
✅ Results screen: final scores, Play Again, Vibe Jam exit portal link, match history
✅ Menu shell (DOM, CSS/SVG background, mode buttons, username, volume/mute, mobile detection)
✅ Mode routing + color picker (server-gated, atomic slot assignment, 5 colors, neonOrange)
✅ In-game polish + URL flows / Ready-Up System
✅ Menu integration + audio (Sessions 14–19)
✅ Username system (Session 19)
✅ Spawn booths: per-booth colors, trusses, DJ gear, neon edges, platforms

Session 21–23 shipped

✅ Ground plane, pit wall, crowd silhouettes, main stage with animated spotlights
✅ Multiplayer slot hijacking fix, mobile gate, quickplay auto-continue, fallback username, mid-round join auto-ready/respawn
✅ HUD overhaul (menu-matching fonts/glassmorphism)
✅ Crowd lighting (32 point lights, glow spheres, ground plane, MeshBasicMaterial)
✅ Stage laser visibility (3x radius, higher opacity)
✅ Fog density reduction (0.018→0.006)
✅ Ambient light purple tint
✅ Skybox (stars, nebula, UFOs, planets, galaxy sprites, horizon fog)
✅ Cart faces (sunglasses + mouth, isFace guard)
✅ Spawn booth redesign (neon strips, diamond accents, DJ gear, speaker trim)
✅ DJ screen logo (animated CART RAVE canvas with glow + scanlines)
✅ Spawn platform fog puffs
✅ HUD audio widget glow
✅ Score box auto-width for long usernames

Session 24 shipped

✅ Vibe Jam billboard ("CURSOR VIBE JAM 2026" pixel-art billboard in crowd area, neon frame, animated text glow, scanlines, accent lights)
✅ In-world exit portal (Rick & Morty green swirl on void pit wall, same-tab navigation to vibej.am/portal/2026)
✅ Esc overlay (MENU screen with controls, resume, quit to menu — game runs behind it)
✅ Main menu controls section updated with Esc key
✅ NPC names randomized from comedy pool per lobby
✅ Portal button fixed (same tab navigation)
✅ Solo auto-start fix (auto-start gated to Quickplay only)
✅ Results screen names (show names instead of player numbers)

Remaining (pre-submission) — Priority Order
Physics & Collision Tuning (priority 1 — critical):

Head-on collision bounce/impact — carts need better bounce behavior on direct hits
Hole radius audit (12-13% vs 15-20%)
NPC hole awareness
General physics feel tuning

Quick Visual Wins (priority 2 — easy ships):

Center record spotlight: one mellow color-shifting PointLight in the center of the record
Void wall gradient: purple at top fading to black at bottom of pit
Scoring explanation: display scoring rules somewhere accessible (menu, Esc overlay, or in-game)

Sound Design (priority 2):

Add sound effects: collision impacts, nitro boost, fall-off, and any other gaps

Essentials — need playtesting (priority 3):

Friend flow fix: friends opening room link should see menu first
Stats tracker: main menu global stats are cosmetic/placeholder — wire up to real localStorage values
Verify: Solo single-player, Quickplay strangers lobby, stats/history in Solo, hard-refresh ready-up bug

Post-essentials (priority 4):

Pre-submission cleanup + playtest
.cursorrules final update

Stretch / Post-jam:

Crazy Carts mode: second solo mode with 8 NPCs for chaotic gameplay
Stats fix if deeper issues found
Lag mitigation
Supabase leaderboard

Known deferred (post-jam):

Quickplay mid-round respawn
Host migration speed-up
Quickplay refresh rejoin
