# Handoff — next agent window (Run 7 continuation)

**Date:** 2026-07-19 (end of combat + infra session)  
**Branch:** `cart-clash`  
**Origin HEAD:** `601b8e8` (observability config) · combat code at `732e2d6`  
**Prod:** https://cart-rave.wyabro.workers.dev  
**Live client bundle:** **`index-C560wli8.js`** (Version `9dc41a2f` — same combat code as phantom ship, plus Workers Logs on)  
**Read order:** this file → [STATUS.md](../STATUS.md) → [AGENTS.md](../../AGENTS.md)  
**Do not** re-triage run-1…run-6 from scratch. Do not re-solve NET-PERF-2 (decode ring pool).

---

## One rule for this phase

**One change (or one validation card) at a time.** No 10-item fix dumps.  
Playtest console: [docs/playtest/console.html](../playtest/console.html).  
F8 both machines → `npm run captures:pull` on the repo PC → agent reads `.diag-captures/playtest/`.

---

## Where we are (truth)

| Item | State |
|------|--------|
| Match A smoothness (4090 hosts) | ✅ Death spiral fixed (`f0c10ba` replay cap). |
| Hit-delay order (keep oldest unacked) | ✅ `efdca62` / was `index-XByafoNI.js`. Partial feel win only. |
| Combat hold (silence hold + skip-replay + death pose) | ✅ `4a9f7f8` — hits better (errMax 28→**4.2 m**); phantom after respawn. |
| Phantom pending clear | ✅ `732e2d6` live (no sample during hold; clear pending on death/skip; force doRespawn if s:false+hasSpilled). Soft feel: **maybe better**, hits still register — **no post-phantom F8s** (infra wall mid-session). |
| Host multi-s freezes while **focused** | ❌ **Open** — not alt-tab. `resume:true` = rAF gap >250 ms. Cap-9 clusters near KO/announcer. Next **code** lever after combat retest numbers. |
| Workers **Paid** plan | ✅ Wyatt upgraded mid-session. DO free-tier wall is gone. |
| DO free-tier wall (historical) | Hit **5M SQL row reads/day** — CaptureLog + CartRaveServer:quickplay threw `Exceeded allowed rows read in Durable Objects free tier`. F8 pull was 500; rooms flaky. **Paid unblocked** — `captures:pull --list` works again (count=9, last builds still `4a9f7f8` until new F8s). |
| Workers Logs | ✅ `wrangler.jsonc` `observability.enabled: true`, sample 1.0, invocation logs on (`601b8e8`). Dashboard → cart-rave → Observability. |
| Match B (Intel hosts) | Locked until Match A combat is honest. |
| NET-PERF-2 | Done run-4. Do not re-solve. |
| Capture upload | F8 → `POST /api/captures`. Pull: `npm run captures:pull` (`.env.local` `ERROR_LOG_TOKEN`). |

### Combat F8 scoreboard (do not re-decode from scratch)

| Build | Intel errMax | teleports | drops / skips | localKos | Host resume freezes | Feel |
|-------|--------------|-----------|---------------|----------|---------------------|------|
| `efdca62` hit-delay (cap-6/7) | **28.6 m** | 4 | 113 / — | 0 | **10× (1–7s)** | Hit then reverse; death where predicted |
| `4a9f7f8` combat-hold (cap-8/9) | **4.2 m** | 1 | 40 / **6** | **1** | **6× (0.5–8s)** | Hits better; **phantom after respawn** |
| `732e2d6` phantom clear | — | — | — | — | — | Soft: maybe better; **no F8** (quota wall) |

**Phantom root (fixed in `732e2d6`):** hold still sampled axes into `pendingInputs`; skip-replay left that stream; next healthy snap replayed silence-era throttle → free-slide after respawn/stall.

**Host freezes (still open):** Wyatt kept 4090 focused entire fights. Probe is **not** `document.hidden`. Cap-9 longframes near countdown/GO and KO+announcer bursts — forensics target is **host main-thread hitch**, not focus nag / VPS.

---

## Next human action (only this)

1. Both PCs hard-refresh until bundle **`index-C560wli8.js`** (or newer if you ship again).
2. `?diag=1`. **4090 creates room** (host). Intel joins. Match A.
3. ~1–2 min: ram both ways + **die/respawn a few times** on Intel (phantom check).
4. F8 **both** machines mid/end of round.
5. On 4090: `npm run captures:pull` → paste feel into chat.

**Pass combat/phantom:** hits land without big reverse; no free-slide after respawn; death near real impact (RTT lag OK).  
**Fail:** decode newest F8s only (`build` sha ≥ `732e2d6`); one lever next.

After pass (or if combat OK but freezes still dominate feel): **one item = host hitch forensics** (what blocks 5–8 s near KO/PA on 4090) — not another prediction knob dump.

---

## After Match A combat is honest

Strict queue (still one at a time):

1. Optional Match B (Intel hosts) — only if weak-host poison returns.  
2. P1 console cards: host minimize, SD 45s, music bleed, kill-confirm, Esc directive, looks, storerooms loop.  
3. NET-1 two-human full-round smoke.

Parked: menu choppy on 4090 High (P0-2); taste debt (Pass 4/5); VPS talk (not indicated). Host background sim pump only if forensics say tab-throttle, not main-thread block.

---

## Infra notes (agent)

- **Paid plan** is required for this DO-heavy stack (AnalyticsLog 20k ring + ErrorLog + CaptureLog + room SQLite). Free tier daily cliff is real — do not burn reads with useless list/pull loops.
- Workers Logs ≠ F8 combat metrics. Use dashboard for Worker/DO exceptions; F8 for `net.flow` / pending / freezes.
- Cloudflare Calls / TURN may still log missing credentials if secrets unset — separate from Paid.
- `tools/browser/` may be untracked local junk — do not commit unless asked.

---

## Commands

```bash
npm run qa
npm run ship                    # only on Wyatt "ship it"
npm run captures:pull           # .diag-captures/playtest/
npm run captures:pull -- --list
npx wrangler tail cart-rave     # live Worker/DO exceptions (or use dashboard Observability)
```

---

## Window paste (Wyatt → new Grok)

> Read `docs/planning/handoff-next-window.md` then `docs/STATUS.md` and `AGENTS.md`.  
> Continue Run 7 one item at a time. Do not re-triage run-1..6 from scratch.  
> Pull F8s if I played; next gate is Match A combat/phantom retest on `index-C560wli8.js` (or current bundle).

---

## Agent hygiene

- After each ship: one-line STATUS update + refresh this handoff if **next action** changed.  
- Report gates by number (`npm run qa`).  
- Never claim verified without pull + (post-deploy) served-bundle marker check.  
- Behavior-changing ships need human playtest before “done.”
