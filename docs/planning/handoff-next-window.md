# Handoff — next agent window (P6 then RC-1 B — close Run 7)

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-DhaNywQc.js`** / sha **`8d904de`** (HUD-MENU-1 live + PASS)  
**Read order:** `npm run dashboard` → `.diag-captures/health.json` → this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)

**Ship only on Wyatt “ship it.”** Do not `git add -A`.  
**One card / one lever at a time.** Order: **P6 first**, then **RC-1 B**.

---

## Where we landed

| Card | Verdict |
|------|---------|
| P0–P4 · NH stack · charge SFX · color/pattern · NET-1 residual | ✅ |
| P5 · LS-1 · RC-1 A · RC-1 C · CAM-1 · HUD-MENU-1 | ✅ **PASS** |
| NH-HIT residual · NH-SMOOTH | 🧊 parked |
| **P6** AI diag empty mid-round | ▶️ **NEXT** (tooling) |
| **RC-1 B** host-reap #6 | ▶️ after P6 (closes RC MP validation) |

### Do not re-open without new evidence

P0–P4 · NH-STATS · NH-BOOST · HOST-ROLE-1 · NET-1 · P5 · LS-1 · RC-1 A · RC-1 C · CAM-1 · HUD-MENU-1 · charge SFX · color/pattern

---

## Active card 1: P6 — AI diag probe empty mid-round

**Mode:** tooling only (no gameplay feel change).  
**Symptom (cap-41 era / STATUS):** `?diag=1` F8 or `__ccDiag.snapshot("ai")` mid-round returns `{ count: 0, npcs: [] }` while NPCs are clearly alive.

### Code entry

`src/utils/gameplayDiagnostics.js` — `registerDiagProbe("ai")`:

```js
if (!c || !c.isNpc) continue;
// emits: slot, name, target, paused, reversing, contestingPodium, personality
```

### Likely causes to verify (code first)

1. `cart.isNpc` not set / cleared mid-round (probe key wrong).  
2. NPCs only on host; non-host F8 has carts without `isNpc` (then document: host-only probe).  
3. Field renames: `aiTarget` / `aiPersonality` / pause timers live elsewhere.  
4. `getCarts()` returns null holes or empty after rematch.

### Done when

- Mid-round solo (or host) F8: `snapshot.ai.count >= 1` with useful fields (target / personality / pause flags).  
- Non-host: either same data or explicit documented host-only limitation.  
- `npm run qa` green if code changes. Ship only on “ship it.”

### Repro

```text
1. ?diag=1 solo (or quickplay host) with NPCs
2. Mid-round F8 or console: __ccDiag.snapshot("ai")
3. FAIL if count=0 while bots move
```

---

## Active card 2: RC-1 B — Host-reap #6 (after P6)

**Mode:** validation-first (fix already in prod via RC stack `7dba78d` / later deploys).  
**Bug fixed in code:** `party/index.ts` — `#reapStalePendingPickers` left `#hostId` dangling; now repairs via `#ensureLiveHost` on early-return.

### Repro (~2 min + 30s wait)

1. **Browser A:** open friends/quickplay room, land on **color picker**, do **not** seat for ~35s (first joiner = host, unseated).  
2. **Browser B:** join, **pick color / seat**.  
3. After ~30s picker reap: B must still get physics (cart moves, room has a live host).  
4. **PASS:** B can play. **FAIL:** B frozen / no host until a third join.  
5. On FAIL: F8 both, `npm run captures:pull`, one lever in `party/index.ts` reap path.

Both tabs **visible**. Prod `index-DhaNywQc.js` / `8d904de` (or post-P6 deploy if you shipped P6).

---

## Mission close condition

Run 7 “done when” fully checks when:

- [x] everything already checked in STATUS  
- [ ] **P6** closed (tooling works)  
- [ ] **RC-1 B** PASS (or named N/A with evidence)

Then advance phase marker toward Release candidate (STATUS release strip) if Wyatt agrees.

---

## DO THIS NOW

1. **P6** — repro empty `ai` probe; fix probe (or document host-only); qa; ship only on “ship it.”  
2. **RC-1 B** — two-browser host-reap smoke; report pass/fail.  
3. Update STATUS + this handoff when each closes.

---

## Suggested next window paste (Wyatt → new Grok)

> Run `npm run dashboard` and read `.diag-captures/health.json`, then `docs/planning/handoff-next-window.md`, `docs/STATUS.md`, `AGENTS.md`.  
> Branch `cart-clash`. Prod **`index-DhaNywQc.js`** / sha **`8d904de`**.  
> **Closed:** P0–P4 · NH stack · NET-1 residual · P5 · LS-1 · RC-1 A/C · CAM-1 · **HUD-MENU-1 PASS**.  
> **Active (in order):** **P6** AI diag probe empty mid-round (tooling) → **RC-1 B** host-reap #6 live proof.  
> Close Run 7 mission. One card/lever. Ship only on “ship it.” Do not `git add -A`.

---

## Commands

```bash
npm run dashboard
npm run captures:pull
npm run qa
npm run ship   # only on "ship it"
```
