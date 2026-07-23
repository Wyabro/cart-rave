# Fight Night UI Redesign — Session Handover

> Working doc for continuing the "Fight Night" UI redesign. Read this, then the
> **authoritative plan**, then `git log` on the branch, then verify current state.

## TL;DR

- **Branch:** `redesign/fight-night-ui` (off `cart-clash`). Everything below is committed there, **unpushed**.
- **Authoritative plan:** `C:\Users\wyatt\.claude\plans\c-users-wyatt-downloads-game-menu-ui-re-snazzy-floyd.md`
  (full 3a/6a/7a–7g specs, locked decisions, verification, risks). This handover is the *progress log*; the plan is the *spec*.
- **Design source:** `Game Menu UI Refinement.zip` → `design_handoff_main_menu/README.md` + `Menu Redesign Concepts.dc.html`
  (approved badges: **3a** menu, **6a** HUD, **7a–7g** sub-screens/ESC/results). The plan captures every measurement.
- **Progress:** **12 cuts committed** — Foundation, menu 3a, HUD 6a, overlay shell, challenges REDEEMED, settings segmented, **settings SFX (7c), customize (7a), how-to (7d), pause (7f), results podium+receipt (7g), Friends lobby + invite chrome (7e)**. Every screen in the plan now has its path-A pass. What remains: the **joint visual review**, the **full-screen 7a–7g rebuild decision**, Part-1 polish, and the in-match verifications listed below.
- **Verification caveat:** the Browser pane **won't composite screenshots on this host** → everything was verified via DOM + computed-style + scripted-interaction introspection (`javascript_tool`, `window.CartClash.openX`), **never by eye**. No visual/pixel review has happened yet. The user wants a joint visual review once the full system is in.
- **Second caveat (new):** mode entry **cannot complete** while the Browser pane is hidden — the loading pipeline stalls before a round runs (rAF throttling), so **no in-match surface has been exercised**: HUD, results-in-match, and a live friends room are all still theory. `npm run dev:local` on a visible browser is the way to close these.

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
| `690d5c6` | 3d Settings SFX (7c) | Second `.cr-vol-row` (⚡) → `setSfxSliderVolume`; `syncAudioUi`/`syncSettingsAudioUi` carry `sfxPct/sfxNorm`; one shared `wireSettingsVolTrack()` (click + ←/→) for both rows. MUSIC = palette primary, SFX = palette secondary. |
| `9646a02` | 3e Customize (7a) | Color chips → dark ink slabs (cart color in the border + active glow); CUSTOM keeps the white die-cut ring; tabs → slab with a **yellow** active fill; sunglasses/pattern chips → slab, active ring cyan→yellow. CSS only. |
| `bdc1fbc` | 3f How To (7d) | Four bullet sections → **AISLE 1/2/3** tag cards (cyan/magenta/yellow) + **SCORING** and **FULL CONTROLS** strips; directive grid folded into AISLE 3; dead `.cr-howto-section/-bullets/-directive` CSS removed; both responsive bands rewritten. |
| `2192461` | 3g Pause (7f) | Title → **PAUSED** (Road Rage, clamp→56px) + `.esc-context` round/time read off the HUD timer DOM; ANNOUNCER+DISPLAY → one **2×2 OPTIONS grid**; RESTART→"RESTART ROUND" (cyan), QUIT→"MAIN MENU" (ghost). |
| `3e6b927` | 3h Results (7g) | PA header (`◆ STORE PA` + "THE STORE IS NOW CLOSED") with the verdict on its own line; ranked list → **4-column podium** (150/102/72/48, winner magenta + crown, YOU cyan) ; **match receipt** (BODIES/BEST COMBO/TIMES BODIED + optional LEADER DOWNS/CRITICALS, yellow TOTAL, CSS barcode) printing on the count-up schedule. |
| `2ccabef` | 4 Friends lobby (7e) | `buildRosterRows()` factored out of `updateScores`; new full-screen **CHECKOUT LINE** (`updateLobbyScreen`) gated on `phase==="lobby" && friends`; READY proxies `hud-ready-btn` (no START button); LEAVE ROOM → existing `returnToMenu` teardown via new `onLeaveRoom` option. |
| `de6797f` | 4b Invite chrome (7e) | ROOM CODE slab + host BOT DIFFICULTY row on `#cr-friends-screen`; `updateDiffButtons`/`initDiffSelect` now drive **every** `.cr-diff-row`, so invite + context panel share one controller over `settingsStore.aiDifficulty`. |

## Verified this session (DOM/interaction only — NOT visual)

- **Menu (3a):** W/S + ↑/↓ nav, hover=select, Enter activate, ←/→ arena paging (re-themes backdrop), difficulty chips, per-item context show/hide, overlay-open gating — no console errors. Regions positioned correctly (hero L, plate TR, context BR, hint bar bottom).
- **Overlays:** Settings + Challenges open with the slab panel (hairline + `3px 3px 0` extrude, ink surface, no white ring), yellow DONE, Road Rage title.
- **Segmented quality:** 3 chips reflect `getQualityTier()`, active = yellow chip. (In the menu preview, auto-quality clamps to low with no live renderer, so HIGH may not "stick" there — correct in-game.)

**Verified in the second session (DOM/computed-style/interaction only):**

- **7c:** both AUDIO rows render with the right fills; click at 75% sets 75 and moves `audioStore.sfxVolume`; ←/→ steps; music row unaffected.
- **7a:** chips/tabs carry the slab extrude, active tab fills `#ffe53d`, CUSTOM keeps its 1.5px white contour, sunglasses/pattern active rings are yellow.
- **7d:** three aisles carry the right accents + `8px 8px 8px 22px` tag radius; both strips render every chip; **zero overflow at 1280×720 and 375×812**.
- **7f:** PAUSED at 56px Road Rage; sections read AUDIO/OPTIONS/CONTROLS/SCORING; 2×2 grid with all four toggles unclipped; yellow/cyan/ghost actions; fits 720px height.
- **7g:** podium heights 150/102/72/48, winner magenta / YOU cyan / others hairline, yellow TOTAL, 16px barcode, panel 620px (mounted synthetically into the real overlay — see below).
- **7e:** lobby DOM built at HUD init and starts hidden; populated it shows tag lanes, cyan YOU lane, dashed empty lane, yellow READY / ghost LEAVE ROOM; lobby READY forwards exactly one click to `#ready-button`. Invite: cyan 26px code; clicking HARD there moves the store **and** the menu row's active chip.
- **Gates:** `npm run qa` **green — 767/767 tests, 77 files**, knip + briefing + arch + health:check pass (`status:size` needed the 07-22 STATUS window condensed first — that was pre-existing at HEAD, not caused by this work). `npm run build` green.

**Still NOT verified:** anything's actual *look*; the whole **HUD**; **results in a real match** (7g was checked by mounting the podium/receipt markup into the real overlay, not by finishing a round); **a live friends room** (lobby→countdown handoff, rematch re-entry, LEAVE ROOM teardown); mobile bands beyond the two widths above; the REDEEMED stamp (needs a completed challenge).

## Key implementation facts (so you don't re-derive)

- **Menu markup** lives in `index.html` (invariant — `cart-rave-menu.html` is deleted, don't recreate). The old audio + controls panels are kept **mounted-but-hidden** inside `.cr-legacy[hidden]` so existing JS wiring (`syncAudioUi`, mute, `updateControlsPanelUI`) keeps working; the visible menu drops them.
- **Arena picker** is now a pager (`#cr-arena-prev/next`, `#cr-arena-name/sub`) backed by the **hidden `.cr-level-btn` radiogroup** (`#cr-level-row[hidden]`) — the buttons stay the data model so `initLevelSelect`/`updateLevelButtons`/`selectLevel` are unchanged; `updateArenaPager()` mirrors the active button, `pageArena(dir)` cycles unlocked ones. `selectLevel` calls `updateArenaPager()`.
- **Selection controller** (`initCommandList`, `setMenuSelection`, `MENU_ITEMS` config, `onMenuNavKeydown`) is in cart-rave-menu.js. Command rows keep `.cr-btn` + `data-action` so the existing delegated click handler still routes them (solo/quickplay/friends → `cartrave:menu`; customize/challenges/howto/settings → overlays). Stable ids `#cr-solo/#cr-quickplay/#cr-friends` preserved.
- **emblemForSlot(slot)** (npcNames.js): NPC → personality emblem; human → `{icon:'shopper', color: cartColorCss(slot.color), label:'SHOPPER'}`; empty → null. `slot.kind` is `"npc"|"human"|""`; `slot.color` is a cart-color key. Now consumed by hud.js `updateScores` (so `knip` passes). `getNpcPersonality`/`PERSONALITY_META` import removed from hud.js.
- **HUD** (`src/hud.js` + `src/ui/styles/hud.css`) only renders in-match. Slab sweep + skew applied; `--sticker-*` kept only for emblems. `announcer.css` + icons.js emblem contours **untouched** (invariant).
- **Results stats** live in `src/scoring/matchStats.js` via `snapshotMatchStats()`: BODIES=`localKos`(+`kosBySlot`), BEST COMBO=`maxComboTier`, TIMES BODIED=`localDeaths`(+`deathsBySlot`). Count-up in `resultsOverlay.js` uses `countUpNumber` at `220 + i*90ms`.
- **Results header split (7g):** `initResultsOverlay` now returns `kicker`/`verdict`/`receipt` too. `title` is the **static** PA headline; main.js writes the round outcome into **`verdict`** (three branches: draw / lastStanding / normal) and still sets `--title-glow` on `title`. `animateResultsPodiumShow` takes `verdict` + `receiptLines` and an optional per-row `format(n)`.
- **Roster model (7e):** `buildRosterRows(netSlots, roundScores, isLobbyRoster)` in hud.js is the ONE slot→row resolver — compact scoreboard and CHECKOUT LINE both read it. The lobby's READY button is a **proxy** that clicks `elements.readyBtn`; never add a second `MSG.readyToggle` send. The lobby element is mounted on `document.body` (not a HUD region) and forced hidden in the menu-visible and `suppressHud` branches.
- **Difficulty chips:** `updateDiffButtons`/`initDiffSelect` (cart-rave-menu.js) drive **every** `.cr-diff-row .cr-diff-btn` in the document — adding another row anywhere needs no new wiring, and there must stay exactly one write path to `settingsStore.aiDifficulty`.

## Remaining work (the roadmap)

**Owed verifications (highest value, needs a visible browser — `npm run dev:local`):**
1. **A real match** → the whole **HUD** (6a), then the **results podium + receipt** on a finished round (count-up + receipt print cadence, defeat/victory treatments, PLAY AGAIN/host gating).
2. **A live friends room, two clients** → CHECKOUT LINE roster/ready streaming, the **lobby→countdown handoff** (must clear before the 3-2-1), **rematch** re-entry into the lobby, LEAVE ROOM teardown, and `?room=` JOIN.
3. **Responsive sweep** at the 1025 / 1024 / 768 / 380 bands + `prefers-reduced-motion`.

**Deferred by decision, not blocked:**
- **7b Challenges reward pips** — checked and **dropped**: there is no `src/progression/challengeStore.js` reward field to read (only `eventIds.js` exists there), so "+N PTS" would be invented economy. REDEEMED stamp stands.
- **`?room=` JOIN rehome** — FRIENDS row → "JOIN LOBBY" → `enterPlayMode` (skip invite chrome); still on main.js's old ad-hoc path.
- **Part-1 polish:** gamepad→`setMenuSelection` on the command list; hint-bar meta region via `/cdn-cgi/trace` (degrade on local) + ping; named mobile bands + skew/`nowrap` touch-target pass; verify the ✎ inline-rename flow still works.
- **Golden visual baselines** are still invalidated — regen (`npm run shoot`) after the review signs off.

**The joint review's job:** decide per-screen whether any sub-screen warrants the **full-screen 7a–7g layout** rebuild vs. staying a restyled centered card. Everything is currently a centered card except Results (620px panel) and the Friends lobby (already full-screen).

## How to continue / verify

- **Dev server:** `.claude/launch.json` has `vite` (3210) and `vite-alt` (3211) — use `vite-alt` if another session holds 3210. Screenshots may not composite → use `read_page` / `javascript_tool` / computed styles + `window.CartClash.openX(...)` to introspect.
- **In-match surfaces need a VISIBLE browser.** In a hidden Browser pane, mode entry never finishes (rAF throttling stalls the loading pipeline at "waiting for hello"), so phase stays `lobby` forever. For HUD/results/friends work run `npm run dev:local` and drive a real window. Netcode also needs the worker: launch `party` (8787) and load the client from **`127.0.0.1`** — wrangler binds 127.0.0.1 only, so a `localhost` page can't reach it. The party route is `/parties/cart-rave-server/<room>` (binding name, not `main`).
- **Forcing a round to end (dev):** `window.CartClashDev.run("scores 7 4 2 9")` then `run("rewind 800")` → podium in ~2s. `CartClashDev.help()` lists the rest.
- **Gates:** `npm run typecheck`, `npm run build` (CSS is in the client bundle — build on CSS changes), `npm run qa`. Last full run: **767/767 tests, 77 files, all sub-gates green**. Commit per cut (`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).
- **Gotchas:** index.html line numbers shift as you edit (re-grep before editing); some index.html button lines have trailing whitespace (match exactly); `status:size` gates on **docs/STATUS.md** tokens (it tripped at HEAD this session — condensing the current date window fixes it, and the same over-budget file also fails `tests/batteryEvidence.test.js`); golden visual baselines are invalidated (regen after review); menu nav is *correctly* blocked while an overlay (e.g. first-run How-To) is open; `lqBtn` const is now unused (harmless).

## Paste-able opener for the next window

```text
Continue the "Fight Night" UI redesign on branch redesign/fight-night-ui (repo cart-rave).
Read docs/planning/fight-night-ui-handover.md, then the plan at
~/.claude/plans/c-users-wyatt-downloads-game-menu-ui-re-snazzy-floyd.md, then `git log --oneline`
on the branch. All 12 cuts are committed and `npm run qa` is green (767 tests) — every screen
has had its path-A pass, nothing is half-built.

What's left is verification and the review, not more building:
1. Run the game in a VISIBLE browser (`npm run dev:local`, load the client from 127.0.0.1 —
   a hidden Browser pane stalls mode entry, so nothing in-match has ever been seen).
2. Walk the surfaces with me: menu, HUD in a real match, results podium+receipt on a finished
   round (force it with CartClashDev.run("scores 7 4 2 9") then run("rewind 800")), pause,
   customize, how-to, settings, challenges, and a two-client friends room (CHECKOUT LINE →
   countdown handoff → rematch).
3. Then decide per screen whether it stays a restyled centered card or gets the full-screen
   7a–7g layout, and regen the golden baselines (`npm run shoot`).
```
