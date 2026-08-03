# Status log — 2026-08-02

Rolled out of [STATUS.md](../STATUS.md) on **2026-08-03** by STATUS-TRIM-1, when the live file
was at 4,197 tokens against a 4,200 budget. **Nothing here is current truth** — the code and
`git log` are authoritative.

**What moved:** the three dated 2026-08-02 entries below.
**What stayed live:** everything dated 2026-08-03, plus every undated section (Phase, Current
focus, Active queue, Open issues, Decision index, Gotchas).

**Where the full detail already lived, and still does:** per-card forensics for this window are in
[planning/completed-work.md](../planning/completed-work.md) (its own 08-02 entries), which is
longer and more precise than any of these summaries. These are the session-log view.

---

2026-08-02 (DIAG-FLAKE-2 closed) — Full forensic record in
[completed-work.md](../planning/completed-work.md) (08-02 entry). Sundial's owed playtest is
**SUNDIAL-PT-1** in BACKLOG; residual **DIAG-UPLOAD-GEN-1**.

2026-08-02 (process reset — the point of it) — Measured why velocity fell: in one three-hour
window, 16 of 25 commits were the machine maintaining itself while the art pass waited, and 137
of 374 commits in a fortnight touched only `docs/`. Three rule changes in AGENTS.md: the
operating system is **frozen during a game card**, the ack unit moved from **lever to wave**
(with a mandatory playtest checklist and a mid-wave abort), and `ARCHITECTURE.json` (~30k
tokens) became a **lookup, not a read** — fixed in `tools/lib/briefing.mjs` too, since the
generated BRIEFING was the copy that actually reached every session. STATUS.md rebuilt: 293
lines → this; `hallmark` deleted (106 of 112 tracked `.agents/` files were a web-marketing
design system).

> Follow-up, 2026-08-03: the three rule changes above are live in AGENTS.md and were extended
> that day by **AGENTS-PRIN-1** (`## ENGINEERING PRINCIPLES` + the small-change fast lane).
> Read the rules in AGENTS.md, not here.

2026-08-02 (Sundial Waves 1–3 + twelve-card backlog batch) — Waves 1–3 shipped and deployed
(ten levers + OQ5, frame bloom 55.6% → 18.7%); backlog batch `af12632`..`b8e327b`. Per-card
detail + four code-disagreed-with-card notes in
[planning/completed-work.md](../planning/completed-work.md).
