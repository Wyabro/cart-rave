# Fight Night UI Redesign — Session Handover

> Working doc for continuing the "Fight Night" UI redesign. Read this, then the
> **authoritative plan**, then `git log` on the branch, then verify current state.

## TL;DR

- **Branch:** `redesign/fight-night-ui` (off `cart-clash`). Everything below is committed there, **unpushed**.
- **Authoritative plan:** `C:\Users\wyatt\.claude\plans\c-users-wyatt-downloads-game-menu-ui-re-snazzy-floyd.md`
  (full 3a/6a/7a–7g specs, locked decisions, verification, risks). This handover is the *progress log*; the plan is the *spec*.
- **Design source:** `~/Downloads/Game Menu UI Refinement.zip` → `design_handoff_main_menu/README.md` +
  `Menu Redesign Concepts.dc.html`. The README's 7a–7g section carries the per-screen prose; the
  `.dc.html` carries the exact measurements. Extract it — the plan does *not* restate every number.
- **State: every surface is built — 7a–7g, 6a HUD, 3a main menu, and both loading screens.** What
  remains is the **owed verifications** below, all of which need a real browser and a real match.
- **The loading screens were outside the design source** (it covers 3a / 6a / 7a–7g only). Don't go
  hunting for a mock — their language is derived from the shared shell, screen by screen.
- **Verification caveat:** the Browser pane **won't composite screenshots on this host** → everything
  was verified via DOM + computed-style + scripted-interaction introspection, **never by eye**. Only
  7a, 7c and 3a have had a visual sign-off (Wyatt looked at those in a real browser).

## Screen status

| Screen | State |
|---|---|
| 7a Customize | ✅ rebuilt + Wyatt-approved ("looks and works great") |
| 7c Settings | ✅ rebuilt + reviewed — chips resized, keycaps slabbed, remapping notice dropped |
| 7b Challenges | ✅ rebuilt — 2-col price-tag grid, live restock kicker |
| 7d How To | ✅ rebuilt — three aisle tags across + SCORING / FULL CONTROLS strips |
| 7g Results | ✅ rebuilt + reviewed — podium left / receipt right, ledger cut, YOU pill, spill + challenge lines |
| 7e Friends | ✅ rebuilt — invite chrome on the shell + full-screen CHECKOUT LINE lobby (netcode seam untouched) |
| 7f Pause | ✅ re-laid out + **three review rounds with Wyatt** — the only screen that stays a centred panel (860px) |
| **6a HUD** | ✅ reworked in 3 cuts + 2 review rounds — top strip, standings, feed, nameplates, boost, coupon, clock |
| **3a Menu** | ✅ diffed to its mock + reviewed — hover skew/ring, title lean + size, NEW pill, plate buttons, hint bar, arena picker |
| **Loading** | ✅ boot splash + mode-entry overlay onto the shell — **no mock exists for these**, the language is derived from `.cr-screen` |

## ⚠️ READ FIRST — seven traps that have each bitten more than once

### 1. Retired CSS beats the new shell on source order

Same specificity (one class each), old rule sits **later in the file** → it wins. Seen five times:

1. `.cr-customize-tabs { display: grid }` beat `.cr-screen-rail` → PATTERN tab landed under the cart preview and ate its clicks (`0d20900`).
2. `.cr-settings-section` beat `.cr-screen-card` → settings boxes kept the retired white die-cut contour (`6a1757a`).
3. `.cr-challenges-list` would have beaten `.cr-screen-panels` — caught by deleting it first (`2e5c625`).
4. `.cr-btn` / `.cr-mute-btn` **responsive-band** rules beat `.cr-settings-chip` → POST-FX went full width on phones and MUTE ALL squeezed its own icon to 0px (`c603119`).
5. Band rules on `.cr-screen-panels` (1 col ≤768, 2 again in landscape) beat `.cr-howto-body` → a strip rendered *beside* the aisles at 812×375 (`561007d`).

**Rules that follow from this:** when you rebuild a screen, **DELETE its old modal CSS** — don't layer
over it. And when you override a **shared shell class** (`.cr-screen-panels`, `.cr-btn`,
`.cr-settings-chip`), use a **two-class selector** (`.cr-screen-panels.cr-xxx-body`) so no
single-class band rule can outrank it wherever it sits in the file.

### 2. The shared checkout will silently eat your edits

A second agent session works in this same working directory. During this session it:

- committed `src/main.js` while my work was in flight, **sweeping two of my lines into its commit** (`f1e995b`);
- **clobbered an entire edit of mine** (the podium YOU pill) by writing `main.js` from its own buffer.

So: **never `git add -A`**, commit by explicit path, and **`git diff` your own files right before
committing** to confirm your edits are still there. If a shared file (`main.js`) is dirty with
someone else's work, stage only your hunks:

```bash
git diff -U3 src/main.js | awk '/^diff |^index |^--- |^\+\+\+ /{print; next} /^@@/{keep=($0 ~ /^@@ -3377,7/); if(keep)print; next} keep{print}' > /tmp/mine.patch && git apply --cached /tmp/mine.patch
```

The pre-commit hook also sweeps regenerated `docs/BRIEFING.md` + `docs/ARCHITECTURE.json` in — that's expected.

### 3. What the Browser pane lies about

The pane runs with `document.visibilityState === "hidden"`, which freezes rAF and WAAPI:

- **Boot only completes on the first load after `preview_start`.** Any later reload (HMR full reload,
  `navigate`, `location.reload()`) leaves `window.CartClash` undefined forever. Recovery: `preview_stop`
  → `preview_start` → resize to the size you want → probe. Resizing alone does *not* re-boot.
- If you need CSS measurements without a booted app, fetch the stylesheets directly —
  `fetch('/src/cart-rave-menu.css?direct')` into a `<style>` — and mount the markup yourself. The app's
  CSS is JS-imported, so an unbooted page is **unstyled** and every measurement off it is garbage.
- Entrance animations sit at their pre-state (`opacity: 0`, `translateY(14px)`) → neutralise with
  `el.style.opacity='1'; el.style.transform='none'` before measuring.
- Toggle animations freeze at their `fill: backwards` start keyframe and **pin the old colour** — check
  animated state on a **fresh probe element** with the same classes.
- **Mode entry never completes**, so nothing in-match is reachable. `getComputedStyle(el, '::before')`
  needs the pseudo passed as the *second* arg — a helper that drops it silently returns the element's
  own box and you will "measure" a hole that is 370px wide.
- **`getComputedStyle` on a live element lies whenever a CSS `transition` touches that property.**
  Frozen WAAPI means every `CSSTransition` sits at `progress: 0` *forever*, so you read the value the
  property was leaving, not the one it settled on. In the 3a pass this reported a title with no skew,
  a name field with a magenta dashed border, plate buttons with black text on black borders, and
  command labels at 13.33px — **all four were phantoms**. Tell them apart with
  `el.getAnimations()`: a running `CSSTransition` at progress 0 means the reading is worthless.
  **The fix: measure a freshly created probe node with the same classes and `style.transition =
  'none'`.** A fresh node has no in-flight transition and computes the real cascaded value.

### 4. Anything that writes `transform` inline will flatten a skewed slab

Every action slab in this redesign is a parallelogram: `skewX(-8deg)` on the button, `skewX(8deg)` on
an inner label. **Inline `transform` beats that CSS rule**, so any animation or feedback helper that
writes `transform` silently un-skews the slab and leaves its label slanted — the exact inverse of the
design. Four separate helpers have done it:

1. `wireButtonPressFeedback` / anime.js `scale` on press (`0d20900`, 7a) → fixed by animating an
   **inner** node via `getTarget` (`getMenuPressTarget`, `lobbyPressTarget`, `escPressTarget`).
2. `animateMenuReveal` in the pause entrance (`ef0df3d`, 7f) → the reveal's `y` wrote
   `translateY` over the skew. Fixed by fading the slabs in with **opacity only**.
3. `resetEscOverlayAnimState` pre-seeding `style.transform = "translateY(8px)"` — same commit.
4. `animLoop`'s title beat writing `style.transform = scale(...)` **every rAF** onto the 3a lockup
   (`e228636`, 3a) → the mock's `skewX(-4deg)` lean never rendered *at all*, from frame one. Fixed by
   handing the beat to CSS as a scalar (`--cr-title-beat`) so the rule composes
   `skewX(-4deg) scale(var(--cr-title-beat, 1))` and nothing writes `transform`. **Note the pane
   cannot show this class of bug** — rAF is frozen there, so the write never happens and the lean
   measures correct. It was found by reading `animLoop`, then proved by replicating that one write.

**The rule:** a skewed slab needs three layers — outer (skew) / inner (press target) / label
(counter-skew) — and **nothing** may animate `transform` on the outer node. When you verify, run the
**real** show path; forcing `display:flex` skips the entrance and the skew will measure correct while
being broken in the actual app (that is how 2 slipped through).

### 5. Width-based clamps don't shrink for a short window

7f is the one screen that must fit *inside* a viewport rather than fill it (`max-height: 92dvh`).
Review 2 grew its card padding, gaps and header line — all `clamp(x, Nvw, y)` — which pushed the panel
from 415px to 509px and made it scroll on any window under ~553px tall. Verifying at 1440×900 and
380×800 hid it completely, because both are tall enough. The panel's vertical rhythm is `vh`-based
now (`--esc-mute-size`, `min(6vw, 9vh)` on the headline). **On a centred panel, check a SHORT
viewport, not just a narrow one.**

### 6. Probing an element in a state the app never renders proves nothing

Every visual bug that reached Wyatt this session was "verified" first. Each time the probe created a
state the running app doesn't use:

1. **7f skew** — measured after forcing `display:flex`, which skips `show()`. The entrance animation
   is what flattened the slabs, so the probe measured a skew that the real screen never had.
2. **7f scroll** — measured at 1440×900 and 380×800. The panel only overflows when the window is
   SHORT; both probes were tall.
3. **6a boost** — measured after setting `display:block` on the meter by hand. `hud.js` writes
   `display:flex`, which turned the counter-skew wrapper into a content-sized flex item and collapsed
   the track to zero width. The bar was simply absent in-game.

**The rule:** drive the real entry point (`show()`, the real updater, the real display value), and
probe the geometry the failure would live in — short viewports for a centred panel, a filled roster
for a scoreboard. If you cannot reach the real state (mode entry never completes in the pane), say so
in the report instead of implying it was seen.

### 7. `hidden` does not hide anything if an author rule sets `display`

The UA rule is `[hidden] { display: none }` at specificity (0,0,1). **Any** author `display`
declaration outranks it. `#cr-level-row` carries `hidden` *and* this doc called it "the hidden
`.cr-level-btn` radiogroup" — but `.cr-level-row { display: grid }` (0,1,0) won, so all three arena
cards rendered inside the 3a context panel, sat on top of the pager and squeezed the arena name to a
clipped stub. It shipped in cut 2 and survived a full detail-by-detail diff of the screen, because
the buttons were read as "the hidden data model" in the a11y tree without ever checking whether they
were painting. Wyatt caught it from a screenshot (`f279b08`).

**The rules:** a `hidden` attribute is *not* evidence of `display: none` — read the computed value.
When you rely on `hidden` for an element that has a `display` rule, back it with an explicit
attribute selector at enough specificity to survive the bands (`.cr-context .cr-level-row[hidden]`).
Grep a screen for `[hidden]` and assert `display === "none"` on each before signing off.

## Locked decisions

1. **One branch**, all parts; commit per cut.
2. **Slab material** replaces the white die-cut contour on panels/chips/buttons **game-wide** (kept only on emblems + Road Rage lettering). The loading screens and the boot-error card were the last holdouts — swept in `5e8585e` / `9f669ba`. "Game-wide" means surfaces nobody thinks of as screens too; grep for `sticker-panel`, `sticker-micro` and literal `#f2ede4` ring shadows before believing it is done.
3. **Human emblem** = cart-color "shopper" glyph via shared `emblemForSlot(slot)`; host/leader/YOU stay **separate pips**.
4. **Results** = podium + receipt. `EXPRESS LANE HELD` is **not tracked → dropped**. Spills *were* added as new instrumentation at review (see below).
5. **Friends** = **model B** (post-enter full-screen lobby, reuse netcode lifecycle) with **start-rule B1** (rounds auto-arm on all-ready; **no host START button**).
6. ~~Sub-screens = path A~~ → **REVERSED at the 2026-07-22 review**: sub-screens get the literal full-screen 7a–7g layouts on the shared `.cr-screen` shell.
7. **Part-1 polish deferred** to the refine pass: gamepad→command-list nav, hint-bar region/ping meta, mobile/touch pass, inline-rename flow check.

## Commits on the branch (newest last)

| Hash | Cut | What |
|---|---|---|
| `62126ff` | 1 Foundation | `--slab-*` tokens; `.cc-*` material swap; `shopper` glyph; `emblemForSlot` + `cartColorCss`. |
| `62baedf` | 2 Menu (3a) | `.cr-content` → hero + plate + context + hint bar; selection controller; arena pager; entrance rewrite. |
| `3863a7b` | 3 HUD (6a) | hud.css sticker→slab sweep; timer/scoreboard/state rings; `emblemForSlot` wired for humans. |
| `87790dc` | 4a Overlay shell | `.cr-overlay-panel` → slab; DONE=yellow, BACK=ghost. |
| `bcf763b` | 4b Challenges | rows → slab; complete = strikethrough + tilted portal-green **REDEEMED** stamp. |
| `afbf8b1` | 4c Settings | quality cycle button → segmented **LOW/MED/HIGH**. |
| `690d5c6` | 3d Settings SFX | second `.cr-vol-row` (⚡) → `setSfxSliderVolume`; one shared `wireSettingsVolTrack()`. |
| `9646a02` | 3e Customize | colour chips → dark ink slabs; tabs → slab w/ yellow active. |
| `bdc1fbc` | 3f How To | four bullet sections → **AISLE 1/2/3** tag cards + SCORING / FULL CONTROLS strips. |
| `2192461` | 3g Pause | title → **PAUSED** + `.esc-context`; ANNOUNCER+DISPLAY → one 2×2 OPTIONS grid. |
| `3e6b927` | 3h Results | PA header; ranked list → 4-column podium; **match receipt** on the count-up schedule. |
| `2ccabef` | 4 Friends lobby | `buildRosterRows()` factored out; full-screen **CHECKOUT LINE** gated on `phase==="lobby" && friends`. |
| `de6797f` | 4b Invite chrome | ROOM CODE slab + host BOT DIFFICULTY row on `#cr-friends-screen`. |
| `f504b9a` | **7a full-screen** | Shared `.cr-screen` shell + CUSTOMIZE rebuilt onto it. |
| `0d20900` | 7a fixes | unclickable PATTERN tab; skew flashing → outer(skew) / inner(press) / label(counter-skew) split. |
| `7115b63` | **7c full-screen** | SETTINGS onto the panels variant. |
| `6a1757a` | 7c fix | cards were still wearing the retired sticker material. |
| `2e5c625` | **7b full-screen** | CHALLENGES price-tag grid; kicker reads real `lastDailyReset`/`lastWeeklyReset`; reward pip dropped (no data); `.cr-screen-panels` gained `max-height:100%` (it overflowed its grid row onto the actions). |
| `c603119` | 7c review | POST-FX chip width (`flex:1` leftover); keycaps → slab @ 32×30 across **all three input modes**; remapping notice removed; two-class rules to survive the bands. |
| `561007d` | **7d full-screen** | HOW TO PLAY — three aisle tags across, accent moved into the Road Rage number, strips → single rows, gamepad line hard-right w/ inline SVG. |
| `a7cf110` | **7g full-screen** | RESULTS — podium bottom-left (250/170/120/80, winner 2nd-from-left via flex `order`), receipt + actions right rail, PA pill + 52px skewed headline, skew on a `::before` so main.js label rewrites survive. |
| `d8e3c8b` | 7g review | YOU pill; SPILLS CAUSED + CHALLENGE receipt lines; **ledger removed**; Settings sliders made draggable. |
| `26d6fa3` | **7e menu side** | FRIENDS invite chrome onto the shell — ROOM CODE card (36px cyan + hairline COPY + link + share hint) beside the host BOT DIFFICULTY card; retired modal CSS + both band blocks deleted; `main.js` untouched. |
| `50b0af7` | **7e lobby side** | CHECKOUT LINE — title top-left, ROOM CODE slab + READY/LEAVE left, 560px roster right, hint bar. Gate/resolver/READY-proxy unchanged. |
| `c5be94f` | **7f Pause** | 860px panel; PAUSED + right-aligned round/clock on one baseline; body = AUDIO \| CONTROLS (toggle grid moved inside AUDIO); actions to one bottom row; **SCORING deleted**. |
| `ef0df3d` | 7f review 1 | Action slabs were flat with slanted labels (entrance animation — see trap 4); restart note removed; keycaps matched to the Settings chart; title/headers/sliders/chips finished to the mock. |
| `2df8e6b` | 7f review 2 | Mute → AUDIO card header (it crowded MUSIC/SFX); cards made equal height with chips on the card floor; backdrop/panel/cards → the mock's dark. |
| `3451819` | 7f review 3 | Review 2 spent 94px of height on width-based clamps → the panel scrolled under ~553px of window height. Rhythm is `vh`-aware now; threshold ~410px. |
| `530825f` | **6a-1 HUD top** | Directive → accent price-tag slab + `blurb` rule line (new data, placeholder copy); timer meta gains `TO CLOSE`; mute → 48px ink slab. |
| `79c9898` | **6a-2 standings** | Rank digits + edge stripe deleted; score prints over a barcode; YOU cyan; feed → one **TRANSACTION LOG** receipt with an orange streak pip. |
| `e99b8d1` | **6a-3 world/pod** | Nameplates → mini price tag (cart colour moved to the punched hole's ring) + leader crown via new `getLeaderSlotIndex()`; boost → 360px slab w/ label, value, hazard overcharge zone. |
| `174e390` | 6a review 1 | Timer meta onto the clock's baseline; combo → **CARNAGE COUPON** w/ live countdown; boost track had collapsed to 0; PA kicker lost the retired white ring. |
| `3240e6e` | 6a review 2 | Clock was Bungee (proportional digits) → resized every tick; now Goldman + an em floor. |
| `e228636` | **3a Menu** | Hover kept the sticker ring + flattened the row; title lean died to the rAF beat write; title to 170/0.78/no-stroke; rings off re-roll + diff chips; NEW pill moved onto the row's own `.cr-cmd-new`; hero top-anchored + hint-bar reserve (it overlapped at 1280×720); plate name plain + twin 36px ✎/⟲; hint bar SVG chip + sha fallback; title band rules moved into the 3a block. |
| `f279b08` | 3a review | The arena radiogroup was never actually hidden (author `display` beat `[hidden]`) — three cards on top of the pager; QUICKPLAY's arena picker dropped (matchmaking picks). |
| `5e8585e` | **Loading 1/2** | Mode-entry overlay onto the shell — die-cut card + vinyl ring + scanlines out, title glow-only, 20-seg bar → boost-meter slab, store-voice kickers, boot-error card to slab material. |
| `9f669ba` | **Loading 2/2** | Boot splash onto the shell in literal hexes — same header/strip/meter, `THE STORE IS NOW OPENING`, `#boot-seg-bar` becomes the track, cart-crash animation untouched. |

## Key implementation facts (so you don't re-derive)

- **Menu markup** lives in `index.html` (invariant — `cart-rave-menu.html` is deleted, don't recreate). Old audio + controls panels stay **mounted-but-hidden** in `.cr-legacy[hidden]` so `syncAudioUi` / mute / `updateControlsPanelUI` keep working.
- **`.cr-screen` shell** (`cart-rave-menu.css` ~1315): Road Rage title top-left over a Goldman kicker; named regions `-rail` / `-stage` / `-panel` / `-panels` / `-actions` / `-hint`; collapse at 1024 and 768. Rebuilding a screen is markup restructure + region contents, not a new layout system.
- **Arena picker** is a pager (`#cr-arena-prev/next`) backed by the `.cr-level-btn` radiogroup — the buttons stay the data model, and they are hidden by `.cr-context .cr-level-row[hidden]`, **not** by the `hidden` attribute alone (trap 7). The pager shows only for modes with `arena: true` in `MENU_ITEMS`: **SOLO only** — QUICKPLAY's was dropped at review because matchmaking picks the arena. `arena: false` also gates ◂/▸ paging via `arenaContextShown()`.
- **3a title beat** goes through `--cr-title-beat` (a scalar `animLoop` sets), never `style.transform` — the lockup carries `skewX(-4deg)` (trap 4). Its size/rhythm is `vh`-aware and its **responsive band rules live inside the 3a block**, because the shared band section sits earlier in the file and could no longer outrank the two-class `.cr-hero .cr-title-stack` rule.
- **3a command rows** are `.cr-btn` elements, so they inherit sticker hover/press. `.cr-btn.cr-cmd:hover/:focus-visible/:active` re-declares `skewX(-8deg)` + `box-shadow: none` to hold them off; hover *is* selection on this screen, so any new state must keep that pair.
- **CHALLENGES badge** renders into the row's own `.cr-cmd-new` pill (`updateChallengesBadge`) — NEW, or `✓N` in portal green via `.cr-cmd-new--done`. The old absolutely-positioned `.cr-challenges-chip` is deleted; it was never counter-skewed.
- **emblemForSlot(slot)** (npcNames.js): NPC → personality emblem; human → shopper glyph tinted by cart colour; empty → null.
- **Roster model (7e — still true after the rebuild):** `buildRosterRows(netSlots, roundScores, isLobbyRoster)` in hud.js is the ONE slot→row resolver — compact scoreboard and CHECKOUT LINE both read it. The lobby READY button is a **proxy** that clicks `elements.readyBtn`; never add a second `MSG.readyToggle` send. The lobby element is mounted on `document.body` and forced hidden in the menu-visible and `suppressHud` branches. Full-screen gate is **`phase === "lobby"` && friends** only — `isLobbyRoster` (`lobby || countdown`) would cover the 3-2-1.
- **The lobby deliberately does NOT use `.cr-screen`.** It re-expresses the same geometry under `.hud-lobby-*` in `hud.css`, because a hud.css override of a cart-rave-menu.css shell class is settled by **bundle order** — trap #1 with two stylesheets in play. Copy the pattern if another HUD-side surface needs the shell look.
- **Skewed slabs need three layers, not two.** `wireButtonPressFeedback` writes `transform` inline on press, so the press target must be an inner node: outer (`skewX(-8deg)`) / `-inner` (press target, `getTarget`) / `-label` (`skewX(8deg)`). Two-class rules against `.cc-btn` keep the skew through its own `:hover`/`:active` transforms. Menu side uses `.cr-screen-btn-inner/-label`; lobby side `.hud-lobby-btn-inner/-label` + `lobbyPressTarget()`.
- **Emblems are self-contained stickers** — backing and ring are baked into the SVG (and off-limits). Size the 1em glyph, never draw a second ring around it (the 7e mock's drawn-on ring was dropped for this reason).
- **Difficulty chips:** `updateDiffButtons`/`initDiffSelect` drive **every** `.cr-diff-row .cr-diff-btn` in the document — one write path to `settingsStore.aiDifficulty`, no new wiring needed for a new row.
- **Results DOM** is built in `resultsOverlay.js` and returns `{overlay, panel, kicker, title, verdict, finalScores, receipt, playAgain, mainMenuBtn}` — `statsLine`/`history` are **gone**. `.results-body` is podium / receipt / actions and nothing else.
- **Results stats** (`matchStats.js` → `snapshotMatchStats()`): BODIES=`localKos`, SPILLS CAUSED=`localSpills` (recorded in simulation.js beside the SPILL progression event), BEST COMBO=`maxComboTier`, TIMES BODIED=`localDeaths`, plus optional `leaderDowns`/`criticalKos`. The CHALLENGE receipt line diffs against `challengesCompleteAtRoundStart`, snapshotted at countdown in main.js.
- **HUD (6a) specifics:** `hud.js` owns the ONE leader rule and exports `getLeaderSlotIndex()` — the cart crown and the scoreboard's magenta tag read the same value, so they cannot disagree. The kill-feed receipt hides itself via a **MutationObserver** on its rows, because `animations.js`'s exit timer removes rows and hud.js has no completion hook (`:has()` was rejected: Vite's default target still includes browsers without it). Directive copy (`blurb`) is **placeholder** and lives in `directives/directives.js`. The clock's fixed width comes from an em `min-width` floor, NOT from `tabular-nums` — Goldman doesn't ship tabular figures.
- **Pause overlay (7f) specifics:** the panel carries its own material (no `.cc-panel`/`.cc-title` — both fought the mock); `createEscSection` returns `{section, hd, body}` so the mute chip can mount on the AUDIO header line; the CONTROLS chart mirrors the Settings one row for row (`W A S D` split, wide `SHIFT`/`SPACE`, per-action `--esc-kc` accent) but uses **fixed palette tokens**, because Settings tints from the live arena palette inside `cart-rave-menu.js`'s closure and this module can't reach it. Unifying them is a shared-module extraction, deliberately not done.
- **main.js rewrites the results button labels at runtime** (rematch countdown, "WAITING FOR HOST…") — any decoration inside those buttons must live in CSS pseudo-elements, not child spans.
- **Loading screens are two separate surfaces with two separate constraints.** The **mode-entry overlay** (`#cr-mode-load`) is built by `src/ui/loadingScreen.js` and styled from `src/ui/loadingScreen.css`, which imports tokens — so it uses the token layer. The **boot splash** (`#cr-boot-splash`) is markup + `<style>` inline in `index.html` and paints *before any bundle CSS exists*: every value there must be a **literal hex**, never a token. Same rule for `#cr-boot-error`, which shows when a module fails to load. Keeping the two in sync is manual.
- **Both re-express `.cr-screen` rather than reusing it** — same bundle-order reason as the 7e lobby. `.cr-load__shell/-hd/-kicker/-title/-stage/-strip/-meter` mirrors the shell's values; `.cr-boot-shell/-hd/-kicker/-title/-stage/-strip/-meter` mirrors them again in literals. Change one and you must change all three (shell, overlay, splash) or they drift apart.
- **Loading progress is the boost-meter slab.** Both bars are track + fill now, not lit segments. `#boot-seg-bar` **kept its id and `role="progressbar"`** but is the *track* — `paintBootProgress()` (inline) and `dismissInitialBootSplash()` (loadingScreen.js) both write `#cr-boot-fill`'s width and `#cr-boot-pct`'s text. `setProgress()` does the same for `.cr-load__fill` / `.cr-load__pct`. Anything that used to add `.lit` is gone.
- **The boot splash cannot be measured in place** — it is removed from the DOM the moment boot completes. To inspect it, fetch `/index.html`, mount its `<style>` and the `#cr-boot-splash` subtree yourself, then measure. `showQualityApplyLoading()` is the one loading entry point that is fully synchronous, so it is the only one the pane can drive end to end (`withModeEntryLoading` awaits rAF and stalls there).
- **A dynamic `import()` of loadingScreen.js from the console creates a SECOND module instance** with its own `#cr-mode-load` — `document.getElementById` then returns the app's, which never updates, and it looks like the code did nothing. Query `document.querySelectorAll('#cr-mode-load')` and remove the duplicate when you're done.

## Remaining work

**Every surface is built. What is left is verification, not construction** — and all of it needs a
real browser and a real match, which is exactly the work the pane cannot do.

**Owed verifications (need a visible browser — `npm run dev:local`, not the pane):**
1. **A real match** → the whole **HUD** (6a), then **results on a finished round**: count-up + receipt print cadence, the new SPILLS/CHALLENGE lines with real data, defeat/victory treatments, PLAY AGAIN host gating.
2. **A live friends room, two clients** → the rebuilt CHECKOUT LINE has **never rendered** (mode entry never completes in the pane; it was verified by mounting its structure and measuring). Check roster/ready streaming, the **lobby→countdown handoff**, **rematch** re-entry, LEAVE ROOM teardown, `?room=` JOIN, and the new COPY button.
3. **Responsive sweep** at 1025 / 1024 / 768 / 380 + `prefers-reduced-motion`. 3a was measured at
   1920×1080 / 1280×720 / 1025×600 / 1024×768 / 768×1024 / 380×800, but by geometry, not by eye.
4. **Golden visual baselines** are still invalidated — regen (`npm run shoot`) once the review signs off.
5. **Every `[hidden]` on the menu** — assert the computed `display` is actually `none` (trap 7). Only
   `#cr-level-row`, `#cr-context-arena`, `#cr-diff-row` and `#cr-cmd-new-pill` were checked.
6. **Finish the decision-2 sweep.** A grep after the loading cuts still finds **22** die-cut ring
   usages in `cart-rave-menu.css` and **5** in `hud.css` (`--sticker-panel`, `--sticker-micro`,
   `0 0 0 Npx var(--color-sticker-white)`). Most are base rules that a rebuilt screen overrides —
   `.cr-reroll` and `.cr-diff-btn` were exactly that, and both still painted the ring until 3a
   pinned them — so each one needs checking against a surface that actually renders it, not just
   reading. Results / pause / stickers / announcer / index.html are already clean.
7. **Both loading screens, in their real moment.** The **boot splash** was measured by remounting the
   served markup — it is ripped out of the DOM before any probe can reach it, so nobody has seen the
   real first paint or its exit beat. The **mode-entry overlay** has never had `applyTheme` run
   against it: the per-arena decor inside the new centre stage (vinyl / furniture pile / seaside) and
   the entrance + exit beats are all unseen, because `withModeEntryLoading` stalls on rAF in the pane.
   Watch a cold boot, then enter each of the three arenas.

**Known-but-parked:**
- `.results-defeat .results-title { --title-glow }` **never applies** — main.js sets that custom property inline and no stylesheet rule can outrank it. Cosmetic only (the panel filter desaturates anyway). Pre-existing.
- `?room=` JOIN rehome — FRIENDS row → "JOIN LOBBY" → `enterPlayMode`; still on main.js's old ad-hoc path.
- Part-1 polish (item 7 above).
- The REDEEMED stamp on 7b has only been probed synthetically — no challenge has actually completed.
- **Region · ping** (the 7e mock's footer meta) has no data behind it: netcode tracks no region and no RTT. The lobby hint bar carries `LINK OK` / `RECONNECTING…` from `getConnectionState()` in that slot; region·ping stays with the Part-1 polish until something measures it.
- **"PICKING CART…"** (mock 7e per-slot status) implies a pending-picker state the game doesn't have — not-ready humans read `IN LINE`.

## How to continue / verify

- **Dev server:** `.claude/launch.json` has `vite` (3210), `vite-alt` (3211), `vite-perf` (3212). The other session sometimes holds **all three** — when it does, `preview_start {url: "http://127.0.0.1:3212/"}` opens a pane tab against the server it is already running (same working directory, so it serves your edits). A hidden-tab HMR update will **not** repaint: re-`navigate` with a fresh query string (`?v=2`) to force a clean boot, and confirm the served CSS actually contains your change (`fetch('/src/cart-rave-menu.css?direct')`) before trusting a measurement.
- **Gates:** `npm run qa` (report by number) + `npm run build` (CSS is in the client bundle). Last run: **773/773 tests, 77 files**, all sub-gates green.
- **Forcing a round to end (dev):** `window.CartClashDev.run("scores 7 4 2 9")` then `run("rewind 800")` → podium in ~2s. `CartClashDev.help()` lists the rest.
- **Gotchas:** index.html line numbers shift as you edit (re-grep before editing); `status:size` gates on docs/STATUS.md tokens; menu nav is *correctly* blocked while an overlay is open.
- **Probing the HUD without a match:** `#hud` is built at init, so the DOM exists on the menu. The top strip (timer, directive, mute) can be driven directly; the scoreboard, feed, nameplates, boost and coupon only populate in a round, so seed them (`.hud-scoreBox` text + `isLeader`/`isLocal` classes, a hand-built `.hud-feed-row`, `.hud-combo-badge.active`). Remember `getComputedStyle(el, '::after')` needs the pseudo as the SECOND argument — a `cs = e => getComputedStyle(e)` helper silently returns the element's own box, which cost three re-measures this session.

## Paste-able opener for the next window

```text
Continue the "Fight Night" UI redesign on branch redesign/fight-night-ui (repo cart-rave).
Everything is committed there and UNPUSHED.

READ IN THIS ORDER before touching anything:
1. docs/planning/fight-night-ui-handover.md — the whole file. Its "READ FIRST" section is seven
   traps that have each bitten more than once in this work. Traps 3, 4, 6 and 7 caused every bug
   that reached me in the last two sessions, and trap 3 will make you report things you did not
   actually see.
2. The design source: extract ~/Downloads/"Game Menu UI Refinement.zip" and read
   design_handoff_main_menu/README.md plus "Menu Redesign Concepts.dc.html". The README has the
   per-screen prose, the .dc.html has the exact numbers. The plan does not restate them. It covers
   3a / 6a / 7a-7g ONLY — the loading screens have no mock and never did.
3. `git log --oneline -30` on the branch.

State: EVERY surface is built — 7a-7g, 6a HUD, 3a main menu (e228636 + f279b08) and both loading
screens (5e8585e + 9f669ba). The construction phase is over. What is left is verification, and
almost all of it needs a real browser and a real match, which is exactly what the Browser pane on
this host cannot do.

Only 7a, 7c and 3a have ever been looked at by a human. Everything else was signed off on DOM
geometry and computed styles alone. Treat "verified" in this doc as "measured", not "seen" — and
the loading screens are the worst case: the boot splash is torn out of the DOM before a probe can
reach it, and the mode-entry overlay has never had applyTheme run against it at all.

Ask me what to work on — do not pick a card yourself. The owed list is in the handover's
"Remaining work": a live match for the HUD and results on a finished round, a two-client friends
lobby (the CHECKOUT LINE has NEVER rendered), a cold boot plus one entry into each of the three
arenas for the loading screens, the responsive sweep, an audit that every [hidden] on the menu
actually computes display:none, and a golden-baseline regen (`npm run shoot`) once I sign off.

Rules of engagement:
- plan -> my ack -> apply. One item per cut.
- Commit by EXPLICIT path, and `git diff` your own files immediately before committing. A second
  agent session shares this checkout and has already both swept my lines into its commit and
  clobbered an edit outright. Never `git add -A`.
- Delete a screen's retired CSS when you rebuild it; don't layer over it.
- Two-class selectors when overriding a shared shell class — and check where your rule sits in the
  file, because equal specificity is settled by source order and the 3a block is near the end.
- Never animate `transform` on a skewed slab.
- Verify in the state the app ACTUALLY renders (real show()/updater, real display value, short
  viewports for centred panels). If you can't reach the real state, say so plainly instead of
  implying you saw it. In the pane, a computed style on a live element is pinned mid-transition —
  measure a fresh probe node with `transition: none` (trap 3).
- Gates: `npm run qa` + `npm run build`, reported by number.
```
