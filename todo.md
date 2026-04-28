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

Session 32 shipped
✅ Firefox import map fix (merged two importmap blocks into one, first child of <head>)
✅ Menu perf: step() early-return when menuVisible
✅ Menu perf: particle count reduced (20+intensity*4 → 12+intensity*2)
✅ musicStarted reset to false in showMenu()

Remaining — Session 33 (pre-submission)

BUGS — Must fix before submission:

1. advanceGameMusicTrack broken guard: Session 32 added `!musicEl.paused` check that prevents play() from ever firing (pause() is called earlier in the same function). Revert to `if (!menuVisible)`. This also likely causes music stopping entirely after several matches.
2. Host cart visually frozen in friend mode: host's own screen shows their cart frozen while non-host sees it moving. Suspected slot/connId mismatch — camera follows wrong cart while physics drives correct one. Debug next playtest with console: youConnId, hostId, isHost, netSlots.
3. Solo mode stat tracker not updating correctly in the menu.
4. Record label has dropped into the floor and is no longer visible — needs Y offset adjustment.
5. Crowd carts partially sunk into the plane they sit on — needs Y offset adjustment.
6. Cart handles still not black (unfixed across multiple sessions).

POLISH — Fix before submission:

7. Ready button redundancy: "Ready" and "Ready!" buttons are functionally redundant. Either hide/remove the redundant one, or rename the first to "READY UP!".
8. Menu instructions: add that the leader glows white, fix formatting to match rest of menu design.

PRE-SUBMISSION CHECKLIST:

- `git add -A && git commit -m "submission" && git push && npm run ship`
- Fetch production main.js and grep remotely to verify deploy
- Load cartrave.lol in incognito — full playthrough
- Mobile check: menu loads, toast works, no crash
- Verify Vibe Jam widget tag in index.html
- Verify exit portal links to vibej.am/portal/2026

UPDATE .cursorrules to reflect current state after fixes are applied.

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
