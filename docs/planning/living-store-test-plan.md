# Living Store — deferred netcode test plan

Status: **TODO** (deferred by Wyatt 2026-07-10 — "test fully later"). Solo-mode behavior
for everything below is already verified in-browser; this checklist covers the paths that
only exist with a real second client. Feature commits: `03edc7c` (Living Cargo),
`b7ceeb2` (directive engine + presentation), plus the scheduling/Rush Hour tuning commit
that follows it.

## Setup

Two browsers (or browser + phone) through `npm run dev:local`, quickplay/friends room.
Use `127.0.0.1` (not `localhost`) for the wrangler control plane. Keep both tabs visible
— a hidden tab freezes its rAF loop and stalls everything client-side.

## Living Cargo (Phase 1)

- [ ] Cargo bay fill matches each cart's HUD score on BOTH host and client (2 items at
      0 → 12 at 8+). Watch after every KO — clients derive fullness from synced
      `roundScores`, so any mismatch means a score-sync bug, not a cargo bug.
- [ ] Ram-spill on a remote cart: groceries fly on both machines, spill count scales
      with the victim's score (3 empty → 12 full; `count` rides `MSG.spill`).
- [ ] Spill comeback: the spilled cart visibly speeds up on BOTH machines for ~2.6s
      (client arms `spillBoostUntilMs` in `handleRemoteSpill` so prediction matches the
      host — watch for rubber-banding on the buffed cart; some reconcile jitter at buff
      start/end is acceptable, sustained warping is not).
- [ ] Basket visually restocks ~3s after a surviving ram-spill on both machines.
- [ ] Top-heavy: a full-cargo cart corners visibly wider on the client's own predicted
      cart (fullness feeds grip on both sides — desync here = prediction fighting host).

## Directive engine (Phase 2)

- [ ] Directive fires on host → callout + HUD countdown chip appear on BOTH machines
      within a beat (one-shot `MSG.directive`; unreliable channel — if a client ever
      misses one entirely, we need a retry/state-sync, note it).
- [ ] Chip seconds/drain agree between machines (each anchors to its own receive time —
      up to ~0.5s skew is by design).
- [ ] Flash Sale: rams visibly hit harder on the CLIENT as victim (host-resolved physics).
- [ ] Express Lane: client's own boost charges faster (client-side prediction uses the
      applied override — laggy charge here means the override didn't land).
- [ ] Double Bag: KO during window shows doubled points in both kill feeds AND both
      scoreboards (reward rides falls[]; score rides round sync — they must agree).
- [ ] Spill Bonus: client rammer force-spills a cart → client's score +1 (host-side
      lastHitBy attribution for a remote attacker is the risky path).
- [ ] Rush Hour: both carts visibly faster; client cart doesn't rubber-band (override
      must be applied client-side for prediction).
- [ ] Directive expiry: values restore on both machines (post-window rams/boosts feel
      base-line again).
- [ ] **Host migration mid-window**: kill the host tab during an active directive.
      Expected: directive effect dies with the old host (client restores on its own
      clock), new host derives remaining schedule slots from round-elapsed time and
      skips stale ones — no double-fire, no directive in the last 30s.
- [ ] Sudden Death: no directive fires during SD; a window ending as SD starts restores
      cleanly on both machines.

## Presentation / mobile (phone pass)

- [ ] Directive callout readable on phone (feature size), regular callouts noticeably
      smaller and out of the way of gameplay.
- [ ] Focus window: during a directive's 5.2s hold, kill/leader callouts stay silent on
      both machines; countdown beeps and sudden-death still cut through.
- [ ] HUD chip legible under the timer on phone portrait + landscape; doesn't collide
      with touch controls.
- [ ] Three directives per round land ~20s/55s/90s (±5s) and never inside the last 30s.
