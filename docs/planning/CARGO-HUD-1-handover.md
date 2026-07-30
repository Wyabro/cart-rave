# Handover: CARGO-HUD-1 — opponent cargo readout

**Date:** 2026-07-30
**Project:** Cart Clash
**Branch:** `cart-clash` (confirm with `git status`)
**Intended path:** `docs/planning/CARGO-HUD-1-handover.md`
**Priority:** **HIGH.** This is the ceiling on the game's only strategic layer (§1).
**Status:** **BLOCKED** on one design answer from Wyatt (§2). Do not write code before that.

> **Do NOT conflate this with CARGO-VIS-1.** That card is the *3D basket look* (fill layout,
> overflow pile at boss) and is Wyatt-led art gated behind CART-MODEL-1 — see
> [BACKLOG.md:57](../planning/BACKLOG.md). CARGO-HUD-1 is a **2D HUD readout**, needs no
> Blender work, and can ship independently. They are complementary, not duplicates.
>
> **Do NOT add a contested-objective pickup.** Proposed and withdrawn with evidence — §6.

---

## 1. Why this card exists

From a design evaluation of the `cart-clash` branch (2026-07-30). Summary of the finding:

The **Living Cargo boss cycle is Cart Clash's strategic layer** — a ~30–60s arc where a
player accumulates life cargo, becoming slower but far harder to launch and worth more on
spill, until someone strips them. It is the only system in the game that produces a decision
lasting longer than about two seconds.

Its ceiling is set entirely by **how well opponents can read where a cart is in that cycle.**
If you can't tell a boss from a baseline at a glance, the mechanic is functionally invisible
and every ram is a coin flip against unknown physics.

Right now the 3D bay mesh is the **only** tell in the entire game (§3).

## 2. BLOCKED — answer before implementing

Wyatt's rule: player-facing features need end-result framing first. **This card does not have
it yet.** Get an answer to this before touching code:

> **When this works, what does the player see, and when do they see it?**

Specifically unresolved:

- **Where** — per-cart nameplate/world-space tag, a row in the existing score strip, or a ring
  under each cart on the floor?
- **Resolution** — 3 discrete states (stripped / stocked / boss), or a continuous 0–1 bar?
  The physics is piecewise around baseline, so 3 states may be more truthful than a bar.
- **Whose** — all four carts, or opponents only?
- **Always-on, or surfaced on approach** (fade in when a cart is within ram range)?

A continuous bar on all four nameplates at all times is the obvious default and probably the
wrong one — Fight Night UI is already dense, and the whole game happens in a ~26m circle where
all four carts are usually on screen at once. Do not pick for him.

## 3. Verified plumbing — what already exists

Read directly from the tree at `56dfa61`. Everything needed is already in place.

| Piece | Location | Notes |
|---|---|---|
| Canonical state | `src/entities.js:448–450`, `518–520` | `lifeCargoPoints` (0–8 int) + `cargoFullness01` (0–1) |
| Points mutation | `src/cargoLoad.js:66–79` | clamped 0..`fullScore` |
| Visible count map | `src/cargoLoad.js:110` | `lifeCargoVisibleCount()` — stripped→0, baseline→`baseItems`, full→`maxItems` |
| Spill scaling | `src/cargoLoad.js:~133` | `spillCountForCart()` — boss drops a bigger mess |
| Bay mesh driver | `src/effects/groceryPool.js:694` | `setCargoFillCount()` |
| Physics consumers | `src/simulation.js:606`, `643`, `1076` | drive curve, grip, incoming-ram victim weight |
| **Wire replication** | `src/netcode.js:1775` (send), `1269–1270` (apply) | field `lc`, clamped 0–255 |

**The single most important line above is the last one.** Life cargo is *already* in the
snapshot and already reconciled on receive. **CARGO-HUD-1 is display-only — no netcode work,
no new sync, no protocol version bump.** Read `cart.lifeCargoPoints` / `cart.cargoFullness01`
off the local cart list and render.

Confirmed absent: `grep -c cargo src/hud.js` → **0**. No HUD element consumes cargo state today.

## 4. The readability gap, precisely

Wyatt's position — that Living Cargo is readable — is **correct for the stripped state and
should not be re-litigated.** Empty basket vs. full basket is binary and unmissable. That half
of the tell is good as shipped.

The gap is the **baseline → boss** half. From `src/config.js:245–263`:

| State | Life pts | Bay items | Drive speed | Drive accel | **Incoming ram** | Mass |
|---|---|---|---|---|---|---|
| Stripped | 0 | **0** | 1.14× | 1.50× | **1.32×** | 0.85× |
| Baseline (spawn) | 3 | **7** | 1.0× | 1.0× | **1.0×** | 1.0× |
| Boss | 8 | **18** | 0.76× | 0.65× | **0.52×** | 1.45× |

Two observations:

1. **The visual delta is 7 items vs. 18** — at distance, under bloom, mid-fight, on a moving
   cart. That is a much weaker signal than 0 vs. 7.
2. **The physics delta runs the other way.** Boss incoming-ram is a **48% reduction**; stripped
   is only a **32% increase**. So the *harder-to-see* half of the range carries the *larger*
   swing — it decides whether a committed charged ram launches someone or bounces off.

That asymmetry is the argument for the card. It does not depend on the 3D bay being bad.

## 5. Related — scoreboard vs. cargo divergence

Flagged for Wyatt's judgement, **not** a bug and **not** in scope here.

The HUD shows cumulative round score. Life cargo resets to `baselinePoints` on respawn. So a
player leading 12–3 who just died is **stripped** — the single easiest cart on the floor to
launch, at 1.32× incoming ram.

If players learn "hunt the leader" from the scoreboard, the scoreboard points them at a target
whose physics contradicts it. That is either excellent comeback design or a mislearned physics
model. It cannot be resolved from source — it needs playtest observation. Whichever it is, a
cargo readout makes it legible instead of invisible.

## 6. Ruled out — do not chase

**A contested objective / pickup that spawns at a known location.** Proposed in the evaluation,
then withdrawn. Evidence:

- `record.radius` = **26.4m** (Classic), **31.7m** (Sundial, +20% override) — `config.js:29–35`
- `driving.maxSpeed` = **23.5 m/s** — `config.js:201`
- Floor on a rim-to-rim crossing: **~2.2s** Classic, **~2.7s** Sundial. (Speed-cap arithmetic
  ignoring accel/collisions, so real crossings are longer — but the order of magnitude holds.)

**There is no such thing as being out of position in an arena that small.** A contested object
solves "there is nowhere worth being," which is not a problem this game has. Wyatt's position —
that tight arenas *are* the fun, and the goal is knocking opponents off edges — is correct, and
an away-from-the-pack objective actively fights it. Classic Record's center hole already serves
the objective-shaped role, as a hazard everyone must negotiate rather than a reward.

## 7. Adjacent cards from the same evaluation (not in scope — do not bundle)

- **Manual cargo dump** — a player-initiated strip, reusing `stripLifeCargo` + existing spill
  VFX, turning boss state into a lever rather than something that happens to you. Also gated on
  end-result framing, and on whether it feels good — a playtest answer, not a code answer.
- **Directive pre-announce** — PA telegraphs the next directive ~10s before `fireAtMs`, turning
  an uncontested window into a planning horizon. Uses the existing announcer + scheduler.
- **`DEFAULT_SOLO` → medium + a solo ladder.** `src/aiDifficulty.js:14` is `"easy"` today
  (Quickplay is already Medium per AI-DIFF-1). Near-zero cost; currently the default config
  hides AI work that already shipped.

## 8. NOT verified — read before trusting this doc

- **The game was not played.** Every claim here is from source and docs. All feel judgements
  are explicitly out of scope.
- **Not read:** `src/main.js`, `src/arena.js`, `src/hud.js` internals, the AI behaviour tree,
  `src/aiDifficulty.js` past line ~70.
- **Stale comment found in passing:** `config.js` describes `boostMinMultiplier` as "reserved
  for early-release," but early release **is** implemented — `src/simulation.js:521–549`,
  proportional burst with a 100ms silent-cancel window. Fix the comment when nearby.
- Section §5's scoreboard question needs playtest data (F8 captures / `analytics:pull`), not
  another source read.
