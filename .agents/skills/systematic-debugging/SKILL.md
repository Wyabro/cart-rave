---
name: systematic-debugging
description: "Use when encountering any bug, test failure, freeze, visual regression, or unexpected behavior — before proposing fixes. Root cause first; symptom fixes are failure."
version: 1.0.0
---

# Systematic Debugging

Adapted for Cart Clash from [obra/superpowers](https://github.com/obra/superpowers) (MIT,
Jesse Vincent). Upstream is generic + macOS/bash; this copy is Windows/PowerShell, uses this
repo's gates and tools, and hands off to the AGENTS.md escalation ladder instead of
upstream's "discuss with your human partner."

## Core principle

**ALWAYS find root cause before attempting fixes. Symptom fixes are failure.**

This is the procedure behind AGENTS.md § HOW WORK IS EXECUTED step (3): *"switch approach
from knob-turning to root-cause forensics (instrument, capture, attribute)."* The PERF-WARM
lesson is the whole argument — spans named the owner; guessing at levers got reverted.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you cannot propose fixes.

## When to use

Any technical issue: test failures, production bugs, host freezes, audio bleed, visual
regressions, perf cliffs, build failures, netcode desync.

**Especially when:**
- You have already tried a fix and it did not hold
- The obvious lever is "just one quick knob turn"
- The bug only reproduces on one machine (Intel iGPU vs 4090) or only in prod
- You do not fully understand the issue

**Do not skip because:** the bug looks simple, you are near the end of a timebox, or a
playtest is waiting. Systematic is faster than thrashing — that is why the timebox exists.

---

## Phase 1: Root cause investigation

Complete this before proposing ANY fix.

### 1. Read the error completely
Stack traces, console lines, worker logs. Note file paths and line numbers. Do not skip
warnings — they often name the cause.

### 2. Reproduce consistently
Can you trigger it reliably? Exact steps? Every time, or 1-in-N? If it is not reproducible,
gather more data — do not guess. For this repo that means a named repro: a `?diag=1` session,
a `npm run blackframes` capture, a `npm run battery` run, or a numbered playtest step.

### 3. Check recent changes
`git log --oneline -15`, `git diff`. What landed near the symptom? New asset, new deploy,
changed tick rate, changed bundle. Remember: **local grep is not authority** — confirm
against `origin/cart-clash` HEAD, and post-deploy confirm against the fetched asset.

### 4. Instrument every boundary, then run ONCE

Cart Clash is a multi-component system. Do not guess which component is broken — make each
boundary report what enters and what leaves, run one capture, and read where the chain
breaks.

The boundaries that matter here:

```
input → client sim → PartyKit room (DO) → host authority → broadcast → remote client render
                  ↘ audio bus (Howler / synth)     ↘ Rapier step     ↘ postFX / renderScale
```

For EACH boundary: log what enters, log what exits, log the timestamp, log which peer.
Then run one capture and read it. Example shape:

```js
// boundary 1: does the intent leave the client at all?
console.error('[TRACE tx]', { t: performance.now(), type: msg.type, seq });

// boundary 2: does the room receive it, and from which connection?
console.error('[TRACE room]', { t: Date.now(), from: conn.id, type: msg.type, seq });

// boundary 3: does the host apply it to the sim?
console.error('[TRACE apply]', { t: performance.now(), seq, tick, applied });

// boundary 4: does it reach the remote render?
console.error('[TRACE rx]', { t: performance.now(), seq, tick, drift: tick - localTick });
```

Reading the captures on Windows:

```powershell
Select-String -Path .\captures\*.log -Pattern '\[TRACE' | Select-Object -First 200
```

**This tells you WHICH layer fails** (tx ✓ → room ✓ → apply ✗), which is the only thing
Phase 1 owes you. It does not tell you why. That is Phase 2.

**Probe trap:** dev-only probes lie in prod. `__cartRavePerf.scene` and `import("/src/…")`
do not exist in a production bundle — instrument through something that ships, or verify
the finding visually in prod.

### 5. Trace the bad value backward
When the error is deep in the stack, see [root-cause-tracing.md](root-cause-tracing.md).
Short version: where did the bad value originate? What passed it in? Keep walking up until
you reach the source. Fix at the source, not where it surfaced.

---

## Phase 2: Pattern analysis

1. **Find working examples.** What similar thing in this codebase works? Another arena,
   another sting, another netcode message, another postFX pass.
2. **Read the reference completely.** If you are following a pattern (Rapier, Howler,
   PartyKit, Three), read it end to end. Skimming produces the
   `filterExcludeCollider` class of bug — passing `.handle` instead of the object silently
   disables exclusion, no error.
3. **List every difference.** However small. Do not assume "that cannot matter."
4. **Check dependencies and context.** Host vs non-host. Focused vs hidden tab. LOW vs HIGH
   quality. 4090 vs Intel iGPU. Dev vs prod bundle. Most Cart Clash bugs live in one of
   these splits, not in the code you are reading.

---

## Phase 3: Hypothesis and testing

1. **One hypothesis, written down.** "I think X is the root cause because Y." Specific.
   Put it in docs/STATUS.md if the timebox is running out.
2. **Test it minimally.** Smallest possible change. One variable. Never two levers at once —
   that is the one-card rule applied to debugging.
3. **Verify before continuing.** Worked → Phase 4. Did not work → form a NEW hypothesis.
   Do NOT stack another fix on top of the failed one.
4. **When you do not know, say so.** "I have not confirmed X" beats confident structure.

---

## Phase 4: Implementation

### 1. Get a failing repro first
You need something that fails now and passes after. In order of preference:

| Bug lives in | Repro that counts |
|---|---|
| Logic, netcode, room, sim | A failing `vitest` case (`npm run test`) |
| Timing, flake, race | A condition-based test — see [condition-based-waiting.md](condition-based-waiting.md) |
| Visual, postFX, lighting | `npm run blackframes` / `npm run shoot` + `npm run compare` baseline |
| Perf, freeze, hitch | `npm run perf:profile` or a `?diag=1` capture with the offending span named |
| Audio | A capture at sfx ≈ 0.08 with the bus and the trigger both logged |

A numbered playtest step is a valid repro when nothing above can reach the bug — write it
down in docs/STATUS.md so the fix can be re-checked. What is NOT acceptable is "I looked at
it and it seems fine now."

### 2. Implement a single fix
Address the root cause. ONE change. No "while I am here" cleanups, no bundled refactor. New
ideas go to [BACKLOG.md](../../../docs/planning/BACKLOG.md).

### 3. Verify by number
Run `npm run qa` and state the actual numbers you saw. Add `npm run build` when the client
bundle changed. Then the standing rule applies: **nothing is "done" or "verified" until it is
pushed, pulled, and confirmed in `origin/cart-clash` HEAD** — and post-deploy, until the
fetched asset contains the change. Until then it is **unpushed**.

Behavior-changing fixes additionally need Wyatt's playtest on production before they count.

### 4. If the fix did not work — count
- Fewer than 3 attempts: return to Phase 1 with the new information.
- **3 attempts, or ~45 minutes, whichever hits first: STOP.** This is the AGENTS.md timebox.

At the stop, write the 5-line findings entry to docs/STATUS.md before anything else:

```
1. What was tried
2. What is now ruled out
3. Current best hypothesis
4. Evidence for it
5. Next cheapest test
```

Then take the escalation ladder in order: findings write-up → root-cause forensics
(instrument, capture, attribute — Phase 1.4 above) → hand off per MODEL / TOOL ROUTING, or
ask Wyatt. **Handing off with a findings write-up is a success, not a failure.**

### 5. If 3+ fixes failed, question the architecture
Symptoms of a wrong architecture rather than a wrong hypothesis:
- Each fix reveals new shared state or coupling somewhere else
- Each fix creates a new symptom elsewhere
- The "real" fix would require a massive refactor

That is a design conversation with Wyatt, not attempt #4.

---

## Red flags — stop and return to Phase 1

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "It is probably X, let me fix that"
- "I do not fully understand this but it might work"
- Listing fixes before tracing data flow
- Turning a knob (renderScale, timeout, gain, tick rate) to see what happens
- "One more attempt" after 2+ failures

## Signals from Wyatt that you are doing it wrong

- "Is that not happening?" — you assumed instead of verifying
- "Stop guessing" — you are proposing fixes without understanding
- "We're stuck?" — your approach is not working; escalate, do not grind

## Common rationalizations

| Excuse | Reality |
|---|---|
| "It is simple, no process needed" | Simple bugs have root causes too. The process is fast for them. |
| "No time for process" | Systematic is faster than guess-and-check. A full day was once lost proving this. |
| "Try this first, investigate after" | The first fix sets the pattern. |
| "Multiple fixes at once saves time" | You cannot tell which one worked, and you added two new bugs. |
| "The reference is long, I will adapt it" | Partial understanding is where the Rapier and Howler traps live. |
| "One more attempt" (after 2+) | 3 failures means the architecture is wrong, not the hypothesis. |

## Quick reference

| Phase | Activities | Done when |
|---|---|---|
| 1. Root cause | Read errors, reproduce, check recent changes, instrument boundaries, trace backward | You know WHICH layer and WHY |
| 2. Pattern | Find working examples, read references fully, list differences | You can name the difference |
| 3. Hypothesis | One written theory, minimal test | Confirmed, or replaced |
| 4. Implementation | Repro → single fix → gates by number → pushed + pulled | Verified in `origin/cart-clash` HEAD |

## When investigation finds no root cause

If the issue really is environmental, timing-dependent, or external: document what you
investigated in docs/STATUS.md, implement appropriate handling (retry, timeout, guard,
honest error), and add instrumentation so the next occurrence is captured.

**But 95% of "no root cause" is incomplete investigation.**

## Supporting techniques

- [root-cause-tracing.md](root-cause-tracing.md) — walk a bad value backward to its source
- [condition-based-waiting.md](condition-based-waiting.md) — replace arbitrary sleeps with condition polling
- [defense-in-depth.md](defense-in-depth.md) — after the root cause, make the bug impossible
