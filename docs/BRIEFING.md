# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (the pre-commit hook does this on every commit; `npm run qa` only *checks* freshness, read-only).
> Generated 2026-08-21 at commit `18744951` on `cart-clash`. If docs/STATUS.md's digested sections have changed since, `npm run briefing:check` (inside `npm run qa`) fails until this is regenerated.
> Source digest: `8862a5fa`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Assess and state the lane by blast radius: **Routine** proceeds after stated intent; **Standard** and **Critical** require Wyatt ack. Escalate before continuing if scope or risk grows. BRIEFING's ACTIVE CARD names the card, not the lane or permission to edit. (2) **Look up** the files you are touching in [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — `Select-String -Path docs/ARCHITECTURE.json -Pattern <filename> -Context 4,12`. Never read it whole; it is ~30,000 tokens. (3) During a game card, do not commit to `tools/` · `.claude/hooks/` · `.agents/` — file it to BACKLOG instead.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — External playtest is gated on BACKLOG Block 1. NET-LAG-1-PT-1 is parked by Wyatt (08-20). CART-POP-1 closed 08-21 — Wyatt PASS Storerooms F8 on prod `9051a0ce` (Worker `dfa5a26d`). Classic and Sundial already PASS. Do not retouch those floors. Do not reopen CART-POP-1 without new evidence. Tier A drained; Tier B/C, security sweep, and analytics gating are closed. Run 7 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 closed. Stay in this phase until Wyatt advances the marker.

## ACTIVE CARD

ONBOARD-JUMP-1 is the next code card in Block 1. NET-LAG-1-PT-1

Assess and state the lane before editing. This heading names the card; it is **not** a lane assessment or permission to edit.

Self-directed queue (one at a time, within the declared phase):
- **FRIENDS-ROTATE-1** Friends rematch rotates arenas, synced — queued
- **ONBOARD-JUMP-1** HOW TO PLAY matches jump+boost — queued
- **ONBOARD-WEBP-1** HOW TO PLAY WebP playback + fallback — deployed `51df06af` / Worker `819ad9ca`; 🅿️ ONBOARD-WEBP-PT-1 owed
- **QP-PLAYING-PT-1** QUICKPLAY live playing count — ⏳ playtest owed (prod after ship)

## Do not

- AGENTS.md applies in full and is not summarised here — agent states Routine / Standard / Critical before editing · Standard and Critical require ack · one card at a time · `tools/` · `.claude/hooks/` · `.agents/` frozen during a game card · ship only on "ship it" · never `git add -A` · the ▶ phase marker is Wyatt's. Read it before editing; this list carries only the project-specific prohibitions below.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH), nor anything under Verified healthy / non-issues in project-state.md §5, without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.
- No silent pure-black WebGL frames as an accepted "look". Solo polish before deep multiplayer features; prefer quality-preserving perf fixes and measure before/after.

## Gates

`npm run qa` = status:size → typecheck → test → knip → briefing:check → arch:check → health:check (the chain is defined by `check` in package.json — that is the only hand-written copy). All steps are read-only; regeneration happens in the pre-commit hook, `npm run dashboard`, or `npm run refresh`. Report results by number. CI also runs a production build. Never claim "done" without pushing and `npm run verify:head`.
