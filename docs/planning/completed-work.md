# Cart Clash — Completed Work (Historical Record)

> Historical log. Past entries may still say "Cart Rave" / `next-level` — that is intentional. Living naming rules: [brand.md](../brand.md).

**Last Updated:** August 18, 2026

> **This doc = the past** — the single home for historical/completed items. For what works
> *today* see [project-state.md](./project-state.md); for forward plans see [ROADMAP.md](./ROADMAP.md).

Chronological record of shipped work, newest first.

> **Convention:** As items ship, move their completed writeup here (out of ROADMAP.md / project-state.md).

---

### August 18, 2026 — RD-COUNTER-1

- *(Engineering · Low)* **RD-COUNTER-1** — ✅ **DONE 08-18**. HUD `RD n` now
  increments once per distinct running `startedAtMs` (not `matchHistory.length`).
  Drops the `getMatchHistoryLength` thread through `hud.js` / `frameVisuals.js` /
  `loopDeps.js` / `gameBoot.js`. Host and guests stay in sync after an
  unvalidated podium. Mid-round join still reads low (same as today). Playtest
  owed: **RD-COUNTER-PT-1**.

### August 18, 2026 — SPECTATOR-ANNOUNCER-1

- *(Engineering · Low)* **SPECTATOR-ANNOUNCER-1** — ✅ **DONE 08-18**.
  `stopAnnouncer()` now runs once on every podium entry (inside the
  `lastPodiumCelebratedRound` gate, before the winner/draw split). In-flight
  "10 SECONDS" / `new_leader` no longer carry over the winner cam for
  spectators. Victory/defeat still fire after the stop. Playtest owed:
  **SPECTATOR-ANNOUNCER-PT-1**.

### August 18, 2026 — KEYUP-STUCK-1

- *(Engineering · Low)* **KEYUP-STUCK-1** — ✅ **DONE 08-18**. `onKeyUp` now
  clears `keys` / `localNitroHeld` before the INPUT guard; only `preventDefault`
  stays gated. A WASD or Shift release over the name / join-code / hue field no
  longer sticks the cart. Playtest owed: **KEYUP-STUCK-PT-1**.

### August 18, 2026 — playtest PASSes (CUSTOMIZE-SPAM / WARM-CLASSIC-JUICE)

- *(Playtest · Medium)* **CUSTOMIZE-SPAM-PT-1** — ✅ **PASS 08-18** on prod
  (VERIFY_OK `a41987e7`). Spam Customize open/close (10+ in about one minute)
  does not black the menu cart or the arena. DONE after a color change returns
  the 3D cart; no cartoon SVG flash. Parent **CUSTOMIZE-SPAM-1** closes with it.
  Do not reopen **ATTRACT-JANK-1** or **CUSTOMIZE-PERF-1**.
- *(Engineering · Medium)* **CUSTOMIZE-SPAM-1** — ✅ **DONE 08-17** (`a41987e7`)
  + ✅ **PASS 08-18**. Keep-alive pause/resume; one Customize context per menu
  session; generation token blocks stacked imports; `release()` on menu-exit.
- *(Playtest · Medium)* **WARM-CLASSIC-JUICE-PT-1** — ✅ **PASS 08-18** on
  `npm run dev` (HEAD `951ea15d`; pushed, not yet deployed). Friends join to
  CART RAVE on Intel UHD / Low: overlay keeps painting, CHECKOUT LINE appears
  without a ~10 s freeze; 3-2-1 stays even; Low has no lasers; billboard stays.
  Parent **WARM-CLASSIC-JUICE-1** closes with it.
- *(Engineering · Medium)* **WARM-CLASSIC-JUICE-1** — ✅ **DONE 08-18**
  (`951ea15d`) + ✅ **PASS 08-18**. Adopt warms the room arena (no flyover)
  under the overlay; consume `juiceFresh` so the post-cart warm uses the short
  budget; skip `initLasers` when `laserBudget === "off"`. Do not reopen
  **WARM-QP-ROTATE-1**. Distinct from **PERF-CLASSIC-IGPU-1** (sustained 30 fps)
  and **WARM-SOLO-1** (countdown first-draw).

### August 18, 2026 — WARM-QP-ROTATE-1 closed

- *(Engineering · Medium)* **WARM-QP-ROTATE-1** — ✅ **CLOSED 08-18** (no new code).
  Lever already shipped (`4e5ded3c`): play-entry adopts the room arena after hello,
  under the overlay, before carts. **WARM-QP-ROTATE-PT-1** Wyatt PASS 08-16 (first-room
  swap; canvas does not freeze). cap-364 is pre-fix. cap-371 confirms adopt
  (`play-arena-adopt` zanzibar→classicRecord, `rotation_skipped already_loaded`).
  Residual after adopt is **WARM-CLASSIC-JUICE-1** (Classic 451-material compile).
  A mid-session Quickplay rotate stall needs a new ID — do not reopen this card.

### August 17, 2026 — playtest PASSes (COUNTDOWN-HOST-STAMP / CUSTOMIZE-SVG-FLASH / FRIENDS-LOBBY-ORDER)

- *(Playtest · Medium)* **COUNTDOWN-HOST-STAMP-PT-1** — ✅ **PASS 08-17** on prod
  (VERIFY_OK `7896b9f4`). First non-host 3-2-1 stays even (~1 s each); 3 does not
  hang then slam 2+1; rematch in the same room stays even; host 3-2-1 unchanged.
  Parent **COUNTDOWN-HOST-STAMP-1** closes with it.
- *(Playtest · Medium)* **CUSTOMIZE-SVG-FLASH-PT-1** — ✅ **PASS 08-17** on prod
  (VERIFY_OK `7896b9f4`). DONE and apply do not flash the old cart drawing: no flat
  cartoon cart flashes on open or close; the 3D cart updates in place on color change.
  Parent **CUSTOMIZE-SVG-FLASH-1** closes with it.
- *(Playtest · Medium)* **FRIENDS-LOBBY-ORDER-PT-1** — ✅ **PASS 08-17** on prod
  (VERIFY_OK `7896b9f4`). Friends CHECKOUT LINE lists humans first, first-connect
  first (host above guest), bots under; human color and seat mark still match the
  cart. Parent **FRIENDS-LOBBY-ORDER-1** closes with it.

### August 17, 2026 — KO-CENTER-RING-PT-1 PASS

- *(Playtest · Medium)* **KO-CENTER-RING-PT-1** — ✅ **PASS 08-17** on prod (VERIFY_OK
  `7896b9f4`). Local KO shows only the red edge pulse; no centered expanding ring.
  Opponent KO still shows the center hitmarker. Parent **KO-CENTER-RING-1**
  (`c935eba9`) closes with it.

### August 17, 2026 — MIG-KO-DROP-1 landed

- *(Engineering · Low)* **MIG-KO-DROP-1** — ✅ **DONE 08-17**. `queueHostFallEvent`
  force-flushes the host snapshot on every queue (mid-round and podium). Mid-round
  falls no longer sit in `pendingHostFallEvents` for up to 25 ms, so a host drop
  in that window cannot eat the KO feed / shatter / announcer. Score was already
  safe via per-KO `sendHostRound`. Source reject of old-host in-flight snapshots
  stays. Not a reopen of **NET-PRES-1** (eid dedupe; loss-on-drop residual still
  accepted). No playtest row — unit tests are the proof.

### August 17, 2026 — SD-SPECTATOR-CHARGE-PT-1 PASS

- *(Playtest · Medium)* **SD-SPECTATOR-CHARGE-PT-1** — ✅ **PASS 08-17** on `npm run dev`
  (HEAD `57d2f0f9`; pushed, not yet deployed). Automated solo rig (headless Chromium,
  `?room=solo&diag=1&nettest=1&perfPump=1`) + Wyatt PASS. In Sudden Death with the local
  cart knocked out (fell off the Sundial rim mid-SD in a 3-way top tie), holding boost
  kept the HUD boost meter idle — `data-state` stayed `ready`, never `charging`/`charged` —
  across an 11-sample 2.6 s hold, with the spectator flag and spectator camera engaged
  throughout. Live-round regression: boost still charged (meter `charging`) and
  auto-released with a burst (speed 22.9 → 25.7 m/s) + cooldown. 0 error/assert diag
  events across the run. Parent **SD-SPECTATOR-CHARGE-1** closes with it.

### August 17, 2026 — SD-SPECTATOR-CHARGE-1 landed

- *(Engineering · Medium)* **SD-SPECTATOR-CHARGE-1** — ✅ **DONE 08-17**. `triggerRamBoost`
  returns when `cart.isSuddenDeathSpectator` is set. A parked Sudden Death spectator
  can no longer start a charge (keyboard / touch / gamepad / sim re-arm / remote-nitro
  latch). The sim still skips flagged carts, so release/cancel never run; this gate
  stops the phantom start that looped `chargeUp` until `endRound`. Mid-charge-on-fall
  was already stopped by `onCartOutOfPlay`. Playtest **SD-SPECTATOR-CHARGE-PT-1**
  PASS 08-17 (see above) — parent closes.

### August 17, 2026 — COUNTDOWN-QUICKPLAY-1 closed

- *(Engineering · Low)* **COUNTDOWN-QUICKPLAY-1** — ✅ **CLOSED 08-17** (no code change).
  Empty quickplay countdown connect-wait edge case resolved by **COUNTDOWN-ARM-1** (`e08e5f5` · 07-22):
  the play-ready gate (`isPlayReady` + `clientPlayReady`) structurally prevents countdown arming
  before client warm. Party DO test `"does not arm game_start on seat alone in continuous mode; arms after clientPlayReady"`
  covers the exact 1-human continuous-mode scenario. Original F8 captures (184–196) pre-date the fix.
  Not a reopen of COUNTDOWN-SYNC-1 / COUNTDOWN-HOST-STAMP-1.

### August 17, 2026 — KO-CENTER-RING-1 / CUSTOMIZE-SVG-FLASH-1 landed

- *(Engineering · Medium)* **KO-CENTER-RING-1** — ✅ **DONE 08-17**. Deleted the centered
  `.hud-doomed-shockwave` DOM node and CSS. `showDoomedFeedback` still fires the red
  edge pulse (`pulseHitDirection`). Hitmarker on a scored KO stays. Do not reopen
  **KO-DOOMED-1** / **KO-DOOMED-PT-1** (fan-out wiring) or **NET-PRES-1** (event dedupe).
  Playtest **KO-CENTER-RING-PT-1** PASS 08-17 — parent closes.
- *(Engineering · Medium)* **CUSTOMIZE-SVG-FLASH-1** — ✅ **DONE 08-17**.
  `renderCustomizePreview` returns without `makeCartSVG` unless Customize is actually
  open. Close persists first, then hides, then disposes so `customization-changed`
  cannot paint the legacy SVG during dismiss. Open-path follow-up (PT FAIL 08-17):
  holder stays empty while CartPreview loads; SVG only if load/init throws.
  Playtest owed: **CUSTOMIZE-SVG-FLASH-PT-1** retest after ship.

### August 17, 2026 — SHIP-1 BACKLOG row closed

- *(Tech Debt · Medium)* **SHIP-1** — ✅ **CLOSED 08-17 on Wyatt's word**. The BACKLOG pointer row is gone. [SHIP-1.md](./SHIP-1.md) stays as the finish-line doc. This is not a V2 ship. BRAND-1, RC gates, and owed playtests stay on their own rows. Docs-only close; no game code in this commit.

### August 17, 2026 — TRUST-1 / LEADERBOARD-1 cut from V2

- *(Tech Debt · Medium)* **TRUST-1** — ✅ **CLOSED 08-17 on Wyatt's word** (`[SHIP-1 D1]`). Never built. Worker still does not validate host-asserted outcomes. Cut from the V2 ship gate with **LEADERBOARD-1**. Host-authoritative Rapier stays. A later validation pass needs a new ID, not a reopen. Docs-only close; no game code in this commit.
- *(Engineering · Medium)* **LEADERBOARD-1** — ✅ **CLOSED 08-17 on Wyatt's word** (`[SHIP-1 D2]`). Never built. No persistent leaderboard or player-stats store. Session scores, podium, Challenges, and match history stay. A later board needs a new ID, not a reopen.

### August 17, 2026 — CART-HUE-CUBES-1 / CART-HUE-CUBES-PT-1

- *(Art · Low)* **CART-HUE-CUBES-1** — ✅ **DONE 08-17** (`9cd253e5`). Cubes filled faces
  no longer hop 90% toward other `CART_COLORS`. Custom red's nearest roster color was
  `neonOrange`, so two faces became yellow/green and the cart read orange. Faces now stay
  in the selected neon family (cooler hue + RGB-scaled shade). Art presentation only —
  cart material traverse stays frozen.
- *(Playtest · Low)* **CART-HUE-CUBES-PT-1** — ✅ **PASS 08-17** on prod (`9cd253e5`).
  Cubes on the custom hue far-red end stays in the red family, not orange. Parent
  **CART-HUE-CUBES-1** closes with it.

### August 17, 2026 — playtest PASSes (CART-HUE-RED / LAST-STANDING-DEAD / NPC-ABORT-BURST / REMOTE-INPUT-STALE / SPILL-RAM-CREDIT)

- *(Playtest · Medium)* **LAST-STANDING-DEAD-PT-1** — ✅ **PASS 08-17** on `npm run dev`
  (HEAD `30920e8a`; pushed, not yet deployed). SD podium is a normal pts / TIEBREAK win —
  no 3s slow-mo, no LAST CART STANDING verdict. Sole Survivor is gone from Challenges
  (Clutch Winner still there); bolt hint reads 5 Sudden Death wins and stays locked below 5.
  Parent **LAST-STANDING-DEAD-1** (`20fd80b3`) closes with it.
- *(Playtest · Medium)* **NPC-ABORT-BURST-PT-1** — ✅ **PASS 08-17** on `npm run dev`
  (HEAD `30920e8a`). An NPC that drops a charge at a hole does not burst into it; a
  close-range open-floor charge still rams; human tap-release / full-charge feel unchanged.
  Parent **NPC-ABORT-BURST-1** (`0e6c0c9e`) closes with it.
- *(Engineering · Medium)* **REMOTE-INPUT-STALE-1** — ✅ **DONE 08-17** (`d0022037`). Host
  drain stamps `lastAppliedMs` and zeros `{throttle,steer,nitro}` after
  `CONFIG.net.remoteInputStaleMs` (300) of apply-silence; latch kept so a held-boost return
  cannot double-charge from the drain edge.
- *(Playtest · Medium)* **REMOTE-INPUT-STALE-PT-1** — ✅ **PASS 08-17** on `npm run dev`
  (HEAD `30920e8a`). Hidden non-host coasts straight on the host after ~0.5s silence;
  restores drivable at once with no ghost drive; mid-charge hide yields at most one burst
  and no stuck charge SFX; host through the same window does not hitch. Parent
  **REMOTE-INPUT-STALE-1** closes with it.
- *(Design / Gameplay · Low)* **SPILL-RAM-CREDIT-1** — ✅ **DONE 08-17** (`76cbe304`). SPILL
  credit is a real spill (tip-over / massive-ram / void fall) attributed to the recent
  rammer via `lastHitBy` + `hitWindowMs`; rams on upright victims count for nothing.
- *(Playtest · Low)* **SPILL-RAM-CREDIT-PT-1** — ✅ **PASS 08-17** on `npm run dev`
  (HEAD `30920e8a`). Spill Master ticks +1 exactly on the spill, nothing on sustained
  upright rams or self-tip; solo NPC ram credits on the spill and the receipt
  SPILLS CAUSED matches. Parent **SPILL-RAM-CREDIT-1** closes with it.
- *(Art · Low)* **CART-HUE-RED-1** — ✅ **DONE 08-17** (`7dd3966d`). Red-end snap
  `0xff0000` → `0xff2233` (ACES + 0.72 body tint dropped blue on all three arenas; mask
  was healthy). Art presentation only — cart material traverse stays frozen.
- *(Playtest · Low)* **CART-HUE-RED-PT-1** — ✅ **PASS 08-17** on `npm run dev`
  (HEAD `30920e8a`). Custom hue far red reads red in-game on Sundial Station, The
  Storerooms, and Cart Rave, matching the menu swatch; the 14/15° seam reads red →
  orange as expected; pink preset and HUD "you" accent unchanged. Parent
  **CART-HUE-RED-1** closes with it.

### August 17, 2026 — HOWLER-UPGRADE-1: pooling + buses done; spatial deferred

- *(Audio · Low)* **HOWLER-UPGRADE-1** — ✅ **CLOSED 08-17 on Wyatt's word** (`[SHIP-1 E3]`). Howler is already `^2.2.4` (no bump). Explicit pools on all 16 SFX and SFX/VOICE/MUSIC buses (VOICE-BUS-1 playtested) already shipped. The leftover half was spatial playback. Wyatt deferred that half as taste-gated so the signed-off mix stays untouched this close to ship. Docs-only close; no audio code in this commit. A later spatial pass needs a new ID, not a reopen.

### August 16, 2026 — record CB-SEAM-1 (shipped 08-05)

- *(Engineering · Low)* **CB-SEAM-1** — ✅ **CLOSED 08-05** (`0a527d12`). Extended
  BUNDLE-1 Lever E's 12 deferred keys to the full netcode `callbacks` table:
  `GAME_CALLBACK_RENAMES` / `GAME_CALLBACK_COMPOSED_BRIDGE_KEYS` plus
  `tests/netcode/netcodeDeferredCallbacks.test.js` assert every literal key has a
  matching bridge function. Also stripped unused `getMenuVisible`. Residual:
  adapter-body wiring is not proven (open **CB-SEAM-2**). Never a BACKLOG row —
  recorded 08-16 so a grep of closed IDs does not miss it.

### August 16, 2026 — THOST-CEILING-PT-1 PASS; file COUNTDOWN-HOST-STAMP-1

- *(Playtest · Medium)* **THOST-CEILING-PT-1** — ✅ **PASS 08-16** on prod (HEAD
  `d0022037`, caps 367 / 368). Guest hitch does not stretch snapshot gaps:
  `snapGapMaxMs` 57 / 31, `snapGapsOver100` 0. Offset after GO ≈ −1.8 s is
  machine timeOrigin skew, not a hitch. Parent **THOST-CEILING-1** closes with
  it. First-countdown hang (cap-367 / 368 `3` at +10 ms, `2` at +2.9 s) is
  **COUNTDOWN-HOST-STAMP-1**, not this card.

### August 16, 2026 — playtest PASSes (GAMEPAD-FREEZE / ZOMBIE-HOST-PICK / WARM-QP-ROTATE)

- *(Playtest · Medium)* **GAMEPAD-FREEZE-PT-1** — ✅ **PASS 08-16** on prod (HEAD
  `fcdde64b`). Hidden-tab pad hold does not drive the host cart or fire a burst
  on return. Solo path also stays still. Parent **GAMEPAD-FREEZE-1** closes with it.
- *(Engineering · Medium)* **GAMEPAD-FREEZE-1** — ✅ **DONE 08-16** (`9935f10d`) +
  ✅ **PASS 08-16**. `resetHeldInput()` on `blur` + `visibilitychange→hidden`
  drops keys / nitro / pending hop / touch and the previously-frozen gamepad
  axis + boost. A boost still physically held on return is suppressed until
  release. **GAMEPAD-FREEZE-PT-1** Wyatt PASS 08-16.
- *(Playtest · Medium)* **ZOMBIE-HOST-PICK-PT-1** — ✅ **PASS 08-16** on prod
  (HEAD `fcdde64b`). Host-away still hands the live peer the room; guest becomes
  host and both carts keep moving. Parent **ZOMBIE-HOST-PICK-1** already closed.
- *(Playtest · Medium)* **WARM-QP-ROTATE-PT-1** — ✅ **PASS 08-16** on prod (HEAD
  `fcdde64b`). Non-host Quickplay overlay stays up through the first-room arena
  swap; canvas does not freeze. Parent **WARM-QP-ROTATE-1** stays open (cap-364
  stall). A later Friends-match countdown skip ("1" then GO) is not this card.

### August 16, 2026 — LAST-STANDING-DEAD-1: delete Last Cart Standing

- *(Engineering · Medium)* **LAST-STANDING-DEAD-1** — ✅ **DONE 08-16**. Wyatt delete call. Flourish / `LAST CART STANDING` verdict / Sole Survivor daily are gone. Sudden Death stays first-to-score (`endReason: "timer"`). Bolt pattern retargets to 5 Sudden Death wins (not 3 — that pair is redMirror / Clutch Winner). Server still accepts `endReason: "lastStanding"` from old tabs; non-max winner is now rejected; 0-0 lastStanding is a draw. `LAST_STANDING` event id stays inert. Playtest owed: **LAST-STANDING-DEAD-PT-1**. Not a reopen of NET-SD-1.

### August 16, 2026 — NPC-ABORT-BURST-1: cancel unsafe NPC charge-abort burst

- *(Engineering · Medium)* **NPC-ABORT-BURST-1** — ✅ **DONE 08-16**. Host NPC charge abort hard-cancels (`axis.boostCancel` → `cancelNpcBoostCharge`) unless the locked target is live on the floor and the cart-yaw runway is clear. Close-range abort on open floor still early-releases (NPC-BOOST-2). Not a reopen of STOREROOMS-NPC-SELFKO. Playtest owed: **NPC-ABORT-BURST-PT-1**.

### August 16, 2026 — ZOMBIE-HOST-PICK-1: skip platform-dead host successors

- *(Engineering · Medium)* **ZOMBIE-HOST-PICK-1** — ✅ **DONE 08-16**. `#handleHostAway` and `#ensureLiveHost` now pick from `#platformLiveConnIds()` instead of `#connections.keys()`. A platform-dead peer (gone from `getConnections()`, still in `#connections` until the 20 s reaper) cannot become host; a 2-human room with one platform-dead peer does not migrate to the corpse. Silent-open sockets still wait for the reaper. **ZOMBIE-HOST-PICK-PT-1** Wyatt PASS 08-16 (2pc host-away regression; DO tests prove the zombie case). Sibling **ZOMBIE-ROOM-RESET-1** untouched. Not a reopen of NET-MIG-3 / CONN-TRACK-LEAK-1.

### August 16, 2026 — playtest PASSes (INPUT-LOCK / SD)

- *(Playtest · High)* **INPUT-LOCK-PT-1** — ✅ **PASS 08-16** on prod (HEAD
  `fe6aa59f`). Host/solo cart stays still through 3-2-1. Boost does not charge
  or fire before GO. Parent **INPUT-LOCK-1** closes with it.
- *(Playtest · High)* **INPUT-LOCK-PT-2** — ✅ **PASS 08-16** on prod (HEAD
  `fe6aa59f`). Guest who released W on the podium stays still through the next
  3-2-1 and at GO. Parent **INPUT-LOCK-1** closes with it.
- *(Playtest · Medium)* **SD-SCORE-STALE-PT-1** — ✅ **PASS 08-16** on prod (HEAD
  `fe6aa59f`). Guest SD-win verdict shows the winner's full score with no
  `(TIEBREAK)` suffix. finalScores + matchHistory + totalPoints include the
  winning point. Parent **SD-SCORE-STALE-1** closes with it.
- *(Playtest · High)* **SD-WIN-CREDIT-PT-1** — ✅ **PASS 08-16** on prod (HEAD
  `fe6aa59f`). Guest Sudden Death win credits Clutch Winner on the guest
  machine. Parent **SD-WIN-CREDIT-1** closes with it.

### August 16, 2026 — THOST-CEILING-1: host-clock tHost window

- *(Engineering · Medium)* **THOST-CEILING-1** — ✅ **DONE 08-16**. `isPlausibleTHost` now accepts stamps within 60 s of local round-clock now and rejects `1e300` / toy `1000`. Dropped the `1e12` abs cap (Sep 2001) that rejected every 2026 epoch `tHost`, and dropped the sticky 5 s `lastAcceptedTHost` jump. Live snapshots sample `updateHostClockOffset` again. **THOST-CEILING-PT-1** Wyatt PASS 08-16 (caps 367 / 368). Not a reopen of Run 7 / NET-PRES-1 / DEEPSEC-1.

### August 16, 2026 — SD-WIN-CREDIT-1: guest Sudden Death win credit

- *(Engineering · High)* **SD-WIN-CREDIT-1** — ✅ **DONE 08-16** (`6e8085a1`) + ✅ **PASS 08-16**. Non-hosts now latch their mirrored `isSuddenDeath` on first podium entry (`beginPodiumPresentation`), before the `MSG.round` payload applies its `false` — guest SD wins credit `SUDDEN_DEATH_WIN` (Clutch Winner daily `sd_win_3` + redMirror unlock) exactly like the host. Host/solo path untouched; no protocol or `party/` change — the already-relayed flag's pre-clear value is captured, and the apply ordering it depends on is pinned by `tests/orchestration/sdWinCredit.test.js`. Stalemate-timer SD wins now credit on guests too (host parity, intended). **SD-WIN-CREDIT-PT-1** Wyatt PASS 08-16. Not a reopen of NET-SD-1.

### August 16, 2026 — INPUT-LOCK-1: pre-GO input lock

- *(Engineering · High)* **INPUT-LOCK-1** — ✅ **DONE 08-16** (`73289a96` · `a91ab2cf`) + ✅ **PASS 08-16**. Countdown/lobby/podium now zero local `boostHeld`, skip remote and NPC apply, and silent-cancel a leaked local charge. Host remotes clear at `startCountdown` and `startRunningAt`. Drain drops leftover nitro/hop outside `running`. **INPUT-LOCK-PT-1** · **INPUT-LOCK-PT-2** Wyatt PASS 08-16. Not a reopen of COUNTDOWN-QUICKPLAY-1 / COUNTDOWN-LEAK-1.

### August 16, 2026 — SD-SCORE-STALE-1: SD podium score + stats

- *(Engineering · Medium)* **SD-SCORE-STALE-1** — ✅ **DONE 08-16** (`f9e8e42c` · `630234f7`) + ✅ **PASS 08-16**. `addScore` commits the SD-winning point before the win callback so podium `host_round` carries the final score. Announcer leader/comeback lines skip Sudden Death. **SD-SCORE-STALE-PT-1** Wyatt PASS 08-16. Not a reopen of NET-SD-1.

### August 16, 2026 — PATTERNS-FOIL-1: foil on earned patterns

- *(Playtest · High)* **PATTERNS-FOIL-PT-1** — ✅ **PASS 08-16** on prod (Worker
  `1cdbcdb9`, `c4f46bc`). Chip says Cubes. Maze, Waves, Bolt, and Cubes show a
  sliding sheen. Classic, Stripes, and Checker stay matte. Honeycomb and Diamond
  interiors stay neon. Solo KO keeps foil. Parent **PATTERNS-FOIL-1** closes
  with it.
- *(Art · High)* **PATTERNS-FOIL-1** — ✅ **DONE 08-16** (`6eed859e` · `b1a8a63b`
  · `a870e027` · `5a553bcb` · `c4f46bc8`) + ✅ **PASS 08-16**. One-order human
  foil on earned patterns. Whole CartFrame tint. Per-face groove axes. Honeycomb
  interiors stay lit. Classic / Stripes / Checker stay matte.

### August 16, 2026 — playtest PASSes (6 cards)

- *(Playtest · Medium)* **MENU-CMD-SKEW-PT-1** — ✅ **PASS 08-16** on prod. SOLO through
  SETTINGS letters stand upright. The yellow selected bar may stay a slight slant. Parent
  **MENU-CMD-SKEW-1** (`19437ed`) closes with it.
- *(Playtest · Low)* **NAME-NPC-VARIETY-PT-1** — ✅ **PASS 08-16** on prod (Worker
  `b82ca48f-4a64-4b43-a87d-c0ff055da569`). Expanded NPC names fit the roster. Parent
  **NAME-VARIETY-1** already closed.
- *(Playtest · Low)* **NAME-PLAYER-VARIETY-PT-1** — ✅ **PASS 08-16** on prod (Worker
  `b82ca48f-4a64-4b43-a87d-c0ff055da569`). Player defaults and rerolls feel varied. Parent
  **NAME-VARIETY-1** already closed.
- *(Playtest · Medium)* **PATTERNS-UI-5-PT-1** — ✅ **PASS 08-16** on prod (Worker
  `ae965403-9279-4776-9b4e-55f4955b7259`). Prismatic Cubes is distinct from Honeycomb.
  Diamond Weave is unchanged. Parent **PATTERNS-UI-5** closes with it.
- *(Playtest · Medium)* **STOREROOMS-NPC-SELFKO-PT-1** — ✅ **PASS 08-16** on prod (Worker
  `cc79e3b7`, `524b96a`). Storerooms NPCs peel off vortex rings and still hunt the gutters.
- *(Playtest · Medium)* **STOREROOMS-NPC-SELFKO-PT-2** — ✅ **PASS 08-16** on prod (Worker
  `cc79e3b7`, `524b96a`). Storerooms NPCs stay off the outer pit with no ram. Parent
  **STOREROOMS-NPC-SELFKO-2** (`d680928` · `928df0d`) closes with both PTs.

### August 16, 2026 — MENU-CMD-SKEW-1: menu labels stay upright

- *(UI · Medium)* **MENU-CMD-SKEW-1** — ✅ **DONE 08-15** (`19437ed`) + ✅ **PASS 08-16**.
  Menu entrance wrote `translateY` / `scale` on `.cr-cmd` and wiped `skewX(-8deg)`. Leftover
  label `skewX(8deg)` leaned SOLO–SETTINGS left. Entrance is now `fadeIn` only.

### August 16, 2026 — STOREROOMS-NPC-SELFKO-2: vortex + outer-pit self-KO

- *(Design / Gameplay · Medium)* **STOREROOMS-NPC-SELFKO-2** — ✅ **DONE 08-15**
  (`d680928` · `928df0d`) + ✅ **PASS 08-16** on prod (Worker `cc79e3b7`). Residual after
  AI-ARENA-SELFKO-1. L1 raises vortex keep-out past suction and adds TTE panic. L2 keeps NPC
  targets off the outer chamfer and adds TTE rim steer. PT-1 vortex + PT-2 outer pit both PASS.

### August 15, 2026 — NAME-VARIETY-1: expanded NPC and player names

- *(Design / Gameplay · Medium)* **NAME-VARIETY-1** — ✅ **CODE LANDED 08-15.** The canonical
  NPC pool grows from 60 to 70 names: 10 additions are mapped across all four personalities,
  weighted toward the smaller lurker and scavenger buckets. The first-run player pool is now
  exactly 50 names after Wyatt extended the approved 10 additions with `CartCaptain`. The reroll
  generator adds five retail-brawl prefixes and five suffixes, growing from 210 to 380 unique
  combinations. NPC and player pools remain disjoint; KO-friendly tone and existing selection
  behavior are unchanged. Focused checks: 8/8. QA: 7/7, 191 files / 2,117 tests. Deployed Worker
  `b82ca48f-4a64-4b43-a87d-c0ff055da569`; live asset poll passed with 28/28 references.
  **NAME-NPC-VARIETY-PT-1** and **NAME-PLAYER-VARIETY-PT-1** Wyatt PASS 08-16.

### August 15, 2026 — PATTERNS-UI-5: prismatic Isometric Cubes

- *(Art / UI · Medium)* **PATTERNS-UI-5** — ✅ **DEPLOYED 08-15.** `PATTERNS-UI-4-PT-1`
  confirmed the remaining read problem: Maze, Honeycomb, and Diamond Weave were good, but Cubes
  still read as Honeycomb. Cubes now repeats at 1.75, with seven compact repeats across one UV
  width. Each cube has three tinted rhombus faces, RGB-owned edges, and one static top-face glint.
  Diamond, Honeycomb, Maze, pattern IDs, goals, NPC rolls, UV1, material count, and network data
  are unchanged. Local rendered Pink / Blue review passed. Focused checks: 9/9. QA 7/7 (191 files /
  2,117 tests). Deployed Worker `ae965403-9279-4776-9b4e-55f4955b7259`; public HTML assets,
  dynamic chunks, and both Cube markers verified. **PATTERNS-UI-5-PT-1** Wyatt PASS 08-16.

### August 15, 2026 — PATTERNS-UI-4: medium scale for Maze, Honeycomb, and Cubes

- *(Art / UI · Medium)* **PATTERNS-UI-4** — ✅ **DEPLOYED 08-15.** `PATTERNS-UI-3-PT-1`
  confirmed the scale regression: Diamond Weave was right at repeat 1.25, while Maze, Honeycomb,
  and Isometric Cubes were too large at repeat 1. Those three now use repeat 1.5 (six cells across
  one UV width); Diamond, tile geometry, accents, seam periods, unlocks, NPC rolls, UV1, and
  network data are unchanged. Local rendered Pink / Blue review passed. QA 7/7 (190 files / 2,114
  tests). Deployed Worker `d3164390-409f-4981-887f-992abd12be58`; production asset verification
  passed. **PATTERNS-UI-4-PT-1 FAIL 08-15:** Maze, Honeycomb, and Diamond passed, but Cubes still
  read like Honeycomb. Superseded by **PATTERNS-UI-5**.

### August 15, 2026 — PATTERNS-UI-3: readable Maze and seamless multicolor tiles

- *(Art / UI · Medium)* **PATTERNS-UI-3** — ✅ **CODE READY 08-15.** Wyatt's production screenshots
  made the root cause measurable: Maze showed 12 cells per UV width; Honeycomb / Diamond / Cubes
  used 24–30px periods that did not divide the 128px texture; Cubes also overlaid RGB strokes on a
  square grid. The replacement uses 32/64px seam-safe periods, four large Maze turns, and a
  staggered cube lattice with one colour per edge direction. `uv1`, unlocks, save IDs, NPC rolls,
  network data, and the one-material shader path are unchanged. Build + local Pink/Blue rendered
  review passed; QA 7/7 (190 files / 2,114 tests). Deployed Worker
  `3f4b71bc-78f6-4add-8f05-4d2db7675755`; production asset verification passed.
  **PATTERNS-UI-3-PT-1 FAIL 08-15:** Diamond was right, but Maze, Honeycomb, and Cubes were too
  large. Superseded by **PATTERNS-UI-4**.

### August 15, 2026 — PATTERNS-UI-2: nine cart patterns, save-safe Maze, and multicolor linework

- *(Art / UI · Medium)* **PATTERNS-UI-2** — ✅ **CODE LANDED 08-15.** The pattern shelf now has
  Classic / Stripes / Checker free; Maze preserves the historical `dots` persistence ID; Waves and
  Bolt retain their goals; Honeycomb needs 10 KOs, Diamond Weave 15 NPC KOs, and Isometric Cubes
  50 KOs. The final three use selected-color-led accents from `CART_COLORS` through the existing
  one-material shader path; cart material traverse and net protocol stay unchanged. NPC selection
  is name-seeded and peer-stable: 3× Classic plus each decorated pattern once. QA: 7/7, 190 files /
  2,112 tests. Local rendered checks covered all nine, actual locks, Pink/Blue multicolor, and the
  phone grid. Deployed Worker `50e663ec`; **PATTERNS-UI-2-PT-1 FAIL 08-15** — Maze was too dense,
  multicolor tiles broke at their repeat edges, and Cubes read as scribble. Superseded by
  **PATTERNS-UI-3**.

### August 15, 2026 — BOOST-SFX-NONHOST-1: host convert plays the boost whoosh

- *(Audio · Low)* **BOOST-SFX-NONHOST-1** — ✅ **DONE 08-15** (`93ec6fa`) + ✅ **PASS 08-15**
  on prod (Worker `5d72f4a1`). Non-host `applySnapshotToCartBody` fires existing
  `onRemoteBoostStart` once when a rising-edge host `snap.b` converts a live charge.
  Keep-alive snaps and an already-released charge stay silent. Charge-cancel +
  window latch unchanged. Whoosh volume is 0.45 (remote path).
- *(Playtest · Audio)* **BOOST-SFX-NONHOST-PT-1** — ✅ **PASS 08-15 on prod**
  (deployed `93ec6fa` / Worker `5d72f4a1`). Non-host boost whoosh plays when the
  host confirms the fire. Parent **BOOST-SFX-NONHOST-1** closes with it.

### August 15, 2026 — CONN-TOASTS-1: friends join/leave toasts + PT-1 PASS

- *(Feature · Medium)* **CONN-TOASTS-1** — ✅ **DONE 08-15** (3 commits) + ✅ **PASS 08-15**
  on prod (Worker `be519fa4`). Green **"X joined"** / red **"X left"** toasts in the friends
  lobby and mid-match, host and non-host alike.
  - Client policy (`adff7b7` + `b1b448f`): `diffHumanSlots` (human `connId` membership diff over
    `MSG.slots`) + `filterConnectionEvents` (self-skip, single-broadcast same-name coalesce for
    ghost-exorcism swaps, 5s opposite-kind blip cooldown per name, LRU-capped) — pure + unit-tested
    (16 tests). Friends-only gate + hello-received gate (pre-hello broadcasts can't burst toasts on
    a fresh joiner). Solo untouched by construction (never opens a socket).
  - Server lever (`adff7b7`): the silent-reap pass now broadcasts the slot conversion it already
    performed (`reapedIds.length > 0`) — previously a dropped-tab player stayed a ghost human
    with no leave signal until an unrelated broadcast. party-do test via `setPlatformLiveIdsOverride`.
  - One shared surface: `window.CartRave.showConnectionToast` → `#cr-conn-toasts` stack
    (cap 3 visible + FIFO pending, bottom-centre lift + 56px above the single-slot toast,
    z 26500, portal-green/alert-red, results-overlay + reduced-motion rules).
  - **PT-1 PASS 08-15 on prod:** join/leave toasts in lobby + mid-match; reap drop-out toast;
    reconnect blip ≤1 toast; host-drop migration toast + red "Host left"; stack clear of
    ready button / hint row; solo silent.

### August 15, 2026 — playtest PASSes (4 cards)

- *(Playtest · Medium)* **DEEPSEC-1-PT-1** — ✅ **PASS 08-15** on prod. Stolen `_pk` /
  `hostScore` does not take host. Quickplay `?diag=1` URL rewrite does not unlock scores.
  Friends host `setScores` still works. Parent **DEEPSEC-1** (Worker `a1d270b5`). Token
  rotate stays on **DEEPSEC-2**.
- *(Playtest · Medium)* **CARGO-BAY-INSTANCE-PT-3** — ✅ **PASS 08-15** on prod. Other
  players see the same cargo fill, not an empty bay.
- *(Playtest · Medium)* **CONN-TRACK-LEAK-PT-1** — ✅ **PASS 08-15** on prod. Host tab
  close hands the Friends room to the survivor. Parent **CONN-TRACK-LEAK-1** (`9439cd2`).
- *(Playtest · Low)* **QP-ROTATE-PT-1** — ✅ **PASS 08-15** on prod. Quickplay rematch
  advances the next unlocked catalog entry on both clients. Parent **QP-ORDER-1**.
- Residual (new card, do not reopen **NET-2** or **WARM-IGPU-1**): **WARM-QP-ROTATE-1** —
  Intel non-host Quickplay first rotation stalled 11.4s (cap-364). **SHARD-PT-2** stays
  launch day (SKIP 08-15, not a fail).

### August 15, 2026 — EFFECTS-SPLIT-1: src/effects.js split into domain modules

- *(Structure · Tech Debt)* **EFFECTS-SPLIT-1** — ✅ **DONE 08-15** (6 levers, one commit each).
  The 3,484-line `src/effects.js` (140 KB) became a ~200-line composition root + public barrel;
  all implementation moved to domain modules under `src/effects/`:
  - `meshHelpers.js` — `disposeObject3D` + disposable map slots
  - `ambientParticles.js` — ambient dust + trash debris (shared `currentEffectStyle` kept them together)
  - `ramBoostStreaks.js` — nitro afterimage streak pool + shader + program warmup
  - `crowd.js` — instanced crowd layers, stadium, searchlights, glow; exports the state live bindings
    (`crowdLayers` / `crowdCarts` / `crowdGlow` / `stadiumGroup` / searchlight + point-light entries) and
    `applyCrowdBudget` that the composition root reads
  - `stage.js` / `lasers.js` / `billboard.js` — arena dressing; `stageGroup` / `laserEntries` /
    `billboardGroup` / `billboardLightEntries` are exported live bindings; `lasers.js` imports
    `stageGroup` from `stage.js` (beams anchor to the stage)
  - `effects.js` keeps `initEffects` (composition: streak pool → trash pool → ambient style, order
    load-bearing), `setRaveExtrasVisible` / `applyRaveExtrasQuality` (cross-module dressing
    visibility/quality — kept in one place to preserve the PERF-PASS-1 ablation wiring guard), and
    explicit re-exports of the exact 20-function public API (no `export *`, knip clean).
  - `sceneRef` split per module (each captures its own at init) — no shared mutable state.
  - Source-anchored tests re-pointed: `effectsDispose` → `meshHelpers.js`, `crowdInstanceRange` +
    `cladRepeat` → `crowd.js`, `sceneAblationWiring` end-marker → `initEffects`.
  - Verifed: typecheck clean, 2070/2070 tests, knip clean, bundle budget 0 B delta (all new modules
    stay deferred — membership unchanged), build green, arena render smoke (drawCalls 7547,
    programs 52, no page errors). `docs/bundle-budget.json` regenerated via `size:update`.

### August 15, 2026 — GAMEPAD-FRIENDS-SEATED-1 + PT-1 PASS

- *(Engineering · Low)* **GAMEPAD-FRIENDS-SEATED-1** — seated Friends lobby pad nav. Lever 1
  (`6ed010e`): a shown `.hud-lobby` is the nav scope (mute stays out; first Down seeds).
  Lever 2 (`747e67d`): `setGamepadNavActive` no-ops when already on, so the lobby
  `onFrame` loop cannot reset hold every tick. Deployed Worker `ef2a7550`.
- *(Playtest · Low)* **GAMEPAD-FRIENDS-SEATED-PT-1** — ✅ **PASS 08-15** on prod after lever 2.
  Each pad press moves one lobby control. Do not reopen GAMEPAD-LOBBY-1.

### August 14, 2026 — STORE-PILE-2: cart-extent pad + this-frame drive-strip

- *(Engineering · Medium)* **STORE-PILE-2** — desk work complete 08-14. STORE-PILE-1's
  0.9 m origin pad ended at 4.3 m; a nose-on cart origin sits at ~4.45 m, so bounce
  returned null on the FAIL case. Depth now uses hull surface vs cart `hz + 0.3` press.
  Apply strips only this frame's inward drive increment (boostedAccel × dt), plus the
  17 m/s² walk-out, capped at 4 m/s so a ram cannot throw into a corner void. Sundial
  podium stays off (`wall` flag). Tests: 15/15 bounce + 12/12 furniture wedge.
  Probe (`tmp/pileprobe.mjs`, 2×45 s): 0 wedged, 0 stuck, longest 0.2 s.
  Deployed Worker `2ce6e459-b28d-4e0b-b431-31bf781a2daa`; live `gameBoot-BoLl-eD6.js`
  carries `resolveWallKeepOutDeltaV`. **STORE-PILE-PT-1** Wyatt PASS 08-14.

### August 14, 2026 — STORE-PILE-PT-1 PASS

- *(Playtest · Medium)* **STORE-PILE-PT-1** — ✅ **PASS 08-14** on prod after STORE-PILE-2
  (`f92f918`, Worker `2ce6e459`). NPC contacts on the Storerooms pile are brief; bots
  route around.

### August 14, 2026 — playtest PASSes (5 cards)

- *(Playtest)* **GAMEPAD-DIRECT-ENTRY-PT-1** — ✅ **PASS 08-14.** Pencil + room-code dialogs open and work with controller grid and physical keyboard. Residual (new card, do not reopen this id): **GAMEPAD-FRIENDS-SEATED-1** — controller is glitchy after seating in the Friends lobby.
- *(Playtest)* **GAMEPAD-MENU-ROUTES-PT-1** — ✅ **PASS 08-14.** Pause menu is fully controllable with a controller.
- *(Playtest)* **MOBILE-SCOREBOARD-PT-1** — ✅ **PASS 08-14.** Every mobile scoreboard chip keeps name or identifier, symbol or icon, and score.
- *(Playtest)* **PAUSE-CHARGE-SFX-PT-1** — ✅ **PASS 08-14.** Pause stops charge-up audio; resume needs a fresh boost press.
- *(Playtest)* **SUNGLASSES-OBSIDIAN-PT-1** — ✅ **PASS 08-14.** Obsidian reads as dark black glass, distinct from Silver.

### August 14, 2026 — DEEPSEC-1: DeepSec real issues + bugs (3 levers)

- *(Engineering · High)* **DEEPSEC-1** — one card, three commits. Token rotate is **DEEPSEC-2**
  (parked; Wyatt later).
- Lever 1 (`736beda`): refuse a live `?_pk=` overwrite; host/signaling gates require the
  tracked socket object; join/`hostPresent` cannot steal via `hostScore`; `hostAway` promotes
  oldest remaining; `levelId` allowlist; `winnerSlotIndex`/`hostHideCompMs` guards.
- Lever 2 (`191a3cf`): latch `connectedRoom` for SEC-DIAG-1; integer `slotId`; `tHost` jump
  bound; ICE queue cap 64; `Object.hasOwn` on level ids.
- Lever 3 (`95ab825`): DO admin gate on public `/parties/<log>/…` tails; valid analytics JSON
  clamp; duration/`kos` caps; CF-only geo; invite `kale7` → `KALE7`; drop raw
  `__cartRaveSendErrorLog`.
- Playtest owed: **DEEPSEC-1-PT-1** `[2pc]`. Residuals: **DEEPSEC-2**.
- Deployed Worker `a1d270b5-5db3-4a20-8b59-237d6ca79624` (HEAD `9db3b17`). Live entry `index-CivyipM6.js`. `connectedRoom` confirmed in `netcode-hA18E3fv.js`.

### August 14, 2026 — UI-INPUT-LIFECYCLE-1: text entry + pause input regression audit

- *(UI / Input · Low)* **UI-INPUT-LIFECYCLE-1** — root-cause audit and desk work complete.
  The controller text dialog was mounted inside hidden `#cr-customize-screen`; the dialog became
  its own active navigation scope while its ancestor kept it invisible. It now mounts at the page
  root, keeps one draft when switching between controller and physical/Steam keyboard input, and
  returns focus to the pencil or room-code field on confirm or cancel.
- Solo pause previously skipped the game-loop frame that enabled menu navigation and suppressed
  gameplay input. Pause now changes both owners synchronously, cancels frozen charge state by mode,
  blocks keyboard/gamepad/touch boost while UI owns input, and requires a fresh boost press after
  resume. Focused tests: 85/85; typecheck passed; local browser confirmed the production DOM mount,
  pause RESUME focus, and pause-scoped navigation. Deployed in Worker version
  `70bf742a-0b6c-4214-be27-4697d950fbcc`. Wyatt PASS 08-14:
  **GAMEPAD-DIRECT-ENTRY-PT-1** · **GAMEPAD-MENU-ROUTES-PT-1** · **PAUSE-CHARGE-SFX-PT-1**.
- **GAMEPAD-TEXT-ENTRY-PT-1** is retired as superseded by the direct pencil/room-code retest; it
  did not receive a PASS.

### August 14, 2026 — GAMEPAD-DIRECT-ENTRY-1: direct controller text entry

- *(UI · Low)* **GAMEPAD-DIRECT-ENTRY-1** — replaces the duplicate lower-left controller
  buttons with the visible cart-name pencil and ROOM CODE field. Controller A opens a dialog with
  a real focused input for Steam or a physical keyboard, plus the controller key grid. B closes
  the dialog and returns focus to its source control. Mouse, keyboard, and touch keep their
  normal routes. Tests: focused 49/49. Deployed 08-14 as Worker version
  `87c1b9c7-753f-41e5-b85d-e3c5b82258f6`. **Wyatt production playtest owed** in BACKLOG as
  **GAMEPAD-DIRECT-ENTRY-PT-1**.

### August 14, 2026 — GAMEPAD-TEXT-ENTRY-1: controller text entry

- *(UI · Low)* **GAMEPAD-TEXT-ENTRY-1** — desk work complete 08-14; **Wyatt production
  playtest owed** in BACKLOG. Website controller users now reach a PROFILE / FRIENDS panel
  through LB/RB and use an in-game keyboard for cart names and Friend Codes: D-pad + A type,
  X deletes, Y clears, B cancels, and START confirms. Name storage and Friend Code validation /
  join stay in their existing owners; rejected codes keep the overlay open. Native browser inputs
  remain keyboard/mouse-only, and phone/tablet touch behavior is unchanged. Tests: focused 59/59;
  production build passed. Not deployed or committed.

### August 14, 2026 — GAMEPAD-MENU-ROUTES-1: controller menu routes

- *(UI · Low)* **GAMEPAD-MENU-ROUTES-1** — desk work complete 08-14; **Wyatt production
  playtest owed** in BACKLOG. Desktop and controller handheld main menus now use authored
  COMMANDS / MATCH SETUP controller panels: LB/RB changes panel, D-pad works inside it, and
  the retired global bumper shortcut no longer changes arena by itself. The pause overlay keeps
  its existing RESUME default focus and now paints the controller focus ring immediately. Phone
  and tablet touch behavior is unchanged. Native controller text entry is intentionally deferred
  to **GAMEPAD-TEXT-ENTRY-1**. Tests: focused 46/46; QA 183 files / 2,009 tests passed outside
  the sandbox (Wrangler needs its normal user-profile log path). Not deployed or committed.

### August 14, 2026 — ORGANIZE-1: codebase organization pass (3 levers)

- *(Structure · Tech Debt)* **ORGANIZE-1** — ✅ **DONE 08-14** (codebase organization pass across 3 levers):
  - **Lever A:** Moved `src/gameSession.js` → `src/orchestration/gameSession.js` and `src/visuals.js` → `src/effects/visuals.js`. Updated all internal & external call sites (`main.js`, `gameBoot.js`, `entities.js`, `chunkDeferImportEdges.test.js`, `netcode.test.js`, `netcodeDeferredCallbacks.test.js`, `control-flow.md`), `archMap.mjs`, and `bundle-budget.json`.
  - **Lever B:** Consolidated the 7 `carts-and-customization` files into new directory `src/carts/` (`cart.js`, `cartPatternConfig.js`, `cartPatterns.js`, `cartRaveGltf.js`, `cartThemeConfig.js`, `cartThemes.js`, `customization.js`). Updated all 18 external consumers across `src/`, 8 spec files in `tests/`, `tools/lib/archMap.mjs` system ownership and IMPORTANT_FILES, and `docs/bundle-budget.json`.
  - **Lever C:** Reorganized all ~160 root test files in `tests/` into subdirectories matching `src/` domains (`tests/orchestration/`, `tests/physics/`, `tests/netcode/`, `tests/effects/`, `tests/levels/`, `tests/scoring/`, `tests/carts/`, `tests/ui/`, `tests/stores/`, `tests/audio/`, `tests/tools/`, `tests/analytics/`, `tests/input/`, `tests/netcode-server/`, `tests/directives/`, `tests/diagnostics/`, `tests/misc/`). Updated all relative import, dynamic import, `readFileSync`, and `vi.mock` paths. Python harnesses remain at `tests/` root.
  - Deferred large split of `src/effects.js` to dedicated card **EFFECTS-SPLIT-1** with full pre-planned extraction design in Appendix A of the ORGANIZE-1 plan.
  - All 183 spec files / 2,007 tests passing, knip clean, arch fresh, health check clean, bundle budget green (0 B delta).

### August 14, 2026 — BACKLOG-HYGIENE-3: stale audit + card rehome

- *(Playtest · Perf)* **PERF-9CELL-1** — ✅ **CLOSED MOOT 08-14** (row delete only). Declared
  moot with parent **PERF-PASS-1** on 08-06 ([completed-work entry](#august-6-2026--perf-pass-1-low-end-perf-program-closed--bar-not-met-deliberate-close));
  the Playtest-owed row never left. Protocol stays in
  [perf-pass-1-handover.md](./perf-pass-1-handover.md). Do not reopen without new evidence.
- *(Backlog hygiene)* **BACKLOG-HYGIENE-3** — ✅ **DONE 08-14** (docs pass). Stripped ~90 lines of
  closed-PASS archaeology from `## Playtest owed`; deleted empty `## UI / UX`; moved
  **AQ-RING-CLEAR-1** → Engineering (reserve lever, not a human check); moved **QP-ROTATE-PT-1**
  → Playtest owed with seeded steps; refreshed Work-order Blocks 1–7 for post-08-13 state;
  fixed Art table blank row. Glance box regenerated via `npm run backlog`.
- *(Status hygiene)* **STATUS-TRIM** — ✅ **DONE 08-14** (docs pass). Archived 08-13 session log +
  closed Current-focus ship archaeology (~4.2k → ~2.7k tokens). Dropped CLOSED-PARTIAL
  **BUNDLE-1** from Active queue (it was still feeding BRIEFING's self-directed queue via `⚠️`).
  Next actions add **QP-ROTATE-PT-1**. BRIEFING regenerated from STATUS. **AGENTS.md** audited —
  no session archaeology; standing rules only; left unchanged.

### August 13, 2026 — playtest export (3rd): 3 PASS / 0 FAIL / 3 SKIP

- *(Playtest · UI)* **ANIM-BUGS-PT-1** — ✅ **PASS 08-13 on prod** (deployed `d5fc9a0` /
  Worker `c319bb08-f87d-4ac6-be98-4771cd731c34`). Menu title/commands stagger in, fast
  open/close of Settings and Esc hides overlays cleanly with buttons staying clickable,
  press-drag-off-release restores cart scale, HOW TO PLAY attract restarts, and boost/collide
  leaves the cart at normal scale. Parent **ANIM-BUGS-1** closes with it.
- *(Playtest · Audio)* **BOOST-SFX-RESPAWN-PT-1** — ✅ **PASS 08-13 on prod** (deployed
  `ef6e7c4` / Worker `32b9807a-c6d4-41b8-af69-15d89c40366c`). Charge-up sound survives an NPC
  respawn mid-charge and the BOOST fires on release with the charge sound intact. Parent
  **BOOST-SFX-RESPAWN-1** already closed.
- *(Playtest · Art)* **KO-DOOMED-PT-1** — ✅ **PASS 08-13 on prod** (deployed `a79222c` / Worker
  version `0ccc160a`). Every local KO gives one red edge pulse + centered shockwave exactly with
  the cart shatter — self-falls, center hole, and NPC rams; attacker-only KOs show no victim
  feedback; feedback survives Low quality / post-FX off. **This closes the loop on the `910ca37`
  host fan-out fix** (the FAIL that shipped with it now passes live).

### August 13, 2026 — playtest export: 6 PASS / 1 FAIL / 3 SKIP

- *(Playtest · Art)* **ART-PALETTE-PT-1** — ✅ **PASS 08-13 on `npm run dev`.** All five preset
  carts glow brand neon (`0xff2bd6`/`0x22e6ff`/`0x2bff7a`/`0xffe53d`/`0xff7a1a`), menu chip
  matches the in-game cart, HUD "you" accent matches, emissive balance holds (pink/orange not
  dimmer, yellow not hotter), no pure-spectral reads. Wyatt note: colors read a touch pastel vs
  his preference ("i don't hate how they look"), and the custom-hue red renders as a dark orange
  in-game — passed anyway; the hue-red read is a different mechanism and is filed fresh as
  **CART-HUE-RED-1**, not a residual on this card. Parent **ART-PALETTE-1** already closed.
- *(Playtest · UI)* **CHAL-SHELF-FIT-PT-1** — ✅ **PASS 08-13 on `npm run dev:local`.** All six
  challenge cards plus DAILY/WEEKLY headings, BACK, and DONE fit at 360 × 640 portrait without
  scrolling; nothing clipped or overlapping; desktop two-column shelf unchanged. Parent
  **CHAL-SHELF-FIT-1** closes with it.
- *(Playtest · UI)* **GAMEPAD-NAV-REPEAT-PT-1** — ✅ **PASS 08-13 on prod** (deployed
  `34518ca` / Worker `54ce3bb3-3cfd-4d2f-9ea3-c9e671f5c7db`). Held D-pad/stick moves once
  immediately, pauses ~0.3 s, then repeats at a steady readable rate; diagonals resolve one
  direction; no cross-overlay repeat carry; sliders single-step 5%; no rapid rumble buzz. Parent
  **GAMEPAD-NAV-REPEAT-1** closes with it.
- *(Playtest · Engineering)* **LOD-DOORWAY-PT-1** — ✅ **PASS 08-13 on prod.** All three Storerooms
  wall doorways visible from the floor and at the wall; no pop-out on approach; round completes.
  Parent **LOD-DOORWAY-1** already closed.
- *(Playtest · Engineering)* **RUMBLE-STRENGTH-PT-1** — ✅ **PASS 08-13 on prod** (deployed
  `682891e` / Worker `82e8a360-b185-403a-8a66-2757f7aba40d`). Settings test pulse + ON persists
  across reload; Xbox/PS5/Steam Deck standard gamepad path works; gameplay feedback stronger than
  menu; off stops controller and menu vibration. Parent **RUMBLE-STRENGTH-1** closes with it.
- *(Playtest · Art)* **SHELF-RAIL-PT-1** — ✅ **PASS 08-13 on `npm run dev`.** Booth handrails read
  matte painted steel (no chrome gleam), shelf boards show bay seams reading as bolted sections;
  rails not brighter than the room. Parent **SHELF-RAIL-1** already closed.

### August 13, 2026 — KO-DOOMED-PT-1 FAIL → host fan-out wiring fix

- *(Playtest · Art)* **KO-DOOMED-PT-1** — ❌ **FAIL 08-13**: *"i don't see any visible difference
  in local KO's"*. Root cause: the host KO fan-out (`dispatchKOEvent` in `gameFlow.js`) omitted
  `onLocalDoomed` from its reactor ctx, so `localDoomedReactor`'s `ctx.onLocalDoomed?.()` no-oped
  on every host KO — and Solo is always host, so the red edge pulse + shockwave never fired
  locally. The non-host falls[] replay path (`netcode.js`) already passed the hook; the DOM
  feedback itself (`showDoomedFeedback` → `pulseHitDirection` + `.hud-doomed-shockwave.is-active`)
  was never the problem. **Fix (`910ca37`):** `onLocalDoomed: deps.onLocalDoomed` added to the
  host dispatch ctx, plus the `GameFlowDeps` typedef property; regression test
  (`gameFlowSuddenDeath.test.js`) asserts the host fan-out carries the hook. Focused tests
  45/45. Retest owed on `npm run dev:local` (unshipped), then on prod after the next ship.
  Engineering row **KO-DOOMED-1** closes with the fix.

### August 13, 2026 — ART-LOW-SWEEP-1: four Art Lows closed in one acked wave

- *(Art · Low)* **CLAD-REPEAT-1** — ✅ **CLOSED 08-13.** The Classic stadium cladding shared one
  `panelTex.repeat(24, 3)` / `cladMat` across three deck radii (73/100/124 m, wallH 12.2/10.6/9.8 m),
  so the authored 2:1 cart-silhouette motif rendered 2.09×0.22 m on deck 0 but 3.55×0.18 m on deck 2
  (4.7×/9.9× distorted, inconsistent between rings). Fixed by **per-deck UV scaling** on the
  cladding cylinders (`src/effects.js`): each deck's UVs scale by `(cladR/refCladR, wallH/refWallH)`
  against deck 0, so all three rings render the same world-space motif while ONE shared
  texture+material survives — the stadium merge still collapses cladding to a single draw call
  (texture/material cloning was rejected in adversarial review: it would have split the merged
  draw into three). Deck 0 keeps identity scale (authored look unchanged). Verified: tile size
  19.255×4.067 m on all three radii; `tests/cladRepeat.test.js` (4) locks the shape; `effectsDispose`
  green. Commit `bdf3df3`.
- *(Art · Low)* **SHELF-RAIL-1** — ✅ **CLOSED 08-13.** Two levers in `backroomsSupermarket.js`.
  **(a) Material:** the booth spawn-platform handrails were the lowest-roughness/highest-metalness
  pair in the file (0.45/0.7) → polished chrome in a room where nothing else is polished. The
  BACKLOG row's suggested donor `buildShelfSteelTexture()` was stale (STORE-PT-1 replaced shelf
  steel with painted wood), so rails now read as painted steel in the room's own frameMat language:
  roughness 0.72, metalness 0.3. `tests/shelfRail.test.js` asserts the rails are no longer the
  shiniest pair (source-assert shape, same as the STORE-WALL-SLIDE-1 friction check). Commit
  `a6cbbaa`. **(b) Geometry:** each 114 m shelf board (previously one full-span box per level)
  now splits into bays with 4 cm seam gaps, count derived from the upright rhythm
  (`Math.round(boardLen / uprightStep)`), same `shelfWoodParts` bucket → still one merged
  geometry, no draw-call regression. The per-bay UV restart is what reads as "bolted sections"
  at distance (the 4 cm gap is sub-visual at 56 m). Commit `6cab3c5`. Visual confirmation owed on
  **SHELF-RAIL-PT-1** (seeded).
- *(Art · Low)* **ART-LUMA-TOOL-1** — ✅ **CLOSED 08-13.** Folded a Rec.709 luma / darkness
  readout into `npm run compare` (`tools/compare.mjs`): per-image floor (darkest-decile mean),
  median, mean, and pure-black %, printed as a luma line before the diff. Metric definition
  written down in the tool + art-direction.md Rule 3 (luma on raw sRGB bytes, no linearization —
  the scratchpad that produced the 08-06 baselines is gone, so the definition is now committed).
  Pure `computeLumaStats` is exported and guarded `main()` (module importable by tests without
  executing the CLI). `tests/compareLuma.test.js` (5) covers all-black, known-bytes, decile floor,
  even-count median, and black-% semantics deterministically — no capture or GPU needed. Smoke:
  `before-classic.png` reads floor 0.00 / median 6.57 / mean 19.76 / black 18.9%, consistent with
  the documented pre-08-06 capture (the doc's "Classic 19.76 → 21.37" pre-vignette-removal number).
  Commit `3cec57a`.
- *(Art · Low)* **ASSET-RENAME-1** — ✅ **CLOSED 08-13.** Renamed the legacy fallback cart model
  `public/models/cart-rave-base-draco.glb` → `public/models/cart-clash-base-draco.glb` (the
  brand.md-sanctioned separate asset pass; primary `cartrave4-draco.glb` keeps its jam-tribute
  name). All four code references updated: `RAVE_GLTF_PATH_DRACO` constant, `raveGltfUrlDraco`,
  the **legacy-layout detection regex** (miss this and the fallback cart would rig with wrong
  roles), and the console.warn string in the fallback chain. Doc mentions fixed: CREDITS.md model
  list, brand.md freeze table row (now names `cart-clash-base*.glb`), and two dead
  `compress:rave-gltf -- cart-rave-base` examples (the `art/models/cart-rave-base.glb` master
  doesn't exist — only `cartrave4`) pointed at the real master. GLB-internal mesh-name comment
  stays (mesh names inside the file are unchanged by a filename rename). Build verified: dist ships
  `cart-clash-base-draco.glb`, zero `cart-rave-base` refs outside edit-forbidden archives. Live
  0×404 check on the new `/models/` path is deferred to the next ship per Wyatt (no mid-wave
  deploy). Commit `8178a57`.

### August 13, 2026 — ART-PALETTE-1: 3D cart neon reconciled to the 2D brand roster

- *(Art · Low)* **ART-PALETTE-1** — ✅ **CLOSED 08-13.** `CART_COLORS` (src/config.js) was
  frozen on pure spectral hexes (`0xff00ff` etc. — the "Original Rave" invariant) while the 2D
  layer banned those as off-brand and used `#ff2bd6`. The palette is now **brand-aligned** to
  the 2D roster (`PALETTES.classic.players` in cart-rave-menu.js, same order as `PALETTE`):
  pink `0xff2bd6` · blue `0x22e6ff` · green `0x2bff7a` · yellow `0xffe53d` · neonOrange
  `0xff7a1a`. The dead `css: "bg-*"` field (zero consumers repo-wide) was removed with it.
  Invariant docs unfrozen: AGENTS.md, agent-manual.md, art-direction.md "Frozen" paragraph —
  `CART_COLORS` is now the brand-aligned single source (pure spectral hexes banned as cart
  neon); the `mesh.traverse()` material logic stays frozen. Arena neon stragglers using the
  same banned hexes swept to brand equivalents (searchlight / trash / crowd glow / stage neon /
  sky lasers / billboard / UFO rings / RUSH HOUR callout accent). Two exclusions kept: the
  menu hue-picker rainbow gradient (intentional spectral ramp) and non-palette accents
  (`0x39ff14`, `0xff3300`, whites/purples). New `tests/cartPaletteBrand.test.js` (4) pins the
  hex values to the 2D roster so the palette cannot silently re-freeze to spectral.
  **Emissive consequence (measured, adversarial-review catch):** `cartEmissiveIntensityForHex`
  is luma-derived, so the shift is luma-honest but not neutral — yellow +39.7% (its run-5
  taming gate no longer applies: luma 0.928→0.776 sits above the 0.85 gate), blue +22.7%,
  green −2.6%, pink/orange unchanged (intensity capped). Stale comment in utils.js updated with
  the real numbers. **Persisted customizations auto-migrate** — hex is recomputed from the
  color id at load (`normalizeCustomization`), the stored `customHex` has zero readers. Playtest
  owed: **ART-PALETTE-PT-1** (seeded — brand neon, chip-match, emissive balance incl. the
  yellow/blue brightening, HUD accent, custom-hue snap). Commits `d78e2cf` (palette + docs +
  test) · `3f0f49b` (straggler sweep).

### August 13, 2026 — SWIRL-REVIVE-1: close as no action needed

- *(Design / Gameplay · Low)* **SWIRL-REVIVE-1** — ✅ **CLOSED 08-13.** The proposed turntable
  swirl force was not needed after reviewing the behavior. Existing geometry recovery already
  gives a wedged cart a small unstick impulse after 2 seconds and respawns it after 10 seconds
  without a score penalty. No taste-gated physics prototype is warranted.

### August 13, 2026 — DEATHCAM-KILLER-1: close as no action needed

- *(Design / Gameplay · Low)* **DEATHCAM-KILLER-1** — ✅ **CLOSED 08-13.** The existing death
  camera keeps attention on the local cart's shatter and explosion, then returns to follow mode
  after respawn. The previous follow-killer experiment was reverted for worse feel, and there is
  no new player evidence that justifies another camera pass.

### August 13, 2026 — MONETIZE-1: close as no action needed

- *(Design / Gameplay · Low)* **MONETIZE-1** — ✅ **CLOSED 08-13.** Cart Clash will stay free.
  The product goal is to build an audience through the game, not to add purchases, ads, or a
  supporter-payment path. No monetization work is warranted.

### August 13, 2026 — LOD-DOORWAY-1: drop origin-anchored doorway LOD

- *(Art · Low)* **LOD-DOORWAY-1** — ✅ **CLOSED 08-13.** Storerooms wall doorways (`buildDoorways`) live in three `doorGroup`s whose meshes carry world coords (~56–61 m out) inside a group left at the origin. `registerLevelLodNode(doorways.group, { far: 55 })` measured camera-to-arena-CENTRE, so all three popped out exactly when the chase camera reached a wall. Deleted the registration (same lever as LOD-PITRING-1). Per-child + `far: 55` was rejected: the doors sit outside 55 m of origin, so that shape would hide them from the floor (the authored across-the-pit view). Two new tests in `tests/levelLod.test.js` lock WHY (origin + `far: 55` culls at the wall, stays visible at centre) and the source shape (no `doorways` LOD registration). Visual confirmation owed on **LOD-DOORWAY-PT-1**.

### August 13, 2026 — ZAN-BOLLARD-PT-1: PASS after five fixes

- *(Playtest · Low)* **ZAN-BOLLARD-PT-1** — ✅ **PASS 08-13 on prod `fc0844fa`.** Sundial corner bollards + gnomon now clang audibly (metallic impact) and the sound fires only on the posts. The full chain, in order:
  1. **Δv sampling** — `getEnvironmentImpact` subtracted the pre-step velocity snapshot from itself (always 0), so edge impacts never fired for any surface; now samples the post-step body velocity.
  2. **Threshold retune** — a real-Rapier probe measured 1.6–1.7 m/s per-step Δv at any approach speed (the +4 solver iterations spread the impulse), making the old 2.5 m/s threshold unreachable; retuned to `edgeDeltaVThreshold: 0.75` + `edgeIntensityRange: 6` (floor curve untouched).
  3. **Audible sample** — the edge path played the quiet floor thud (Floor.opus mean −23 dB); hop thump as a stopgap, then Wyatt-supplied `56254__qk__metal_04.wav` → `clang.opus` (48 kHz mono, peak −1.6 dB, 0.14 s).
  4. **Trigger scoping** — the clang fired on the whole edge class (pit wall + booth legs + posts); the Sundial deck posts now own `bollardColliderHandles` → new `clang` classification (sound + spark), booth legs / pit wall stay `edge` = FX only.
  5. **Spark placement** — inboard edge contacts no longer project to the pit ring; sparks sit on the post.
  - F8 evidence along the way: cap-362 (`e938f98`) proved impacts fired at intensity 0.4–1.0 yet stayed inaudible; cap-363 (`abe96c8`) proved 123/123 `playSfx` calls returned valid Howler ids with the context running — the failure was the sample, not the path. Impact plays remain diag-instrumented (`sim/impact_play` with howlState/howlerState/ctxState). Commits: `2161cb5` · `c701ef6` · `abe96c8` · `ae0a347` · `340209b`.

### August 13, 2026 — ANNOUNCER-RERECORD-1: announcer re-records done

- *(Audio · Medium)* **ANNOUNCER-RERECORD-1** — ✅ **CLOSED 08-13 on Wyatt's word** (`[SHIP-1 E3]`). Re-records are done: shorter directive takes + odd lines. Work shipped outside the repo; no code or asset change in this tree, so the closure is docs-only. The E3 slot for the Howler upgrade stays open as **HOWLER-UPGRADE-1**.

### August 13, 2026 — ENG-LOW-SWEEP-2: Block 5 sweep levers

- *(Engineering · Low)* **SNAP-SPARSE-1** — ✅ **CLOSED 08-13.** `hostSendTick` (src/netcode.js) leaves holes in the positional `carts` array when a slot is vacant, and the binary encoder (`carts[i] || {}` in src/netcode/binary.js) turns each hole into a zeroed cart at the origin on every remote — a phantom cart riding the wire. Added a session guard: consecutive vacant ticks per (phase, slot) with a warn-once-per-phase `console.warn` + `recordDiagEvent("net", "sparse_cart_hole", { slotIndex, phase, consecutiveTicks, totalCarts })`. Guard only — the protocol-level present-bitmask stays out of scope (the phantom remains on the wire until that card). New tests in tests/hostSnapPump.test.js (5): warns once with slot index, no re-warn same phase, re-warn on phase change via the force flush path, silent on a dense array, reset-seam isolation (`resetSparseHoleStateForTest` + `hostSendTickForTest` hook). Full QA green by number; two load-flaky full-run failures (diagnostics drain timeout, friendsJoinFlow fake-timer STACK_TRACE_ERROR) confirmed green on re-run and in isolation.
- *(Art · Low)* **LOD-PITRING-1** — ✅ **CLOSED 08-13.** The Storerooms pit-ring dressing is ONE merged mesh inside a group left at the origin (vertices carry world coords), so `registerLevelLodNode(pitDressing.group, { far: 48 })` measured camera-to-arena-CENTRE and culled the ring exactly when the chase camera crossed the 46.7 m band — standing beside a gondola hid it. Removed the registration: the dressing is one always-correct fogged mesh (no per-side cluster restructure, no draw-call cost change). Two new tests in tests/levelLod.test.js lock WHY (an origin-anchored far:48 culls at the band edge; no `pitDressing.group` registration remains). Visual confirmation owed on **LOD-PITRING-PT-1**. The same row note's `doorways` observation (origin group, children on the walls at ~56 m, `far: 55` culls when the camera reaches the wall) was verified real and filed as **LOD-DOORWAY-1** — out of this card's scope, one commit per ID.
- *(Engineering · Low)* **CONN-SOURCETRUTH-1** — ✅ **CLOSED 08-13.** `party/index.ts` reconciled "which sockets are live" by hand at six call sites (countdown cancel/reevaluate, `#checkAllReady`, `#schedulePlayReadyWait`, onConnect reconcile, readyToggle orphan pass), each rebuilding the same `getConnections()` → Set loop. Added `#liveConnIdSet()` (raw platform truth, no override) as the single implementation; `#platformLiveConnIds()` keeps the test-seam override (`getPlatformLiveIdsOverride`) and delegates when unset — the override stays confined to pre-cap pruning exactly as before. Production- and test-identical; party-do 46/46 green, typecheck clean. Docstrings updated to name the funnel; `#pickNextHostId` / `#ensureLiveHost` / reaper keep `#connections.keys()` deliberately (server-known conns vs platform truth).
- *(Tech Debt · Low)* **VITE-CHUNKWARN-1** — ✅ **CLOSED 08-13.** No code change — the 500 kB chunk-size hint was already raised to `chunkSizeWarningLimit: 700` in vite.config.js (commit `d486e6b`, "chore: update build tooling — vite 8…"), above the largest vendor chunk, with the rationale ("default 500 kB warning is just noise") in the config. Row retired with the ENG-LOW-SWEEP-2 docs pass.
- *(Playtest · Medium)* **PERF-TIER-PT-1** — ✅ **CLOSED 08-13.** Wyatt playtest PASS 08-12 (row note; STATUS 08-12 log): high-lite tier boots correctly, reflector absent, quality menu shows 4 options, frame times stable. Parent PERF-TIER-1 already closed with it; the row was retired late (house-rule drift caught in the ENG-LOW-SWEEP-2 docs pass).
- *(Playtest · Medium)* **PROBE-WARM-RT-PT-1** — ✅ **CLOSED 08-13.** Wyatt playtest PASS 08-12 (row note; STATUS 08-12 log): programs count stable across first KO, no mid-round warmupCompile events. Parent PROBE-WARM-RT-1 already closed with it; the row was retired late (house-rule drift caught in the ENG-LOW-SWEEP-2 docs pass).
- *(Backlog hygiene)* **BACKLOG-HYGIENE-2** — ✅ **DONE 08-13** (docs pass, part of ENG-LOW-SWEEP-2). Retired the three rows above; stripped stale Work-order prose (CHAL-PODIUM-DEDUPE-1 · ZAN-BOLLARD-CLASS-1 in Block 5, LOD-PITRING-1 in Block 7); seeded **LOD-PITRING-PT-1** (prod check for the pit-band visibility fix) and filed **LOD-DOORWAY-1** (same origin-anchor LOD defect on the Storerooms doorways, verified at LOD-PITRING-1 close). Glance box regenerated via `npm run backlog`. STATUS "Last updated" wave entry deferred — STATUS.md carried a pending uncommitted docs-archive change (closed-card rows + 08-12 status log consolidation) and was left untouched for its owner to commit.

### August 13, 2026 — playtest export (08-13 second): 3 PASS, 1 FAIL, 3 SKIP

- *(Playtest · Medium)* **CHALLENGE-EXPAND-PT-1** — ✅ **PASS 08-13 on prod `88b50a5`.** Six challenge entries + nine sunglasses finishes readable, persistent, useful; progress card, toast, badge, analytics, receipt all update once; responsive at desktop/portrait/short-landscape. Note filed as **CHAL-SHELF-FIT-1** (phone scroll → scale-to-fit polish, "not the end of the world"). Parent engineering row already closed.
- *(Playtest · Low)* **LOD-PITRING-PT-1** — ✅ **PASS 08-13 on prod `88b50a5`.** Pit-band silhouettes stay visible driving the edge — LOD-PITRING-1's removal of the origin-anchored LOD confirmed live. Closed.
- *(Playtest · Low)* **MENU-MUSIC-2B-PT-1** — ✅ **PASS 08-13 on prod `88b50a5`.** Exactly one menu song audible through the handoff; no overlap. Closed.
- *(Playtest · Low)* **ZAN-BOLLARD-PT-1** — ❌ **FAIL 08-13 on prod `88b50a5`.** "i don't hear any sound when impacting them" — Sundial corner bollards + gnomon still silent despite the ZAN-BOLLARD-CLASS-1 edge reclassification. → ✅ **PASS 08-13 on prod `fc0844fa` after five fixes** (see the dedicated section below).
- **SKIP (unchanged):** CARGO-BAY-INSTANCE-PT-3 · CONN-TRACK-LEAK-PT-1 (two-machine, deferred) · SHARD-PT-2 (launch-day traffic).

---

### August 13, 2026 — ENG-LOW-SWEEP-1: nine Engineering Low sweep levers

- *(Engineering · Low)* **BINARY-F32NAME-1** — ✅ **CLOSED 08-13.** `encodeF32` (src/netcode/binary.js) returned values unchanged and was also used for the Float64 `tHost`; renamed to `toFiniteNumber` across the encoder (7 call sites). Not exported; no importers. Test comment updated to match.
- *(Engineering · Low)* **CONSOLE-HI-1** — ✅ **CLOSED 08-13.** The `%cHI :D` console easter egg in src/main.js is now gated behind `import.meta.env.DEV` (dead-code-eliminated from the prod bundle; still prints in dev/vitest).
- *(Engineering · Low)* **CHAL-PODIUM-DEDUPE-1** — ✅ **CLOSED 08-13.** `recordPodiumStats` (roundLifecycle.js) only set its `startedAtMs:winKey` dedupe latch when `startedAtMs > 0`, so a redelivered MSG.round on the theoretical 0-stamp edge could double-credit ROUND_* challenge events. The latch now arms unconditionally (real rounds stamp unique timestamps, so round separation is unchanged). Re-opened from the AUDIT-SWEEP-1 drop with the adversarial-review scope: latch-only, no cross-module contract change.
- *(Engineering · Low)* **ROUND-CLOCKDOMAIN-1** — ✅ **CLOSED 08-13.** The podium MAX check's `now - runningAnchor - paused` mixed server-domain and host-domain terms under a misleading name. `pausedWallMs` renamed to `hostHideCompMs` (a host-domain delta accumulated from startedAtMs increases — a duration, so the subtraction is domain-safe); local `paused` → `hostHide`; the MAX/MIN comment block now states both clock domains explicitly. Field rename on the wire is invisible — no client reads it. Tests updated in the same commit.
- *(Engineering · Low)* **CONN-DEADCODE-1** — ✅ **CLOSED 08-13.** Removed dead code from `party/index.ts`: the unused `#clamp` helper, the `const reaped/reconciled; void reaped; void reconciled;` no-ops (now bare calls in onConnect), and the unused teardown return values (`#reapSilentConnections` / `#reconcileOrphanSlots` are now void — neither return was ever consumed; no test asserted on them). DO harness 21/21.
- *(Engineering · Low)* **CONN-SNAPSHOT-PURE-1** — ✅ **CLOSED 08-13.** `#snapshot()` no longer calls `#ensureLiveHost()` (which could broadcast `host_migrated` mid-hello). Its single call site — the onConnect hello — repairs host immediately before, now annotated as the snapshot's only repair path. FIX-MIG comments updated to drop "snapshot" from the disconnect-repair list. DO harness 21/21.
- *(Engineering · Low)* **PARTY-ENVTYPE-1** — ✅ **CLOSED 08-13.** Replaced `env: Record<string, any>` (DO constructor + fetch handler) with an exported `Env` interface — `ASSETS`, `ERROR_LOG`/`ANALYTICS_LOG`/`CAPTURE_LOG`, `ERROR_LOG_TOKEN`, and the CF Calls credentials, all optional to mirror the runtime guards. Binding-name typos are now compile errors. Minimal structural `EnvFetcher` / `EnvDurableObjectNamespace` shapes used because `@cloudflare/workers-types` is not a direct dependency (verified absent; its ambient globals don't load in the main tsconfig). Typecheck clean; DO harness 21/21.
- *(Engineering · Low)* **CONN-SPAWN-SANITIZE-1** — ✅ **CLOSED 08-13.** `hostSpawn` stored and relayed host-supplied `carts` verbatim (a non-array payload was echoed raw). Now sanitized permissively: each entry must carry a 3-float `p`, the array is capped at 4 (the room slot shape), junk entries become holes. Late-join hellos therefore echo a bounded, validated copy. New party-do test: host sends 5 carts incl. junk → joiner's hello carries 4 with the junk entry nulled.
- *(Engineering · Low)* **ZAN-BOLLARD-CLASS-1** — ✅ **CLOSED 08-13.** Sundial's eight corner bollards and the gnomon blade collided unregistered, so `classifyEnvironmentCollision` defaulted them to "floor" while booth legs were "edge" — the file's own convention says vertical posts you hit are edge-clang surfaces. `buildDeck` now returns `edgeHandles` (captured bollard + gnomon collider handles) and the level registers them into `boothColliderHandles`. Effect: bollard/gnomon clips now emit the edge impact clang (they were below the floor fall-speed threshold, i.e. silent). Known cosmetic residual: edge contact FX projects toward the pit ring, so bollard sparks may sit off-post — judged on the seeded **ZAN-BOLLARD-PT-1**. Friction/restitution untouched; zanzibarObstacleFriction suite green.

---

### August 13, 2026 — AUDIT-SWEEP-1: six audit-finding levers closed

- *(Engineering · Medium)* **NET-QUIT-RETRY-1** — ✅ **CLOSED 08-13.** Pending socket-retry timer (3–5 s backoff) survived quit-to-menu and re-joined the last room from the main menu. `scheduleNetcodeRetry`'s timeout now stores its handle in a module-scope `netcodeRetryTimer`; `disconnectPartySession()` clears it, `initNetcode` drops any stale pending timer on entry, and the callback re-checks `_suppressRetry`. Verified live in the dev sweep: quickplay session → ESC → MAIN MENU → menu held through the full retry window with no re-join. Commits `182a673`.
- *(Engineering · Medium)* **CHAL-MENU-REBUILD-1** — ✅ **CLOSED 08-13.** `challengeStore.subscribe(renderChallengesPanel)` rebuilt the whole hidden shelf (innerHTML reset + 6 cards + pool lookups) on every mid-round progress event (KO/spill/combo). The subscribe callback now no-ops while the challenges screen is `aria-hidden`; `openChallengesScreen()` already re-renders on open. Seam test pins the gated shape. Commit `485dedf`.
- *(Engineering · Medium)* **CHAL-ROTATE-RECORD-1** — ✅ **CLOSED 08-13.** `record()` credited the just-expired challenge set when a session crossed the daily/weekly boundary mid-game; that credit was discarded at the next rotation. `record()` now calls `checkRotations()` first (no-op when nothing expired). Two new tests: rotation-before-credit (fake timers cross a boundary, stale progress provably gone) and the no-op case. Commit `00d8324`.
- *(Engineering · Low)* **CHAL-ROTATE-REPEAT-1** — ✅ **CLOSED 08-13.** Rotation could re-pick the just-rotated challenge ids with progress reset to 0. `checkRotations` now passes the outgoing daily/weekly ids as `excludedIds` to `selectRandomChallenges`. Test pins that neither shelf re-picks its outgoing set. Commit `08ecbd5`.
- *(Engineering · Low)* **CHAL-DEAD-EXPORT-1** — ✅ **CLOSED 08-13.** Removed the never-called `ChallengeTracker.checkRotations` wrapper (all callers use `challengeStore.getState().checkRotations()` directly). Commit `cc45ba2`.
- *(Engineering · Low)* **ZAN-REACTIVE-ALLOC-1** — ✅ **CLOSED 08-13.** `sampleArenaReactive` returned a fresh object literal per frame from Sundial's `deck.update` (6 call sites; all drain synchronously — `accentColor` already reused the shared `_out` Color). Now fills a module-scope `_reactiveScratch`. Commit `80cb60b`.

Wave verification: full QA green by number (1,951 tests), dev:local browser sweep passed (quickplay entry → quit-to-menu held → challenges shelf `DAILY · 4` / `WEEKLY · 2` rendered). Dropped during the adversarial plan review: CHAL-PODIUM-DEDUPE-1 and ZAN-BOLLARD-CLASS-1 (both still open in BACKLOG — the "fix" shapes traded one theoretical edge for another / required a cross-module contract change for near-zero value).

---

### August 13, 2026 — DEPS-MAJOR-1: tooling majors

- *(Engineering · Low)* **DEPS-MAJOR-1** — ✅ **CLOSED 08-13.** Upgraded direct devDependencies to `sharp@0.35.3` and `@cloudflare/vitest-pool-workers@0.21.2`; the effective toolchain is Wrangler `4.122.0`, Miniflare `5.20260811.0-alpha`, Undici `7.29.0`, and Workerd `1.20260811.1`. Sharp compare smoke produced `meanAbs=0.000`; party-do passed 5 files / 45 tests; full QA, production build, and Wrangler dry-run passed. Audit findings fell from 9 to 4; the remaining Vite/PostCSS/nanoid findings are outside this card. No player-visible behavior and no deploy.

---

### August 13, 2026 — RAPIER-MAJOR-1 / RAPIER-MAJOR-PT-2: live multiplayer PASS

- *(Dependency / Playtest · Medium)* **RAPIER-MAJOR-1** / **RAPIER-MAJOR-PT-2** — ✅ **CLOSED PASS 08-13.** Wyatt PASSed the deployed `524bd4db` build after a hard refresh in a two-browser Friends room: host and joiner drove, the host KO'd the joiner, and both screens agreed on the result. The Rapier 0.19 → 0.20 bump had already passed the solo PT-1 check; this closes the parent after live multiplayer verification.

---

### August 13, 2026 — RAPIER-MAJOR-PT-1: solo 0.20 feel PASS

- *(Playtest · Medium)* **RAPIER-MAJOR-PT-1** — ✅ **CLOSED PASS 08-13** on `npm run dev:local`. Solo drive, hop, charge-boost, KO bounce, and pit-stave hits still felt like 0.19 after the `@dimforge/rapier3d` + `-simd` bump to `0.20.0` (Rust 0.35). No knob retune. Parent **RAPIER-MAJOR-1** stays open for **RAPIER-MAJOR-PT-2**. Deployed `524bd4db`. Hashed assets 0×404. Live `rapierInstance-o_X8o-Pe.js` carries `cartRaveRapierSimd`. Live WASM `rapier_wasm3d_bg-CCK6hj8V.wasm`.

---

### August 13, 2026 — Playtest export: 9 PASS, 0 FAIL, 3 SKIP

- *(Playtest · Medium)* **CARGO-BAY-INSTANCE-PT-1** / **CARGO-BAY-INSTANCE-PT-2** — ✅ **CLOSED PASS 08-13.** Solo cargo filled in order, stayed put, hid correctly on spills, and rebuilt without empty or doubled bays. **CARGO-BAY-INSTANCE-PT-3** remains open for two-machine parity.
- *(Playtest · Medium)* **CONN-TRACK-LEAK-PT-2** — ✅ **CLOSED PASS 08-13.** A same-clientId hard refresh reclaimed one seat without a ghost human or hostless room. **CONN-TRACK-LEAK-PT-1** remains open for two-machine host-leave migration.
- *(Design / Gameplay · correctness)* **NPC-BOOTH-TARGET-PT-1** — ✅ **CLOSED PASS 08-13.** NPCs stayed on the floor while the player sat on a spawn booth, including after respawn and in Sudden Death.
- *(Design / Gameplay · correctness)* **NPC-TYPE-DRAW-1** / **NPC-TYPE-DRAW-PT-1** / **NPC-TYPE-DRAW-PT-2** — ✅ **CLOSED PASS 08-13.** Solo and one-human Quickplay fielded three distinct NPC types; rematch kept the omitted type and hard-refresh rotated it. Implementation commits `ab416b3`, `43d26ba`, and `e3151aa`; deployed `7aa16db4`.
- *(Audio · correctness)* **PA-COMBO-1** / **PA-COMBO-PT-1** — ✅ **CLOSED PASS 08-13.** Savage and Carnage coupon tiers spoke matching PA lines instead of staying on Rampage or going quiet. Implementation commits `bed77ab` and `ff8175b`; deployed `c0a15308`.
- *(Tech Debt · regression)* **STORE-1-PT-1** — ✅ **CLOSED PASS 08-13.** Solo start, scoring, podium, quit-to-menu, restart, and rematch stayed clean after `src/gameState.js` was deleted.
- *(Audio · content)* **STORE-MUSIC-PT-1** — ✅ **CLOSED PASS 08-13.** The Storerooms played both new songs without the old track, silence, or music from another arena.

Three export cards remain open as SKIP: **CARGO-BAY-INSTANCE-PT-3**, **CONN-TRACK-LEAK-PT-1**, and **SHARD-PT-2**.

---

### August 13, 2026 — MENU-MUSIC-2: second main-menu song

- *(Audio · content)* **MENU-MUSIC-2** / **MENU-MUSIC-PT-1** — ✅ **CLOSED 08-13.** Wyatt playtest PASS on prod `11e5e48f`. Menu playlist is `menu.opus` + `menu2.opus`. Each menu start from a stopped state picks a random first track; `onend` plays the other and wraps. Encoded `menu2.opus` opus 96k VBR, loudnorm −13.5 LUFS. Only track 0 preloads; the next track warms after the current one starts. Bleed guards stop every menu Howl. First-load on `dev:local` always played `menu.opus` because the DEV gate returned before `startIdx` was stored — `playMenuMusic` now stores the index first. Hashed assets 0×404; live `index-BqCYkBNl.js` carries `menu2.opus`; live `audioManager-kbrnh4ap.js` carries `menuTrackIdx`.

---

### August 13, 2026 — NPC-BOOTH-TARGET-1: skip booth-sitters in AI chase

- *(Design / Gameplay · correctness)* **NPC-BOOTH-TARGET-1** — ✅ **CLOSED PASS 08-13** on deployed `2fa4b2e4`. `findNearestHumanTarget` skips a human whose pose is on a spawn booth (height `> platformY - 0.5` AND XZ at/outside the spawn-ring inner lip). Height alone is not the test: Night Shift high roofs sit above that Y and stay chaseable. `pickAiTarget` then patrols. Tests: `tests/aiSpawnBoothTarget.test.js`. Hashed assets 0×404; live `gameBoot-DABEl-r1.js` carries `isOnSpawnBooth`. Mid-gap failed-jump chase is a named residual, not this lever.

---

### August 12, 2026 — STORE-MUSIC-1: two new Storerooms tracks

- *(Audio · content)* **STORE-MUSIC-1** — ✅ **CLOSED PASS 08-13.** Replaced `public/sounds/storerooms.opus` with Wyatt's first Mixcraft export and added `storerooms2.opus`. Catalog playlist is `["storerooms.opus", "storerooms2.opus"]`. Encoded opus 96k VBR, loudnorm ≈−13.5 LUFS to match the other music. `normalize-sfx.mjs` now skips both files. Deployed `4f8b649f`; hashed assets 0×404; live `roomCodes-C4vOBfIj.js` carries `storerooms2.opus`. Wyatt confirmed both new songs in the 08-13 playtest export.

---

### August 12, 2026 — PA-QUIET-1: one spoken line per game moment

- *(Audio · taste)* **PA-QUIET-1** / **PA-QUIET-PT-1** — ✅ **CLOSED 08-12.** Wyatt playtest PASS on `npm run dev:local`. Same-fall flavor skip in `announcerDirectorOnFall`: `leader_down` / `critical_ko` do not fire when that fall already announced `first_spill`, a combo, `refund`, `double_spill`, or `aisle_wipeout`. Isolated leader / crit KOs still play. Busy-channel policy: only `high` queues while `_active`; medium/low still queue during the min-gap window. `last_call` is `critical` / no focus (priority 80, not interruptible) so "10 SECONDS" cuts a mid-line PA. Commits `e37bd59` + `a0ba621`. Deployed `3044ab99`; hashed assets 0×404; live `gameBoot-UmoIS5tA.js` carries `last_call` `cls:critical` priority 80.

---

### August 12, 2026 — PLAYTEST-SEED-1: fail-closed playtest console seed

- *(Tech Debt · process)* **PLAYTEST-SEED-1** — ✅ **CLOSED 08-12.** Agents closed player-visible cards with STATUS "Playtest owed:" prose and never wrote a BACKLOG `## Playtest owed` row, so the generated console stayed empty and Wyatt had to ask. Three layers: (1) `health:check` now fails `PLAYTEST_STEPLESS` (owed, no numbered steps) and `PLAYTEST_PARENT_UNSEEDED` (STATUS ✅ CLOSED still says playtest owed, no covering card). (2) AGENTS.md done-line requires the BACKLOG row + `npm run playtest:console`. (3) `post-merge` / `post-checkout` / `post-rewrite` rebuild the gitignored console after pull, because post-commit only runs on a local commit. Also seeded the missing CARGO-BAY-INSTANCE-PT-1/2/3 cards so the new gate stays green on today's tree.

---

### August 12, 2026 — CONN-TRACK-LEAK-1: release platform-dead IP tracking before the connection cap

- *(Engineering · correctness)* **CONN-TRACK-LEAK-1** — ✅ **CLOSED 08-12.** The zombie-prune path in `party/index.ts` deleted a conn from `#connections` without releasing its IP-cap count, and the ghost-exorcism path never dropped `#rateLimitWindows`. Five leaked counts on one IP then rejected the only connection that could trigger cleanup — a permanent lockout. Fix: `#forgetConnectionTracking()` consolidates the five teardown paths (onClose, silent reap, stale picker, ghost exorcism, pre-cap prune); `#prunePlatformDeadTracking()` runs before the cap decision and releases tracking for any conn the platform no longer lists (iterating `#connToIp`, not `#connections`). Test seam `setPlatformLiveIdsOverride` fakes a platform-dead socket; the deterministic test proves 5 stale counts → first live join accepted → 6th live join still 4029, and it fails without the fix. Deployed `5ae6f69b`; zero-404 clean; live cap probe PASS. Commit `9439cd2`. Nine deferred findings filed to BACKLOG (CONN-DEADCODE-1 … PARTY-ENVTYPE-1). Wyatt PASSed same-clientId reconnect; **CONN-TRACK-LEAK-PT-1** remains open for host-leave migration.

---

### August 12, 2026 — STORE-1: collapse gameState / gameStore

- *(Tech Debt · Medium)* **STORE-1** — ✅ **CLOSED 08-12.** Deleted `src/gameState.js`. Named command functions (`addScore`, `syncRoundPhase`, `pickTimerWinner`, …) live on `src/stores/gameStore.js`. Unused store methods `startRunning` / `startCountdown` / `endRound` removed (zero callers; live path stays `roundLifecycle.startRunningAt`). One module, one import path. Call bodies unchanged. Lock: `tests/storeImportLock.test.js`. Commits: `54f15a9` (Lever A) + Lever B this commit.

---

### August 12, 2026 — DEV-GRAPH-2 CLOSED LOCAL: all-DeepSeek plan graph

- *(Tech Debt · Medium)* **DEV-GRAPH-2** — ✅ **CLOSED LOCAL 08-12.** Commits `7264ea6`,
  `9802bbe`, and `116568d` bind one fixed plan-only DeepSeek maker and one fixed read-only
  DeepSeek checker to the fail-closed graph. The first live isolated trace
  `92e87f37b9684307bd9966d13a7918d3` bound `b3fc391`: maker completed in 11 turns with zero
  tool errors; checker completed in 7 turns with zero tool errors and `APPROVE`; the exact
  `ack DEV-GRAPH-2` reached `complete` and released the graph lock. Receipts bind the card,
  HEAD, baseline, model, maker result, plan, checker request, and checker result SHA-256 digests.
  Focused control-plane tests passed **30/30** and `npm run qa` passed all **7** gates before the
  trace. No graph stage edited source, committed, pushed, deployed, or claimed a player playtest
  PASS. This closure is local and unpushed; no deployment or player playtest was needed.

---

### August 12, 2026 — PROBE-WARM-RT-1 + PERF-TIER-1 CLOSED: VFX program-anchor RT-variant cache miss + high-lite tier

- *(Engineering / Perf · Medium)* **PROBE-WARM-RT-1** — ✅ **CLOSED 08-12.** Hypothesis confirmed: `renderer.compileAsync` bound no RT during VFX anchor warmup, so three.js built program cache keys with `renderer.outputColorSpace` (null-RT path). Composer later bound RTs → `ColorManagement.workingColorSpace` for `outputColorSpace` → cache miss on first KO → synchronous shader link mid-round. Fix (L2): bind 1×1 scratch `WebGLRenderTarget` around anchor install + compileAsync, restore original RT in finally. Instrument (L1): `warmupSettle` event + F8 perf probe both carry `programs` count for baseline vs mid-round comparison. Playtest PASS on prod `0dcca0f`: programs count stable across first KO, no mid-round `warmupCompile` events. Commits: `a4e59e2` + `0dcca0f`.

- *(Engineering / Perf · Medium)* **PERF-TIER-1** — ✅ **CLOSED 08-12.** Added `high-lite` quality tier (same personality as `high` minus DPR-invariant reflector, DPR cap 1.5). Added `discrete-mid` GPU class with narrow allow-list (GTX 1060/1070/1660, RTX 3050/4050, RX 5500–6600 non-XT, Arc A3xx/A5xx/A730) mapping to `high-lite`. Conservative: 1080/2060/3060/4060/Arc A770 stay discrete/high. Auto-quality step chain: high→high-lite→medium→low (MAX_STEPS 3). Playtest PASS on prod `e8421dd` + `54cbc6e`: high-lite boots correctly, reflector absent, quality menu shows 4 options. Commits: `e8421dd` (Wave A) + `54cbc6e` (Wave B).

---

### August 12, 2026 — CUSTOMIZE-PERF-1 CLOSED: Customize screen performance pass

- *(Engineering / Perf · Medium)* **CUSTOMIZE-PERF-1** — ✅ **CLOSED 08-12.** Empirical F8 measurement pass (`cap-353` through `cap-356`) on discrete RTX 4090 GPU confirmed sub-millisecond 3D preview render overhead (**0.3–0.5 ms** per frame), 0ms post-boot longtasks, zero frame drops, and stable memory (47.7 MB heap, 77 programs asynchronously compiled in 19 ms). Closed as *measured, healthy, no action needed*. Findings documented in [customize-perf-1-findings.md](./customize-perf-1-findings.md).

---


### August 11, 2026 — LOOP-SAFETY-2 CLOSED LOCAL: fail-closed maker boundary

- *(Tech Debt · Medium)* **LOOP-SAFETY-2** — ✅ **CLOSED LOCAL 08-11.** Commits `aa248cb`,
  `8c69399`, `7be3817`, and `d02a733` replace model-provided PowerShell with four fixed
  host-defined read-only operations, reject all others before process spawn, and use no shell.
  Loop and graph artifacts now write atomically to per-run paths; the latest pointer binds the
  matching result path and run ID. A Windows file-lock failure added a bounded 0.75 s retry,
  temporary cleanup, and ignore coverage without weakening the fail-closed outcome. Focused
  control-plane tests passed **17/17**; `npm run qa` passed all **7** gates. Five clean maker-only,
  plan-only dry runs completed with matching artifacts and unchanged Git baselines: `20260811T203618Z-8a80d85bbe`,
  `20260811T204337Z-22b237346b`, `20260811T205348Z-56c5179a99`, `20260811T215526Z-da438e303a`,
  and `20260812T004408Z-f042704f79`. **DEV-GRAPH-2 is eligible for a new plan; no maker/reviewer
  stage was connected.** This closure is local and unpushed; no deployment or player playtest was needed.

---

### August 11, 2026 — DEV-GRAPH-1 CLOSED: fail-closed plan workflow ledger

- *(Tech Debt · Medium)* **DEV-GRAPH-1** — ✅ **CLOSED 08-11.** Commit `fa7ada0` is on
  `origin/cart-clash`. The model-free graph owns a clean-worktree preflight, persistent lock,
  review artifact bound to the plan SHA-256, host-only exact `ack DEV-GRAPH-1`, and synthetic
  traces. It has no model node, model-provided command, source-edit, commit, deploy, or
  player-playtest node. **LOOP-SAFETY-2 owns all command capability and per-run atomic
  artifacts.** No production deployment or player playtest was needed.

---

### August 11, 2026 — NIGHT-SHIFT-CITY-1 CLOSED FOR NOW: temporary visual baseline

- *(Art · High)* **NIGHT-SHIFT-CITY-1** — ⏸️ **CLOSED FOR NOW 08-11** per Wyatt. This is an
  accepted temporary baseline, not a visual PASS. Wyatt judged the final local result
  unsuccessful and stopped further polish. The retained work includes the approved square-roof
  blockout and four AC launchers, the city base and fixed facade lights (`282c7e2`), the distant
  telecom mast (`46e47ec`), subtle dish and beacon life (`4c3848d`), damp-smoothing correction
  (`bf2c088`), and Full-only roof dressing (`ae23749`). The final handoff is `e3dd24a`. No new
  colliders were added. Architecture uses 9 Low / 15 Full draw calls; the mast uses 2,112 Low /
  2,916 Full triangles. Focused tests passed 11/11; typecheck and build passed. Full QA reached
  1,883 passed / 1 known unrelated backlog-row canary failure. **Not pushed, deployed, shipped,
  renamed, or approved as final art.** A future pass needs new direction and a new card.

---

### August 11, 2026 — NIGHT-SHIFT-BLOCKOUT-1 CLOSED PASS: playable rooftop blockout

- *(Level design · Medium)* **NIGHT-SHIFT-BLOCKOUT-1** — ✅ **CLOSED PASS 08-11**
  per Wyatt; local only and explicitly not shipped. Commits `554de9b` through `ee15955`
  create one stationary square rooftop, four supported diagonal corner spawn platforms that
  face center, two lateral raised landing roofs, matching Rapier colliders, and four instant
  AC launchers. West/east route units launch toward their matching raised roofs; north/south
  units launch straight up with stronger force. Host-only fixed-step activation, per-unit
  cooldowns, and exit latches prevent repeated firing while a cart remains on a unit. Wyatt
  passed the final layout, spawn direction, launch behavior, and wider landing-roof spacing in
  Solo Dev. Focused Night Shift tests passed 14/14; full QA passed 7/7 with 1,873 tests; the
  production build passed. Final AC models, wind VFX, audio, menu card, progression, ambience,
  and quickplay remain separate future work. **Not pushed or deployed**, by explicit request.

---

### August 11, 2026 — CARGO-LATCH-1 / CARGO-LATCH-PT-1 CLOSED: latch fix playtest PASS

- *(Engineering · Low)* **CARGO-LATCH-1** — ✅ **CLOSED 08-11.** Fix `a20d547` deployed `7569051`.
  `shiftCargoLatchBy(deltaMs)` added to `src/cargoLoad.js`, called beside every
  `shiftDirectiveTimersBy(delta)` in `roundLifecycle.js` (solo pause) and `gameBoot.js`
  (host tab-return), with coverage in `tests/cargoLoad.test.js`. Prevents re-fired
  `cart_overflow` callout after pause/tab-return.
- *(Playtest)* **CARGO-LATCH-PT-1** — ✅ **PASS 08-11.** Solo pause + host tab-return at
  boss fill: no repeat overflow callout. Steps 1–3 all passed.

- *(Art · Low)* **BOOTH-RAIL-COL-1** — 🚫 **CLOSED 08-11 per Wyatt.** Will not fix.

- *(Art · Low)* **SUNDIAL-LOW-WATER-1** — ✅ **PASS 08-11.** Ungated `buildWaterNormalTexture()`
  from `!lowQ` in `zanzibarPlatform.js`. Low tier ocean now has ripple normal map.
  Deployed `6e63efcd`. Perf check on Intel UHD min-spec: PASS.

- *(UI/UX · Low)* **UI-SCALE-P2-MEDIA-1** — ✅ **PASS 08-11.** Breakpoints reconciled to
  380/768/1024/1025 contract (`bf2dde6`), two size-only 380px blocks deleted (`e139bb6`).
  Deployed `b5e1d758`. All breakpoints playtest-PASSed.

- *(UI/UX · Low)* **ORIENT-HINT-SCROLL-1** — ✅ **PASS 08-11.** Added `padding-bottom: 56px`
  in portrait-hint's landscape/coarse/≤480 band (`cf54119`). Deployed `b5e1d758`.
  740×360 coarse landscape scroll-to-bottom: PASS.

- *(Engineering · High)* **NPC-BOOST-2** — ✅ **CLOSED 08-11.** Charge visibility + audio
  confirmed working on prod. Repair commits `3d1e263` / `544f4b5`; deployed `7569051`.
  Follow-up (`dec9a66`) replaced charge cancel with proportional early-release:
  `minTargetDistance` 3.0, `finisherEdgeBiasMin` 0.35, NPC releases instead of cancels
  when conditions turn unsafe. Deployed `e917da49`.

- *(Playtest)* **NPC-BOOST-2-PT-1** — ✅ **PASS 08-11.** All four steps passed. NPC
  charged boosts visible and audible across difficulties, Friends sync verified,
  unsafe charges cancel / unsafe instants skip correctly, zero boost self-KOs.

- *(Engineering · Medium)* **NPC-BOOST-1** — ✅ **CLOSED 08-11.** Initial NPC charged
  boost feature (`033bb8f`). Superseded by NPC-BOOST-2 which now fully passes.
  Easy 10% slower decisions (`4e47e16`) shipped alongside.

- *(Engineering · Medium)* **AI-EASY-SOFTEN-1** — ✅ **CLOSED 08-11.** Easy NPC
  decision intervals 1.44× → 1.584× (10% slower). Deployed with NPC-BOOST-1.
  Closure tracked by NPC-BOOST-2-PT-1 PASS.

### August 10, 2026 — CAPTURE-RING-LIMIT-1 PASS: proportionate beacon limits

- *(Engineering · Low)* **CAPTURE-RING-LIMIT-1** — ✅ **CLOSED 08-10** (desk-only, verdict in
  diff/test). The accepted beacon budget no longer dwarfs the rings it feeds. **Capture ring
  (`captureLog.ts`) 80 → 400** — ~13 min of capture depth at the accepted rate, was ~2.7 min.
  **Analytics POSTs capped at `ANALYTICS_MAX_PER_WINDOW = 5/60s` per IP** (new
  `party/constants.ts`; `analyticsLog.ts` passes it to the existing beacon limiter) — with
  `MAX_EVENTS_PER_BATCH = 50` the per-IP fabrication budget drops 6×, and the 20k-row
  analytics ring now cycles in ~80 min at the cap instead of ~13 min. Legit clients never get
  close: analytics flushes at 20 events / 30 s idle — "explicitly NOT continuous telemetry."
  Tests: new "caps analytics POSTs at ANALYTICS_MAX_PER_WINDOW per ip" case in
  [beacons.test.js](../../tests/party-do/beacons.test.js); `npm run qa` green. Not
  player-visible; the prod smoke check (beacon lands, 429 works) rides the next ship. One
  constraint respected: analytics rows still never store IP.

---

### August 10, 2026 — MENU-SFX-1 CLOSED: main-menu SFX slider (absorbed)

- *(UI / UX · Low)* **MENU-SFX-1** — ✅ **CLOSED 08-10 as shipped**. Intent (a working SFX
  volume slider in the menu) already shipped under the audio-controls extraction and the
  VOICE-BUS-1 volume-bus work: `src/ui/audioControls.js` owns the SFX bus
  (`setSfxSliderVolume` → `audioStore.sfxVolume`), and the menu Settings overlay
  (`src/ui/cart-rave-menu.js` — `cr-settings-sfx-track`, `syncSettingsAudioUi`) wires a live
  SFX slider next to MUSIC and VOICE, palette-secondary accent. No commit ever cited the ID —
  caught 08-10 while closing out stale backlog rows. BACKLOG row + Work-order lines deleted;
  ID on the do-not-reopen list.

---

### August 10, 2026 — DEPLOY-MAP-1 PASS: three-lane deploy map (no CF split)

- *(Engineering · Low)* **DEPLOY-MAP-1** — ✅ **CLOSED 08-10**. Locked lanes: local =
  daily test (`dev:local`); Cloudflare `npm run ship` / “ship it” = public
  (`cartclash.lol` + same-Worker `workers.dev` twin); Glitch `npm run ship:glitch` /
  “ship glitch” only after prod is good. No wrangler env split. Guide:
  [deploy-urls.md](../guides/deploy-urls.md). Glitch version default now reads
  `GLITCH_GAME_VERSION` (stops `0.8.4` drift).

---

### August 10, 2026 — DEV-LOOP-1 PASS: Vite warmup paths + DEV idle-warm delay

- *(Engineering · Medium)* **DEV-LOOP-1** — ✅ **CLOSED PASS 08-10** (Wyatt visible-Chrome
  playtest). Wave 0 showed menu `menu-ready` is fast once Vite is warm (~0.3–1.3s); the long
  Solo wait is cold world bootstrap when idle warm did not run first (~8.2s
  `play-entry`→`carts-ready`). Wave 1: fixed stale Vite `server.warmup` paths after the menu
  move to `src/ui/` (`vite.config.js`), and shortened `IDLE_WARM_DELAY_MS` to **600 in DEV**
  only (`src/bootstrap.js`; prod stays 1800). Idle warm work itself unchanged. Residual:
  Solo still pays full world cost if you click before warm finishes, or in a hidden tab.

---

### August 10, 2026 — FRIENDS-JOIN-LAYOUT-1 PASS: room-code controls below CART NAME

- *(UI / UX · Low)* **FRIENDS-JOIN-LAYOUT-1** — ✅ **CLOSED PASS 08-10** (layout
  `6301ca1`, GO badge style `6b02e54`, Wyatt production visual PASS on build `f513d84`).
  The existing room-code input, GO button, and inline error now sit directly below the cart-name
  panel in desktop and stacked mobile order. The desktop right rail reserves a flexible slot for
  the cart preview: it stays visible without intersection at 1440×900 and releases the canvas
  below its 240×180 mount gate at 1280×720 instead of overlapping the join or context controls.
  The GO button now uses the same magenta, ink, Russo One, and heavy-label treatment as the NEW
  badge beside CHALLENGES. Local browser coverage passed at 1440×900, 1280×720, 390×844, and
  740×360, including invalid-code error expansion. Focused tests passed 13/13; full QA passed
  7/7 on the deployed HEAD; production HTML and all 25 referenced hashed assets returned 200.
  Join behavior and netcode did not change.

---

### August 9, 2026 — ONBOARD-ART-1 PASS: HOW TO PLAY gameplay art

- *(UI/UX · Medium)* **ONBOARD-ART-1** — ✅ **CLOSED PASS 08-09** (asset commit `e1717e4`,
  not deployed). Added `drive`, `boost`, `ram`, `hud`, and `cargo` animated WebPs plus
  reduced-motion stills under `src/assets/howto/`; every asset stays under the ~400 KB budget.
  `npm run build` passed and the focused onboarding test passed 16/16. Wyatt accepted the
  current HUD capture with AISLE 4 callouts left hidden because it does not show a reliable
  cargo-bay target; this closure does not claim `data-callouts="aimed"`.

---

### August 9, 2026 — ANLX-GEO-1 PASS: geo, returning sessions, ttFirstMatch + rollups

- *(Engineering · Medium)* **ANLX-GEO-1** — ✅ **CLOSED PASS 08-09** (code `d18568a`, geo-header
  fix `30a8151`). Production analytics got coarse CF geo, returning-session detection,
  time-to-first-match, and summary rollups. **Worker → DO:** `beaconHeaders` forwards CF
  country/region as `cf-ipcountry` / `cf-region-code` (skips `XX` / `T1`, never the raw IP);
  `analyticsLog.#ingest` merges server-side country (2) + region (6) into event props so the
  browser can never spoof them. **Insights:** `session_start` gains `returning` (client already
  had a prior session_start in the ring), and the summary adds `byCountry` / `byRegion` /
  `avgSessionMs` / `returningSessions` rollups. **Client:** `referrerHost` (hostname-only
  arrival channel, "direct" fallback) on `session_start`, and `ttFirstMatchMs` on the first
  `match_started` per load. Tests: `analyticsGeoInsights.test.js`,
  `tests/pullAnalytics.test.js`, `beaconClient.js`. **Not deployed** — pushed only.

---

### August 9, 2026 — ANLX-PAGEHOST-1 PASS: pageHost stamp + cartclash.lol host wiring

- *(Engineering · Medium)* **ANLX-PAGEHOST-1** — ✅ **CLOSED PASS 08-09** (code `b6de16e`).
  Analytics events are now stamped with `pageHost` (`location.hostname`) at flush, so staging
  (workers.dev) vs public (cartclash.lol) traffic is separable in list view without a DO schema
  change (summaries ignore it; prove with `analytics:pull --list`). OG/twitter meta and the
  preconnect moved to `cartclash.lol`; `WORKER_PAGE_HOSTS` added to `config.js`
  (`cart-rave.wyabro.workers.dev` · `cartclash.lol` · `www.cartclash.lol`) and PartySocket
  uses the page host for same-origin WS when on those hosts. Tests: `analytics.test.js`.
  **Not deployed** — pushed only. Related: BRAND-1 domain cutover stays frozen; this wires the
  host list ahead of it.

---

### August 9, 2026 — ANLX-GLITCH-1 PASS: Glitch festival analytics bridge

- *(Engineering · Medium)* **ANLX-GLITCH-1** — ✅ **CLOSED PASS 08-09** (code `df8da00`).
  Optional Glitch-festival `GameAnalyticsTracker` bridge, loaded from `index.html`; pageviews
  are automatic, custom actions feed the dashboard. `trackGlitchEvent` no-ops until the script
  loads, never throws into gameplay, and respects the analytics opt-out. Wired to:
  `session_start` / `session_end` (engagement), `match_started` / `match_ended` (gameplay,
  with result), `player_quit` (pagehide + menu-exit), `unlock_earned`, `challenge_completed`,
  `menu_click` (main menu CTAs + invite-banner join), and `invite_copy` (lobby). Tests:
  `analytics.test.js`. **Not deployed** — pushed only.

---

### August 9, 2026 — SHADES-ZOOM-1 PASS: sunglasses tab camera settle

- *(UI · Low)* **SHADES-ZOOM-1** — ✅ **CLOSED PASS 08-09** (Wyatt visual PASS). The customize
  sunglasses tab now eases the intentional 1.0× ↔ 1.35× camera change over 240 ms with a
  restrained cubic settle, reverses from the current position on rapid tab changes, and snaps
  for `prefers-reduced-motion`. Cart scale, rotation behavior, and gameplay stay unchanged.
  Regression coverage is in `tests/cartPreviewZoom.test.js`; focused tests, typecheck, build,
  knip, briefing, architecture, and health checks passed. The full QA battery also exposed and
  cleared the existing five-token `STATUS.md` budget overage before shipping.

---

### August 9, 2026 — Playtest export PASS: deferred chunks, menu swap, and audio

- *(Tech Debt · Low)* **CHUNK-DEFER-1** — ✅ **CLOSED PASS 08-09** (Wyatt playtest export
  generated at `df8da00`). Both human path checks passed: cold menu/Solo/Customize/harness entry
  paths stayed live, and invite/Friends still formed a playable P2P round after the dynamic
  import. No new residual was reported, so the parent engineering row closes with its two owed
  playtest cards.
- *(Playtest · Medium)* **CHUNK-DEFER-PT-1** — ✅ **CLOSED PASS 08-09**. Cold menu, Solo,
  Customize, and harness entry paths passed without a blank frame or module-load error.
- *(Playtest · Medium)* **CHUNK-DEFER-PT-2** — ✅ **CLOSED PASS 08-09**. Invite join, Friends
  lobby/round drive, KO feed, and hit FX passed after netcode defer.
- *(Playtest · Medium)* **MENU-SWAP-FLASH-1** — ✅ **CLOSED PASS 08-09**. All three arena
  pages kept the menu chrome stable while the arena changed underneath without a black flash.
- *(Audio · Medium)* **SD-MUSIC-LPF-1** — ✅ **CLOSED PASS 08-09**. Sudden Death music
  muffled and restored correctly; the tension drone, red ambience, announcer sting, and the
  Android/desktop versus iOS routing behavior passed the export steps.
- *(Audio · Low)* **VOICE-BUS-1** — ✅ **CLOSED PASS 08-09**. The VOICE slider persisted,
  controlled announcer takes and stings independently from SFX, and reached a silent PA at zero
  without muting unrelated SFX.

---

### August 9, 2026 — PATTERNS-UI-1 PASS: pattern customize UI verified on the re-UV'd body

- *(UI · Medium · SHIP-1 C3)* **PATTERNS-UI-1** — ✅ **CLOSED PASS 08-09** (local dev PASS on
  the CART-MODEL-1 precedent; not deployed — the re-UV'd GLB rides the next ship). The pattern
  customize UI (PATTERN tab, six chips, 3D preview sync, persistence, unlock gates, network
  sync) was already built inside earlier waves; this card was the first visual validation on the
  clean `TEXCOORD_1` UV plus regression guards. Verified on `npm run dev:local` (visible
  foreground tab, canvas live): all six patterns (classic/stripes/checker/dots/waves/bolt) read
  as clean geometry on the body; each non-classic chip changed the cart-region pixels vs classic
  (stripes 2.5% · checker 5.6% · dots 5.4% · waves 6.0% · bolt 5.4%); classic clears the mask;
  albedo + neon wire-glow unchanged; selection persists across reload. Locked-gate path under
  `?devUnlocks=off`: gated chips show lock + hint, a locked click toasts ("Locked — 10 KOs
  (0/10)") and does not apply or persist. Landed a regression seam (`tests/patternSeam.test.js`)
  guarding `TEXCOORD_1` survival on both GLBs (the `prune`-strips-`uv1` trap) and registry
  coherence across `CART_PATTERN_IDS` / `CART_PATTERNS` / `PATTERN_UNLOCKS`, and fixed two stale
  "patterns are not networked yet" comments (false since NET-LOOK-ACC-1). QA 7/7 (159 files /
  1,825 tests). Evidence: `.diag-captures/patterns/`.

---

### August 9, 2026 — SHADES-MAT-1 PASS: solid frames and rainbow lens materials

- *(Art · Low · SHIP-1 E2)* **SHADES-MAT-1** — ✅ **CLOSED PASS 08-09** (local code,
  production build, and QA 7/7; not deployed). Split the one-piece visor into runtime frame
  and lens material groups. Each style now has a solid coordinated frame colour, while the
  lens keeps its procedural rainbow mirror gradient; Silver ends in black. The six menu labels
  are now **Silver**, **Gold**, **Blue**, **Red**, **Green**, and **Purple**; stable style IDs
  still use their existing `*Mirror` names. Contract coverage checks the split, frame colours,
  menu labels, and Silver gradient. Wyatt accepted the local result; no production visual
  playtest was requested.

---

### August 9, 2026 — CART-MODEL-1 PASS: repaired basket and tapered visor sides

- *(Art · High · SHIP-1 C1)* **CART-MODEL-1** — ✅ **CLOSED PASS 08-09** (model fix
  `9c176ae`; Wyatt local dev-build PASS; not deployed). Repaired `tripo_part_0` after the
  replacement sunglasses exposed damaged surfaces from the old glasses. Used `art/reee.blend`
  only as a high-poly shape reference. Removed the old glasses pieces, kept two UV channels,
  restored a clean body-colour surface behind the sunglasses, nose, and smile, and closed the
  side and rear gaps. The last correction tapered only 442 side-pocket Y positions. The accepted
  centre vertices, faces, and UVs stayed unchanged, so the smile stayed clean and the square side
  tabs disappeared. Front, side, and rear local views passed. Structure, build, and QA 7/7 passed
  (156 files / 1,814 tests). **ART-MAT-1** remains absorbed here. The completed re-UV unblocks
  **PATTERNS-UI-1**.

---

### August 8, 2026 — KILLFEED-PHONE-1 PASS: touch kill feed clear of stage and directive

- *(UI / UX · Medium)* **KILLFEED-PHONE-1** — ✅ **CLOSED PASS 08-08** (code `f6205a2`; docs
  close `a47060a`; Worker `2e3e4b40`; Wyatt phone PASS). Filed 08-06 from UI-P2-HUD-PT-1
  ("awkward and overlappy on my phone") —
  pre-existing layout, not a rem-conversion regression. **Desk repro** (Playwright
  `hasTouch`+`isMobile` on `.hud-touch`): portrait 390×844 feed rect intersected center stage;
  landscape short touch max-width stayed **260** because the main `#hud.hud-touch` block was
  declared *after* the landscape media and clobbered `min(40vw, 220px)` / landscape `--hud-feed-top`.
  Not wrap, not enter overshoot, not COLOR-ID glyphs (those landed 08-07 after the filing).
  **Lever (`hud.css` only):** park touch `--hud-feed-top` at `clamp(110px, 15dvh, 128px)` under
  the Living Store directive band; touch stage `21dvh → 23dvh` so a 2-row receipt fits between
  directive and stage; re-assert landscape-short touch feed overrides after the main touch block.
  Measured after: gap directive ~4.9px, stage ~13px, all chrome hits false; landscape max-width
  220. No widen, no glyph hide.

---

### August 8, 2026 — CART-FORK-SWIVEL-1 PASS: rear-left fork piece steers with its caster

- *(Art · Low)* **CART-FORK-SWIVEL-1** — ✅ **CLOSED PASS 08-08** (code `9b0da20`; docs close
  `59fed1a`; Worker `93e78ffb`; Wyatt local steer PASS, then ship). Split out of closed **CART-FORK-1** (role-only): `tripo_part_23` was
  already roled `fork` but sat in **no** `RAVE_GLTF_V4_FORK_GROUPS` entry, so it stayed model-static
  while its caster swiveled. Mirror twin `tripo_part_22` was already in BR `forkParts`. Lever:
  BL `forkParts` → `["tripo_part_5", "tripo_part_21", "tripo_part_23"]` in
  [cartRaveGltf.js](../../src/cartRaveGltf.js). Source pin in `tests/cartForkRole.test.js` (membership
  + twin corners). Attract path does not exercise caster swivel — verified by live match steer.
  Kingpin side-effect (all listed fork tops re-score attach) checked at playtest: no crooked BL rest
  vs BR.

---

### August 8, 2026 — UI-FRAME-1 + ESC-PANEL-1 closed: absorbed by Fight Night + RESULTS-1

- *(UI / UX · Medium)* **UI-FRAME-1** — ✅ **CLOSED 08-08 — absorbed.** "Premium frame/panel
  styling pass" shipped under the Fight Night redesign (3a menu · 6a HUD · 7a–7g; shared overlay
  shell → slab material, `87790dc`; handover
  [fight-night-ui-handover.md](./fight-night-ui-handover.md)) and RESULTS-1. Every panel surface
  now draws one recipe from `tokens.css` (slab-shadow + hairline `--border-white-10` +
  `--radius-panel` over `rgba(12,10,17,0.85)`), and the legacy die-cut sticker-panel material is
  retired by design. No commit in history ever cited this ID.
- *(UI / UX · Medium)* **ESC-PANEL-1** — ✅ **CLOSED 08-08 — absorbed.** The ESC panel was
  re-laid-out to mock 7f across the fight-night series (`2192461` "part 3g — pause overlay
  re-layout (7f)", `c5be94f` "7f — PAUSE re-laid out to the mock", plus three fix rounds; three
  Wyatt review rounds recorded in the handover). Its "scoring panel" premise no longer exists by
  design: the scoring chart was deleted from the pause overlay ("Deleted, not hidden",
  `pauseOverlay.css:457`) and now lives on HOW TO PLAY AISLE 7 (7d). **Named residual:** a paused
  player cannot read standings (HUD is suppressed; 7f deliberately dropped the chart) — a mock
  decision, not a bug; file a fresh card only if Wyatt ever wants it back.

---

### August 8, 2026 — ARENA-BUMPER-HINT-1 PASS: LB/RB pages menu arena

- *(UI / UX · Medium)* **ARENA-BUMPER-HINT-1** — ✅ **CLOSED PASS 08-08** (code `2b7b872`;
  deployed Worker version `547bcecc-9e8e-4d33-baf7-f65533f11efa`; Wyatt production PASS).
  **Product call:** wire (not drop) — the gamepad hint already advertised `LB / RB — ARENA`
  while nothing read `buttons[4]`/`[5]`. **Lever (`src/ui/gamepadNav.js` only):** rising-edge
  LB/RB → synthetic pointerdown/up/click on `#cr-arena-prev` / `#cr-arena-next` when nav scope
  is the document (no overlay), the pager button is `isElementVisible`, and focus is not a typing
  target; `setInputMode("gamepad")` includes bumpers so the nav loop is self-sufficient. Hint
  copy unchanged. Reuses the menu's existing `pageArena` handlers via the pager buttons
  (closure-private — no new export). Tests: `gamepadNav.test.js` +8 (edge, hold, overlay,
  non-SOLO via inline `display:none` for happy-dom polyfill, mode flip, focus stay). QA 7/7.
  Post-deploy: hashed assets 0×404; live `errorReporter-*.js` carries `cr-arena-prev` +
  `PointerEvent` + `lb` edge.

---

### August 8, 2026 — PAD-MENU-1 PASS: controller menu navigation polish

- *(UI / UX · Medium)* **PAD-MENU-1** — ✅ **CLOSED PASS 08-08** (commits `674d84d`, `c984bea`,
  `a14640a`, `42fe305`, `1213ce9`; Wyatt pad-in-hand PASS). Modal scoping had shipped 07-20; this
  card closed the four polish levers left after it. **L1** — text-typing controls and the whole
  `#cr-join` row (room-code input + GO) are out of `getFocusables`, so d-pad down past FRIENDS
  lands on CUSTOMIZE on both pad and keyboard (they share the engine), and the ring can no longer
  sit on a field a pad can't type into. **L1b** — bare `input[type=range]` nudges like the
  `role="slider"` tracks (d-pad left/right adjusts the value instead of navigating away), plus a
  real keydown handler on the customize hue slider (untrusted events don't trigger native range
  stepping; `e.isTrusted` guard keeps real keyboard on the native path). **L2** — idle re-seed
  after a chip rebuild: when `innerHTML` in `build*Chips()` destroys the focused node and the
  browser parks focus on body/html, the next idle frame restores the ring to the row's
  `[aria-checked="true"]` chip (or clamped `navIndex`), gated on the ring node being
  **disconnected** — so a mouse click on empty chrome and the name-edit input are never stolen
  from (regression for the old focus-steal bug, pinned by test). **L3** — all four `.cr-screen-hint`
  rows author keyboard + gamepad copy (`data-hint-kb` / `data-hint-pad`, default kb) and flip via
  `updateScreenHints()` on the same `onInputModeChange` hook as `updateHintBar`; pad dialect
  matches the main bar (D-PAD / Ⓐ / Ⓑ). Tests: `gamepadNav.test.js` 18 → 25 (join row skipped on
  pad and keyboard, visible text input not a nav stop, hue range nudges, chip-rebuild re-seed with
  no eaten press, `aria-checked` preference over out-of-range index, empty-chrome no-steal) + new
  `padMenuHints.test.js`. QA 7/7. **Not this card:** ring-vs-`.is-selected` alignment on non-command
  controls (mute / name ✎ / arena ◂▸ — pre-existing, out of scope), and the main bar's `LB / RB
  ARENA` hint lie (`ARENA-BUMPER-HINT-1`).

---

### August 8, 2026 — CART-COLOR-DEPTH-1 HARD-CLOSED: no signed visual target

- *(Art · Medium)* **CART-COLOR-DEPTH-1** — **HARD-CLOSED 08-08 at Wyatt's direction.** The
  palette is intentionally not being reopened without new player evidence. Existing committed
  treatment remains (`3529221`: deeper resting body base; `b69c7ba`: patterned-valley lift), but
  this definition session produced no human resting-colour PASS and no deployment. A proposed
  15% retune was discarded before commit. Reopen only with a concrete player-visible target and
  a valid idle-cart capture; do not treat this closure as colour sign-off.

---

### August 8, 2026 — MENU-CART-1 PASS: desktop menu cart showroom

- *(Engineering · Medium)* **MENU-CART-1** — ✅ **CLOSED PASS 08-08** (commits `5a9c0bb`,
  `9ba930b`, `dbf8612`; deployed Worker version
  `032847e4-ccbd-4322-8d55-4a30c82c8130`; Wyatt production PASS). Medium and High desktop menus
  now render the player's cart right-middle through the existing menu-attract renderer: one GL
  context, no second loader or rAF. The shared `CartPreview` presentation retains the Sunglasses
  hero pose, syncs cosmetics after Customize, and suspends while Customize owns its preview.
  Low, mobile, narrow, and short desktop layouts omit it; reduced motion omits the 16-second
  showroom ram-feint. The feint rolls the wheels/casters, returns exactly to the hero pose, and
  fails closed if the overlay render throws. Tests: `menuAttract`, `menuCartShowcase`, and
  `cartPreviewShowroom`; QA 7/7. Post-deploy: entry plus 16/16 referenced hashed assets returned
  200, and the deployed bundle contained `menuCartComposerTargetNonNull`.

---

### August 8, 2026 — RECORD-MED-1 PASS: Medium Classic floor no longer washes white

- *(Engineering · Medium)* **RECORD-MED-1** — ✅ **CLOSED PASS 08-08** (code `125cdd4`; Wyatt PASS).
  **Symptom:** Medium quality Classic record looked broken vs Low/High — center brand label
  pure white, vinyl plane too hot. **Measured (not the backlog’s first guess):** default
  `?floor=og` body is not a High clearcoat hybrid; root cause was **solid floor + Medium
  postFx/bloom**. Classic shot label mean L ≈198 on Medium vs ≈115 High / ≈114 Medium+nobloom.
  **Lever (`src/arena.js` only):** bloom-safe solid-floor stack (darker base, lower clearcoat);
  dim label tint + lower spindle emissive only on **solid+postFx** (Medium); Low keeps full
  label brightness (composer bypass); `setReflectorVisible` keeps live tier toggles in sync;
  visibility seeded from `getQualityKnobs().reflector`. **Stills:**
  `.diag-captures/record-med-1/classic-*-final.png` — Medium label mean L ≈112 after fix.
  **Not this card:** body High-path retune, `medium.reflector=true`, bloom profile, PERF-PASS-1.

---

### August 8, 2026 — CHUNK-MEMBER-1 CLOSED: membership restore only (not full cold-defer)

**Scope closed here:** restore BUNDLE-1 deferred-module membership after a FREEZE-TELEMETRY-1
re-eager regression. **Not closed here:** dynamic-import of netcode / bootstrap / cartRaveGltf
off the cold menu initial set — filed as successor **CHUNK-DEFER-1** (clean split 08-08).

- *(Tech Debt · Low)* **CHUNK-MEMBER-1** — ✅ **CLOSED 08-08** (L1 `5739659` + test tighten
  `6f5552e`; shipped production version `1fca4410-042d-4a22-85ca-77c65fd55919` on
  `cart-rave.wyabro.workers.dev`). **Root cause:** FREEZE-TELEMETRY-1 (`5469880`, 08-07) made
  eager `gameplayAnalytics.js` static-import deferred `gameLoop.js`, re-eagering ~25 modules
  (+~212 KB over budget; catch-all bloated as `gamepadNav-*`). **Lever:** leaf
  `src/analytics/matchFrameTelemetry.js` (dir prefix → no archMap edit); gameLoop records into
  the leaf; analytics never imports gameLoop; no re-export from gameLoop. **Gates:**
  `size:check --require-dist` green (0 re-eagered; initial set ~1,222 KB under ceiling — no
  rebaseline); full test suite green at L1; post-deploy asset poll CLEAN + telemetry symbol in
  live index/errorReporter chunks. **Process note (not fixed this card):** `npm run qa` does
  **not** run `size:check` (only `release:check` does) — membership can regress under green qa.
  **08-07 config-only abort still true** for remaining eager netcode/cart/bootstrap → **CHUNK-DEFER-1**.
  Tests: `tests/matchFrameTelemetry.test.js` (leaf + import-line source asserts).

---

### August 7, 2026 — SD-MUSIC-LPF-1: Sudden Death music low-pass

Desk work landed (one commit); **Wyatt playtest owed** — row filed under `## Playtest owed`.

- *(Audio · Medium)* **SD-MUSIC-LPF-1** — desk work complete 08-07; playtest owed (BACKLOG
  Playtest owed row). Sudden Death now muffles the music. Music runs as html5-streamed `<audio>`
  elements OUTSIDE the WebAudio graph (2 MB/track; buffered mode = ~40 MB decoded RAM + full
  download before playback), so `duckMusic`'s volume fade cannot do a spectral change — each music
  element is instead routed through a shared `BiquadFilter` via `createMediaElementSource` into
  `Howler.masterGain` ([audioManager.js](../../src/audioManager.js)). Menu + playlist Howls are
  wrapped once at construction (howler creates the pooled element synchronously in the `Howl`
  constructor, so even `preload:false` tracks are covered); a Set guards pooled-element reuse
  (howler returns elements to a shared pool on `unload()`). `setMusicLowPass(active)` glides the
  cutoff 20 kHz → 280 Hz (τ 0.15 s, `setTargetAtTime`, both directions, idempotent), latched on
  the existing SD edge watch in [gameBoot.js](../../src/orchestration/gameBoot.js) `onFrame`
  (runs on every client — host flips `isSuddenDeath` locally, remotes via `host_round`; the same
  edge drives the tension drone). **iOS/WebKit limitation by design:** that graph routing has gone
  silent across several iOS releases (WebKit 203435 / 261668 / 836531), so the filter is skipped
  on Apple/WebKit and SD music stays full-band there rather than risk muted music. Volume paths
  are untouched — element volume/mute apply before the graph, `duckMusic` fades unchanged. Tests:
  `tests/audioManager.test.js` (4 new SD-MUSIC-LPF-1 cases: chain wiring into `masterGain`, ramp
  down, idempotency, Apple gate). `npm run qa` 7/7. Not deployed — ship on Wyatt's instruction.

---

### August 7, 2026 — VOICE-BUS-1: "The Store PA" gets a real VOICE volume bus

Desk work landed (one commit); **Wyatt playtest owed** — row filed under `## Playtest owed`.

- *(Audio · Low)* **VOICE-BUS-1** — desk work complete 08-07; playtest owed (BACKLOG Playtest
  owed row). A third volume category, VOICE, wired end-to-end: store key `cartRaveVoiceVol` +
  `setVoiceVolume` ([audioStore.js](../../src/stores/audioStore.js)); the AudioManager bus
  branches `announcer_*` Howls to `_voiceVol` (construction + live re-apply) and
  `getAudioDebugState` exposes `voiceVol`; announcer stings gate on `getVoiceVolume`; menu
  Settings gains a VOICE row (palette-tertiary accent) and the ESC overlay gains a VOICE slider
  row, both persisted through audioStore. Countdown / kill-confirm / crash/boost/hop stay on
  SFX. Clamp lesson held (store domain 0..1.15, Howler ceiling 1.0 — voice path clamps through
  `howlerVol()`, never divides by `AUDIO_VOLUME_MAX`). Tests: `tests/audioManager.test.js` (3
  new VOICE-BUS-1 cases). announcer + audioMaster suites untouched and green. Not deployed —
  ship on Wyatt's instruction.

---

### August 7, 2026 — LOAD-TIPS-1 PASS: mode-entry subtitle teaches rules

**Wyatt PASS 08-07.** Code `b5f8e3f`. Mode-entry wait is no longer flavor dead air.

- *(UI · Low)* **LOAD-TIPS-1** — ✅ **PASS 08-07** (`b5f8e3f`). Replaced per-theme flavor
  `THEME_COPY.*.messages` with a shared **`LOAD_TIPS`** pool (6 lines) derived from HOW TO PLAY
  aisles 1–3 and 5–7: boost charge, hop, edge KO scoring, combo tiers, PA directives, cargo bay.
  **No SD tip** (win condition is multi-path; name-only would still over-teach). Same subtitle
  node + rotator; random first tip; first swap 1.2s / then 2s (warm floor often never rotates —
  one tip per show is the value); reduced-motion static; dropped `"Starting..."` label that
  stomped the tip on every show. Subtitle CSS: 2-line clamp (instructional lines longer than
  gags). `tools/loadshots.mjs` tip mirror synced (Decision A gate exception). Test:
  [loadingScreenGate.test.js](../../tests/loadingScreenGate.test.js) seeds ∈ `LOAD_TIPS`.
  `npm run qa` 7/7. Not deployed until ship.

---

### August 7, 2026 — SPAWN-SUNDIAL-GAP-1 PASS: closed a day late, and that lateness is the story

**Wyatt PASS 08-07.** Carts no longer wedge between the Sundial spawn booths and the platform.

**The fix shipped 08-06, not 08-07.** `booth.gapDistanceByLevel.zanzibar` went 2.25 → 3.0
(`6ba472b`) → **3.75** (`92c44f2`) — one knob, exactly as the card predicted, moving the booths
and the spawn ring together. Deck edge to first solid leg face is now 3.9 m against a 2.26 m cart.

**Why the row still said "likely one number" a day later** — this is the part worth keeping, and
it is what [BACKLOG-GATE-3](./BACKLOG.md) was built from:

1. Both value bumps landed inside commits titled for a *different* card (`AI-DAY-1 lever 3`,
   `AI-DAY-SELFKO-1: deny NPC boost on bot lip`). The documented staleness check,
   `git log --grep SPAWN-SUNDIAL-GAP-1`, could not see either of them.
2. The one commit that *did* name the id — `c8f65d8`, "bump zanzibar gap to 3.75" — landed 24
   seconds after the real change and contained only `cart-rave-menu.css` and a test. The config
   edit had already been swept into its parent. So the id answered for a diff that did not hold
   its change, and anyone who checked that commit found no fix and left the row open.
3. `health:check`'s backlog gates are all markdown-internal: they compare the file to itself, and
   every one of them fires only *after* an id reaches the closed list. A row whose lever already
   shipped is invisible to all of them by construction.

Net cost: the card was picked up twice — once by a fresh agent that spent a session re-deriving
the octagon geometry before noticing the 3.9 m clearance *was* the fix, and once by Wyatt, who
had to say "we already did this one". `npm run backlog:audit` now reports exactly this shape
(`92c44f2 LEVER \`gapDistanceByLevel\` — AI-DAY-SELFKO-1: deny NPC boost on bot lip`).

**Not reopened:** SPAWN-SUNDIAL-1 (posts stop you — asked and answered 08-02).

---

### August 7, 2026 — HOLE-FRICTION-COMBINE-1 PASS: hole-lip lowFriction finally wins the combine

**Wyatt PASS 08-07** on Lever 1 (`519d905`). Same bug class as WALL-SLIDE-CLASSIC-1 /
STORE-WALL-SLIDE-1, on the **cart** while overhanging the center hole rather than on walls.

- *(Physics · Medium)* **HOLE-FRICTION-COMBINE-1** — ✅ **PASS 08-07** (`519d905`). Rapier defaults
  friction combine to **Average**, so `holeAssist.lowFriction` (0.05) against the deck's 0.8 felt
  like **~0.425**, not 0.05 (~2.2× drop instead of ~22×). **Option B (dynamic):** mode `hole`
  while footprint overhangs with centerHole on — low μ + `FrictionCombineRule.Min`; mode `normal`
  on the annulus, centerHole-off, and every respawn/rematch/SD reset — Average + `CONFIG.cart.friction`.
  Floors never got Min (canaries stay valid). **Unstick** impulse still fires; its μ cut is skipped
  while hole mode owns friction. WASM writes are transition-cached (`cart._frictionMode`).
  **Collider-wide Min while overhanging accepted for v1** (cart–cart on the lip may feel slipperier;
  not a contact-mod / split-collider scope). Tests:
  [holeFrictionCombine.test.js](../../tests/holeFrictionCombine.test.js) (13). `npm run qa` 7/7.
  Not deployed until ship.

---

### August 7, 2026 — Block I desk-only: four cards closed, one commit each

Block I's four desk-only levers, one commit each, no playtest owed — verdict in the diff/test
run. `npm run qa` green by number at wave end (after claiming the new arch file). Commits
`8bc648f`…`cb15b6e` on `cart-clash`. **CARGO-LATCH-1 investigated → REACHABLE** (card stays open;
fix + deploy + production playtest owed as a separate wave — solo pause and host tab-return).
**CHUNK-MEMBER-1** config-only lever ABORTED that day (eager graph); **membership restore
closed 08-08** — residual dynamic-import is **CHUNK-DEFER-1** (see Aug 8 writeup).

- *(Engineering · Low)* **PERF-RENDERINFO-1** — ✅ **CLOSED 08-07** (`8bc648f`). Production F8
  now reads `renderer.info`. New `src/utils/rendererInfo.js` keeps a prod-safe ref
  (`setRendererRef` sets `info.autoReset = false`, never throws); `frameVisuals` resets
  `info.render.*` once per frame at the visual seam before the composer chain so calls/triangles
  accumulate across every pass; `scene.js` registers the renderer unconditionally (prod + dev —
  the DEV-only `__cartRavePerf.renderer` is kept for tooling); `gameplayDiagnostics` per-window
  `callsMax/Mean` + `trianglesMax/Mean` (raw per-frame samples folded, since the seam reset makes
  reads per-frame) plus at-summarize `programs`/`geometries`/`textures`, and the `resources` probe
  now reads the same module ref so prod captures carry memory/programs (previously null). New file
  claimed in the arch map (`tools/lib/archMap.mjs` + regenerated `docs/ARCHITECTURE.json`). Tests:
  `tests/rendererInfo.test.js` (9). Note for a later perf-profile pass: under `?shot`/freeze the
  game loop doesn't run, so a cumulative read is possible — `tools/perf-profile.mjs` (out of this
  wave's scope) may want its own `info.reset()` before measuring.
- *(Engineering · Medium)* **NET-RING-1** — ✅ **CLOSED 08-07** (`85e8f67`). Always-on
  authoritative-ring traffic-quality counters, exposed as `getNetFlowStats().ring`:
  `ringRejectsStaleSource` (`handleP2PMessage` fromConnId≠hostId), `ringRejectsDupSeq` /
  `ringRejectsOooSeq` (split of the old single `seq <= last.seq` reject), `ringRejectsNonFinite`
  (the non-finite guard). All rejects return **before** `netStateBuffer.push`, so counters measure
  garbage arrival, not ring-space margin. Reset at every `hostEpoch += 1` (session teardown /
  reconnect / migration) + `resetNetFlowStats` — deliberately NOT in the per-frame
  `pruneNetStateBufferForEpoch`. Tests: `tests/netRing.test.js` (6) incl. a real
  `applyHostMigration` epoch-reset; netcode + hostMigration suites still 77/77.
- *(Tech Debt · Low)* **AUDIO-MASTER-1** — ✅ **CLOSED 08-07** (`d7066b5`). Deleted the write-only
  `_masterVol` (`audioManager.js`) and dropped `master` from the `restoreVolumeState` API + the one
  boot call site (`main.js`); `applyAllVolumes` already pins `Howler.volume(1)`, so no bus ever
  read it. Zero `_masterVol` references remain in `src/`. Tests: `tests/audioMaster.test.js` (3) —
  source-level `master`-omission asserts + unit restore-identical.
- *(UI/UX · Low)* **STATES-DEAD-1** — ✅ **CLOSED 08-07** (`cb15b6e`). The last four dead
  interactive-state subjects (`.cr-level-btn`, bare `a`/`select`/`[role="button"]`) deleted:
  `.cr-level-btn` hover + designed-ring + reduced-motion members out of `cart-rave-menu.css`
  (base box styles kept — the hidden radiogroup is still the arena data source), `a`/`select`/
  `[role="button"]` out of the `loadingScreen.css` unscoped ring (button+input kept), the 5
  `DECLARED_UNREACHABLE` entries removed from `tools/states.mjs`, and `DESIGNED_FOCUS_RING`
  10 → 9. **`npm run states` re-run by parent:** 256/264 checks; the card's effect verified by the
  inventory (dead subjects gone, all nine ring subjects PASS cyan) — the remaining reds are
  pre-existing and unrelated: the `:is()` parse gap on the ONBOARD-ATTRACT-1 block, the `.cr-reroll`
  glow being overridden by `.cr-plate .cr-plate-btn`, and four reachability zero-match rules
  surfaced now that the family ran to completion (`#cr-solo.is-selected`, `#cr-friends.is-selected`,
  `.cr-arena-page:hover`, `.cr-context .cr-diff-btn:hover`) — candidates for a future cheap-low.

---

### August 7, 2026 — AI-ARENA-SELFKO-1: Sundial + Storerooms unforced bot falls — PASS closed

- *(Design/Gameplay · High)* **AI-ARENA-SELFKO-1** — ✅ **CLOSED PASS 08-07** (`9b2e374` · `fdd47a0`).
  Classic-style self-KO stack ported to the two arenas that still lost bots unforced.
  **L1 Sundial:** TTE panic on `computeOctagonRimStrength` / `applyOctagonRimAvoidance` (max with
  static band, not sum) + null-safe `boostSegmentExitsOctagon` (margin 1.25, bot→target) in
  opportunistic NPC boost. Units: [octagonRimSafety.test.js](../../tests/octagonRimSafety.test.js).
  **L2 Storerooms:** `applySquareHoleAvoidance` takes linvel; radial-from-hole with gutter radial
  0.15 only when diving, lip radial 0.60; opportunistic boost hole margin 0.6 (chase stays 0.04).
  Did **not** retune FEEL-DAY / AI-DAY / AI-DAY-SELFKO-1. Host-sim NPCs in Friends/Quickplay share
  the same path (intended). **PT:** ARENA-SELFKO-PT-1 · ARENA-SELFKO-PT-2 — Wyatt PASS 08-07.

---

### August 7, 2026 — Playtest export: four cards passed

Wyatt's export recorded **4 PASS / 0 FAIL / 1 SKIP**. The four PASS cards are closed; SHARD-PT-2 remains deferred to launch day.

- **COLOR-ID-1** — PASS. The lobby, scoreboard, kill feed, and podium retained distinct per-seat marks. The same playtest also exposed the customized-cart chip mismatch, fixed and deployed in `b9c0daa`.
- **COMBAT-READ-1** — PASS. A full-speed KO has a stronger payoff than an ordinary KO for both players.
- **GAMEPAD-LOBBY-1** — PASS. Controller navigation worked for host and guest Friends-lobby controls without regressing pause, results, or match controls.
- **PACE-KO-1** — PASS. KO confirmation lands below the rim while the existing fall and explosion timing remains intact.

---

### August 7, 2026 — Block H desk-only completion: 12 cards closed, one commit each (7 of Block H + 5 filed 08-06/08-07)

The rest of Block H's desk-only levers plus five earlier-filed desk-only cards, one commit each,
no playtest owed — verdict in the diff/test run. `npm run qa` 7/7 on the whole wave (146 files,
1735 tests). Shipped commits `cae4a35`…`7131f40`; pushed to `origin/cart-clash` 08-07. GAMEPAD-LOBBY-1
is **not** in this close — it deployed (`0365b61`) but still owes its two-PC playtest (see its
UI/UX row).

- *(Engineering · Medium)* **SIM-CALLBACK-FREEZE-1** — ✅ **CLOSED 08-07** (`cae4a35`). The
  `clientSimCallbacks = { ...hostSimCallbacks }` spread in `loopDeps.js` invoked each host getter
  once pre-arena-load and copied the empty result — so a non-host's `recordColliderHandles` /
  `boothColliderHandles` were permanently `[]` and `pitWallColliderHandle` `undefined`, and
  `classifyEnvironmentCollision` fell through to `"floor"` for every pit-wall/booth graze (early
  hop-land detection on non-hosts). Re-declared the four getters on the client bundle instead of
  spreading; `partySocket` stays dead there. Test in
  [simCallbackFreeze.test.js](../../tests/simCallbackFreeze.test.js).
- *(Engineering · Low)* **REMATCH-NULLGUARD-1** — ✅ **CLOSED 08-07** (`5d24436`). Two bare
  `allCartsRef` loops in `rematchResetWorld` (the `for...of` and the `.length` index loop) gained
  the `|| []` guard their sibling loops already had — a rematch racing session teardown no longer
  throws into the game-loop tripwire. Test in [rematchNullguard.test.js](../../tests/rematchNullguard.test.js).
- *(Engineering · Medium)* **CROWD-INSTANCE-RANGE-1** — ✅ **CLOSED 08-07** (`1bca251`). Crowd
  `InstancedMesh` matrices now use `DynamicDrawUsage` + per-frame `addUpdateRange`/`clearUpdateRanges`
  bounded to the mutated batch instead of a full-buffer `needsUpdate` — cuts ~25× over-upload on
  HIGH (≈19MB/s → ~1MB/s of `glBufferSubData`). Test in [crowdInstanceRange.test.js](../../tests/crowdInstanceRange.test.js).
- *(UI/UX · Low)* **PAUSE-CTRL-CHART-1** — ✅ **CLOSED 08-07** (`414afe6`). The pause-overlay
  CONTROLS card froze on the init-time `touchDevice` flag with no gamepad branch; it now
  live-subscribes to the same `onInputModeChange` the main menu uses and renders a real GAMEPAD
  chart (L-STICK/D-PAD move, A/LT boost, B/RT hop, SELECT mute, START menu). Test in
  [pauseCtrlChart.test.js](../../tests/pauseCtrlChart.test.js).
- *(UI/UX · Medium)* **PODIUM-FOCUS-1** — ✅ **CLOSED 08-07** (`2faa829`). `playAgain.disabled =
  !isHost` dropped the control out of gamepadNav's focusables, leaving MAIN MENU as a guest's only
  pad-reachable podium button (A-mash = silent room-leave). Guests now get a focusable-but-inert
  rematch target (`cc-btn--disabled` + `aria-disabled`, guarded `onHostPlayAgainClick` swallows the
  press); host behavior unchanged. Test in [podiumFocus.test.js](../../tests/podiumFocus.test.js).
- *(Art · Low)* **ART-EXPO-DUMP-1** — ✅ **CLOSED 08-07** (`0c1167e`). The postFxDebug config dump
  emitted the retired `toneMappingExposure` key (paste-back was a silent no-op); it now emits
  `arenaExposure[levelId]` from the live panel snapshot via `buildPostFxDump`. Test in
  [artExpoDump.test.js](../../tests/artExpoDump.test.js).
- *(UI/UX · Medium)* **ONBOARD-SCROLL-1** — ✅ **CLOSED 08-07** (`23405f6`, test-only — the CSS fix
  was already in `49299de`). Regression test pins `overflow: hidden` on `#cr-howto-screen` and the
  negative `outline-offset` on `.cr-howto-page:focus-visible`. Test in
  [onboardScroll.test.js](../../tests/onboardScroll.test.js).
- *(UI/UX · Medium)* **RESULTS-CRAMP-1** — ✅ **CLOSED 08-07** (`802c4c1`). The 1101–1299px band
  between the mobile-landscape and desktop rules had the 53.75rem podium overflowing a ~499px
  column, sliding 4th place under the action buttons; gated media query shrinks columns + gap
  (9.25rem / 0.75rem) to fit. Test in [resultsCramp.test.js](../../tests/resultsCramp.test.js).
- *(Engineering · Medium)* **RAM-CONTACT-STALE-1** — ✅ **CLOSED 08-07** (`5257294`, +`8af97f4`
  encoding fix). The `_activeCartContacts` sweep gained a max-separation guard (planar, same as ram)
  and `resetCartTransientState` now calls `clearActiveCartContactsForCart` — a missed Rapier
  stopped-event (respawn teleport, SD `setEnabled(false)`) can no longer re-fire an attributed ram
  from across the arena. Tests in [ramContactStale.test.js](../../tests/ramContactStale.test.js).
- *(Engineering · Low)* **SD-SPECTATOR-WIRE-1** — ✅ **CLOSED 08-07** (`ba061c6`). The migration
  attribution tail now names parked Sudden-Death spectator slots (`sds`), and the promoted host
  restores `isSuddenDeathSpectator` from it — a re-enabled remote body after mid-SD migration no
  longer re-fires as a phantom fall. Test in [sdSpectatorWire.test.js](../../tests/sdSpectatorWire.test.js).
- *(UI/UX · Medium)* **RESULTS-UNLOCK-TOAST-1** — ✅ **CLOSED 08-07** (`3f398bc`). While the results
  overlay is visible the unlock toast lifts clear of the podium (34vh + 9rem, with coarse/phone and
  short-desktop bands) instead of sitting across the rank blocks / PLAY AGAIN. Test in
  [resultsUnlockToast.test.js](../../tests/resultsUnlockToast.test.js).
- *(Engineering · Medium)* **NET-P2P-DIAG-1** — ✅ **CLOSED 08-07** (`7131f40`). WebRTC recovery is
  now visible in `?diag` captures: `p2p_reconnect_attempt` / `p2p_reconnect_offer_failed` net diag
  events on each re-offer, rate-limited by the existing per-peer cooldown. Instrument-only — no
  retune of `p2pReconnectCooldownMs`/`p2pConnectingTimeoutMs`. Test in [netP2pDiag.test.js](../../tests/netP2pDiag.test.js).

**H1 remaining (0 playtest-open):** GAMEPAD-LOBBY-1 closed PASS in the playtest export; HOLE-FRICTION-COMBINE-1
PASS 08-07 (`519d905`) — see entry above. **H2 remaining (1):** ARENA-BUMPER-HINT-1 (product call). **H3 remaining (1):** CAPTURE-RING-LIMIT-1 — see
[BACKLOG.md](./BACKLOG.md).

### August 12, 2026 — CARGO-BAY-INSTANCE-1 (per-bay InstancedMesh)

- *(Engineering · Medium)* **CARGO-BAY-INSTANCE-1** — ✅ **CLOSED 08-12** (`9e86382`).
  Replaced 30 individual `THREE.Mesh` per cargo bay (up to 120 draw calls for 4 carts) with
  per-model `InstancedMesh` children — one IM per grocery model type present in each bay.
  Instances within each IM are sorted by GRID index (fill-priority order) so that
  `InstancedMesh.count` directly gates the Living Cargo fill-ordered reveal, replacing the
  old `.visible`-toggle loop. Draw calls drop from ≤120 to ~24 (5× reduction) with zero
  per-frame overhead (IMs are bay-local — no world-space matrix updates). `hideCargoBay`
  and `removeCargoBaysFromMesh` work unchanged (`Group.visible` cascades, Group removal
  cascades). The GRID fill pattern stability call was resolved by Wyatt as part of the
  plan ack before implementation. Single-lever wave — `populateCargoBay` +
  `setCargoFillCount` are coupled. Playtest owed: solo fill, multiplayer parity, spill
  hide/rebuild, shatter/rebuild, before/after screenshot. Tested: QA green (169 files,
  1885 tests).

### August 7, 2026 — Wave H1 (partial): desk-only correctness sweep, 3 commits (CONNSTATE-REFLIP-1, LASTHITBY-MUTATE-1, FREEZE-TELEMETRY-1)

First 3 of Block H's 7-item H1 batch (the principal-engineering audit's correctness levers), one
commit per card, no playtest owed — verdict is in the diff/test run, same shape as Block F1.
Wyatt's plan review (before any code) caught real gaps in all three: a stale line citation and the
wrong sibling pattern on L2, and a missing test seam on both L1 and L3 — each corrected against
live code before implementation, not assumed from the original audit.

- *(Engineering · Medium)* **CONNSTATE-REFLIP-1** — ✅ **CLOSED 08-07** (`3475478`).
  `connectionState` re-flipped to `"reconnecting"` after a deliberate `disconnectPartySession()`
  because both the socket close and error handlers wrote the state before checking
  `_suppressRetry`, not after — regressing the cap-220/221 fix that same session. Extracted the
  condition into a pure `shouldMarkReconnecting({ suppressRetry, helloReceived })`
  ([netcode.js](../../src/netcode.js)) rather than reaching for a new test-hook seam
  (`__netcodeTestHooks` exists but is explicitly read-only, for the 2-client E2E rig — wrong tool
  here); 4-case truth table in [netcode.test.js](../../tests/netcode.test.js).
- *(Engineering · Medium)* **LASTHITBY-MUTATE-1** — ✅ **CLOSED 08-07** (`f5a8420`). The
  KO-attribution clear (`gameFlow.js`) mutated `gameStore`'s live `lastHitBy` Map directly via the
  getter's return value, bypassing `set()` — silently unobservable to any future selector-based
  subscriber. Added a `clearLastHitBy` action (clone-then-delete-then-set, matching `recordHit`'s
  pattern, not `clearAllHits`'s blunt reset) plus a `GameState.clearLastHitBy` facade, and swapped
  the call site. Real line was `gameFlow.js:409`, not the `:403` the original audit cited; the
  right call is a direct `GameState.*` call (`gameFlow.js` had zero prior `GameState` coupling —
  added the same `import * as GameState` all 11 other consumer files already use), not routed
  through the `deps` injection pattern, since writes were never injected there. Subscribe-based
  test in [gameState.test.js](../../tests/gameState.test.js) proves the clear is now observable.
- *(Engineering · Medium)* **FREEZE-TELEMETRY-1** — ✅ **CLOSED 08-07** (`5469880`). The open
  "host 1-8s freeze" investigation (Run 7) had zero production signal — all forensics gate behind
  `?diag=1`/`window.__ccDiagActive`, so nothing distinguishes "nobody hit it" from "we stopped
  being able to see it" once external testers arrive. Added an always-on (not diag-gated)
  `maxFrameMs`/`framesOver33` pair to `gameLoop.js`, reset on entering `RoundPhase.RUNNING` and
  read into the `match_ended` analytics payload — deliberately separate from the heavier
  `__ccLoopDbg` diag block (sample, don't stream), zero-allocation (two mutated primitives, resume
  frames excluded so alt-tab can't read as a freeze). Accumulation math unit-tested directly in
  [gameLoopResilience.test.js](../../tests/gameLoopResilience.test.js); wiring/unconditional
  presence proven in [analyticsGating.test.js](../../tests/analyticsGating.test.js).

**H1 remaining (2):** GAMEPAD-LOBBY-1 (High, deployed — owed its two-PC playtest),
HOLE-FRICTION-COMBINE-1 — see [BACKLOG.md Block H](./BACKLOG.md).

### August 7, 2026 — ONBOARD-SIZE-1: how-to arrows and card text sized up

*(Shipped `9bc315e`, deployed Worker version `aa703973-88a0-4047-ac27-917b9d36ca28` — ✅
**CLOSED PASS**, ONBOARD-SIZE-PT-1 1/1, confirmed live 08-07.)*

Wyatt's note on the ONBOARD-SLIDES-PT-1 PASS — *"the forward and back buttons are too small by
the way, same with the card text — it should be large and simple"* — was a type-and-target-size
pass over `.cr-howto-*`, CSS only, no copy rewrite (his call: the deck's text had already passed
PT-1/2/3, so the words stayed, just bigger). The prev/next pager arrows grew from 2rem to 2.75rem
(44px, the same touch-target bar TOUCH-HOVER-1 used), the slide body text grew from 13px to 18px
and brightened (60% to 72% opacity), and the slide name plus the control/price chip text scaled up
to match so nothing on the card reads smaller than the body it sits next to. The deck's 23rem
height floor was left untouched — nothing grew past it, so the pager still lands in the same place
across every slide.

A `git commit -- <pathspec>` mistake during this card briefly pulled an unrelated, still-uncommitted
ONBOARD-ATTRACT-1 CSS block into the first commit; caught immediately via `git show --stat` and
corrected with a follow-up commit before anything shipped, so ONBOARD-SIZE-1's shipped commit
carries only its own change.

**Evidence.** `npm run qa` 7/7 on the shipped commit. Computed-style values (rem/px/color/
line-height) were verified directly against the live DOM before ship; the deployed `.cr-howto-page`
rule was then confirmed byte-for-byte against the served production CSS. ONBOARD-SIZE-PT-1 (Wyatt,
production) passed 08-07.

---

### August 7, 2026 — ONBOARD-ATTRACT-1: first-run guidance invites instead of interrupting

*(Shipped `9bc315e`, deployed Worker version `e4fce545-a821-4be9-9a25-ff9d371c6b0a` — ✅
**CLOSED PASS**, production visual check confirmed 08-07.)*

The first visit no longer opens HOW TO PLAY over the menu after 600 ms. When `howtoSeen` is unset,
the existing HOW TO PLAY command glows and runs a smooth tracked Anime.js nudge; opening the guide
stops it and stamps the existing flag. Starting a match stops it for that session without falsely
marking the guide seen, so it can attract again after a later clean menu presentation. Invite and
rejoin URLs keep the existing `?room=` bail and never attract.

The motion took three rejected prototypes to attribute correctly: slap-eased and symmetric CSS
pulses read like a heartbeat, while directly sharing the title's beat was too slow and stepped at
button-label scale. The shipped loop animates a CSS custom property through Anime.js at 680 ms with
`inOutSine`, preserving the command row's skew and press transform ownership. It is lifecycle-
tracked and cancelled on open/hide; reduced-motion users keep the strong static glow with no drift.

**Evidence.** `tests/onboardFirstRun.test.js` pins both menu presentation paths (`show()` and
`revealShell()`), invite/seen policy ownership, flag-write placement, start/stop lifecycle, the
tracked Anime.js loop, and reduced-motion fallback. Targeted 12/12; full suite 1647/1647; `npm run
qa` 7/7. Post-deploy verification found 16/16 referenced hashed assets available, zero 404s, and
the deployed `cr-cmd--howto-attract` symbol before Wyatt's production PASS.

---

### August 7, 2026 — FRIENDS-LEVEL-1: the Friends host's arena pick now wins the room

*(Shipped `f8281c5`, deployed `ec23ccb9` — ✅ **CLOSED PASS**, FRIENDS-LEVEL-PT-1 1/1, confirmed
live the same day it was filed.)*

Wyatt's note on the DIFF-FRIENDS-PT-1 PASS (08-06) — *"i had the storerooms selected but the
friends lobby went to cart rave"* — turned out to be the exact same hole DIFF-FRIENDS-1 closed for
AI difficulty, one level down: `MSG.hello` adopted the room's hello-stamped `levelId` (server
defaults new rooms to `"classicRecord"`) into `settingsStore.selectedLevelId` before any host logic
ran, clobbering the Friends host's menu pick in both the latch and localStorage — so
`sendHostRound` had nothing but the default left to re-broadcast.

**Fix mirrors the precedent rather than reinventing it.** The hello handler now skips that adopt
specifically for the Friends host — `isFriendsHostHello(mode, msgHostId, msgYouConnId)`, keyed off
`msg.hostId === msg.youConnId` because the module-level `hostId`/`youConnId` vars aren't assigned
yet at that point in the handler (the same workaround the existing Cap-61 code a few lines below
already relies on). `adoptFriendsHostLevelFromStore()` then stamps the room latch from the store
directly — reusing the existing `adoptRoomLevelAsHost` rather than a second direct call, to keep
one host-push call site — and is ordered *before* the existing `adoptFriendsHostAiDifficultyFromStore()`
call so both land in a single `sendHostRound` message. Server needed no change: `MSG.hostRound`
already latched `levelId` and `aiDifficulty` off one payload.

**Why skip instead of capture-and-restore:** the host's arena is already loaded as their picked
level (the menu loaded it before FRIENDS was even pressed). Adopting the wrong hello value and
then correcting it a few lines later would have rotated the host's own arena to Cart Rave and back
— a visible flash for no reason. Skipping the adopt entirely means the host's client never touches
the wrong level at all.

**Adversarial review (pre-implementation) surfaced one accepted edge, one real trap, and cleared
four other attack angles.** The trap: mirroring the DIFF-FRIENDS-1 test hook naively would have
broken the regression test it exists for — that hook's underlying adopt function deliberately never
writes the store (Quickplay Medium must not overwrite a Solo preference), but the *level* adopt
does write the store, so a hook built the same way would silently overwrite the store to match any
pre-stamped latch, making "store wins over a stale latch" impossible to prove. The test hook
instead assigns the module variable directly. The accepted edge: a host who refreshes, changes
their pick, and rejoins into the narrow window where they get re-crowned over still-seated guests
will now rebroadcast the new pick and rotate them — mid-round if unlucky. That is the card's
intent (host's pick wins the room), not a bug, and was left uncoded-around. Four other angles —
double hello / reconnect, host migration on rejoin, URL-rewrite timing vs. `detectGameMode()`, and
whether anything in the boot/arena-load path depended on the skipped adopt having fired — were each
traced through the actual code and refuted; notably, if any guest remains when a host drops, the
server migrates `hostId` immediately, so a rejoining ex-host is a guest on their next hello and just
adopts room truth normally, no special case needed.

**Evidence.** `tests/friendsLevel.test.js` (9 new): store-wins-over-a-differing-pre-stamped-latch
regression, guest and Quickplay no-ops (asserted on latch state, not just the return value),
no-saved-pick fallback (`FREE_LEVEL` = `"zanzibar"`, which is also the menu's own default arena —
so even a fresh profile lands where it already was), and the `isFriendsHostHello` predicate's edge
cases including `"" === ""` (must not match). 14/14 targeted with the existing `diffFriendsAi.test.js`,
1626/1626 full suite, `npm run qa` 7/7.

---

### August 6, 2026 — playtest export: 10/10 PASS, 0 FAIL — six cards close, five new ones open

*(Second 08-06 export. Cards closed: **ONBOARD-SLIDES-1** · **RESULTS-1** · **ART-FILTER-1** ·
**ART-EXPO-1** · **DIFF-FRIENDS-1** · **SPAWN-SUNDIAL-1** · **ORIENT-TOAST-Z-1**, via their ten
playtest ids. **SHARD-PT-2** stays SKIP — it needs five humans and waits for the public post.)*

The largest clean sweep so far, and the first where every *shipped-but-not-deployed* card was
judged on `npm run dev` instead of waiting on a ship — seven of the ten ids were in that state.

**Verdicts.** ART-EXPO-PT-1: the customize cart is unchanged, so `applyRendererColorGrading`'s
second caller (`ui/cartPreview.js`, no arena, takes `arenaExposureDefault`) really does land on the
same 0.4 the retired global gave it. ART-FILTER-PT-1 / PT-2: the CRT is gone from Cart Rave and
Sundial, still intact on The Storerooms, and the impact punch survives — the vignette *fade* below
0.5 was the right call over a hard cutoff, since the fade is what kept the pulse tail from popping.
ONBOARD-SLIDES-PT-1/2/3: eight slides read, page and hold up on a phone, and Enter walks a
first-run player through the deck rather than closing it on card 1 — the failure mode the card
existed for. RESULTS-PT-1: the podium and receipt read as one composition at every width checked.
DIFF-FRIENDS-PT-1: the lobby chip tracks the *room latch*, not the store, which is the hard assert.
SPAWN-SUNDIAL-PT-1: the four corner posts stop a cart and nothing invisible does.
ORIENT-TOAST-PT-1: the portrait hint draws over the button column in the coarse-pointer landscape
band — the z-lift alone was sufficient, as the mechanism predicted.

**Four passes came back with a note, and every note became its own card rather than a residual on
a green verdict.** This is the FIX-EMISSIVE-1 precedent applied on purpose: a note that names a
*different mechanism* than the card checked is new work, and holding the card open for it would
lose both the pass and the note.

- **FRIENDS-LEVEL-1** (High) — *"i had the storerooms selected but the friends lobby went to cart
  rave."* Filed investigate-first, but with a strong prior: it looks like the DIFF-FRIENDS-1 shape
  exactly. The server broadcasts `levelId` on hello/round and the client latches it
  (`adoptAuthoritativeRoomLevel`), while the only host-side push (`adoptRoomLevelAsHost`) is called
  from one site — arena rotation in `roundLifecycle.js` — never at room create/enter. So the menu
  pick has no path to win the hello, the same hole the difficulty pick had before
  `adoptFriendsHostAiDifficultyFromStore()`.
- **ONBOARD-ATTRACT-1** (High) — *"i'm afraid that if the how to play thing is the first thing they
  see they might be confused… it should glow and move more on first play."* The auto-open policy
  itself, one level above what PT-2 checked. Replaces `maybeAutoOpenHowTo()`'s 600 ms open with an
  attract state on the button; keeps the `?room=` bail, ONBOARD-FLAG-1's "arming writes nothing"
  rule, and the entering-a-match disarm.
- **ONBOARD-SIZE-1** (High) and **ONBOARD-SCROLL-1** (Medium) — split from one note, because they
  are two mechanisms: how big the arrows and body text are, versus a focus ring that adds a page
  scrollbar when an arrow takes focus.
- **SPAWN-SUNDIAL-GAP-1** (Medium) — *"we need to move the spawn booths away from the platform a
  bit so they cant get caught between them."* **Its own fix created it:** the gap between posts and
  platform edge used to be ghost geometry a cart drove through, and solid legs turned it into a
  wedge. The lever is `booth.gapDistanceByLevel`, the same knob that moved Sundial's booths +0.75 m
  on 08-02 — likely one number. Wyatt thought a similar card existed; it did not (checked).

**Process note worth keeping:** ONBOARD-SLIDES-1 shipped as three separate playtest ids and
DIFF-FRIENDS-1 as one, and that split is why a note about *arena selection* had somewhere to go
without touching a difficulty card's verdict. Ten ids, ten independent verdicts, four notes, zero
mixed results.

---

### August 6, 2026 — ART-FILTER-1 + ART-EXPO-1: the CRT becomes Storerooms-only, exposure becomes per-arena

*(Block B #4 · wave, one commit per lever)* — ⏳ **SHIPPED 08-06** (`403ab2f`, `91e3b24`), playtest
owed (ART-FILTER-PT-1 · ART-FILTER-PT-2 · ART-EXPO-PT-1). Both cards are art infra whose whole
point was to give the **High bloom sign-off** its success criteria; that card is now unblocked.
art-direction.md Rule 2 moved FAILS → PASSES and Rule 3's per-arena luma floors are recorded.

**Lever 1 — ART-FILTER-1.** The arcade pass (aberration/scanlines/vignette) was written once in
`createComposer` from global config, so every arena inherited it. Gated at level load in
`applyLoadedLevelSideEffects`, mirroring the VHS gate: `backrooms` keeps the filter, the other
three are written an explicit 0. Verified live on a real 4090 across all four arenas.

**The trap that made this more than a ternary: `uVignette = 0` does not turn the vignette off.**
Its `smoothstep` runs with edge0 (`0.8`) above edge1 (`0.5 * uVignette`) at *every* shipping
value, so the reversed-edge path was already load-bearing, and under it the corner sample only
moves `0.485 → 0.587` across `uVignette 0.5 → 0`. Writing 0 would have left ~41% corner darkening
while every probe said the gate was applied — a card that measured itself as passing and shipped
the defect it existed to fix. The shader now fades the effect out below 0.5. A hard
`uVignette > 0.001` cutoff was rejected on a second look: it fixes the resting value but pops the
corners (`0.580 → 1.0` in one frame) at the end of every impact pulse on the gated arenas, since
those pulses decay toward a 0 base. The fade saturates at 0.5, so Storerooms, the shader default
(1.2) and all pulse peaks are bit-identical to before.

**Second trap: a pulse live across an arena swap.** `frameVisuals` re-applies the pulse's captured
base every frame until it decays, so a pulse in flight during a level load would write the *old*
arena's vignette/aberration over the freshly gated uniforms and bring the CRT back on Classic. The
gate clears the pulse — and must clear `until` as well as the bases, because with a future `until`
the next impact skips base capture entirely and its spike silently never renders. `getImpactPulse`
was not in `levelOrchestration`'s deps; wired through `gameBoot`.

**Lever 2 — ART-EXPO-1.** Retired the global `toneMappingExposure: 0.4` and the `arenaExposureMul`
that only Sundial used, in favour of absolute per-arena values in `config.postFx.arenaExposure`
(`classicRecord` 0.4 · `backrooms` 0.4 · `zanzibar` 0.528 · `testArena` 0.4) resolved by
`resolveArenaExposure()`. Look-preserving **bit-identically**, not approximately: `0.4 * 1.32`
rounds to the same double as the literal `0.528` (verified live, delta `0`). The non-obvious call
site is `applyRendererColorGrading`'s **second** caller — `ui/cartPreview.js` grades its own
offscreen renderer and has no arena, so it takes `arenaExposureDefault`, the same 0.4 the retired
global gave it. Adding a `levelId` param without handling it would have shifted the menu cart.

**Evidence.** Before/after `npm run shoot` on all three arenas, real GPU (4090), sidecars recorded.
Storerooms is a confirmed no-op on both levers: meanAbs 0.287 against a 0.315 noise floor measured
between two identical-code captures, and luma floor 1.36 → 1.36 / median 83.91 → 83.98.

**A measurement caveat worth carrying forward: `npm run compare` cannot judge Cart Rave.** Its
animated crowd puts the noise floor between two identical-code captures at meanAbs **7.18**
(pctDiff 39%) — higher than the 6.65 the real CRT removal produced. The pixel metric was therefore
*incapable* of proving that change; the uniform probe and the visual did. Do not read a Classic
compare number as evidence in either direction without measuring its floor in the same session.

**Rule 3 baselines** (recorded in [art-direction.md](../reference/art-direction.md)) were computed
with a one-off scratchpad script, since `tools/` is frozen during a game card — folding a luma
metric into `compare.mjs` is filed as **ART-LUMA-TOOL-1**. **ART-EXPO-DUMP-1** filed for
`postFxDebug`'s config dump, which still emits the now-removed `toneMappingExposure` key.

---

### August 6, 2026 — PERF-PASS-1: low-end perf program closed — bar NOT met, deliberate close

*(Perf program · Block C)* — ✅ **CLOSED 08-06 on Wyatt's call: "stadium is needed."** The card set
out to hit **60 fps / mean ≤ 16.7 ms at Low on the Intel UHD box, Cart Rave only**. It closes with
**no further cuts** — the pass bar is not met and the card is deliberately parked in the grave
rather than kept open for a cut that would cost the arena's look.

**What shipped (the only lever):** **Wave 4 `arenaFillLights`** (`b754e12`, Worker `9b8b1fbe`) —
`pitUplight` + `pitRimFill` off at Low, spindle kept (Wyatt's identity-light call). Measured range
**−1.66 to −2.54 ms**, which includes +0.55 — never quoted as a single figure. Still owed (Wave 4
playtest): look down the shaft after a KO at Low — darker, not pure black; spindle reads lit, not
orphaned; High unchanged.

**Wave 5 (unparked 08-06, `b348ba8` + `e4399f2`):** 5a diagnosis at HEAD `16ca169` — 147 draws /
550,449 tris / 265 transparent at Low (Cart Rave shell); light loop already down to **3 PointLights**
(spindle + two un-gated billboard lights); record body = largest Physical screen-fill, never
measured. 5b shipped + deployed two new `?ablate=` tokens with no visual default change:
`recordbody` (Physical→Standard swap, verified 91→90 physical on the scene graph) and
`billboardlights` (the two un-gated PointLights only).

**5c cells (Wyatt, Intel UHD box, solo host 3 NPCs, Low, build `b348ba8`, `straddledDemotion: false`):**

| Cap | Cell | meanMs | fps | CPU | vis | Verdict |
|---|---|---|---|---|---|---|
| cap-293 | `none` (Edge baseline) | 23.185 | 43.1 | 9.17 | 8.11 | — |
| cap-295 | `recordbody` (Edge) | 30.942 | 32.3 | 23.89 | 21.61 | **unproven — polluted cell** (+7.8 ms; CPU 9→24 ms is a throttled/drifting box, not a material swap that touches zero draws) |
| cap-296 | `billboardlights` (Edge) | 23.056 | 43.4 | 11.66 | 10.46 | **null — not a lever** (−0.13 ms, in noise) |
| cap-294 | `none` (Firefox, dpr 1.25) | 24.302 | 41.2 | 12.88 | 11.03 | cross-browser sanity only |

**Outcome — ranked-risk #1 realised:** *no new fragment lever found → menu is stadium-only.* Of the
two new candidates, `billboardlights` cost ~nothing and `recordbody` read polluted (unproven in
either direction). **`stadium` (−2.66 ms, swept) is needed → kept.** The card closes with
`arenaFillLights` as the only shipped lever and the box still ~43 fps against a 60 bar.

**What is NOT true going forward:** PERF-PASS-1 is closed do-not-reopen. PERF-9CELL-1 (the 9-cell
sweep) is **moot** with its parent closed. The `?ablate=` tokens stay (permanent debug surface —
`recordbody`/`billboardlights` joined the existing seven, documented in `debugParams.js`).
Perf residual items that remain open live under their own rows: **WARM-SOLO-1**, **PERF-WATCH-1 /
PERF-TIER-1 / PROBE-WARM-RT-1** (levers after attribution — untouched by this close).
**RECORD-MED-1** closed PASS 08-08 (look parity, not a cost card). **PERF-RENDERINFO-1** closed
with Block I 08-07.

Full method, per-token expectations and the drift discipline live in
[perf-pass-1-handover.md](./perf-pass-1-handover.md).

---

### August 6, 2026 — FEEL-DAY-1: collision punch + impact juice + bot aggression

*(Playtesting feel · wave)* — ✅ **CLOSED PASS 08-06** (`da9063c`, `e67071b`, `0e0a1b7`).
One-day feel pack: rams launch harder, hits read louder, Medium bots hunt more. Config + test
literals only — no `simulation.js` rewrite, no new SFX assets, NH-HIT/NH-SMOOTH stayed parked.

**Lever 1 — collision punch:** `boostImpulseMultiplier` 2.35→2.55 (primary launch; post-clamp,
uncapped), `strength` 2.88→3.15 (mid-hit only; `maxImpulse` 200 still clamps base before boost),
`directiveEngine.test.js` strength literal tracks config.

**Lever 2 — impact juice (hedged HIT-FEEL-1 path):** shakeMin 0.22→0.20, shakeBoostMin 0.16→0.12,
shakePixelScale 5.5→6.2, particles 8/16→10/20, crashVolumeFloor 0.22→0.25.

**Lever 3 — bot aggression:** Medium `npcRamCommitMul` 1.18, `humanWeightOffset` +0.06 (clamp-eaten
on high-humanWeight profiles — expected); Medium is **not** identity and inherits into quickplay
(accepted). Global NPC `alignmentAngleDeg` 40→34 (all difficulties + MP host-sim; Hard stacks −12).
Solo lead rubberband: `leadChaseMul` 1.32, `leadNitroMul` 1.40. `aiDifficulty.test.js` updated.

**Playtest:** FEEL-DAY-PT-1/2/3 all PASS (Wyatt 08-06). Shared config changes multiplayer feel by
design. Not deployed until explicit ship.

---

### August 6, 2026 — SHOOT-SOFTGL-1: `npm run shoot` renders on a real GPU and strips dev chrome

*(Tech Debt · Medium)* — ✅ **CLOSED 08-06** (`c45bb28`, `3b071be`, `4358f89`, `23d50c9`, `1d124c3`).
Filed 08-06 alongside MONTAGE-ESC-1, same tools-freeze window — the last open card in Block G,
now drained. `npm run shoot` never removed `#cr-softgl-notice` before screenshotting (every other
capture tool — `states.mjs`, `loadshots.mjs`, `sheet.mjs`, `podium.mjs` — already did) and passed
no GPU flags, so headless fell back to SwiftShader: every capture carried a full-screen
"GRAPHICS RUNNING IN SOFTWARE MODE" modal, and the record floor rendered washed-out grey instead
of the dark-neon look. This blocked ART-FILTER-1 + ART-EXPO-1 (Block B #4), whose evidence is
before/after `npm run shoot` captures judging exposure/luma on three arenas.

**The card's own stated reason to keep GPU flags opt-in was false, verified before touching
code:** `shots/` is gitignored and has zero committed baselines (`.gitignore:23-24`,
`git ls-files shots` → empty); `tools/compare.mjs` takes explicit `--a/--b` paths and
`projectHealth.mjs` only globs `shots/perf-profile-*.json`, never PNGs. Nothing depends on the
old SwiftShader default, so GPU is now the launch default (`--no-gpu` to opt out) instead of
being gated behind `--gpu`.

**Second defect found while reading `buildUrl`, fixed in the same window because it would have
poisoned ART-FILTER-1's evidence:** `shoot.mjs` unconditionally pinned `?level`, and
`debugParams.js:175` resolves the URL's `level` before a `--shot` bookmark's own — so
`npm run shoot -- --shot classic` silently rendered **Sundial** with Classic's camera, not
Classic (2 of 3 examples in `visual-qa.md` were wrong). `level` is now pinned only when neither
`--level` nor `--shot` is given; the resolved arena is read back from `__cartRave.params` and
logged/recorded, so a capture is self-documenting about what actually rendered.

**Five commits:** (1) strip `#cr-softgl-notice` + `#eruda`, called twice (main-ready + pre-shot,
OR-merged) since eruda's 4s CDN timer can land between an early removal and the shot; (2) the
`--shot`/`level` precedence fix; (3) GPU-by-default launch, `gpuVendor` readout ported from the
now-deleted `shoot-gpu.mjs` with a widened software-detection regex (adds "Basic Render
Driver"/WARP, the string `main.js:564` branches on for "no driver installed"), a merged
`<out>.json` sidecar (gpuVendor/software/resolved level+params/devChrome/stats/consoleErrors)
written before the `--require-gpu` gate so a failed gate still leaves its evidence, exit code 2
via `process.exitCode` (not a throw/bare `process.exit`, so the `finally` still tears down the
browser and spawned dev server); (4) delete `shoot-gpu.mjs` (self-scoped as a one-off for the
closed ART-PASS-CLASSIC-1, feature-complete once folded in) and touch up its two live references
(`perf-pass-1-handover.md`, `menuAttract.js` source comment); (5) rewrite `visual-qa.md`'s
screenshot examples, look-critical-capture section, and trap #1 (kept as a closed entry, not
deleted — the lesson that flags are best-effort and the sidecar is the proof still matters).

**Verified live** (RTX 4090): `--no-gpu` → `gpuVendor` reads SwiftShader, `software:true`,
`devChrome.softgl:true`; default → reads the RTX 4090, `software:false`, `devChrome.softgl:false`;
`--no-gpu --require-gpu` → exit 2 with the sidecar still written. Classic Record captured both
ways shows the claimed defect directly — SwiftShader washed-out grey vs the real dark-neon
bloom/glow look on GPU. `--shot classic` with no `--level` logs `level=classicRecord` and
matches an explicit-`--level` capture's arena identity pixel-for-pixel. No `tools/**` coverage
in `tsconfig`/`knip`/tests, so every claim above came from running the tool, not from `npm run
qa` (run anyway to catch the BACKLOG/ARCHITECTURE regeneration).

---

### August 6, 2026 — DIAG-NET-CAPTURE-1: `host_send_gap` auto-captures past a severity floor

*(Engineering · Medium)* — ✅ **CLOSED 08-06** (`69506db`). Filed from the same Copilot netcode
review as NET-P2P-DIAG-1. `recordDiagEvent("net", "host_send_gap", …)` fired at >250 ms but
`AUTO_CAPTURE_CHANNELS` was `new Set(["error", "assert"])`, so a host freeze produced an F8 capture
only if Wyatt hit F8 *during* the freeze — the one moment he is playing, not pressing keys.

**Lever (one module):** replaced the bare `AUTO_CAPTURE_CHANNELS.has(channel)` gate in
`recordDiagEvent` with a `shouldAutoCapture(channel, type, data)` predicate
([diagnostics.js](../../src/utils/diagnostics.js)). `error`/`assert` are unchanged; `net` is
admitted **only** for type `host_send_gap` with `gapMs > 1000` (strict) — a type+severity trigger,
never channel promotion, so routine gaps (250–1000 ms) and every other net event stay ring-only.
`data` was already shallow-spread into the record, and the emission site passes `gapMs` as a plain
primitive, so the predicate reads the third argument directly — no inspect-after-push needed.
Shared 5 s debounce + 5/session cap are the ceiling (Wyatt's explicit call: no net-specific budget;
netcode's 1 s event rate-limit stacks underneath). A one-comparison boolean is the only cost on an
already-gated path, so prod without `?diag=1` pays nothing. No `netcode.js` timing touched; no
`tools/` edit, so no freeze conflict.

**Tests** ([diagnostics.test.js](../../tests/diagnostics.test.js), +3): severe gap (1500) assembles
one bundle with reason `net/host_send_gap`; sub-floor (500), at-floor (1000), `snap_gap` (5000), and
a gap-less payload all stay silent; 7 mixed net+error triggers exhaust exactly the shared 5-bundle
session cap (via a `performance.now` mock that cannot wedge `__drainAutoCapturesForTest`).

**Gate:** unit project green (123 files / 1565 tests in one clean run); `status:size`, `typecheck`,
`knip`, `briefing:check`, `arch:check`, `health:check` all pass individually. The `qa` chain as a
whole could not reach green because the Cloudflare `party-do` pool intermittently fails to *start*
(`connect ETIMEDOUT 127.0.0.1:<ephemeral port>`) on this machine — baseline-with-changes-stashed
failed worse (9/6), so it is environmental, not this diff. **Value shows at first real freeze:** a
wedged host uploads itself via `npm run captures:pull` instead of needing an F8 press.

---

### August 6, 2026 — TOUCH-JOY-DEAD-1: delete unreferenced `.cr-touch`/`.cr-joy`/`.cr-joy-knob` CSS

Filed and closed same session, Wyatt-acked. `cart-rave-menu.css:130-169` — the touch-HUD
container `.cr-touch`, joystick base `.cr-joy`, and knob `.cr-joy-knob`, plus their two
`@media (pointer: …)` overrides — had zero references anywhere in `src/**/*.{js,html}`, repo-wide
grep for `cr-touch\b` and `cr-joy\b` confirmed, including a check for dynamic
template-literal construction (none). `touchControls.js`'s only nearby hit was a comment naming
the unrelated `.gtc-joy-knob`. Left out of scope during the F1 wave (STATES-DEAD-1 +
KBM-TOAST-1, `38f4472`) pending its own ack. **Not caught by `npm run states`'s reachability
sweep** — that tool only enumerates rules whose selector carries `:hover`/`:active`/
`:focus-visible` from the live CSSOM ([tools/states.mjs](../../tools/states.mjs) header), and none
of these three rules use a pseudo-class, so they were never in its inventory — a blind spot of
that method, not something it already checked and passed. Deleted whole; no code or test
referenced the class names, so no follow-on changes were needed.

---

### August 6, 2026 — Wave F1: desk-only sweep, 5 commits (MONTAGE-ESC-1, RAPIER-DEFAULT-MAX-1, STATES-DEAD-1 partial + KBM-TOAST-1, SPINDLE-COLOR-DEAD-1, RESULTS-GLOW-1)

Block F1 — the desk-only tier of the sweep-day batch, one commit per card, no playtest owed
(every verdict was a diff read, a unit test, or an `npm run states` report).

- *(Tech Debt · High)* **MONTAGE-ESC-1** — ✅ **CLOSED 08-06** (`d6cba84`). `montage.mjs`'s
  `export { esc } from "./ccStyle.mjs"` re-export created no local binding, so the two `esc()`
  calls inside `montagePage()` (the `<title>` and `<h1>` lines) threw `ReferenceError` — breaking
  `states`/`sheet`/`podium`/`loadshots` after their checks reported. Fixed by importing `esc` too,
  then re-exporting it, keeping CC-ESC-1's single-source intent. Added
  [tests/montagePage.test.js](../../tests/montagePage.test.js), the first test to actually call
  `montagePage()` — it also caught that `.toUpperCase()` upcases escaped entity text
  (`&lt;` → `&LT;`), which is correct behavior, not a bug.
- *(Engineering · Low)* **RAPIER-DEFAULT-MAX-1** — ✅ **CLOSED 08-06** (`2b70201`). Corrected four
  living claims that Rapier's default restitution combine rule is `Max` — it is `Average`
  (`@dimforge/rapier3d/geometry/collider.js:861-862`). Fixed: the staves comment
  ([arena.js:2548](../../src/arena.js:2548)) and the lip comment
  ([arena.js:2611](../../src/arena.js:2611)) (the card's own row only named the staves comment;
  the lip comment carried the identical claim and was caught during execution), the last test's
  name/rationale in [classicPitWalls.test.js](../../tests/classicPitWalls.test.js), and this file's
  own WALL-SLIDE-CLASSIC-1 bullet below. Corrected effective values: lip 0.40, staves 0.45 — the
  real numbers WALL-SLIDE-CLASSIC-1 passed playtest at on prod `a028cb8a`, so the feel stays
  signed off. Prose only; every collider value and the test's assertion are byte-identical.
- *(UI/UX + Tech Debt · Low)* **STATES-DEAD-1 (partial) + KBM-TOAST-1** — ✅ **KBM-TOAST-1 CLOSED,
  STATES-DEAD-1 subjects (1)+(2) CLOSED, 08-06** (`38f4472`). Deleted `.cr-kbm-toast`/`-text`/
  `-close` and `.cr-touch-btns`/`.cr-touch-btn*` from
  [cart-rave-menu.css](../../src/cart-rave-menu.css) — both had zero JS/HTML references
  repo-wide, confirmed by a fresh repo-wide grep including a dynamic-class-construction check
  (the only templated `cr-` string in `src/` is a client-id in `netcode.js`, unrelated). Also
  removed the two now-stale `DECLARED_UNREACHABLE` entries in
  [tools/states.mjs](../../tools/states.mjs) and updated the comment there that referenced
  `.cr-touch-btn`, and swapped `tests/stateSelectors.test.js`'s fixture (and its title, which
  named the exact CSS line deleted) from `.cr-kbm-toast-close:hover` to the still-live
  `.cr-diff-btn:hover`. STATES-DEAD-1's other four subjects (`.cr-level-btn`, `a`, `select`,
  `[role="button"]`) were out of scope and stay open. `npm run states` confirmed both deleted
  subjects no longer appear (not PASS, not FAIL — gone), montage completes without crashing, and
  the remaining FAILs (`#cr-solo`, `#cr-friends`, `.cr-arena-page`, `.cr-context .cr-diff-btn`) are
  unrelated selectors, consistent with the existing party/live-connection gating pattern already
  documented for `.cr-friends-copy`. **Also found but explicitly out of scope:** the whole
  "TOUCH / MOBILE" block's joystick CSS (`.cr-touch`, `.cr-joy`, `.cr-joy-knob`) also has zero
  JS/HTML references — a candidate for a future card, not folded into this one.
- *(Tech Debt · Low)* **SPINDLE-COLOR-DEAD-1** — ✅ **CLOSED 08-06** (`316b017`). Deleted
  Classic's `spindleLightColorPink`/`Cyan` declarations, return lines, and typedef entries from
  [arena.js](../../src/arena.js) — nothing read them through the shared level-result shape;
  Classic's live reactive path uses `reactive.accentColor` instead. `backroomsSupermarket.js`'s
  own deliberate inert pair (it carries its own separate typedef), `testArena.js`'s `null` stubs,
  and the optional `levels/index.js` typedef are untouched — the shared shape keeps both fields
  optional, so nothing outside `arena.js` changes type. No player-visible effect; the values were
  never read.
- *(Tech Debt · Low)* **RESULTS-GLOW-1** — ✅ **CLOSED 08-06** (`5fba34f`), documented-no-change.
  `.results-defeat .results-title`'s `--title-glow: #7c8596` never applies — `roundLifecycle.js`
  (not `main.js`, as the card's row said) sets `--title-glow` inline on the title element every
  round, and an inline style always outranks a stylesheet rule. Defeat still reads correctly
  because the `.results-panel` filter desaturates everything. Rewrote the CSS comment to state
  this rather than reaching for `!important`; the declaration stays as the intended value for
  whenever a look pass re-owns title styling from the inline set.

All five premises were re-verified directly in code before the wave's plan was written, and the
plan itself went through two rounds of adversarial review before Wyatt's ack — one round from an
external critique that surfaced a mis-stated escaper bug count and a stale `stateSelectors.test.js`
line reference, a second self-review pass that caught the missed second Rapier claim (the lip
comment), a stale Block G "fully drained" line, and a missing do-not-reopen list update. `npm run
qa` 7/7 green after all five commits (1600/1600 tests, knip clean, briefing/arch fresh,
health:check ok).

---

### August 6, 2026 — Playtest export: 5 PASS (UI-SCALE-1 Pass 2, TOUCH-HOVER-1, NET-LOOK-ACC-1)

All five owed cards from the 08-06 shipping wave came back Wyatt PASS on prod (Worker
`f2b389d6` for the UI cards, `3cfb33f8` for NET-LOOK-ACC-1). No FAIL. Two new look nits
surfaced inside the HUD check's notes and are filed below as their own cards, not folded into
this PASS, per the one-issue-per-card rule.

- *(UI/UX)* **TOUCH-HOVER-PT-1** — ✅ **CLOSED PASS 08-06.** Phone taps on READY, mute, and a
  results-screen button all release the `:hover` look immediately; no button stuck lit. Confirms
  `npm run states`' 0/9 touch-hover survey in the real browser.
- *(UI/UX)* **UI-P2-HUD-PT-1** — ✅ **CLOSED PASS 08-06, with a caveat.** Score chips, timer,
  boost bar all read right at phone scale. Two things noted are **not** this card's regression:
  the browser chrome itself cropping the viewport (not the game's fault), and two pre-existing
  issues spun into their own cards below (kill-feed overlap, orientation-toast z-index).
- *(UI/UX)* **UI-P2-PAUSE-PT-1** — ✅ **CLOSED PASS 08-06.** PAUSED panel proportionate, mouse
  hover still lights buttons correctly (fine-pointer path unaffected by TOUCH-HOVER-1). Same
  browser-chrome cropping noted, not a card regression.
- *(UI/UX)* **UI-P2-RESULTS-PT-1** — ✅ **CLOSED PASS 08-06.** Results podium, crown icon, rank
  cards, and match receipt all read the same as before the rem conversion.
- *(Engineering · Net)* **NET-LOOK-ACC-1** — ✅ **CLOSED PASS 08-06.** First real two-human check:
  a peer's actual pattern and sunglasses style now show correctly instead of classic
  pattern/silver-mirror glasses, and both hold through spawn and play. Confirms the dev-verified
  wire fix (`1198d26`) in a live Friends lobby. Unblocks Pattern customize UI (SHIP-1 C3).

**New from this session's notes** (Wyatt, filed as separate cards per the one-issue rule, not
retroactively added to UI-P2-HUD-PT-1's steps):
- **KILLFEED-PHONE-1** — kill feed reads awkward/overlapping on phone. See UI/UX table.
- **ORIENT-TOAST-Z-1** — main-menu phone-orientation toast draws under other UI. See UI/UX table.

### August 6, 2026 — Block G wave 5: HARNESS-FRIENDS-1, HARNESS-FREEZE-1

Last two cards in the Block G tooling-window batch, same `tools/netharness.mjs` scenario lane,
one tooling commit each per BACKLOG's instruction, taken in the same sitting. Both closed a real
E2E gap flagged by the 08-01/08-06 harness review; neither touches `src/`. `node --check` clean on
each commit; full verification (both scenarios run + `npm run qa`) tracked separately.

- *(Engineering · Medium)* **HARNESS-FRIENDS-1** — the harness only ever drove quickplay-shaped
  joins; friends private-room ready-up, the CHECKOUT LINE lobby, and rematch were Wyatt/manual
  only (`tools/states.mjs` marked the lobby's own DOM selectors unreachable for exactly this
  reason) — ✅ **CLOSED 08-06** (`c334d25`). New `friendsLobby` scenario in
  [netharness.mjs](../../tools/netharness.mjs): generates a room via the real
  [shared/roomCodes.js](../../shared/roomCodes.js) `generateRoomCode()` funnel, brings up host then
  joiner into the same friends room (`makeClient` gained a `menuEntry` option that dispatches the
  real `cartrave:menu` `joinroom` event after menu boot — friends rooms don't auto-enter on load,
  and `__ccTest.ready` is not a room-entry signal since it's already true from ordinary menu boot),
  asserts the CHECKOUT LINE lobby actually renders (title, room code), proves the host readying
  *alone* does **not** start the round (only every live human being ready arms the countdown — the
  joiner has to seat first, or a solo-host-ready would false-negative that check), then both ready
  and reach a running round, drives the joiner, forces a decisive round end via the diag control
  levers, and rematches — asserting both clients reach a fresh round **without the joiner pressing
  ready again** (friends auto-ready every live human on `playAgain`), same room, same mode, zero
  host sim errors. Tooling only — complements, does not replace, the FV-WILT-1 manual friends
  checks. `--scenario friendsLobby`, `core:false` in [batteryPlan.mjs](../../tools/lib/batteryPlan.mjs)
  (opt-in; promote to core once proven stable across a few real runs).
- *(Engineering · Medium)* **HARNESS-FREEZE-1** — the harness had no scenario for the host going
  quiet *without dying* (tab hidden/throttled, then recovery) — the exact case HOST-TAB-1 shipped a
  joiner-side hold/skip-replay guard against, and the producer of the `host_send_gap` diag event
  the rig had never exercised — ✅ **CLOSED 08-06** (`a20df6f`). New `hostFreeze` scenario freezes
  the host tab for real via CDP `Page.setWebLifecycleState({state:"frozen"})` — a plain
  `document.hidden` toggle is not enough: HOST-TAB-1's own hidden-host pump plus this rig's
  `?perfPump=1` + focus emulation are both designed to defeat a plain hide, so nothing but a real
  lifecycle freeze produces genuine silence. Scope deliberately stayed **one scenario, not two**
  per the card: freeze/thaw only, migration stays with the existing `hostMigration` scenario.
  Asserts during the freeze (snapshot seq stall, and a **bounded** pose settle — remotes still
  extrapolate from last velocity capped at 50ms then hold flat, so the check is "no unbounded
  ghost-movement growth," not "zero movement") and after thaw (snapshots resume; `snap_gap` and
  `host_send_gap` fire on the first post-thaw send/arrival, since both counters are measured
  retrospectively and could not exist during the freeze itself; host identity unchanged — a freeze,
  not a migration; zero sim errors; joiner still drives normally). If the CDP lifecycle call proves
  unreliable in a given Chromium, the run records an INCONCLUSIVE rather than silently falling back
  to a fake CPU-throttle or in-page stub — that fallback ban was explicit in the card. `makeClient`
  now retains its CDP session (returns it as `cdp`) instead of opening and dropping it, additively —
  every other scenario ignores the new field. `--scenario hostFreeze`, `core:false` in
  [batteryPlan.mjs](../../tools/lib/batteryPlan.mjs) (opt-in, same reasoning as friendsLobby).

Docs: [netcode-harness.md](../guides/netcode-harness.md) scenario list now names all seven
scenarios (`shardOverflow` was missing entirely) and the stale 07-17 "coverage gap" note is closed
out (`teardownRejoin` has covered it since it shipped).

### August 6, 2026 — BACKLOG-GATE-1: this file's index stops drifting by hand

**Writeup added 08-06 during a later BACKLOG audit, not by the session that shipped it.** The five
levers landed and the row was retired, but no entry was ever written here and the id never reached
the closed do-not-reopen list — which is the exact failure the card exists to prevent, since the
hygiene gate is blind to an id that appears in neither place. Reconstructed from the commits.

- *(Tech Debt · Medium)* **BACKLOG-GATE-1** — BACKLOG.md's "status at a glance" counts and its
  closed list were maintained by hand, so both drifted silently: a row could close without the
  counts moving, and a closed id could vanish from the record entirely. Shipped as five separate
  commits — `8b52d75` (lever 1, flatten every row into one id-aware list), `9863f61` (lever 2,
  **generate** the glance box, `npm run backlog`), `f0be985` (lever 3a, complete the closed
  do-not-reopen list), `f4dde49` (lever 3b, arm `validateBacklogHygiene` inside `health:check`),
  `c14c3be` (lever 4, house rules in the file plus an AGENTS.md pointer). The counts box is now
  generated and cannot drift; the gate reads the file mechanically. **One check ships as `warn`,
  not `error`** — `BACKLOG_WORKORDER_CLOSED_HAS_ROW` parses hand-written Work-order prose with a
  nearest-left-before-✅ heuristic that had one documented false positive during design, so
  promoting it is its own card, **BACKLOG-GATE-2**, which stays open. That warn has since earned
  its keep: it caught a real inconsistency on 08-06 (RESULTS-1 struck in the Work order while its
  row was still open pending playtest), a true positive, which counts toward GATE-2's promotion
  bar rather than against it.

### August 6, 2026 — Block G wave: PT-CARD-SPLIT-1, PT-CONSOLE-READY-1, HOOK-COMMENT-1, CC-ESC-1

Wyatt picked Block G (the tooling-window batch) as the next wave, one commit per card, so tomorrow's
playtest day runs on a console that can't repeat two failures the queue had already paid for. No
game card was active, so the `tools/`/`.claude/hooks/` freeze was lifted for the sitting.
`npm run qa` green (1559/1559) across all four; pushed and `verify:head`-confirmed.

- *(Tech Debt · Medium)* **PT-CARD-SPLIT-1** — playtest console had no way to flag a multi-issue
  card, the exact MAIN-1 shape where a real defect (the toast under the boost bar) rode inside a
  green PASS invisibly — ✅ **CLOSED 08-06.** `multiIssueWarnings()` in
  [playtestQueue.mjs](../../tools/lib/playtestQueue.mjs) flags two narrow signals: more than 5
  numbered steps (a legit single check runs 2–4; MAIN-1 had 7), or ≥2 distinct foreign work ids
  found in a card's `steps`+`tail` only. Scope is deliberately narrow — `do`/`context` are never
  scanned (would false-positive today: NET-LOOK-ACC-1's goal sentence names
  NET-AUDIT-SLOTS-LOOK-1, SHARD-PT-2's names SHARD-PT-1) and the bar is ≥2 foreign ids, not ≥1
  (a single cross-ref in a step is ordinary card prose — UI-P2-PAUSE-PT-1's steps cite
  TOUCH-HOVER-1 and must stay clean). The multi-id scan uses a shared `WORK_ID_RE` exported from
  [projectHealth.mjs](../../tools/lib/projectHealth.mjs) and `matchAll`, not `extractWorkId`
  (first-match-only, would miss a second foreign id inside the same step). Surfaced three places:
  a generation-time log line, a server-rendered banner on the console page itself (author sees it
  before Wyatt does), and a `## CARD WARNINGS` block in the Copy report export; the
  `playtest-queue.json` sidecar also carries `warnings`. **Warning only** — no `health:check` gate
  yet (needs a few real exports without a false positive first) and no auto-splitting rows (the
  split has to happen in BACKLOG, where PASS bookkeeping is anchored). **Verified against the live
  queue:** regenerated at HEAD, 8 real cards, `warnings: []` — 0 false positives, including the
  UI-P2-PAUSE-PT-1 near-miss staying correctly under the bar. Tests: 8 new cases in
  [playtestQueue.test.js](../../tests/playtestQueue.test.js).
- *(Tech Debt · Medium)* **PT-CONSOLE-READY-1** — the export only ever reminded agents to close
  PASSes, never to check that remaining owed cards still have steps — exactly how PERF-9CELL-1
  shipped stepless on 08-05 — ✅ **CLOSED 08-06** (reminder, not prevention — an honest scope, not
  a promise this stops a stepless BACKLOG row from seeding). One unconditional line added to
  `buildMarkdown()` in [playtestConsoleHtml.mjs](../../tools/lib/playtestConsoleHtml.mjs)
  immediately after the existing triage line — placement is the whole card: it sits **outside**
  `if (closable.length)`, the block that stays silent on a zero-PASS export (the PERF-9CELL-1
  path). Test proves this structurally rather than by executing the client script (`buildMarkdown`
  is closed over browser-only state — localStorage, DOM ids — that nothing in this suite runs): it
  asserts the reminder push sits at the same statement depth as the triage-line push, between it
  and the `if (closable.length)` gate, so no runtime state can suppress it.
- *(Engineering · Low)* **HOOK-COMMENT-1** — `guard-git-add.mjs`'s header comment pointed the
  strict-JSON-not-JSONC caveat at "AGENTS.md § Enforcement", which now carries only the summary —
  the caveat moved to `docs/guides/hook-enforcement.md` — ✅ **CLOSED 08-06.** Comment-only,
  confirmed the target doc actually carries the caveat before repointing; zero behaviour change.
- *(Tech Debt · Low)* **CC-ESC-1** — two `esc()` implementations had silently diverged:
  `montage.mjs`'s escaped `[&<>"]`, `ccStyle.mjs`'s also escaped the apostrophe — ✅ **CLOSED
  08-06.** `montage.mjs` now does `export { esc } from "./ccStyle.mjs"` — a re-export, not a
  wrapper, so the two functions can no longer drift because there is only one. The four consumers
  (`sheet.mjs`, `podium.mjs`, `loadshots.mjs`, `states.mjs`) import `esc` from montage unchanged.
  Behaviour delta is exactly the apostrophe (`'` → `&#39;`, identical rendered result). Tests in
  [ccStyle.test.js](../../tests/ccStyle.test.js) assert all five reserved characters escape, and
  that montage's `esc` is reference-identical (`toBe`) to ccStyle's — not just behaviourally
  matching, which a wrapper could pass and still re-diverge later.

### August 6, 2026 — LOAD-SCALE-1: closed on geometry, not code

- *(UI · Medium)* **LOAD-SCALE-1** — mode-entry loading screen ~99% empty space above ~1000px
  wide — ✅ **CLOSED 08-06.** Filed against the pre-LOAD-POSTER-1 file (`loadingScreen.css`
  `.cr-load__visual` fixed at `clamp(88px, 22vw, 128px)`). Three commits since then
  (`106fc50`/`cc20174`/`4acf5d7`, Run 8) rewrote the whole surface as container-query posters —
  `.cr-load__stage` is `container-type: size`, the title sizes off the stage box
  (`clamp(32px, 18cqmin, 260px)`), `.cr-load__visual` is a bare full-bleed layer — the file's own
  header comment says this fixes "tiny art on a 1440p screen." Never re-verified against this row
  until the UI-SCALE-1 Pass 2 wave touched the same file. **Closing evidence:** fresh
  `npm run loadshots --surface mode` at HEAD (08-06) — all "overlay fits the viewport" checks
  green on all cells, 1920×1080 `-b-mid` frames show the poster filling the stage, title centred,
  not the filed postage-stamp-in-the-corner look. No code changed for this row specifically — the
  UI-SCALE-1 Pass 2 commits that shipped alongside converted `loadingScreen.css`'s *convertible*
  clamps to rem but deliberately left the container-query sizing (`cqmin`) that LOAD-POSTER-1
  built, untouched. Same class of trap as UI-SCALE-1's own row this session: a BACKLOG row and
  its evidence screenshots can go stale once the fix that moots them lands under a different
  card's name, and nothing re-checks the row until someone happens to touch the same file again.

### August 6, 2026 — HARNESS-NULL-1: null-control arm on perf-profile

- *(Engineering · Medium)* **HARNESS-NULL-1** — no measurement rig had a null-control arm; every
  A/B number was unfalsifiable — ✅ **CLOSED 08-06** (code `8992816` + `00da0aa`; full close after
  ≥3 same-adapter calibration runs).

**What shipped.** Pure `evaluateNullDelta` ([tools/lib/nullDelta.mjs](../../tools/lib/nullDelta.mjs),
9 unit tests) — either arm non-finite → FAIL (stricter than soakGrowth). `perf-profile --null`
([tools/perf-profile.mjs](../../tools/perf-profile.mjs)): shared-page sequential `goto` lifecycle
**identical to normal mode** (Option A); classic/low runs AB+BA schedule (A1,B1 then B2,A2); split
result (one pair pass, one fail) → full FAIL + `orderBias` and does **not** count toward
calibration; `drawCalls > 0` sanity on both arms; default floor 1.5 ms via `--nullFloor` labeled
`provisional-default` in JSON; `--nullDiscardFirst` is the single hygiene remedy; exit 1 on FAIL.
Not in `qa` / battery.

**Calibration series (classic/low, `--gpu`, same adapter, n=3 all PASS):**

| run | gpuVendor (short) | AB \|Δ\| gpu | BA \|Δ\| gpu | AB \|Δ\| frame | BA \|Δ\| frame | exit | orderBias |
|-----|-------------------|--------------|--------------|----------------|----------------|------|-----------|
| 1 | ANGLE NVIDIA GeForce RTX 4090 D3D11 | 0.100 | 0 | 0 | 0 | 0 | false |
| 2 | same | 0.200 | 0.200 | 0 | 0 | 0 | false |
| 3 | same | ~0 | ~0 | 0 | 0 | 0 | false |

Max counted \|Δ\| gpu ≈ 0.20 ms ≪ 1.5 → keep default floor; **floorStatus = `provisional-n3`**
(weak stats by design — not "calibrated variance"; upgrade path HARNESS-NULL-N5-1). JSON artifacts:
`shots/perf-null-run{1,2,3}.json` (gitignored).

**Category boundary (do not over-read).** Null-control for **headless perf-profile only**
(`?perfPump` + `?freeze` + `gl.finish`). Does **not** unpark PERF-PASS-1, does **not** replace
live F8 A-B-A / PERF-9CELL, does **not** claim Intel-box variance. This series is RTX 4090; a
SwiftShader/software green is non-authoritative for Intel F8. Block C's next evidence step remains
cap-254–260 + PERF-9CELL protocol when unparked — with a machine-checkable null on this rig.

**Command:** `npm run perf:profile -- --null --level classic --preset low --gpu`

---

### August 5, 2026 — TIER-DEFAULT-1: hardware-aware first-run quality tier

- *(Engineering · High)* **TIER-DEFAULT-1** — first-run quality tier defaulted to Medium on
  integrated GPUs that can only hold Low (cap-288: Intel UHD menu at 5.0–8.6 fps for ~3.3 s every
  visit, until the auto-quality watchdog rescued it) — ✅ **CLOSED 08-05.**

**Mechanism.** `detectDefaultQualityTier()` asked `probeGpu()` for a GPU class, but the classifier
had only three values — `software` / `discrete` / `unknown` — so an Intel UHD renderer string
matched neither real pattern and fell through to Medium.

**Scope expanded past the seated card.** The seated lever was one regex (`Intel … HD/UHD` → low).
Wyatt's call this session was to make the whole hardware→tier mapping real: high-end → High,
mid-range → Medium, integrated/weak → Low. Shipped as five separately-acked, separately-revertable
levers:

1. **6-rung GPU taxonomy + pure tier policy** (`86a6015`) — widened `GpuClass` from 3 to 6 values
   (`software` / `igpu-basic` / `igpu-modern` / `discrete-entry` / `discrete` / `unknown`) via an
   ordered regex table in [gpuCaps.js](../../src/utils/gpuCaps.js), and extracted the decision into
   a pure `defaultTierForCaps()` — unit-testable without owning six machines
   ([tests/gpuCaps.test.js](../../tests/gpuCaps.test.js), ~40 renderer strings + the ordering traps
   an adversarial review named: RX 5500 XT vs RX 550, GTX 1060 vs 1050, Apple M3 Max, AMD Radeon
   780M, Meteor Lake `Intel(R) Arc(TM) Graphics`).
2. **One-shot stored-tier migration** (`83c584e`) — the auto-quality watchdog never writes to
   `localStorage`, so returning visitors (including Wyatt's own Intel box — cap-288 shows
   `qualityTierStored: "medium"` beside effective `"low"`) kept the slideshow every visit. A pure,
   one-shot `migrateStoredTierIfNeeded()` rewrites a stored `"medium"` to `"low"` on igpu-basic/
   software hardware, gated by a new `cartRaveTierMigration` key so it never re-fires.
3. **Six-class host-capability score** (`a6267de`) — `scoreHostCapability()` previously collapsed
   an Intel UHD and a GTX 1050 laptop into the same 40-point "iGPU/unknown" bucket for lobby host
   election. Extended to `software 8 / igpu-basic 25 / igpu-modern 45 / discrete-entry 55 /
   discrete 75 / unknown 40`.
4. **Reduced-motion demotes one rung, not hard-pinned to Low** (`17bfb15`) — cap-287/288 showed the
   same box booted Low with Windows animations on and Medium with them off; an OS accessibility
   toggle was silently picking the graphics tier. Now steps the verdict down one rung instead
   (high→medium, medium→low). Real fix (actually reducing motion) filed as **MOTION-A11Y-1**.
5. **4K backing-pixel guard** (`fc8bb4e`) — resolution was previously ignored entirely.
   `HIGH_TIER_MAX_BACKING_PIXELS = 8,000,000` demotes a `discrete` High verdict to Medium above
   that ceiling (true 4K/5K; a MacBook Pro 16" at 2× stays High). **Named consequence, not a bug:**
   since this is a resolution guard and not a GPU-model guard (deliberately no NVIDIA/AMD model
   parsing — see "Declined" below), **a 4090 on a 4K monitor now boots Medium.** Escape is one
   click: the menu segmented control or `?preset=high`.

**Adversarial review caught three real blockers before this shipped**, all fixed in the plan before
any code was written:

- **Apple M-series reverted to no change.** An early draft moved bare M1–M4 to Medium; cap-288 is
  Intel-only evidence, and a wrong-Low verdict is permanent for the session while a wrong-High
  self-heals via the watchdog in ~3.3 s. Bare Apple M stays classified `discrete` → High.
- **`?forcegpu=igpu` kept its exact legacy meaning** (`unknown`, not the new `igpu-basic`) — it is
  dev muscle memory and a live Tweakpane option in
  [systems.js](../../src/dev/modules/systems.js).
- **The lever-4/lever-5 stack is named, not hidden:** a 4K discrete box with reduced-motion on
  demotes twice (high→medium via the guard, then medium→low via the RM rung) — covered by an
  explicit test and called out for the real-hardware playtest.

**Declined this session:** NVIDIA/AMD model-number parsing to split mid-range discrete into its own
tier (would have caught the external-review F-03 finding — a GTX 1660 Ti in the same discrete→High
bucket as a 4090 — but every threshold would be a guess on ~200 SKUs, permanent-loss direction).
**PERF-TIER-1**'s `high-lite` rung stays open, unblocked by this decision. A step-up path for the
auto-quality watchdog (the measured 3.5× tier-cost ratio on the Intel box means a step-up from Low
would oscillate straight back to Medium) — belongs to **PERF-WATCH-1**. Persisting the watchdog's
own demotions under a separate key — a stored-*preference* migration (lever 2) is not the same
decision and stays with **BACKLOG**'s existing note under autoQuality.js.

**Verified:** `npm run qa` (all 7 gates) green after all five levers; dev spot-check via `?forcegpu=`
and `?gpustr=` confirmed the store→UI wiring end to end, including cap-288's exact renderer string
resolving to Low and the stale-`medium`→`low` migration firing on a seeded stored value.

**Real-hardware verification found a second bug first.** `git push` only updates GitHub, not the
live Worker — the code sat unshipped while Wyatt's first Intel-box F8 pass (cap-290/291/292) still
read `build.sha: "1050e92"`, seven commits behind, with `gpuClass: "unknown"` reproducing the exact
original cap-288 pattern (medium → watchdog step to low ~2.5s later). cap-290 also carried a 28.2s
+ 3.6s back-to-back longtask (Wyatt's "froze up") — real, but pre-existing Intel-UHD warm-up cost
tracked separately under WARM-SOLO-1, not a TIER-DEFAULT-1 regression.

**Shipped** (`npm run ship`, Worker `d91f34a6-2ad4-4bbe-9858-1e39ea83e1b5`, entry
`index-BKAcELHu.js`). Post-deploy: polled `GET /` until the entry hash flipped (~15s edge
propagation) and confirmed 0×404 on the entry + key hashed chunks, then pulled the live bundle
directly and grepped it for `igpu-basic` to confirm the new classifier — not just a new build, but
the new *code* — was actually being served.

**Wyatt PASS, both boxes, live 08-05.** Intel UHD (the actual cap-288 hardware): confirmed working
after the reload, no repeat of the slideshow. RTX 4090: confirmed working. This is Wyatt's direct
sign-off, not five discrete capture-backed playtests — no fresh F8 exists post-deploy (the last
capture on file, cap-292, is still from the pre-deploy broken run). The granular sub-verifications
originally scoped (PT-3 4K-guard prediction on the 4090's actual monitor, PT-4 two-box
host-migration direction, PT-5 reduced-motion on a sub-4K panel) were not individually exercised —
named here as residuals, not reopened as blockers, since the measured bug this card was filed
against is confirmed fixed on the hardware it was measured on.

---

### August 5, 2026 — DEPLOY-STALE-HTML-1: post-deploy stale HTML blank page

- *(Engineering · Medium)* **DEPLOY-STALE-HTML-1** — for ~45 s after `npm run ship`, `GET /`
  could serve the previous build's HTML while Workers Assets only had the new hashed files →
  entry 404 → blank/hung boot — ✅ **CLOSED 08-05.**

**A — process (agent / verify de-noise):** AGENTS.md post-deploy rule — poll `GET /` + every
hashed asset it references until **0×404** before sharing URL or starting prod playtest; do not
deploy near a public post. That is what stops false FAILs on the rest of the queue.

**B — client heal (visitor safety net):** `index.html` inline boot script. On prod entry
(`/assets/index-*.js`) or dynamic-import failure: poll fresh `GET /` + HEAD of the *current*
entry named by that HTML (cap 60 s, ~2.5 s interval) until 200, then one **hard**
`location.replace` with `_boot=` cache-buster. sessionStorage `cc-deploy-heal` one-shot; second
fail → existing boot-error panel; Retry clears the flag and hard-reloads. Dev `/src/main.js`
never auto-heals (keeps HMR 8 s panel). `main.js` clears the flag on successful boot.

**Not used:** immediate one-shot `reload()` (burns the heal while the PoP is still stale);
HEAD-only of the failed old hash (never becomes 200 under the documented mechanism).

**Shipped:** `1050e92` · Worker `4d390947-af69-4d1b-9545-fe6af9645e39` · entry
`assets/index-BliU0udj.js` · post-deploy asset poll 16/16 × 200 with heal symbols present in
live HTML + main clear in entry.

---

### August 5, 2026 — BACKLOG audit: 4 finished rows retired, 2 absorbed, work order re-ranked

Wyatt asked for a sweep of rows that were already done but still sitting open, then a re-rank of
what remains by unblocking value. Every closure below was checked against the code or `git log`,
not against the row's own ✅ badge.

- **QUICKPLAY-SHARD-1** *(Engineering · High)* — row retired. It still read "SHIPPED, awaiting
  playtest"; the playtest had already happened — **SHARD-PT-1 PASS on prod `9c333d1`** — so the row
  outlived its own gate by a day. Full writeup already lives below (*the four-humans-worldwide cap
  is gone*); nothing new is recorded here. **SHARD-PT-2 is a separate row and stays open for launch
  day.**
- **ARCH-DRIFT-1** *(Tech Debt · Low)* — ✅ **CLOSED.** Shipped `91b39aa` (symbol anchors in
  control-flow.md + a resolution test) and recorded deployed in `222a4a8`; the false FRAGILE claims
  it was filed against were corrected earlier in `886b551`. The row survived its own fix.
  **Named residual, deliberately not re-filed:** a few hardcoded `:NNN` refs remain in
  `archMap.mjs`'s curated prose (`main.js:283`, `netcode.js:434`, `netcode.js:2260`). The anchors
  *rule* is now test-enforced for the doc that actually drifted, and `arch:check` / `health:check`
  gate the generated manifest — so those are a style residual, not an ungated surface. Re-file with
  evidence if they drift again.
- **BUNDLE-1 duplicate row** *(Tech Debt · Low)* — removed. The card closed partial on 08-05 and its
  writeup already lives in the STATUS active queue and [bundle-1.md §0](./bundle-1.md); the Tech
  Debt copy was a second source of truth for a closed card. **CHUNK-MEMBER-1 is its live successor**
  and is explicitly not a reopen — cold-visit membership, no warm-perf goal.
- **Host-reload mid-round live confirm** *(Engineering · Low)* — ✅ **CLOSED.** The automated half is
  done (netharness `hostReload` / SHIP-1 A6) and the row itself called the remainder "optional live
  HOST-tab feel smoke only — not blocking". A card whose only remaining content is optional and
  non-blocking is not a queue item; it rides the next HOST-tab wave if anyone wants it.

**Absorbed, not closed** — finished by merger, and leaving them as rows meant two places claimed
the same work: **ART-MAT-1** → **CART-MODEL-1** (which owns the cart material contract and the
Blender pass) and **ONBOARD-1** → **ONBOARD-SLIDES-1**. Both rows already *said* they were absorbed
and then sat in the queue anyway. If a one-shot controls reminder is still wanted after slides ship,
it gets filed fresh with its own evidence rather than reviving the stub.

**Verified still open** — each of these reads as closeable from its own row and is not, so they were
checked rather than assumed: **HOOK-COMMENT-1** (AGENTS.md § Enforcement carries no strict-JSON
caveat, so `guard-git-add.mjs:78` still points at content that moved to `guides/hook-enforcement.md`)
· **PT-CARD-SPLIT-1** (nothing in `tools/` enforces the one-issue rule — it is prose only) ·
**PT-CONSOLE-READY-1** (the 08-05 export's preamble still only asks agents to close PASSes) ·
**AUDIO-MASTER-1** (`_masterVol` is assigned in two places and read in none) · **CC-ESC-1** (both
implementations still live — `ccStyle.mjs:154` and `montage.mjs:19`).

**Re-ordering.** BACKLOG § Work order was re-ranked by *unblocking* value rather than severity, and
every item now names what it unblocks — that clause is the reason it sits where it sits. The
substantive moves:

- **Block A's remaining three were TIER-DEFAULT-1 → DEPLOY-STALE-HTML-1 → NET-LOOK-ACC-1.**
  DEPLOY closed the same day (writeup above). Ship bar now: TIER-DEFAULT-1 → NET-LOOK-ACC-1.
- **Block B renumbered** (it restarted at 6 and collided with Block A) with **UI-SCALE-1 first on an
  explicit rationale**: it changes the unit system every other UI card is authored in, so RESULTS-1 /
  COLOR-ID-1 / UI-FRAME-1 / ESC-panel / ONBOARD-SLIDES-1 / MENU-CART-1 are all cheaper after it and
  all get re-done if they land first. CART-COLOR-DEPTH-1 moved above COLOR-ID-1 so the glyphs are
  drawn against a settled colour language.
- **Block C now starts with HARNESS-NULL-1, not the sweep.** Until a rig can show it reports ~0 when
  nothing changed, every A/B number this repo prints is unfalsifiable — and run-4's "GC metronome"
  attribution was already wrong once. TIER-DEFAULT-1 is a hard precondition too: running the sweep
  first measures a default tier the game is about to stop using.
- **Block G leads with PT-CARD-SPLIT-1 + PT-CONSOLE-READY-1** — the two cards that stop the next
  export from repeating failures this queue has already paid for (a multi-issue card hiding a defect
  inside a green PASS; an owed card shipped with no runnable steps, which is how PERF-9CELL-1 FAILed).
- **Block F leads with RAPIER-DEFAULT-MAX-1** (prose only) because it is load-bearing *false* prose:
  it is the stated reason Classic's walls take no restitution rule, so the next physics editor
  reasons from a wrong model of Rapier until it is corrected.

---

### August 5, 2026 — DIAG-UPLOAD-GEN-1: generation-guard the auto-capture upload continuation

- *(Engineering · Low)* **DIAG-UPLOAD-GEN-1** — auto-capture upload continuation was not generation-guarded, so a torn-down / re-installed hub could still POST a bundle labelled against a dead session — ✅ **CLOSED 08-05**. Residual of DIAG-FLAKE-2 (that card fixed deferred *assembly*; this is deferred *send*). **Fix:** `scheduleAutoCapture` passes `scheduledForGeneration` into `uploadAutoCapture`; Guard 1 drops before `uploadCaptureBundle` if `hubGeneration` moved during the dynamic-import yield; Guard 2 skips success/fail logs only if gen moved after fetch started. Deliberately **no** AbortController / teardown cancel — fire-and-forget on every axis stays intentional. Test: bumps gen in the same macrotask after the assemble timer returns and before import microtasks flush; asserts `postsFor("gen-move-probe")` empty. Verified: `tests/diagnostics.test.js` 26/26 · `npm run qa` green (1497 tests).

### August 5, 2026 — playtest export: 6 PASS closed, 1 FAIL triaged, 1 SKIP held

Wyatt's export off HEAD `4077a4a` — **6 pass / 1 fail / 1 skip**. All six passing rows were deleted
from BACKLOG § Playtest owed the same session they were reported, per the standing rule.

- *(UI · High)* **UI-SCALE-RESULTS-PHONE-1** — ✅ **PASS 08-05.** Portrait phone results read
  ranks-over-receipt; the short-window clobber did not return.
- *(UI · High)* **UI-SCALE-RESULTS-WIDE-1** — ✅ **PASS 08-05.** Landscape phone keeps ranks left /
  receipt right with a usable rank column, so the portrait stack is not being forced sideways.
- *(UI · Medium)* **UI-SCALE-FEED-PHONE-1** — ✅ **PASS 08-05.** In-match kill feed is phone-scaled
  and no longer eats the boost / score chrome. **These three close the UI-SCALE-1 residual batch**
  (shipped through `f057abe`); UI-SCALE-1 itself now has phone evidence on all three of its
  residual surfaces.
- *(Engineering · High)* **NET-AUDIT-INPUT-1** — ✅ **PASS 08-05.** Joiner drives out of spawn, hops,
  and holds a full nitro charge window across a jittery burst — the seat gate did not cost the
  non-host their input path.
- *(Engineering · High)* **NET-AUDIT-SLOTS-READY-1** — ✅ **PASS 08-05.** Ready chips stick on both
  machines and the room still arms countdown on the manual-Ready Friends path.
- *(Engineering · High)* **NET-AUDIT-SLOTS-LOOK-1** — ✅ **PASS 08-05, with a named limit.** Palette
  color and Customize neon hex both retint both peers, which is what the card asked. **But Wyatt's
  note carried a real defect:** *"the non hosts sunglasses and pattern are wrong/not showing
  correctly. color is correct though."* That is a second mechanism, not a residual on this card, so
  it is filed as **NET-LOOK-ACC-1** (Engineering, High) rather than downgrading a verdict the card's
  own steps earned. The split is itself the diagnostic — color crosses the wire, so transport works
  and the gap is in the payload or the remote apply.
- **All three NET-AUDIT cards were seeded as "unpushed wave A (`145cc95`)" but wave A is on
  `origin/cart-clash`** as of this session, so these passes count against shipped code, not just a
  dev server.

**FAIL — PERF-9CELL-1**, and the card was at fault. Wyatt: *"idk what you are asking me to do
here."* The row said "run the handover's 9-cell matrix" and left the protocol 300 lines deep in a
484-line doc, so the console handed him a ~25 minute measurement sitting with no cells in it — and
its parent **PERF-PASS-1 has been parked since 08-04**, so the sweep was queued ahead of the card
that would consume its numbers. Fix, at Wyatt's call: the row is **parked with PERF-PASS-1 and no
longer seeds the console**, and was rewritten self-contained — URL template, setup, per-cell
capture, the eight tokens in order with `none` first and last, and the ±1.5 ms drift-void rule all
inline — so it is runnable off the row the day PERF-PASS-1 unparks. **This is the second time in
two days that a card failed for being unactionable rather than for the code being wrong** (see the
research-card reachability note); a card that names a *protocol* must carry the protocol.

**SKIP — SHARD-PT-2** held open as designed: it needs five concurrent humans and is a launch-day /
public-post check. Not a failure, not closeable, deliberately left in the queue.

---

### August 5, 2026 — ATTRACT-JANK-1 closed on prod `5983896`

Block A #5 of the pre-launch Work order, and the card's premise turned out to be wrong: it was
filed as a perf problem, and the box was **idle** the whole time.

- *(Engineering · High)* **ATTRACT-JANK-1** — ✅ **CLOSED 08-05.** Instrument `e3d4d03`, fix
  `5983896`. Measure-first held: no knob was touched before a capture existed.
- **Lever 0 (instrument, `e3d4d03`):** nothing measured attract *cadence* anywhere — only cost
  reached the ring, and only on the frame a demotion fired. Added per-second `attractWindow`
  events (spacing + cost p50/p95/max, `overBar` against the watchdog's own `BAD_FRAME_MS`,
  `shotIndex`, tier, renderScale, levelId) plus `attractCut` / `attractHoldRelease` markers, on
  their own **`attract`** channel — `evictOneEvent` drops the oldest event of the *loudest*
  channel, so ~90 windows on `perf` would have evicted the `qualityStepDown` the verdict turned on.
- **Attribution (cap-287, Intel UHD, prod `e3d4d03`):** the machine was in the **reduced-motion**
  path at 816 ms spacing (800 + one rAF tick) — **1.25 fps**. Proven by `shotIndex` pinned at 0
  and **zero** `attractCut` markers across 97 s, which only that branch produces; cuts are
  wall-clock driven and would have fired ~6 times at any frame rate. Cost was **3–6 ms**: not a
  load problem. SHOOT-ANIM-1 (`6b27283`) turned level animation on for every path at once, so
  water, rotors, beacons and rave dressing began advancing in **800 ms steps** — animation at
  1.25 fps, one day before the report.
- **Lever A (`5983896`):** pin the animation clock while reduced motion is active. Pinned rather
  than skipped — `?t=` already defines a pinned-phase contract these updaters honour, and skipping
  would strand `updateLevelLod`, which rides the same callback but reads its own wall clock and
  must still react to an arena swap.
- **Lever B (`5983896`):** age samples out of the auto-quality ring after 4 s. The ring was bounded
  only by **count**, so a slow *feed* let a p95 come from frames long gone: at 1.25 fps the
  20-sample minimum spans ~16 s, and cap-287 demoted at t=44.6 s (renderScale 1 → 0.85,
  irreversible, carried into the round) on p95 24.7 from a boot-tail frame, while every window in
  the preceding 15 s measured under 9 ms. 4 s not 2 s so a 10 fps machine — the documented case,
  and the one the watchdog exists for — still demotes.
- **Evidence:** machine — qa green, 1485 tests; the Lever B test was verified **failing** with the
  age-out disabled, and is bracketed by two complements (a 5 fps feed still demotes, a *current*
  spike still demotes). Human — **cap-289** opens with a 151.8 ms frame, worse than the 97.8 ms one
  that demoted cap-287, and **no demotion fires**: same machine, same path, direct before/after.
- **Named limit (same shape as ONBOARD-FLAG-PT-1):** Lever A's *visual* result — that the
  reduced-motion menu now holds still instead of stuttering — was **never confirmed on screen**.
  It holds by construction (one clock, one call site, pinned) and by the ring showing the path is
  reached, not by a look at the menu. Cheap to confirm on any next reduced-motion visit.
- **Refuted, and worth keeping:** the throttle-beat hypothesis — that `FRAME_INTERVAL_MS = 33`
  beats against a 16.67 ms rAF and alternates 33/50 ms. cap-288 measured the normal path at
  spacing p50 **33.3** / p95 33.4 / **max 33.5** across ten consecutive windows. No beat. It was
  the second-ranked verdict and would have been built on plausibility alone.
- **Not done, deliberately:** the menu-side swap grace (three `attractHoldRelease` markers, no
  demotion after any — the hypothesis never fired) and the throttle-beat fix (refuted above).
- **Spun out:** **TIER-DEFAULT-1** — cap-288 showed the *first-run tier default* is medium on that
  box, which is a 5–8.6 fps menu until the watchdog rescues it 3.3 s later. Different root cause,
  whole-app scope, its own card.

---

### August 5, 2026 — FIX-MIG PASS on prod `a65d3c9`

Block A #4 of the pre-launch Work order. **FIX-MIG-PT-1 PASS** (Wyatt) after one FAIL + residual.

- *(Engineering · Medium)* **FIX-MIG** — ✅ **PASS 08-05**. Levers `18a413a` → `4428640` →
  `28c1a6c` (server `reason: "host_disconnect"` on `#ensureLiveHost`, client toast, continuous
  party-do). First PT FAIL: migration worked, **no toast** on the new host.
- **Residual fix (`a65d3c9`):** bare A→B `host_migrated` (no reason — warm DO still on pre-reason
  code, or any untagged handoff) is treated as disconnect for toast. First-host / null-host stay
  silent. Ghost/snapshot share the same "left" copy (Choice A).
- **Not touched:** picker, freeze, mid-round rebalance, SHARD, `host_return` quality-copy reuse.
- **Evidence:** machine — qa green + toast suite; human — FIX-MIG-PT-1 PASS on prod `a65d3c9`.

---

### August 5, 2026 — QUICKPLAY-SHARD-1: the four-humans-worldwide cap is gone

**SHARD-PT-1 PASS on prod `9c333d1`.** Quickplay was a single global Durable Object — four slots,
so four humans **worldwide**, and the fifth was closed 4004 with a dead-end toast. On a public
itch/Reddit post that fails within the first hour, in the mode strangers click first.

- *(Engineering · High)* **QUICKPLAY-SHARD-1** — ✅ SHIPPED 08-05 (`dbc6cdf` · `dd8e810` ·
  `d81dcbc` · `5c83451` · `c7ba5b8`). Public shards are `quickplay` + `quickplay2…quickplay20`;
  `isQuickplayRoom` is the single definition every mode and policy decision keys off.
- **The recorded design lock was wrong, and the row now says so rather than reading as if the hop
  was always the plan.** The lock said "Worker-side seat-finder". Occupancy does not exist anywhere:
  no accessor, no endpoint, no registry, and the DO has zero `this.ctx`/`storage`/`alarm` — all room
  state is in-memory. A seat-finder therefore meant a registry DO (new class, migration, a DO→DO
  write per seat change, staleness, a new failure mode) or probe-on-demand, which **instantiates**
  a shard just to ask and burns its random arena roll for a room nobody joins.
- **What shipped instead — a free channel that was already there.** The 5th socket is *not* refused
  at connect: it is accepted and sent a `hello`, and only refused at `join`. So a full **public**
  shard names the next one in `joinRejected.retryRoom` and the client re-dials. Emitted once in
  `#rejectPendingConn`; null for friends rooms, `quickplay__*` harness rooms, and past the cap —
  and null means exactly the old behaviour, so an old client is never worse off.
- **The hop had to beat two races, both live on a reject.** `onJoinRejected()` fires immediately and
  would toast back to the menu; then the socket closes 4004 and, because `hello` has already
  arrived, the close handler falls to `scheduleNetcodeRetry()` and would re-dial *the same full
  room* underneath the hop. `disconnectPartySession()` already sets the retry-suppression flag both
  socket handlers check and already documented itself as safe "before a new room join" — so no new
  flag was invented.
- **The URL rewrite is load-bearing, not cosmetic.** `detectGameMode()` reads the URL and nothing
  else, while the connect override only moves the socket: a socket-only hop would strand every mode
  decision, refresh and auto-rejoin on shard 1.
- **SEC-DIAG-1's regression bar is met.** A shard returns mode `quickplay` — pinned in units, source
  -asserted at the wiring, and confirmed live by the rig. Without it, the private CHECKOUT LINE
  lobby (with its invite link) would appear in public matchmaking and the prod score-cheat gate
  would disarm.
- **Known limit, deliberately accepted and instrumented.** Hops are sequential, so at peak the Nth
  player pays one connect round-trip per full shard. `quickplay_shard_assigned { shard, hops }`
  measures it: deep or frequent chains are the signal to build the registry, and if they never
  appear the registry was correctly never built.
- **Evidence:** `npm run qa` green (122 files / 1475 tests) · party-do covers `retryRoom` against
  genuinely full rooms (full is *structural* — no NPC slot left — not a constant), the cap, the
  harness carve-out, and shard arena/difficulty parity · `netharness --scenario shardOverflow`
  **5/5 live in real browsers** · **SHARD-PT-1 PASS on prod**, which is the case ~every real player
  will ever see.
- **SHARD-PT-2 is deferred, not passed.** It needs five real humans and Wyatt does not have them:
  *"i wont be able to test this until the public playtest."* Carried into the launch-day checks in
  [BACKLOG § Work order](./BACKLOG.md). The residual is live infrastructure under real concurrency,
  not the mechanism — which is rig-proven and whose common case passed on prod.
- **One process exception, recorded:** `tools/netharness.mjs` was touched during a game card
  (AGENTS.md freezes `tools/`). Wyatt authorized it in the design ack. It earned the exception
  because party-do proves the *server* sends `retryRoom` while nothing else exercises the *client*
  race, and only a real browser runs that race. Isolated in `c7ba5b8`.

---

### August 5, 2026 — SEC-DIAG-1 + ONBOARD-FLAG-1 PASS 4/4 on prod `fbe8163`

First two cards of the pre-launch **Work order** queue (BACKLOG § Work order, from the 08-05 audit
that set a public itch/Reddit post as the launch shape). Both shipped, deployed, and passed 4/4 with
no FAIL.

- *(Engineering · High)* **SEC-DIAG-1** — ✅ PASS 08-05 (`649b4ac`). `devControl` attaches in PROD
  under `?diag=1` so live MP round-end bugs can be reproduced; the cost was that a **quickplay host
  could set their own score**, flagged in-code since Run 6 as *"revisit before any public launch"*.
  Two levers: the round levers (`setScores` / `forceSuddenDeath` / `rewindRoundClock`) now refuse in
  public quickplay on prod builds, and `grantKos` is absent outside DEV on the SEC-UNLOCK-1
  precedent. **SEC-DIAG-PT-1** (quickplay refuses, `reason: public-room`, no score moved),
  **SEC-DIAG-PT-2** (solo still drives the levers) and **SEC-DIAG-PT-3** (F8 still uploads) all PASS.
- **The gate is a conjunction, and that is the design.** `!isDev && mode === "quickplay"` — gating on
  the room alone would have broken `tools/netharness.mjs`, which drives `room=quickplay` and calls
  `control.setScores` against a **dev stack**. PT-2 exists precisely because a gate that refused
  *everywhere* would have passed PT-1 while silently killing the live repro workflow.
- **Evaluated at call time, not attach time.** menu → solo → menu → quickplay happens without a page
  reload, so a mode captured at construction would outlive its room. Fail-closed on an unknown mode,
  since `resolvedPartyRoomFromUrl` already defaults a missing `?room=` to `"quickplay"`.
- **Known dependency, recorded on the shard card:** the gate asks `detectGameMode() === "quickplay"`,
  which is an exact match — `quickplay2`/`quickplay3` classify as *friends*. **QUICKPLAY-SHARD-1 must
  land the shared predicate or SEC-DIAG-1 reopens on exactly the rooms that card creates.** That is a
  security requirement of the shard card, not free inheritance.
- *(UI/UX · Medium)* **ONBOARD-FLAG-1** — ✅ PASS 08-05 (`f0fe90f`). `howtoSeen` was written when the
  first-run auto-open was merely **armed**, before the 600 ms timer and before anything confirmed the
  overlay rendered — so any disarm inside that window consumed a player's only tutorial permanently.
  The write moved into `openHowToScreen()` **after both early returns**; placement is the whole fix,
  since a write above the phase guard re-creates the bug for the mid-round bail.
- **Honest limit on ONBOARD-FLAG-PT-1's PASS.** Wyatt could not execute step 2 — *"i cannot click solo
  that fast so i think this is a non issue lol"* — so the human skip-click was never performed, and
  he is right that the 600 ms window is hard to hit deliberately on a fast desktop. The property still
  holds by construction rather than by that click: there is now exactly **one** write site (asserted
  in `tests/onboardFirstRun.test.js`), it sits inside `openHowToScreen` past both guards, and the
  agent confirmed live on the dev build that the flag is written when the overlay opens and that a
  reload does not re-open it once set. **Frequency is low; the fix is free and removes a
  permanent-loss failure mode.** Do not re-open on frequency grounds alone.
- **Trap recorded as a test, not a comment.** Disarming inside `openHowToScreen` looks like the
  obvious companion change and would break boot: `show()` calls `closeHowToScreen()` first and boot
  calls `show()` twice, so the auto-open only survives because internal closes keep it armed. A test
  now fails if anyone adds that disarm.
- **Evidence:** prod `fbe8163`, cap-285 / cap-286 (complete bundles, 19 snapshot namespaces, 70
  events) — which is what closed PT-3 rather than the on-screen confirmation alone.

---

### August 5, 2026 — FIX-EMISSIVE PASS 2/2: the trim survives on the cache, second time around

**Wyatt PASS on prod `a7dfd8f7`** — FIX-EMISSIVE-1 *"they dont read blown out"*, FIX-EMISSIVE-2
classic leader stays dimmer. Closes a card that was **aborted once**.

- *(Art/Engineering · Medium)* **FIX-EMISSIVE** — ✅ PASS 08-05 (`8dce55f`). A pattern was the only
  thing reducing emissive AREA, so `classic` carts showed full-area trim glow — and classic is not
  rare: remote humans are always classic (patterns are not networked) and the NPC pool draws it
  2/7. Trim now lives on the material cache as `emissiveTrimMul`, read by both writers.
- **Why the first attempt (08-04) was aborted, and the general lesson.** It threaded the trim
  through `intensityMul` — **a per-call argument**. The unguarded every-frame leader-glow loop
  calls `applyThemeColorToCache(cache, themeId, hex)` with three arguments, so the mul defaulted to
  `1` and the trim was erased within a frame. *If a value must persist per-object, it belongs on
  the object's state, not on the call that happens to set it first.*
- **Wyatt's plan review caught a must-fix that would have shipped the fix inverted.** My plan set
  the trim at cache birth. But match spawn is `prepareRaveGltfCart(mesh, color)` — two arguments,
  `patternId` defaults to `"classic"` — so **every match cart is born classic** and the real
  pattern only lands later in `updateCartMaterialsFromSlots`. Birth-only would have trimmed the
  whole grid and never restored patterned carts, **while the menu preview still looked correct**.
  The helper is now called at all four sites that decide a pattern, and stamped on `mesh.userData`
  so cache rebuilds rehydrate. *A constructor is not where state is decided if callers can skip
  the argument.*
- **The test that would have lied.** A suite written against `prepareRaveGltfCart(root, hex,
  patternId)` passes while every cart in a real match is wrong. The suite therefore asserts the
  **slots path**, and one deliberate source assertion pins the two live wirings. **Falsified, not
  assumed:** reverting the leader-glow line to its old hardcoded `1` fails test 3 and only test 3.
- **Known limit, shipped knowingly:** the leader blend is
  `base*(1-whiteMix) + glowIntensity*whiteMix` and `glowIntensity` is absolute, so classic and
  patterned converge at the peak white flash. The playtest row said so up front, so it came back
  as a PASS rather than a surprise FAIL.
- **The look note that came back with the pass is a different card.** Wyatt: the carts now read
  *pastel*, and patterned ones *too dark*. That is chroma, not intensity — filed as
  **CART-COLOR-DEPTH-1** with the mechanism for both halves, deliberately **not** as a residual
  here. Recording it separately is the same discipline that produced HUD-TOAST-Z-1 in the first
  place: a real finding must not ride inside another card's verdict.

### August 5, 2026 — HUD-TOAST-Z-1 PASS 6/6: the toast stops losing to a stacking context

**Wyatt PASS on prod `100842ad`, 6 cards, no FAIL** — TOAST-BOOST-1 · TOAST-NARROW-1 ·
TOAST-PAUSE-1 · TOAST-PHONE-1 · TOAST-QUICK-1 · TOAST-LOBBY-1.

- *(UI · High)* **HUD-TOAST-Z-1** — ✅ PASS 08-05 (`4507a55`). `#cr-unlock-toast` sat at
  `z-index: 12000` as a body-level singleton while `#hud` is `position: fixed; inset: 0;
  z-index: 20000` — **a stacking context, so every HUD child won regardless of its own
  z-index.** Fixed on two axes: **12000 → 26500** (above the lobby 24000, results 25000 and
  pause 26000; below `#rotate-prompt` 27000) **and** a measured bottom offset.
- **It was never a diagnostics bug.** Reported against the F8 capture toast, but
  `window.CartRave.showToast` is the session-flow path that already carried the **shipped**
  host-migration family, the weak-host warning and the host-stalled notice. Live multiplayer
  text was being swallowed. Re-ranked Medium → High on that basis.
- **"Pick one, not both" was wrong, and checking it was the whole value of the planning pass.**
  The card offered a z-index lift *or* a bottom offset. Neither alone satisfies the card's own
  pass line: the lift alone puts the toast **on top of** the boost meter, and the offset alone
  cannot touch the friends lobby, where `.hud-lobby` is a full-screen body-level surface and
  where the migration toasts actually fire. Both shipped.
- **The offset is measured, not a constant.** `.hud-region-pod`'s `bottom` is three different
  values across two media queries and the pod is a bottom-anchored column that grows with the
  combo badge and ready button — the card's suggested flat `88px` lands *inside* the pod on a
  narrow desktop window. TOAST-NARROW-1 existed specifically to prove the measurement does real
  work rather than coincidentally matching a constant, and it passed.
- **Measuring removed the need for a mode flag**, which is the part worth reusing: `menuVisible()`
  and `getRoundState().phase` answer *which mode are we in*, and the question that matters is
  *what is painted in that strip*. A hidden element measures 0, so the menu, `.hud-suppressed`
  (pause/podium) and the touch-hidden slab all fall out for free.
- **Wyatt caught the gap in the plan.** The first occupancy list omitted `.hud-lobby-hint`. The
  friends lobby hides the pod's ready button, so the lift would have stayed 0 and the toast would
  have landed on the ESC/PAUSE row — the same bug moved one surface over. TOAST-LOBBY-1 judged
  both the toast *and* the hint strip because of it.
- **Layer ordering is now documented once.** There was no scheme — magic numbers across five
  stylesheets — and the only written record had gone actively misleading, claiming the HUD "tops
  out at 20040" when 20040 is a `#hud` **descendant** ordered inside the HUD's own context.
  Reading it as a band is exactly what buried the toast. Band table now lives beside `#hud`; every
  other layer site carries a pointer and states no neighbour's number. **Deliberately not
  tokenised** — the layers span five stylesheets, an injected `<style>` and inline `<style>` in
  `index.html`, so a `:root` block would be a bundle-order dependency.
- **Process note, and the reason this card was split six ways.** HUD-TOAST-Z-1 exists because it
  rode inside MAIN-1's green verdict — a bundled card hid a real defect. Splitting the retest into
  six ids Wyatt could pass or fail alone is the direct countermeasure. Two authoring faults
  surfaced while doing it: the cases initially lived only in a commit message (the console seeds
  from `Owed: Wyatt playtest` rows, so it found nothing), and a docs-only card was seeding a
  phantom playtest because its prose read *"passed Wyatt's playtest"*. **A generated queue is only
  as good as the rows it reads.**

### August 5, 2026 — SUNDIAL-OBSTACLE-SLIDE-1 PASS: the sweep's last site, and the one the grep missed

**Wyatt PASS on prod `7faa6d73`** — *"blade slides now, deck feels the same"*. Fifth card of the
combine-rule run and the one that actually closes it.

- *(Physics · Low)* **SUNDIAL-OBSTACLE-SLIDE-1** — ✅ PASS 08-05 (`fd97ab8`). Sundial's 8 corner
  bollards and the gnomon blade were written `0.3` and, averaged with the cart's 1.1, acted like
  **0.7**. `FrictionCombineRule.Min` on both, **no number changes**. Floors untouched and
  deliberately so — deck/podium cuboids and the ramp hull (`DECK_FRICTION`) plus the spawn booth
  slabs (`B.friction`), all with canaries in `tests/zanzibarObstacleFriction.test.js`.
- **The blade was the card; the bollards came along for consistency.** A bollard is a brief point
  impact where restitution dominates the feel, but the gnomon blade is a 6.2 m flat vertical face
  a cart genuinely grinds along — made solid by `5ec432d` and gripping ever since. Wyatt judged
  exactly those two axes: the blade now slides, and the deck is unchanged.
- **How this one was found is the lesson.** It was not reported by a player and not caught by a
  test. It surfaced because closing the previous card meant re-running the search that had produced
  *"Sundial is clean"* — and that search only matched friction ≤0.2, so a value written `0.3` was
  invisible to it. **A negative result from a grep is only as good as its pattern**; when a sweep
  reports a file clean, the pattern is the thing to check, not the file.
- **Watch the anchor when a source-assertion test slices a file.** The canary's first draft
  anchored on `for (const p of bollardPositions)`, which appears **twice** — the visual instancing
  loop at `:3479` comes first — so the slice silently swallowed the whole deck section. It failed
  for an unrelated reason and got caught; a slightly luckier draft would have passed while
  asserting nothing. Anchors in these tests must be verified unique.
- **Correction carried out of this card:** the run's docs claim Rapier defaults restitution to
  `Max`. It does not — `ColliderDesc` sets **both** combine rules to `Average`
  (`@dimforge/rapier3d/geometry/collider.js:861-862`). Filed as **RAPIER-DEFAULT-MAX-1** (Low,
  prose-only). Classic's lip and staves deflect at 0.40/0.45, not 0.50/0.60 — but that card passed
  playtest *at the real values*, so the feel is signed off and the numbers must not be "corrected"
  upward. The claim is what is wrong, including in this file's WALL-SLIDE-CLASSIC-1 entry below.

### August 5, 2026 — WALL-SLIDE-CLASSIC-1 PASS: the same fix on Cart Rave's pit rim

**Wyatt PASS on prod `a028cb8a`** — *"feels good"*. Fourth and last card of the day's
combine-rule run.

- *(Physics · Medium)* **WALL-SLIDE-CLASSIC-1** — ✅ PASS 08-05 (`00ef1cb`). Classic set no
  friction combine rule at all, so its containment lip written **0.02** — the author reaching for
  ice — behaved like **0.56**, and the shaft staves (0.05) like 0.575. Both are live-cart
  surfaces: the lip spans y −4 → 9, above the arena floor, and the fall KO fires at −30, so the
  top 26 m of shaft still holds living carts. `Min` on 18 staves + 16 lip hulls, **no number
  changes** — unlike Storerooms, nothing here was a mid-range value picked against the wrong scale.
- **The lip is the story.** Its comment block is a documented fight against carts grinding on that
  hull — inward lean so there is no resting equilibrium in the crease, knife edge so there is no
  flat top to park on, all against the old *"drive on the upper pit edge"* bug. Ice friction was
  the third leg of that fix and **the only leg that never took effect**. The geometry carried the
  intent alone for months. This is the general shape worth remembering: *a tuning lever that
  appears to do nothing may not be the wrong lever — check whether the value is transformed before
  it reaches physics.*
- **Deliberately untouched, both load-bearing:** the backstop cylinder (its top cap is the shaft
  floor, and floors keep Average) and restitution everywhere in Classic. *(RAPIER-DEFAULT-MAX-1,
  08-06: this bullet used to say Rapier's default is Max — it is **Average**
  (`@dimforge/rapier3d/geometry/collider.js:861-862`). Lip 0.5 / staves 0.6 averaged with the
  cart's 0.3 give **0.40 / 0.45**, not 0.50/0.60 — and that is the deflection this card actually
  passed playtest at, on prod `a028cb8a`, so the feel is signed off at the real values and the
  numbers must not be "corrected" upward on the strength of this comment.)* That deflection keeps
  boosted rams off the stands — the exact opposite of Sundial's floor case, which needed
  `RestitutionCombineRule.Min` to hold a *lower* value.
- *(Correction)* **My earlier "Sundial is clean" was wrong** — an artifact of a grep that only
  matched friction ≤0.2. Sundial's bollards and gnomon blade are written `0.3`, so they never
  showed up, and they average to **0.7**. Filed as **SUNDIAL-OBSTACLE-SLIDE-1** (Low — point
  impacts, not scrapes, and nobody has reported it). The sweep is only now actually complete:
  `arena.js` 2/5, `backroomsSupermarket.js` 5/13, both correct; the rest are floors, the cart
  itself, dev-only, or dynamic groceries.

### August 5, 2026 — STORE-WALL-SLIDE-1 PASS: walls stopped averaging their friction with the cart

**Wyatt PASS on prod `a9dfef85`** — *"feels way better"*. Closes the three-card Storerooms pit
chain, each card caused by the previous one's fix, with no residual on the third.

- *(Physics · High)* **STORE-WALL-SLIDE-1** — ✅ PASS 08-05 (`f28268b`). **Rapier combines the two
  colliders' friction with `Average` by default**, and the cart carries `friction: 1.1`. So every
  wall in the level was acting far grippier than its written value: the cliff and shaft walls at
  0.05 behaved like **0.575**, the perimeter walls at 0.4 like **0.75** — the stickiest surface a
  player could touch. `FrictionCombineRule.Min` on all five vertical surfaces makes the written
  number the felt number; the perimeter also went 0.4 → 0.15, because Min alone still drags.
- **This invalidated the previous card's tuning in hindsight.** STORE-PIT-WEDGE-1 set the pit
  dressing to 0.05 "so carts slide off instead of parking" — that number was really 0.575 the
  whole time. The lever only started working when this card landed. Worth remembering: **a
  friction value in this codebase is not a felt value unless a combine rule says so.**
- **Floors deliberately keep `Average`** — chamfer prisms, backstop cap, carpet slices, booth
  decks. Their grip is what makes driving feel right. The test carries a canary asserting the
  backstop cap did *not* acquire the rule, specifically so a later "make it consistent" pass
  cannot quietly sand the driving feel off the whole arena.
- *(Precedent found, not invented)* Sundial hit the identical bug on the **restitution** side and
  fixed it the same way — [zanzibarPlatform.js:25](../../src/levels/zanzibarPlatform.js:25) records
  that `Average` "produced a phantom ~0.175 bounce". Nobody had ever done the friction equivalent.
- *(Follow-on)* **WALL-SLIDE-CLASSIC-1** filed: Classic Record's pit walls set no combine rule
  either, so its containment lip written `0.02` — deliberate ice — behaves like **0.56**. Sundial
  is clean.

### August 5, 2026 — STORE-PIT-WEDGE-1 PASS: the pit band is driveable

**Wyatt PASS on prod `c5711dd4`.** No spot in the band pins a cart any more.

- *(Physics · High)* **STORE-PIT-WEDGE-1** — ✅ PASS 08-05 (`152d835`). Sealing the arena cliff
  turned the pit band into a corridor walled on **both** sides, with the gondola rows 2.0 m off
  the inner one. A cart is 1.47 × 2.42 with its skin, diagonal **2.83 m** — it enters sideways
  and then cannot rotate out. Gondola length 9 → 7 and band centre 45.5 → 46.7 gives **4.2 m on
  each side**; dressing friction dropped so the tops shed rather than hold.
- *(Process)* **The obvious fix was wrong and got acked anyway.** The first proposal — push the
  band outward to 47.5 — was acked before either of us checked the far side; it would have shrunk
  the outer gap to 2.4 m and rebuilt the identical wedge against the room wall. Caught by
  re-deriving during write-up, not by review. **A corridor has two walls; a clearance fix has to
  prove both.** The test now pins both gaps against `CONFIG.cart.size` rather than literals, so
  the check survives a bigger cart.
- *(Residual)* Wyatt's PASS came with "collisions … are a bit sticky" → **STORE-WALL-SLIDE-1**.

### August 5, 2026 — STORE-PLAT-WALL-1 PASS: the pit is a sealed box

**Wyatt PASS on prod `251c51e4`** — *"it works"*. The arena cliff stops carts; you can no longer
get underneath the playfield.

- *(Physics · High)* **STORE-PLAT-WALL-1** — ✅ PASS 08-05 (`8ec9e3a`). The pit was sealed on three
  surfaces — backstop cap at `PIT_FLOOR_Y`, full-height perimeter walls, per-shaft ricochet walls —
  and open on the fourth: `addCliffRing(ARENA_HALF)` drew the 26 m cliff as four plain meshes with
  **zero** `createCollider` calls. Fixed with `getBackroomsPitWallSpec()` (exported pure, mirrors
  the visual ring from shared constants) plus four cuboids on `buildFallContainment`'s existing
  body. Top pinned at `FLOOR_BOTTOM_Y + CHAMFER_TUCK` so it *overlaps* the perimeter chamfer
  instead of sharing a plane with it; the test asserts that Y as an equality because an inequality
  would pass a zero-overlap touch, which is the coplanar bug itself.
- *(Process · the expensive part)* **The card was filed against the wrong geometry, and two Explore
  agents mapped that wrong geometry thoroughly before anyone noticed.** The row said "spawn-platform
  walls (rails, dividers)" and named `buildBackroomsBooths`; the research was correct and entirely
  irrelevant. Wyatt's screenshot was at **pit-floor level** — he had fallen in and driven through
  the *arena cliff*, a different surface in a different builder. Recovered only because he asked
  *"are we talking about the same level??"* and sent a picture. The row's own title contained the
  answer ("void/platform walls"). **An agent-written BACKLOG row is a hypothesis with a filename
  attached, not the report** — match its stated geometry against what the human described, and ask
  for a screenshot when the location is even slightly ambiguous. Second instance of this class in
  one day; see the SHOOT-LEVEL-1 retraction below.
- *(Follow-on)* The fix produced **STORE-PIT-WEDGE-1** — sealing the cliff turned the pit band into
  a two-sided corridor and carts started wedging in it. Fixed same day (`152d835`); still open on a
  playtest. **BOOTH-RAIL-COL-1** was split out to hold the real-but-unreported booth-rail gap.

### August 5, 2026 — BUNDLE-E-PT-1 PASS: the deferred-callback seam is proven live

**6/6, no FAIL, on prod Worker `f2f90fd2`.** This was the human half of BUNDLE-1 Lever E, and the
only half that could ever have caught the failure it was written for. Lever E moved twelve netcode
entry points off static imports onto the `registerGameCallbacks` table supplied through
`buildNetcodeGameBridge` — KO reactors, announcer, directives, cargo spill, cart material updates.
**That seam does not crash when it breaks; it goes quiet**, so `tests/netcodeDeferredCallbacks.test.js`
(key parity + same-name delegation on both sides) proves the wiring exists while proving nothing
about whether a KO still sparks. Wyatt's pass covers what the test cannot hear or see:

- *(Playtest · High)* **BUNDLE-E-PT-1** — ✅ Wyatt PASS 08-05, all six steps. KO spark + sound +
  announcer reaction intact; a directive fired, announced, counted down and changed play, and
  survived an ESC mid-window without re-firing (**FIX-DIRPAUSE still holds after the code-split**);
  cargo spilled, the bay emptied and the weight came back off handling; own and AI cart colours
  correct and still correct after a rematch; **friends round on the second machine — both drove,
  both saw each other's KOs and effects, round completed to podium**, which is the case where a
  dead hook would have shown up as silence rather than an error; full round → podium → PLAY AGAIN →
  fresh round with music and announcer behaving.

So Lever E is clean on both planes and BUNDLE-1's partial close (perf goal missed, bytes banked)
carries no correctness residual. **Process note:** this card was seeded before the one-issue-per-card
rule landed (`18dbef0`) and is exactly the shape that rule now forbids — six independently
falsifiable checks on one id. It passed 6/6 so nothing was lost, but under the new rule it would
seed as six cards.

### August 4, 2026 — BACKLOG ✅ retire (25 checked rows + stale MAIN-1 pointer)

Docs hygiene only — **no game code**. Every `✅` table row still living in
[BACKLOG.md](./BACKLOG.md) was deleted from that file and frozen in the do-not-re-add list.
Most were already written up in sections below; this entry is the receipt so the open backlog
stops looking like a graveyard.

**Already recorded elsewhere (pointer only — do not re-file):**
ROUND-WEDGE-1 · SHOOT-ANIM-2 · FX-TIME-1 · NET-SIM-1 · GIT-INDEX-1 · HOOK-INDEX-1 ·
STOP-DIRT-1 · ART-PASS-1 · ART-PASS-CLASSIC-1 · MENU-MUSIC-VOL-1 · HOST-TAB-1 · MAIN-1 ·
PRE-PODIUM-1 · MENU-LOCK-HINT-1 · FIGHT-VERIFY-1 · BRIEF-DIGEST-1 · SHADOW-TILT-1 ·
SHADOW-ORDER-1 · PERF-INSTR-1 (measurement detail lives under PERF-PASS-1 / Wave 1).

**Writeups that were only on the BACKLOG ✅ row (condensed here):**

- *(Harness · Medium)* **SHOOT-ANIM-1** — ✅ CLOSED 08-02 (`6b27283`, `--t` in `79a9caf`).
  Menu attract rendered without updating while the game loop bailed on `menuVisible`; live
  main-menu arenas were frozen for everyone, not just captures. Fixed via attract
  `onAnimationTick`. Bonus: Classic's capture variance was unseeded construction noise, not
  crowd animation.
- *(Art · Low)* **SUNDIAL-DECK-DETAIL-1** — ✅ CLOSED 08-03 **by measurement**. Relief-only
  normal probe (`586330b`, then removed): deck median unchanged at 2.43; whole-frame delta
  below Sundial's ~1.2% noise floor. Do not re-open without new *lighting* evidence.
- *(Playtest · Low)* **SPAWN-PT-1** — ✅ CLOSED 08-03. Wyatt accepted centring; inset was
  `e64f1a3`. Residual leg colliders stay on **SPAWN-SUNDIAL-1**.
- *(Playtest · Medium)* **CAM-PT-1** — ✅ CLOSED 08-03. Wyatt PASS (orbit + quit/cancel).
  Residual pre-roll hold → **CAM-READY-1** (also closed Run 8).
- *(Playtest · Medium)* **HOST-TOAST-1** — ✅ CLOSED 08-03. Behaviour covered by unit tests;
  Wyatt's machines cannot score `<50` on `scoreHostCapability`, so there was never a live
  playtest to owe. Reopen only on copy/taste, not once-per-hostship behaviour.
- *(Tooling · Medium)* **SKILLSYNC-PRUNE-1** — ✅ CLOSED 08-02. `planPrune` deletes orphans
  from the **owned** repo mirror only; shared user-level skill dirs stay add/update forever.

Also removed the open Tech Debt **MAIN-1** pointer (still said "DEPLOYED / playtest owed"
after both passes closed). **BUNDLE-1** note in BACKLOG flipped to UNBLOCKED.

---

### August 5, 2026 — two harness bugs: one real, one I invented

Both surfaced out of BUNDLE-1. Worth keeping together because they are the same lesson from opposite
directions — **a subagent's observation can be correct while the premise under it is false.**

- *(Tooling · High)* **HARNESS-GEO-1** — ✅ **fixed** (`fde8d10`). `soak: geometries stays flat across
  rematches` had been holding battery at 5/6 and produced a false "Lever E leaked memory" blocker.
  `renderer.info.memory.geometries` is a **monotone first-render ratchet** — three.js increments it the
  first time a geometry is *drawn* and only decrements on `dispose()` — so comparing cycle 1 to cycle N
  measured how much pooled VFX geometry happened to become *visible* after the first sample, which
  depends on where the NPCs died. Proven by a stack census (every event a `+` from
  `WebGLGeometries.get ← projectObject`, **zero decrements**) and an identity census (newcomers are
  pre-parented pooled objects still in-scene at cycle 3, stepping once then stopping).
  **Gate is now `min(per-cycle delta) <= ceil(tol / deltas.length)`** ([soakGrowth.mjs](../../tools/lib/soakGrowth.mjs)):
  a one-time ratchet leaves one delta near zero *whenever* it fires; a real leak adds k every rematch.
  Both originally-proposed fixes ("last two cycles", "cycles 2..N") are the same check at 3 cycles and
  **would have failed run 6** of the evidence sweep, a genuine late ratchet. **Run 7 (`[4,5]`, minΔ 4 vs
  tol 4) passed by exactly zero margin — do not read 10/10 as comfortable;** if it ever false-fails the
  answer is `--soakCycles 4` + drop-largest-delta, **never** a tolerance bump. Verified both directions:
  10/10 soak runs green, and an injected leak (10 cloned geometries retained per rematch) still failed it
  at `[121 → 131 → 141]`. The full per-cycle series now persists into the battery JSON — losing that
  middle sample is precisely why diagnosing this needed a whole investigation. Evidence table:
  [bundle-1.md §12](./bundle-1.md).
- *(Retracted)* **SHOOT-LEVEL-1** — ❌ **not a bug; the filing was mine and it was wrong** (`ec01054`).
  Reported as "`shoot --level zanzibar` renders Classic." All three arenas in fact measure distinct:
  `classicRecord` 114 draws / 548,185 tris · `backrooms` 98 / 241,425 · `zanzibar` **124 / 214,641**.
  The observation was real — a default shot and `--level zanzibar` are byte-identical — but the premise
  was not: **`FREE_LEVEL = "zanzibar"`** ([unlockConfig.js:113](../../src/unlockConfig.js:113)) and
  `resolveLevelId` falls back to it, so the *default* shot already is Sundial. **Filed High on an
  unchecked assumption, then amplified into "every Sundial shoot/compare has been diffing Classic
  against Classic, including MAIN-1's sign-off" — which was false and briefly discredited valid
  evidence.** MAIN-1 Lever H's "sundial meanAbs 0.048" was a genuine Sundial-vs-Sundial compare; no
  arena went unverified and no re-shoot was owed. Ambiguity removed anyway: `tools/shoot.mjs` now always
  pins `level=` explicitly via its own `DEFAULT_SHOT_LEVEL`, independent of `FREE_LEVEL`, so every run's
  logged URL names the arena.

### August 4, 2026 — MAIN-1 CLOSED: composition seam + the residual wave behind it

**MAIN-1 is done.** The §8 seam playtest came back 9/9 on `c9f6f44`, and the retest of the four
residual fixes came back 7/7 on `8d96b0b` (Version `a92934f3`, chunk `index-BuD_HIUu.js`, SHA
byte-identical to the local ship). BUNDLE-1 is unblocked.

- *(Tech debt · Medium)* **MAIN-1** — ✅ Wyatt PASS 08-04 (both passes). Levers A–H carved
  `main.js` into orchestration modules; the soft line target was missed (2402 vs ≤1500 — the
  remainder is composition wiring, not logic). Plan: [main-1.md](./main-1.md).
- *(Regression · High)* **FIX-BOOST** (`39939e0`) — the **only true regression** the extract
  produced, and worth remembering as a class. Lever H turned `localCartForConnId` from a hoisted
  function into a late-bound `let` stub that `createCartOrchestration` assigns *after* `HUD.init`
  runs. The input handlers survived because they call it inside arrows; `HUD.init` passed the
  reference itself, froze the stub, and the boost meter's show-gate saw `null` for the whole
  session. **The lesson is the seam, not the symbol:** when an extraction introduces late binding,
  every by-value consumer registered before the assignment silently keeps the stub. Fix is a
  wrapper (`() => localCartForConnId()`); regression test pins both directions
  ([hudBoostLateBind.test.js](../../tests/hudBoostLateBind.test.js)).
- *(Gameplay · Medium)* **FIX-DIRPAUSE** (`e7dd92e`) — **pre-existing, not from the extract**
  (the mechanism dates to run-6's `shiftDirectiveTimersBy`; every timing path in the MAIN-1 diffs
  was verified byte-identical or a pure move). Solo ESC pause and host tab-return both compensate
  by mutating `roundStartedAtMs` and then shifting the directive timers — but the engine treats
  *any* change to that anchor as a new round, so it killed the in-flight directive, rewound
  `scheduleIdx`, cleared the repeat guard, and the still-in-window slot re-fired with a fresh
  countdown and announcer callout on every pause. Fix shifts `_lastRoundStartedAtMs` by the same
  delta. **Falsification-checked:** with the shift disabled the new test fails because a second
  directive has replaced the in-flight one.
- *(Diagnostics · High)* **FIX-F8CAP** (`e7e64e4`) — the instrument everything else depends on was
  quietly broken three ways: the upload used `keepalive: true`, whose ~64 KiB body cap Chrome
  enforces by rejecting into a swallowed `console.warn`; quit-to-menu rebuilt the URL to a bare
  pathname and dropped `?diag`, disarming F8 for the rest of the session; and `manualCapture`
  awaited an un-timed freshness fetch before doing anything. **The size cap was measurable in the
  evidence itself** — across 251 pulled bundles the max body was 54,786 chars ≈ 65,179 wire bytes,
  **357 under 65,536**, a distribution clipped exactly at the ceiling. Now: no `keepalive`, `diag`
  (+`captureLabel`) carried across menu returns via `menuReturnHref` (never `room=`, which would
  cause rejoin ghosts), a 2 s abort on the freshness probe, and a toast on every outcome including
  Worker non-ok and parse errors. **Verified live:** all 7 retest F8s arrived (cap-254–260).
  **Residual filed 08-05:** the toast itself is drawn *under* the in-game boost slab (HUD root
  is a higher stacking context than the body-level toast) — **HUD-TOAST-Z-1** in BACKLOG § UI/UX.
  Not diag-only: the same `showToast` carries failed-join / disconnect-return messages.
- *(UX · Medium)* **FIX-QUALFEEL** (`15be6ee`) — the quality-toggle overlay already existed; it was
  dismissed in `finally` the instant `rebuildForQualityChange()` resolved, i.e. *before* the
  expensive post-swap frames painted, so the freeze landed after the loader had gone. Now held
  `waitForPaintedFrames(2)`. **This fixes the framing, not the duration** — see the residual note
  on the successor card.
- *(Process)* **FIX-EMISSIVE aborted, and the abort is the finding.** The acked lever cannot work:
  `intensityMul` is a per-call argument, and the unguarded leader-glow loop re-tints every cart
  with `1` every frame over the same material cache. Full reasoning and the two retry options are
  the BACKLOG row. **FIX-MIG deferred** after its original rationale was falsified (score rebalance
  *does* run every quickplay rematch).

### August 4, 2026 — Playtest export: 3 PASS / 0 FAIL (HOST-TAB-1 finally closed)

A clean sweep — the first export this phase with no FAIL to triage. All three closed the same
session they were reported. Deployed together at `91b39aa` (Worker `d47d4dd3`); prod bundle was
fetched and confirmed carrying the SHA before the playtest.

- *(Networking · High, `[2pc]`)* **HOST-TAB-1** — ✅ Wyatt PASS 08-04, all 7 steps of §10.
  Hidden-tab host pump + AFK promote + strongest-host return. **Step 5 — the second mid-round
  migrate — was the standing FAIL and now passes:** a demoted in-flight initiate could still send
  `sdpOffer`, so the incoming host built a zombie peer connection and skipped making its own offer,
  freezing the non-host. Lever E (`c3e4589`) has the host ignore inbound offers and aborts
  initiate/answerer on an `isHost` + session-generation check after every await; healing stays in
  maintain. Solo (step 7) and the weak-cannot-steal guard (step 6) also pass. Plan and verification
  matrix: [host-tab-1.md §10](./host-tab-1.md#10-verification-matrix).
- *(FX · Medium)* **FX-TIME-1** — ✅ Wyatt PASS 08-04. Fix `e87c795`. `fxTimer` was constructed and
  read but `.update()` was never called anywhere in `src/`, so `uTime` sat at 0 and the entire VHS
  layer rendered as a still frame — grain and scanlines as fixed dither, tape tears never firing,
  no SD pulse. One line in `onFrame`, placed ahead of the `isLevelSwapping()` early return so FX
  time cannot stall across a swap and jump on resume. Filed 08-02 out of SHOOT-ANIM-2, which had
  mistaken it for a capture-harness bug; it was live and affected every player, every frame.
  **Residual:** a driven `uTime` is wall-clock, so pinned `?t=` A/B captures still need it folded
  in — not closed by this PASS.
- *(Arenas · Medium)* **SHADOW-ORDER-1** — ✅ Wyatt PASS 08-04. Fix `6560552`. Storerooms booth
  contact shadows sit at **31.15 m** but were being surface-tested against the 26.4 m circular
  fallback, because `setContactShadowHazards` runs *after* `loadLevel()` builds the geometry — so
  **all four blobs were silently dropped on every cold load**, and on a warm swap they were tested
  against whatever arena you came from. The level now passes its own square-floor hazards (incl.
  `half`, which the square path reads) to both clusters, matching the Zanzibar template.
  **The seam survives the fix:** any future level grounding props during construction hits the same
  trap. Hoisting hazard publication into `commitLevelLoad` is the structural fix and is parked on
  **MAIN-1**, whose carve splits that exact seam.

Shipped alongside them, no playtest owed: **ARCH-DRIFT-1** — every line-number citation in
`control-flow.md` had drifted, and the card's own replacement numbers were stale again by the time
they were checked. Line refs are now banned outright in favour of symbol anchors, enforced by two
tests in `tests/architecture.test.js` that resolve all 26 anchors and reject any path-plus-line
citation in the doc or in `archMap.mjs` prose. A rename now fails the suite instead of rotting the
doc quietly.

### August 4, 2026 — Playtest PASSes closed (HOST-TAB-1 FAIL remains)

Four cards from the playtest export closed the same session they PASSed (so they cannot reseed
the console). HOST-TAB-1 stays open on FAIL — second mid-round migrate freezes the non-host.

- *(UI · High)* **FV-RESULTS-1** — ✅ Wyatt PASS 08-04. Deployed `858b836`. No bare CHALLENGE
  receipt row; CHALLENGE UNLOCKED label when earned. Toast may still say CHALLENGE COMPLETE.
- *(Art · Medium)* **STORE-DECK-1** — ✅ Wyatt PASS 08-04. Deployed `6eff2df`. Worn plate +
  safety stripe; bay letter already cut. No new entry hitch.
- *(Art · High)* **STORE-PT-1** — ✅ Wyatt PASS 08-04. Deployed `3fa1cac`. Wall shelves read
  pale painted wood. Void lips left alone; chrome booth rails → **SHELF-RAIL-1** if they clash.
- *(UI · High, `[2pc]`)* **FV-WILT-1** — ✅ Wyatt PASS 08-04. MP win/lose FX + winnerSlotIndex
  observation closed (parked observation, not a polish pass). Wilt *look* stays on
  Wilting-groceries `[SHIP-1 E2]`.

---

### August 4, 2026 — Docs audit pass 2 (live docs, not archive)

Broader audit after pass 1: **BACKLOG + STATUS + fight-night handover + SHIP-1/ROADMAP/
project-state/guides** (archives skipped). Cleanups applied:

- **PRE-PODIUM-1** closed — filing said FX missing; code has confetti/wilt/verdict; residue
  **FV-WILT-1** + Wilting-groceries look.
- **FIGHT-VERIFY-1** parent closed — seeds live on FV-RESULTS / FV-WILT only.
- **ART-MAT-1** demoted Low — absorbed by CART-MODEL-1.
- **Host-reload live confirm** demoted Low — automated half done (A6).
- **SHOOT-ANIM-2** Owed seed stripped (was reseeding console under `✅`).
- **PERF-PASS-1** BACKLOG lead aligned with STATUS (Cart Rave only; Wave 1 `aeb83aa` shipped;
  gate = PERF-INSTR-1).
- **fight-night-ui-handover.md** "missing in multiplayer" parking note corrected.
- Pass-1 closed six already-shipped cards (MENU-MUSIC · MENU-LOCK · GIT-INDEX · ART-PASS-1 ·
  ART-PASS-CLASSIC · NET-SIM).

**Still true open work (not false-open):** FX-TIME-1 · SPAWN-SUNDIAL legs ·
playtest FAIL residue · PERF-PASS/INSTR · UI-SCALE · etc.

---

### August 4, 2026 — Docs hygiene: six cards already shipped, still listed open

Scan after MENU-MUSIC-VOL-1 looked "already done": code/commits in HEAD, BACKLOG rows never
flipped. **No game code this pass** — badge + completed-work only. Closed IDs added so they
cannot re-file without new evidence.

- *(Audio · High, `[pre-ship]`)* **MENU-MUSIC-VOL-1** — ✅ code `18ed9ab` (08-02). Store domain
  0..1.15 vs Howler 0..1: constructor accepted `>1`, `volume()` setter silently no-op'd, loop
  restart threw `IndexSizeError` and left a fresh `<audio>` at default 1.0. Fix: `howlerVol()`
  clamp at music/SFX assignment sites; 6 tests. Residual: top ~13% slider dead zone (product);
  **AUDIO-MASTER-1** still open Low.
- *(UI · High, `[pre-ship]`)* **MENU-LOCK-HINT-1** — ✅ code `8dea5bb` (08-02). Browse locked
  arenas (cursor ≠ selection), unlock copy, SOLO gate before play entry, preview follows
  browse target. Run 8 **UNLOCK-PT-1** PASS covers the progression surface.
- *(Hooks · Medium)* **GIT-INDEX-1** (+ **GIT-INDEX-2**) — ✅ `5c3fe16` + `db60f19` (08-01).
  Pathspec-less commit cannot ship another session's staged paths; content-aware hunk guard
  blocks owned-path smuggling. See [hook-enforcement.md](../guides/hook-enforcement.md).
  Worktree-per-session left unbuilt (not required to close the leak).
- *(Art · High, `[pre-ship]`)* **ART-PASS-CLASSIC-1** — ✅ L1–L5 shipped (`316c74f` · `beebe81`
  · `d59fd92` · L4 dropped → **CLAD-REPEAT-1** · `5fc1c1e`). Notes already said Card COMPLETE;
  pri stayed High until this pass.
- *(Art · High, `[pre-ship]`)* **ART-PASS-1** — ✅ audit parent only: all three arenas audited
  08-01. Execution tracked on Classic/Sundial/Storerooms cards; Storerooms residue is
  **STORE-PT-1** / **SHELF-RAIL-1**.
- *(Net · Medium, `[SHIP-1 A6]`)* **NET-SIM-1** — ✅ already closed in SHIP-1 / completed-work
  (`2eedc04` hostReload + Cap-200). BACKLOG still said "extend as needed"; friends gap is
  **HARNESS-FRIENDS-1**.

---

### August 3, 2026 — Playtest Run 8 (15 PASS, closed the same session)

Wyatt's first run against the rewritten playtest console (solo-first ordering, human-language
checklists). **17 pass / 4 fail / 1 skip on the tally; 15 real cards**, since PREFLIGHT and
EXPORT were still scoreable at the time and inflated it.

- *(Closed by Wyatt's eye)* **cap-217 / ROUND-WEDGE-1** — a full timed round to 0:00 gave one
  clean podium with no 25×/s flicker, and the Phase A host-hide check (tab hidden ~30–60 s
  mid-round) still ended cleanly rather than running forever. This is the card that had been
  open since 08-01 on n=1 production evidence. Step 5's non-host check was not run and was
  never the evidence bar. **The `podium→running` assert is still expected on a first
  rollback** — `invariants.js:24` and `netcode.js:2835` disagree by design.
- *(Art)* **SUNDIAL-PT-1** → closes **ART-PASS-SUNDIAL-1** (all 6 waves). **LOAD-POSTER-1** —
  the poster loading screens read at desktop res. **PIT-PT-1**, **SHADOW-TILT-1** (fully closed,
  code `b36be5c` 08-02 + this eye).
- *(Fight Night)* **RESULTS-ACT-1**, **FV-HUD-1**, **FV-BOOT-1**, **FV-LOAD-1**,
  **FV-SILVER-1** — 5 of FIGHT-VERIFY-1's 7 owed cards. Remaining: FV-RESULTS-1 (fail),
  FV-WILT-1 (skipped, needs a second machine).
- *(Batch 0803)* **CAM-READY-1**, **UNLOCK-TOAST-1**, **FV-LOAD-1**, **FV-BOOT-1** — 4 of 5.
- *(Also)* **UNLOCK-PT-1**, **SOLO-PT-1**, **CC-PT-1**.

**The process lesson, which cost real time before it was caught:** a PASS had no write-back
path. Verdicts lived in the browser's localStorage while the BACKLOG rows still said
`Owed: Wyatt playtest`, so every regeneration reseeded cards that were already done and Wyatt
re-ran them by hand across sessions. One of his own notes on this run reads *"PASS REMOVE THIS
CARD FROM THE PLAYTEST CONSOLE!"*. Fixed on both ends: these 15 rows were deleted the same
session, and the console's export now leads with a `CLOSE THESE FIRST (agent action)` block
naming every passed id, to be actioned **before** any FAIL triage.

**Four FAILs carried forward, all with his words attached:** STORE-DECK-1 (drop the bay
letter — otherwise a pass), FV-RESULTS-1 (CHALLENGE → CHALLENGE UNLOCKED, or cut it),
STORE-PT-1 (shelves should read painted wood, not steel; **the void edge passed**), and
PERF-PASS-1, which stopped being a regression hunt and became a target: **60 fps at Low on the
Intel box in all three arenas**, with three F8 captures to attribute from.

---

### August 3, 2026 — AGENTS-PRIN-1 + STATUS-TRIM-1 (the rules file, and the file that reads it)

- *(Process)* **AGENTS-PRIN-1** — `ff0cbd2`..`5e15d94`. AGENTS.md was all process, facts and
  routing: it governed behaviour *around* the code and said nothing about the code, which is why
  fixes accreted flags, shims and "temporary" paths that every later change had to navigate. Added
  `## ENGINEERING PRINCIPLES` (six falsifiable rules; principle 1 carries three carve-outs —
  `cartRave*` localStorage keys, Worker/DO names, mid-round `MSG.*` — without which it contradicts
  the naming freeze), plus a mechanically-qualified **fast lane** that drops the wave document,
  playtest checklist and per-lever STATUS edit while **keeping the ack** (08-03: plan-ack is not
  waivable); DoD amended to match. Paid for by moving ~62 lines of hook internals to
  [guides/hook-enforcement.md](../guides/hook-enforcement.md), so **AGENTS.md went 362 → 329 lines
  while gaining 53 lines of new rules**. Three stale `§ Enforcement` pointers repointed; a fourth
  in `.claude/hooks/` was filed as **HOOK-COMMENT-1** rather than fixed under the freeze rule.
  **Two limits, measured not assumed:** `archRender` consumes only four AGENTS sections, so the
  principles reach neither ARCHITECTURE.json nor BRIEFING (lever 1 left `arch:check` *fresh*;
  lever 2 turned it stale — that is the proof); and `parseListItems` is line-based, so every
  `execution_loop` bullet is truncated to its first source line. The fast lane's first line was
  rewritten to survive that and is the only complete entry in that list.
- *(Process)* **STATUS-TRIM-1** — `575b6bd`..`95e2284`. STATUS.md sat at 4,197 tokens against a
  4,200 budget; the previous card hit the gate five times and spent a third of its run shaving
  prose. **Corrected a claim I had made the same day:** `status-size.mjs:64` measures
  `text.length / 4` — the *whole file*, not just dated entries. The blind spot is in its **advice**
  (it can only suggest cutting dated blocks), which is why it kept reporting "nothing safe to
  archive" while 82% of the file sat in undated sections. Measured the real distribution, then cut
  where the weight was: archived the 08-02 dated window
  ([status-log-2026-08-02.md](../archive/status-log-2026-08-02.md)), moved five deep-domain
  gotchas to [reference/gotchas.md](../reference/gotchas.md), and replaced five `### Do not`
  bullets that restated AGENTS.md verbatim with one pointer (Wyatt's call; a pointer rather than
  silence because BRIEFING is read *before* AGENTS.md). **4,197 → ~3,415 tokens, ~785 headroom**
  (3,215 was the low-water mark mid-card; this card's own STATUS entry and the deploy record then
  added ~200 back — a reminder that the trim number to quote is the one *after* the card closes,
  not the one you measured before writing it down).
  **Two near-misses worth recording, both caught by checking before deleting:** (1) STATUS's
  Decision index claimed "full text in `decision-log-2026-07.md`", but that log ends **07-23** and
  all seven live entries were 07-31 → 08-02 — **STATUS was their only copy**, so compressing the
  index as planned would have destroyed them; archived to
  [decision-log-2026-08.md](../archive/decision-log-2026-08.md) first. (2) "Six of eleven Wave 6
  audit items were misdiagnosed" plus the `[unverified]` warning on
  [art-audit-sundial.md](./art-audit-sundial.md) existed nowhere else; moved into the Sundial
  handover's traps list as item 0. **The lesson generalises:** a pointer saying content is archived
  is not evidence that it is — grep the target before cutting the source.

### August 3, 2026 — TOOL-HYGIENE-1 (HOOK-INDEX · BRIEF-DIGEST · STOP-DIRT row)

- *(Tooling)* **STOP-DIRT-1 closed; BACKLOG row retired.** Code was already session-scoped
  (`guard-stop-drift.mjs` + `relevantDirty`); the open Medium BACKLOG row was stale and invited
  re-litigation. Retired 08-03 with HOOK-INDEX-1 / BRIEF-DIGEST-1 in the same tooling wave.

### August 2, 2026 — HOOK-CASE-1 + the cross-platform path fix under it

Two commits to the Claude Code enforcement hooks, both CI-verified green. Filed as chips during
the twelve-card batch, then picked up on Wyatt's explicit ack.

- *(Tooling · High)* **Cross-platform path normalization** — CI had been red for **13
  consecutive runs** (~04:13Z onward), always the same 2 of 1116 tests — ✅ **CLOSED 08-02**,
  `f11e014`, CI **green**. `normalizeRepoPath` did `.split(path.sep)`, and `path.sep` is `\` on
  Windows / `/` on POSIX — where a backslash is a legal filename *byte*, so `path.resolve` never
  treats it as a separator and the split is a no-op. Windows-shaped input (which Claude Code
  genuinely sends: `src\Main.js`) normalized on the dev box and passed through untouched on
  ubuntu-latest. The tests were right; the production code encoded the host's path flavour.
  **Fixing that alone would not have gone green** — `guard-protected-paths.mjs` never called the
  shared normalizer; lines 48-52 were a verbatim inline COPY, and the second failing test runs
  through the copy. Deleted the duplicate. The `if (!rel) return null;` guard is not optional:
  the shared version returns null where the copy returned a `../…` string, and without it the
  PREFIXES loop calls `null.startsWith` and throws. Third change, closing a hole the fix itself
  would have opened: `track-session-writes` keyed state on the normalized path but hashed the
  **raw** one, so post-fix a path would carry GIT-INDEX-1 ownership with no GIT-INDEX-2
  fingerprint — ownership without a fingerprint is worse than neither. **Fuzzed before shipping:
  300,000 random path-shaped inputs per platform, ZERO deny→allow flips**; on win32 a provable
  no-op (40,000 inputs, 0 differences). Every POSIX change is strictly stricter (877
  allow→deny), closing real evasions that worked on Linux: `docs\..\docs\BRIEFING.md`,
  `..\cart-rave\docs\BRIEFING.md`, `DOCS\BRIEFING.MD`. **Anti-regression:**
  `normalizeRepoPath` takes an optional path flavour and the suite now runs its whole table under
  **both** `path.win32` and `path.posix` — a test that can only be wrong on the machine you do
  not have is not a test. Also `.gitattributes`: `.claude/hooks/** text eol=lf`, after editing
  two files gave their `#!/usr/bin/env node` line a CRLF terminator — Vite's shebang stripper
  only matches `#!…\n`, so a `#!…\r\n` first line survives the transform and kills the ENTIRE
  suite with a `SyntaxError` blamed on the *test file*, not on the module carrying the CRLF.
  autocrlf keeps the committed blob LF so it never reached CI; it cost an hour locally. The file
  already pinned `tools/git-hooks/*` for the identical reason.

- *(Tooling · High)* **HOOK-CASE-1** — the hooks folded every repo path to lowercase — ✅
  **CLOSED 08-02**, `f8a41b5`, CI **green**, 1148/1148 across 98 files. **Two defects, and the
  second was worse than the card claimed.** (1) *Ownership collision:* on a case-sensitive
  filesystem `src/Foo.js` and `src/foo.js` are different files collapsing to one key, so session
  A touching `src/foo.js` made session B's staged `src/Foo.js` read as owned — the exact
  cross-session leak GIT-INDEX-1 exists to stop, fail-**open**. The same fold made
  guard-stop-drift count another session's differently-cased file as this session's dirt, i.e.
  the STOP-DIRT-1 false block it was written to cure. (2) *Dead content check, live on Windows:*
  git's index lookup is case-**sensitive** even with `core.ignorecase=true` — verified here,
  `git show HEAD:docs/STATUS.md` succeeds while `docs/status.md` is fatal — so `readStagedBlob`
  had **never matched** for the 37% of tracked files containing a capital letter, docs/STATUS.md
  included, and GIT-INDEX-2 Check B was silently dead for all of them. Check A survived only
  because NTFS folds for `readFileSync`. The residual note claiming *"not a factor on this repo's
  Windows tree"* was false and is corrected in place. **Fix:** membership NEVER folds; only
  authored-lowercase constant tables fold, via a new `foldKey()` — three de-folds and five folds,
  **all in one commit**, because with only some moved a pathspec-less commit denies the session's
  own work across 37% of the tree. **Rejected** the card's platform predicate and a runtime FS
  probe: both answer "is this filesystem case-insensitive", but Windows case sensitivity is
  *per-directory*, so a root probe guessing "insensitive" folds and leaves the hole open in a
  flagged subdirectory — misdetecting in the fail-open direction. Never-fold is fail-closed
  everywhere and keeps `normalizeRepoPath` pure, which is what lets the suite drive both path
  flavours from one machine. **The false-positive cost was measured, not guessed:** across 109
  sessions of this repo's transcripts, **6,088 supplied paths produced zero case mismatches**,
  and zero intra-session disagreements in the 72 sessions that did both a tracked write and a
  `git add` — agents take paths from Read/Glob/Grep output and `git status`, not from memory.
  **The blocker the card missed:** `GENERATED_DOCS` is authored lowercase while the real files
  are `docs/BRIEFING.md` / `docs/ARCHITECTURE.json`, which `.git/hooks/pre-commit` stages on
  every commit — an unfolded lookup there would have denied **every** pathspec-less commit in the
  repo, deterministically. Verified live against the real hook before committing. State dir
  bumped to `cart-clash-stopguard-v2`, because a v1 file written by folding code and read by this
  one is over-blocking on ownership *and* under-checking on content simultaneously. **Tests
  160 → 164**, two of which matter: the case "allows when everything staged is session-owned" was
  **asserting the hole** (a staged `src/B.js` owned by a session that only touched `src/b.js`)
  and is now inverted with a comment saying a fold here *is* the defect; and a new Check B case
  drives a **real git repo with a real uppercase path and no injected readers** — every existing
  GIT-INDEX-2 test injects `readWorktree`/`readStaged` and routes around the real reads, which is
  precisely why this shipped green. **Expect** the documented residuals (`edit → add → edit →
  commit`, `git add -p`, Bash-written files) to start firing on uppercase paths where they
  previously could not — that is the contract finally working, not a regression.

### August 2, 2026 — twelve-card backlog batch (one lever, one commit, one qa run each)

Wyatt asked for a batch. The standing one-card rule still held, so this ran as a sequential
ladder: twelve cards, twelve commits, `npm run qa` green before each (1089 -> 1116 tests, 95 ->
98 spec files). Ran alongside the live ART-PASS-SUNDIAL-1 session — `src/levels/zanzibarPlatform.js`
was frozen for the whole batch and every commit used an explicit pathspec (GIT-INDEX-1), so the
two sessions' commits interleave in the log without a single crossed file. **All applied, unpushed.**

- *(Design · Medium)* **SOLO-DIFF-1** — `DEFAULT_SOLO` `"easy"` -> `"medium"` — ✅ **CLOSED 08-02**, `af12632`. Quickplay already pinned medium via `QUICKPLAY_FIXED`, so the shipped AI-DIFF-1 tuning was invisible to anyone who never opened the difficulty row. Two tests moved; the second (`resolveRoomDifficulty("friends", null)`) was asserting the same constant through the null-stored fallback and now references `DEFAULT_SOLO` instead of hardcoding the value twice.
- *(Art · Medium)* **LOD-UNCANNY-1** — Storerooms floor arrows culled on camera-to-arena-**centre** — ✅ **CLOSED 08-02**, `1b2787e`. Per-child registration, copying the floor-decal loop. The card's warning that `buildUncannyDetails` owns physics bodies was **stale**: `bodies` is declared and never pushed to since run-5 deleted the EXIT sign, so all three children are plain meshes. Node count for the group 1 -> 3. Not capture-verifiable (`updateLevelLod` never runs in the `shoot-gpu` attract path), so the gate is an arena-real unit test at `far: 42` plus a source assert; both fail against the pre-fix file.
- *(Art · Low)* **FX-TEXDISPOSE-1** — filed as a texture leak; the **larger** half was the opposite — ✅ **CLOSED 08-02**, `48a4562`. `disposeObject3D`'s geometry branch always honoured `isSharedGeometry`, but the material branch disposed unconditionally — and its one caller is `initCrowd`'s throwaway measuring cart, assembled entirely from cart.js's three module singletons. Every page load was disposing GPU state the live carts still draw with. Now skips `userData.isSharedMaterial` (the guard `cartShatter.js:991` already had) and disposes the eight map slots of materials it does own. The seat clones the card cites are **bounded** — `initCrowd` is latched by `raveShellInitialized`, so two textures per page load, not per level swap — and were left alone.
- *(Art · Low)* **PIT-DEPTH-1** — the pit shaft's unused depth — ✅ **CLOSED 08-02**, `f247d50`. 600m -> **69.6m**, not the ~45m the card proposed: `pitWallPhysicsTopY` is hardcoded −64 and the backstop's half-height derives from this depth, so anything under 61m feeds a **negative** half-height to `RAPIER.ColliderDesc.cylinder` with no clamp. 69.6 clears it and keeps the plating tile square at an integer `V=8` (tile 8.700m), so `repeat.set(32, 69)` -> `(32, 8)`. **Not zero-delta, and not claimed as such:** 64 height segments now cover 69.6m instead of 600m, so the 32m gradient is sampled by ~29 vertex rows instead of ~3.4. Measured on two cameras, each against its own same-code noise floor — rim band `0,-4,10 -> 0,-20,44` floor 0.00% / change **0.30%**; deep shaft `0,-8,0 -> 0,-34,44` floor 0.00% / change **1.41%** — so the player-visible band is effectively untouched and the movement is in deep plating.
- *(Engineering · High)* **PIT-COL-INSET-1** — carts clipping the pit wall — ✅ **CLOSED 08-02**, `2cbffde`. The clipping had a mechanism, so there was an exact answer rather than a feel-tuned nudge: Rapier has no hollow cylinder, so the shaft and lip are rings of tangent-fit hulls, and a tangent-fit ring **circumscribes** the circle — faces touch at their midpoints, corners bulge to `r / cos(halfAngle)`. Shaft corners sat at 44.983 and lip corners at 45.168 against a visual wall at 44.300, so a cart arriving near a corner sank up to **0.87m into the wall**, periodically around the ring. Fix is one derived constant, `pitInnerRadius * cos(PI / LIP_SEGMENTS)` = 43.4488, scaled by the coarser of the two rings so its worst corner lands exactly on 44.300. Face-centre inset 0.851m, **corner inset zero** — only the parts that used to poke through move. One shared radius preserves the lip-meets-shaft V-gutter invariant by construction. Backstop and `setShatterEnvironment` deliberately left at `pitInnerRadius` (the latter is an analytic client-local *look*, so it should kiss the mesh the player sees).
- *(Engineering · Medium)* **SPAWN-BACKROOMS-1** — spawn platforms too close to edge risk — ✅ **CLOSED 08-02**, `e64f1a3`. New `booth.gapDistanceByLevel { backrooms: 2.25, zanzibar: 2.25 }` (+0.75 vs base 1.5). Every booth builder **and** `computeSpawnRingRadius` read `booth.gapDistance` live at build time, so one override moves the decks and the spawn ring together by construction — **zero level-file edits**, which also dissolved the `zanzibarPlatform.js` collision. `loadLevel` applies/restores it beside `radiusByLevel`, with the recompute keyed on **either** override moving: Storerooms has no radius entry, so a radius-only condition would have moved its booths while leaving carts on the stale cached ring. **SPAWN-SUNDIAL-1 is only half closed** — its platform-leg colliders stay open.
- *(Engineering · Medium)* **CAM-OPEN-1** — 2s pre-countdown hold + opening rotate −15% — ✅ **CLOSED 08-02**, `bc6b531`. `angularSpeed` 0.6 -> 0.51 (the podium orbit has its own config and is untouched). Pre-roll is **solo only** — MP countdowns are server-anchored and delaying one is the reverted `c8df8fd` gate — and `COUNTDOWN_MS` is untouched, since it is shared with the server's arming timer. The part that needed care: the pre-roll opens a 2s window sitting **before** `syncRoundPhase("countdown")`, and two guards were written for a world where nothing lives there. `onCountdownCancelledRef` bumped the non-host and host-MP gens but never the solo one, and ended the cinematic only inside `if (phase === "countdown")`; `resetRoundState` (the real quit funnel) ended the cinematic but never invalidated the solo defer. Both fixed in the same commit. Four source-assert tests, all verified failing against the stashed pre-fix files.
- *(Design · High)* **UNLOCK-ORDER-1** — Sundial first, Cart Rave last — ✅ **CLOSED 08-02**, `11df427`. Unlock blocks swapped **in place**: array order is the quickplay rotation (QP-ORDER-1) and had to keep matching `QUICKPLAY_ARENA_IDS`, so a comment now says so at the catalog head. Chain is Sundial free -> Storerooms at 10 KOs on Sundial -> Cart Rave at 15 KOs on Storerooms; goal magnitudes keep their positions. Three hardcoded `"classicRecord"` defaults now read `FREE_LEVEL` — a fallback must resolve to an arena everyone owns. **The save migration is the reviewable part:** `normalizeState` used to force-write `classicRecord = true` on every load, and keeping that as a "grandfather" line would hand Cart Rave to any save ever written, including a fresh player who takes one KO on Sundial and reloads. It now forces only `FREE_LEVEL`; pre-flip saves are grandfathered **by the existing merge**, which carries their `classicRecord: true` through untouched. `normalizeState` exported for two migration tests.
- *(Tech debt · Medium)* **CC-TOKEN-1** — Command Center freestyle colour — ✅ **CLOSED 08-02**, `119d35f`. ~40 colours were bypassing `ROOT_TOKENS`. The headline defect was single rules disagreeing with themselves — nine `rgba(0,243,255,…)` washes against a `--cyan` of `rgb(39,224,230)`, with `.node.conn-in` reading `stroke:var(--cyan); fill:rgba(0,243,255,0.12)` in one rule. 18 tokens added **by role**, and near-identical values collapsed rather than each getting a name. Carve-outs documented in the token block: pure `#fff`/`#000` (contrast absolutes) and archHtml's `CART_ACCENTS` (mirrors the game palette in `src/config.js` and must not track this one).
- *(Tech debt · Low)* **CC-STRIPE-1** — the side-stripe card — ✅ **CLOSED 08-02**, `8c8ab2e`. Six sites at three widths, not the three the card recorded — including a **5px `<div class="scard-stripe">` rendered into every system card**, which a CSS-only pass could never have removed, and a 3px stripe on a `border-radius:999px` pill. All replaced with hairline borders in the same colour; `.scard.fragile` keeps its state read via a warn border plus a faint wash. Fixed together, because a partial pass is how they diverged in the first place.
- *(Tech debt · Low)* **CC-LABEL-1** — every label shouting — ✅ **CLOSED 08-02**, `f7d8284`. Nine rules resolved to uppercase + letterspaced + `var(--dim)`, so a column header, a field label and a section head were typeset identically. Nine field labels sentence-cased (**four more than the card listed**, found by the new gate, in files it did not name); micro-caps kept for real section heads and for state badges, which are not labels. No content edits needed — the strings were already sentence case and the uppercase was purely presentational, which is *why* nine rules could converge without anyone deciding to.
- *(Tech debt · Low)* **CC-ICON-1** — emoji in the cross-nav — ✅ **CLOSED 08-02**, `b8e327b`. Three inline SVGs in one stroke voice (16-unit box, 1.6 stroke, `currentColor` so they inherit hover/active). The two surfaces had already drifted: the architecture favicon used emoji-presentation 🗺️ while the nav used text-presentation 🗺. Drawn at final size after the first gamepad's 2.7-unit d-pad proved sub-pixel mush at 16px; verified by rendering the generated nav and cropping each icon.

**A new gate came out of the batch: `tests/ccStyle.test.js` (8 cases).** These four generators
had **zero** coverage — `npm run arch -- --check` digest-gates the JSON and explicitly skips the
gitignored HTML, so `npm run qa` was green no matter what the CSS said. It now asserts that every
`var(--token)` resolves (an undefined one renders as nothing, i.e. invisible text on a dark page),
no freestyle hex outside two documented carve-outs, no `rgba()` triplet that is *near* a token
without equalling it, no border of 2px or more on a single side, the uppercase allowlist, and the
nav's icon contract. Comments are stripped before scanning, because these files document the very
defects being asserted. It immediately found a live one nobody was looking for: `states.mjs`
references `var(--ease-slap)`, a **game** token that does not exist in the Command Center.

### August 2, 2026 — DIAG-FLAKE-2: the drain was a guess, and the guess was 5–20× too short

- *(Engineering · Low)* **DIAG-FLAKE-2** — `tests/diagnostics.test.js` intermittently red inside a full `npm run qa`, green 24/24 in isolation — ✅ **CLOSED 08-02**, filed and fixed the same day, exactly the residual **DIAG-FLAKE-1**'s own row predicted: *"the upload path has the same shape one layer out."* **Reproduced before anything was touched** — ~1-in-10 full runs, and the sighting was specific: `auto-capture upload > posts an auto-captured bundle to the same endpoint F8 uses`, failing `expected [] to have a length of 1 but got +0` immediately after `await flush()`, at `1 failed | 1246 passed (1247)`. **Attributed by measurement, not adjacency** (the HARNESS-NULL-1 lesson): boundary traces on a red run against a *green control arm* showed `import("./captureUpload.js")` taking **21ms vs 4ms** for the failing event, with the whole-run cluster at **65–81ms vs 19–35ms** — the full suite (unit forks **+** workerd party-do) roughly halves the machine, and concurrent `import()` calls share one promise, so the first upload assertion is hostage to it. Chain-minus-import was **1–2ms in every sample**, which rules the `fetch`/`json` tail out entirely. Against that, `flush()` was eight `setTimeout(0)` turns ≈ **8–16ms**. **Fix:** the fire-and-forget work got a real handle — a Set of pending capture timers and a Set of in-flight upload chains, registered *before any yield* (populate after the first await and a drain can see "idle" while the upload runs), plus `__drainAutoCapturesForTest(timeoutMs = 2000)` exported beside `__resetDiagnosticsForTest`. All three turn-counting helpers and the top-level hook now wait on the condition instead of a turn count. The drain moved into `afterEach` **before** the fetch restore, not `beforeEach` after it, so a chain in flight is serviced by the stub rather than opening a real socket. Suite got **faster** — 569ms with one more test. **Explicitly not** fixed by lengthening the drains; `be350b4` wrote that prohibition down and it still holds. **Null-armed both guards:** with a forced 200ms import the fixed file is green 25/25, and restoring the old 8-turn `flush()` against the same delay reds with the identical `expected [] to have a length of 1 but got +0`; separately, deleting the `hubGeneration` guard reds the DIAG-FLAKE-1 test. **That test had to be re-pointed**, and this is the trap worth remembering: reset now `clearTimeout`s pending timers, so leaving DIAG-FLAKE-1's test routed through `__resetDiagnosticsForTest()` would mean the timer never fires, the generation guard never runs, and **that test would pass with `be350b4`'s guard deleted**. It now re-installs without a reset — which both exercises the guard and covers the real production path, since prod never calls the test-only reset. **The new bounded-drain test caught two defects in the fix itself:** a stuck chain that stayed registered turned one failure into a cascade (0 → 8 failures, 0.5s → 115s), so the drain now gives up *on* the work rather than only on waiting; and `Promise.race` on a slow chain sailed straight past the deadline, making the timeout a lie (a 400ms upload against a 50ms budget resolved instead of throwing), so both branches now race the remaining budget. **Honest about coverage:** the `clearTimeout` layer added to reset has no independently observable behaviour — every path converges because the generation guard already drops a fired straggler — so it is documented in the code as hygiene rather than dressed up as a proven guarantee. Verified: `npm run qa` exit 0 at **103/103 files, 1248/1248 tests**, `npm run build` exit 0, and **30 consecutive full runs, 0 red** (three greens would have been worthless against a 1-in-10 flake — ~0.7 chance of passing while still broken; 30 puts that near 0.04). Residual split out as **DIAG-UPLOAD-GEN-1**.

### August 2, 2026 — DIAG-FLAKE-1: a stale auto-capture timer outlived its hub

- *(Engineering · Low)* **DIAG-FLAKE-1** — a deferred auto-capture scheduled against one diagnostics hub fired against the *next* one after a teardown+reinstall — ✅ **CLOSED 08-02**, filed and fixed the same day. **Found the honest way:** `tests/diagnostics.test.js` went red inside a full `npm run qa`, passed two full bare-vitest runs (1246/1246) and four isolated runs, then went red under `qa` again. The differentiator is the party-do project changing suite timing — enough for the straggler to land. **Mechanism:** `scheduleAutoCapture` defers assembly with `setTimeout(..., 0)` and the callback reads `apiRef` at FIRE time; `__resetDiagnosticsForTest()` nulls `apiRef` but cannot cancel an already-scheduled timer, so the bundle lands in the next hub's `captures()` and any `expect(captures()).toHaveLength(1)` sees 2. **Not just a test artifact** — the same hole existed in production for any harness re-entry that reinstalls the hub, filing a bundle against a session that never asked for it. **Fix:** a `hubGeneration` counter bumped by `installDiagnostics` and `__resetDiagnosticsForTest`, captured by the scheduler, checked at fire time. Explicitly **not** fixed by lengthening drains in the tests, which would have hidden the production hole and slowed the suite for no coverage. Test: schedule → reset → reinstall → assert nothing lands; null-armed (removing the guard fails it). Verified by **three consecutive full `npm run qa` runs, all exit 0, 1247 tests**.

### August 2, 2026 — CART-FORK-1: the fork piece that was wearing the basket's paint

- *(Art · High, `[pre-ship]`)* **CART-FORK-1** — a fork piece rendered in basket colour instead of fork metal — ✅ **CLOSED 08-02**, one line in [cartRaveGltf.js](../../src/cartRaveGltf.js): `tripo_part_23: "trim"` → `"fork"`. **Mechanism, not a guess:** `cloneRaveGltfMaterial`'s `role === "trim" && srcMat.map` branch means "small neon wire segment on the basket" and hands the part the **body bloom mask** (`emissiveMap = srcMat.map`, `hasEmissiveAccent = true`); `fork` instead gets `metalness 0.45 / roughness 0.5 / clearcoat 0.2` and is forced dark. `tripo_part_23` is a 29-vert caster-level piece that was sitting in the trim bucket, so it glowed basket-pink down among the white forks — the same treatment as parts 15/16, which are the tall pink panels flanking the basket and are *supposed* to have it. **Identified geometrically** from the uncompressed master `art/models/cartrave4.glb` by reading POSITION accessor min/max (no buffer decode needed): part_23 at centre `[-0.148, 0.197, +0.236]` is the **mirror twin** of part_22 at `[-0.148, 0.181, -0.235]` — same x, mirrored z, 29 vs 26 verts — and part_22 was already `fork`. It was the only caster-level part in the whole 21-mesh model on a basket role. **Verified at runtime**, not by reading code: in a live solo match, part_23 now reports `role fork / metal 0.45 / rough 0.5 / clear 0.2 / emissiveMap false / accent false` — identical to part_22 — while part_15 still reports `trim / emissiveMap true / accent true`, proving the panels were not over-corrected. Tests: `tests/cartForkRole.test.js` ×5 (null-arm: 3 fail on the old value; the other 2 are the don't-over-correct guards). **Naming note:** the card said "back right"; in the code's own convention (`backRight = sx:-1, sz:-1`) this piece is back-**left** — viewed from the front, as in Wyatt's screenshot, the cart's left reads as the viewer's right. Same piece. **Split out:** CART-FORK-SWIVEL-1 (part_23 is in no fork group, so it stays static while its caster steers).

### August 2, 2026 — QP-ORDER-1: Quickplay advances catalog order

- *(Engineering · High)* **QP-ORDER-1** — Quickplay rematch picked a random other arena — ✅ **CLOSED 08-02** (applied, unpushed). Fresh public rooms still pick a **random** pool entry; rematch then advances catalog order via `nextQuickplayArenaId` (wrap). Helper: found → next; unknown → first; singleton → sole; empty → current. `main.js` rematch uses it; `party/index.ts` RNG at room init. Tests: `tests/arenaPool.test.js`. **Out of scope / still owed:** live two-browser rotation smoke (BACKLOG Low).

### August 2, 2026 — ASSET-CACHE-1: fixed-name assets refresh within ~1h

- *(Engineering · Medium)* **ASSET-CACHE-1** — fixed-name GLB/audio used a 7d max-age + 1d SWR, so browsers could serve stale art for up to ~8d after a deploy — ✅ **CLOSED 08-02** (applied, unpushed). Extracted `assetCacheControlForPath` into `shared/assetCache.js`; `party/index.ts` delegates. Policies: hashed `/assets/*` → 1y immutable; `/models|/sounds|/draco|/fonts` + recognized fixed extensions → `max-age=3600, stale-while-revalidate=300`; unmatched → null (no header override). No storage-key or infra renaming. Tests: `tests/assetCache.test.js`.

### August 2, 2026 — LOD-CLOCK-1: LOD throttle uses local wall time

- *(Art / Perf · Low)* **LOD-CLOCK-1** — level LOD updates were throttled on host-adjusted `syncedNow`, so a backward clock correction could stall visibility recomputes — ✅ **CLOSED 08-02** (applied, unpushed). Lever: `updateLevelLod(camera, now)` in `main.js`; `frameBudgetAllow("level_lod", now)` unchanged; sceneExtras / levelUpdate / Effects stay on `syncedNow`. Tests: stall simulation + main.js source assert in `tests/levelLod.test.js`. Cosmetic-only; needs a mid-match offset swing to bite in prod.

### August 2, 2026 — DIAG-TIER-1: capture runtime qualityTier tells the truth

- *(Engineering · Medium)* **DIAG-TIER-1** — `runtime.qualityTier` reported the **stored** preference, so auto-quality demotions were invisible in every capture — ✅ **CLOSED 08-02** (applied, unpushed). `gameplayDiagnostics.js` runtime probe now reports three fields: `qualityTier` = `getQualityTier()` (effective), `qualityTierStored` = settingsStore, `qualityTierOverride` = `getSessionQualityTierOverride()`. No consumer or schema bump. Tests: `tests/gameplayDiagnostics.runtime.test.js` ×3 against the **real** `installGameplayDiagnostics` probe (demotion · both-off equality · menu-preview LOD). Does not re-open WARM-IGPU-1; re-read warm-igpu evidence with the corrected meaning of old `qualityTier`. PERF-WATCH-1 untouched.

### August 2, 2026 — friends mode actually works: two clients in one room, first time observed

- *(UI / UX · High)* **FRIENDS-JOIN-1** — friends join flow: one screen, speakable code, JOIN input — ✅ **CLOSED 08-02**, `bf9bc75`, deployed `f77ec652`, **Wyatt playtest PASS on two machines**. **The defect was that creating a friends room did not join it.** FRIENDS opened an invite screen showing a ROOM CODE and a COPY button — everything about it read as "the room exists and you are in it" — but no socket opened until ENTER GAME, so the invited player opened the link, pressed JOIN LOBBY, connected alone and became host of a room its creator had never entered. Both screens showed the same code, both URLs the same room, neither player misreading anything. Evidence: **cap-225** is the invited player holding `?room=partyzuntpm` at the menu with `localSlotIndex:-1`; **cap-224** is the creator on a bare URL, because `closeFriendsScreen` stripped `?room=` on BACK. **The earlier "two clients, two rooms" theory was a red herring** — cap-218/219 were `partywmtdlw` vs `partywtmdlw`, one transposition apart, i.e. a human copying an 11-character code by hand. Host election (`party/hostSelection.ts`) was never implicated, and cap-227/228 proved the netcode sound before any of this shipped (4090 host slot 0 `sendCount 103`, Intel non-host slot 2 `snapCount 296`, same room). **Shipped:** `shared/roomCodes.js` — 199 grocery words × digits 2-9 = **1592 codes** shaped `WORD+digit` (`KALE7`, "kale seven"); 0 and 1 omitted as O/I lookalikes; `normalizeRoomCode` is the single funnel and **uppercases**, because PartySocket room ids are exact strings so `KALE7` and `kale7` are two Durable Objects — the same silent split as a typo. Reserved mode prefixes are refused **case-insensitively**, deliberately not trusting `detectGameMode`, which is itself inconsistent (`testdrive` lowercased, `solo` not, so `SOLO2` slips its solo branch). FRIENDS now generates a code and enters play directly; `#cr-friends-screen`, its ~75 lines of wiring, its overlay/focus registrations and its CSS are deleted. A **JOIN field** on the main menu serves players who only *heard* the code: validate+uppercase → pushState the validator's string → re-run `captureInviteRoomForDeferredMenu` (the `joinroom` handler reads only `pendingInviteRoomFromUrl` and never the URL, so without it the dispatch is a silent no-op) → fire the existing action. The field is deliberately **not** a `.cr-cmd`, and `onMenuNavKeydown` now stands down for any focused text field — W/S drive the menu and M toggles mute, so typing `OATS3` or `MILK2` used to walk the selection and mute the game. CHECKOUT LINE shows `NOBODY HERE — CHECK THE CODE` to a typed-code joiner seated and alone for 4.5s, **timed from seated rather than from submit** (submit races connect+hello), written inside `updateLobbyScreen`'s `lobbyStatus` branch (which reassigns `textContent` every update, so a one-shot set elsewhere is clobbered), and gated on an explicit typed-JOIN flag so the room's own creator waiting alone never sees it. COPY stops lying — it reports failure and reveals a selectable link field. **Bot difficulty was NOT rebuilt in the lobby** (decided 08-02): it lives in `settingsStore`, netcode reads it from the store and never the DOM, and `#cr-diff-row` already exists in the main menu — the friends-screen row was always a mirror. **12 new tests**, incl. an exhaustive walk of the whole 1592-code space asserting nothing malformed or reserved can be emitted. The banner tests caught a real bug: `0` was the "not counting" sentinel and `performance.now()` legitimately returns 0 at page origin, so it could never fire — now `null`. **Known ceiling, not built:** no room registry, so collisions are undetectable (~2.8% at 10 concurrent rooms, 0.4% at 4) and any valid code creates a room on demand — "private" here means unlisted, not protected.
- *(UI / UX · High)* **FV-FRIENDS-1 overlay leak** — LEAVE ROOM left CHECKOUT LINE painted over the main menu — ✅ **CLOSED 08-02**, `c27fa8d`. `hideGameplayElements` (`hud.js:2701`) is the canonical "player returned to the title screen" sweep and its own doc comment says anything mid-window MUST be cleared there, but it never touched `elements.lobbyScreen`. The surface mounts on `document.body`, not inside `#hud`, so the `#hud` removal in `init()` did not take it down either, and menu return skips the game loop so `updateLobbyScreen` never ran again to hide it. cap-220/221 caught the state on both machines (`phase:"lobby"`, `menuVisible:true`, `crRootDisplay:"block"`). Three lines: hide it in the sweep, remove stray `.hud-lobby` orphans in `init()` (body-mounted, so every re-init leaked one), and restore `connectionState = "ok"` in `disconnectPartySession` — only the connect/reconnect paths ever assigned it, so `getConnectionState()` kept reporting `"reconnecting"` at the menu with no socket. Test proven non-vacuous against the pre-fix file (2/2 fail).

### August 2, 2026 — Storerooms shelf negative-modulo pair, both halves closed with captures

- *(Art · Low)* **SHELF-PICK-1** — the carton **colour** hash carried the same negative-modulo bug as the stocking hash, so blue cartons were missing from most of every wall — ✅ **CLOSED 08-02**, one line at [backroomsSupermarket.js:2057](../../src/levels/backroomsSupermarket.js:2057): `(lvl + Math.round(a)) % 3` → `(((lvl + Math.round(a)) % 3) + 3) % 3`. **Filed and fixed as its own card deliberately** — Wyatt's call — so the `ef5b35e` stocking capture stayed a one-lever A/B instead of a two-change frame. **Visually verified on the same side-0 camera** (`node tools/shoot-gpu.mjs --shot storerooms --cam "-12,5.3,44,-12,5.3,55"`, ANGLE/D3D11 RTX 4090): the amplified ×4 diff shows **12 whole cartons changing colour and zero geometry change** — exactly the right signature for a colour-only fix, since `pick` never gated stocking. Enumerated over the generator's own loop: frame window unchanged at **42 stocked slots**, colours **15 red / 26 beige / 1 blue → 15 red / 13 beige / 14 blue**; whole arena **612 slots, blue 111 → 208, beige 301 → 204, red 200 → 200**. Red does not move because `pick === 0` is the one bucket sign-agnostic under JS `%` — which is also *why* the bug hid: the wall never looked unstocked or monochrome, it just quietly spent a third of its palette on beige. **Was:** JS `%` keeps the dividend's sign, so wherever `lvl + Math.round(a) < 0` the hash returned `0 / -1 / -2` and the ternary at `:2058` only spends `1` on blue — every negative remainder fell through to beige. Audit item 1 said to fix this in the same edit as the stocking hash; `ef5b35e` fixed only the stocking half. Found 08-02 while reading the loop to pick a capture camera.
- *(Art)* **Storerooms audit item 1 visual debt** — `ef5b35e` shipped on code verification with its proof explicitly owed — ✅ **SETTLED 08-02** in `f355bac`. Side-0 shelf wall, same camera: **0 of 60 in-frame slots stocked before, 42 after**; five levels of bare board became a stocked wall and the amplified diff was black except for the new cartons. Ruled a real look win, not correctness-only. Density caveat recorded: `skipThreshold` untouched, so the wall went ~329 → ~612 boxes — the audit's 4–5 / 6–7 retune stays open. Full writeup in [art-audit-storerooms.md](./art-audit-storerooms.md) item 1.

### August 1, 2026 — tooling stabilization + Fight Night UI sweep (BACKLOG closed rows, full text)

Migrated verbatim from BACKLOG per its own rule ("Completed rows are not kept here").
Several of these rows exist nowhere else — this is their evidence of record.

- *(Engineering · Medium)* TEST-MARGIN-1 — one qa test runs with no timeout headroom in CI, so any new test anywhere can turn the gate red — ✅ **CLOSED 08-01** — explicit `30_000` timeout on that one case (`tests/party-do/beacons.test.js`), the row's primary lever. **Flood size deliberately unchanged at 200**: it is what makes "far past the 80-row ring depth" mean anything, so buying margin by shrinking it would have paid in assertion strength. **Negative control** — with the timeout set to `1` the case fails `Test timed out in 1ms`, so the third argument is provably honored rather than decorative. Per-test measurement that confirms the original diagnosis: the flood case is **2030ms of the file's 4610ms locally**; at CI's measured 2.3× slowdown that is ~4.7s against the old 5000ms default, i.e. **~6% margin** — i.e. it was always one unrelated test away from red. The other five cases in the file sit at 108–1237ms (~44%+ margin at the same ratio) and were left on the default, so a genuine hang in them still fails fast. **Was: filed 08-01** by LOAD-PROGRESS-1, which tripped it. `tests/party-do/beacons.test.js:46` — *"stops a flood from evicting a real capture out of the 80-row ring"* — runs on the **default 5000ms** vitest timeout with almost none to spare: that file took **10681ms** for its 6 tests in the last green CI run (`30688071083`, `b34b2de`) against **4.66s locally**, i.e. CI is ~2× slower and the flood case sits just under the ceiling. **Not a flake** — LOAD-PROGRESS-1's four new cases added 1.28s of real wall clock in the *happy-dom* pool (the mode-entry exit fade), and the *party-do* pool's flood test then timed out on run `30689834838` **twice**, initial and `gh run rerun --failed`, both `Test timed out in 5000ms`. Fixed from the wrong side in `b5c29f2` — those cases now dismiss synchronously (1280ms → 89ms), which **restores the previous balance and adds no margin**; the next test anyone adds, in any pool, can re-trip it. Lever: give that one case an explicit timeout (vitest's own error message says so) or shrink the flood; **do not raise the global `testTimeout`** — that hides real hangs across all 901 tests. Note the workerd pool is the slow one in CI, so it is the natural place for this to surface again. **Does not re-open SEC-BEACON-1** (closed) — the shipped rate limit is fine, only its test's timing margin is at issue.
- *(Engineering · Medium)* TEST-COUNT-1 — `vitest run` can report an all-green summary while silently dropping whole test files — ✅ **CLOSED 08-01** — `npm test` now runs through `tools/test-count.mjs`: discovers `tests/**/*.test.js` on disk at run time, compares against the JSON reporter's file list, and exits 1 **naming the missing files** (negative control verified: an on-disk spec vitest excluded → exit 1; clean run → exit 0; no hardcoded count anywhere). A workerd silent drop is now a hard red, not a smaller green. **Residual, still open (do not re-run eliminations below):** the workerd root cause itself — on the next pool-start failure dump `Get-Process workerd` + `Get-NetTCPConnection`. Original filing: **Filed 08-01**, found while chasing a workerd pool flake. Vitest's summary counts only files that **ran**, so a file dropped before execution reads as a smaller passing suite rather than a failure. Directly observed twice on 08-01: `Test Files 86 passed (86)` / `Tests 895 passed (895)` with `beacons.test.js` dropped, and `Test Files 84 passed (84)` / `Tests 873 passed (873)` with `beacons` + `cartRaveServer` + `routes` dropped. True suite was **87 files / 901 tests** when filed; it is **88 / 909** as of `f4f4f6c` (`tests/skillsSync.test.js`, +8). **Do not hardcode either number** — that is the same trap one level up. Discover the spec count at run time (glob the spec globs, or compare `numTotalTestSuites` against the discovered file list) and fail on *below-discovered*, so adding a test file never needs a gate edit. The arithmetic confirms the mechanism rather than assuming it: 901 − 895 = 6, exactly the 6 cases TEST-MARGIN-1 measured in `beacons.test.js`. **Why it bites this repo specifically:** AGENTS.md § Gates tells every agent to *"report results by number"* — so the number is the artifact, and the number lies by omission. Exit code is non-zero and the unhandled error does print, so CI is not fooled; a human or agent reading the summary line is. It fooled me mid-session before I re-read the raw output. **Lever: assert the expected file count.** Vitest has no built-in "expect N files" — wrap `vitest run` (or read `--reporter=json`'s `numTotalTestSuites`) and fail when the count is below the discovered spec count. Cheap, deterministic, no dependency on ever reproducing the pool flake. **Deliberately NOT the lever: a workerd retry or startup-timeout knob.** That is a symptom fix for a cause that is not proven — see the forensics below — and the systematic-debugging skill is explicit that symptom fixes count as failure. **Forensics already done (do not re-run these eliminations):** the trigger is `Failed to start cloudflare-pool worker … Caused by: connect ETIMEDOUT 127.0.0.1:<port>` at pool startup, *before* any test code loads. **Ruled out —** (1) the montage/ccStyle change of the same session: neither file is imported by any test; (2) Hyper-V/WSL reserved TCP ranges: exclusions are `1055-1154`, `1282-1381`, `4909-5008`, `9124-9223`, `50000-50059` and the observed ports 8085 / 3436 / 3437 / 5963 fall in none; (3) **CPU contention from concurrent Vitest runs — tested directly and refuted**, two simultaneous full suites on 24 logical / 12 physical cores both returned 87/87; (4) inherent flakiness at default parallelism, 0 failures in 3 sequential runs. **Not reproducible: 0 failures in 5 runs total** against 2-for-2 in the original window. **Still live, untested:** orphaned `workerd` processes — two were alive from 11:06:26 across both failures and there were zero afterwards. `ETIMEDOUT` rather than `ECONNREFUSED` fits a **full accept backlog** (Windows drops SYNs silently when the listen queue is exhausted) rather than "nothing listening", which is what a half-dead workerd still holding its socket would produce. Defender real-time protection is on and its exclusion list needs admin to read, so that was neither cleared nor confirmed. **Next capture, so a recurrence is evidence instead of speculation:** dump `Get-Process workerd` and `Get-NetTCPConnection` on pool-start failure. Sibling of **HARNESS-NULL-1** (rigs that cannot demonstrate a null result) and **TEST-MARGIN-1** (a gate with no margin) — same family: the gate reports something it has not actually established.
- *(Engineering · Medium)* COUNTDOWN-ARM-2 — the battery's `host heard countdown_3` check has ~0 margin and fails on a loaded machine — ✅ **CLOSED 08-01.** Fixed in the check, because **the product behaviour is correct**: `hud.js:604-626` SAMPLES the digit off the round clock each frame and announces only on change, so a longtask spanning the first digit window (`countdownMs/3` ≈ 1200ms) makes the first sample "2" and beat 3 never fires — and announcing it late would desync from the visible digit. Dropping a beat whose moment has passed is right; the assert was measuring the harness box's frame health. Replaced with **two checks that measure the intent**: (1) `host announcer armed before the countdown started (playReady arm)` — the actual COUNTDOWN-ARM-1 subject, `carts-ready` before the `round/phase → countdown` event, which carries **real margin (734–760ms measured)**; (2) `host PA ran a contiguous countdown into GO` — beats must be a contiguous TAIL of 3→2→1→GO, so a stall may eat leading digits but a silent, out-of-order, non-contiguous or GO-less announcer still fails, and a dropped beat is REPORTED with the longtask evidence that explains it. **Negative-controlled, not assumed:** 9 sequence cases asserted, and the first revision had a hole — bare `["go"]` passed, so an announcer that had stopped emitting digits entirely would have read as a stall; closed with a 2-beat minimum (≈2400ms tolerated, double the ~1200ms ever observed). **Full battery 6/6 · complete suite** (`battery-2026-08-01T17-23-23-193Z.json`), spawnlock 6/6 on three consecutive runs. qa 901/87. **Was: filed 08-01.** `tools/netharness.mjs:287` (spawnlock, the COUNTDOWN-ARM-1 diag assert) went red in the 08-01 full battery — `announcer=countdown_2,countdown_1,go`, beat 3 missing — after passing at `423008f` (03:31 battery) with all four beats. **It is NOT tonight's code.** Controlled A/B/C on one machine, one session, same conditions: HEAD **4/4 fail** · LOAD-PROGRESS-1's three files reverted **4/4 fail** · **the entire `423008f..HEAD` `src/` + `index.html` window reverted — i.e. the exact tree that was green at 03:31 — 3/3 fail.** A control arm that fails is the whole answer: no code in the window is responsible. **Ring eviction was ruled out, not assumed** — `__ccDiag` holds 39 events against `EVENT_BUFFER_MAX = 512` with the oldest still `boot/diag-installed`, so nothing aged out; the host genuinely never records the event. **Mechanism, measured across 11 samples:** `carts-ready` (the playReady arm) lands only **309–499ms** before the first `round/phase` event, and beat 3 fires at countdown start — so the arm wins by a third of a second or loses, depending on machine load. This box reports `gpuClass:"software"` (SwiftShader), `qualityTier:"low"` and **103 longtasks / 10.3s total / 1371ms max** in a single run. **Two things to decide:** (1) the gate is environment-sensitive and should assert on something with real margin — same family as **TEST-MARGIN-1**; (2) there may be a genuine product nit behind it, since a slow player's client would likewise miss the spoken "3". Note the scenario's actual NET-2 subject stayed green throughout (joiner drove 42.07m / 24.93m off spawn). Probe used: `.diag-captures/ringprobe.mjs` (gitignored) — mirrors netharness `makeClient` and prints beats + arm margin per run.
- *(Engineering · Low)* ANLX-BIND-1 — POST `/api/analytics` returns 204 when `ANALYTICS_LOG` binding missing — ✅ **CLOSED 08-01** — literal `ERROR_LOG` mirror at `party/index.ts` analytics POST: `else if (!env.ANALYTICS_LOG) console.log(…slice(0,2000))`; still 204; GET 500 unchanged. Party-do harness always binds the DO — missing-binding branch not exercised by `qa` (same gap as ERROR_LOG).
- *(UI / UX · Medium)* HUD-BOOST-PODIUM-1 — BOOST slab stays on screen through the whole podium and lands on MAIN MENU — ✅ **CLOSED 08-01** — `824b0a1` replaced the eight-name allow-list with `#hud.hud-suppressed > * { display: none !important; }`. `> *` rather than naming today's children, because naming them recreates the same soft type-list that let `.hud-boost` escape. `npm run podium` 80/80 → **88/88 ×2** on a new `no gameplay HUD over the podium` check; **negative control** — with the old CSS restored it fails every cell naming `hud-region-stage · hud-region-pod · hud-hitmarker · hud-edge-danger`, so it detects the bug rather than passing by construction. Pause/resume probed live (in-match 7 rendered children → paused 0 → resumed 7). **Was:** two layers — `hud.js` `update()` early-returns on `suppressHud` (`escOpen \ — \ — roundPhase === "podium"`) *before* reaching `updateBoostWidget`, so the inline `display:flex` from during the round was never rewritten; and the CSS allow-list covered 8 of 16 suppressible surfaces and did not name `.hud-boost`. (Earlier revisions of this row said `.hud-combo` — **no such class exists**; it is `.hud-combo-badge`, and under the blanket rule neither is named anyway.) Deliberately **not** fixed by wiring `hideGameplayElements()` into the suppress branch: `suppressHud` is also true for the pause overlay, and a destructive teardown on every Esc press is wrong.
- *(UI / UX · Low)* RESULTS-TOAST-1 — unlock toast collides with the results headline in short windows — ✅ **CLOSED 08-01 — structurally, by `824b0a1`.** `.hud-toast` is built into `.hud-region-stage` (`hud.js:1862`), so HUD-BOOST-PODIUM-1's `#hud.hud-suppressed > *` hides it during podium along with every other region. **Closed on that structural basis and not on a capture, deliberately:** the toast only fires when a round actually grants an unlock, so demanding a toast-bearing cell would gate this on a non-deterministic event. For the same reason it is correctly NOT a check row in `tools/podium.mjs`; the `no gameplay HUD over the podium` check covers it implicitly, since a visible toast would make `.hud-region-stage` a leaked child. **Was:** the `◆ UNLOCKED` toast (`main.js:2281`, 5000 ms) painted over `#results-overlay` — straight through `THE STORE IS NOW CLOSED` and the verdict line at 1025×600. Same root family as HUD-BOOST-PODIUM-1: an allow-list that had fallen behind the HUD.
- *(UI / UX · Medium)* LOAD-PROGRESS-1 — the mode-entry meter is decorative for the entire arena build — ✅ **CLOSED 08-01** — `7cd10c7`. Ported the boot splash's shipped pattern (`index.html:597-608`, BOOT-METER-1) to the mode overlay: monotonic floor in `setProgress` + ambient ticker in `withModeEntryLoading` (own ceiling per segment, stops one point short, cleared in the existing `finally` incl. the throw path) + four real anchors bridged from `markBootPhase` via a new `onBootPhase` subscribe hook in `bootTimeline.js`. The ticker steps by **wall clock**, not one step per callback — the 96→100 stretch blocks the main thread and a starved interval otherwise resumes ~400ms behind. Stale-mark trap handled by a `backfillBootMarks` predicate passed **down** from `bootstrap.js` (`isWorldBootstrapInFlight`) rather than imported — bootstrap imports loadingScreen, so reading its state directly is a cycle; `performance` marks live for the whole page, so replaying them on a second play entry would pin the bar at 85 through a real rebuild. Cold `classicRecord` 1920×1080 now steps **20 → 21 → … → 46 → 48 → 55 → 58 → 78 → 85 → 88 → 94 → 96 → 97 → 99 → 100**, ~200–400ms apart. `npm run loadshots` **144/144 on two consecutive runs**, all three themes × 8 cells, on two new checks — `meter never goes backwards` and `no progress gap > 1500ms` — over the timeline the tool already collected (largest gap in the confirming run **1333ms**, was 11502ms). Consecutive equal values are collapsed before checking: assigning `textContent` fires a mutation record even when the string is identical, so raw records would score a repaint as movement. qa 901/87. **Residual, deliberately not chased:** the ~1s tail between 96 and 100 is the `warmupBeforeRoundStart` block itself — no timer fires inside it, so no meter design can paint through it. **BOOT-PERF-1 territory, out of scope per the card.** **Was:** full card **[load-progress-1.md](./load-progress-1.md)**. **Found 07-31 by `npm run loadshots`** (FIGHT-VERIFY-1 Phase C) on three consecutive runs across all three arena themes: a cold `classicRecord` entry at 1920×1080 reads `0%` → `15%` → **nothing for 11.5 seconds** → `88%` → `94%`/`96%` same ms → `100%`. **The card doc OVERTURNS this row's original diagnosis** — the fix is not "forward the dropped `onProgress`": `levels/index.js`'s 60% and 90% milestones sit in the same synchronous task (`initFn` has no `await`), so 90 overwrites 60 before the browser can paint and **60 can never render on any path**. The plan instead ports the boot splash's already-shipped `__crBootFloor` pattern (`index.html:597-608`, from BOOT-METER-1) to the mode overlay: monotonic floor + ambient ticker + four real anchors bridged from `markBootPhase` marks that already fire inside the silent window. Also fixes the 90→88 backwards step — which occurs on the **world-warm-but-arena-stale** path, not the warm path as originally filed. Evidence: the `meter renders progress` check row prints the complete timeline for every cell; frames in `.diag-captures/loadshots/mode-*-b-mid.png`.
- *(UI / UX · Low)* BOOT-METER-1 — the boot splash meter reaches 100% and then jumps *backwards* to 75% — ✅ **CLOSED 08-01** — `dismissInitialBootSplash` calls `__crBootFloor(100)`; floor cap raised 90→100 so bootProgress latches and later 75/90 milestones no-op.
- *(UI / UX · Medium)* MENU-CMD-FEEL-1 — the main menu's seven command rows have no CSS hover or press feedback at all — ✅ **CLOSED 08-01** — Wyatt PASS. White 5px left rail + hotter yellow hover at `8d1ee24` (paired with FOCUS-CYAN-1). Was: cascade left only a 3% JS label scale; CSS hover/press deltas were neutralized by equal-specificity `.cr-cmd` overrides.
- *(UI / UX · Low)* MENU-NAME-HOVER-1 — player-name hover affordance never renders — ✅ **CLOSED 08-01** — deleted dead .cr-name-display:hover border; plate zeros border (pencil owns rename).
- *(Tech Debt · Medium)* SHEET-ESC-1 — `tools/sheet.mjs`'s pause-overlay gate is dead code — ✅ **CLOSED 08-01** — `readSubject` uses computed-style `shownEl` for esc + softGl (both `position: fixed`); `escOffsetParentNull` printed not checked. Default `npm run sheet` = closed path only; open-pause recovery is one-off. Mirror of podium/loadshots/states.
- *(Tech Debt · Medium)* CC-COHERE-1 — The three Command Center surfaces don't read as one product — ✅ **CLOSED 08-01** — both changes landed, verified by computed style in-browser on all three regenerated pages rather than by reading the diff. **(1) The `body` override at `archHtml.mjs:406` is gone.** Measured before/after on `architecture.html`: `backgroundImage` **`none` → the radial wash present**, `color` `#e0e0ec → #f0eff8`, `background` `#0a0a0f → #0a0a11`, font now BASE_CSS's `15px/24px "Segoe UI"`. The replacement comment states the mechanism so it does not come back — a `background:` **shorthand** resets `background-image`, which is why one page silently lost the wash; page-specific body rules must be individual properties. **(2) `CHROME_CSS` exported from `ccStyle.mjs`** — 8 selectors (`.sticky-bar`, `.sticky-inner`, `.nav-brand`, `.nav-brand .neon`, `.nav-links` ×3, `h1`, `h1 .neon`, `h1 .cc`, `.stamp`), three copies collapsed to one, opt-in like BASE_CSS so `montage.mjs` (tokens-only) is untouched. **The console's drift is now gone, measured:** `h1 .neon` `0 0 12px/.6 → 0 0 18px/.55`, `h1 .cc` `12px/3px/700 → 13px/4px/600`, `.stamp` `margin-top 5px → 4px`, and it gained the `-webkit-backdrop-filter` it was missing. **The measure split is preserved as intended and is now declarative, not accidental:** `--measure` / `--chrome-gap` / `--chrome-pad` default to the dashboard values (1440 / 20 / 8) and the console declares `1040 / 4 / 16` once in its own `:root`; `.wrap` reads `var(--measure)` so the console states its width in one place instead of two. **Regression control:** `dashboard.html` re-measured after the change and every chrome value is identical to before (1440px, 20px, 18px/.55, 13px/4px/600, 4px, nav-links flex/16px/`--dim`) — the reference surface did not move. **Gotcha for the next person editing these generators:** the CSS lives inside JS **template literals**, so a backtick in a comment terminates the string — the first `npm run dashboard` died with `SyntaxError: Unexpected identifier 'body'` from a \`body\` in prose. Write those comments without backticks. Gates: **qa 909/88**, knip clean, health:check ok. **CC-LABEL-1 is NOT subsumed** — no label rules were touched; it stands as filed. **Was:** **Pick this one first — it is the structural parent of the other `CC-*` rows.** Two changes, no redesign. **(1) Delete the `body` override at `archHtml.mjs:406`** (`background:#0a0a0f; color:#e0e0ec; font-family:-apple-system,…`). It sits *after* `BASE_CSS` and beats it: `background:` as shorthand resets `background-image`, so the architecture page is the **only** CC surface with no radial backdrop wash, and `#e0e0ec` is a fourth text value dimmer than `--text` `#f0eff8`. Delete the rule and the page inherits the shared layer. (The `font-family` third is a **no-op on Windows** — `-apple-system`/`BlinkMacSystemFont` don't resolve, so it already falls through to Segoe UI; it should still go, but it is not why the page looks off.) **(2) Hoist the duplicated page chrome into `ccStyle.mjs` as a `CHROME_CSS` export** — `.sticky-bar`, `.sticky-inner`, `.nav-brand`, `.nav-links`, `h1`, `h1 .neon`, `h1 .cc`, `.stamp` are **byte-identical** in `dashboard.mjs:305-318` and `archHtml.mjs:409-434`, and near-copied in `playtestConsoleHtml.mjs`. Three copies of the same furniture is *why* these pages drift — someone edits one. Opt-in like `BASE_CSS`, so `montage.mjs` (tokens-only) is unaffected. Partly subsumes **CC-LABEL-1**: four of its nine label rules live in `BASE_CSS`. **Deliberately NOT in scope: keep the `max-width` split** — console `1040px` vs dashboard/architecture `1440px`. The console is a single reading column of queue cards; the other two are dashboards. That is a typographic decision, not drift. Verify by regenerating all three pages (`npm run dashboard`) and diffing the chrome.


### July 17–20, 2026 – Run 7 playtest mission (closed evidence)

Rolled out of STATUS.md's active queue on 07-31 — it had been sitting there as a historical
strip long after it stopped being live work. Superseded triage docs:
[2026-07-17](./playtest-triage-2026-07-17.md) … [run6](./playtest-triage-2026-07-18-run6.md).

| # | What | Status |
|---|------|--------|
| **Run 7** | Full playtest mission | ✅ CLOSED |
| **NET-1** | Two-browser full-round smoke | ✅ PASS (core + residual) |
| **NET-2** | Quickplay join frozen cart / slow load | ✅ PASS ~3s driveable |
| **NET-MIG-3** | Freeze / ghost colliders after host migrate | ✅ PASS + live |
| **NET-PRES-1** | Fall/collision event-id dedupe | ✅ DONE (dup face; loss residual) |
| **NET-SD-1** | SD untie / sole-leader self-fall softlock | ✅ DONE |

Do not re-open these without new evidence — they are listed in STATUS's standing "Do not".

---

### July 21–31, 2026 – Tier A drain, Tier B/C feel, security sweep, analytics gating

Archived out of STATUS.md's active queue once closed (STATUS carries only live cards).
Live-at values are the deployed commit / Cloudflare Version at close.

| # | Work | Outcome |
|---|------|---------|
| **A1** | host hitch forensics | `hiddenDuringGap` latch shipped + validated (a real 6.55s tab-out caught cleanly) — instrumentation proven |
| **A1** | COUNTDOWN-WARM-1 fly-over camera shader/composer stall | ✅ PASS (Wyatt playtest 07-22) |
| **A1** | COUNTDOWN-SYNC-1 non-host countdown clock-domain sync | ✅ PASS (Wyatt playtest 07-22; empty-quickplay edge case logged to BACKLOG) |
| **A1** | Intel-as-host capture (original chronic-freeze question) | ✅ PASS (Wyatt confirmed 07-22) |
| **A1 / HOST-CAP-1** | weak-host warning residual (after HOST-ROLE-1) | ✅ **SHIPPED 08-01** — toast once when local is host and join-time `score < WEAK_HOST_WARN_SCORE` (50); neutral 50 never warns; latch clears on lose-host. Prod Version `76ebdc37` / HEAD `423008f`. |
| **BOOT-PERF-1** | selected-arena idle warm gen-cancel | ✅ **SHIPPED 08-01** — `ensureWorldBootstrapped(selected)` + gen retarget mid-flight; stale flight never latches done. Same deploy. `bootstrapIdleWarm.test.js` ×5. |
| **A2** | INPUT-KB-1 keyboard digital-to-analog ease + menu nav | ✅ confirmed good by Wyatt |
| **A3** | MP-FX-1 non-host gameplay VFX parity | ✅ PASS (Wyatt playtest 07-22: opponent charge glow + hop land dust/thud on non-host) |
| **A4** | ARENA-COL-1 Cart Rave pit KO detection & kill-zone reliability | ✅ PASS (Wyatt playtest 07-22 — rim entry pose/time → `buildKOEvent`) |
| **A5** | SRV-TEST-1 direct tests for party decision cores | ✅ done (A5a helpers + A5b DO harness; 739 tests at close) |
| **A6** | NET-SIM-1 reconnect / socket-lifecycle sims | ✅ closed (Cap-200 shipped + menu PASS; hostReload 13/13) |
| — | COUNTDOWN-ARM-1 play-ready-gated continuous `game_start` | ✅ PASS (Wyatt smoke 07-22 on `e08e5f5` — full 3-2-1) |
| **A7** | ANLX-VIEW-1 analytics reading surface (`analytics:pull` + CC panel) | ✅ PASS (Wyatt smoke 07-22) |
| **B2** | CARGO-WT-1 life-scoped grocery weight (boss/glass) | ✅ closed (Wyatt feel accept 07-22; look → CARGO-VIS-1) |
| **B3** | HIT-FEEL-1 hit feedback — weak normals + noisy incoming | ✅ PASS (Wyatt playtest 07-22) |
| — | ARENA-BAL-1 Sundial + Storerooms self-KO rate | ✅ closed (Wyatt 07-22, no code) |
| — | QA-STATUS-1 STATUS token overage broke `qa` | ✅ closed — 07-21 log archived, queue reordered |
| — | HYGIENE-1 4-item sweep | ✅ closed 07-30 — sourcemaps off · boot-error filter · 3 stale remotes deleted · profiler `--dpr`; default branch → `cart-clash` |
| **C2** | CARGO-VIS-1 full-bay fill + rim overflow look | ✅ closed (Wyatt prod playtest PASS 07-30 on `b13bafb`) |
| — | WARM-IGPU-1 first-play warm stall swallows countdown (medium iGPUs) | ✅ CLOSED — prod playtest PASS 07-30 on `a9dbc7d`. Solo residual = WARM-SOLO-1 ([plan](./warm-igpu-1.md)) |
| — | CARGO-HUD-1a cargo-readout mock, 3-state | ✅ closed 07-30 — nameplate placement + score-strip chip look |
| — | CARGO-HUD-1 opponent cargo readout on the nameplate | ✅ PASS (Wyatt 07-30) — live at `38d0dfc` / Version `f8e8da1f` ([card](./cargo-hud-1.md)) |
| — | SKYBOX-1 restore never-built `sceneExtras` skybox (review C-01) | ✅ closed 07-30 — live at `c074c2a` / Version `8e5bb259`; LOW tier-gated per Wyatt (`skyExtras` knob), UFO-in-pit bug fixed |
| — | SEC-BEACON-1 rate-limit the open POST beacons | ✅ CLOSED 07-30 — live at `65dea12` / Version `255d6284`. Per-IP 30/60s inside each log DO (budget per-DO, not shared). Live flood probe: 30 accepted, 429 at #31. Wyatt playtest PASS |
| — | SEC-UNLOCK-1 DEV-gate `?devUnlocks=all` (`=off` deliberately kept) | ✅ CLOSED 07-30 — live at `64eff60` / Version `56439ef4`, prod-verified |
| — | SEC-ROUTE-1 Worker `/api/*` routes `includes()` → exact `===` ×4 | ✅ CLOSED 07-30 — live at `8da2575` / Version `268f6ff2`, prod-verified. Also fixed a live 500: unmatched paths returned null from `fetch()` → now 404 |
| — | ANLX-ATTRACT-1 mid-round joins booked phantom matches | ✅ CLOSED 07-31 — live at `2e85f0b` / Version `4083335f`. Acceptance below |
| — | ANLX-BULK-1 short `loss` bulk poisoned product analytics | ✅ CLOSED 07-31 — tool-sourced / intentional-on-machine, not player-path. L1 `#summary` floor `MIN_MATCH_DURATION_MS=3000` + L2 client skip of short non-null `match_ended`. Tests: `analyticsGating` + `analyticsSummaryFloor` |
| — | ANLX-BIND-1 missing `ANALYTICS_LOG` silent discard on POST | ✅ CLOSED 08-01 — `party/index.ts` POST `/api/analytics` mirrors ERROR_LOG: `else if (!env.ANALYTICS_LOG) console.log(…slice(0,2000))`; 204 kept; GET 500 unchanged. `qa` does not hit the missing-binding branch (party-do always binds). |
| — | SHEET-ESC-1 sheet pause-overlay gate was dead (`offsetParent` on fixed) | ✅ CLOSED 08-01 — `tools/sheet.mjs` `readSubject` uses computed-style `shownEl` for esc + softGl; `escOffsetParentNull` printed not checked. Default sheet = closed path; open-pause recovery one-off only. |
| — | MENU-NAME-HOVER-1 dead `.cr-name-display:hover` border | ✅ CLOSED 08-01 — rule deleted; plate zeros border (pencil owns rename). |
| — | BOOT-METER-1 boot splash 100% then snaps to 75% | ✅ CLOSED 08-01 — `dismissInitialBootSplash` → `__crBootFloor(100)`; floor cap 100 so later 75/90 milestones no-op. |
| — | PAUSE-ROW-1 pause action row tug on hover | ✅ CLOSED 08-01 — Wyatt PASS. `.esc-action-slot` flex cells; skew+lift on the button only (`8d1ee24`). |
| — | MENU-CMD-FEEL-1 main-menu command rows had no CSS hover/press | ✅ CLOSED 08-01 — Wyatt PASS. White 5px left rail + hotter yellow (`8d1ee24`). |
| — | FOCUS-CYAN-1 focus rings mixed yellow dashed / designed cyan | ✅ CLOSED 08-01 — Wyatt PASS. All cyan solid+glow; yellow dashed retired; states guard flipped (`8d1ee24`). |
| — | SEC-TOKEN-1 admin tokens out of query params | ✅ CLOSED — `Authorization: Bearer` only via `party/adminAuth.ts` (`requireAdminToken`); query `?token=` rejected; pull tools send Bearer |
| — | CARGO-RACE-1 bay built empty if grocery GLTFs lose the load race | ✅ 07-30 — bays self-heal on init resolve (`createCargoBay` queues pre-init; `buildPool` populates). Cold-solo probe `[0,0,0,0]` → `[18,18,18,18]` PASS |
| — | SHEET-1 in-match contact-sheet tool | ✅ BUILT + PROVEN 07-31 — `npm run sheet` / `--all`; subject-is-HUD gate; residual gaps → FIGHT-VERIFY-1 ([sheet-1.md](./sheet-1.md)) |
| — | HUD-FEED-1 kill-feed row overflows its plate (narrow + landscape) | ✅ SHIPPED 07-31 — four commits ending `0b5369d` / Version `4cca79ca`. Portrait `min(78vw,320px)` + base `max-width:100%`; landscape ceiling 240→320. Wyatt playtest PASS portrait + landscape (BRIEFING 07-31) |
| — | MENU-HINT-1 menu hint bar scrolls over settings content | ✅ SHIPPED 07-31 — live at `7d2b840` / Version `a438b567`. `position:fixed` ≤1024 + live `--cr-hintbar-h` reserve + opaque bar bg. Wyatt playtest PASS |
| — | DIAG-DOC-1 docs claimed `__ccDiag.control` DEV-only / null in prod | ✅ CLOSED — comment/JSDoc + guides only. Control object: `DEV \|\| ?diag=1`; hub only when `?diag=1` |
| **B1** | AI-DIFF-1 NPC difficulty modes | ✅ shipped 07-22 (`49bfc2a`) — Medium baseline; Solo Easy default + menu; Quickplay Medium; Friends host pick |

**ANLX-ATTRACT-1 acceptance (07-31).** The agreed counting metric could not decide it: the
`<3 s` + `result=draw` cluster in the newest 1000 rows is 161 rows dated **07-20 (53) and
07-21 (108)** and **zero since 07-22** — it stopped growing eight days *before* the fix
deployed, and no multi-client quickplay traffic ran in between. `/api/analytics?view=list`
caps at the newest 1000 rows, so a low-traffic week makes that window read as "recent" when
it is stale. Closed instead on a live two-client probe against production on `2e85f0b`
(prod `?diag=1` → `__ccDiag.snapshot("analytics"|"round"|"net")`, `sink=beacon`):

| Signal | Result |
|---|---|
| Clients that adopted `phase=running` while unseated (`player_quit reason=joinRejected, phase=running`) | 2 → **zero `match_started`** |
| Transient phantom window (`running` + menu visible + `body=null`) | queue held at 1 (`session_start`); grew **only** when the cart body appeared |
| `match_started` emitted | 7, **every one carrying `joinedMidRound`** (6 `true`, 1 `false`) |
| `<3 s` + `draw` `match_ended` produced | 0 |

`joinedMidRound:true` is the discriminator — that prop is reachable only through the
participation latch (`emitStarted(true)` in `pollParticipation`); the un-gated phase-transition
path stamps `false`. Both halves hold: phantoms suppressed, real mid-round joins still counted.
Evidence rows `#34366`–`#34383` in the analytics ring (wiped by the subsequent DO reset).

---

### July 20, 2026 – NET-PRES-1 + NET-SD-1

| Work | Summary |
|------|---------|
| **NET-PRES-1** | Host stamps `eid` (`f{seq}.{i}` / `c{seq}.{i}`) on drained snapshot tails; non-hosts skip already-seen eids before KO reactors / collision FX. Module: `src/netcode/presentationDedupe.js`. Legacy 600ms victim + 250ms pair-key kept as fallback + NH-HIT echo. Loss-on-drop remains an unreliable-channel residual (score via `host_round`). |
| **NET-SD-1** | Sole-leader self-fall / untied wipeout crowns `pickSuddenDeathFallbackWinner` (best standing else second place). Suppress multi-way continue kept; tied wipeout still re-seats. |

---

### July 10–11, 2026 – Production Passes 2–5, stabilization & engine health

Compact record — the pass-by-pass index with commits lives in
[production-passes.md](./production-passes.md); long rationale in the
[decision log](../archive/decision-log-2026-07.md).

| Work | Landed as | Summary |
|------|-----------|---------|
| **Pass 2 — Performance** | `b79f277` (+ `fe923ab`) | 3-tier quality system (`qualityTiers.js`), Classic reflector/crowd cost work, mobile budgets, CPU alloc fixes. Plan archived: [production-pass-2-performance.md](../archive/session-notes/production-pass-2-performance.md) |
| **Pass 3 — UI/Presentation** | `7d37263`, `bdd33cc`, `ce737dd` | Sticker language on all menus/overlays, attract-mode arena menu, exit animations. Plan archived: [production-pass-3-ui.md](../archive/session-notes/production-pass-3-ui.md) |
| **Pass 3.2/3.3 — UX flow + density** | `d5c7f45`..`1b07515`, `5ed1b69` | Pause redesign, results rebalance, Friends overlay, discoverability, viewport-fit/touch/dvh |
| **Pass 4 — Gameplay/Combat/AI** | `73631e0` | Bot stall/latch fixes, proximity aggression, Sundial rim nav + podium contest, intensity ram SFX, hop/lip-assist gates (D-GP4-1) |
| **Pass 5 — VFX/Audio** | `043e793`, `7146d71`, `eb924af` | Grocery-spill juice + clatter, debris personality, cargo emissive, neon envMap, comeback callout, menu clicks, distinct Defeat screen, first-blood escalation, floor/edge + victory audio |
| **Stabilization pass** | `b9e8fb8`..`3754949` | Travel-based wheel roll, boost-bar leak fix, Zanzibar podium +20%, menu pacing ~700ms, grocery separation, clamp/lerp consolidation, dead config/code purge, knip zero-ignore, menu backdrop gradient (D-STAB-1/2) |
| **VFX-1 flicker root cause + fix** | `98317c1` | Confirmed on hardware: half-res *float* bloom mips (D-VFX-1/2). Per-arena pipeline: display-referred byte bloom on Storerooms (0 flicker), HDR elsewhere pending look check |
| **Netcode test punch list** | `1dbb48a`, `6ee9c0b` | `party/roundValidation.ts` + `party/hostSelection.ts` + `applyHostMigration` extracted and unit-tested (25+9 tests); P2P DataChannel frame/tail size gates (`p2pLimits.js`, 10 tests) |
| **Physics WASM** | `9d8a69e` → `8174180` | Rapier SIMD preferred, then reverted to **opt-in** after a game-breaking borrow error; standard build is the default |
| **Visual QA toolchain** | multiple | `npm run shoot`/`compare`/`blackframes`, `?blackmon=1`, `?rtmode=`, `?ablate=`, STATUS discipline ([visual-qa.md](../guides/visual-qa.md)) |
| **Debug panel** | `68a0cc8` | Tweakpane expanded: stats, camera, quality/level/rtmode, announcer |

Gate at the end of the run: `npm run qa` green — **285 tests / 28 files**, tsc clean, knip
clean (zero ignores). Pending validation (not shipped-quality yet): Wyatt playtest of
Passes 4/5 + stabilization + bloom A/B; two-browser NET-1 smoke.

---

### July 10, 2026 – Netcode connection lifecycle hardening

Stability pass on hybrid WebSocket + WebRTC netcode (architecture notes: [Game_Architecture.md](../reference/Game_Architecture.md) multiplayer section).

| Item | What landed |
|------|-------------|
| **Menu / session P2P teardown** | `disconnectPartySession()` calls `P2P.closeAllConnections()` so leave-to-menu does not leak RTCPeerConnections / DataChannels |
| **ICE disconnect grace** | `"disconnected"` waits 5 s before teardown; `"failed"` / `"closed"` immediate; timers cleared on recovery and `closeAllConnections` |
| **Mid-match P2P reconnect** | Host `maintainHostPeerConnections()` on keepalive — re-offer missing/dead/channel-down peers; cooldown + stuck-negotiation timeout in `CONFIG.net` |
| **Binary decoder bounds** | `decodeHostStateSnapshot` returns `null` on short buffers / `numCarts > 4` / payload shorter than cart count |
| **Reject-pending cleanup** | `#rejectPendingConn` only sends `joinRejected` + `close()`; `onClose` owns pending-picker / IP / slot cleanup |

**Tests:** `tests/netcode.test.js` (truncated/invalid binary), `tests/p2p-signaling.test.js` (ICE grace, maintain/reconnect, rate limit).  
**Deferred (not shipped):** historical remote rewind during CSP reconciliation; gating drive input on `hasSpilled` (VFX flag, not KO freeze).

---

### July 10, 2026 – Production regression audit (investigation only)

Focused bug sweep of Stability Pass 1 + uncommitted solo-polish tree (no feature work, no large refactors). Gate at audit: `npm run check` green — tsc, **174** Vitest tests, knip.

**Verified healthy / non-issues** (logged so they are not re-triaged as open defects) — full table in [project-state.md §5](./project-state.md#5-known-issues):

- SD fall-loop spectator guard (flagged spectators), music playlist rollover fix, lobby non-host leave → all-ready, customization hue partial-save, cart scale after shatter
- Solo rubberband double-gated (solo only); hop-land host broadcast suppress + prediction `onHopLand: null`; NPC hop host-only by design
- Living Store: CONFIG restore on SD/phase leave; snapshot `dir` self-heal
- First-solo load idle-warm suppress / level override (worst case = full rebuild)
- Product non-bugs: no near-edge ambient telegraph (hit vignette only); sunglasses tab 1.35× zoom is intentional; no “random arena rotation” feature

**Still open** (forward work stays on [ROADMAP.md](./ROADMAP.md) Phase 4): multi-way SD host-promote spectator reconstruction; promotion-before-SD-sync; Spill Bonus presentation host-only; SD mid-charge SFX; hop flags on respawn; rematch arena after migration; host tab rAF freeze; two-browser + visible-tab smoke.

---

### July 10, 2026 – Solo Polish Sprint (feel / load / bots)

Session notes: [solo-polish-2026-07-10.md](../archive/session-notes/solo-polish-2026-07-10.md).

Solo-first juice and bot depth (no post-FX/composer changes). Death-cam “follow killer” was attempted and **reverted** (regression).

| Item | What landed |
|------|-------------|
| **Spill Bonus presentation** | `onSpillBonusAward` in `directiveEngine.js` → float/feed in `main.js` / `hud.js` (host presentation path; multiplayer client float/feed still deferred) |
| **First-Solo load hardening** | Selected-level cold-load, idle-warm suppress, cart prefetch (`bootstrap.js` / `levelManager.js`) |
| **Directional hit vignette** | Where you were rammed from (cart-colored DOM wash) — `pulseLocalHitDirectionVignette`, `hud` edge-danger CSS, `src/utils/edgeDanger.js`, `CONFIG.ramming.fx.hitDirMinIntensity`. Near-edge ambient telegraph **cut** by product decision (not missing wiring). |
| **Solo AI rubberband** | `src/utils/soloRubberband.js` + `CONFIG.cart.ramBoost.soloRubberband`; wired in `getAiAxis` + NPC nitro commit (solo only) |
| **Hop landing SFX/VFX** | Rising-edge floor contact after hop → distinct thud + light dust; one-shot flags `hopAwaitingLand` / `hopAirborne`; prediction replay nulls FX; host suppresses floor broadcast on hop land |
| **NPC rare hop** | Host-sim only; threat dodge + near-edge juke; `CONFIG.cart.hop.npc`; `maybeTriggerNpcOpportunisticHop` + `isNpcNearHazardEdge` |

**Tests:** `tests/edgeDanger.test.js`, `tests/soloRubberband.test.js`, `tests/hopLanding.test.js` (+ engine / SD stubs). Suite size at later regression audit: **174** Vitest tests (`npm run check` green).

---

## Architecture Refactors (June–July 2026)

Narrative snapshot of the major refactors that shaped the current module structure. Detailed per-file entries live in the dated log below.

- `src/bootstrap.js` — menu → gameplay flow extracted from `main.js`
- `src/levelManager.js` — level preview + swapping extracted from `main.js`
- Knip cleanup: unused exports reduced and codebase hardened
- 100% Type safety achieved under `npx tsc --noEmit`
- CSS extraction: ~2600 lines of inline CSS moved from `hud.js`, `pauseOverlay.js`, `resultsOverlay.js` to dedicated stylesheets in `src/ui/styles/` (hud.css, pauseOverlay.css, results.css, global.css, later `tokens.css`)
- `.cursorrules` cleaned up (~200 lines removed, simplified guardrails)
- **WebRTC signaling root-cause fix**: host now creates the DataChannel offer to each peer (`ensureHostPeerConnections()` in the `MSG.slots` handler) — previously `createOffer` was unreachable (only non-host no-op callers), so no channel ever opened and P2P gameplay sync was fully inert. `tests/p2p-signaling.test.js` covers the full handshake.
- `main.js` remains the thin orchestrator and wiring hub
- **Production-readiness pass (July 7)** — see [audits/production-readiness-audit-2026-07.md](../archive/audits/production-readiness-audit-2026-07.md): Safari mp3 audio fallbacks, OG/Twitter meta + fixed PWA manifest, runtime error reporting (`installGlobalErrorReporting`), `src/utils/storage.js` key registry, `src/utils/device.js` shared touch detection, dead assets/config removed (~25 MB), `npm run check` baseline gate
- **Production value pass (July 7)** — see [audits/production-value-pass-2026-07.md](../archive/audits/production-value-pass-2026-07.md): 100-item ranked player-experience review; top 10 shipped
- **Announcer system — "The Store PA" (July 8)** — see [announcer.md](../reference/announcer.md): production-ready, data-driven announcer framework
- **Visual polish pass (July 8)** — see [audits/visual-audit.md](../archive/audits/visual-audit.md): targeted AAA-style rendering pass preserving the dark-arena + punchy-neon identity
- **Progression unlocks (July 9)** — lifetime gates for patterns, sunglasses, custom color, and levels (`unlockStore.js` / `unlockConfig.js`); dev unlock-all override for agents
- **Sundial Station flagship + arena elevation (July 9)** — Level 3 display name + presentation overhaul; Classic / Storerooms / Sundial polish
- **HUD redesign (July 9)** — center-stage events, design tokens, icon system, sticker scoreboard, touch HUD
- **Gameplay feel pass (July 9)** — juice, arena kill-zone scoring, match-point, haptics, remote FX parity
- **Boot/load + render perf (July 9–10)** — lazy game music, Draco-only cart models, half-res bloom, level prop LOD
- **Living Store (July 10)** — Living Cargo (cart = scoreboard) + PA directives (game-master mini-mutators); as-built [living-store.md](../reference/living-store.md)
- **Stability Pass 1 (July 10)** — seven root-cause fixes (`77d5a52`): Sudden Death fall-loop spectator guard (fake per-frame KO events could spam the feed/announcer and end SD early with a misattributed winner — solo and MP); spectator-flag re-derivation on host migration mid-SD; gameplay playlist fix (Howler never load()s a `preload:false` track — playlist died after track 1 and stayed dead all session) + track-index reset per match; `hideGameplayElements()` consolidated as the single gameplay-HUD hide (combo badge, boost meter, conn pill, feed — replaces `initMenu`'s inline block); customization partial-save no longer downgrades custom-hue to preset (the "sunglasses reset my color to magenta" bug); cart scale tween reset at shatter + canonical baseScale on respawn rebuild (carts permanently changing size); server re-checks all-ready when a *non-host* leaves/reaps (lobby stuck on READY!). 12 regression tests added (`customization`, `audioManager`, `gameFlowSuddenDeath`) — SD + music suites verified to fail against pre-fix code. Non-bugs documented, not changed: "random arena rotation" doesn't exist (feature, not bug); customize-tab "resize" is the deliberate 1.35× sunglasses camera zoom. Deferred follow-ups: ROADMAP Phase 4. **Re-confirmed healthy** in the July 10 regression audit (see entry above + [project-state §5](./project-state.md#5-known-issues)).

---

## Phase 4 Bug Fix Ledger

Compact record of Phase 4 fixes that were tracked as one-line items. Deeper writeups for each are in the dated log below where applicable.

| Item | Status |
|------|--------|
| Combo decay order-of-operations race fix | ✅ Fixed |
| Grocery spill pending queue (async load window) | ✅ Fixed |
| Server-authoritative level sync via MSG.round | ✅ Fixed |
| Slot kind nullish coalescing fix (human vs NPC label) | ✅ Fixed |
| Results UI cleanup (NEXT LEVEL removal, PLAY AGAIN rename) | ✅ Fixed |
| CargoBay visibility sync via hostTransform | ✅ Fixed |
| Non-host death shatter VFX wiring | ✅ Fixed |
| Booth snap at countdown (clean round reset) | ✅ Fixed |
| Mid-round join cart teleport (NPC→human) | ✅ Fixed |
| Rate limit exemption for high-freq messages | ✅ Fixed |
| Ram streak VFX on non-host clients | ✅ Fixed |
| hasSpilled state sync via hostTransform | ✅ Fixed |
| Remote boost instant VFX on non-host | ✅ Fixed |
| Kill feed color CSS hex conversion | ✅ Fixed |
| Shatter ref dual-path resolution (module + callback) | ✅ Fixed |
| Respawn visual cleanup (shatter debris + mesh rebuild) | ✅ Fixed |
| Respawn cleanup simplified to single cleanupShatter call | ✅ Fixed |
| Death shatter color hex parsing hardened | ✅ Fixed |
| Host respawn resets hasSpilled + cargoBay state | ✅ Fixed |
| cargoBay lookup by name (resilient getObjectByName) | ✅ Fixed |
| Scene bridge wiring (getSceneRef/getScene/getShatterRef) | ✅ Fixed |
| Shatter hex & 0xffffff bitmask clamping | ✅ Fixed |
| Netcode DRY refactor (applyCartState + serializeCartToWire) | ✅ Fixed |
| Pause/Esc overlay extracted to pauseOverlay.js | ✅ Fixed |
| @ts-expect-error cleanup (cartRaveGltf, cartThemes) | ✅ Fixed |
| Level select Zustand sync (menu + levelManager) | ✅ Fixed |
| Force-clear shatter state on respawn | ✅ Fixed |
| hud getter to avoid stale ref in context injection | ✅ Fixed |
| Null cart guard in updateRemoteCartNetTargets | ✅ Fixed |
| Boost state force-sync from wire (isRamBoosting/isBoosting) | ✅ Fixed |
| Slot 1 debug logging (send/receive state monitor) | ✅ Added |
| Self-contained shatter VFX lifecycle (isShatterAnimating + doRespawnRef) | ✅ Fixed |
| Audio controls extraction (audioControls.js, ~90 lines from main.js) | ✅ Fixed |
| Graphics toggles extraction (graphicsToggles.js, remove window globals) | ✅ Fixed |
| 100% typecheck compliance (0 errors under `npx tsc --noEmit`) | ✅ Verified |
| CSS extraction refactor (inline CSS → `src/ui/styles/`) | ✅ Fixed |
| WebRTC signaling: host initiates DataChannel offer (`ensureHostPeerConnections`) — restores P2P sync | ✅ Fixed |
| P2P signaling test coverage (`tests/p2p-signaling.test.js`) | ✅ Added |
| Signaling runtime validation (host→peer: DataChannel OPEN + 426 binary snapshots streamed) | ✅ Verified |

---

## Chronological Log

### July 10, 2026 – Living Store (Cargo + PA Directives) + Render LOD

As-built reference: [living-store.md](../reference/living-store.md). Deferred multiplayer checks: [living-store-test-plan.md](./living-store-test-plan.md).

**Living Cargo** (`03edc7c` + hardening)
- `src/cargoLoad.js` reconciles host-synced round scores → bay fill + handling (ticked from `frameVisuals`).
- Bay fills **2→12** groceries toward `CONFIG.cargo.fullScore` (8) so standings read off the field.
- Surviving a spill: ~2.6s **"empty cart is a fast cart"** comeback buff (`armSpillBoost`); `count` on `MSG.spill`; never stacks with nitro.
- Top-heavy grip slide at fullness; bigger mess on spill. CoM-raise taste-gated **off**. PA: `cart_overflow` / `spill_rush`. DEV: `window.__cartClashCargo()`.

**PA Directives — Store PA as game-master** (`b7ceeb2`, `70a737b`, `e2dea5c`)
- `src/directives/directives.js` data table + `directiveEngine.js` host scheduler (slots ~20s/55s/90s ± jitter, 18s windows, quiet last 30s, no SD, no back-to-back repeats, silent expiry).
- Five launch directives: **Flash Sale** (ram ×1.5), **Double Bag** (KO ×2), **Express Lane** (faster boost charge), **Spill Bonus** (+1 per forced grocery spill), **Rush Hour** (base drive speed/accel up, nitro keeps headroom).
- Net: one-shot `MSG.directive` + snapshot-tail self-heal `dir:{id,r}`; KO mul via `buildKOEvent` dep; CONFIG apply/restore on expiry / phase exit / SD.
- Presentation: critical + **focus** callouts (5.2s hold, suppress other non-critical PA); HUD `.hud-directive` chip under timer; regular callouts 25% smaller.
- Review harden: sudden_death focus collateral fixed; focus ends on interrupt; phase-exit restore without rAF; `reward.multiplier` = combo × directive; 13 engine tests.

**Follow-up shipped (July 10 solo polish):** Spill Bonus now has dedicated float/feed presentation via `onSpillBonusAward` (see session note above).

**Render / fill-rate**
- Half-res UnrealBloom RTs (`CONFIG.postFx.bloomHalfRes`, strength compensated).
- Distance-cull non-gameplay Storerooms/Sundial props via `src/utils/levelLod.js` (+ `tests/levelLod.test.js`).
- Stepped expensive Sundial seascape decor updates.
- Green-booth bloom overexposure tamed (luma-weighted emissive fix).

Session plans for related July 9 work live under [archive/session-notes/](../archive/session-notes/).

### July 9, 2026 – HUD Redesign + Art Direction + Motion Slap

Full session notes: [hud-redesign](../archive/session-notes/hud-redesign-2026-07-09.md), [hud-art-direction](../archive/session-notes/hud-art-direction-2026-07-09.md).

- **Design tokens** — `src/ui/styles/tokens.css` (import from JS only; CSS `@import` breaks under rolldown-vite path rules).
- **Center Stage** — `src/ui/centerStage.js` arbitrates stage-band moments (announcer > toast queue).
- **Icons** — `src/ui/icons.js` inline-SVG glyph set; emoji crowns/notes retired on HUD.
- **Regions** — match / standings / events / stage / pod / utility; dedicated `#hud.hud-touch` mobile layout.
- Sticker scoreboard chips, Bungee timer, expanded kill-feed verbs, personality icons (replacing letter badges), host antenna glyph, RECONNECTING pill via `netcode.getConnectionState()`.
- Art-direction polish + motion slap pass (countdown stamp, KO chip dizzy stars, nametags under HUD, UX fixes).

### July 9, 2026 – Gameplay Production-Value Pass (Feel / Pacing / Synergy)

Full session notes: [gameplay-production-value-pass](../archive/session-notes/gameplay-production-value-pass-2026-07-09.md).

- Victim-side hit feedback parity (host + non-host); water-death audio; GO! FOV kick; haptics (`src/haptics.js`).
- Remote boost/hop FX + hop wire producer; squash & stretch; music ducking under big PA / kill confirms.
- Score-breakdown float; leader crown + rampage pips; near-miss `close_call`; Match Point status; friends rematch auto-countdown.
- Presentation hit-stop (~80ms render-side only); arena KO flash re-enabled at reduced strength; Sudden Death ambient hue; Classic crowd cheers.
- **Arena kill-zone scoring:** Storerooms corner voids base 2; Sundial high-ground +1 when ram from podium.

### July 9, 2026 – Charge Glow, Match Stats, Auto-Quality

- 3D boost-charge telegraph on the cart; menu level preview LOD with full rebuild on play.
- `src/scoring/matchStats.js` + `matchStatsReactor` — per-match KO/death/combo spine and results superlatives.
- Session auto-quality watchdog (`src/utils/autoQuality.js` / `qualityMode.js`).

### July 9, 2026 – Sundial Station Flagship + Arena Elevation

Full session notes: [plan-zanzibar-overhaul](../archive/session-notes/plan-zanzibar-overhaul.md).

- Level 3 **display name** → **Sundial Station** (level id stays `zanzibar`; see [brand.md](../brand.md)).
- Flagship overhaul: cuboid deck stability, warm-amber center accents, alien skyline, gas-giant/moon, water death FX.
- Follow-up **arena elevation** pass across all three levels: Classic reflective vinyl + pit/sky/booths; Storerooms liminal floor storytelling + unique hole beats; Sundial golden-hour seascape/hologram polish.
- Classic stadium seating / grocery spill polish; Storerooms boot crash + VHS tuning restore.

### July 9, 2026 – Progression Unlocks, Patterns, Boot/Load, Fonts

- **Lifetime unlocks** — `src/stores/unlockStore.js` + `src/unlockConfig.js`: patterns, sunglasses, custom color, levels (e.g. Storerooms after Classic KOs, Sundial after Storerooms KOs). Tab mute when document hidden. Dev unlock-all default under Vite (`CartClashDevUnlocks` / `?devUnlocks=`).
- **Cart patterns** — pattern picker reinstated on cartrave4 body; **Bolt** 6th pattern (forking lightning). Guide: [cart-pattern-reuv.md](../guides/cart-pattern-reuv.md).
- **Boot/load** — lazy in-match music; Worker Cache-Control for hashed bundles/media; grocery pool warm across swaps; Draco-only cart models in `public/` (masters under `art/`); idle-warm Rapier + default arena on menu. Audit: [boot-load-assets-2026-07.md](../archive/audits/boot-load-assets-2026-07.md).
- **Fonts** — self-host latin UI fonts under `public/fonts/`; drop Google Fonts CDN. Refresh: `npm run fonts:fetch`.

### July 9, 2026 – Docs Hygiene + Open Flicker Plan

- Docs reorganized earlier (July 8); July 9–10: post-FX black-frame handover + flicker/Classic audit plan (both since resolved and archived: [plan-flicker-fix-and-classic-audit.md](../archive/session-notes/plan-flicker-fix-and-classic-audit.md), [handover-postfx-black-frames.md](../archive/session-notes/handover-postfx-black-frames.md)).
- Debt clean: recovery bak trees dropped; shipped session notes moved to [archive/session-notes/](../archive/session-notes/); knip back to zero new findings.

### July 8, 2026 – Visual Polish Pass (Three.js Rendering)

Targeted AAA-style rendering pass on the existing Cart Rave presentation — no gameplay changes, no arena redesign, full customization contract preserved. Full audit + round-by-round record in [docs/archive/audits/visual-audit.md](../archive/audits/visual-audit.md). Owner steered the pass through three feedback rounds; final look is deliberately dark with restrained bloom (dark arena + punchy neon is the identity, not a "bright arcade" brief).

**Global rendering**
- Exposure retuned 0.88 → 0.62 → 0.46 → **0.40** across three "still too bright" rounds; bloom strength 0.67 → **0.34**, threshold 0.86 → **0.76**, `smoothWidth` widened to 0.14 (also fixed a latent Rec.709-luma bug where magenta neon at luma 0.29 never crossed the old 0.86 cutoff while cyan at 0.79 did).
- Fog hexes retuned in the corrected pipeline (colors now display as authored — previously rendered darker via the missing sRGB encode).

**M-tier arena/effect work**
- **Kill-confirm layered feedback (M3)**: softened FOV punch (9°/180ms; ram hits stay 8°/100ms via a `Math.max` `armFovPunch` helper so overlaps never truncate) + center-weighted white flash via a **new `uFlash` uniform on the Arcade FX shader pass** + aberration/vignette pulse. All decays run on cheap uniform writes each frame.
- **Zanzibar directional blob-shadow bias (M4)**: `CONFIG.contactShadows.directionalBias.zanzibar = { x: 0.27, z: -0.22 }` offsets cart blobs away from the sun; overhead-lit arenas keep centered blobs; footprint sampling still uses the true cart position. Level identified via the existing octagon-hazards flag (no new level-tracking path).
- **Backrooms cart-contrast rim light (M5)**: one steel-blue (`0x7a8fc0`) `DirectionalLight` @ 0.2 raking near-grazing across the play space — carts and the furniture pile pick up a faint cool edge without lifting the carpet.
- **Classic pit + backdrop dressing (M6)**: pit-wall vertex-color gradient eased `t^2.6` on 24 height segments with a violet rim band + **5 additive depth rings** at decreasing brightness down the shaft; horizon-fog cylinder color now reads from `CONFIG.postFx.fog.color`; starfield gained distance-based brightness tiers; faint violet horizon glow band added.
- **Zanzibar horizon + islands (M7)**: sky-gradient bottom stops and sun-halo color realigned to the retuned `0xff5a22` fog hex. Islands rebuilt from three flat cutouts into **two-layer atmospheric-perspective silhouettes** (3 clusters, 2 layers each, 4 hand-picked tones) that now take scene fog and inherit the exact same ember haze the ocean fades into.

**Cart material system (R-tier, full customization contract preserved)**
- **R2 — pattern overlay → in-material shader mask (`src/cartPatterns.js`)**: replaced the coplanar `CartFramePattern` duplicate mesh (polygonOffset hack, doubled draw of the heaviest cart mesh) with an `onBeforeCompile` mask injection on the CartFrame's own `MeshPhysicalMaterial`. Uniforms: `uPatternMask`, `uPatternRepeat`, `uPatternStrength`, `uPatternTint`, `uPatternEmissive`. `material.customProgramCacheKey = "cartPattern:0|1"` — switching between two non-classic patterns swaps a texture uniform without a shader recompile; only classic↔patterned flips recompile. Injected chunks modulate (never replace) the standard color/emissive pipeline, so per-frame recolor / leader-glow / boost-pulse still work.
- **R3 — dedicated emissive wire mask (`src/cartRaveGltf.js`)**: body role no longer reuses its own albedo as `emissiveMap` — a grayscale wire mask is now generated once per source-texture uuid (`buildRaveGltfWireEmissiveMask`, cached in `_wireEmissiveMaskCache`) by threshold-ramping the albedo's channel-max brightness (smoothstep 0.45 → 0.7). Fallback to the previous albedo-reuse behavior on unsupported texture types.
- **Preservation guarantees held**: `frameMats`/`frameBodyMats`/`accentMats`/`frameGlowMats` cache arrays, every `userData` gate, and the `rebuildCartVisualsIntoRoot` shatter-rebuild path all still work.
- R1 (wheel decimation) and R4 (theme variety) declined by owner.

**Grocery cargo clipping fix (`src/effects/groceryPool.js`)**
- `createCargoBay` was placing items by center point only — bottoms sank through the basket floor and edge items poked through the sides. Each item now measures its bounding-sphere radius, insets the XZ spread from the walls, and sets its rest height off the floor.

**Verification**
- `npm run check` green (0 TS errors, 61/61 tests, 0 knip findings) after every stage.
- Verified in-browser on all three arenas via preview screenshots.

### July 8, 2026 – Announcer System ("The Store PA")

Production-ready announcer framework designed and built for the Steam demo push. Creative direction: a supermarket tannoy hijacked by the rave's MC — retail-flavored callouts (FIRST SPILL, REFUND, CLEAN-UP ON AISLE, BUY ONE GET ONE) instead of generic arena-shooter vocabulary. No AI voice clips or placeholder dialogue — polished procedural stings + visual callouts stand in until real recordings land, via a fully data-driven voice pipeline.

**Architecture** (`src/announcer/`):
- `announcerManager.js` — the single arbitration entry point (`announce(eventId, data)`). Owns every rule about whether/when an announcement plays: single channel with a 1.2s minimum gap; `sequence`-class events (countdown/GO) bypass the gap and are never queued; `critical`-class events (Sudden Death, victory/defeat) interrupt and flush the queue; other interrupts require priority ≥ active+20 on an interruptible event; a 2-slot priority queue with per-event TTL, dedupe, and eviction; `ambient`-class events (close_call) only play into silence; a 450ms kill-burst merge collapses pile-ups into one line; `comeback` swallows a simultaneous `new_leader`.
- `announcerEvents.js` — frozen data table (priority, cooldown, once/max-per-round, chance, callout config, voice-asset manifest) for 19 events.
- `announcerLines.js` — localization-ready subtitle lines with `{attacker}`/`{victim}`/`{leader}`/`{aisle}` token substitution.
- `announcerStings.js` — 15 procedural WebAudio stings in the existing `sfxSynth.js` `spawnTone` idiom.
- `announcerDirector.js` — pure game-state observer. Subscribes to `gameStore` for round-phase transitions and score changes; derives events by observing existing state, then calls `announce()`. Runs identically on host and non-host: kill events reach every client through the existing `falls[]` snapshot tail, so zero netcode changes were needed.
- `src/ui/announcerDisplay.js` + `src/ui/styles/announcer.css` — neon callout banner + `aria-live="polite"` region for screen reader access.

**Integration** — every hook is purely additive; no gameplay, scoring, or protocol changes:
- Host fall hook in `gameFlow.js`; non-host mirror in the `falls[]` replay path in `netcode.js`; both converge on `announcerDirectorOnFall`.
- `hud.js` countdown/GO/Sudden-Death/final-10s ticks now route through `announce()`.
- `main.js` wires init, presenter, local big-hit → close_call hook, and victory/defeat at the podium.
- Pause overlay gained an ◇ ANNOUNCER section (ANNOUNCER + CALLOUTS toggles, gamepad-navigable), persisted via `settingsStore`.
- `sfxSynth.js`'s victory fanfare / defeat sting / Sudden Death sting were retired in favor of announcer-owned equivalents.

**Voice pipeline** (documented in [docs/reference/announcer.md](../reference/announcer.md)) — drop `public/sounds/announcer/<locale>/<eventId>_<NN>.ogg|.mp3`, register with Howler, call `registerAnnouncerVoicePack`. Fallback chain: voice variant → sting → silent-with-subtitle.

**Validation** — `npm run check` green (0 TS errors, 61/61 tests including 29 new arbitration tests, 0 knip findings). Verified end-to-end in-browser against the live initialized singletons.

### July 7, 2026 – Production Value Pass (Top-10 Player-Experience Improvements)

Creative-direction review of every player-facing surface; full 100-item ranked report in [docs/archive/audits/production-value-pass-2026-07.md](../archive/audits/production-value-pass-2026-07.md). Constraint: no multiplayer-architecture or core-gameplay changes. The 10 highest-impact items shipped:

1. **Attacker kill-confirm feedback** — procedural confirm sting + center-screen hitmarker + FOV punch on every KO, via a new presentation-only `onLocalKillConfirm` callback fired from `gameFlow.js` (host) and the `falls[]` replay path in `netcode.js` (non-host).
2. **Victory presentation** — procedural victory fanfare (local winner) / defeat sting (everyone else) + winner-colored canvas confetti burst at the podium.
3. **Final-10-seconds urgency** — timer turns red and pulses with a per-second procedural tick (pitch rises in the last 3s); suppressed during Sudden Death.
4. **Sudden Death entry sting** — dissonant drone+stab cue on the rising edge, on all clients.
5. **Boost charge meter** — bottom-center HUD bar for keyboard/gamepad, driven by the locally simulated cart each frame.
6. **Damage-taken impact pulse** — vignette + chromatic-aberration kick on hard local hits via the arcade post-FX pass.
7. **First-run HOW TO PLAY overlay** — auto-opens once (storage-gated, skipped when joining via invite link), input-mode-aware controls copy.
8. **Brand cohesion** — rotate prompt no longer calls the game "Cart Rave".
9. **Mobile landscape fixes** — kill feed no longer collides with the audio panel; pause overlay AUDIO/CONTROLS sections now scroll instead of overlapping.
10. **Challenges feedback loop** — overlay copy no longer promises nonexistent XP; in-match "CHALLENGE COMPLETE" HUD toast + sparkle sting; "✓N" completed-count chip on the menu CHALLENGES button.

New module `src/sfxSynth.js` (procedural sting synthesizer). **Validation:** `npm run check` green, production build passes, full runtime loop verified in-browser.

### July 7, 2026 – WebRTC Signaling Root-Cause Fix (Multiplayer Restored)

**Root cause of "multiplayer broken after the WebRTC migration"** — Verified (runtime + tests).
- After the P2P migration, lobby/join/host-election (all WebSocket) kept working, but **no WebRTC DataChannel ever opened**: remote carts never moved, host authority was invisible, and non-host collisions never reached the host.
- **The bug:** `createOffer()` was statically unreachable. The only offer/DataChannel creator, `initiateP2PConnection()` (`src/netcode/p2p.js`), is host-gated (`if (!isHost) return`). But its only two call sites — the `MSG.hello` and `MSG.hostMigrated` handlers — are **non-host-guarded** (`youConnId !== hostId`, `!nextIsHost`), so a non-host calling it hits the host guard and returns immediately. The host had **no call site at all**.
- **Intended design (per docs): the host is the offerer** ("Host creates a DataChannel per non-host peer"); non-hosts answer via `ondatachannel`.

**The fix (`src/netcode.js`)** — smallest correct change.
- Added `ensureHostPeerConnections()`: host-only helper that iterates `netSlots` and calls `P2P.initiateP2PConnection(connId)` for every human peer whose `connId !== youConnId`. Idempotent.
- Invoked once, from the `MSG.slots` handler (after `netSlots = merged`). The server rebroadcasts `MSG.slots` on every join and after host departure, so this single call site covers both new-peer connection **and** the new host connecting to all survivors after migration.

**Validation** — Verified.
- **Runtime:** host created and sent `sdp_offer` → ICE `connected` → DataChannel open → host streamed **426 binary snapshots (248 bytes each, ≈40 Hz)** to the peer.
- **Tests (`tests/p2p-signaling.test.js`):** host reaches `createOffer` + emits `sdp_offer`; non-host answers with `sdp_answer` + wires `ondatachannel`; DataChannel open → binary `onmessage` → dispatch → `netStateBuffer`.

### July 7, 2026 – Production-Readiness Audit & Top-10 Fixes

Full-codebase audit; report with all 50 ranked improvements in [docs/archive/audits/production-readiness-audit-2026-07.md](../archive/audits/production-readiness-audit-2026-07.md). The 10 highest-impact, safe items were implemented:

1. **Safari/iOS audio fix (highest player impact)** — every sound loaded as `.ogg` only, so the game was **silent on all Safari/iOS devices**. `audioManager.js` `loadMenuMusic` / `setGamePlaylist` / `registerSfx` now accept `[ogg, mp3]` arrays. Generated `.mp3` fallbacks for the 10 referenced SFX (~385 KB). `index.html` menu preload now feature-detects Ogg support.
2. **Dead audio purged (~6 MB)** — removed `.wav` masters (Death.wav alone was 3.8 MB) and unreferenced `Wheel.*` trio.
3. **TypeScript baseline restored** — 2 `Element.blur` errors in `cart-rave-menu.js` fixed.
4. **PWA manifest fixed** — `site.webmanifest` had empty `name`/`short_name` and white theme colors; now "Cart Clash" with the dark neon palette.
5. **Social link previews** — invite links unfurled blank; added Open Graph + Twitter Card tags.
6. **Runtime error reporting** — `errorReporter.js` now installs global `error`/`unhandledrejection` handlers with per-message dedupe and a 20-report session cap.
7. **Centralized storage** — new `src/utils/storage.js` with a `STORAGE_KEYS` registry (all 14 `cartRave*` keys). `"cartRaveLevel"` had been independently redefined in three files.
8. **Dead exports removed** — all 10 knip-flagged unused exports across `audioManager.js`, `gameState.js`, `entities.js`, `input.js`.
9. **Shared device detection** — new `src/utils/device.js` (`isTouchLikeDevice`) removes the copy-pasted touch check that `settingsStore.js` duplicated from `utils.js`.
10. **Repo hygiene + tooling** — removed stale `vercel.json`, `dev-server.py`, `partykit*.json`, git-tracked `.tmp-gltf-imgs/`. Added `npm run check` (typecheck + test + knip).

**Validation** — `npm run check` green, production build succeeds, booted in-browser with zero console errors.

### July 6, 2026 – Dead Code Removal, Protocol Cleanup & Cross-Transport Safety

**1. Major Dead Code Removal (~250 lines)** — Verified.
- **Server validators** (`party/index.ts`, ~183 lines removed): Removed the dead `MSG.hostEventCollision` / `MSG.hostEventFall` relay handlers and their now-unused helpers. Collisions and falls now travel in the binary snapshot's JSON tail, authored by the host and replayed on non-host clients, never touching the server.
- **`reconcilePredictedLocalCart`** (`src/netcode.js`): Full removal. Reconciliation is now fully rewind-and-replay inline in `gameLoop.js`.
- **`inputSendTimer` / `startInputSendLoop` / `stopInputSendLoop`** (`src/netcode.js`): Non-host input is now sampled synchronously in the physics loop via `sampleLocalInputForTick()`.
- **`configureP2P` / `getPeerConnections` / `getDataChannels`** (`src/netcode/p2p.js`): Removed unused re-exports.

**2. Shared NPC Name Pool (`shared/npcNames.js` — new module)** — Verified.
- Extracted the 40-name NPC list from both `party/index.ts` and `src/npcNames.js` into `shared/npcNames.js`.

**3. Protocol MSG Reorganization (`shared/protocol.js`)** — Verified.
- Message constants reorganized into three labeled sections: Client→Server (WebSocket control plane), Host↔Client (WebRTC DataChannel gameplay plane), Server→Client (WebSocket control plane).
- `hostAssigned` and `state` removed entirely. `spill` is no longer a server→client relay — spills travel fully peer-to-peer.

**4. Cross-Transport Stale-Host Packet Guard (`src/netcode.js`, `src/netcode/p2p.js`)** — Verified.
- `handleP2PMessage` now accepts a `fromConnId` parameter and rejects snapshots where `fromConnId !== hostId`. WebRTC DataChannels are unordered/unreliable, while `MSG.hostMigrated` arrives on the ordered WebSocket — rejecting by source connId prevents this race from poisoning the freshly-cleared snapshot buffer.

**5. Slots Accepted Verbatim from Server** — Server owns slot colors. Clients now accept `MSG.slots` verbatim instead of calling `declashNpcSlotColors` locally.

**6. Binary Decoder Protocol Constant Fix (`src/netcode/binary.js`)** — Verified.
- `decodeHostStateSnapshot` was stamping the hardcoded string `"hostTransform"`, which does not equal `MSG.hostTransform` (`"host_transform"`). **Every binary snapshot was silently dropped** — the `netStateBuffer` never received a single frame from the binary path since it was introduced.

**7. Interpolation Helper Extraction** — Extracted `lerpVec3Pair` and `slerpQuatPair`, eliminating ~40 lines of duplicated lerp/slerp logic.

**8. `broadcastHostTransform` Binary Encoding** — Now uses `encodeHostStateSnapshot` instead of JSON.

**9. Non-Host JSON Dispatch Fix (`src/netcode/p2p.js`)** — Non-host `onmessage` was filtering JSON frames to `MSG.hostTransform` only, silently dropping `MSG.spill` events.

**10. Monotonic Clock Consistency** — Host migration freeze deadline now uses `getMonotonicNow()` instead of `Date.now()`.

**11. End-to-End Binary Dispatch Tests** — New test hook `dispatchP2P(data, fromConnId)` drives the exact runtime path.

### July 6, 2026 – Worker ASSETS Fallback & Rigid Body Double-Free Guards

**1. Worker ASSETS Fallback (`party/index.ts`)** — Verified.
- The Worker's `fetch` handler now falls through to `env.ASSETS.fetch(request)` for non-PartyKit URLs. This allows a single Cloudflare Worker to serve both Durable Object traffic and static assets.

**2. Rigid Body Double-Free Guards (`src/arena.js`, `src/levels/backroomsSupermarket.js`, `src/levels/testArena.js`, `src/levels/zanzibarPlatform.js`)** — Verified.
- All `world.removeRigidBody(body)` calls guarded with `world.getRigidBody(body.handle)` before removal. Prevents Rapier panics when `dispose()` is called on a world where bodies were already cleaned up.

### July 6, 2026 – NaN/Infinity Guards for Binary Serialization & applyCartState

**1. Binary Decode Safety (`src/netcode/binary.js`)** — Added `getSafeFloat32` helper. All 14 `view.getFloat32()` calls in `decodeHostStateSnapshot` now use it, preventing NaN/Infinity from corrupt binary data propagating into the physics engine.

**2. `applyCartState` Bounds Validation (`src/netcode.js`)** — All body writes and net-target writes now gate on `Number.isFinite()` for every float component. A corrupt snapshot leaves the Rapier body and interpolation targets completely untouched.

### July 6, 2026 – Binary Host State Serialization, Input Loop Refactor & Server Fixes

**1. Binary Host State Serialization (`src/netcode/binary.js` — new module)** — Verified.
- Introduced hybrid binary encoding for the `hostTransform` payload.
- Per-cart data packed into a fixed 52-byte layout: position, quaternion, linear velocity, ackSeq, and 1 byte of bit-packed flags (boost, hop, cargoBay, hasSpilled).
- 12-byte header. JSON tail appended for sparse data (collisions, falls).
- **Bandwidth reduction**: A typical 4-cart snapshot drops from ~600–800 bytes of JSON to ~220 bytes.

**2. Input Sampling Moved to Physics Loop** — Verified.
- `startInputSendLoop()` (setInterval-based, 60Hz) is now a no-op. Input capture moved to synchronous `sampleLocalInputForTick()`.
- Eliminates the ~50ms average latency of the old setInterval approach.

**3. Server Fixes (`party/index.ts`)** — Verified.
- **Reaper `lastSeen` default**: Changed `?? now` to `?? 0`. New connections whose timestamp write hadn't yet propagated were being instantly reaped.
- **Host migration message type**: `MSG.hostAssigned` → `MSG.hostMigrated`.
- **Spill relay removed**: `MSG.spill` handler deleted from server.

**4. Deterministic Physics Timestamps (`src/simulation.js`)** — `applyRammingImpulse` and `processCollisionEvents` now receive `nowMs` from the physics step's deterministic clock.

**5. P2P ArrayBuffer Routing (`src/netcode/p2p.js`)** — `setupDataChannel` `onmessage` now detects `ArrayBuffer` and routes to `onStateCallback` directly, bypassing JSON parse.

### July 6, 2026 – Empty Slot Cart Body Fix & Visual Sync Clock

**1. Empty Slot Cart Body Fix (`src/entities.js`, `src/main.js`)** — Now always creates a cart for all 4 slots. Empty slots get `mesh.visible = false` and `body.setEnabled(false)`.

**2. Scene Update Clock Synchronization (`src/main.js`)** — All `Effects.update*` calls, `sceneExtras.update`, `levelUpdate`, spindle light cycle, and booth neon cycle now use `syncedNow` — the server-clock-corrected time — keeping visual phases synchronized across all clients.

### July 6, 2026 – Client Prediction Rewrite & Monotonic Clock

**1. Client-Side Prediction Rewrite: Rewind & Replay (`src/gameLoop.js`, `src/netcode.js`, `src/simulation.js`)** — Verified.
- Replaced the old `reconcilePredictedLocalCart` (soft lerp correction) with a full rewind-and-replay prediction model.
- On each new authoritative snapshot: hard-snap local cart body to host state → replay all pending inputs through `runFixedPhysicsStep` with disabled side effects → cart ends at locally predicted position, eliminating the soft-correction pop.
- Pending input buffer (`pendingInputs[]`) introduced with `getPendingInputs()`, `prunePendingInputs(ackSeq)`, and `getLatestSnap()` exports.
- Host tracks `hostLastProcessedInputSeq` per connection and includes `ackSeq` in per-cart snapshots.

**2. Monotonic Clock Adoption (`party/index.ts`, `src/netcode.js`)** — Replaced `Date.now()` with `getMonotonicNow()` (`performance.timeOrigin + performance.now()`) in the server and all netcode timekeeping paths.

**3. Host Fall Event Batching (`src/gameFlow.js`, `src/netcode.js`)** — Fall events now queued via `queueHostFallEvent()` and drained in batch with the next `hostTransform` broadcast.

**4. WebRTC P2P Latency Improvements (`src/netcode/p2p.js`)** — DataChannel now created with `{ ordered: false, maxRetransmits: 0 }` for lowest-latency unordered delivery.

### July 5, 2026 – WebRTC P2P DataChannel Migration

**Major architectural change** that moves real-time game data off the server WebSocket relay and onto direct peer-to-peer WebRTC DataChannels. The PartyKit/partyserver server is now a lightweight signaling relay + lobby manager.

**1. New P2P Module (`src/netcode/p2p.js`)** — Manages RTCPeerConnection lifecycle, DataChannel setup, ICE/TURN negotiation, and SDP offer/answer exchange. Host creates a DataChannel per non-host peer. Input buffering: if DataChannel is not yet open, the latest input frame is queued and flushed on `onopen`.

**2. Server Reduced to Signaling Relay (`party/index.ts`)** — Removed hostTransform relay, clientInput relay, spill relay, and MSG.state broadcast — all now P2P. Server retains: lobby management, color picking, ready-up, round lifecycle, host migration, and connection reaping. **[Corrected July 6]** The `hostEventFall`/`hostEventCollision` kill-feed relays were later removed. Added Cloudflare Calls TURN credential minting.

**3. Protocol Expansion (`shared/protocol.js`)** — 5 new message types: `requestTurnCredentials`, `turnCredentials`, `sdpOffer`, `sdpAnswer`, `iceCandidate`.

**4. Netcode Rewiring (`src/netcode.js`)** — `MSG.hello` handler: inits P2P, requests TURN credentials. **[Corrected July 7]** The original design had the non-host call `initiateP2PConnection(hostId)` here, but that function is host-gated, so **no offer was ever created — the DataChannel never opened**. The host is the offerer: fixed July 7.

**5. Spill Netcode Switch (`src/main.js`)** — `triggerSpillNetcode()` now calls `Netcode.sendP2PEvent()` instead of `partySocket.send()`.

**6. Defensive Null Guards** — `if (scene) scene.remove(root)` guards, `if (world && recordBody)` guards on all `world.removeRigidBody` calls across all level files.

**7. Backrooms Physics Fix** — Changed floor colliders from `RAPIER.ColliderDesc.cuboid` → `RAPIER.ColliderDesc.roundCuboid` with 0.15 border radius. Prevents carts from catching on sharp 90-degree lips when hopping over the corner voids.

### July 5, 2026 – Web Fonts, Kill Feed Variety & UI Polish

**1. Web Font Fix (index.html)** — Bungee and Space Mono were referenced in CSS but not present in the Google Fonts `<link>`, causing fallback to system fonts (Comic Sans / Courier on Windows).

**2. Self-Death Verb Variety (hud.js, gameFlow.js, party/index.ts)** — `pickSelfDeathVerb()` added with 6 randomized verbs ("FELL OFF", "ATE PAVEMENT", "TAPPED OUT", "SELF-DESTRUCTED", "NOPED OUT", "RAGE QUIT"). Server `ALLOWED_FALL_VERBS` set updated to match.

**3. Results Overlay Responsive Sizing (resultsOverlay.js)** — Score name/value font-sizes now use `clamp()`. Match history section overflow: `hidden` → `auto`.

**4. TEST DRIVE Button Removal** — Removed unused TEST DRIVE button from menu markup, CSS, and JS click handler.

### July 5, 2026 – Mobile Responsive CSS Fixes

Diagnosed and fixed 7 mobile layout issues from phone screenshots.

**Portrait fixes:**
- **Results history box empty void**: `flex: 0 1 auto; max-height: 30vh` on `.results-history`, capping flex-grow expansion.
- **FPS counter z-index overlap**: FPS canvas `z-index` reduced from `99999` to `100`.
- **Level card text overflow**: Level card grid switches from 3 columns to 2 columns at ≤480px portrait.
- **Challenges panel top-edge clip**: Added `scroll-padding-top` and `scroll-margin-top`.
- **Level button padding & font**: Tighter padding and `clamp()`-based font-size.
- **Results history font-size/line-height**: `clamp(12px, 3.4vw, 14px)` font-size and `line-height: 1.55`.

### July 5, 2026 – Camera Framing & Menu Stats Extraction

**1. Camera Framing & Viewport Extraction (cameraFraming.js, main.js)** — Extracted `updateCameraFraming()` and `updateViewport()` from `main.js` into new `src/ui/cameraFraming.js` module. ~30 lines extracted.

**2. Menu Stats Extraction (menuStats.js, main.js)** — Extracted `refreshMenuStats()` from `main.js` into new `src/ui/menuStats.js` module. ~10 lines extracted.

### July 4, 2026 – Multiplayer Visual Sync & Mid-Round Join Polish

**1. CargoBay Visibility & Death Shatter Sync** — `hostTransform` payload extended with `c` (cargoBay visibility boolean). Non-host `triggerCartShatterRef` was initialized to `null` and never wired, so death shatter VFX silently failed on non-host clients — fixed. All 4 carts now snapped to spawn booths before round countdown.

**2. Mid-Round Join Cart Teleport** — When a human replaces an NPC mid-round, the host detects the transition and teleports the cart to its spawn booth. Rate limiter now exempts `MSG.clientInput` and `MSG.hostTransform`.

**3. Ram Streak, hasSpilled, Remote Boost & Kill Feed Sync** — Ram boost streak spawners now run on all clients. `hasSpilled` state added to `hostTransform` payload. Remote boost edge-detection now passes `{ instant: true }`. Kill feed colors properly converted to CSS hex strings.

**4. Respawn Visual Cleanup & Shatter Hex Parsing** — Non-host clients now detect the respawn edge and call `cleanupShatter()` + `rebuildCartVisualsIntoRoot()`. Death shatter color parsing hardened.

**5. Host Respawn State & Scene Bridge Wiring** — Host now resets `cart.hasSpilled = false` at respawn. `cargoBay` lookup hardened via `getObjectByName()`. `getTriggerCartShatterRef`, `getSceneRef`, `getScene` bridge functions added.

**6. Netcode DRY Refactor: applyCartState + serializeCartToWire** — Extracted shared functions, eliminating ~50 lines of duplicated logic. Net reduction: 54 fewer lines of code.

**7. Runtime Null Guards** — `hud` references changed to getter syntax. `updateRemoteCartNetTargets` added `if (!cart) continue` guard.

**8. Boost State Sync & Slot 1 Debug Logging** — `applyCartState` now writes `snap.b` to both `cart.isRamBoosting` and `cart.isBoosting`.

**9. SlotIndex Param + Stuck-Shatter Guard + Host Respawn Cleanup** — Threaded `slotIndex` explicit parameter. Split shatter guard. Host respawn force-clears shatter state.

**11. Self-Contained Shatter VFX Lifecycle** — Introduced `isShatterAnimating(cart, now)` in `cartShatter.js` — a pure animation-clock check that replaces the brittle network-synced flags as the single source of truth for whether the death VFX is still playing. `doRespawnRef` (wired from `main.js` → `netcode.js`) drives a single unified respawn path on ALL clients.

**12. Audio Controls & Graphics Toggles Extraction** — Extracted audio volume/mute state management (~90 lines) from `main.js` into `src/ui/audioControls.js`. Extracted live GFX toggle bridge (~20 lines) into `src/ui/graphicsToggles.js`. Replaced `window.__cartRave_*` globals with proper module imports.

**13. Pause/Esc Overlay Extraction & @ts-expect-error Cleanup** — Extracted ~550 lines of Esc overlay UI from `hud.js` into new `src/ui/pauseOverlay.js`. Removed remaining ~20 `@ts-expect-error` suppressions.

### July 4, 2026 – Runtime Bug Fixes: Combo Decay, Grocery Queue, Level Sync, Results Cleanup

**1. Combo Decay Order-of-Operations Race Fix (gameFlow.js)** — Combo decay was running inline during the per-cart loop, before higher-indexed victims' falls were scored on the same frame. Moved decay to a **dedicated second pass**.

**2. Grocery Spill Pending Queue (effects/groceryPool.js)** — `triggerSpill()` bailed out if `init()` hadn't finished loading GLTF models yet. Added a `pendingSpills` queue.

**3. Server-Authoritative Level Sync via MSG.round** — Server now broadcasts `levelId` in every `MSG.round`. Non-host clients update their `settingsStore`.

**4. Results UI Cleanup** — Removed "NEXT LEVEL" button. "REMATCH" renamed to "PLAY AGAIN".

**5. Slot Kind Fallback Fix (hud.js)** — Changed `slot?.kind || "npc"` to `slot?.kind ?? ""` (nullish coalescing).

### July 4, 2026 – Repository-Wide TypeScript Audit & 100% Type Resolution

**1. Direct Code Audit** — Cross-examined roadmap claims against live source. Identified discrepancy where docs claimed zero type errors, while `npx tsc --noEmit` produced ~90 type errors.

**2. 100% `npx tsc --noEmit` Compliance (0 Errors)** — Augmented global module declarations in `src/globals.d.ts`. Aligned JSDoc parameter and return types across 11 core source modules. Cleaned up obsolete `@ts-expect-error` directives. Validated: `npx tsc --noEmit` now completes with 0 errors, `npm test` passes 21/21, `npm run build` in 1.69s.

### July 4, 2026 – Phase 4 Live Smoke Test & Server Hardening

**1. Server Stability & Crash Prevention (Critical)** — Hardened `onMessage` handler against out-of-order packets. Wrapped all downstream message handling in top-level try/catch. Removed all 14 non-null assertions on `#slots` array. Silent reaper hardened.

**2. Server-Side Level Authority & State Sync** — Server maintains authoritative `#currentLevelId` and broadcasts via `MSG.hello`. `enterPlayMode` now immediately hides menu DOM.

**3. Non-Host VFX & HUD Synchronization** — Expanded `MSG.hostTransform` payload with `b` (boosting) and `h` (hopping) booleans. Kill feed combo metadata fixed. Cinematic camera release added. Grocery spill crash protection.

**4. Codebase Hygiene & Bundle Optimization** — Removed orphaned `customizationStore.js`. De-exported 12 unused internal functions. Zero type suppressions goal (**[Corrected]** — later a 90-error discrepancy was found and resolved).

### July 4, 2026 – Customization Polish & Netcode Math Hardening

**1. Customization System Performance & Cleanup** — Slider debouncing. Dead code removal. Scope discipline (reverted an over-engineered "Pattern Selection UI").

**2. Netcode Math Hardening & Test Coverage (Phase 4 Prep)** — Expanded `tests/netcode.test.js` with 5 new extreme edge-case tests (total 21/21 passing). Buffer flood simulation. Clock drift resync verification. Test seams exposed under `__netcodeTestHooks`.

### July 4, 2026 – Phase 3 Major Systems: Zanzibar, Netcode Hardening & Tooling

**1. Level 3: Zanzibar Platform (New Arena)** — Fully floating octagonal steel sundeck arena. Strict convex hull colliders only. Custom `aiHazards` model with octagonal bounds. Dynamic sunset seascape. Custom animated sunset loading screen. `contactShadows.js` enhanced.

**2. Netcode & Server Hardening (Phase 4 Prep)** — Yaw-only reconciliation solved "suspension pop". Server validation hardened in `hostEventFall`. Clock drift resync (3-sample median re-bootstrap every 30s). Nitro edge detection. Memory/state hygiene.

**3. Engine & Core Stability** — WebGL memory leak fixed (Reflector material). Physics debug geometry lazily allocated. Stricter type safety.

**4. Testing & Tooling Infrastructure** — Vitest Rapier stub. New test suite `tests/netcode.test.js` with 16 tests running headless via happy-dom. Gamepad listeners wrapped in `typeof window !== "undefined"` guards.

### July 3, 2026 – Phase 2 Closure, Typography Rebrand & Progression Foundations

**1. Typography Rebrand & UI Polish** — Fonts: "Road Rage" for mega-titles, "Russo One" for UI headers, "Goldman" for mono/body, "Michroma" for HUD clock, "Space Grotesk" for labels. Main menu title changed from "CART RAVE" to "CART CLASH". Color gating during "countdown" and "running" phases.

**2. Rampage Combo System** — Host-authoritative combo multiplier system. 3 escalating tiers (1.5x RAMPAGE, 2.0x SAVAGE, 3.0x CARNAGE) with a 5-second decay timer. Combo tier and multiplier synced via `MSG.hostEventFall`.

**3. End-Screen Polish & Personal Bests** — `CameraMode.CINEMATIC_PODIUM` (low-angle victory lap orbit). "REMATCH" button. "NEXT LEVEL" button (later removed). Personal bests tracked in `localStorage`.

**4. Daily/Weekly Challenges & NPC Badges** — Created `src/stores/challengeStore.js`. Tracks 10 distinct challenges with 24h/7d rotation. Main menu "Challenges" panel with reactive progress bars. NPC personality badges: [A] Aggressor, [L] Lurker, [S] Scavenger, [C] Chaotic. Added `declashNpcSlotColors()`.

### July 3, 2026 – Deep Audit Resolution, Zustand Architecture & UI/Input Overhaul

**1. Spilling VFX & Netcode Audit Resolution** — Five critical runtime bugs surgically resolved:
- Collision group semantics fixed with proper Rapier collision masks.
- Spill echo double-fire & cargo bay desync fixed via `without` parameter in `#broadcastJson`.
- Grocery visual/collider misalignment fixed via dynamic bounding-box.
- Fall-elimination VFX voiding fixed (y-clamp to 0.5).
- Texture VRAM leak fixed (explicit texture disposal).

**2. Zustand Store Migration & Type Safety** — Created `audioStore.js`, `customizationStore.js`, `gameStore.js`, `settingsStore.js`. Single source of truth. Tweakpane compatibility via mutable proxy. Type safety improved (221 → 208 errors).

**3. Boot Splash Visual Overhaul** — Rewrote initial boot splash animation with inline SVG carts. 4-phase master timeline. `prefers-reduced-motion` fallback.

**4. Animation System & UI Refactor** — Eager-loaded `animations.js`. `SPRING_BOUNCE`/`SPRING_SNAP` presets. `resultsOverlay.js` refactored to use `createTimeline()` sequencing.

**5. Input System: Multi-Mode Controls & Gamepad Polish** — Dynamic controls panel (3 layouts: Keyboard, Gamepad, Touch). Analog steering with smooth radial deadzone (0.15). Mapping fixes (Boost to LT/A, Hop to RT/B). Ghost input prevention.

**6. Quality & Lifecycle Robustness** — Concurrency guard mutex. FBO sync. Auto-detection (touch, prefers-reduced-motion).

**7. NPC AI Personality Profiles & Tactics** — 4 distinct AI behavior profiles mapped to all 43 NPC names. Score rubberbanding. Sudden Death bloodhound overrides. Backrooms square-hole safety gate.

**8. Backrooms Level Polish** — Memory leak fix (wrapper function delegation). Non-deterministic shelf layout replaced with deterministic hash.

### July 2, 2026 – Audit Sweep Resolution & Phase 2 VFX Launch

**1. Critical Audit Findings Resolved (Findings #1–#8)** — Verified.
- **Critical Netcode Transport (#1)**: Fixed the reversed `onMessage` parameter order in `party/index.ts`. All prior netcode fixes now reachable at runtime.
- **Error Forwarder Endpoint (#2)**: Added `/api/log-error` route.
- **Restored Rapier WASM Deferral (#3)**: Created `src/physics/rapierInstance.js` as a shared singleton that dynamically imports.
- **Live Graphics Toggles (#4)**: Post-FX and Low Quality buttons now apply instantly.
- **Podium Gamepad Navigation (#5)**: `isUiActive` check now includes podium phase.
- **Boot Splash Slow-Connection Guard (#6)**: Added `window.__cartRaveMainReady` flag.
- **TS Suppression Cleanup (#7)**: Removed misapplied suppressions.
- **VFX & UI Nits (#8)**: Dust particle first-frame scale snap fixed. `_resizeTo` in `cartPreview.js` fixed.

**2. Spilling Cart Contents VFX (Phase 2)** — Fully client-side, netcode-safe cosmetic physics system.
- Pre-allocates 64 Rapier rigidbodies across 6 `THREE.InstancedMesh` pools for 6 GLTF models.
- Primitive Rapier colliders (Cuboids, Cylinders, Ball).
- Server broadcasts single `MSG.spill` event.
- `cargoBay` group parented to cart mesh.
- Triggers: high-impulse ram (>50), continuous tip-overs, pit fall-eliminations.
- 10-second lifetime + 1.5s scale-fade.

### July 2, 2026 – Architectural Safety Nets & Perf Spike

**1. Shared MSG Protocol** — MSG constants extracted from `src/config.js` and `party/index.ts` into `shared/protocol.js`.

**2. TypeScript checkJs Baseline** — `tsconfig.json` with checkJs, `typecheck` script, `@types/three`, `globals.d.ts`. Baseline: exactly 210 errors. **[Corrected]:** The pass also added 118 `@ts-expect-error` suppressions, one of which silenced the compiler error exposing the `onMessage` parameter swap — fixed in the same day.

**3. Vitest Unit Testing** — `tests/gameState.test.js`, 3 passing tests on `pickTimerWinner`.

**4. Production Error Forwarder** — `src/utils/errorReporter.js` (sendBeacon + keepalive fetch). **[Corrected]:** Initially client-side only; `/api/log-error` route added later.

**5. Rapier WASM Standard Package Spike** — Swapped `@dimforge/rapier3d-compat` → `@dimforge/rapier3d` with `vite-plugin-wasm`. WASM now separate 1,570 kB file (587 kB gzip). Rapier JS chunk shrank 2,235 kB → 180 kB.

### July 2, 2026 – Phase 1 Medium Polish & Customization Audit

**1. Customization Code Audit & Preview Fixes** — Camera framing decoupled from `_resizeTo()`. Color-revert fixed. Mirror finish roughness 0.02 + envMapIntensity 1.5 across all six styles. Zoom now camera-distance based (÷1.35). 3x2 grid compaction.

**2. Wheel Audio Removal** — ~115 lines across audioManager.js, frameVisuals.js, main.js, postFxDebug.js. Zero dangling references.

**3. Main Menu Graphics Toggles** — Buttons persist correctly; resolved same-day to apply live.

**4. Mid-Round Customization Gating** — Phase guard in `openCustomizeScreen()`. `cartrave:round-started` dispatched from main.js and auto-closes overlay.

### July 2, 2026 – Audit Regressions & Sweep Fixes (7 findings)

All seven verified fixed:
- Gamepad main-menu navigation — `setGamepadNavActive` hooked into `initMenu()` / `commitMenuHiddenForGame()`.
- Boot splash minimum duration — DOMContentLoaded shed converted to 3,500 ms setTimeout.
- Round timer/countdown clock-drift fix — `adjustedNow()` applies `serverClockOffsetMs`.
- Camera ray GC churn — module-level cached `RAPIER.Ray`.
- Shared material disposal — `userData.isSharedMaterial` tags.
- Trash particle sizing/freeze — spawn-time `baseScale` preserved.
- Boost pulse scale ratchet — pulses read `mesh.userData.baseScale`.

### July 1, 2026 – Phase 1 High Priority Clearance, Physics Overhaul, UI Rebrand, Audit Resolution, Gamepad Support

**1. Physics & Collision Overhaul**
- Classic Record: 72-segment trimesh ring → 16 convexHull compound, exact edge-to-edge trapezoidal vertex math.
- Backrooms: 5,776-polygon grid trimesh → 9-cuboid slice compound with exact void mapping for the 4 corner holes.
- Visual alignment: visualOffset 0.82, visualRecordY −0.42.

**2. UI / UX & "Cart Clash" Rebrand** — HUD overlap fix. Boot splash cart-smash animation. 20-segment Neon Tube loading bar. Rotating level-specific messages.

**3. Audio State Management** — Mute persistence fixed (removed `_isMuted` block-gates in music playback).

**4. Gamepad / Steam Deck Support** — Driving inputs (stick + D-Pad, RT/A boost, LT/B hop) merged with keyboard/touch. gamepadNav roving tabindex. `setUiMode` gating. **[Corrected]:** initial implementation had inverted steering and no gameplay gate on nav — fixed in July 2 fix pass.

**5. Codebase Hygiene & Audit Resolution** — Two Knip passes (31 dead exports / 8 files). Audit sweep resolving 20 findings.

### June 30, 2026

**Infrastructure & Deployment** — Migrated PartyKit → raw partyserver on Cloudflare free tier. V2 live at cart-rave.wyabro.workers.dev. **[Corrected]:** the migration carried PartyKit's `onMessage(message, connection)` signature into partyserver, which dispatches `(connection, message)`. Inbound message handling was non-functional until fixed July 2.

**Match Pacing & Sudden Death** — 2.5-minute rounds; Sudden Death (first score wins on tie); multi-way tie support + spectator mode.

**Death & Respawn Polish** — Cinematic death camera with momentum carry; 1,000 ms respawn.

**Audio Tightening Pass** — Dynamic wheel audio (removed July 2); charge-up SFX scaling; countdown SFX; menu music autoplay race fix.

**Mobile Performance & Low Quality Mode** — Auto low-quality mode; WASM crash fix (no mid-match Rapier world destroy); dynamic physics substeps.

**Defer Rapier WASM Loading** — deferred `RAPIER.init()` to first play. Removed July 2 by the `@dimforge/rapier3d` swap; restored July 2 by dynamic import.

**Phase 2 work** — lobby/ready-up stabilization, non-host lifecycle edges, client prediction, caster/fork visual polish, lag mitigation.

**NPC AI Behavior Overhaul** — 80% hunting cycles, predictive ramming, improved nitro logic + suicide prevention.

**Physics & Collision Fixes** — CCD on RigidBodyDesc; spawn booth friction; deeper Classic Record void (−30); position-based stuck-cart respawn.

**Other Polish** — Charge Boost early release + burst power; FFmpeg loudness normalization; entity/state cleanup.

### June 29, 2026

**Engine & Performance** — WebGL memory leaks patched; GC micro-stutter eliminated (Rapier scratch cache); arcade feel improvements.

**V2 Architecture** — GLB cart compressed (Draco + WebP); themed carts removed; Sunglasses + Mirror Finish customization.

**Gameplay** — Auto-Charge Boost; Cinematic Countdown Camera; Cart Shatter + Explosion Death VFX.

**Bug Fixes** — NPC respawn suicide loop fixed.

---

## Core Multiplayer & Foundation (Pre-June 2026)

- Full modular refactor (`main.js` as thin orchestrator + `src/` modules)
- PartyKit server + client handshake + host migration
- Multiplayer sync for human carts (host-authoritative)
- NPC fill for empty slots + slot sync
- Username system + color picker
- Round structure + HUD (countdown / running / podium)
- Results screen + Play Again + exit portal
- Main menu shell + mode routing (Solo / Quickplay / Friends)
- Friend flow + personal stats
- Portal system (exit + return portals)
- Ready-Up system

### Visuals & Environment
- Procedural cart models with caster wheels
- Spawn booths redesign
- Ground plane, pit wall, crowd silhouettes, main stage
- Skybox (stars, nebula, UFOs, planets, horizon fog)
- Crowd lighting + searchlights + point lights
- Stage lasers, fog, ambient light, spindle light
- Record label, void wall gradient, leader glow
- Vibe Jam billboard + in-world exit portal
- Esc overlay + menu integration

### Physics & Gameplay Feel
- Physics tuning (restitution, angularDamping, maxPitchRoll)
- Version 1 driving core restored + tipping behavior
- Ramming system + boosted ramming
- Collision particles, screen shake, trash bursts
- Nitro boost system + visual/audio feedback
- Wheel screech, hop, fall-off, nitro SFX
- Real cart crash sound sample

### Polish & Quality of Life
- Touch controls (in-game) + rotate prompt for mobile
- Mobile detection (replaces old desktop-only blocking)
- Audio system (separate music/SFX volume, procedural SFX)
- Kill feed, score bar, HUD overhaul
- Stats tracking + match history
- Performance fixes (menu perf, refresh stutter, etc.)
- Bug fixes across many sessions (ghost carts, host migration, etc.)
- Console log cleanup + dead code removal
- `bootstrap.js` and `levelManager.js` extracted from `main.js` (June 2026)

### Recent Technical Improvements (June 2026)
- Major dead code + unused export cleanup (Knip)
- `bootstrap.js` extraction (menu → play flow)
- `levelManager.js` extraction (level preview + swapping)

---

## Dropped Items

- Crazy Carts mode (solo 8 NPCs)
- General pre-submission checklist
- **FRIENDS-REJOIN-1** (08-01) — “auto-rejoin friends room like quickplay” rejected. Wyatt
  chose keep **JOIN LOBBY** on refresh for private rooms (D-FRIENDS-REJOIN-1 in STATUS). Not
  a defect; do not re-open without a new product call.

---

### August 11, 2026 — HIT-SFX-VAR-1 CLOSED PASS: 3-variant cart crash SFX

- *(Audio · Medium)* **HIT-SFX-VAR-1** — ✅ **CLOSED PASS 08-11.** Wyatt provided two new
  hit SFX. Converted to Opus (`cart-crash-2.opus`, `cart-crash-3.opus`) and wired into
  the existing `playCartCrash()` pool: each call randomly picks from `["cartCrash",
  "cartCrash2", "cartCrash3"]`. Same rate/volume/intensity logic applies to all three.
  Pool: 4 per variant. Commit `1f3f090`. Wyatt PASS on production.

---

### August 11, 2026 — SKYBOX-DIR-1 CLOSED: kept + optimized

- *(Art · Medium)* **SKYBOX-DIR-1** — ✅ **CLOSED 08-11.** Wyatt decided to keep the space
  skybox. Direction call resolved. The neon void dome shader now renders after the arena
  (`renderOrder: -20` → `10`) so the arena depth buffer automatically culls dome fragments
  behind walls — ~95% fragment shader savings on the ground, full upper hemisphere during
  knock-ups preserved. Commit `a805d98`.

---

### August 11, 2026 — BLOOM-SIGNOFF-1 CLOSED: bloom look signed off

- *(Art · High)* **BLOOM-SIGNOFF-1** — ✅ **CLOSED 08-11.** Wyatt signed off on the
  bloom look for both Classic and Sundial arenas. No code changes; direction call only.
  Criteria from ART-FILTER-1 / ART-EXPO-1.

---

### August 11, 2026 — DEFEAT-READ-1 CLOSED: Defeat screen look signed off

- *(Art · Medium)* **DEFEAT-READ-1** — ✅ **CLOSED 08-11.** Wyatt signed off on the
  wilting-groceries Defeat screen look. No code changes; art-direction call only. The
  effects already fire (see closed PRE-PODIUM-1); this was look-only confirmation.

---

**Note on annotations:** Where a later audit contradicted a claim, the original entry stands with a **[Corrected]** annotation rather than being rewritten — the log should show what was believed at the time and what turned out to be true.
