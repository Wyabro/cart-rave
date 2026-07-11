# Production Pass 3 — UI, UX & Presentation (2026-07-10)

Goal: every non-gameplay screen speaks the HUD's "pigment on vinyl" sticker language
(see docs/archive/session-notes/hud-art-direction-2026-07-09.md). Presentation only —
no gameplay/balance/perf work.

## Audit synthesis (3 discipline audits, 2026-07-10)

The sticker language lives ONLY in hud.css / announcer.css / icons.js. Everything else
is the pre-redesign glass-blur-glow look. Headline findings:

- **Material**: backdrop-filter + translucent surfaces + neon borders + resting glows on
  every menu/overlay panel. Zero die-cut/ink usage outside HUD.
- **Fonts**: boot splash + rotate prompt still use retired Bungee/Space Mono. All
  sub-screen/dialog titles use Russo One instead of Road Rage (customize, overlay,
  friends, pause `.esc-title`; `--esc-display` defined but unused).
- **Buttons**: 3 parallel systems (.cr-btn w/ corner brackets + shimmer, .esc-btn,
  .results-btn) — different radii, glows, hovers.
- **Color grammar**: magenta used as workhorse everywhere (menu buttons, stats, titles);
  spec says magenta = celebration only, yellow = retail workhorse.
- **Exits**: every screen close is an instant display:none cut after an animated
  entrance (customize/howto/challenges/settings/pause/results) — biggest "unfinished" tell.
- **Responsive**: 4 divergent breakpoint scales; friends panel has NO overflow protection
  or media rules; mobile menu = 7+ stacked sections in one scroll column; challenges has
  no mobile/landscape tuning; results has no non-touch width fallback; safe-area-insets
  missing on overlay panels + loading.
- **Tokens**: pauseOverlay/results/loading CSS use 0 spacing/color tokens; results.css
  re-declares brand hexes 8×; ~173 hardcoded px remain in cart-rave-menu.css.
- **Reduced motion**: cart-rave-menu.css and results.css have zero guards for their
  CSS ambient loops (JS entrances are centrally guarded via animations.js).
- **Icons**: icons.js glyph set unused outside HUD; overlays use emoji/text diamonds.

## Shared spec (source of truth for all waves)

Foundation (implemented in this pass):
- tokens.css: sticker die-cut recipes promoted to :root (`--sticker-micro/chip/panel`
  + new `--sticker-billboard`), hazard-stripe gradients, breakpoint contract
  (≤1024 tablet, ≤768 or coarse = mobile, ≤380 tiny; pointer:coarse is an orthogonal axis).
- ui/styles/stickers.css: shared components — `.cc-panel`, `.cc-chip`, `.cc-btn`
  (+ `--primary/--secondary/--ghost/--danger`), `.cc-title` (stack-A lettering),
  `.cc-kicker`, `.cc-meter` (+ hazard variant), paint-order fallback. Imported once in
  main.js next to tokens.css.

Rules for every screen:
1. Panels: opaque `--color-ink`, die-cut white contour, hard offset shadow. No
   backdrop-filter, no resting glow. Backdrop scrims: flat rgba black, no blur.
2. Titles: Road Rage stack-A (sticker-white fill, ink stroke via paint-order,
   2-step hard extrude). Bungee stays ONLY as the HUD numeral font.
3. Buttons: one `.cc-btn` recipe. No corner brackets, no shimmer sweep. Hover =
   lift + edge thickening; press = down-right shadow collapse (sticker pushed flat).
4. Color roles: yellow = workhorse/emphasis; magenta = celebration moments only;
   cyan = small printed accents; red only with hazard geometry. Gradient meters
   (magenta→cyan) → flat fills or hazard stripes.
5. Motion: SLAP `cubic-bezier(0.1,0.9,0.2,1)`, travel in first 30–45%, outBack settle,
   inBack anticipation exits. Every open gets a close. Reduced-motion guards mandatory.
6. Icons: pull from icons.js (crown, KO burst, wheel) instead of emoji/text glyphs.
7. `◆`/`◇` kicker = game-wide brand mark, keep.

## Waves

1. **Material migration** (parallel agents, disjoint files):
   A: cart-rave-menu.css + index.html boot CSS + rotatePrompt.js — material,
      fonts, color grammar, panel-tree consolidation (friends/customize →
      .cr-overlay-panel modifiers), reduced-motion guards.
   B: pauseOverlay.css + results.css + loadingScreen.css — material, token adoption,
      Road Rage titles, winner emphasis, reduced-motion guards.
2. **Responsive**: breakpoint standardization, mobile menu scroll reduction, friends/
   challenges/customize landscape rules, results width fallback, safe-area insets.
3. **Main menu showcase**: attract-mode animated background investigation + boot→menu
   handoff.
4. **Presentation**: exit animations (JS), SLAP retunes (animateMenuCardEnter 420ms),
   results exit beat, backdrop fades, icons.js wiring.
5. **Validation**: 5 viewport classes, npm run check + build, commit.

## Status

- 2026-07-10: ALL WAVES SHIPPED (commits 7d37263, bdd33cc, + validation fixes).
  Verified in-browser: menu/customize/settings/challenges/friends/pause at
  desktop 1280, mobile portrait 390×844, mobile landscape 844×390; attract
  mode live (solo→quit→menu path, arena swap on level pick, liminal/sunset
  ambience). Gates green throughout (tsc, 208 vitest, knip, build).
- Attract-mode notes: menu backdrop = .cr-root::before (fades to 0.42);
  ui/menuAttract.js self-gates (worldCold/menuHidden/tabHidden/bootPending —
  DEV probe: window.__menuAttractDebug). Idle warm skips hidden tabs, so the
  Browser pane needs ?perfPump + a solo→quit cycle to see it.
- Pending human checks: real-phone pass (Safari paint-order, safe-areas,
  touch coarse rules), results/podium visual after a full match, attract-mode
  perf feel on Wyatt's HW (postFX flicker bug is dodged only on Low tier's
  direct path; composer path unchanged), two-browser multiplayer screens.
- Deferred (see final session report): results-screen icons.js wiring,
  pause-overlay information-density redesign, full token sweep remainder
  (~150 px values), friends title alignment nit, ambient level.update()
  animation during attract, SOON-tab treatment in customize.
