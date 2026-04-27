Execution order (the plan)
Current status: Steps 1–15 shipped. P0–P2 complete. Most of P3 complete. Deadline: May 1, 2026 @ 13:37 UTC
Handover: docs/session-32-handover.md is the detailed source of truth for Session 32.

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
✅ Vibe Jam billboard ("CURSOR VIBE JAM 2026" pixel-art billboard in crowd area, neon frame, animated text glow, scanlines, accent lights)
✅ In-world exit portal (Rick & Morty green swirl on void pit wall, same-tab navigation to vibej.am/portal/2026)
✅ Esc overlay (MENU screen with controls, resume, quit to menu — game runs behind it)
✅ Main menu controls section updated with Esc key
✅ NPC names randomized from comedy pool per lobby
✅ Portal button fixed (same tab navigation)
✅ Solo auto-start fix (auto-start gated to Quickplay only)
✅ Results screen names (show names instead of player numbers)
✅ Physics tuning: cart restitution 0.4, angularDamping 6.0, pitch/roll angular velocity clamp (maxPitchRoll 1.5)
✅ Closing-speed ram scaling: head-on collisions use relative velocity, maxImpulse 200
✅ Gemini security hardening: 4KB payload limit, 4-cart max validation, rate limiting, localStorage NaN guard, shift over slice, no mid-round respawns
✅ Label disc yOffset fix, color changed to pink/green gradient
✅ Center record spotlight (pink↔cyan cycle)
✅ Void wall gradient (purple top → black bottom)
✅ Leader glow (white pulsing emissive on highest scorer)
✅ Esc menu scoring section (diamond indicators, centered title)
✅ Esc menu and ready button restyled to match results screen
✅ Procedural SFX (Web Audio API): collision impact, nitro boost, fall-off
✅ Separate music/SFX volume: HUD has dual sliders (music + SFX), menu has single music slider
✅ Menu slider layout restored to full width
✅ Friend flow verified working
✅ Personal stats verified wired to real localStorage
✅ Stats placeholder HTML fixed
✅ NPC difficulty bump: 45% player-seeking, faster decision cycle, sharper turning
✅ Physics anti-tumble retuned: maxPitchRoll 1.1, angularDamping 7.5, restitution 0.3
✅ Username storage fix + generator (no number suffix)
✅ Portal system (exit + return portals, vibeverse query params)
✅ Horn replaced with spacebar hop
✅ Volume increased 15%
✅ Console logs cleaned
✅ Stat tracking audited
✅ Refresh stutter fix (host migration freeze)
✅ Kill feed restore, scorebar narrow viewport fix, cart tipping fix
✅ 3 new songs (lazy-loaded, random order, doubled crossfade)
✅ modulepreload hints, TDZ crash fix
✅ NPC difficulty +10%
✅ Wheel screech SFX (procedural bandpass noise)
✅ Volume slider (0-100 display, 0-1.15 gain)
✅ Mobile unblock (menu works on mobile)

Session 31 shipped
✅ Mobile blocked cleanly (toast, no game init, no touch UI)
✅ Audio context gate (resume once)
✅ Fake GLOBAL stats section removed
✅ All debug/diagnostic code removed (TEMP DEBUG, __msgCounts, __debug, __log, frame 10/15 diagnostics)
✅ P1 server security (input spoofing, host hijacking, structuredClone snapshots, input clamping, joinOrder cleanup)
✅ P1 client stability (ghost carts, host migration, lastHitBy, hex padding, audio fade, sort deferred)
✅ P1 cart.js + menu fixes (wheelRoll reinit, bounds checks, interval cleanup)
✅ Cart crash SFX (real .wav sample, pitch/volume scales with intensity)
✅ Nitro boost SFX beefed up (wider whoosh + low thump)
✅ Wheel screech restored after touch cleanup
✅ Crowd cheering SFX (ambient + reactive to knockouts)
✅ Leader chime (one-shot when local player takes lead)
✅ Screen shake on collisions
✅ Trash particle bursts at collision points (40-pool, neon colors)
✅ Post-match slow-mo (3s at 0.35 rate)
✅ FOV punch on local player kills
✅ Neon pulse on boost (cart emissive + trail opacity)
✅ Google Fonts combined into single request
✅ Wheel/hub geometries shared in cart.js
✅ PartyKit preconnect hint
✅ Solo games counter in stats
✅ Cart handle forced black
✅ SFX + music default 50% volume
✅ Play Again auto-starts (3s delay, no re-ready)
✅ GET READY countdown neon styled + centered
✅ Crowd cart variation (energy tiers) + lowered to ground
✅ Searchlight varied speeds + intensity pulsing
✅ Point light wider swing, crowd glow pulsing
✅ Spindle light per-frame Color allocation fixed
✅ Record label lowered (less wheel clipping)
✅ Ready button redundancy removed
✅ Double music playback fix
✅ WebSocket early close handling
✅ Collision sound pitch variation
✅ Dead code cleanup (getSlotColor, firstSpokeReport)

Remaining — Session 32 (pre-submission)

Playtest & verify all Session 31 changes on prod
Fix any regressions found
Final prod playtest desktop + mobile (incognito)
Verify Vibe Jam widget tag + exit portal link

Stretch / Post-jam

Supabase global stats
Crazy Carts mode (8 NPCs solo)
Lag mitigation (interpBufferMs 150→100)
5–8 player scaling
Separate spawn platform with jump onto rotating arena
Post-jam visuals: instanced low-poly crowd with bobbing shader, volumetric light shafts, concentric glowing rings, neon "CART RAVE" sign
Cart faces: sunglasses + smiles (polish bucket)
Audio-reactive crowd/lighting
Arena slope / tiered seating

Known deferred (post-jam)

Quickplay mid-round respawn
Host migration speed-up
Quickplay refresh rejoin
