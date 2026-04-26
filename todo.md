Execution order (the plan)

Current status: Steps 1–15 shipped. Sessions 21–26 polish, SFX, physics tuning shipped.
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

Session 25 shipped
✅ Physics tuning: cart restitution 0.4, angularDamping 6.0, pitch/roll angular velocity clamp (maxPitchRoll 1.5)
✅ Closing-speed ram scaling: head-on collisions use relative velocity, maxImpulse 200
✅ Gemini security hardening: 4KB payload limit, 4-cart max validation, rate limiting, localStorage NaN guard, shift over slice, no mid-round respawns
✅ Label disc yOffset fix, color changed to pink/green gradient
✅ Center record spotlight (pink↔cyan cycle)
✅ Void wall gradient (purple top → black bottom)
✅ Leader glow (white pulsing emissive on highest scorer)
✅ Esc menu scoring section (diamond indicators, centered title)
✅ Esc menu and ready button restyled to match results screen

Session 26 shipped
✅ Procedural SFX (Web Audio API): collision impact, nitro boost, fall-off — Street Fighter style (low thump + crack, not cheesy)
✅ Separate music/SFX volume: HUD has dual sliders (music + SFX), menu has single music slider
✅ Menu slider layout restored to full width
✅ Friend flow verified working (menu shows first with JOIN ROOM button for ?room= links)
✅ Personal stats verified wired to real localStorage (saves on round end, displays on menu)
✅ Stats placeholder HTML fixed (0 instead of fake 12/47/3840)
✅ NPC difficulty bump: 45% player-seeking, faster decision cycle (800-1800ms), sharper turning, more aggressive reverse
✅ Physics anti-tumble retuned: maxPitchRoll 1.1, angularDamping 7.5, restitution 0.3 (middle ground)
✅ Username storage fix: menu saves to localStorage on reroll and edit, loads saved name on init
✅ Username generator: removed number suffix (CARTLORD not CARTLORD42)

Remaining (pre-submission) — Priority Order

Verification pass (priority 1):
Solo single-player: full round, scores save, stats update on return to menu
Quickplay strangers: two browsers connect and play
Hard-refresh ready-up: player hard-refreshes mid-lobby, ready state doesn't break
Stats/history in Solo: multiple rounds, wins/matches/points accumulate correctly

Supabase global stats (priority 2):
Wire real global stats (carts online, total plays) to Supabase backend
Replace placeholder GLOBAL section in menu with live data
Single table, two RPCs (increment plays, count active rooms)

Pre-submission cleanup (priority 3):
Remove all diagnostic console.logs
.cursorrules final update
Final playtest pass

Stretch / Post-jam:
Crazy Carts mode (8 NPCs solo)
Additional music tracks with crossfade rotation
Lag mitigation (interpBufferMs 150→100)
5–8 player scaling

Known deferred (post-jam):
Quickplay mid-round respawn
Host migration speed-up
Quickplay refresh rejoin
