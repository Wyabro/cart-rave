# Netcode deep dive — known hazards & fix order

Status: **OPEN** (static audit 2026-07-11 — **not** two-browser verified). Since the audit:
the *test* punch list closed (`1dbb48a` extracted + unit-tested `party/roundValidation.ts`,
`party/hostSelection.ts`, `applyHostMigration`; `6ee9c0b` added P2P size gates) — the hazards
below are **still open** and prioritized in [BACKLOG.md](./BACKLOG.md).  
Linked from: [STATUS.md](../STATUS.md) **NET-1**, [ROADMAP.md](./ROADMAP.md) Phase 4, [Game_Architecture.md](../reference/Game_Architecture.md).

> **What this is:** landmines other agents / surface reviews miss — clock domains, host
> migration gaps, buffer timebases, SD edges. **Not** as-built architecture (that lives in
> Game_Architecture) and **not** Living Store-specific checks (see
> [living-store-test-plan.md](./living-store-test-plan.md)).
>
> **When working netcode deeper:** rehydrate here + AGENTS multipath invariants, then code.
> Mark items fixed with date + commit; move shipped writeups to completed-work when done.

**Setup reminder:** `npm run dev:local`, two browsers on `127.0.0.1` (not `localhost`). Keep
both tabs visible — hidden-tab rAF freezes the host physics loop.

---

## Architecture recap (one screen)

| Plane | Transport | Owns |
|-------|-----------|------|
| Control | WebSocket (`party/index.ts` DO + `partysocket`) | Lobby, slots, ready, `gameStart`, `host_round` / `MSG.round`, signaling, TURN mint — **not** physics, **not** kill-feed (falls ride the P2P snapshot tail) |
| Gameplay | WebRTC DataChannel (`p2p.js`) unreliable unordered | Host transforms ~40 Hz binary, client input ~60 Hz, spill / directive one-shots, collision/fall JSON tails |
| Physics | Host-only Rapier | Sole sim authority; non-hosts predict + reconcile |

Round length: single-sourced as `ROUND_DURATION_MS` in `shared/roundConstants.js` — both
`CONFIG.round.durationMs` and `party/roundValidation.ts` import it.

---

## Hazard catalog

IDs are stable for STATUS / commits. Severity is multiplayer player-facing impact.

### NET-CLK-1 — One EWMA, three clocks

**Status:** **FIXED** (2026-07-12) — dual EWMA (`partyClock` / `hostClock` in `netcode.js`).
Party samples from WS `serverNowMs` (hello/slots/round/gameStart + keepalive ack);
host samples from P2P `tHost` only. `gameStart` prefers same-message
`startsAtMs − serverNowMs` delta; HUD/interp use `getHostClockOffsetMs()`.

**Severity:** Critical  
**Where:** `src/netcode.js` dual clock state; `src/main.js` `onGameStartHandler`;
`src/hud.js` `adjustedNow`

---

### NET-CLK-2 — Podium gate mixes host `startedAtMs` with DO `now`

**Status:** **FIXED** (2026-07-14) — server latches `runningSinceServerMs` at the running
commit; podium age checks use `prev.runningSinceServerMs || prev.startedAtMs` vs Worker
`now` (`party/roundValidation.ts`). Host wall-clock / sleep no longer rejects legitimate
timer podiums.

**Severity:** High  
**Where:** `party/roundValidation.ts` podium age branch

---

### NET-CLK-3 — Hit window / directives mix `Date.now` with round clock

**Status:** **FIXED** (2026-07-12) — `recordHit` / `lastScoringHitAt` / directive schedule and
Spill Bonus hit windows all use `getRoundClockNowMs()` (same domain as `buildKOEvent` /
`startedAtMs`).

**Severity:** Medium–High  
**Where:** `gameStore.js`, `directiveEngine.js`

---

### NET-MIG-1 — Promote restores poses, not kill credit

**Status:** **FIXED** (2026-07-12) — host transform JSON tail carries compact `attr`
`{ h, s, c }` (open hit ages vs `tHost`, last-scoring ages, combo remainMs). Non-hosts cache
`lastAttributionCache`; `applyHostMigration` restores on promote.

**Severity:** High  
**Where:** `netcode.js` `buildAttributionWire` / `applyAttributionSnapshot`;
`netcode/binary.js` tail; `gameStore.replaceLastHitBy`

---

### NET-MIG-2 — Ghost exorcism can leave `#hostId === null` with a live human

**Status:** **FIXED** (2026-07-14 core; residual closed 2026-07-16) —
`#ensureLiveHost()` after ghost exorcism; `colorPick` assigns host when first human seats;
MSG.join post-exorcism promotes the reconnecting conn when still a pending picker (same
fallthrough as onConnect). `#ensureLiveHost` still early-returns when `#hostId === null`
and no human slot exists — that path is now healed at the call site instead.

**Severity:** Critical (solo refresh / sole-human edge)  
**Where:** `party/index.ts` MSG.join ghost exorcism + colorPick host repair

---

### NET-BUF-1 — Spawn buffer uses DO time; live snapshots use host time

**Status:** **FIXED** (2026-07-14) — `applyHostSpawnSnapshot` buffers host `tHost` (same
domain as the 40 Hz stream). Party `serverNowMs` stays control-plane only.

**Severity:** High  
**Where:** `src/netcode.js` `applyHostSpawnSnapshot`

---

### NET-MIG-3 — Freeze ends before new host DataChannel; ghost colliders

**Severity:** High (feel)  
**Where:** `CONFIG.net.hostMigrationFreezeMs` (300); `gameLoop` prediction branch after freeze;
`updateRemoteCartNetTargets` + `syncRemoteCartBodiesForPrediction`; promote clears
`netStateBuffer` but **not** `lastCartsCache` / cart `_netTargetPos`

**What:** 300 ms freeze is shorter than real WebRTC re-handshake (often 500 ms–2 s). After
freeze, buffer is empty (cleared on `host_migrated`). `updateRemoteCartNetTargets` falls
through to `lastCartsCache` (or leaves stale `_netTarget*`) and
`syncRemoteCartBodiesForPrediction` **unconditionally** snaps remote Rapier bodies to those
poses every frame — colliders stay live.

**Player sees:** remotes frozen at pre-migration spots; local prediction bounces off ghost
carts; when DC opens, hard teleport + violent reconcile.

**Fix direction:** Hold freeze (or “no remote sim”) until first post-epoch host snapshot **or**
first open DC to `hostId`; clear `_netTarget*` / disable remote colliders during that window;
optionally seed buffer from promote poses without enabling collision until live.

**Smoke:** Host tab close mid-round as non-host — watch remotes until motion resumes; note
ghost-bounce if any.

---

### NET-PRES-1 — Unreliable falls/collisions: loss **and** duplicate fan-out

**Severity:** Medium (loss) / **High** (duplicate reactors)  
**Where:** `p2p.js` DataChannel `{ ordered: false, maxRetransmits: 0 }`;
`handleRemoteHostState` — **seq only gates** `bufferAuthoritativeState`;
`collisions[]` / `falls[]` always replayed; `processHostFallEvent` → `dispatchKOEvent` (feed,
announcer, shatter, `ChallengeTracker.record`, unlock KO, match stats)

**What (two faces of the same hole):**

1. **Drop:** score still arrives via reliable `host_round`; client misses shatter/feed — looks
   like desync.
2. **Duplicate / late reorder (verified structure):** a retransmitted or reordered snapshot can
   fail the seq append (`seq <= last.seq` → buffer no-op) **while still** re-running falls.
   Same KO → double feed, double shatter, **double challenge / match-stat / unlock counters**
   on non-hosts.

**Player sees:** inflated challenges/stats on results; double announcer; or missing KO VFX.

**Fix direction:** Fall/collision event ids (or host seq + index) with client LRU dedupe
**before** reactors; optionally only process tails when `bufferAuthoritativeState` actually
accepted the seq; reliable KO presentation channel if dedupe isn’t enough.

---

### NET-SD-1 — SD can untie on score while flag stays true

**Severity:** Medium  
**Where:** `gameFlow.js` multi-way suppress path still `addScore(...)`; self-fall awards only
when `survivingTied === 1` at **current** top score

**What:** After 3-way SD, A can become sole score leader while `isSuddenDeath` remains. Sole
leader self-fall → `survivingTied === 0` → no win. Last-cart-standing only helps if exactly
one body remains on arena.

**Player sees:** overtime softlock until another scoring path ends the round.

**Fix direction:** On suppress kill, re-evaluate tie / exit SD if untied; or sole-leader
self-fall awards next-highest standing human / ends via last-standing consistently.

---

## Related (already tracked elsewhere)

| Item | Doc |
|------|-----|
| Living Store two-browser checklist | [living-store-test-plan.md](./living-store-test-plan.md) |
| Phase 4 smoke + Stability Pass 1 | [ROADMAP.md](./ROADMAP.md) Phase 4 |
| As-built P2P / migration / interp | [Game_Architecture.md](../reference/Game_Architecture.md) |
| KO / falls[] contract | [scoring-event-system.md](../reference/scoring-event-system.md) |
| Host trust / leaderboards | ROADMAP “Deeper server-authoritative logic” |

**Deliberately not bugs:** host-only Rapier (design); client/server 150s match (verified);
empty-lobby ready `every()` trap (guarded in `#checkAllReady`).

### Investigated / not added as stated

| Claim | Verdict |
|-------|---------|
| **WebRTC deadlock:** ICE 5 s grace keeps old PC so post-`host_migrated` `sdpOffer` hits stale connection | **Incorrect for host handoff.** `host_migrated` calls `P2P.closeAllConnections()`, which clears `peerConnections`, `iceDisconnectGraceTimers`, and signaling chains before re-init. New host is a **new** `connId`; offer path creates a fresh PC. Mid-match recovery (non-migration) has separate re-offer logic (`forceClosePeer` + cooldown) — do not conflate with handoff. Re-verify only if a two-browser promote shows permanent silent remotes *after* maps clear (different bug). |

---

## Smoke checklist (add to NET-1)

Use alongside ROADMAP Phase 4 full-round smoke. Checkboxes for when you run it.

### Clocks / timer

- [ ] Two machines with intentional OS clock skew (~5–10s) — countdown still ~3s both sides;
      round ends within a small mutual window; no podium reject on clean timer end
- [ ] HUD remaining ≈ host end time (no multi-second fight after mid-round offset latch)

### Host migration

- [ ] Host tab close mid-round (2 humans) — successor drives, scores continue, NEW HOST callout
- [ ] Host close **mid-Sudden-Death** — no fake-fall spam; SD continues (Stability Pass 1)
- [ ] Host close **after ram, before victim falls** — kill credit on new host (or known
      acceptable miss if NET-MIG-1 still open — document which)
- [ ] **Solo refresh** mid-lobby and mid-round — new session becomes host; not stuck with
      null host (NET-MIG-2)
- [ ] Non-host during promote: remotes not “ghost frozen” with solid colliders for long
      after 300 ms freeze; no violent self-correct when motion resumes (NET-MIG-3)
- [ ] After promote, DataChannel to new host opens (not permanent silence) — if silence,
      capture logs; do **not** assume ICE-grace deadlock without evidence

### Buffer / presentation

- [ ] Rematch / GO — remotes not frozen or teleported for >1 frame (NET-BUF-1)
- [ ] Kill on client under lossy network — score always lands; note any missing shatter/feed
      (NET-PRES-1 drop)
- [ ] Same kill never double-feeds / double-challenge on client (NET-PRES-1 duplicate)

### Sudden Death

- [ ] 3-way human tie → one kill suppress → remaining fight ends cleanly (no softlock NET-SD-1)
- [ ] Sole leader self-fall in SD (if reachable) ends round via standing / award path

### Attribution / wire

- [ ] Non-host ram → fall within 2.5s → kill on both machines
- [ ] After long session / tab sleep wake — hit window still credits (NET-CLK-3)

---

## Fix order (highest leverage first)

1. **NET-CLK-1** — Split Party vs host clock offset; fix `startsAtLocalMs`
2. **NET-CLK-2** — Align podium age check with the same domain as `startedAtMs`
3. **NET-MIG-2** — Never leave live humans with null host (exorcism + color-pick + ensureLiveHost)
4. **NET-MIG-3** — Freeze / no-remote-collision until first post-epoch host snap (or open DC)
5. **NET-BUF-1** — Spawn buffer on `tHost`
6. **NET-PRES-1** — Event-id dedupe for falls/collisions before reactors (loss + duplicate)
7. **NET-MIG-1** — Attribution transfer (or explicit product decision)
8. **NET-CLK-3** — One clock for hits + directives
9. **NET-SD-1** — SD untie / sole-leader fall

---

## Code map (jump list)

| Concern | Files |
|---------|--------|
| Control plane / host id / podium validate | `party/index.ts` |
| Client net + buffer + offset + promote | `src/netcode.js`, `src/netcode/p2p.js`, `src/netcode/binary.js` |
| Round start / promote handlers | `src/main.js` |
| Timer / SD / falls | `src/gameFlow.js`, `src/roundClock.js` |
| Scores / lastHitBy | `src/stores/gameStore.js`, `src/gameState.js` |
| KO build | `src/scoring/koEvent.js` |
| Directives schedule | `src/directives/directiveEngine.js` |
| Prediction / reconcile | `src/gameLoop.js` |
| Protocol / limits | `shared/protocol.js`, `shared/wsMessageLimits.js` |
| Unit tests (gaps OK) | `tests/netcode.test.js`, `tests/gameFlowSuddenDeath.test.js`, `tests/roundClock.test.js` |

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-11 | Initial hazard catalog from static multiplayer audit (NET-CLK/MIG/BUF/PRES/SD). UNPUSHED with STATUS/ROADMAP/architecture pointers. |
| 2026-07-11 | Gemini cross-check: added **NET-MIG-3** (freeze ≪ WebRTC + ghost colliders); expanded **NET-PRES-1** (seq does not gate falls → duplicate reactors). Rejected host-handoff “ICE grace deadlock” as stated — `closeAllConnections` clears peers/timers first. |
