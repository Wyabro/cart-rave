# Cart Clash — Agent Briefing

> **GENERATED — do not hand-edit.** Regenerate: `npm run briefing` (the pre-commit hook does this on every commit; `npm run qa` only *checks* freshness, read-only).
> Generated 2026-08-04 at commit `91b39aa` on `cart-clash`. If docs/STATUS.md's digested sections have changed since, `npm run briefing:check` (inside `npm run qa`) fails until this is regenerated.
> Source digest: `38765ecb`

**Read order (every tool, cold start):** this file → [AGENTS.md](../AGENTS.md) (canonical rules + how work is executed) → [docs/STATUS.md](./STATUS.md) top sections → `npm run dashboard` for observed evidence (git/gates/captures) when you can run npm → deeper docs only as needed.

**Before you touch code:** (1) Plan → Wyatt ack → apply, acked **per wave** — one plan covering every lever plus its playtest checklist, one ack, then one commit per lever. BRIEFING's ACTIVE CARD names the card, not permission to edit. (2) **Look up** the files you are touching in [docs/ARCHITECTURE.json](./ARCHITECTURE.json) — `Select-String -Path docs/ARCHITECTURE.json -Pattern <filename> -Context 4,12`. Never read it whole; it is ~30,000 tokens. (3) During a game card, do not commit to `tools/` · `.claude/hooks/` · `.agents/` — file it to BACKLOG instead.

## Phase (declared — Wyatt moves the marker)

▶ Playtesting & stabilization — stabilize after Run 7; prove residuals; no auto-advance to RC

## Mission

Playtesting and stabilization — Tier A drained; Tier B/C, the security sweep and the analytics gating are closed. Run 7 closed; NET-2 / NET-MIG-3 passed live; NET-PRES-1 landed (loss-on-drop residual accepted). The analytics DO has been reset, so the ring starts clean for external testers. Stay in this phase until Wyatt advances the marker.

## ACTIVE CARD

HOST-TAB-1 — Hidden-tab host pump + AFK promote + strongest-host return
Pass looks like: ▶ ACTIVE — DEPLOYED 08-04 (lever E shipped `c3e4589`; still live in current deploy `91b39aa`, Worker `d47d4dd3`). Owed: Wyatt playtest — HOST-TAB-1 — retest §10, esp. second migrate same match.

Plan → Wyatt ack → apply. This heading names the card; it is **not** permission to edit.

## Waiting on Wyatt (not agent work)

- **HOST-TAB-1** Hidden-tab host pump + AFK promote + strongest-host return — ▶ ACTIVE — DEPLOYED 08-04 (lever E shipped `c3e4589`; still live in current deploy `91b39aa`, Worker…
- **FX-TIME-1** fxTimer never driven — VHS layer frozen — ✅ DEPLOYED 08-04 (`e87c795` in `91b39aa`, Worker `d47d4dd3`). `fxTimer.update(now)` runs in `onFrame` before…
- **SHADOW-ORDER-1** Storerooms booth contact shadows silently dropped — ✅ DEPLOYED 08-04 (`6560552` in `91b39aa`, Worker `d47d4dd3`). Booths at 31.15 m were built against the 26.4 m…

## Do not

- AGENTS.md applies in full and is not summarised here — plan → ack → apply per wave · one card at a time · `tools/` · `.claude/hooks/` · `.agents/` frozen during a game card · ship only on "ship it" · never `git add -A` · the ▶ phase marker is Wyatt's. Read it before editing; this list carries only the project-specific prohibitions below.
- Do not re-open closed evidence (Run 7 · NET-1 · NET-2 · NET-MIG-3 · NET-PRES-1 · NET-SD-1 · HUD-MENU-1 · CAM-1 · RC-1 A/B/C · P6 · parked NH-HIT / NH-SMOOTH), nor anything under Verified healthy / non-issues in project-state.md §5, without new evidence.
- Do not re-try the reverted host-countdown gate (`c8df8fd`) — the lever is pre-warming the room's arena programs before the countdown, not delaying the countdown.
- No silent pure-black WebGL frames as an accepted "look". Solo polish before deep multiplayer features; prefer quality-preserving perf fixes and measure before/after.

## Gates

`npm run qa` = status:size → typecheck → test → knip → briefing:check → arch:check → health:check (the chain is defined by `check` in package.json — that is the only hand-written copy). All steps are read-only; regeneration happens in the pre-commit hook, `npm run dashboard`, or `npm run refresh`. Report results by number. CI also runs a production build. Never claim "done" without pushing and `npm run verify:head`.
