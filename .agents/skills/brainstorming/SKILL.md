---
name: brainstorming
description: "Use when the ask is a new gameplay system, a player-facing feature, or a card whose \"done\" is ambiguous — before writing the plan or touching code. Not for config changes, known-line fixes, or a lever with one obvious value."
version: 1.0.0
---

# Brainstorming

The dialogue half of [obra/superpowers](https://github.com/obra/superpowers)' brainstorming
(MIT, Jesse Vincent), scoped down to fit AGENTS.md § HOW WORK IS EXECUTED step 0. Upstream
runs a design doc + spec-approval cycle on every change including config edits; here the
weight matches the card. Nothing in this skill restricts which skill you use afterward.

## When this fires

| Ask | This skill |
|---|---|
| New gameplay system, player-facing feature, ambiguous "done" | Yes — start here |
| Multi-file or behavior-changing edit with a clear goal | No — go straight to the step 0 plan (goal · files · asserts · risks) |
| Config change, known-line fix, one obvious lever value | No — just do it |

## Open with the player

AGENTS.md already requires this, so ask it first and out loud:

> **What should the player see / feel / do when this works?**

An answer you cannot picture on screen is not a design yet. Keep asking until it is
concrete — "the KO reads as a hit, not a teleport" beats "improve KO feel."

## One question per message

Ask **one** question, wait, then ask the next. Not a batch, not a numbered survey. Multiple
choice where the options are real; open-ended where they are not. Aim at purpose,
constraints, and success criteria — not implementation detail.

## Check the size before refining details

Before the second question, ask yourself whether this is one card or several. If the ask
covers independent pieces — a new mode *and* a lobby flow *and* a scoring change — say so
immediately rather than spending questions on details of something that has to be split:

> "This looks like three cards: X, Y, Z. They can ship independently. Which one is the
> active card?"

New ideas that fall out go to [BACKLOG.md](../../../docs/planning/BACKLOG.md). Recording an
idea is not a priority change.

## Propose 2–3 approaches, recommendation first

Lead with the one you recommend and say why. Give each a real trade-off — cost, risk, what
it forecloses — not three flavors of the same thing. If two approaches differ only
cosmetically, you have one approach.

**YAGNI ruthlessly.** Cut every feature from every option that the stated goal does not
require. The version you present should already be the trimmed one.

## Present the design in sections

Scale each section to its complexity: a sentence when it is straightforward, a paragraph
when it is not. Confirm after each section rather than dumping the whole thing and asking
"looks good?" at the end. Cover what applies — behavior, the systems it touches, netcode and
host authority if multiplayer, failure modes, how it will be verified.

Name the verification up front. If the only proof is "Wyatt plays it," say so — that is a
playtest owed, and it belongs in the card.

## Landing it

The design becomes a **BACKLOG card**, in the existing format. No new spec tree, no separate
design doc.

Then stop. Wyatt's explicit ack on the plan is the gate — a written design is not permission
to code, exactly as BRIEFING's ACTIVE CARD is not. Once acked, the normal loop resumes: one
card, one lever, ~45-minute timebox.

## Red flags

- Asking three questions in one message
- Presenting one approach as if it were a choice
- Writing a design for a card whose "done" is already obvious
- Proposing unrelated refactors that "we may as well do while we're in there"
- Starting to edit because the design was approved — the design is not the ack
