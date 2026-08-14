# STATUS session log — 2026-08-13

Moved out of [STATUS.md](../STATUS.md) on 2026-08-14 so the live file stays under the
token budget. Cut during the BACKLOG-HYGIENE-3 / STATUS trim. Live STATUS keeps 2026-08-14.

Nothing here is current truth — code and `git log` win.

---

2026-08-13 (ship + playtest exports 2–3) — **SHIPPED** `a79222c` (Worker version
`0ccc160a-dc65-4daf-94ca-6da9ff294451`); post-deploy root + 25 assets 0×404, live bundle carries
`onLocalDoomed`. Export 2 closed six PASS cards + parents (GAMEPAD-NAV-REPEAT-1 ·
RUMBLE-STRENGTH-1 · CHAL-SHELF-FIT-1), filed CART-HUE-RED-1, and fixed KO-DOOMED-PT-1
(`910ca37` — host fan-out dropped `onLocalDoomed`; Solo is always host). Export 3:
ANIM-BUGS-PT-1 · BOOST-SFX-RESPAWN-PT-1 · KO-DOOMED-PT-1 PASS on prod (ANIM-BUGS-1 closes; fix
loop closed). All solo-checkable playtest cards closed; deferred: CARGO-BAY-INSTANCE-PT-3 ·
CONN-TRACK-LEAK-PT-1 · SHARD-PT-2.

2026-08-13 (engineering + audit sweeps) — The ACKed Engineering Low and audit waves closed
their scoped levers: network quit retry, snapshot/spawn safety, party typing, clock-domain,
challenge rotation/menu work, and Sundial classification/reactive allocation. QA was green for
both waves; the audit also filed the remaining deferred cards. `ZAN-BOLLARD-PT-1` is seeded for
the visual check. Commits: `0333cb9` through `6cea5ad`, `182a673` through `80cb60b`.

2026-08-13 (art sweep + ship) — ART-LOW-SWEEP-1 and ART-PALETTE-1 updated arena assets and the
five cart neon colors; their visual cards remain owed. `cca8b31` deployed as CF version
`9f1d2690`; post-deploy HTML plus 25 hashed assets returned 0×404, and deployed symbols were
present. Commits: `d0c23d0` through `8178a57`, `d78e2cf`, `3f0f49b`.

2026-08-13 (MENU-MUSIC-PT-1) — Wyatt playtest PASS on prod `11e5e48f`; parent MENU-MUSIC-2
closed.

2026-08-13 (KO-DOOMED-1) — Every finalized local KO now gives a medium red edge pulse and one
center shockwave with the cart shatter. The same local-victim reactor runs on host and non-host
fall replay paths; attacker-only feedback stays unchanged. It is DOM HUD feedback, so Low quality
and post-FX-off still show it. `KO-DOOMED-PT-1` is seeded for solo visual proof. Release
maintenance also removed the stale Knip `taskkill` ignore so the required QA gate can pass.

2026-08-13 Current-focus archaeology (trimmed 08-14 — closed ship narratives that lived under
`## Current focus` instead of Last updated):

- PROBE-WARM-RT-1 + PERF-TIER-1 PASS on prod 08-12.
- MENU-MUSIC-2 / MENU-MUSIC-PT-1 CLOSED 08-13 on prod `11e5e48f`.
- 08-13 playtest exports: solo-checkable drained; deferred CARGO-BAY-INSTANCE-PT-3 ·
  CONN-TRACK-LEAK-PT-1 · SHARD-PT-2. CART-HUE-RED-1 filed from ART-PALETTE-PT-1 note.
  KO-DOOMED-PT-1 FAIL→fix `910ca37`→ship `a79222c`→PASS.
- RAPIER-MAJOR-1 / RAPIER-MAJOR-PT-2 CLOSED 08-13 — deployed `524bd4db`, packages `0.20.0`.
- DEPS-MAJOR-1 CLOSED 08-13 — `sharp@0.35.3`, `@cloudflare/vitest-pool-workers@0.21.2`.
- RUMBLE-STRENGTH-1 · GAMEPAD-NAV-REPEAT-1 · BOOST-SFX-RESPAWN-1 · ANIM-BUGS-1 shipped 08-13;
  their PT cards PASSed the same day. Non-host follow-up: BOOST-SFX-NONHOST-1.
