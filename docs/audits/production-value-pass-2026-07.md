# Cart Clash — Production Value Pass (July 2026)

**Role:** Creative Director / Lead Game Designer / Technical Director review
**Frame:** Public Steam demo in 30 days. Player experience only — code quality out of scope.
**Method:** Full playthrough of the working tree (solo flow, menu, overlays), two deep audits
(gameplay feel & juice; UI/UX surfaces), and doc/history review so shipped polish is not re-recommended.

## Where the game stands

Cart Clash's foundation is far stronger than most jam-descended projects: the boot splash is
genuinely production-grade, death VFX (shatter + shockwave) is juicy, the results podium animates
with count-ups and stagger, mobile has safe-area-aware touch controls, and a gamepad can drive the
whole menu. The engineering-readiness pass (July 7) already fixed Safari audio, link previews, and
error reporting.

The gaps are almost all in **moment-to-moment emotional punctuation**: the game's most repeated,
most important actions (getting a KO, winning a match, surviving the final seconds) land without
sound or ceremony, first-time players are never taught the goal, and the brand still says two
different names to the player. Fixing punctuation is cheap and transforms perceived production value.

**The five biggest risks for a Steam demo first impression:**
1. Kills feel weightless — the attacker gets no confirm (no sting, no hitmarker; non-host players don't even get the FOV punch).
2. Victory is silent — the podium animates in with zero audio payoff and no celebration burst.
3. A brand-new player is never told the goal or controls before their first round.
4. The last 10 seconds of a round look identical to the first 10 — no tension curve.
5. The signature mechanic (charge boost) is invisible to keyboard/gamepad players.

---

## The 100 improvements, ranked by expected player impact

Complexity: **S** = under ~1h, **M** = ~1–4h, **L** = multi-session. Priority bands:
**P0** = implement this session · **P1** = next sessions before demo · **P2** = before demo if time · **P3** = post-demo backlog.

### P0 — Implemented this session (1–10)

| # | Improvement | Why it matters | Player impact | Cx |
|---|---|---|---|---|
| 1 | **Attacker kill-confirm feedback** — procedural confirm sting + HUD hitmarker flash + FOV punch on all clients (non-host currently gets nothing) | The single most repeated scoring action has zero positive reinforcement; hook already exists in `gameFlow.js` (host) and `netcode.js:817` (non-host) | Every KO becomes a dopamine hit; the core loop finally "pays out" | S/M |
| 2 | **Victory fanfare + defeat sting + winner confetti at podium** | The match's emotional payoff currently lands in total silence; procedural `spawnTone` idiom already ships (leader chime) so stings are real, not placeholder | Winning finally feels like winning; losses get closure | M |
| 3 | **Last-10-seconds urgency** — timer pulses red, per-second procedural tick | Rounds are 2.5 min; the climax has no tension curve at all (`hud.js updateTimer` has no urgency branch) | Endings become dramatic; players lean in instead of checking out | S |
| 4 | **Sudden Death entry sting** | The most dramatic pacing beat in the game is visually loud (red theme) but audibly silent | The "one fall decides it" moment hits properly | S |
| 5 | **Boost charge meter in HUD** (keyboard/gamepad) | The signature mechanic is invisible — only touch users get any charge indicator (`touchControls.js` flash) | Players can finally time releases and know boost is ready; mechanic mastery becomes possible | M |
| 6 | **Damage-taken impact pulse** — vignette/chromatic-aberration kick on being rammed | Getting hit hard reads the same as a nudge; post-FX uniforms already exist (`scene.js` arcadePass) | Visceral "I got hit" feedback; combat reads through the body, not just the eyes | S/M |
| 7 | **First-run HOW TO PLAY overlay + permanent menu button** | There is no onboarding anywhere; goal/controls are only discoverable via a hover tooltip and the pause screen | New players stop bouncing off their first round confused — critical for a public demo | M |
| 8 | **Brand cohesion: kill the "CART RAVE" remnants** — loading screen title, rotate prompt, in-world billboards, level card | The first-load splash says CART CLASH, then the loading screen says CART RAVE — the game misidentifies itself | The product reads as one deliberate thing; essential for a named Steam page | S |
| 9 | **Mobile landscape fixes** — kill feed vs audio panel overlap; pause AUDIO/CONTROLS collision | Two known, documented layout breaks on the most common mobile orientation | Mobile players stop seeing broken UI mid-match | S/M |
| 10 | **Challenges: honest copy + completion toast + menu badge** | Overlay promises "XP and rewards" that don't exist; completions currently happen silently mid-match | Challenge loop becomes visible and truthful; completions feel earned | M |

### P1 — Highest-priority next work (11–35)

| # | Improvement | Why it matters | Player impact | Cx |
|---|---|---|---|---|
| 11 | Announcer-style event callouts: FIRST BLOOD, DOUBLE KO, REVENGE (center-screen text + sting) | Genre-expected dopamine loop; kill data already flows through `gameFlow.js` scoring path | Kills stop blurring together; sessions generate stories | M |
| 12 | Music ducking on countdown, KO, sudden death, podium | Big moments fight the music instead of cutting through; no duck API exists in `audioManager.js` | Audio mix gains a professional dynamic range | M |
| 13 | Crowd cheer/gasp/roar bed (KO, near-miss, victory) | 5000 animated crowd carts are completely silent — the rave looks hyped and sounds empty | Arena feels alive; wins feel witnessed | M |
| 14 | Lobby roster: player count, per-slot ready ticks, "waiting for N more" | Multiplayer lobby shows only your own ready button; hosts stare at an empty arena with zero feedback | Friends flow stops feeling broken; fewer abandoned lobbies | M |
| 15 | KO hit-stop (~80ms) — solo/host full time-freeze; presentation-only freeze for non-host clients | Slow-mo exists but only for last-cart-standing; needs careful net-safe design (prediction must not pop) | Kills gain physical weight | M |
| 16 | Controller rumble on ram, boost, KO (`vibrationActuator.playEffect`) | Zero haptics in a physics sumo game; no code references exist | Impacts land in the hands | M |
| 17 | Winner spotlight + 3D confetti burst at podium camera orbit | The low-angle victory orbit exists but frames an unadorned cart | Victory lap becomes a screenshot moment | M |
| 18 | Countdown→GO camera punch-in + whoosh | The cinematic orbit just damps back to follow; GO! is text-only | Round start gets a physical kick | M |
| 19 | Cart PATTERN customization tab — feature fully built in `customization.js`, no UI exposes it | A finished cosmetic system is unreachable by players | Free content, already paid for | S/M |
| 20 | Network sunglasses + pattern so friends see your look (`customization.js:422` is local-only) | Customization that others can't see is a silent letdown in a social game | Cosmetics gain social value | M |
| 21 | XP/reward model behind challenges → cosmetic unlocks | Challenges currently pay nothing; retention loop has no spine | The reason to come back tomorrow | L |
| 22 | Results screen shows challenge progress earned that round | The moment of reward is exactly where progress is invisible today | Connects match → progression in one glance | M |
| 23 | Near-miss detection → "CLOSE ONE!" flair + whoosh | Dodging a boosted ram is the best defensive moment and currently reads as nothing | Defense becomes as expressive as offense | M |
| 24 | Hop landing thud + dust puff | Hop has takeoff audio only; the landing is mute | Movement texture | S |
| 25 | Directional damage indicator (hit-from-behind arc) | Players die to unseen hits with no way to learn | Deaths feel fair; skill ceiling rises | M |
| 26 | Final-KO kill cam replay before podium | The match-deciding moment often happens off-camera for half the players | Everyone sees the ending; shareable drama | L |
| 27 | Menu/Settings volume sliders controller-operable (`role=slider`, like pause overlay already does) | Gamepad-only players cannot change volume outside pause | Parity for controller players | M |
| 28 | Detect PlayStation/Nintendo pads → correct button glyphs (currently hardcoded Xbox) | PS players are told to press "A" | Correct hints for ~half of pad users | S/M |
| 29 | Death SFX pitch variation (mirror `playCartCrash` rate randomization) | Repeated deaths sound mechanically identical | Cheap audio variety | S |
| 30 | Charge-boost glow buildup on the cart itself (visible to all players) | Opponents can't read an incoming charged ram; charge state is invisible in-world | Mind-games and counterplay emerge | M |
| 31 | Edge-danger vignette pulse when skidding near the rim at speed | The core death condition (edges) has no proximity feedback | Fewer "cheap" deaths for new players | M |
| 32 | In-world leader crown marker above current leader's cart | Leader bonus point exists (`gameFlow.js:90`) but the leader is unmarked in 3D | Target-the-leader dynamics become legible | M |
| 33 | Score popups in 3D at KO location ("+2" floats up) | Points appear only in the corner score bar, far from the action | Score cause-and-effect becomes spatial | M |
| 34 | Sudden Death lighting shift — arena dims, spotlights on survivors | Red HUD exists but the world doesn't react | The whole scene holds its breath | M |
| 35 | Match point callout ("NEXT KO WINS") when a player is 1 from victory-relevant lead at low time | Creates a broadcast-style climax structure | Watchers and players both feel the stakes | M |

### P2 — Before demo if time allows (36–65)

| # | Improvement | Why it matters | Player impact | Cx |
|---|---|---|---|---|
| 36 | Daily challenge streak counter (day N in a row) | Streaks are the cheapest retention mechanic that works | Habit formation | M |
| 37 | Expanded stats: total KOs, best combo, favorite arena, KO/death ratio | "YOUR STATS" panel has 4 numbers; identity needs more mirror | Self-expression via numbers | M |
| 38 | Fun generated default names + light profanity filter on name entry | Blank-name friction; public demo will produce slurs on the kill feed | Safer, funnier kill feed | M |
| 39 | Live menu background — slow camera drift over the actual arena with NPC carts idling | Menu already renders the 3D scene; a living diorama sells the game before play | First 10 seconds feel premium | M |
| 40 | Animated level-select thumbnails (mini loops instead of static art) | Level cards are text-heavy; arenas are the content | Content variety becomes visible | M/L |
| 41 | "NEW" badge on arenas the player hasn't tried | Players default to level 1 forever | Content discovery | S |
| 42 | Post-match XP bar fill animation (once #21 exists) | The industry-standard "number goes up" beat | Session-end pull | M |
| 43 | Unlockable sunglasses styles gated on wins/challenges | Cosmetics exist but are all free — nothing to earn | Goals beyond winning | M |
| 44 | Attract mode: idle menu ≥60s → NPC-only demo match plays behind menu | Steam demo kiosks/streams show the game playing itself | Zero-effort marketing loop | L |
| 45 | Quickplay bot-backfill messaging ("filling with rivals…") | Players think matchmaking failed when NPCs appear silently | Expectation-setting | S |
| 46 | Friends screen: "COPIED ✓" feedback on invite-link copy | Copy button gives no confirmation | Removes share-flow doubt | S |
| 47 | Friends screen: QR code for instant mobile join | Cross-device parties are the natural browser-game party mode | Couch-to-phone play | M |
| 48 | Room code visible in HUD during friends matches | Late joiners need the host to re-open the menu | Smoother parties | S |
| 49 | After-death spectate follows your killer (with name tag) instead of static death cam hold | Dead time becomes scouting time; also fuels revenge (#11) | Downtime becomes anticipation | M |
| 50 | Kill feed icons — 💥 boost KO, 🕳️ pit, 🌀 combo | Feed rows are text-only; icons compress meaning | Faster battlefield reading | S/M |
| 51 | Combo badge shows progress-to-next-tier arrow | Tiers jump without telegraphing what's next | Chasing tier 3 becomes deliberate | S/M |
| 52 | Colorblind-safe alternate palette for cart/HUD colors | Pure-hue neon palette is rough for deutan/protan players | Accessibility = bigger demo audience | M |
| 53 | Explicit "reduce motion" toggle in Settings (currently media-query only) | Camera shake + FOV punches can be nauseating; OS setting is obscure | Comfort option surfaced | S/M |
| 54 | Separate SFX / music / crowd buses in Settings | One music slider + one SFX slider today; crowd bed (#13) will need its own | Mix control | M |
| 55 | Per-level music assignment (playlist maps to arena mood) | Zanzibar sunset and Backrooms dread share one shuffled playlist | Arena identity doubles | S/M |
| 56 | Backrooms ambience: fluorescent hum + distant rumble bed | The horror-liminal arena is acoustically identical to the rave | Theme lands | M |
| 57 | Zanzibar ambience: ocean + gulls bed | Same — the sunset deck should sound like one | Theme lands | M |
| 58 | Loading screen gameplay tips rotation ("Charge boost by holding SHIFT…") | Loading copy is flavor-only; teaching moment wasted | Passive onboarding | S |
| 59 | "YOU" tag on the local player's score box | New players lose track of which row is theirs | HUD clarity | S |
| 60 | NPC personality intro toasts ("AGGRO the Aggressor rolls in") | Personalities exist (`npcNames.js` badges) but are never introduced | NPCs become characters | S/M |
| 61 | Arena name splash card during countdown ("ZANZIBAR PLATFORM") | Levels are unnamed in-game; countdown has dead visual space | Content is credited | S |
| 62 | Rematch auto-countdown ("Next round in 10…") instead of indefinite host wait | Post-match limbo kills party momentum | Session chaining | M |
| 63 | Menu hover/press SFX pass (verify coverage of all buttons incl. new overlays) | Partial coverage reads as inconsistent craft | Tactile menus | S |
| 64 | Mobile `navigator.vibrate()` pulses on ram/KO | Free juice on Android | Impacts in the hand | S |
| 65 | Interactive 60-second tutorial course (drive, boost, hop, ram a dummy off) | The full answer to onboarding (beyond #7's card) | Mastery on-ramp | L |

### P3 — Post-demo backlog (66–100)

| # | Improvement | Why it matters | Player impact | Cx |
|---|---|---|---|---|
| 66 | Moving arena hazards variant (rotating sweeper on the record) | Replayability via arena dynamism | Fresh runs | L |
| 67 | 2v2 team mode | Most-requested party format in genre | New social mode | L |
| 68 | Party tournament bracket (best-of-N series scoreboard) | Turns a session into an event | Long sessions | L |
| 69 | Persistent leaderboard (Supabase — already on roadmap) | Global competition spine | Ladder chasers | L |
| 70 | Ghost/replay capture + share | UGC flywheel | Virality | L |
| 71 | Emote/horn button (taunt honk) | Social expressiveness in a party game | Laughter | M |
| 72 | Cosmetic cart trails (neon ribbons) | High-visibility cosmetic slot | Earnable flex | M |
| 73 | Seasonal event reskins (holiday arena dressing) | Live-game cadence | Return events | L |
| 74 | Announcer voice pack (recorded or licensed) | Elevates #11 from text to broadcast | Big-game feel | L |
| 75 | Custom room settings: round length, score target, NPC count | Party hosts want control | Replay variety | M |
| 76 | Proper spectator mode UI (camera cycling, scoreboard) | Streams and tournaments need it | Watchability | L |
| 77 | Second cart body model (basket variants) | Silhouette-level customization | Deeper identity | L |
| 78 | Arena time-of-day/weather variants | Content multiplier on existing levels | Perceived content ×2 | L |
| 79 | Podium photo mode (pause orbit, hide UI, save PNG) | Players market the game for you | Shareables | M |
| 80 | Twitch chat votes on arena hazards | Streamer catnip | Discovery | L |
| 81 | PWA install prompt at the right moment (after 2nd match) | Home-screen icon = retention on mobile | Re-entry path | S/M |
| 82 | Gamepad button remapping | Accessibility + preference | Comfort | M |
| 83 | Keyboard remapping (Settings notes it's unsupported) | AZERTY/dvorak players currently suffer | Comfort | M |
| 84 | Localization pass (ES/PT/DE/FR/JA) | Steam demo traffic is global | Market reach | L |
| 85 | Screen-reader/ARIA-live announcements for kill feed + round events | A11y baseline beyond menus | Inclusion | M |
| 86 | Auto-quality tuner (frame-time watchdog steps quality down/up) | Low-quality toggle is manual; first impression on weak GPUs is a stutter | Smooth first minute everywhere | M/L |
| 87 | Steam wrapper (Electron/Tauri) with proper icon/pause behavior | The actual Steam demo shell | Shippability | L |
| 88 | Steam achievements design (map to challenge events already tracked) | Expected demo/store feature | Completionists | M |
| 89 | Cloud save for cosmetics/stats (account-lite) | localStorage wipes erase identity | Trust in progression | L |
| 90 | Bot difficulty selector for solo (chill/normal/ruthless) | One difficulty fits no one | Broader skill funnel | M |
| 91 | Sandbox practice arena with ramp targets + respawning dummies | Lab for mechanics mastery | Depth for grinders | L |
| 92 | In-world billboard displays live kill feed / leader name | Arena reacts to the match story | World-match cohesion | M |
| 93 | Dynamic music stems (intensity layers ramp with kill pace) | Adaptive audio is the premium-feel multiplier | Invisible drama engine | L |
| 94 | End-of-match superlatives ("MOST KOS", "PACIFIST", "CLUTCH") | Everyone gets a story line, not just the winner | Losers laugh too | M |
| 95 | Handle badges from weekly challenge completions (name flair) | Social proof of investment | Status loop | M |
| 96 | Menu Easter egg (Konami code → disco cart) | Community discovers, screenshots, shares | Delight | S |
| 97 | Share-card PNG of match results (canvas render → download/share) | Results screen is the natural share artifact | Word of mouth | M |
| 98 | Anonymous FTUE funnel telemetry (boot→menu→first match→second match) | You can't tune a demo you can't measure | Data for every item above | M |
| 99 | Roll challenge pool to 12+ entries with variety (travel distance, air time, near-misses) | Pool is small; regulars will see repeats fast | Fresh dailies | M |
| 100 | Demo end-screen: wishlist/Discord call-to-action after N matches | The entire point of a Steam demo | Conversion | S |

---

## Deferred-by-design this session

- **Hit-stop (#15)** — needs a net-safe design (host time-scale would pop non-host prediction); deserves its own session.
- **XP/progression (#21)** — a real economy design, not a patch; challenges copy was made honest instead.
- **Crowd audio / music ducking (#12, #13)** — needs sourced or carefully-built audio beds; procedural tones would cheapen these specific sounds.
- **Lobby roster (#14)** — touches ready-up flow near netcode; safe but deserves undivided attention.
- **Announcer callouts (#11)** — high value, medium size; first candidate for the next session together with #12.
