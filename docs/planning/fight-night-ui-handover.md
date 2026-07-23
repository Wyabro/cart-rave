# Fight Night UI Redesign — Session Handover

> Working doc for continuing the "Fight Night" UI redesign. Read this, then the
> **authoritative plan**, then `git log` on the branch, then verify current state.

## TL;DR

- **Branch:** `redesign/fight-night-ui` (off `cart-clash`). Everything below is committed there, **unpushed**.
- **Authoritative plan:** `C:\Users\wyatt\.claude\plans\c-users-wyatt-downloads-game-menu-ui-re-snazzy-floyd.md`
  (full 3a/6a/7a–7g specs, locked decisions, verification, risks). This handover is the *progress log*; the plan is the *spec*.
- **Design source:** `Game Menu UI Refinement.zip` → `design_handoff_main_menu/README.md` + `Menu Redesign Concepts.dc.html`
  (approved badges: **3a** menu, **6a** HUD, **7a–7g** sub-screens/ESC/results). The plan captures every measurement.
- **Progress:** 6 cuts committed (Foundation, menu 3a, HUD 6a, overlay shell, challenges REDEEMED, settings segmented). Path-A sub-screens + Friends lobby + Part-1 polish remain.
- **Verification caveat:** the Browser pane **won't composite screenshots on this host** → everything was verified via DOM + computed-style + scripted-interaction introspection (`javascript_tool`, `window.CartClash.openX`), **never by eye**. No visual/pixel review has happened yet. The user wants a joint visual review once the full system is in.

## Locked decisions (from plan review + in-session Q&A)

1. **One branch**, all parts; commit per cut.
2. **Slab material** replaces the white die-cut contour on panels/chips/buttons **game-wide** (kept only on emblems + Road Rage lettering).
3. **Human emblem** = cart-color "shopper" glyph via shared `emblemForSlot(slot)`; host/leader/YOU stay **separate pips** (not baked into the emblem).
4. **Results** = podium + receipt using **existing stats only** (no new gameplay instrumentation). `EXPRESS LANE HELD` is **not tracked → dropped**.
5. **Friends** = **model B** (post-enter full-screen lobby, reuse netcode lifecycle) with **start-rule B1** (rounds auto-arm on all-ready; **no host START button**).
6. **Sub-screens = path A** (restyle-in-cards + the mock's *content*), **not** the literal full-screen 7a–7g layouts. Full-screen rebuilds deferred to the joint review (current screens are centered modal cards).
7. **Part-1 polish deferred** to the refine pass: gamepad→command-list nav, hint-bar region/ping meta, mobile/touch pass, inline-rename flow check.

## Commits on the branch (newest last)

| Hash | Cut | What |
|---|---|---|
| `62126ff` | 1 Foundation | `--slab-*` tokens (tokens.css); `.cc-*` material swap + `.cc-slab*` helpers (stickers.css); `shopper` glyph (icons.js); `emblemForSlot` + `cartColorCss` (npcNames.js). |
| `62baedf` | 2 Menu (3a) | Rebuilt `.cr-content` into hero (title + 7-item command list) · plate · context · hint bar (index.html); selection controller + arena pager + hint bar + entrance rewrite (cart-rave-menu.js); grey text tokens. |
| `3863a7b` | 3 HUD (6a) | hud.css sticker→slab sweep; timer→slab+hazard header+skew; scoreboard→price-tag+skew+hole; state rings YOU=cyan/leader=magenta; `emblemForSlot` wired for humans (hud.js); shopper upgraded to ringed emblem (icons.js). |
| `87790dc` | 4a Overlay shell | `.cr-overlay-panel` → slab; DONE=yellow, BACK=ghost; pause/results `--sticker-micro` → slab. |
| `bcf763b` | 4b Challenges | rows → slab; complete = strikethrough + tilted portal-green **REDEEMED** stamp (visual-only). |
| `afbf8b1` | 4c Settings | GRAPHICS quality cycle button → segmented **LOW/MED/HIGH** control. |

## Verified this session (DOM/interaction only — NOT visual)

- **Menu (3a):** W/S + ↑/↓ nav, hover=select, Enter activate, ←/→ arena paging (re-themes backdrop), difficulty chips, per-item context show/hide, overlay-open gating — no console errors. Regions positioned correctly (hero L, plate TR, context BR, hint bar bottom).
- **Overlays:** Settings + Challenges open with the slab panel (hairline + `3px 3px 0` extrude, ink surface, no white ring), yellow DONE, Road Rage title.
- **Segmented quality:** 3 chips reflect `getQualityTier()`, active = yellow chip. (In the menu preview, auto-quality clamps to low with no live renderer, so HIGH may not "stick" there — correct in-game.)

**NOT verified:** anything's actual *look*; the whole **HUD** (renders only in a live match — needs a real game); mobile/responsive bands; the REDEEMED stamp (needs a completed challenge).

## Key implementation facts (so you don't re-derive)

- **Menu markup** lives in `index.html` (invariant — `cart-rave-menu.html` is deleted, don't recreate). The old audio + controls panels are kept **mounted-but-hidden** inside `.cr-legacy[hidden]` so existing JS wiring (`syncAudioUi`, mute, `updateControlsPanelUI`) keeps working; the visible menu drops them.
- **Arena picker** is now a pager (`#cr-arena-prev/next`, `#cr-arena-name/sub`) backed by the **hidden `.cr-level-btn` radiogroup** (`#cr-level-row[hidden]`) — the buttons stay the data model so `initLevelSelect`/`updateLevelButtons`/`selectLevel` are unchanged; `updateArenaPager()` mirrors the active button, `pageArena(dir)` cycles unlocked ones. `selectLevel` calls `updateArenaPager()`.
- **Selection controller** (`initCommandList`, `setMenuSelection`, `MENU_ITEMS` config, `onMenuNavKeydown`) is in cart-rave-menu.js. Command rows keep `.cr-btn` + `data-action` so the existing delegated click handler still routes them (solo/quickplay/friends → `cartrave:menu`; customize/challenges/howto/settings → overlays). Stable ids `#cr-solo/#cr-quickplay/#cr-friends` preserved.
- **emblemForSlot(slot)** (npcNames.js): NPC → personality emblem; human → `{icon:'shopper', color: cartColorCss(slot.color), label:'SHOPPER'}`; empty → null. `slot.kind` is `"npc"|"human"|""`; `slot.color` is a cart-color key. Now consumed by hud.js `updateScores` (so `knip` passes). `getNpcPersonality`/`PERSONALITY_META` import removed from hud.js.
- **HUD** (`src/hud.js` + `src/ui/styles/hud.css`) only renders in-match. Slab sweep + skew applied; `--sticker-*` kept only for emblems. `announcer.css` + icons.js emblem contours **untouched** (invariant).
- **Results stats** live in `src/scoring/matchStats.js` via `snapshotMatchStats()`: BODIES=`localKos`(+`kosBySlot`), BEST COMBO=`maxComboTier`, TIMES BODIED=`localDeaths`(+`deathsBySlot`). Count-up in `resultsOverlay.js` uses `countUpNumber` at `220 + i*90ms`.

## Remaining work (the roadmap)

**Path A sub-screens** (verifiable via `window.CartClash.open{Customize,Challenges,Settings,HowTo}` + `javascript_tool` introspection):
- **7c Settings — SFX slider:** add a second `.cr-vol-row` (⚡) in the AUDIO section; wire click→`setSfxSliderVolume` (audioControls.js) + sync fill from `audioStore.getState().sfxVolume`. Segmented quality is done.
- **7a Customize:** restyle the color-chip grid to dark chips w/ neon cart SVGs, **CUSTOM chip keeps its white ring**, hue slider knob white-ringed. Mostly CSS; 3D preview (cartPreview.js) untouched.
- **7b Challenges:** optional reward pips ("+N PTS") — only if `challengeStore` challenges carry a reward field (check first). REDEEMED done.
- **7d How To Play:** restructure static bullets into three aisle price-tag cards (Road Rage AISLE 1/2/3 in cyan/magenta/yellow) + SCORING strip + FULL CONTROLS strip with keycap chips. Bigger (DOM restructure).
- **7f Pause** (`src/ui/pauseOverlay.js` / `.esc-*`): 2×2 toggle grid (QUALITY/POST-FX/ANNOUNCER/CALLOUTS), PAUSED Road Rage 72px + round/time context, RESUME(yellow)/RESTART(cyan, solo-only)/MAIN MENU(ghost). Mostly re-layout of existing sections (already on `.cc-*` slab).

**Large blind-builds (do with the visual-review loop — highest rework risk):**
- **7g Results** (`src/ui/resultsOverlay.js` + `src/main.js:~3198–3538`): rebuild the ranked list into a **podium** (4 cols, heights by rank 250/170/120/80; winner magenta+crown, YOU cyan, others hairline) + **match receipt** panel (BODIES/BEST COMBO/TIMES BODIED from `snapshotMatchStats`; **drop EXPRESS LANE HELD**; optional leaderDowns/criticalKos). Thread the receipt element through `animateResultsPodiumShow`'s payload so it animates; print lines on the count-up schedule.
- **Cut 5 Friends** (model B — biggest): restyle the invite chrome (`#cr-friends-screen`, wired in `src/main.js:~1885`) + build the full-screen **CHECKOUT LINE** lobby from the lobby-phase HUD roster (`hud.js:~944` `isLobbyRoster`, ready button `~1147`). **Start rule B1: no host START button — rounds auto-arm** server-side (`party/index.ts` `#checkAllReady`→`#armGameStart`→`MSG.gameStart`); everyone uses READY; show "WAITING FOR CHECKOUT…". **Full-screen gate = `phase === "lobby" && friends`** (NOT `isLobbyRoster`, which includes countdown — else it covers the 3-2-1). Friends-only (quickplay keeps compact roster). **Factor the roster render**, don't duplicate. Read `docs/reference/control-flow.md` first (netcode↔HUD↔menu seam). Rematch → re-show lobby. JOIN via `?room=` → FRIENDS row = "JOIN LOBBY" → `enterPlayMode` (skip invite chrome).

**Part-1 polish (refine pass):** gamepad→`setMenuSelection` on the command list; hint-bar meta region via `/cdn-cgi/trace` (degrade on local) + ping; named mobile bands + skew/`nowrap` touch-target pass; verify the ✎ inline-rename flow still works.

**Also for the joint review:** decide per-screen whether any sub-screen warrants the **full-screen 7a–7g layout** rebuild vs. staying a restyled centered card.

## How to continue / verify

- **Dev server:** `.claude/launch.json` has a `vite` config on **port 3210**. `preview_start {name:"vite"}`. Screenshots may not composite → use `read_page` / `javascript_tool` / computed styles + `window.CartClash.openX(...)` to introspect. HUD needs a real match to see.
- **Gates:** `npm run typecheck`, `npm run build` (CSS is in the client bundle — build on CSS changes), `npm run qa` (knip now passes). Commit per cut (`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).
- **Gotchas:** index.html line numbers shift as you edit (re-grep before editing); some index.html button lines have trailing whitespace (match exactly); `status:size` budget may bite on CSS growth; golden visual baselines are invalidated (regen after review); menu nav is *correctly* blocked while an overlay (e.g. first-run How-To) is open; `lqBtn` const is now unused (harmless).

## Paste-able opener for the next window

```text
Continue the "Fight Night" UI redesign on branch redesign/fight-night-ui (repo cart-rave).
Read docs/planning/fight-night-ui-handover.md, then the plan at
~/.claude/plans/c-users-wyatt-downloads-game-menu-ui-re-snazzy-floyd.md, then `git log --oneline`
on the branch. 6 cuts are committed (Foundation, menu 3a, HUD 6a, overlay shell, challenges
REDEEMED, settings segmented). Verify current state (npm run typecheck/build; dev server via
launch.json "vite" port 3210; introspect overlays with window.CartClash.openX — screenshots may
not composite). Then continue path-A sub-screens (SFX slider, customize, how-to, pause) + Results
podium/receipt + Friends model-B lobby, per the plan. Commit per cut. Do a joint visual review
before the full-screen 7a–7g rebuild decision.
```
