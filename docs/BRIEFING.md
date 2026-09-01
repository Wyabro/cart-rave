# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (the pre-commit hook does this on every commit; `npm run qa` only *checks* freshness, read-only).
> Generated 2026-09-01 at commit `72191220` on `cart-clash`. If docs/STATUS.md's digested sections have changed since, `npm run briefing:check` (inside `npm run qa`) fails until this is regenerated.
> Source digest: `316ddb68`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Assess and state the lane by blast radius: **Routine** proceeds after stated intent; **Standard** and **Critical** require Wyatt ack. Escalate before continuing if scope or risk grows. BRIEFING's ACTIVE CARD names the card, not the lane or permission to edit. (2) **Look up** the files you are touching in [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — `Select-String -Path docs/ARCHITECTURE.json -Pattern <filename> -Context 4,12`. Never read it whole; it is ~30,000 tokens. (3) During a game card, do not commit to `tools/` · `.claude/hooks/` · `.agents/` — file it to BACKLOG instead.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — External playtest is gated on BACKLOG Block 1. SOFTGL-DISMISS-1 closed 09-01 — PLAY ANYWAY is one-shot per tab. SOFTGL-DISMISS-PT-1 PASS (local `?forcegpu=sw`; Wyatt authorized). RESTART-ROUND-1 lever landed — pause RESTART ROUND is not rematch; owed RESTART-ROUND-PT-1. Remaining High: PAUSE-SLIDER-DELAY-1, MENU-SHORTWIN-1, CG-ZIP-1, CG-COVERS-1. MENU-MUSIC-FIRST-PT-1 Wyatt PASS 09-01 on prod `d16fd523`. NET-LAG-1-PT-1 is parked (08-20). Do not retouch Classic / Sundial / Storerooms floors. Do not reopen CART-POP-1. Stay in this phase until Wyatt advances the marker.

## ACTIVE CARD

RESTART-ROUND-PT-1 (solo pause RESTART ROUND stays RD n). Then

Assess and state the lane before editing. This heading names the card; it is **not** a lane assessment or permission to edit.

Self-directed queue (one at a time, within the declared phase):
- **RESTART-ROUND-1** pause RESTART ROUND must not advance RD — lever landed; 🅿️ RESTART-ROUND-PT-1
- **PAUSE-SLIDER-DELAY-1** pause overlay empty ~1 s before sliders — High — Wyatt 09-01 prod `d16fd523`
- **MENU-SHORTWIN-1** menu readable at CrazyGames 1077×606 — High — pulled forward 09-01
- **CG-ZIP-1** CrazyGames Basic Launch zip of `dist/` — High — zip-only portal, ≤50 MB, no SDK
- **CG-COVERS-1** CrazyGames covers + silent hover videos — High — Wyatt art, required to upload
- **CLIENT-ID-AUTH-1** clientId claim hijack guard (session-token proof of ownership) — shipped `e5ca329b` Worker `c789f236`; Wyatt PASS CID-AUTH-PT-1 08-22

## Do not

- AGENTS.md applies in full and is not summarised here — agent states Routine / Standard / Critical before editing · Standard and Critical require ack · one card at a time · `tools/` · `.claude/hooks/` · `.agents/` frozen during a game card · ship only on "ship it" · never `git add -A` · the ▶ phase marker is Wyatt's. Read it before editing; this list carries only the project-specific prohibitions below.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH), nor anything under Verified healthy / non-issues in project-state.md §5, without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.
- No silent pure-black WebGL frames as an accepted "look". Solo polish before deep multiplayer features; prefer quality-preserving perf fixes and measure before/after.

## Gates

`npm run qa` = status:size → typecheck → test → knip → briefing:check → arch:check → health:check (the chain is defined by `check` in package.json — that is the only hand-written copy). All steps are read-only; regeneration happens in the pre-commit hook, `npm run dashboard`, or `npm run refresh`. Report results by number. CI also runs a production build. Never claim "done" without pushing and `npm run verify:head`.
