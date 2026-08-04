# HOST-TAB-1 — Full wave plan (for Wyatt review)

**Status:** implemented locally 08-04 in levers A–D; **production playtest owed** (§10).
Wyatt explicitly parked PERF-PASS-1 and acked this wave before implementation.

**Card:** [BACKLOG.md](./BACKLOG.md) · HOST-TAB-1 (High · Design / Gameplay)  
**Branch:** `cart-clash`  
**Ack unit:** this whole wave (levers A–D). **Commit unit:** one lever per commit.  
**Mid-wave abort:** if a lever fails its asserts, stop; remaining levers need a fresh continue.  
**Review pass:** 08-03 — cooldown / solo / dual-driver / server entrypoints locked (see §3).

---

## 1. Goal (player-visible)

| Situation | What the player should feel |
|-----------|------------------------------|
| Host alt-tabs **briefly** (under ~10s) | Match **keeps moving** for everyone; no frozen world |
| Host stays hidden **≥ ~10s** | Host role **moves mid-round** to another human; AFK host stays in the room as a peer |
| Strong machine **returns** mid-round | If clearly strongest (score margin), they **get host back** mid-round |
| Solo | **Pump while hidden**; clock shift **only if pump did not run** — **never** host migration |
| QA / harness | Tools that need a live sim keep using DEV `?perfPump`; freeze-recovery tools deliberately do not |

**Not goals:** forever full-speed GPU while backgrounded; pause-the-match UI; Web Worker sim rewrite.

---

## 2. Why it exists

Chrome **stops `requestAnimationFrame` in hidden tabs**. Today:

| Path | Behavior |
|------|----------|
| DEV `?perfPump` | MessageChannel ~60Hz **global rAF shim** — tools only ([`src/utils/perfPump.js`](../../src/utils/perfPump.js)); leave as-is |
| Prod host hide | Round **clock** compensated on return (`hostHiddenAtMs` in `main.js`); **sim still frozen** while hidden |
| Disconnect | Promote **oldest** live human ([`party/hostSelection.ts`](../../party/hostSelection.ts) `pickNextHostId`) — **unchanged** by this card |
| Lobby only | Prefer strongest host with margin 20 (`#maybeRebalanceHostForQuality` — **lobby phase only**) |
| Mid-round migrate | Full path already exists via `MSG.hostMigrated` → `applyHostMigration` ([`src/netcode.js`](../../src/netcode.js)) |

Non-hosts still watch a frozen world while the host tab is hidden.

---

## 3. Locked product decisions

| Decision | Value |
|----------|--------|
| Short hide | Host **frame pump** (calls same `step(now)` as the rAF loop) |
| Long hide | **10_000 ms** continuous `document.hidden` as host → AFK demotion |
| Return | **Mid-round** rehost to strongest when margin clears |
| Margin | **20** (`HOST_SCORE_MIGRATE_MARGIN` / `shouldMigrateToPreferredHost`) — do not add a third copy |
| AFK candidate set | **Exclude the AFK host** — otherwise strongest AFK never demotes |
| Return candidate set | **All live humans** (returning strong host can reclaim) |
| Solo / 1 human + NPCs | **Pump yes**; **no promote**; clock = pump **or** shift, **never both** |
| Countdown | **Included** — pump + AFK + return rebalance (same as `running`) |
| Migrate cooldown | **5_000 ms** between any two mid-round migrations in one room (away **and** present) |
| `hostPresent` senders | **Any live human** on foreground (rate-limited; migrate still margin-gated) |
| Toast | One toast per migrate reason; no spam |
| Mid-round return reason | **`host_return`** (distinct from lobby `host_quality`) |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Client                                                          │
│  Re-evaluate pump predicate on: visibilitychange AND host role  │
│  Predicate: isHost && (MP \|\| solo) && phase running|countdown  │
│             && document.hidden                                  │
│    true  → start hostFramePump → calls same step(now)           │
│            cancel pending rAF (one driver only)                 │
│            if host+MP: arm 10s → once → WS MSG.hostAway         │
│    false → stop pump; if visible, schedule one rAF              │
│  visibility → visible:                                          │
│    → stop pump; resume rAF                                      │
│    → WS: MSG.hostPresent (any human, rate-limited)              │
│    → clock shift ONLY if pump did not keep sim live             │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket control plane
┌────────────────────────────▼────────────────────────────────────┐
│ party/index.ts — SEPARATE entrypoints (do not fold into lobby)  │
│  #handleHostAway:                                               │
│    phase running|countdown && ≥2 humans && cooldown clear →     │
│    next = pickPreferredHostIdExcluding(..., currentHostId)      │
│    broadcast host_migrated { reason: host_afk }                 │
│  #handleHostPresent (mid-round):                                │
│    phase running|countdown && cooldown clear →                  │
│    preferred = pickPreferredHostId(all live)                    │
│    if shouldMigrateToPreferredHost →                            │
│      broadcast host_migrated { reason: host_return }            │
│  #maybeRebalanceHostForQuality — KEEP lobby-only; do not widen  │
└────────────────────────────┬────────────────────────────────────┘
                             │ all clients
┌────────────────────────────▼────────────────────────────────────┐
│ applyHostMigration (existing)                                   │
│  P2P tear-down + re-init · snapshot epoch · freeze non-hosts    │
│  announce new_host · toast by reason (host_afk / host_return /  │
│  host_quality)                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Authority invariant unchanged:** server never simulates physics. Only who is host changes.
Migration reuses the battle-tested disconnect path — do not invent a second handoff.

---

## 5. Critical design details (must not miss)

### 5.1 AFK demotion must exclude the current host

`pickPreferredHostId` ranks **all** live humans. An AFK 4090 host is still live and still
scores 100 → demotion would no-op.

**Required pure helper** (extend `party/hostSelection.ts`):

```ts
// Conceptual — exact name in implementer hands
pickPreferredHostIdExcluding(joinOrder, live, slots, scores, excludeId)
```

| Path | Exclude |
|------|---------|
| AFK demotion | `excludeId = currentHostId` |
| Return / quality | nobody (all live humans) |

Unit-test both; do not only smoke in browser.

### 5.2 Clock compensation vs pump — never both

Today: on host return, `startedAtMs += hiddenGap` so the wall timer does not jump
(`hostHiddenAtMs` in `main.js`). That path today only stamps **`running`** — not countdown.

**If the pump kept the sim live in real time, that shift is wrong** — it would *extend* the
round by the hidden duration a second time.

| Pump state while hidden | On visible |
|-------------------------|------------|
| Pump ran (predicate true the whole hide) | **Do not** apply `hostHiddenAtMs` / countdown shift |
| Pump did not run (failed / non-host) | Apply compensation for frozen time |

**Order / flags:**

1. When hide starts and pump **will** run: do **not** stamp `hostHiddenAtMs` (or clear it when pump starts).
2. When pump fails to start: stamp freeze time as today.
3. Track `hostPumpActive` (or equivalent); shift only if `!hostPumpActive` for that hide window.
4. **Countdown:** host+MP (and solo) **always pump** in countdown when predicate matches — so frozen-countdown compensation is not required for the happy path. If pump fails during countdown, extend the same compensation pattern to `countdownStartedAtMs` (mirror solo Esc pause).

**Solo:** pump **yes**; shift **only if pump did not run**. Never pump + shift.

Assert: pumped hide 5s → remaining time continuous; frozen hide 5s → remaining does not skip.

### 5.3 Pump shape (prod, gated — not a global rAF shim)

Do **not** ship always-on global `requestAnimationFrame` replacement in prod.
Do **not** “extract shared install” from `perfPump.js` into the prod path — that module is a
DEV **global rAF shim** for tools. Leave it alone.

| Concern | Owner |
|---------|--------|
| DEV tools | `?perfPump` / `perfPump.js` — unchanged |
| Prod host-away | New `src/utils/hostFramePump.js` (or equivalent) **driven from `gameLoop.js`** |

| Visible | Hidden (predicate true) |
|---------|-------------------------|
| Normal `requestAnimationFrame(step)` | Secondary pump calls the **same** `step(now)` |
| | **Cancel** the in-flight rAF id before pump ticks (loop’s `step` always re-schedules rAF) |
| | On stop: tear down pump, then schedule **one** rAF |
| | Guard: only one driver (pump **or** rAF), never both |

**Re-evaluate predicate on:**

1. `visibilitychange`
2. Host role change (`host_migrated` / authority flip) — demoted peer still `document.hidden` must **stop** pumping

Chrome may still throttle background timers toward ~1Hz after long AFK — **expected**. Pump is
for short alt-tabs; 10s demotion is the long-AFK fix.

Prefer wiring the dual-driver cancel/resume **inside `gameLoop.js`** (holds the rAF id), not a
second competing visibility listener only in `main.js`.

### 5.4 Phases

| Phase | Pump | AFK promote @10s | Return rebalance (`hostPresent`) |
|-------|------|------------------|----------------------------------|
| `lobby` | No | No | Existing lobby `#maybeRebalanceHostForQuality` only |
| `countdown` | Yes if host | Yes if ≥2 humans | Yes (mid-round entrypoint) |
| `running` | Yes if host | Yes if ≥2 humans | Yes |
| `podium` | No | No | No |

### 5.5 Wire protocol

Add to [`shared/protocol.js`](../../shared/protocol.js) (single source of truth):

| MSG | Direction | Purpose |
|-----|-----------|---------|
| `hostAway` | client → server | Current host reports continuous hide ≥ 10s — **client fires once**; cancel timer on visible / demotion |
| `hostPresent` | client → server | Any live human reports return to foreground — triggers mid-round preferred rebalance check |

**Validation (server):**

- `hostAway`: only accept from **current** `#hostId`; ignore others; ignore if &lt;2 live humans
- `hostPresent`: accept from any live human; rebalance only if `shouldMigrateToPreferredHost`
- Both: reject AFK / mid-round return paths during `lobby` / `podium` (lobby keeps existing quality path)
- Both: respect **5_000 ms** room migrate cooldown (shared counter for any mid-round `host_migrated`)

**`MSG.hostMigrated.reason` values:**

| reason | When |
|--------|------|
| `host_afk` | Demotion after 10s hide |
| `host_return` | Mid-round reclaim / strongest after `hostPresent` |
| `host_quality` | Lobby-only path — **unchanged** |

Toast copy (presentation only — extend the reason block in `applyHostMigration`):

- AFK: `"Host stepped away — [Name] is hosting."` / if you became host: `"You're hosting — previous host stepped away."`
- Return: reuse smoother-multiplayer strings **or** mirror them under `host_return` (same player copy is fine)
- Quality (lobby): keep existing strings

### 5.6 Cooldowns / thrash guard

| Guard | Default (locked) |
|-------|------------------|
| AFK threshold | **10_000 ms** continuous `document.hidden` as host |
| Migrate cooldown | **5_000 ms** between any two mid-round migrations in one room |
| `hostPresent` handler | Same cooldown — cheap ignore if cooling down (do not spam work) |
| Return rebalance | Only if preferred ≥ current + **20** |
| Away while already not host | Ignore |
| Pump while not host | Off (predicate false) |

Flap scenario: host hides 10s → demote → returns at 11s → re-promote if strongest **and**
cooldown clear. Second flap waits out the 5s migrate cooldown.

### 5.7 Server entrypoints — do not widen lobby helper

`#maybeRebalanceHostForQuality` today hard-gates `phase !== "lobby"` and `#countdownArmed`.
**Do not** generalize that function into mid-round.

| Entrypoint | Role |
|------------|------|
| `#maybeRebalanceHostForQuality` | Lobby only — leave behavior unchanged |
| `#handleHostAway` (new) | Mid-round AFK demote with exclude-self pick |
| `#handleHostPresent` (new) | Mid-round preferred rebalance (all live) |

Share pure helpers from `hostSelection.ts`; keep side effects in distinct DO methods.

---

## 6. Levers (one commit each)

### Lever A — Tools / docs hygiene (docs-first)

**Goal:** Document the split: prod host pump (this card) vs DEV `?perfPump` (tools).  
**Reality check:** shoot, blackframes, gameharness, netharness, perf-profile, podium, states,
loadshots, sheet **already** set `perfPump=1`; `tabhidden` correctly omits it.  
**Files:** [`docs/guides/visual-qa.md`](../guides/visual-qa.md),
[`docs/guides/netcode-harness.md`](../guides/netcode-harness.md); tools commits **only** if a
gap is found **and** tools freeze is lifted.  
**Explicit leave alone:** [`tools/tabhidden.mjs`](../../tools/tabhidden.mjs) — **no** `perfPump`.

**Asserts:**

- Matrix confirm (grep): every sim-needing tool sets `perfPump=1` or documents why not
- `tabhidden` still omits it
- Doc gotcha: “prod host pump is HOST-TAB-1; tools still pass `?perfPump` in DEV”

**Note:** AGENTS freezes `tools/` during a **game** card. Prefer docs-only for A; file tool gaps
to BACKLOG if freeze is up.

**Estimate:** ~15–30 min (docs); longer only if a real tool gap exists.

---

### Lever B — Host background pump (prod, gated)

**Goal:** 0–10s host hide → sim advances (MP: non-hosts still receive transforms).  
**Files (likely):**

- **New** `src/utils/hostFramePump.js` (MessageChannel/setTimeout → `step(now)`)
- `src/gameLoop.js` — rAF id, cancel/resume, predicate hook (preferred home)
- `src/main.js` — wire host/phase/solo gates + clock flag (§5.2); minimize if loop owns driver
- Tests: predicate start/stop; dual-driver (no double `step`); pumped vs frozen clock

**Leave alone:** `src/utils/perfPump.js` (DEV rAF shim).

**Asserts:**

- Unit: pump starts only when predicate true; stops on visible **and** on lose-host while hidden
- Unit: cancel pending rAF before pump; no double `step`
- Manual: host tab hidden 3s, non-host still sees motion
- Solo: pump runs; no migration; timer not double-shifted
- Clock: pumped hide does not extend round; frozen hide still compensates (§5.2)
- Countdown: pump runs for host when hidden

**Risks:** main.js / loop ownership clash with PERF-PASS-1; WebGL may still pause on some mobile
GPUs while pump runs CPU sim — acceptable for desktop MP first.

**Estimate:** ~1.5–2.5 h.

---

### Lever C — AFK promote @ 10s

**Goal:** Long hide → mid-round host moves to next-best human (exclude AFK).  
**Files (likely):**

- `shared/protocol.js` — `MSG.hostAway`
- `party/hostSelection.ts` — exclude helper + tests
- `party/index.ts` — `#handleHostAway` (not lobby helper); cooldown; `reason: host_afk`
- Client — 10s timer while host+hidden; send away once; cancel on visible or demotion
- `src/netcode.js` `applyHostMigration` — toast for `host_afk`
- `tests/hostMigration.test.js` / hostCapability tests as needed

**Asserts:**

- Pure: exclude-self preferred ≠ AFK host when another human exists
- Pure: alone host → no promote
- Server: ignore `hostAway` from non-host
- Server: second migrate within 5s cooldown does not thrash
- Live/manual: two browsers, host hide 12s → other human hosts; old host still seated

**Estimate:** ~2–3 h.

---

### Lever D — Return → strongest mid-round

**Goal:** On `hostPresent`, if preferred clears margin 20, migrate mid-round.  
**Files (likely):**

- `shared/protocol.js` — `MSG.hostPresent`
- `party/index.ts` — `#handleHostPresent` (**new**; do not widen lobby helper)
- Client: `visibilitychange` → visible → send `hostPresent` (any human, client-side light debounce OK)
- `applyHostMigration` — toast for `host_return`

**Asserts:**

- Pure: preferred with +20 margin migrates; +19 does not
- Mid-round: phase `running` / `countdown` allow migrate on present
- Strong host return after AFK demotion reclaims host (after cooldown)
- Weak return does not steal from stronger current host
- `hostPresent` during cooldown is a no-op (no thrash)

**Estimate:** ~1.5–2.5 h.

---

## 7. File touch map (expected)

| Area | Files |
|------|--------|
| Protocol | `shared/protocol.js` |
| Server | `party/index.ts`, `party/hostSelection.ts`, party / hostSelection tests |
| Client loop | `src/gameLoop.js`, `src/main.js`, **new** `src/utils/hostFramePump.js` |
| Client net | `src/netcode.js` (away/present send + migration toast reasons) |
| Caps | Reuse existing margin — no third constant |
| Docs | `docs/guides/visual-qa.md`, `netcode-harness.md`; BACKLOG/STATUS at wave end |
| Tools | Only if matrix finds a gap **and** tools freeze is down |
| Tests | hostSelection exclude, pump dual-driver/predicate, hostMigration reasons |

**Do not:** move physics server-side · rewrite P2P · change disconnect oldest-promote · ship
unthrottled background GPU forever · replace global rAF in prod · widen
`#maybeRebalanceHostForQuality` into mid-round.

**Arch note:** a new `hostFramePump.js` needs an `archMap.mjs` home — that file is **frozen
during a game card**. Prefer owning under an existing system entry if possible; otherwise file
the `archMap` line to BACKLOG and land mapping in a tools/docs block, or get Wyatt’s OK to touch
`tools/lib/archMap.mjs` for the one mapping row.

---

## 8. Out of scope (explicit)

- Pausing the match for everyone with a “host away” freeze UI (later card)
- Migrating to NPCs
- Changing `HOST_SCORE_MIGRATE_MARGIN` without playtest evidence
- Making `?perfPump` the prod default for all users
- Fixing Chrome’s long-background 1Hz throttle (impossible fully)
- PERF-PASS-1 geometry cuts (separate card)
- Changing disconnect promote-oldest rule

---

## 9. Sequencing vs PERF-PASS-1

| Constraint | Rule |
|------------|------|
| Lever B–D | Touch `main.js` / loop / netcode — **after PERF wave clears** or in a dedicated session Wyatt assigns |
| Lever A | Docs anytime; tools commits only when tools freeze lifts |
| One card | HOST-TAB-1 is the active game card only when Wyatt names it ACTIVE |
| BACKLOG note | Solo line must say pump **or** shift, never both (fix when card becomes ACTIVE / at wave start) |

---

## 10. Verification matrix

### Automated

| Check | Lever |
|-------|--------|
| `npm run qa` green by number after each commit | all |
| hostSelection exclude + margin unit tests | C, D |
| hostMigration reason toast / applyHostMigration with synthetic msg | C, D |
| pump dual-driver / predicate / lose-host-while-hidden tests | B |
| netharness still passes with existing `perfPump` | A, regression |

### Manual playtest checklist (run on prod after ship)

**Setup:** two machines or two browsers, friends room, any arena, both human.

1. **Short hide** — Host alt-tabs **3s**, non-host watches.  
   **Pass:** world still moves; no host glyph change; no toast storm.  
2. **Long hide** — Host alt-tabs **12s**.  
   **Pass:** host glyph moves; other human is host; AFK still seated; one toast; match continues (may hitch ~1–3s like NET-MIG).  
3. **Strong return** — After (2), original strong host focuses again.  
   **Pass:** if score margin ≥20 and cooldown clear, host returns mid-round; one toast; playable after migration freeze.  
4. **Second migrate same match** — After (2) or (3), hide again past AFK (or return then hide).  
   **Pass:** peer recovers; no freeze; no stuck “disconnected” peer on host HUD. Optional: `?diag=1`, F8 `pt-host-tab-1`, `npm run captures:pull` — confirm new host emits `sdpOffer` and any drop is not a silent WS death.  
5. **Weak cannot steal** — Weak peer returns while strong hosts.  
   **Pass:** host stays on strong.  
6. **Solo** — Solo hide 15s.  
   **Pass:** no migration; timer not double-shifted; game recoverable on focus.  
7. **Tools** — `npm run shoot` (or battery cell) still completes with DEV `perfPump`.  
8. **tabhidden** — still asserts freeze recovery (no pump).

Behavior changes need this human playtest on production after deploy (AGENTS).

---

## 11. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Double mid-round migrate hitch | Reuse `applyHostMigration`; 5s cooldown; toast once |
| Strong AFK never demotes | Exclude AFK from preferred pick (§5.1) |
| Round timer wrong after pump | Conditional shift; never stamp freeze time when pump active (§5.2) |
| Double `step` | Cancel rAF before pump; one driver (§5.3) |
| Demoted host keeps pumping while hidden | Re-evaluate predicate on host role change (§5.3) |
| Lobby quality regressions | Separate mid-round entrypoints (§5.7) |
| `hostPresent` spam | 5s migrate cooldown on server handler |
| PERF conflict | Do not start B–D until PERF releases loop files |
| Mobile WebGL context kill on background | Existing context-loss reload; pump does not fix GPU reclaim |
| Wire straddle mid-deploy | New MSG types only; old clients ignore unknown; server ignores away from non-host / unknown |
| New file unmapped | archMap row or BACKLOG (§7) |

---

## 12. Definition of done

- [x] Levers A–D committed separately, gates green by number each time  
- [ ] Pushed + `npm run verify:head` clean  
- [x] BACKLOG HOST-TAB-1 Notes → playtest owed or PASS (solo wording corrected)  
- [x] STATUS wave boundary update (not per lever)  
- [ ] Wyatt playtest checklist §10 on production  
- [ ] No claim “done” without remote HEAD proof  

---

## 13. Suggested commit messages (single-line)

```
HOST-TAB-1a: docs — prod host pump vs DEV ?perfPump; tabhidden exempt
HOST-TAB-1b: host frame pump while tab hidden (gated; dual-driver safe)
HOST-TAB-1c: AFK hostAway @10s promotes preferred excluding self
HOST-TAB-1d: mid-round hostPresent rebalance to strongest (margin 20)
HOST-TAB-1e: ignore stale inbound offers; session-gen after P2P awaits
```

---

## 14. Defaults locked (override only if you care)

These were open; they are now **locked** in §3. Change before ack if you disagree:

1. Countdown included — **yes**  
2. Toast copy — drafts in §5.5  
3. AFK threshold — **10s**  
4. `hostPresent` from any human — **yes** (server rate-limited)  
5. Migrate cooldown — **5s** (not 15s)  
6. Solo pump — **yes**; never pump + clock shift  

---

## 15. Ack line (copy when ready)

```
Ack HOST-TAB-1 plan docs/planning/host-tab-1.md — levers A–D, mid-round, 10s AFK,
exclude-self demotion, return strongest margin 20, migrate cooldown 5s, solo pump
without double clock shift, hostFramePump (not perfPump shim), separate server
away/present entrypoints. Execute after PERF clears main/loop.
```

Until that ack (and PERF sequencing), **no code**.

---

## 16. Lever E — second-migrate P2P freeze (FAIL 08-04)

**Status:** implemented locally — awaiting push / ship / §10 retest. Supersedes the chat plan
that claimed `initiateP2PConnection` never re-checks `has()` (it does, at `p2p.js:358`).

### Symptom (Wyatt)

First short hide + first AFK promote + solo PASS. Second mid-round migrate in the
same match freezes the non-host; host HUD shows the peer as disconnected; non-host
stays broken.

### Root cause (code-verified)

Host is always the offerer ([Game_Architecture.md](../reference/Game_Architecture.md)
§ P2P). Two missing guards let a **demoted** client plant a zombie on the **new** host:

1. **Demoted initiate still offers.** `initiateP2PConnection` checks `isHost` before
   `await waitForIceServers()` and never again (`p2p.js:352–373`). After migrate,
   `closeAllConnections` settles the ICE wait; the in-flight call resumes, skips the
   `has()` early-return (map was cleared), builds a PC, and sends `sdpOffer` even though
   `initP2P({ host: false })` already ran (or will have, before the microtask — either
   way there is no post-await `isHost` / generation gate before `signalingSend`).
2. **New host accepts that offer as answerer.** `handleSignalingMessageInner` creates a
   PC for inbound `sdpOffer` with **no `isHost` guard** (`p2p.js:386–396`). The later
   branch `sdpOffer && !isHost` correctly skips answering, but the zombie PC stays in
   the map. `ensureHostPeerConnections` → `initiateP2PConnection` hits `has()` and
   early-returns — **no host offer ever goes out.**

The zombie is planted by an **inbound stale offer on the new host**, not by the new
host’s own initiate re-inserting after `has()`.

**Open question (not blocking the lever):** `maintainHostPeerConnections` should
force-close + re-offer stuck `negotiating` peers after `p2pConnectingTimeoutMs`
(~10s). A pure WebRTC zombie ought to self-heal unless something else also drops the
PartyKit socket (Wyatt’s “disconnected” is WS/slot-level language). Capture on retest
with `?diag=1` if it still fails after this lever — do **not** expand scope pre-ack.

### What not to do

- **Do not** put replace-on-not-ok inside `initiateP2PConnection`.
  `ensureHostPeerConnections` runs on every `MSG.slots`; non-ok includes `negotiating`
  and `disconnected`, which `maintainHostPeerConnections` deliberately exempts (ICE
  grace + 10s stuck window + per-peer cooldown). Unconditional replace thrash-regresses
  tests at `p2p-signaling.test.js` (~449 grace, ~476 stuck-negotiation). Heal policy
  stays in the maintain loop only.

### Lever E changes (one commit)

**File:** `src/netcode/p2p.js` (+ `tests/p2p-signaling.test.js`)

1. **Host ignores inbound offers.** At the top of the offer-handling path (before PC
   create): if `msg.type === MSG.sdpOffer && isHost` → return. Illegitimate by design.
2. **Re-check `isHost` after every await** in `initiateP2PConnection` (after ICE wait;
   after `createOffer` / `setLocalDescription` before `signalingSend`).
3. **Session generation.** Counter bumped only in `closeAllConnections` (not in
   per-peer `cleanupPeer` / `forceClosePeer`). Capture gen before awaits; abort if
   changed — covers demoted-mid-offer and answerer mid-wait after tear-down.
4. **Answerer path:** same generation check after `waitForIceServers` before creating
   a PC; still only answers when `!isHost`.

### Asserts

| Test | Expect |
|------|--------|
| Demoted mid-await initiate | After `closeAll` + `initP2P({host:false})`, stale initiate emits **zero** offers and leaves **no** PC |
| Host receives `sdpOffer` | Creates **no** PC, sends **no** answer |
| `ensureHostPeerConnections` during in-flight negotiation | **Zero** new offers, closes nothing (existing ~449 / ~476 must still pass) |
| Generation bump | `closeAll` invalidates in-flight initiate and answerer wait |
| `npm run qa` | Green by number |

### Wave close-out (not optional)

- Push + `npm run verify:head`
- STATUS / BACKLOG update at wave end (one docs touch)
- `npm run briefing` / playtest console regen
- §10 step 4 above is the retest line (not chat-only)

### Ack line (Lever E)

```
Ack HOST-TAB-1 lever E — host ignores inbound sdpOffer; isHost + session-gen
guards after awaits in initiate/answerer; no replace-on-not-ok in initiate;
heal stays in maintain. Retest §10 incl. second migrate same match.
```

Until that ack: **no code**.
