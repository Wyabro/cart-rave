# Handoff — next agent window (Run 7 · **2e host hitch**)

**Date:** 2026-07-19 (combat pass → host hitch forensics)  
**Branch:** `cart-clash`  
**Origin HEAD:** expect `49c5f1a`+ (docs) / combat code **`1a2f242`**  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-Cw19iE04.js`** (Version `4b585641` — skip-replay gap-only)  
**Read order:** this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)  

**Do not** re-triage run-1…run-6 from scratch.  
**Do not** re-solve NET-PERF-2 (decode ring pool).  
**Do not** dump another prediction/reconcile knob pass unless new F8s prove combat reverse is back.

---

## One rule for this phase

**One change (or one validation / forensics card) at a time.** No multi-lever dumps.  
Playtest console: [docs/playtest/console.html](../playtest/console.html).  
F8 both machines → `npm run captures:pull` → read `.diag-captures/playtest/`.

---

## Where we are (truth)

| Item | State |
|------|--------|
| Match A smoothness (4090 hosts) | ✅ Death spiral fixed (`f0c10ba` replay cap). |
| Hit-delay order (oldest unacked) | ✅ `efdca62` |
| Combat hold + death pose | ✅ `4a9f7f8` |
| Phantom pending clear | ✅ `732e2d6` |
| TURN secrets on prod | ✅ `CF_ACCOUNT_ID` / `CF_CALLS_KEY_ID` / `CF_API_TOKEN` + `ERROR_LOG_TOKEN` (cap-10 was `snapCount:0` until secrets set). |
| Workers **Paid** + Logs | ✅ Paid; `observability` on (`601b8e8`). |
| Skip-replay only on long snap gap | ✅ **`1a2f242` / `index-Cw19iE04.js`** — not on oldest-N truncate. |
| Match A combat reverse | ✅ **Pass enough** — Wyatt feel better; cap-16 **skips=0**, localKos **2**, snapGapMax **181ms** (was 3665). |
| **Host hitch / invisible kills** | ▶️ **Next = 2e** |
| Match B (Intel hosts) | Locked until 2e honest enough. |
| NET-PERF-2 | Done run-4. Do not re-solve. |

### Combat F8 scoreboard (do not re-decode from scratch)

| Build | Cap | Intel errMax | teleports | drops / **skips** | localKos | snapGapMax | Host longframes | Feel |
|-------|-----|--------------|-----------|-------------------|----------|------------|-----------------|------|
| `efdca62` | 6/7 | **28.6 m** | 4 | 113 / — | 0 | large | **10× (1–7s)** | Hit reverse; death where predicted |
| `4a9f7f8` | 8/9 | **4.2 m** | 1 | 40 / **6** | 1 | large | **6× (0.5–8s)** | Better hits; phantom after respawn |
| `601b8e8` no TURN | 10 | — | — | — / — | 0 | — | — | **snapCount 0** — host invisible, NPCs frozen (WS ok) |
| `601b8e8` + TURN | 12/13 | **5.3 m** | 1 | 3 / **4** | 0 | **3665** | host 7.3s shader + mid 200–300ms | Reverse hard mid-fight |
| **`1a2f242`** | **16/17** | 7.4 (1 tele) | 1 | 12 / **0** | **2** | **181** | host post-GO **303/526ms**; over33=27 | **Combat better**; residual hitch feel; **invisible kills** |

**Cap-16 combat fix proof:** `reconcileReplaySkips: 0` (was 4). Truncate still drops newest under max steps but **replays** continuous oldest-N. Steady snapHz ~full.

**Invisible kill (Wyatt):** non-host scored KO (`localKos`) but **never saw the hit**. Expected under host silence ≥~150ms: prediction holds → host resolves ram on buffered inputs → fall/kill credit arrives on next snaps without a local impact beat. Forensics target is **host main-thread / send stall**, not another reconcile order tweak.

### Host hitch evidence (start here for 2e)

**Not** `document.hidden` / alt-tab. Wyatt keeps 4090 focused.

| Source | What |
|--------|------|
| Cap-9 (`4a9f7f8` host) | Clusters near countdown/GO and KO+announcer; multi-s `resume:true` |
| Cap-15 (`601b8e8` host) | **7300ms** shader at carts-ready; mid-round **211–303ms** near KO |
| Cap-17 (`1a2f242` host) | Shader fine (~200ms); post-GO **303 + 526ms** `resume:true`; then few longframe events but **over33:27 / over66:3** over ~2 min |
| Cap-16 non-host | **`snapGapsOver100: 52`** in ~94s (~**33/min**); max gap 181ms — trips `holdAfterSnapGapMs: 150` often |

**Probe map:** `perf:longframe` only logs `dt>100ms` (rate-limited 500ms). Sub-100ms host stalls still show as non-host `snapGapsOver100` + `over33` on host. `resume:true` = rAF gap >~250ms (`RESUME_GAP_S` in gameLoop).

**Player bar for 2e pass:** non-host should see the ram/shove that earned a KO (or a clear contact), not only PA/kill-feed after a hitch. Host 100–500ms stalls should drop in rate and severity on focused 4090.

---

## Next agent work (2e only)

1. Pull latest F8s if Wyatt played (`npm run captures:pull`). Decode **new** caps only; use scoreboard above for older builds.
2. **One forensics dig:** what blocks 4090 main thread / starves host send ~100–500ms+ (post-GO, near KO/PA, steady over33).  
   Candidates worth reading (do not fix all at once): announcer/audio decode, Rapier step cost, snapshot encode/send on interval, GC, postFX, kill-feed/UI, setInterval burst after hitch (`hostSendTick` coalesce).
3. Prefer **measure / instrument first** if the culprit is unclear (cheap diag: mark longframe with phase/KO/announcer context already partially exists — extend only if needed).
4. **One lever** after evidence. Ship only on Wyatt “ship it.”
5. Retest Match A: F8 both; compare host longframes + non-host `snapGapsOver100` + invisible-kill feel.

**Out of scope this window unless F8s regress:** prediction order, skip-replay policy, phantom pending, Match B, P1 cards, NET-1, menu choppy (P0-2).

---

## After 2e is honest enough

Strict queue (still one at a time):

1. Optional Match B (Intel hosts) — only if weak-host poison returns.  
2. P1 console cards: host minimize, SD 45s, music bleed, kill-confirm, Esc directive, looks, storerooms loop.  
3. NET-1 two-human full-round smoke.

Parked: menu choppy on 4090 High (P0-2); taste debt (Pass 4/5); VPS (not indicated). Background sim pump only if forensics prove tab-throttle, not main-thread block.

---

## Infra notes (agent)

- **Paid plan** required for this DO-heavy stack. Do not burn CaptureLog with useless list/pull loops.
- TURN secrets must stay set or P2P dies again (`snapCount:0`, timer still syncs via WS).
- Workers Logs ≠ F8 combat metrics. Dashboard for Worker/DO; F8 for `net.flow` / longframes.
- `tools/browser/` may be untracked local junk — do not commit unless asked.

---

## Commands

```bash
npm run qa
npm run ship                    # only on Wyatt "ship it"
npm run captures:pull           # .diag-captures/playtest/
npm run captures:pull -- --list
npx wrangler secret list        # expect CF_* + ERROR_LOG_TOKEN
npx wrangler tail cart-rave     # optional live Worker/DO exceptions
```

---

## Window paste (Wyatt → new Grok)

> Read `docs/planning/handoff-next-window.md` then `docs/STATUS.md` and `AGENTS.md`.  
> Continue Run 7 **2e host hitch forensics** only — one item at a time.  
> Do not re-triage run-1…6, do not re-solve NET-PERF-2, do not re-open combat skip-replay unless F8s show skips/reverse back.  
> Combat `1a2f242` / bundle `index-Cw19iE04.js` is pass-enough (cap-16 skips=0, localKos=2). Residual: host 100–500ms stalls → snap gaps → invisible kills on non-host.  
> Pull F8s if I played; dig host main-thread / send stalls on focused 4090.

---

## Agent hygiene

- After each ship: one-line STATUS update + refresh this handoff if **next action** changed.  
- Report gates by number (`npm run qa`).  
- Never claim verified without pull + (post-deploy) served-bundle marker check.  
- Behavior-changing ships need human playtest before “done.”
