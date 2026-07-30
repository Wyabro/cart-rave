# STATUS session log — 2026-07-21

> Archived from [STATUS.md](../STATUS.md) on 2026-07-30 (status-size budget; QA-STATUS-1).
> Five entries: ARCH layer, PARITY cold-start, PERF-WARM root cause + reverted gate, WRAP,
> COUNTDOWN-ABORT-1 verification. **History, not current truth** — `git log` and the code
> are authoritative.

2026-07-21 (ARCH — living architecture intelligence layer) — Extends the Command Center with a
generated codebase map, both machine- and human-facing. New `npm run arch` (in `qa` + dashboard
chains) builds committed `docs/ARCHITECTURE.json` (agent manifest) + `.diag-captures/architecture.html`
(interactive map: SVG flow graph with typed edges, per-system telemetry cards, file→system lookup,
risk/debt + priorities panels). 18-system taxonomy in `tools/lib/archMap.mjs` claims all 163
src/party/shared files exactly once — a new unclaimed file red-gates `health:check`
(`ARCH_UNMAPPED_FILE`), so the map stays live. Digest excludes line/churn stats (HTML-only) so the
committed JSON doesn't churn every commit. `qa` 705 green. See D-ARCH-1.

2026-07-21 (PARITY — unified cold-start across AI tools) — Root cause of "every tool behaves
differently": each entered through a different, differently-stale door (gitignored dashboard,
418-line STATUS, 07-20 handoff doc, drifted per-tool files). Fix (D-PARITY-1): committed
generated `docs/BRIEFING.md` + digest freshness gate in `health:check`; handoff doc retired
to archive; STATUS log dieted (07-20→21 entries → [status-log-2026-07-20-to-21.md](./status-log-2026-07-20-to-21.md));
`status-size` budget 8k + dense-window check; pointer files thinned (+`GROK.md`,
`.cursor/rules/cart-clash.mdc`); AGENTS.md "How work is executed" + paste-able opener.

2026-07-21 (PERF-WARM — root cause CONFIRMED; host-countdown-gate fix TRIED & REVERTED) —
The round-start freeze that eats the 3-2-1 is now attributed with certainty, and the
"first live fly-over render" theory from the prior WRAP entry is **wrong** (that probe,
`render.roundStart`, is 5.6ms — exonerated). New per-call-site render spans (build `936477a`)
name the owner: **`warm.render.default.play-full`** — a **quickplay arena-rotation warmup**
(`warmupActiveSceneShaders({forPlay:true})`, full compile budget, no `warm` flag, no loading
overlay; [main.js ~2901](../../src/main.js) `rotateLoadedArenaInPlace` + [levelManager.js:276/285](../../src/levelManager.js)).
Its first `composer.render()` (**128ms warm 4090 → 1921ms cold**, cap-190/196) runs a
main-thread block that **overlaps the already-running countdown** (cap-196: `lobby→countdown`
at t=25920, block at t=27126, between `countdown_2` and `countdown_1`; `countdown_3` dropped).
Trigger: the room's arena differs from the local play-entry pick, so a rotation drains right
after `carts-ready` — concurrent with the countdown. Non-host case stays hardware-bound (Gen11,
34–38s, mostly non-JS paging).
**Fix attempted (`04c714e`) and REVERTED (`c8df8fd`):** gating the host MP countdown on
`whenArenaRotationSettled()` (mirroring the non-host apply path). It **regressed first-join** —
brought back the ready-up screen (which is meant to be gone) and/or the round starting with no
countdown at all. **DO NOT re-try the host-countdown gate.** Net code state now = session start
(`2a927b9`) **+ diagnostics only** (behavior-identical; verified by diff). Live spans added:
`render.roundStart`, `warm.render.default{.play-warm|.play-full|.menu}`, `warm.render.flyover{…}`.
If a future fix is wanted, the lever is **pre-warming the room's arena programs before the
countdown** (so the rotation render is cheap), NOT delaying countdown start. Deployed `c8df8fd`.

2026-07-21 (WRAP — PERF-WARM play-entry freeze parked, handover written) — Two-turn chase
concluded. Ruled OUT (with span evidence, build `af0c936`): shader compile (`warm.compile`
4–23ms, `parallelCompile:true`), VFX anchors (all idempotent, `warm.anchors` <4ms), audio
kickoff (`warm.audioKickoff` <4ms). The residual host freeze is variable/cache-dependent
(cap-189: 400ms AFTER `carts-ready`, i.e. the first live round-start render, not the warm
block) and the non-host's is hardware-bound (7GB Gen11). LOW priority — countdown unaffected.
Attribution spans left in place (cheap, useful). Full context + next steps + capture recipe:
**[PERF-WARM-handover.md](../planning/PERF-WARM-handover.md)**.

2026-07-21 (VERIFIED — COUNTDOWN-ABORT-1 fixed) — Fresh quickplay countdown F8s on `cbb0c7f`
(caps 180/181 connecting, 184/185 after-round, both machines): **ZERO `countdownAbort`
events**, no countdown→lobby thrash (only legitimate next-round starts). Digit cadence clean —
non-host EVEN (1369/1198/1310ms) despite still hitting a 22s load freeze; host 2→1→GO even
(1200/1205). Held with both peers mid load-freeze — the exact flap condition. Countdown jank
CLOSED across 5 sessions. Residual (cosmetic, NOT the abort): a round-start load freeze
(cap-184 host: 1426ms main-thread at play-shader, ltSum=1403) can compress the first 3→2 gap
(209ms) — that's PERF-WARM (hardware-bound), tracked separately, no restart.
