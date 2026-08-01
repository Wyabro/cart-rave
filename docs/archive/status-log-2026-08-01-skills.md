# STATUS session log — 2026-08-01 skills-vendoring entries (archived)

Rolled out of STATUS.md `## Last updated` on 2026-08-01 to keep the 08-01 date window
within the status-size density gate. Verbatim; the condensed one-liner in STATUS points here.

---

2026-08-01 (brainstorming skill) — `.agents/skills/brainstorming/` — the dialogue half of
obra/superpowers' version (1,494 words + a 25KB browser-mockup server → 606, server dropped).
Scoped to fire only on new gameplay systems / player-facing features / ambiguous-"done"
cards, NOT config or known-line edits, so it cannot turn step 0 into ceremony. Opens with
"what should the player see / feel / do", one question per message, size-check before detail
(three cards ≠ one), 2–3 approaches with the recommendation first, lands as a BACKLOG card.
Upstream's "do NOT invoke frontend-design or any other implementation skill" was removed —
it would have forbidden `hallmark`. A written design is still not the ack.

2026-08-01 (writing-skills skill) — `.agents/skills/writing-skills/` — the insight third of
obra/superpowers' version (12,360 words → 746), dropping its subagent test harness (10–15
agent runs per skill, against the one-card loop) and deferring to first-party `skill-creator`
for evals. Load-bearing rules: a skill `description` states **when to use**, never what it
does (a workflow summary becomes a shortcut agents take instead of reading the body);
prohibitions fix discipline failures but backfire on wrong-shaped output — use a positive
recipe there. Decision table for skill vs AGENTS.md vs tool+gate. The `SKILLS_UNSYNCED` gate
caught this skill unsynced on its own, one commit after landing.

2026-08-01 (systematic-debugging skill + skills mirror gate) — Vendored
`.agents/skills/systematic-debugging/` (adapted from obra/superpowers, MIT): 4 phases,
root-cause tracing, condition-based waiting, defense-in-depth. Rewritten to hand off to the
AGENTS.md timebox/ladder, and AGENTS.md ladder step (3) now names it (`183a545`). Skills are
committed to `.agents/skills/` (every non-Claude tool reads it) while Claude Code reads
`.claude/skills/`, which `.gitignore:47` excludes — so a fresh clone silently has no
Claude-side skills. `npm run skills:sync` mirrors one way (`.agents` wins) and
`SKILLS_UNSYNCED` red-gates `health:check`, skipped when `CI` is set because the mirror can
never exist there (`f4f4f6c`). No behavior change — no playtest owed.
