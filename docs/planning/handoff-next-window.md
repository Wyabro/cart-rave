# Handoff — next agent window (Run 7 continuation)

**Date:** 2026-07-19  
**Branch:** `cart-clash`  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Read order:** this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)  
**Do not** re-read the full playtest-triage stack unless a finding points there.

---

## One rule for this phase

**One change (or one validation card) at a time.** No 10-item fix dumps.  
Playtest console: [docs/playtest/console.html](../playtest/console.html).  
F8 both machines → `npm run captures:pull` on the repo PC → agent reads `.diag-captures/playtest/`.

---

## Where we are (truth)

| Item | State |
|------|--------|
| Match A (4090 **hosts**, Intel non-host) | Death spiral **fixed** (`f0c10ba` replay cap). Smoothness improved hard. |
| Hit delay ~1s both ways on Intel | Root-caused: cap dropped **oldest** inputs (wrong). **Shipped** `efdca62` — keep oldest, drop newest; steps 8→12. Bundle **`index-XByafoNI.js`**, Version `11e93226`. |
| Match B (Intel hosts) | **Not required** until Match A combat feels honest. |
| HOST-ROLE-1 | Real when weak hosts; not Match A failure mode. |
| NET-PERF-2 | **Done** run-4 (decode ring pool). Do not re-solve. |
| Capture upload | Live: F8 → `POST /api/captures`. Pull: `npm run captures:pull` needs `ERROR_LOG_TOKEN` in `.env.local` (gitignored; already set on Wyatt’s 4090). |
| Token | Rotated 2026-07-19 into `.env.local` + Worker secret. |

### Match A numbers (post-cap, pre hit-delay fix)

| | Host 4090 | Non-host Intel |
|--|--|--|
| over33 | ~0.1% | ~1.6–3% |
| snapHz | n/a (sender) | **~38–40** (was ~13 in spiral) |
| reconcileErrMaxM | — | 1.6 → 8.3 m (second capture) |
| teleports | — | 0 → 4 |
| pending age | — | ~80–130 ms |
| replay trims | — | heavy (cap engaged) |

---

## Next human action (only this)

1. Both PCs hard-refresh until bundle **`index-XByafoNI.js`**.
2. `?diag=1`. **4090 creates room** (host). Intel joins.
3. Play ~1–2 min; **deliberately ram and get rammed** a few times on Intel.
4. F8 both if still wrong (or once mid-round if good).
5. On 4090: `npm run captures:pull`
6. Paste console export / feel note into chat.

**Pass:** hits feel near-immediate on Intel (some host-auth RTT OK; full second is fail).  
**Fail:** still ~1s late → decode F8; next levers (one only): raise `reconcileReplayMaxSteps` further, or skip-replay-on-overload (snap only), not look polish.

---

## After combat retest passes

Strict queue (still one at a time):

1. Optional Match B (Intel hosts) — product note only if poison returns.  
2. P1 cards in console: host minimize, SD 45s, music bleed, kill-confirm, Esc directive, looks, storerooms loop.  
3. NET-1 full two-human smoke.

Parked: menu choppy on 4090 High (P0-2); taste debt (Pass 4/5); VPS talk (not indicated).

---

## Commands the agent should know

```bash
npm run qa
npm run ship                    # only on Wyatt "ship it"
npm run captures:pull           # .diag-captures/playtest/
npm run captures:pull -- --list
```

---

## Window hygiene (Wyatt + agent)

- **New Grok window** when the session is long / edge is dull — paste:  
  *“Read `docs/planning/handoff-next-window.md` then `docs/STATUS.md`. Continue Run 7 one item at a time.”*
- After each ship: one-line STATUS update + refresh this handoff if the **next action** changed.
- Agent: do **not** re-triage run-1…run-6 from scratch; code + this handoff win.
