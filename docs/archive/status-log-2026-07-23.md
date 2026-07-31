# Status log — 2026-07-23 (Fight Night UI redesign: merged + deployed)

**Moved out of [STATUS.md](../STATUS.md) on 2026-07-31** when the live status log crossed its
8,000-token budget. This is history, not current truth — `git log` and the code are
authoritative.

**What stayed live in STATUS.md:** the one-line decision-index entry **D-FIGHTNIGHT-1**, and
the "Parallel track — Fight Night UI redesign" paragraph under *Current focus* (which still
carries the owed production-verification list as **FIGHT-VERIFY-1**). The full progress log
was never in STATUS anyway — it lives in
[planning/fight-night-ui-handover.md](../planning/fight-night-ui-handover.md).

---

2026-07-23 (UI — fight-night redesign MERGED + DEPLOYED to production) — PR #3 merged into
`cart-clash` (merge commit `56dfa61`), then shipped via `npm run ship`. Live prod bundle carries
`sha:56dfa61` (**verified against the fetched asset**, not the upload log), entry
`index-ekljSWqj.js`, Worker Version `3f681e27-68e0-4992-ba9c-53d3c9ff08df` at
https://cart-rave.wyabro.workers.dev — supersedes the AI-DIFF-1 bundle `index-Dxyw7U08.js`. Cache
note: HTML is edge-cached (`CF-Cache-Status: HIT`, `max-age=0 must-revalidate`) — a stale first
paint resolves on reload, not a failed deploy. The redesign rebuilds **every 2D surface** onto one
"Fight Night" language: 3a main menu, 6a HUD, 7a–7g sub-screens/ESC/results, both loading screens,
a game-wide die-cut→slab sweep (locked decision 2 closed, audited against a live DOM), and one
unified Customize chip recipe. **Verified by DOM geometry + computed styles only — never by eye
except 7a/7c/3a.** Merge is deliberately for **full verification IN PRODUCTION** (Wyatt): still
unseen — a live match (HUD + results on a finished round), a two-client friends room (the CHECKOUT
LINE lobby has never rendered anywhere), a cold boot into each arena (both loading screens unseen
in their real moment), and every hover/press surface the sweep + chip cut touched. **PARKED:**
victory confetti + defeat wilt are missing in multiplayer — investigation, leading hypothesis and
the one-line two-client test that settles it are in the handover under "Known-but-parked". Full
progress log: [planning/fight-night-ui-handover.md](../planning/fight-night-ui-handover.md).

---

## Later status on this work

- The owed production verification became card **FIGHT-VERIFY-1**. As of 2026-07-31 its agent
  half is PARTIAL — `npm run sheet --all` proves the feed, score strip, timer, directive chip
  and boost bar across portrait, landscape and touch viewports; loading screens, hover/press
  and the podium remain unreachable by the sheet.
- The confetti / defeat-wilt-in-MP parking is unchanged; the settling test is still the
  one-liner in the handover.
