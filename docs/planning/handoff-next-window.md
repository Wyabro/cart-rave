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
| Match A smoothness (4090 hosts) | ✅ Death spiral fixed (`f0c10ba`). |
| Hit-delay order fix | ✅ `efdca62` keep-oldest / steps 12. **Partial** on Intel — better, not enough. |
| Match A combat retest (`efdca62` F8s cap-6/7) | ❌ **FAIL** — see decode below. |
| Combat hold | ✅ Live `4a9f7f8` / was `index-iKVEUst7.js` — hits better; phantom after respawn. |
| Phantom pending clear | ✅ **Live** `732e2d6` / **`index-t3FG6KVX.js`** / Version `eeeef76e`. |
| Host multi-s freezes | **Open** — Wyatt focused host whole time. `resume:true` = rAF gap >250ms, **not** alt-tab. Cap-9 clusters near KO/announcer. |
| Match B (Intel hosts) | **Not required** until Match A combat feels honest. |
| HOST-ROLE-1 | **Live in Match A F8s** — 4090 host had **10× multi-second `resume:true` longframes** (1–7s). That *is* the snap-gap source. Keep host window focused; later: host background pump. |
| NET-PERF-2 | **Done** run-4. Do not re-solve. |
| Capture upload | Live: F8 → `POST /api/captures`. Pull: `npm run captures:pull` (`ERROR_LOG_TOKEN` in `.env.local`). |

### Match A combat decode (`efdca62`, cap-6 Intel / cap-7 4090)

Feel (Wyatt): hit NPC → feedback then **changes**; killed by NPC → **don't see it**, death anim **where I was**.

| | Host 4090 | Non-host Intel |
|--|--|--|
| build | efdca62 | efdca62 |
| over33 | 6 / 15k (~0%) | 58 / 6k (~1%) |
| snapGapMax / over100 | n/a (sender) | **4746 ms** / 28 |
| reconcileErrMaxM | — | **28.6 m** |
| teleports / replay drops | — | 4 / 113 |
| host longframe resume:true | **10× (1–7s)** | 2 early only |

Root: host freezes starve snaps; non-host kept predicting a ghost world + death shatter used predicted pose. Oldest-input order was not the remaining bug.

---

## Next human action (only this)

1. Both PCs hard-refresh until **`index-t3FG6KVX.js`**.
2. `?diag=1`. **4090 creates room** (host). Focus still good practice; freezes are **not** blamed on unfocus anymore.
3. Intel: die + respawn several times; watch for ghost throttle after spawn.
4. F8 both → pull → paste feel.

**Pass:** no free-slide after respawn; hits still land.  
**Fail phantom:** decode pending/skips.  
**After pass (or in parallel note):** host multi-s freezes while focused — next one-item is hitch forensics (KO/announcer path), not focus nag.

---

## After combat retest passes

Strict queue (still one at a time):

1. Optional Match B (Intel hosts) — product note only if poison returns.  
2. P1 cards in console: host minimize, SD 45s, music bleed, kill-confirm, Esc directive, looks, storerooms loop.  
3. NET-1 full two-human smoke.

Parked: menu choppy on 4090 High (P0-2); taste debt (Pass 4/5); VPS talk (not indicated); host background sim pump (if focused retest still shows host freezes).

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
