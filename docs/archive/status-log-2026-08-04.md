# Archived STATUS session log — 2026-08-04

Rolled out of [docs/STATUS.md](../STATUS.md) on **2026-08-05** to bring the live file back under
its token budget. **Nothing here is current truth** — the code and `git log` are authoritative,
and anything from this window that still matters lives in
[completed-work.md](../planning/completed-work.md) or the relevant card row.

**What moved:** the five 2026-08-04 session entries (MAIN-1 CLOSED · FX-TIME-1 / SHADOW-ORDER-1 /
ARCH-DRIFT-1 wave · HOST-TAB-1 lever E · playtest export close · HOST-TAB-1 local wave), plus the
already-archived 2026-08-03 pointer stub that trailed them.

**What stayed live:** the 2026-08-05 entries in STATUS.md.

---

2026-08-04 (MAIN-1 CLOSED) — §8 seam check 9/9, residual-fix retest 7/7, both Wyatt PASS.
DEPLOYED `8d96b0b` · Version `a92934f3` · chunk `index-BuD_HIUu.js` (SHA verified). Four fixes:
FIX-BOOST `39939e0` (the only true regression — Lever H froze the `getLocalCart` stub at
`HUD.init`), FIX-DIRPAUSE `e7dd92e` (falsification-checked), FIX-F8CAP `e7e64e4` (upload path
confirmed live — 7 captures arrived, cap-254–260), FIX-QUALFEEL `15be6ee`. FIX-EMISSIVE aborted
and FIX-MIG deferred, both re-scoped in BACKLOG. BUNDLE-1 unblocked.

2026-08-04 (FX-TIME-1 · SHADOW-ORDER-1 · ARCH-DRIFT-1 wave) — Three small cards, one commit each,
DEPLOYED together at `91b39aa` (Worker `d47d4dd3`; prod bundle fetched, SHA confirmed).
`fxTimer` was never updated, pinning `uTime` at 0 — the VHS layer rendered static.
`setContactShadowHazards` runs *after* `loadLevel()` builds geometry, so Storerooms' booths
(31.15 m) tested against the 26.4 m circular fallback and all four blobs were dropped; fixed by
passing the level's own square-floor hazards (Zanzibar template). Hoisting hazard publication in
`commitLevelLoad` is the structural fix and is deliberately deferred — it touches the seam MAIN-1
will split. control-flow.md line refs had all drifted (the card's own replacements were stale
again), so they are banned in favour of symbol anchors, enforced by two new tests. 109 files /
1,350 tests, qa green. Wyatt then PASSed all three plus HOST-TAB-1 — a 3/0 export, no FAIL — so
HOST-TAB-1 closed too and the ACTIVE slot is open for him to name.

2026-08-04 (HOST-TAB-1 lever E) — Second-migrate freeze: demoted in-flight initiate could still
send `sdpOffer`; new host built a zombie PC and skipped its own offer. Fix: host ignores inbound
offers; `isHost` + session-gen abort after awaits in initiate/answerer; heal stays in maintain.
Automated: 109 files / 1,347 tests. Unpushed — ship then retest §10 step 4.

2026-08-04 (playtest export close) — Closed four PASSes same session: FV-RESULTS-1 · STORE-DECK-1 ·
STORE-PT-1 · FV-WILT-1. HOST-TAB-1 FAIL residual → lever E above.

2026-08-04 (HOST-TAB-1 local wave) — Wyatt parked PERF-PASS-1 and acked levers A–D.
Prod host frames now use a loop-owned scoped MessageChannel with one driver; clock compensation applies
only when that pump never ticks. At 10s hidden, a multiplayer host asks the DO to migrate to the
best other live human; foreground humans trigger a margin-20 preferred-host check. Both mid-round
paths share a 5s room cooldown and the existing `host_migrated` handoff.

2026-08-03 (4 entries: STATUS-TRIM-1 · AGENTS-PRIN-1 · ROUND-WEDGE-1 Phase B · TOOL-HYGIENE-1)
— archived to [status-log-2026-08-03.md](./archive/status-log-2026-08-03.md).
