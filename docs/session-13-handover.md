# Cart Rave — Session 13 Handover

Date: April 21, 2026
Days to deadline: ~10 days (May 1, 2026 @ 13:37 UTC)
Production: cartrave.lol — current and working

## Starting state

Session 13 opened with `docs/session-12-handover.md` on main. That doc covered:

- Gemini audit fixes (security, ghost carts, host migration) — all committed and pushed before this session started
- Step 9 (results screen) plan — implementation began mid-session-12, continued into session 13

All prior work was committed and pushed at the start of this session.

## Commits shipped this session (in order)

| SHA | Purpose |
|-----|---------|
| `b270200` | security: force `data.connId = conn.id` in clientInput relay; per-handler host guards on hostTransform / hostRound / hostEventFall |
| `8207f24` | ghost carts: prune `remoteInputsByConnId` and `remoteNitroLatchedByConnId` on `MSG.slots` receipt |
| `8b370d0` | host migration: `#lastSeq = -1` reset in `onClose` wasHost branch; `netStateBuffer = []` in `setAuthorityMode` becomingHost branch |
| `87813d6` | docs/deploy-urls.md with PartyKit canonical URL and verification guidance |
| `428163b` | Step 9 Diff 1: results overlay DOM and styles, hidden by default |
| `fc78080` | Step 9 Diff 2: gate host physics (substep loop, fall/respawn/NPC ram) and `host_transform` send on `roundPhase === "running"`; accumulator reset to 0 when paused |
| `5ce00c4` | Step 9 Diff 3: removed podium auto-restart `setTimeout`; added `roundPodiumTimeoutId` for Play Again cancellation |
| `59d4b62` | Step 9 Diff 4: `matchHistory` append on `MSG.round` podium transition (approach a, cap 10, comment annotation) |
| `bcb8fa4` | Step 9 micro: `startCountdown` resets `roundScores`, `roundWinnerSlotIndex`, `roundStartedAtMs` for countdown broadcast hygiene |
| `39550f5` | Step 9 Diff 5: `rematchResetWorld` helper + `onHostPlayAgainClick` (host authority, cancel timeout, reset world, post-reset `host_transform`, `startCountdown`) |
| `9e74833` | Step 9 Diff 6: show/hide wiring, `display: flex` on podium with `pointer-events: auto`, Vibe Jam portal URL (`https://vibej.am/portal/2026?ref=<encoded>`) |
| `e8e9768` | host migration bug fix attempt 1: `#ensureLiveHost` helper (insufficient alone; remains as belt-and-suspenders) |
| `d0096de` | revert of diagnostic log that crashed on `iterator.map().join()` in PartyKit runtime |
| `a52716a` | client keepalive every 5s regardless of phase |
| `0eca854` | server activity-based reaper (20s timeout, 5s throttle, `#lastSeenAtMs` Map, handoff via `#ensureLiveHost`) |

## The ghost host saga

A connection ID `900c7a39-c071-48f5-8c1f-7345ed9f20b8` held host state all day, surviving across multiple `npx partykit deploy` cycles. Clients would connect, see `isHost: false`, `hostId: "900c7a39..."`, and sit in lobby forever sending `client_input` into a void because the real host was a zombie.

### Diagnosis chain

1. **Initial assumption (wrong)**: stale `#hostId` in empty `#connections` after reconnect — fix: `#ensureLiveHost()` checks `!#connections.has(#hostId)` and repairs. Shipped in `e8e9768`. Didn't fire. No `ensureLiveHost: stale hostId=...` log ever appeared in tail.
2. **Second hypothesis (wrong)**: `#slots` / `#hostId` rehydrated from PartyKit storage on worker boot. Grep confirmed: no `storage.put` / `storage.get` / `onStart` / `onAlarm` / `hydrate` anywhere in `party/index.ts`. No storage layer exists.
3. **Third hypothesis (correct)**: PartyKit Durable Object instance was never cycled. Evidence: `#lastSeq` monotonically increased (906 → 907) across many reconnects over hours — a fresh DO would reset to 0. The DO held the ghost entry in `#connections` AND in `room.getConnections()`. Both liveness oracles falsely reported 900c7a39 alive.
4. **Attempted diagnostic to confirm**: crashed on `room.getConnections().map((c) => c.id).join(",")` — `getConnections()` returns an Iterator (Iterator Helpers proposal in modern V8/Cloudflare runtime), not an Array. `.map()` on an iterator returns another Iterator. Iterators don't have `.join()`. Deploy broke every incoming connection with `TypeError: rtIds.join is not a function`. Reverted in `d0096de`.
5. **Root cause**: either (a) a real browser tab on a shared playtester device Wyatt couldn't reach tonight, or (b) dead socket PartyKit runtime hadn't GC'd. Either way, platform-level liveness is insufficient.

### Fix shipped

Activity-based reaper (`a52716a` + `0eca854`):

- **Client keepalive** (`main.js`): `setInterval(send {type: "keepalive"}, 5000)` on socket open. Fires regardless of role or round phase. Addresses the case where the host's `host_transform` loop is gated on `roundPhase === "running"` and would go silent for 20+ seconds during podium.
- **Server reaper** (`party/index.ts`):
  - `#lastSeenAtMs: Map<string, number>` updated at top of `onMessage` before dispatch, and set in `onConnect` for new conns.
  - `#reapSilentConnections()`: iterates `#connections`, flags any entry with `age > 20_000` ms, removes, calls `#convertHumanSlotToNpc`, logs `reap: connId=... reason=silent age=... was_host=...`, delegates host handoff to `#ensureLiveHost()`.
  - Called in `onConnect` unconditionally (after new conn added, so new joiner is immune) and in `onMessage` throttled to once per 5s.
  - Missing `#lastSeenAtMs` entries treated as epoch → existing ghosts with no recorded activity get reaped on the first pass after deploy.

### Lesson

Platform-level connection liveness cannot be trusted. Apps running on PartyKit / Cloudflare Durable Objects need their own activity-based oracle with an explicit client heartbeat.

## Verification status

- **Prod string checks**: all client-side changes this session verified via `Select-String` on `https://www.cartrave.lol/main.js` with no-cache headers.
- **Prod behavior**: fresh tab becomes host, second tab joins as client, round runs, podium overlay shows with Play Again and Vibe Jam portal, match history populates.
- **Verification 4 (force-kill reaper) NOT done yet**: force-kill Chrome (Task Manager / End Task on chrome.exe), open a fresh tab in a new browser, confirm the new tab becomes host within ~20-25s via reap + `hostMigrated`. This is the real future-proofing test — validates that the reaper handles playtester devices that disappear uncleanly (phones sleeping, laptops closing, tabs crashing). Run this before trusting the reaper in a multi-device playtest.

## Known issues still outstanding

- **Force-kill reaper validation not yet run** (see Verification section).
- **Hyphen regex in `resolvedPartyRoomFromUrl()`** rejects valid-looking room names like `wyatt-debug-001`. Trivial 1-char fix (add `-` to character class). Deferred.
- **Host-refresh-after-second-window** issue from session 12 still deferred per prior direction.
- **Rapier deprecation warning** cosmetic, defer to cleanup.
- **Diagnostic log cleanup bucket** (pre-submission cleanup):
  - ~300 `step()` diagnostic logs
  - HARDCODED slots branch log
  - RAW message event log
  - `[round] phase=` logs (host + client)
  - `updateHud` local slot change log (`local slot:` via `updateHud._lastLocalIdx`)
- **Post-Play-Again UX note**: scores only visible during podium, zeroed when Play Again is clicked. Not fixed today. Post-jam polish.

## Critical session-level learnings for next agent

1. **PartyKit DO state persists across deploys.** Deploys do NOT reset `#hostId`, `#slots`, `#connections`, `#lastSeq`, or any other in-memory field. Trust the reaper to clear ghost state; do not expect deploys to do it. A DO only cycles on eviction (inactivity) or runtime crash.
2. **`room.getConnections()` returns an Iterator in this runtime, not an Array.** Do NOT call `.map().join()` or any array method that assumes Array type. Use `for...of` or spread explicitly (`[...room.getConnections()]`). A single bad `.join()` in a `console.log` template literal took down production for ~90 seconds this session.
3. **String checks on prod `main.js` confirm code shipped, not behavior.** For any diff that changes WHEN code runs or WHAT state flows where, Wyatt loads prod and confirms actual gameplay before moving on to the next diff.
4. **Post-push remote verification is mandatory.** Local grep produced false positives twice this session AND in session 12. Always `Select-String` against the deployed file, not the local tree.
5. **For `party/index.ts` changes, GitHub main does not match deployed edge.** Must run `npx partykit deploy` after commit and verify with `npx partykit tail` that the behavior is live. Commit + push alone is not sufficient.
6. **PowerShell env**: `Select-String`, not `grep`. Commit messages single-line with `-m "..."`, no heredoc.
7. **Diff-before-apply is a hard rule.** Show unified diff (`--- a/path`, `+++ b/path`, `@@` hunks, `-` / `+` prefixes), wait for ack, then apply. No exceptions — violated once in session 12, treated as a bug since.

## Next session focus

**Lobby + Color Picker (merged).** The two features overlap naturally — lobby is where players pick color and ready up, so building them separately would duplicate UI work.

Scope:
- Remove auto-start logic (game currently auto-starts on first connection).
- Build interactive lobby UI with host-only start button.
- Waiting state for non-hosts ("waiting for host to start").
- Color selection: 5 options including `neonOrange`, first-come-first-served, colors tied to slots, NPCs fill remainder.
- Consult `.cursorrules` execution order for the canonical plan before starting — it supersedes this doc if they disagree.
