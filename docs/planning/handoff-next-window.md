# Handoff — next agent window (Run 7 · NH-STATS)

**Date:** 2026-07-20  
**Ship in prod:** **`60d773e`** / **`index-BQhnh1Z_.js`**  
**Active card:** **NH-STATS** — non-host “my stats” broken in MP  
**Do not** re-open P0–P4 / NET-PERF-2 / ko_path without new evidence.  
**Ship only on Wyatt “ship it.”** One card at a time.

---

## Closed: P0–P4

| P0 countdown | P1 gap storm | P2 localKos:0 | P3 join hitch | P4 rematch |
|--------------|--------------|---------------|---------------|------------|
| F8 64–67 ✅ | F8 68–71 ✅ | kills work ✅ | Wyatt N ✅ | F8 72–74 ✅ |

---

## Active: NH-STATS

**Symptom (Wyatt):** my stats broken in multiplayer (non-host). Kills can land; this is not P2.

### Surfaces (confirm which)

| UI | Source | Path |
|----|--------|------|
| **YOUR STATS** WINS / PLAYED / POINTS / SOLO | lifetime localStorage | `recordPodiumStats` → `getPersonalStats` · results + menu |
| **Superlative chips** “N KOS THIS ROUND” / combo / crit | this-round `matchStats` | `matchSuperlatives` under results |
| **Match score rows** | round scores | host `endRound` / wire scores |

### Code facts (verified)

1. **Superlatives mix room-wide combo/crit/leader** into a local-looking panel: `recordKoForMatchStats` bumps `maxComboTier` / `criticalKos` / `leaderDowns` for **any** kill, not only `attacker === localSlot`. So a non-host with 0 personal KOs can still see “RAMPAGE” / “CRITICAL HITS” from bots/host.
2. **Non-host match counters can lag host** — cap **54 host** vs **55 non-host** podium: match kos 9 vs 7, deaths 49 vs 32 (missed falls[] / dispatch). Affects localKos/localDeaths chips.
3. **Lifetime write path:** host `endRound` → `recordPodiumStats`; non-host only on `MSG.round` running→podium when `r.validated === true`. Footgun: `if (r.validated !== true) return` **exits the whole MSG.round handler** (`netcode.js` ~2430) — should only skip stats write, not abort phase apply.

### DO THIS NOW

1. Wyatt: one line — which is wrong: **lifetime numbers** · **superlative chips** · **both** · **other**?  
2. Prefer one lever first: **local-only superlatives** (combo/crit/leader only if attacker === local) — small, tests in `matchStats.test.js`.  
3. Second lever if needed: fix `validated` early-return; third: fall-delivery completeness (bigger, NET-PRES).

---

## Paste

> Prod `60d773e`. P0–P4 closed. **Active: NH-STATS** my stats broken MP. Ship only on “ship it.”
