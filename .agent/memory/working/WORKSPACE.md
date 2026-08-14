# Workspace (live task state)

> Replace this template on your first real task. The dream cycle auto-archives
> this file after 2 days of inactivity — don't keep long-lived notes here.

## Current task
08-13 playtest export wave (2nd): closed 6 PASS cards, fixed KO-DOOMED-PT-1 FAIL. DONE — pushed as `910ca37` + `1705e4a`.

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
- [ ] Wyatt retest KO-DOOMED-PT-1 on `npm run dev:local` (unshipped), then prod after next ship

## Next step
KO-DOOMED-PT-1 retest owed on `npm run dev:local` (feature unshipped). ANIM-BUGS-PT-1 is the next ACTIVE CARD (prod). No deploy without `ship it`.
