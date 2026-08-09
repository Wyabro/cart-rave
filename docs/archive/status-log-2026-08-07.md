# STATUS session log — 2026-08-07

Moved out of [STATUS.md](../STATUS.md) on 2026-08-09 during a status:size trim
(~4,198 / 4,200 tokens). Live STATUS kept 2026-08-08 → present.

Nothing here is current truth — code and `git log` win.

---

2026-08-07 (ONBOARD-ART-1 — HOW TO PLAY art rig landed; Block 2) —
The deck now takes art as a **drop-in directory**: drop `<token>.webp` (`drive` / `boost` /
`ram` / `hud` / `cargo`) into [src/assets/howto/](../../src/assets/howto/README.md) and that slot
turns on at the next build; no file → the slot stays dark, so the deck reads identical to the
playtested text-only deck. Optional `<token>.still.webp` swaps in under
`prefers-reduced-motion`. AISLE 4's callouts are gated behind `data-callouts="aimed"` and stay
hidden until the real frame lands and `--x`/`--y` are re-aimed. Verified in preview: qa 7/7,
prod build, zero-art regression (all 8 slides single-column), throwaway-file positive (AISLE 1
two-column + art), phone 375×812 (art inside 30svh, copy visible) and landscape 740×360 (art
dropped). The phone sweep caught a specificity trap — rekeying the desktop `:has()` rules to
`[data-art]` raised them to (0,3,0), so the phone/landscape one-column bands had to be rekeyed
too or an art slide squeezed into `286px 0px`. **Remaining:** Wyatt's webp captures + callout
aim. Do not shoot with `npm run shoot` (SHOOT-SOFTGL-1).

2026-08-07 (SPAWN-SUNDIAL-GAP-1 PASS + BACKLOG-GATE-3) — Sundial booth gap PASS; the fix had
already shipped 08-06 (`92c44f2`) under another card's commit subject and the row survived a full
day, so **BACKLOG-GATE-3** landed alongside it: a `commit-msg` hook (one card claim per code
commit), `npm run backlog:audit` (pickaxe an open row's own lever across git), IDs on 25
prose-named rows, and three house rules. **Block 1 is now empty** → Block 2, **CART-COLOR-DEPTH-1**.

2026-08-07 (HOLE-FRICTION-COMBINE-1 PASS) — Dynamic Min friction combine while overhanging the
center hole (`519d905`); Wyatt playtest PASS.

2026-08-07 (Block H desk-only completion: 12 cards closed, one commit each) — Remaining Block H
desk-only levers + five earlier desk-only cards landed as 12 commits (`cae4a35`…`7131f40`,
pushed `8af97f4`); none player-visible. Full list:
[completed-work.md](../planning/completed-work.md).

2026-08-07 (BACKLOG Block H opened; H1 3/7 landed, unpushed to prod) — Full principal-engineering
audit (physics/netcode/perf/input/arch/security/UX/testing) filed as 15 new cards across 3
sub-batches (H1 correctness, H2 perf + gamepad, H3 polish); 3 docs-accuracy fixes applied directly.
H1's first 3 desk-only levers landed same session — `CONNSTATE-REFLIP-1`, `LASTHITBY-MUTATE-1`,
`FREEZE-TELEMETRY-1` (writeups in
[completed-work.md](../planning/completed-work.md)).

2026-08-07 (PACE-KO-1 + COMBAT-READ-1 deployed `157bf81`; player checks owed) — Attributed KOs now
show the existing KO hitmarker/sting/flash as the victim crosses the shared below-rim no-return
marker (host sends the presentation-only confirm over P2P; the later full KO remains the loss-safe
fallback if that packet drops; fall depth / shatter / score / announcer / respawn timing unchanged),
and Critical KOs amplify the existing arena flash + world hitmarker on every peer; normal/self KOs
unchanged. PACE-KO-1 targeted 60/60 with the deferred bridge test first catching then verifying the
required callback seam; COMBAT-READ-1 targeted 50/50, full QA 7/7, production build, two-client
harness 6/6 (its first verification hit a partial dependency checkout — `npm install --ignore-scripts`
restored it; local Worker tests need sandbox escape because Wrangler writes under AppData). Worker
`7ea75009-7068-44b8-b54d-4ac73f4d5cea` is live under the same production verification. Remaining:
the player-visible checks in BACKLOG.
