# Step 10a — Scoring system audit

> **Archived** (April 2026, jam era). Moved to `docs/audits/`. Current priorities: [ROADMAP.md](../ROADMAP.md)
>
> **Superseded** (2026-07-08) by [`../scoring-event-system.md`](../scoring-event-system.md).
> Scoring is now one output of a richer **KO Event** consumed by the announcer, challenges,
> combos, Sudden Death, VFX, and the kill feed. This audit reviewed a much smaller game; read
> it for the original jam-era spec intent, not the current architecture. Note: its §8 all-zero
> tie gap is now fixed (`pickTimerWinner` returns `"draw"`); its §3 critical-velocity gap is
> still open (tracked as Q1 in the new doc).

Read-only audit of `main.js` and `party/index.ts` against `.cursorrules` (Scoring & Round Structure, lines 82–92) and Step 10a prerequisite note (Execution order §10a).

**Sources:** `main.js` (host-authoritative physics, fall detection, ramming, round lifecycle); `party/index.ts` (relay of `host_round` / `round`, placeholder `host_event_fall`).

---

## 1. Outer edge knock (+1)

**Verdict: Partial**

**References:** `main.js` 3010–3056 (fall + scoring), 2336–2398 (`applyRammingImpulse` / `lastHitBy`), 3197–3205 (collision → ram).

Fall is detected when a cart’s world `y` drops below `CONFIG.fall.yThreshold` during `running` on the host. If a qualifying recent ram exists (`lastHitBy`, 1500 ms window), base points are `1` when the victim is **not** classified as a center-hole fall (`distOriginXZ >= CONFIG.record.innerRadius + 2`); the attacker slot receives those points. Attribution uses Rapier collision starts: each pair calls `applyRammingImpulse` both ways so the cart moving toward the other registers a hit on the victim; `lastHitBy` stores `attackerSlotIndex` for the victim slot.

**Gaps:** There is no separate “outer edge” trigger—only vertical fall plus planar distance for center vs non-center. Self-falls or environmental falls without a recent ram award **no** knock points (by design of the current “Stage A” rule, but different from a pure “knock off edge” rule). No `host_event_fall` is emitted from the client (see §6).

---

## 2. Center hole knock (+2)

**Verdict: Partial**

**References:** `main.js` 3023–3025, 52–55 (`CONFIG.record.innerRadius`).

When scoring applies, `isCenterHole` is true if `distOriginXZ < CONFIG.record.innerRadius + 2`, then `points = 2`; otherwise `points = 1`. The `+2` is **hardcoded** in this branch, not named constants like `SCORE_CENTER_KNOCK` (inner radius itself is in `CONFIG`).

**Gaps:** Same fall path as §1; the `+2` magic number is not centralized with other score rules. The `+ 2` margin is a heuristic, not necessarily aligned with the ring collider hole geometry.

---

## 3. Critical bonus (+1 at top speed)

**Verdict: Partial (spec mismatch)**

**References:** `main.js` 2377–2380, 2394–2397, 3026–3027; `CONFIG.cart.ramBoost` 112–126; `CONFIG.ramming` 153–157.

There is **no** planar-speed threshold for “critical.” Instead, `wasBoost` is true when `performance.now() <= (rammer.ramBoostActiveUntilMs || 0)`—i.e. **nitro / ram-boost window**, not “top speed” from linear velocity alone. `.cursorrules` calls for a tunable **velocity** threshold independent of nitro; that is **not** implemented.

---

## 4. Target bonus (+1 when victim is current leader)

**Verdict: Partial**

**References:** `main.js` 3029–3039.

Before applying the score, the code scans `roundScores[0..3]` and picks the slot with the **maximum** score as `leaderSlotIndex` (initial `leaderScore = -Infinity`, first slot wins ties). If the falling victim’s `slotIndex === leaderSlotIndex`, it adds `+1`.

**Gaps:** No persistent “leader” state beyond this computation; tied scores arbitrarily favor the **lowest slot index**. There is no red leader spotlight / emissive on leader cart in code (only static scene spotlights and record rim emissive—`main.js` 1408–1450, 1589–1590), so “current leader” exists only for this bonus math.

---

## 5. Jackpot (Critical + Target stacked, +2 total)

**Verdict: Implemented (stacking only; critical condition wrong per §3)**

**References:** `main.js` 3025–3044.

`points` starts at base (1 or 2), then `if (hit.wasBoost) points += 1`, then `if (slotIndex === leaderSlotIndex) points += 1`. If both conditions hold, the two bonuses **stack** on one award (+2 from bonuses plus base), which matches the intended stacking **if** “critical” were velocity-based. Because “critical” is currently boost-based (§3), jackpot behavior does not match the design doc.

---

## 6. Score storage

**Verdict: Partial**

**References:** `main.js` 301, 2401–2414 (`sendHostRound`), 2417–2433 (reset at `startRunning` / `startCountdown`), 664–697 (`MSG.round` handler), 2439–2456 (`endRound`); `party/index.ts` 23–27, 425–437, 59–61, 107–119.

- **Per-slot round scores** live in the **browser** on every peer as `roundScores` (`main.js` 301). The **host** mutates them on fall; all clients sync from the `round` message payload (`r.scores`).
- **PartyKit** stores `#round` with type `RoundState` (`phase`, `winnerSlotId`), but `host_round` assigns `this.#round = data.round` as a whole object and rebroadcasts it—so the runtime payload can include `scores`, `startedAtMs`, etc., even though the TypeScript type is minimal. **Slots** in `party/index.ts` have **no** `score` field; the server does not authoritatively persist round scores in DO state beyond whatever the last `round` blob held.
- **Reset:** Scores zero out when **countdown** starts and again when **running** starts (`startCountdown` / `startRunning`), not at podium end.
- **Broadcast:** Via `host_round` → server `MSG.round` broadcast; not derived per-client from fall events alone.

**Gaps:** No client currently sends `MSG.hostEventFall` (`main.js` only defines the constant at 15; no `partySocket.send` for it). Server handler is a diagnostic relay (`party/index.ts` 440–450).

---

## 7. Podium trigger

**Verdict: Partial**

**References:** `main.js` 3073–3076 (timer → `endRound`), 2439–2456 (`endRound`), 1304–1327 (`updateResultsOverlay`), 664–696 (`MSG.round`).

When the 60 s timer elapses, the host calls `endRound()`, sets `roundPhase` to `podium`, computes `winnerSlotIndex`, and `sendHostRound()` includes `scores: roundScores`. Clients receiving `MSG.round` copy `roundScores` from `r.scores` when present. The results overlay shows per-slot lines and a winner line (`P{n} wins — {score} pts`).

**Gaps:** **No** early end when only one cart remains (no `endRound` on “last cart standing”); only the 60 s path fires. If scores were never synced, clients would still show whatever `roundScores` they had—here the host includes them in `round`, so podium **does** receive final scores when the relay works.

---

## 8. All-zero tie handling

**Verdict: Missing (incorrect vs spec)**

**References:** `main.js` 2444–2455 (`endRound`), 671–684 (match history on podium transition).

`endRound` initializes `winnerScore` to `-Infinity` and picks the slot with the **strictly greater** score. With all scores `0`, slot **0** wins because `0 > -Infinity`. The UI will show “P1 wins — 0 pts”. Match history uses `winnerSlotIndex` defaulting to `0` when `r.winnerSlotIndex` is not finite (`671–673`), reinforcing slot-0 bias.

There is **no** “no winner / round does not count for stats” path (`.cursorrules`: all-zero tie → no winner, no stats). No “most recent scoring hit” tiebreaker for equal **positive** scores either—ties at end favor **lower slot index** (`2447–2451`).

---

## Summary — before Step 13 (stats tracking)

For Step 13 to align with `.cursorrules`, the following need to exist (beyond any polish):

1. **Critical bonus:** Replace ram-boost flag with a **velocity threshold** (configurable in `CONFIG`), independent of nitro, applied on the scoring ram.
2. **Round outcome rules:** **All-zero tie** → no declared winner, no match/stats attribution; optionally distinct podium copy. **Score ties** → tiebreaker per spec (“most recent scoring hit”), not lowest slot index.
3. **Leader definition:** Define tie behavior for “current leader” (target bonus) consistently with UI if a leader highlight is added later.
4. **Early round end:** If still in scope, end the round when **one cart remains** on the ring, not only at 60 s.
5. **Optional clarity:** Centralize point values (+1/+2/bonuses) in `CONFIG`; consider whether `host_event_fall` should carry structured fall reason for telemetry (server path exists but client never sends).

**Already in good shape for a prototype:** Host-only fall scoring, ram-based attacker attribution, center vs non-center base points, target stacking with leader-from-scores, `round` broadcast feeding HUD and podium, `lastHitBy` windowing.

---

## File:line index (quick)

| Topic | Location |
|--------|-----------|
| `roundScores`, `lastHitBy` | `main.js` 299–301 |
| `MSG.round` / match history | `main.js` 664–697 |
| `sendHostRound` / resets | `main.js` 2401–2433 |
| `endRound` / winner loop | `main.js` 2439–2456 |
| Fall + scoring | `main.js` 3010–3056 |
| `applyRammingImpulse` + attribution | `main.js` 2336–2398 |
| Collisions → ram | `main.js` 3197–3205 |
| Results overlay | `main.js` 1304–1327 |
| `host_round` relay | `party/index.ts` 425–437 |
| `host_event_fall` placeholder | `party/index.ts` 440–450 |
| `RoundState` type | `party/index.ts` 23–27 |
