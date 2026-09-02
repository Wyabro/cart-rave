# Status log — 2026-08-16 → 08-26

Moved out of [STATUS.md](../STATUS.md) on 2026-09-02 so the live Last-updated
block could stay under the token budget after the **MENU-SHORTWIN-1** ship
note. Live STATUS keeps 09-01 and 09-02 only.

2026-08-26 (**MENU-MUSIC-FIRST-1** ship) — prod `d16fd523` Worker
`b14cca2e-ca65-4f8a-ba9f-651440e58f61`. VERIFY_OK `index-Bq-KNGFd.js`
(attempt 1, 28 refs, 0×404). Live `audioManager-CqyA-p58.js` has
`!e._playLock&&!!e.playing()` and the `_playLock` kick path.

2026-08-21 (stack ship) — prod `e5ca329b` Worker
`c789f236-3738-4167-9aed-c228a9971547`. VERIFY_OK
`index--wS40sKE.js` (attempt 2, 28 refs, 0×404). Live netcode has
`cartRaveSessionToken` / `ringAliasFlushes` / `isFiniteVec3`. Worker
bundle has `session_token` / `Rate limit exceeded` / `isTurnCacheFresh`.
Covers TURN-CACHE-1 · ART-PALETTE-1 · SNAP-FINITE-1 · SEC-WS-PARSE-1 ·
CLIENT-ID-AUTH-1 · RING-ALIAS-1.

2026-08-21 (**SEC-GZIP-1** ship) — prod `1330a3b9` Worker
`92f699e7-ef0f-4699-ad0e-a6b98961f797`. VERIFY_OK
`index-BaluwR9J.js` (attempt 1, 28 refs, 0×404). Worker bundle has
`gunzip_too_large` / `GunzipCapError`. POST `/api/captures` aborts
gzip-base64 at `CAPTURE_STORE_MAX_CHARS`.

2026-08-23 (**ONBOARD-WEBP-1**) — Wyatt PASS **ONBOARD-WEBP-PT-1** on prod
`14658bf8` (Worker `e14acbd4`). VERIFY_OK `index-DiFdiFls.js`, live
`decoder-loop`. Parent closes. Do not reopen.

2026-08-23 (**ONBOARD-WEBP-1** wave 3) — PT still FAIL on prod `310a5f86`
(play once ~2.8s, then freeze). Query remount did not isolate the decoder.
Lever: canvas `ImageDecoder` loop in `howToArtPlayback.js`. Files are
loop=0 / 2.8s.

2026-08-22 (**ONBOARD-WEBP-1** ship) — prod `310a5f86` Worker
`503680cd-0e3e-46de-80e8-a4d74e90fc8c`. VERIFY_OK `index-Be8iEYJL.js`,
28 refs, 0×404; live entry contains `onboardLoop`. FAIL 08-21: clips
played once then froze; same-URL remounts could reuse the frozen decoder.

2026-08-21 (playtest PASSes) — **ONBOARD-JUMP-PT-1** ·
**QP-PLAYING-PT-1** · **FRIENDS-ROTATE-PT-1**. Parents
**ONBOARD-JUMP-1** and **FRIENDS-ROTATE-1** close.

2026-08-21 (**CART-POP-1**) — Wyatt PASS Storerooms F8 on prod
`9051a0ce` (Worker `dfa5a26d`). Parent closes. Do not reopen.

2026-08-20 (CART-POP-1 Storerooms floor) — one hole-cut trimesh with
`FIX_INTERNAL_EDGES`. Isolated Rapier: 9-cuboid r16@24 pops=1; trimesh
r16@24 pops=0, rest planted, four holes open.

2026-08-20 (CART-POP-1 Sundial ship) — prod `bb29c13b` Worker `3f3e5fbd`.
VERIFY_OK `index-DPVRIrNw.js`, live `zanzibarPlatform-NhN7tGeb.js` has
`FIX_INTERNAL_EDGES`. Wyatt PASS Sundial.

2026-08-20 (**ONBOARD-WEBP-1**) — HOW TO PLAY motion now mounts only on a
visible slide, verifies frame progress, and switches to its paired still if
motion is frozen or fails. Local browser fallback passed all five art slides.
Deployed commit `51df06af`, Worker `819ad9ca-ce02-46d0-aff4-c1523921e8cb`.
**ONBOARD-WEBP-PT-1** needs the brother's F8 machine.

2026-08-20 (**ONBOARD-JUMP-1**) — gamepad boost = RT/B, hop = A/LT.
Playtest **ONBOARD-JUMP-PT-1** seeded. **MENU-MUSIC-2C-PT-1** Wyatt PASS
prod `98f21261`. **NPC-SELFKO-3** closed (`7384dc27`). Parked
**NET-LAG-1-PT-1** `[2pc]`.

2026-08-19 (playtest blockers filed) — BACKLOG Block 1 reopened with 9
Highs. Start **NET-LAG-1**. Do not playtest until the block drains.

2026-08-19 (playtest PASSes) — **FEEDBACK-PT-1** · **SPILL-DOUBLE-VFX-PT-1**
· **BOOT-TBT-PT-1** · **MENU-ARROW-PT-1** · **PODIUM-DOUBLE-CREDIT-PT-1**.
Parents close. Deferred: **SHARD-PT-2**.

2026-08-17 (D-WORK-LANES-1) — replaced fast / full-wave handling with agent-assessed
Routine / Standard / Critical lanes. Routine needs no ack or full QA; Standard and Critical
retain acknowledgment, with verification matched to blast radius.

2026-08-16 (STATUS trim) — archived 08-16 PASS dump + closed Decision index to
[status-log-2026-08-16.md](./status-log-2026-08-16.md) and
[decision-log-2026-08-03-to-16.md](./decision-log-2026-08-03-to-16.md). Live PT:
**NPC-ABORT-BURST-PT-1** · **LAST-STANDING-DEAD-PT-1** · **COUNTDOWN-HOST-STAMP-PT-1** on
`npm run dev` until ship; **REMOTE-INPUT-STALE-PT-1** after ship.
