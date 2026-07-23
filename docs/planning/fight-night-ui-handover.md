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
- **State: the full-screen rebuild is 6 of 7 done.** Only **7e Friends** is left. 7f Pause is a trim.
- **Verification caveat:** the Browser pane **won't composite screenshots on this host** → everything
  was verified via DOM + computed-style + scripted-interaction introspection, **never by eye**. No
  screen has had a visual sign-off except 7a and 7c (Wyatt looked at those in a real browser).

## Screen status

| Screen | State |
|---|---|
| 7a Customize | ✅ rebuilt + Wyatt-approved ("looks and works great") |
| 7c Settings | ✅ rebuilt + reviewed — chips resized, keycaps slabbed, remapping notice dropped |
| 7b Challenges | ✅ rebuilt — 2-col price-tag grid, live restock kicker |
| 7d How To | ✅ rebuilt — three aisle tags across + SCORING / FULL CONTROLS strips |
| 7g Results | ✅ rebuilt + reviewed — podium left / receipt right, ledger cut, YOU pill, spill + challenge lines |
| **7e Friends** | ⬜ **NEXT** — room code left / CHECKOUT LINE roster right + region·ping footer |
| 7f Pause | ⬜ **stays a centred 860px panel** (mock says so) — only needs right-aligned round/time context, 860px width, and the extra SCORING section dropped |

## ⚠️ READ FIRST — three traps that have each bitten more than once

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

## Locked decisions

1. **One branch**, all parts; commit per cut.
2. **Slab material** replaces the white die-cut contour on panels/chips/buttons **game-wide** (kept only on emblems + Road Rage lettering).
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

## Key implementation facts (so you don't re-derive)

- **Menu markup** lives in `index.html` (invariant — `cart-rave-menu.html` is deleted, don't recreate). Old audio + controls panels stay **mounted-but-hidden** in `.cr-legacy[hidden]` so `syncAudioUi` / mute / `updateControlsPanelUI` keep working.
- **`.cr-screen` shell** (`cart-rave-menu.css` ~1315): Road Rage title top-left over a Goldman kicker; named regions `-rail` / `-stage` / `-panel` / `-panels` / `-actions` / `-hint`; collapse at 1024 and 768. Rebuilding a screen is markup restructure + region contents, not a new layout system.
- **Arena picker** is a pager (`#cr-arena-prev/next`) backed by the **hidden `.cr-level-btn` radiogroup** — the buttons stay the data model.
- **emblemForSlot(slot)** (npcNames.js): NPC → personality emblem; human → shopper glyph tinted by cart colour; empty → null.
- **Roster model (7e — read this before starting):** `buildRosterRows(netSlots, roundScores, isLobbyRoster)` in hud.js is the ONE slot→row resolver — compact scoreboard and CHECKOUT LINE both read it. The lobby READY button is a **proxy** that clicks `elements.readyBtn`; never add a second `MSG.readyToggle` send. The lobby element is mounted on `document.body` and forced hidden in the menu-visible and `suppressHud` branches. Full-screen gate is **`phase === "lobby"` && friends** only — `isLobbyRoster` (`lobby || countdown`) would cover the 3-2-1.
- **Difficulty chips:** `updateDiffButtons`/`initDiffSelect` drive **every** `.cr-diff-row .cr-diff-btn` in the document — one write path to `settingsStore.aiDifficulty`, no new wiring needed for a new row.
- **Results DOM** is built in `resultsOverlay.js` and returns `{overlay, panel, kicker, title, verdict, finalScores, receipt, playAgain, mainMenuBtn}` — `statsLine`/`history` are **gone**. `.results-body` is podium / receipt / actions and nothing else.
- **Results stats** (`matchStats.js` → `snapshotMatchStats()`): BODIES=`localKos`, SPILLS CAUSED=`localSpills` (recorded in simulation.js beside the SPILL progression event), BEST COMBO=`maxComboTier`, TIMES BODIED=`localDeaths`, plus optional `leaderDowns`/`criticalKos`. The CHALLENGE receipt line diffs against `challengesCompleteAtRoundStart`, snapshotted at countdown in main.js.
- **main.js rewrites the results button labels at runtime** (rematch countdown, "WAITING FOR HOST…") — any decoration inside those buttons must live in CSS pseudo-elements, not child spans.

## Remaining work

**7e Friends (the last screen).** Two pieces, per the plan:
1. **Menu invite chrome** (`#cr-friends-screen`) onto the `.cr-screen` shell: ROOM CODE Goldman cyan ~36px nowrap + hairline COPY + share hint; host BOT DIFFICULTY row (already wired); action stays ENTER GAME.
2. **Full-screen CHECKOUT LINE lobby** — already exists from `2ccabef`/`de6797f` as its own layout; decide whether it adopts `.cr-screen` too, or stays as-is. Roster rows are price tags: emblem, name, HOST pip cyan, status (READY portal-green / "PICKING CART…" 40%); empty slots dashed with "WAITING FOR SHOPPER…". Footer meta: region · ping.

**Owed verifications (need a visible browser — `npm run dev:local`, not the pane):**
1. **A real match** → the whole **HUD** (6a), then **results on a finished round**: count-up + receipt print cadence, the new SPILLS/CHALLENGE lines with real data, defeat/victory treatments, PLAY AGAIN host gating.
2. **A live friends room, two clients** → roster/ready streaming, the **lobby→countdown handoff**, **rematch** re-entry, LEAVE ROOM teardown, `?room=` JOIN.
3. **Responsive sweep** at 1025 / 1024 / 768 / 380 + `prefers-reduced-motion`.
4. **Golden visual baselines** are still invalidated — regen (`npm run shoot`) once the review signs off.

**Known-but-parked:**
- `.results-defeat .results-title { --title-glow }` **never applies** — main.js sets that custom property inline and no stylesheet rule can outrank it. Cosmetic only (the panel filter desaturates anyway). Pre-existing.
- `?room=` JOIN rehome — FRIENDS row → "JOIN LOBBY" → `enterPlayMode`; still on main.js's old ad-hoc path.
- Part-1 polish (item 7 above).
- The REDEEMED stamp on 7b has only been probed synthetically — no challenge has actually completed.

## How to continue / verify

- **Dev server:** `.claude/launch.json` has `vite` (3210), `vite-alt` (3211), `vite-perf` (3212). The other session usually holds 3210/3211 — use `vite-perf`.
- **Gates:** `npm run qa` (report by number) + `npm run build` (CSS is in the client bundle). Last run: **773/773 tests, 77 files**, all sub-gates green.
- **Forcing a round to end (dev):** `window.CartClashDev.run("scores 7 4 2 9")` then `run("rewind 800")` → podium in ~2s. `CartClashDev.help()` lists the rest.
- **Gotchas:** index.html line numbers shift as you edit (re-grep before editing); `status:size` gates on docs/STATUS.md tokens; menu nav is *correctly* blocked while an overlay is open.

## Paste-able opener for the next window

```text
Continue the "Fight Night" UI redesign on branch redesign/fight-night-ui (repo cart-rave).
START with the "READ FIRST" section of docs/planning/fight-night-ui-handover.md — it has the
current state, the three traps that have each bitten more than once, and what my Browser pane
lies about. Then the design source (design_handoff_main_menu/README.md + "Menu Redesign
Concepts.dc.html" inside ~/Downloads/Game Menu UI Refinement.zip) and `git log --oneline`.

Six of seven sub-screens are rebuilt as full-screen surfaces on the shared .cr-screen shell.
7e FRIENDS is the last one and the riskiest — it crosses the netcode↔HUD↔menu seam. Read the
"Roster model (7e)" bullet and the plan's 7e section before touching anything: there must stay
exactly one slot→row resolver and one MSG.readyToggle send, and the full-screen gate is
phase === "lobby" && friends, never isLobbyRoster.

Rules of engagement: plan → my ack → apply. One screen per cut. Commit by EXPLICIT path and
`git diff` your own files right before committing — a second agent session shares this checkout
and has already both swept my lines into its commit and clobbered an edit outright. Delete the
old modal CSS for each screen you rebuild rather than layering over it, and use a two-class
selector whenever you override a shared shell class. Nothing in-match (HUD, results on a real
round, a live friends lobby) has ever been seen — that still needs a visible browser.
```
