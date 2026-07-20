# Handoff — next agent window (RC-1 behavior-change MP validation)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-BxIgTxPx.js`** / sha **`24f49da`**  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.**

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · charge SFX · color/pattern | ✅ |
| NET-1 core A+B · S1 rematch · S1 residual · residual leave/migrate/join-score | ✅ |
| P5 solo bot/rim death feel | ✅ **PASS** (no code) |
| **LS-1 Living Store two-browser smoke** | ✅ **PASS** (Wyatt 2026-07-20; caps 108–111 / `24f49da`) |
| NH-HIT residual · NH-SMOOTH | 🧊 parked |

### LS-1 notes (closed)

- Continuous non-host got all three schedule slots (spill_bonus → rush_hour → flash_sale) + active HUD chip (cap-108).
- Mid-round rejoin does **not** replay past directives (by design); snapshot catch-up only if window still active.
- Strong machine rejoin mid-round does **not** steal host until lobby/rematch — HOST-ROLE-1 is lobby-only (expected).

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-PERF-2 · ko_path · NH-HIT residual · charge SFX · color/pattern · NET-1 · P5 · **LS-1**

---

## Active card: RC-1 — behavior-changing MP validation

**Mode:** validation-first (code already in prod via older RC stack + READY-SET).  
**Prod:** `index-BxIgTxPx.js` / `24f49da`  
**Solo already accepted** for AI #1 / personality / RESTART (2026-07-19). This card is **MP-only** gaps.

### A — AI cautious-phase #1 (MP bot feel) ~5 min

1. Two browsers, quickplay, both visible, hard refresh to `index-BxIgTxPx.js`.  
2. Play ~60s of a round with 2 NPCs.  
3. **PASS if:** bots chase rim/edge humans after the first ~8s (not mid-disc huddle forever); aggressor badge bots actually press; host + non-host both see bots moving/KO’ing (host runs AI).  
4. **FAIL if:** bots look glued mid-arena the whole round, or never contest a rim camper.

### B — Host-reap #6 (HOST-REAP-1) ~2 min + 30s wait

1. Browser A opens room, **stays on color picker ~35s without seating** (first joiner = host, unseated).  
2. Browser B joins, **does** pick color / seat.  
3. After ~30s picker reap: room must **not** freeze forever.  
4. **PASS if:** B can play (physics moves) — host repaired to a live seated conn (or promote works).  
5. **FAIL if:** B seated but cart frozen / no host / no physics until a third person joins.

### C — READY-SET rematch ~3 min

1. Two humans finish a quickplay round → podium → play again.  
2. Optionally: one tab hard-refresh mid-lobby rematch.  
3. **PASS if:** countdown arms without a 30–60s stall; both re-ready cleanly.  
4. **FAIL if:** lobby stuck unready / silent until someone toggles READY by hand.

**One FAIL → one lever; no batch.** Order A → C → B is fine (B is the awkward repro).

### F8
If something breaks: F8 both host + non-host, confirm upload, `npm run captures:pull`.

---

## DO THIS NOW

1. Run RC-1 A (MP bots) then C (rematch); B if time.  
2. Report pass/fail per letter; code only if named fail.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-BxIgTxPx.js`** / sha **`24f49da`**.  
> **Closed:** P0–P4 · NH stack · charge SFX · color/pattern · NET-1 · P5 · **LS-1 PASS**.  
> **Active:** **RC-1** behavior-changing MP validation (AI cautious-phase · host-reap · READY-SET).  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
