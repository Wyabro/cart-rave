# STATUS session log — 2026-08-08 → 2026-08-10

Moved out of [STATUS.md](../STATUS.md) on 2026-08-12 so the live file stays under the
token budget. Cut during **STORE-MUSIC-1**. Live STATUS keeps 2026-08-12 and 2026-08-11.

Nothing here is current truth — code and `git log` win.

---

2026-08-10 (CARGO-LATCH-1 · MENU-SFX-1 · CAPTURE-RING-LIMIT-1) — Housekeeping closed two
stale rows: CARGO-LATCH-1's fix actually landed 08-09 (`a20d547`) and is deployed
(`7569051`) — remaining work was the **CARGO-LATCH-PT-1** production playtest (solo pause +
host tab-return at boss fill); MENU-SFX-1's menu SFX slider shipped under the
audio-controls / VOICE-BUS-1 work and closed as absorbed. **CAPTURE-RING-LIMIT-1 landed:**
capture ring 80 → 400 (~13 min depth at the accepted rate) and analytics POSTs capped at
5/60s per IP (`ANALYTICS_MAX_PER_WINDOW`) — the analytics fabrication budget drops 6× and
the 20k-row ring cycles in ~80 min at the cap. Not player-visible; prod smoke check rides
the next ship. Deployed `7569051` · Worker `8e5f274f` remains current.

2026-08-09 (retroactive analytics cards) — Three analytics features landed 08-09 without card
IDs (`d18568a` + `30a8151`, `b6de16e`, `df8da00`) and are now carded retroactively:
**ANLX-GEO-1** (CF geo → props, returning sessions, ttFirstMatch, summary rollups),
**ANLX-PAGEHOST-1** (pageHost stamp + cartclash.lol OG/PartySocket hosts), **ANLX-GLITCH-1**
(Glitch festival tracker bridge + custom events). All pushed, **not deployed**; writeups in
[completed-work.md](./planning/completed-work.md), IDs on the do-not-reopen list.

2026-08-09 (CART-MODEL-1 local visual PASS) — Repaired the basket surfaces exposed by the
replacement sunglasses, restored the clean smile backing, and tapered only the two side closures.
Front, side, and rear local views passed. Both UV channels survive WebP and Draco. The model fix is
in `9c176ae`; Wyatt passed it in the dev build. The card is closed, but this change is not deployed.

2026-08-08 (UI-FRAME-1 + ESC-PANEL-1 closed — absorbed) — Both `[SHIP-1 E1]` look rows audited:
their intent already shipped under the Fight Night redesign (ESC pause 7f via `2192461` + `c5be94f`
+ 3 fix rounds, shared slab shell `87790dc`) and RESULTS-1 (7g); no commit ever cited either ID.
Closed as absorbed — BACKLOG rows + Work-order entry deleted, SHIP-1 E1 updated, both IDs on the
do-not-reopen list, writeup in [completed-work.md](./planning/completed-work.md). **Named
residual:** a paused player cannot read standings (7f deliberately dropped the ESC scoring chart;
it now lives on HOW TO PLAY AISLE 7) — fresh card only if Wyatt wants it back.

2026-08-08 (PAD-MENU-1 PASS — controller menu navigation polish) — Four pad-nav levers closed
after the 07-20 modal-scoping groundwork: text inputs + the whole `#cr-join` row (room-code +
GO) out of the pad/keyboard ring (FRIENDS ↓ → CUSTOMIZE), bare `input[type=range]` nudged by
d-pad like the `role="slider"` tracks + a real hue-slider keydown handler, idle re-seed when a
chip rebuild destroys the focused node (gated on the node being disconnected — never steals from
a live input or empty chrome), and all four sub-screen hint rows swapped to pad copy on gamepad
input. `gamepadNav.test.js` 18 → 25 + new `padMenuHints.test.js`; QA 7/7; Wyatt pad-in-hand PASS.
Not this card: ring-vs-`.is-selected` on non-command controls, and the main-bar LB/RB ARENA hint
(`ARENA-BUMPER-HINT-1`).
