# HUD Redesign — "Saturday-morning cartoon deathmatch" (2026-07-09)

All six phases of the approved HUD redesign plan (`~/.claude/plans/cart-clash-cheeky-hamming.md`) are implemented and uncommitted on `cart-clash`.

## What shipped

**Phase 1 — Tokens & type**
- `src/ui/styles/tokens.css` — single design-token source (lifted from the menu `:root`), loaded via JS imports in `main.js` and `hud.js`. NOTE: rolldown-vite resolves CSS `@import` paths against the project root, so CSS-level imports of it break — always import from JS.
- HUD fonts consolidated to Bungee (display numerals) / Russo One (UI) / Goldman (meta). Michroma, Space Grotesk/Mono removed from HUD; nametags moved to Russo One.
- Legacy pure-neon hexes (`#ff00ff` etc.) replaced; dead `data-hud-color` fallback rules deleted.
- `--hud-player-accent` — HUD "you" accent derives from the local cart color (min-luminance clamp in `hud.js clampAccentLuminance`). Drives ready button, score float, hitmarker tint.
- FPS meter gated behind `import.meta.env.DEV` (`frameVisuals.js`).

**Phase 2 — Regions & Center Stage**
- Six region containers in `#hud` (`hud-region-match/standings/events/stage/pod/utility`); children are static inside them. Media queries retarget regions.
- `src/ui/centerStage.js` — one-moment-at-a-time arbiter for the stage band: announcer (pri 3, replaces same-kind) > toast (pri 2, queues ≤2 then drops). Announcer display and `showChallengeToast` route through it.
- Audio widget demoted to mute-only (sliders live in the esc overlay); `detectTightHudSpace()` rect probing deleted.
- Score float re-anchored to screen center (below hitmarker), out of the stage band.

**Phase 3 — Element redesign**
- Scoreboard → separate sticker chips: 4px cart-color edge stripe, flat dark panels; glow only on `.isLocal`/`.isLeader`; YOU chip ~15% larger; rank-swap pulse animation.
- `src/ui/icons.js` — single-style inline-SVG glyph set (~13 glyphs, `svgIcon(name)`); replaced 👑/♪/☰ emoji.
- Kill feed: 4 rows max, KO-burst / dizzy icons, expanded verb pools (crits: STEAMROLLED/OBLITERATED/FLATTENED; kills +LAUNCHED/BODIED/PUNTED; self +FORGOT THE BRAKES/TOOK A SHORTCUT/LEFT THE CHAT).
- Timer: Bungee numeral, pill progress bar.

**Phase 4 — Personality & host**
- `PERSONALITY_META` (npcNames.js) — icon/color/label single source; letter badges (`[A]…`) gone. Icons on scoreboard chips AND 3D nametags; countdown intro shows icon + personality word, collapses at GO (nametags now refresh per frame, diff-gated).
- Host = plain antenna glyph (neutral white) on chip / nametag / kill-feed rows / results button. Hidden in solo/testdrive (`hostGlyphEligible`). `netcode.js getHostId()` added.
- Host migration announces `new_host` ("NEW HOST — {name} HAS THE WHEEL!") from netcode's `MSG.hostMigrated` handler — no longer silent.
- `hud-conn` RECONNECTING pill driven by new `netcode.getConnectionState()` (socket close/error after hello → "reconnecting", open → "ok"). Ping-based pips NOT built — no RTT source exists in netcode yet (follow-up if wanted).

**Phase 5 — Dedicated mobile HUD** (`#hud.hud-touch` selectors, not width queries)
- Timer pill top-left, kill feed (2 rows) beneath it, ultra-compact chip strip (rank+score) top-right beside utility; thumb corners HUD-free. The ≤900px bottom dock now applies to non-touch (narrow desktop) only.
- Boost charge paints the BOOST touch button itself (`touchControls.updateBoostRing`, called from `hud.updateBoostWidget`), same color grammar as the desktop meter.

**Phase 6 — Motion**
- Countdown digits stamp (1.4→0.95→1) with alternating magenta/cyan accents.
- KO'd player's chip: desaturate dip + wobbling dizzy stars (~1s), fired from `killFeedReactor` → `hud.noteChipKO`.
- Critical-class announcer callouts get a 140ms chromatic edge flick.
- Reduced-motion parity: all new animations guarded (JS matchMedia or the CSS reduce block).

## Verification done
- Solo end-to-end in the Vite preview (multiple matches): countdown → running → last-call urgency tiers, announcer stamps, sticker chips, personality icons, feed verbs/icons, mute icon, mobile layout at 812×375 (forced `hud-touch`).
- `tsc --noEmit`, `vitest` (129 passing), `knip` (same 5 pre-existing findings as HEAD), `vite build` — all clean.

## Still needs human eyes
1. **Two-browser multiplayer**: host antenna on chips/nametags/feed, kill host tab → "NEW HOST" callout + glyph moves, RECONNECTING pill (kill wrangler mid-match).
2. **Real phone over LAN**: touch layout, boost-button fill, safe areas, rotate prompt (remember 127.0.0.1 for wrangler).
3. **Taste pass**: chip glow levels, Bungee timer sizing, countdown stamp feel, dizzy stars.
4. Countdown personality-intro moment (icon + word → collapses at GO) — implemented but not visually caught in preview (rAF-throttled pane).

## Deliberately out of scope (plan Phase 7 candidates)
Pause overlay + results overlay restyle onto the token system; menu convergence; RTT-based connection pips.
