# Workspace (live task state)

> Replace this template on your first real task. The dream cycle auto-archives
> this file after 2 days of inactivity — don't keep long-lived notes here.

## Current task
08-13 playtest export wave (3rd): closed ANIM-BUGS-PT-1 · BOOST-SFX-RESPAWN-PT-1 · KO-DOOMED-PT-1 (all prod PASSes). DONE — pushed as `585d67c`. KO-DOOMED-PT-1 PASS closes the `910ca37` fix loop.

## Open files
- `src/gameFlow.js` — host KO dispatch ctx (KO-DOOMED-PT-1 fix)
- `tests/gameFlowSuddenDeath.test.js` — onLocalDoomed wiring regression test
- `docs/planning/BACKLOG.md` — 10 rows closed, CART-HUE-RED-1 seeded
- `docs/STATUS.md` / `docs/planning/completed-work.md` — wave records

## Active hypotheses
- KO-DOOMED-PT-1 FAIL root cause: host KO fan-out in `gameFlow.js` dropped `onLocalDoomed` from the reactor ctx (Solo is always host) — confirmed by code trace + regression test; non-host netcode path already had the hook.

## Checkpoints
- [x] 6 PASS cards closed (rows deleted, do-not-reopen list, completed-work, STATUS queue trimmed)
- [x] KO-DOOMED-PT-1 fixed (`910ca37`) — one-line ctx + typedef; regression test added
- [x] Console regenerated: 6 ids gone, KO-DOOMED-PT-1 retained with 4 steps
- [x] Full `npm run qa` green (183 files / 2007 tests; all 7 gates) on merged tree
- [x] Pushed; `verify:head` in sync (`1705e4a`)
- [x] **SHIPPED** `a79222c` — Worker version `0ccc160a-dc65-4daf-94ca-6da9ff294451`; root + 25 assets 0×404; live bundle carries `onLocalDoomed`
- [x] KO-DOOMED-PT-1 PASS on prod — fix loop closed
- [x] 3rd export: ANIM-BUGS-PT-1 · BOOST-SFX-RESPAWN-PT-1 · KO-DOOMED-PT-1 closed (`585d67c`)

## Next step
All solo-checkable playtest cards closed. Remaining: CARGO-BAY-INSTANCE-PT-3 · CONN-TRACK-LEAK-PT-1 (2pc) · SHARD-PT-2 (launch-day). No ACTIVE CARD — Wyatt picks next (or ship glitch after he confirms prod).
