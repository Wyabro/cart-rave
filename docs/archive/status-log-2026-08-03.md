# Session log — 2026-08-03

Rolled out of [STATUS.md](../STATUS.md) on 2026-08-05 when the live log went over the 4,200-token
budget. **Nothing here is current truth** — see [STATUS.md](../STATUS.md) and `git log`.

---
2026-08-03 (STATUS-TRIM-1) — STATUS.md was at 4,197 of a 4,200 budget, so every card paid a
shaving tax before it could write anything down. **The reporter's "blind spot" is in its advice,
not its measurement** — `status-size.mjs` counts the whole file; it just can only ever suggest
cutting *dated* blocks, which is why it said "nothing safe to archive" while 82% of the weight sat
in undated sections. Measured first, then cut where the weight was: 08-02 dated window archived,
five deep-domain gotchas moved to [reference/gotchas.md](../reference/gotchas.md), Decision index
compressed to true one-liners, duplicated Sundial narrative dropped, and five `### Do not` bullets
that restated AGENTS.md replaced by one pointer. **4,197 → 3,215 tokens.** **Two near-misses:** the
Decision index's "full text in the 07 log" was false — that log ends 07-23 and STATUS was the only
copy of all seven live entries; and the "six of eleven Wave 6 items were misdiagnosed" warning
existed nowhere else. Both archived before cutting. **A pointer claiming content is archived is not
evidence that it is.**

2026-08-03 (AGENTS-PRIN-1) — AGENTS.md governed behaviour *around* the code and said nothing
about the code; that gap is why fixes accrete flags, shims and "temporary" paths. Six falsifiable
rules now live in `## ENGINEERING PRINCIPLES` (principle 1 needs its three carve-outs or it fights
the naming freeze). A mechanically-qualified **fast lane** drops the wave doc, playtest checklist
and per-lever STATUS edit — **ack deliberately kept**; DoD amended to match. Its auto-DQ list
means most gameplay fixes still pay full tax: **the principles are the lever, not the gear
change.** Paid for by moving ~62 lines of hook internals to
[guides/hook-enforcement.md](../guides/hook-enforcement.md). **Two limits:** `archRender` reads
only four AGENTS sections, so the principles reach neither ARCHITECTURE.json nor BRIEFING; and
`parseListItems` is line-based, so every `execution_loop` bullet is truncated to its first source
line (the fast lane's was written to survive that).

2026-08-03 (ROUND-WEDGE-1 Phase B code) — Client breaker for undamped podium⇄running re-entry:
`podiumEndLatch` (MAX_END_SENDS=2, PODIUM_END_RETRY_MS=150), host-only reject arm, clear on
lobby/countdown/rematch. Unit: `tests/podiumEndLatch.test.js` (8). **cap-217 still open** until
playtest. Gates: see commit message.

2026-08-03 (TOOL-HYGIENE-1) — HOOK-INDEX-1: post-commit clears staged generated docs when
index blob ≠ HEAD (before dashboard). BRIEF-DIGEST-1: template fingerprint in digest + embed.
STOP-DIRT-1 BACKLOG row retired (code already session-scoped). All three rows closed.

> **Older entries are archived** — 08-02 in
> [status-log-2026-08-02.md](./status-log-2026-08-02.md), earlier windows indexed in
> [archive/README.md](./README.md).
> History, not current truth — `git log` and the code are authoritative.
