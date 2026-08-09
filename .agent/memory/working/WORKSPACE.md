# Workspace (live task state)

> Replace this template on your first real task. The dream cycle auto-archives
> this file after 2 days of inactivity — don't keep long-lived notes here.

## Current task
Apply the acknowledged CARGO-LATCH-1 shift-aware cargo latch.

## Open files
- `src/cargoLoad.js`
- `src/orchestration/roundLifecycle.js`
- `src/orchestration/gameBoot.js`
- `tests/cargoLoad.test.js`

## Active hypotheses
- Static evidence confirmed the cargo latch mistook pause or host tab-return compensation for a new round; the shift-aware helper now covers both paths.

## Checkpoints
- [x] DeepSeek audit verified both compensation call sites.
- [x] Approved helper and both call-site wires implemented.
- [x] Focused cargo tests pass: 32/32.
- [x] Full `npm run qa` passes all 7 gates.
- [ ] Production playtest after explicit ship authorization.

## Next step
Wait for explicit `ship it` before deployment; then playtest solo pause and host tab-return.
