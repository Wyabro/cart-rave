# Session log — 2026-08-11

Moved out of the live status page on 2026-08-13 to keep `docs/STATUS.md` within its token
budget. Current truth remains in the code, git history, and live status page.

## NIGHT-SHIFT-CITY-1

Wyatt judged the local visual result unsuccessful and directed us to stop. The card is retired
as an accepted temporary baseline, not a visual PASS. It keeps the approved blockout, city,
fixed facade lights, telecom mast, subtle mast life, and roof dressing. Focused 11/11, typecheck,
and build were green at handoff; full QA reached 1,883 passed / 1 known unrelated backlog-canary
failure. Not pushed, deployed, shipped, or renamed.

The facade-light root cause was a radial shell that ignored each building's yaw and upper setback.
`282c7e2` selects the rotated facade that faces the arena and places every window/sign from that
facade's true width, normal, and final Y. Regression proof: 1,385 detached extended windows before
→ 0 windows and 0 signs after; focused 5/5 and production build green. Full QA reached 1,880 passed
/ 1 unrelated failure: concurrent `48e4364` reduced BACKLOG to exactly 50 rows while its existing
canary requires more than 50. Fixed capture: `.diag-captures/night-shift-lights-fixed.png`.
Wyatt visual PASS 08-11. Closure waited on the unrelated global QA canary. Not pushed, deployed,
closed, or renamed.

## NPC-BOOST-2-PT-1

All four steps PASS. NPC-BOOST-1, NPC-BOOST-2, and AI-EASY-SOFTEN-1 closed. Proportional
early-release (`dec9a66`) deployed `e917da49`: `minTargetDistance` 3.0,
`finisherEdgeBiasMin` 0.35, NPC charges release instead of cancelling.
