# Cart Rave — Session 14 Handover (for next Cursor agent)

Date: April 21, 2026 (end of session)
Days to deadline: ~10 days (May 1, 2026 @ 13:37 UTC)
Production: cartrave.lol — current and working

## Read first

1. `.cursorrules` — **this was completely rewritten this session.** Do not rely on any memory of the previous version. The rewrite reflects a menu-first vision with Solo / Quickplay / Friends modes, server-gated color picker, in-game Esc overlay, personal stats tracking, and a reorganized Execution Order (20 steps). Read it in full before acting.
2. `docs/step-10a-scoring-audit.md` — full audit of the scoring system as it exists in code. Lists what's working, what's partial, what's missing.

## State as of end of session 14

**Committed and pushed to main:**
- New `.cursorrules` (menu-first vision, replaces prior version entirely)
- `docs/step-10a-scoring-audit.md` (scoring audit report)
- Commit `397897a` — Bug 1 fix from the scoring audit (Critical bonus now uses `CONFIG.scoring.criticalVelocityThreshold = 13.5` instead of nitro-active window)

**Verified on prod:**
- New .cursorrules landed on main (not directly relevant to prod, but confirmed)
- Bug 1 fix visible in prod main.js via Select-String (cache-busted): `criticalVelocityThreshold` and `wasCritical` present

**NOT yet verified (pending human playtest):**
- Bug 1 behavior on prod — human has NOT yet confirmed Critical fires correctly at both nitro and max-coasting speeds. Playtest is the first task of session 15.

**Session 13 validation completed this session:**
- Force-kill Chrome reaper validation ran successfully. Tail showed `reap: connId=... reason=silent age=33217 was_host=true` and `ensureLiveHost: stale hostId=... newHostId=...`. Reaper works end-to-end.

## Scoring bugs identified in audit (3 total)

Bug 1 is fixed. Bugs 2 and 3 are drafted prompts waiting to be applied.

**Bug 1 — Critical bonus trigger.** ✅ DONE (commit 397897a). Pending playtest verification.

**Bug 2 — All-zero tie silently picks slot 0.** Not started.
- Location: `main.js` ~2444-2455 (endRound)
- Fix: If max score is 0, set `winnerSlotIndex = null`. Podium displays "No winner — nobody scored" text. Add a line to `docs/step-10a-scoring-audit.md` noting that Step 13 stats must skip rounds with null winner. **DO NOT implement Step 13 stats logic in this session.**
- Playtest: drive in circles for 60s, no scoring, confirm podium shows "no winner" text.

**Bug 3 — Early round-end on 1-cart-remaining not implemented.** Not started.
- Location: `main.js` ~3073-3076 (running phase host loop)
- Fix: Count carts with `respawnAtMs === null` after fall-processing; if `count === 1`, trigger endRound early. Edge case: 0-carts-alive simultaneously = last cart to fall wins (use `lastFallAtMs` or add a fallOrder counter).
- Host-only check (physics is host-authoritative).
- Playtest: solo round, drive into hole 3 times until only you remain, confirm round ends before 60s.

## Hard rules (reminders)

- **Diff-before-apply.** Unified diff format, wait for ack, then apply. Violated once in session 12, treated as a bug since.
- **PowerShell environment.** `Select-String`, not `grep`. Single-line commit messages with `-m "..."`.
- **Post-push remote verification is mandatory.** Local grep produces false positives. Always Select-String against deployed `main.js`, not local tree.
- **PartyKit changes**: `npx partykit deploy` + `npx partykit tail` to verify. Commit + push to main does NOT match deployed edge for `party/index.ts`.
- **PartyKit DO state persists across deploys.** Do not expect deploys to reset in-memory server state.
- **`room.getConnections()` returns an Iterator, not an Array.** Do not call `.map().join()` on it. Use `for...of` or spread (`[...room.getConnections()]`).
- **Behavior-changing diffs require human playtest on prod before moving to next diff.** String checks confirm code shipped; they do not confirm behavior.
- **Each bug is its own diff. Do not bundle.** Human playtests between diffs.

## Session 15 plan

1. **Playtest Bug 1** on prod (human task, ~3 minutes):
   - Ram NPC at full nitro → Critical should fire
   - Ram NPC at max non-nitro coasting speed (velocity ~14) → Critical should fire
   - Ram NPC from near-standstill → Critical should NOT fire
   - Also run: `Select-String -Path main.js -Pattern "wasBoost" -Context 1,1` — should return zero matches; anything still referencing `.wasBoost` from `lastHitBy` is a broken call site Cursor missed.

2. **Apply Bug 2** as own diff → commit → push → verify on prod → playtest.

3. **Apply Bug 3** as own diff → commit → push → verify on prod → playtest.

4. **Then start Step 10b** (menu DOM + CSS/SVG animated background + three mode buttons + title + Vibe Jam portal button). This is a larger step; may need its own fresh agent session after Bugs 2/3 land.

## Cursor audit tasks tracked across execution order

These are embedded in specific execution steps in `.cursorrules`. Do not address them outside their step unless explicitly asked:
- Step 10a: scoring audit (DONE, see `docs/step-10a-scoring-audit.md`)
- Step 14d: interpolation buffer empty-state behavior
- Step 16: hole radius (12-13% vs 15-20% discrepancy), spotlight count/colors, NPC hole awareness
- Step 18: `CONFIG.record.physicsSpinRadPerSec` — confirm dead config, remove if unused

## What NOT to do

- Do not implement Step 13 stats logic during Bug 2 fix. Note the null-winner hook in the audit doc only.
- Do not "helpfully" fix other things you notice while doing a targeted fix. Each session has explicit scope.
- Do not skip the diff-before-apply step, even for one-liners.
- Do not merge multiple bugs into one commit. Human playtests between each.
