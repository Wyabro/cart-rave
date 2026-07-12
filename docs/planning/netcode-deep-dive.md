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

Round length: `CONFIG.round.durationMs` **and** `ROUND_DURATION_MS` in `party/index.ts` both
`150000` — keep them equal.

---

## Hazard catalog

IDs are stable for STATUS / commits. Severity is multiplayer player-facing impact.

### NET-CLK-1 — One EWMA, three clocks

**Severity:** Critical  
**Where:** `src/netcode.js` `updateServerClockOffset`, `handleRemoteHostState`; `src/main.js`
`onGameStartHandler` (~`startsAtLocalMs`)

**What:** `updateServerClockOffset` is only fed **host `tHost`** from P2P snapshots — never
Party `serverNowMs` from hello / `gameStart` / keepalive. At `gameStart`, offset is usually
**0**, so:

```text
startsAtLocalMs = serverStartsAtMs + getServerClockOffsetMs()  // ≈ raw Worker time
```

Host then stamps `startedAtMs` and ends the round with pure local `getRoundClockNowMs()`.
HUD uses `adjustedNow = local − offset`, which later latches to **host** time mid-round.

**Player sees:** countdown snap / stretch; HUD remaining fights real timer; round ends
early/late by machine skew.

**Fix direction:** Split **Party offset** (hello/keepalive `serverNowMs`) vs **host offset**
(`tHost`). Never one EWMA. Convert `startsAtMs` with Party offset only; drive interp with host
offset only.

---

### NET-CLK-2 — Podium gate mixes host `startedAtMs` with DO `now`

**Severity:** High  
**Where:** `party/index.ts` `#validateHostRound` podium branch

```text
now - prev.startedAtMs > ROUND_DURATION_MS + 15_000  → reject (unless isSuddenDeath)
```

`startedAtMs` is host-written (often mis-converted from NET-CLK-1). `now` is DO
`performance.timeOrigin + performance.now()`.

**Player sees:** legitimate 150s end → `rejected: true` → host rollback / softlock or
results flash then vanish. SD only bypasses upper bound if server stored `isSuddenDeath`.

**Fix direction:** Stamp lifecycle in one domain (prefer server time for starts/ends, or
host-local and stop age-checking against DO `now`). Widen grace only as a temporary band-aid.

---

### NET-CLK-3 — Hit window / directives mix `Date.now` with round clock

**Severity:** Medium–High  
**Where:** `gameStore.recordHit` (`timestamp: Date.now()`); `gameFlow` → `buildKOEvent(...,
roundNowMs)`; `directiveEngine` `Date.now() - state.roundStartedAtMs`

**Player sees:** rams inside 2.5s window credited as self-falls (or reverse) after NTP /
sleep / phone clock step; Living Store slots clump, skip, or eat quiet finale.

**Fix direction:** One clock for hit windows + directive schedule (`getRoundClockNowMs` or
`performance.now()` — not mixed with wall `Date.now()` against round stamps).

---

### NET-MIG-1 — Promote restores poses, not kill credit

**Severity:** High  
**Where:** `simulation.js` host-only `recordHit`; promote path `netcode.js` `host_migrated`
+ `main.js` SD recover; wire `serializeCartToWire` (no combo / no lastHit)

**What:** `lastHitBy` / `lastScoringHitAt` live only in the previous host’s Zustand store.
Combos are cart fields not on the snapshot.

**Player sees:** mid-round host drop → fall after promote is self-fall / wrong feed; timer
ties break with empty last-hit map → lowest slot; wrong combo multipliers on new host.

**Fix direction:** Compact attribution snapshot on promote (or document “open hits lost” as
accepted until then). Optional: include combo tier on wire if needed for feed parity.

---

### NET-MIG-2 — Ghost exorcism can leave `#hostId === null` with a live human

**Severity:** Critical (solo refresh / sole-human edge)  
**Where:** `party/index.ts` `#ensureLiveHost` early `if (this.#hostId === null) return`;
MSG.join ghost exorcism; `colorPick` never assigns host

**What:** Refresh mid-session: new conn is still a **pending picker** when join exorcises the
old host. `#pickNextHostId` only considers **human slots** → null host. Color-pick makes them
human but does not promote. Only a later `onConnect` `if (!this.#hostId)` heals.

Violates AGENTS: “on host disconnect the server promotes the oldest surviving connection.”

**Player sees:** one human in room, nobody is host — no `host_round`, no physics authority.

**Fix direction:** After ghost exorcism / color-pick / reap: if humans exist and `#hostId` is
null (or dead), `#pickNextHostId()` + `host_migrated`. Do not early-return forever on null
when live humans remain.

---

### NET-BUF-1 — Spawn buffer uses DO time; live snapshots use host time

**Severity:** High  
**Where:** `applyHostSpawnSnapshot` prefers `msg.serverNowMs` (DO); `handleRemoteHostState`
buffers `tHost` (host)

**Player sees:** warp / stuck remotes right at GO or rematch; worse with 3–4 peers.

**Fix direction:** Buffer spawn with `tHost` (same domain as 40 Hz stream). Keep Party
`serverNowMs` for control-plane only.

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
