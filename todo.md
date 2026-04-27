Execution order (the plan)
Current status: Steps 1–15 shipped. Sessions 21–30 polish, SFX, physics tuning, music, mobile touch shipped.
Deadline: May 1, 2026 @ 13:37 UTC
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
Session 27–29 shipped
✅ Portal system (exit + return portals, vibeverse query params)
✅ Horn replaced with spacebar hop
✅ Volume increased 15%
✅ Console logs cleaned
✅ Stat tracking audited (working correctly)
✅ Refresh stutter fix (host migration freeze)
Session 30 shipped
✅ Kill feed restore (hud.feed.style.display fix in updateHud)
✅ Scorebar narrow viewport fix (media query ≤900px)
✅ Cart tipping fix (maxPitchRoll: 0.99, angularDamping: 8.25)
✅ 3 new songs (song2-4.mp3), lazy-loaded, random order, doubled crossfade duration
✅ modulepreload hints for three.module.js + partysocket
✅ Removed eruda/widget.js preload warnings
✅ Fixed lazyGameMusicPreloads TDZ crash
✅ NPC difficulty +10%
✅ Wheel screech SFX (procedural bandpass noise, per-cart cooldown)
✅ Volume slider (0-100 display, 0-1.15 internal gain)
✅ Mobile unblock + touch controls (menu works, game black screen — see P0)

Remaining — Session 31+ (Priority Order)
P0 — Must fix before submission

 Mobile: decide allow or block. If allow → fix black screen + keep touch. If block → remove touch UI entirely. Resolve inconsistency.
 Audio context gate: ensure AudioContext.resume() tied to first user click only
 Supabase global stats — OR nuke fake GLOBAL section entirely before submit
 Remove all remaining debug/diagnostic logs
 Verify menu stats read real localStorage (not placeholder/fake)
 Final prod playtest on desktop + mobile

P1 — Security & correctness fixes
Server (party/index.ts) — bundle into 1-2 deploys

 Input spoofing: force data.connId = connection.id in MSG.clientInput handler
 Host hijacking: guard hostTransform/hostRound/hostEventFall with if (connection.id !== this.#hostId) return
 Clear #carts on MSG.playAgain (stale state for mid-round joiners)
 Clone #carts in snapshots via structuredClone (mutation risk)
 Clear #countdownTimerHandle on host disconnect
 Clamp client input values (throttle/steer) before relaying
 Clean reaped connection IDs from #joinOrder

Client (main.js) — batch fixes

 Ghost carts: cleanup remoteInputsByConnId on disconnect (delete connIds not in current slots on MSG.slots)
 Host migration: reset #lastSeq to -1 on host reassignment + clear netStateBuffer when becomingHost
 Clear lastHitBy map on rematch reset
 Clear pendingMidRoundJoinRespawnConnId on podium phase
 Use performance.now() consistently for respawnAtMs (not Date.now())
 Fix hex color padding: Math.floor(rgb).toString(16).padStart(6, "0")
 Audio fade interval: track active interval, clear before starting new one
 Sort-in-hot-loop fix (main.js:396) — defer to cleanup pass

Client (cart.js)

 resetCartVisualState: reinitialize wheelRoll array length from wheelPitchObjects.length
 updateCartVisuals: add bounds check if (i >= data.wheelRoll.length) break

Menu (cart-rave-menu.js)

 Bounds check saved color index against palette.players.length
 Stop stats interval when menu hidden
 Stop animLoop requestAnimationFrame when menu hidden

Touch input

 Add joystick deadzone (0.15 threshold)

P2 — SFX & juice

 Crowd cheering (procedural Web Audio, ambient/reactive)
 Leader power-up noise (subtle hum tied to 1st place)
 Crash/impact sounds (collision-triggered, heavier than existing SFX)
 Hit-stop: freeze renderer 50-100ms on high-impulse collisions (skip renderer.render(), keep physics/network running)
 DOM screen shake: CSS transform keyframe on canvas container, triggered on big impacts
 Trash particle bursts: pool of 20 unlit cubes, snap to impact point, shoot outward, scale to zero over 0.5s
 Slow-mo on final kill: 0.3s half-speed rendering on last elimination
 Cart trail/afterimage: BufferGeometry line sampling position every few frames
 Neon pulse on boost: flash cart emissive bright during nitro
 Elimination zoom: quick FOV punch (narrow → snap back, ~200ms) on knockoff

P3 — Polish & perf (if time permits)

 Combine Google Fonts into single request
 Share wheel/hub geometries across carts in cart.js
 Add <link rel="preconnect"> for PartyKit host
 Audio resume flag: skip redundant unlockAudioAndMaybeStartMusic calls after first success
 Arena slope (outer crowd area subtle incline)
 Solo games played counter in stat trackers

Stretch / Post-jam

Crazy Carts mode (8 NPCs solo)
Lag mitigation (interpBufferMs 150→100)
5–8 player scaling
Separate spawn platform with jump onto rotating arena
Post-jam visuals: instanced low-poly crowd with bobbing shader, volumetric light shafts, concentric glowing rings, neon "CART RAVE" sign
Cart faces: sunglasses + smiles (polish bucket)

Known deferred (post-jam)

Quickplay mid-round respawn
Host migration speed-up
Quickplay refresh rejoin
