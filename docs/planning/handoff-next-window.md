# Handoff — next agent window (RC-1 B — close Run 7)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-CzDt6R8Q.js`** / sha **`a42e42c`** (P6 live + local PASS)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.** Active: **RC-1 B** only.

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH stack · charge SFX · color/pattern · NET-1 residual | ✅ |
| P5 · LS-1 · RC-1 A · RC-1 C · CAM-1 · HUD-MENU-1 | ✅ **PASS** |
| **P6** AI diag empty mid-round | ✅ **PASS** + live `a42e42c` / `index-CzDt6R8Q.js` — `slots[i].kind === "npc"`; `count:3 hostSim:true` |
| NH-HIT residual · NH-SMOOTH | 🧊 parked |
| **RC-1 B** host-reap #6 | ▶️ **NEXT** (closes RC MP validation / Run 7) |

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-1 · P5 · LS-1 · RC-1 A · RC-1 C · CAM-1 · HUD-MENU-1 · **P6** · charge SFX · color/pattern

**UI note:** cart color/look is set on the **main-menu Customize** screen — not a pre-round color picker step for solo.

---

## Active card: RC-1 B — Host-reap #6

**Mode:** validation-first (fix already in prod via RC stack `7dba78d` / later deploys).  
**Bug fixed in code:** `party/index.ts` — `#reapStalePendingPickers` left `#hostId` dangling; now repairs via `#ensureLiveHost` on early-return.

### Repro (~2 min + 30s wait)

1. **Browser A:** open friends/quickplay room, land on **seating / join flow**, do **not** seat for ~35s (first joiner = host, unseated).  
2. **Browser B:** join, **seat**.  
3. After ~30s picker reap: B must still get physics (cart moves, room has a live host).  
4. **PASS:** B can play. **FAIL:** B frozen / no host until a third join.  
5. On FAIL: F8 both, `npm run captures:pull`, one lever in `party/index.ts` reap path.

Both tabs **visible**. Prod post-P6 deploy (hard-refresh).

---

## Mission close condition

Run 7 “done when” fully checks when:

- [x] everything already checked in STATUS  
- [x] **P6** closed  
- [ ] **RC-1 B** PASS (or named N/A with evidence)

Then advance phase marker toward Release candidate (STATUS release strip) if Wyatt agrees.

---

## DO THIS NOW

1. **RC-1 B** — two-browser host-reap smoke; report pass/fail.  
2. Update STATUS + this handoff when it closes.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-CzDt6R8Q.js`** / sha **`a42e42c`**.  
> **Closed:** P0–P4 · NH stack · NET-1 residual · P5 · LS-1 · RC-1 A/C · CAM-1 · HUD-MENU-1 · **P6 PASS**.  
> **Active:** **RC-1 B** host-reap #6 live proof — last Run 7 box.  
> One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
