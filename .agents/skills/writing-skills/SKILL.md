---
name: writing-skills
description: "Use when creating a new skill, editing an existing one, or deciding whether a piece of guidance belongs in a skill at all rather than in AGENTS.md."
version: 1.0.0
---

# Writing Skills

The insight third of [obra/superpowers](https://github.com/obra/superpowers)' writing-skills
(MIT, Jesse Vincent), minus its subagent test harness — that costs 10–15 agent runs per
skill, which does not fit the one-card loop. For eval-running and variance analysis, use the
first-party `skill-creator` skill instead; this file covers what to write and where it goes.

## Where skills live here

Commit to `.agents/skills/<name>/SKILL.md` — the cross-runtime alias Codex, Copilot CLI and
Gemini CLI read. Claude Code reads `.claude/skills/`, which `.gitignore:47` excludes, so
after adding or editing a skill run `npm run skills:sync` (one-way; `.agents/` wins). The
`SKILLS_UNSYNCED` gate in `health:check` catches you if you forget, except in CI.

## Does this belong in a skill?

| Put it in | When |
|---|---|
| **AGENTS.md** | A standing rule for this repo — always true, no trigger needed |
| **A skill** | A procedure with a trigger — only loaded when a specific situation appears |
| **A tool + gate** | It is mechanically checkable. Do not document what a script can enforce |

A skill that fires on every session is AGENTS.md wearing a costume.

## The description field is the whole game

Two required fields: `name`, `description`. The description decides whether the skill is ever
loaded, so it must describe **when to use it, never what it does**.

Summarizing the workflow in the description creates a shortcut agents take *instead of*
reading the body. Upstream measured this: a description reading "code review between tasks"
produced one review, though the skill body specified two. Removing the workflow summary fixed
it.

```yaml
# ❌ summarizes the process — becomes the shortcut
description: Use when debugging - read errors, reproduce, trace the value, then fix

# ❌ first person, no trigger
description: I help you write better tests

# ✅ triggering conditions only
description: Use when encountering any bug, test failure, freeze, or visual regression, before proposing fixes
```

Write in third person. Name concrete symptoms an agent would recognize mid-task — "freeze",
"flaky", "desync", "bleed" — not abstractions. Keep it under ~500 characters.

## Match the form to the failure

Classify the failure first. The form that fixes one type measurably worsens another.

| The failure | Right form | Wrong form |
|---|---|---|
| Knows the rule, skips it under pressure | Prohibition + rationalization table + red flags | "Prefer…", "consider…" |
| Complies, but output has the wrong shape | Positive recipe: state what the output IS, in order | Prohibition list ("don't restate") |
| Omits a required element | A REQUIRED slot in the template they already fill in | Prose reminders near the template |
| Behavior should depend on context | Conditional on an observable predicate | Unconditional rule + exemptions |

Prohibitions backfire on shaping problems: under a competing incentive, agents negotiate with
"don't X". A recipe leaves nothing to negotiate.

Two rules whichever form you pick. **No nuance clauses** — "don't X unless it matters"
reopens the negotiation; make a real exception its own conditional. **Exemption clauses don't
scope** — "this limit doesn't apply to code blocks" still suppresses code blocks; restructure
so the rule cannot reach the exempt part.

## Naming and size

Verb-first, gerunds for processes: `writing-skills`, `condition-based-waiting`,
`root-cause-tracing` — not `skill-creation`, `async-helpers`, `debugging-techniques`. Name by
what you do or the core insight.

Under ~500 words for the body. Heavy reference (100+ lines) and reusable scripts go in
sibling files, loaded only when needed. Everything else stays inline.

## Anti-patterns

- **Narrative** — "in the 07-19 session we found…". A skill is a reference, not a war story.
  Extract the rule; leave the incident in STATUS.md.
- **Multi-language dilution** — one excellent, runnable, commented example beats five
  mediocre ones.
- **Flowcharts for linear steps** — use numbered lists. Diagrams only for genuinely
  non-obvious branches, and nothing in this repo renders graphviz.
- **Generic labels** — `step1`, `helper2`. Names carry meaning or they cost tokens for
  nothing.

## Knowing it worked

Upstream requires a subagent baseline before writing a line. The affordable version: write
the skill, then **use it on the next real card and watch where it fails to fire**. If it did
not trigger, the description is wrong. If it triggered and you still improvised, the body is
too vague. Fix the one that broke, not both.

Log the skill in STATUS.md the same as any other change, and treat a skill edit like a code
edit: `npm run skills:sync`, then `npm run qa`.
