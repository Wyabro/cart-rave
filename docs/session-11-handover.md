# Cart Rave — Session 11 Handover
Date: End of Session 10 (April 20, 2026)
Days to deadline: 10 days, 22 hours (May 1, 2026 @ 13:37 UTC)
Production: cartrave.lol — latest commits deployed and working

## Session 10 accomplishments
- P0 race condition fixed and verified (hello-gated cart creation)
- Room isolation bug found and fixed (PartyKit room now routes from URL ?room=)
- Floor physics drag cut for jam (visual-only rotation)
- Mute defaults to ON during testing
- Slot mapping diagnostic log fixed to print frame numbers
- Cursor native browser automation discovered as debug workflow
- .cursorrules updated with all new design decisions
- docs/post-jam-ideas.md created with deferred work

## P0 verification — CONFIRMED
- Two-browser manual test (Chrome + incognito) in ?room=yourpick123
- Each window got unique youConnId, correctly assigned to different slots
  (slot 0 = hotPink, slot 1 = electricBlue)
- Hello payload shows 2 humans + 2 NPCs as expected
- Driving confirmed in host window

## NEW BUG FOUND — FIX FIRST NEXT SESSION
Non-host cart doesn't respawn after falling. Persists across reload.

Cause (already diagnosed by Cursor): in main.js host fall/respawn loop,
there's an explicit filter `if (!slot || slot.kind !== "npc") continue;`
that skips remote human slots. So the host respawns its own cart and
NPCs, but NOT other players. Fix: remove the NPC-only filter so the
host respawns ALL remote carts (NPCs and non-host humans).

This bug didn't surface before today because solo testing never had
a second human. Room isolation fix unblocked multiplayer testing,
which revealed it.

## Locked order of operations
1. Fix non-host respawn (remove NPC-only filter in host fall loop)
2. 60Hz input rate bump (Gemini's keeper — bump client_input from
   20Hz to 60Hz, keep host_transform at 20Hz)
3. Add Vibe Jam widget script tag to index.html (30 seconds)
4. Round structure: 60s host-authoritative timer, last-cart-standing
5. Scoring: Standard +1, Critical +2 (max Shift velocity),
   Target +3 (vs leader), Jackpot +5 (Critical vs Target).
   Leader glows red emissive.
6. Color picker UI: 5 options incl. neonOrange,
   first-come-first-served, colors tied to slots, NPCs fill remainder
7. Results screen: on round end, freezes physics, shows scores +
   Play Again + Exit to Vibe Jam portal + session match history
   (in-memory only, no persistence)
8. Polish / bugfix buffer

## Cursor quirks noticed in Session 10
- Sometimes claims "Changes Made" without actually making the change.
  Always ask for raw file contents when in doubt, not just a diff.
- Can produce diffs where old content isn't deleted, only appended
  alongside new content. Review diffs carefully.
- Native browser automation works for single-tab testing but can't
  isolate browser contexts — use manual normal+incognito testing
  for multiplayer verification.
- Subagents (Cursor 2.4+) are active and visible. Parallel work
  is normal, don't panic when multiple are running.
- Vercel CLI not installed locally; Git-integrated deploys work fine.

## Known open items (deferred)
- Cart top-heaviness: reframed as "shopping cart feel," not a bug
- hostSeq reset on host migration: untested, low priority unless it surfaces
- ~300 lines of diagnostic logs in step() to be stripped pre-submission
- window.__debug and window.__log bridges to be removed pre-submission

## Cut and in docs/post-jam-ideas.md
- Spilling cart contents on knockover
- Persistent leaderboard (Supabase)
- Drivable main menu with mode portals
- Gemini performance notes (draw call merging, exponential decay damping,
  client-side prediction, interpolation buffer tuning)
- Floor physics drag with proper scoring attribution
- 5-8 player scaling

## How to start Session 11
1. Fix the respawn bug first — it's a 1-line fix per Cursor's diagnosis
2. Then 60Hz bump and widget tag (quick wins)
3. Then round structure — the biggest remaining feature
4. Gemini review before submission for a second pass

You're in great shape. P0 is closed, architecture is solid, design is
locked, docs are current. Remaining work is feature building, not
mystery debugging.
