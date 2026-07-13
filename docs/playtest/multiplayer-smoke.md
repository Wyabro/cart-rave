# Multiplayer smoke checklist (NET-1 — the V2 gate)

The live two-browser/phone session that closes NET-1. Wraps — does **not** replace — the
existing deep plans; run all three in one sitting:

1. This file top-to-bottom (core loop).
2. [living-store-test-plan.md](../planning/living-store-test-plan.md) (cargo + directives, two-client).
3. [host-migration-test-plan.md](../planning/host-migration-test-plan.md) (clean-close + silent-drop, 3 clients).

**Setup:** `npm run dev:local`, all clients on `127.0.0.1` (never `localhost`). Every
window **visible side-by-side** — a hidden tab freezes its rAF loop and fakes desync.
Label windows by join order (C1/C2/C3). DevTools console open on at least two clients.
Phone as third client where possible. Also repeat §A once against **production** (deployed
Worker) — TURN/ICE behaves differently than local.

## A. Core loop (2 clients)

- [ ] Friends flow: C1 creates, shares `?room=` link, C2 joins — both see both carts + correct colors/names
- [ ] Color pick conflicts: both try the same color; resolution sane on both screens
- [ ] Ready-up: round starts only when both ready; un-ready works; host glyph on C1
- [ ] Countdown + GO simultaneous on both (within a beat)
- [ ] **Feel parity, C2 (non-host):** drive/boost/hop feel ≈ solo — no rubber-banding, no eaten hops (the reconciliation-hop fix — hammer hop on Sundial slopes), no eaten boosts
- [ ] Ram each other 10+ times: hits land where they look like they land on BOTH screens; kill feed + score agree everywhere
- [ ] Remote cart motion smooth (interp), no teleporting; groceries/spills mirror on both
- [ ] HUD parity: scores, cargo bays, timer, combo kickers agree between machines all round
- [ ] Full 150 s round → podium: same winner, same scores, both screens
- [ ] Winner-cam skip (new): C1 presses a key during the winner cam — C1 jumps to results; C2's own camera/results are unaffected (skip is local presentation only, not broadcast) — confirm this is the intended feel, not a surprise
- [ ] **Play again → quickplay arena rotation** (shipped, never live-tested): host picks a new arena at the rematch seam — masked crossfade + "NEXT ARENA" toast on BOTH clients, spawn ring correct on the new arena, no physics during swap, round 2 plays clean
- [ ] Rematch ×3 minimum — the seam is where state leaks live
- [ ] Sudden Death (engineer a tie): SD enters/resolves identically on both; no directive during SD
- [ ] Announcer: same major beats fire on both clients (first blood, SD); no double-fire

## B. Join/leave lifecycle

- [ ] C2 quits to menu mid-round: slot goes NPC on C1's screen within a beat, no wedge
- [ ] Failed/rejected join (room full, or join a since-closed room): joining client sees a toast explaining why, not a silent bounce to menu
- [ ] C2 rejoins the same room: gets a slot, sees correct mid-round or lobby state
- [ ] Late join during a running round: joiner lands in a sane state (spectate/lobby per design), no crash on either side
- [ ] C2 refreshes (F5) mid-round: room recovers, no ghost cart, no double slot
- [ ] Sole-human refresh (solo room): NET-MIG-2 fix — room re-hosts, no 5–10 s hostless wedge
- [ ] Both quit → both re-enter quickplay → matched into a working room again

## C. Adversarial-network sanity (DevTools → Network)

- [ ] Throttle C2 to "Slow 3G" for 30 s: degrades (lag) but recovers; no permanent desync after restoring
- [ ] Brief offline blip (2 s) on C2: reconnect or clean drop — never a half-alive zombie state
- [ ] No `Oversized … frame dropped` warnings in normal play (size gate must be silent)
- [ ] Console: no error spam, no repeated re-offer thrash in `[netcode]`/`[p2p]` at any point above

## D. Host backgrounding (known sharp edge — observe, characterize)

- [ ] Host (C1) alt-tabs / minimizes 15 s mid-round: what do C2/C3 experience? (Hidden tab freezes host rAF = authoritative sim stalls.) Note exactly: freeze? rubber-band? recovery time on host return?
- [ ] Same on phone-as-host: screen lock 10 s
- [ ] Verdict to record: is the current behavior shippable with a "keep the tab visible" known-issue, or does it need engineering before V2?

## E. Pass criteria

NET-1 closes when: a full session (join → 3+ rounds with rotation → SD → migration → rejoin)
completes with **zero wedges**, feel parity for the non-host, scores/HUD agreeing on every
screen, silent consoles, and both companion checklists green. File everything else as
S1/S2 — a wedge or desync anywhere above keeps the gate open.
