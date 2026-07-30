# CARGO-HUD-1 — opponent cargo readout (nameplate)

**Status:** ✅ **BUILT 07-30** (acked by Wyatt) — awaiting his playtest to close; not deployed.
Landed exactly as specced: `cargoTierFor()` in `cargoLoad.js`, chip built into
`nametagHtml()` (`main.js:112`) and passed from `updateNameLabels` (`:3695`), `em`-sized CSS
beside `.cart-nametag` in `hud.css`. 5 unit tests; qa 780/780.
**Verified:** all three tiers rendered from real spawn state at countdown (baselinePoints
8/3/0 → boss/stocked/stripped on all four plates); chip 17.8px → 10.6px as the plate steps
24px → 13px, fits at 1920/1366/390.
**Rig lesson:** assert at COUNTDOWN. Mid-round the NPCs have already rammed each other and
`stripLifeCargo` has fired, so a "stripped" plate there is true state, not a bug — the first
verification pass mis-read exactly that (spilled groceries were visible on the floor).
**Design decided (Wyatt 07-30, from the CARGO-HUD-1a mocks):** nameplate **placement**
(variant A) with the score-strip **chip treatment** (variant B's look).
**Research input:** [CARGO-HUD-1-handover.md](./CARGO-HUD-1-handover.md) — its blocking
question is now answered; this file supersedes it as the plan.
**Not** CARGO-VIS-1 (3D basket look, closed 07-30). Complementary, not duplicate.

## End-result framing

> Every cart wears a small chip on its nameplate showing how loaded it is: **empty**,
> **stocked**, or **boss**. You read it on the cart you are about to hit, in the moment you
> commit to the ram — not by looking away at the scoreboard.

Always on, all four carts (including your own), from countdown to podium. It changes only
when a cart crosses a state boundary, so it is static furniture during normal play and a
visible *event* on a strip or an overflow.

## Why this card exists

Living Cargo is the game's only decision that lasts longer than ~2 seconds, and its ceiling
is set by whether opponents can read where a cart sits in the cycle. The **stripped** half of
that tell is already good — an empty basket is unmistakable. The **baseline → boss** half is
not: 10 items vs 30, at distance, under bloom, on a moving cart.

The asymmetry is the argument (`src/config.js:245-263`, verified):

| State | Life pts | Bay items | Drive speed | **Incoming ram** | Mass |
|---|---|---|---|---|---|
| Stripped | 0 | 0 | 1.14× | **1.32×** | 0.85× |
| Baseline | 3 | 10 | 1.0× | **1.0×** | 1.0× |
| Boss | 8 | 30 | 0.76× | **0.52×** | 1.45× |

The harder-to-see half carries the **larger** swing — boss is a 48% reduction in incoming
ram vs stripped's 32% increase. That is the difference between a committed charged ram
launching someone and bouncing off.

## Design spec

**Four segments on the bay's own quarter-split, three colour bands.** Count carries "how far
along"; colour carries "is this one a tank". Both come from `cargoLoad.js`, and the count
shares its phase function with the 3D bay so the chip and the basket can never disagree.

| Life | Bay | Segments | Colour band |
|---|---|---|---|
| 0 | hidden | ▭▭▭▭ | `stripped` — `rgba(242,237,228,.30)` |
| 1–2 | 5 items | ▮▭▭▭ | `stocked` — `--color-cyan` |
| 3–4 (spawn = 3) | 10 items | ▮▮▭▭ | `stocked` |
| 5–7 | 20 items | ▮▮▮▭ | `stocked` |
| 8 | 30 items | ▮▮▮▮ + glow | `boss` — `#ff8a3d` |

> **Corrected 07-30 after Wyatt's review.** The first cut used three segments mapped to the
> three *physics anchors*, which collapsed life 1–7 — seven of eight points, three whole bay
> phases — into one identical 2-bar reading, and jumped the readout **two bars on the first
> kill off stripped**. The chip must step when the *bay* steps, not when the handling curve's
> anchors sit. `cargoFillLevelFor()` is now the single phase source that `lifeCargoVisibleCount()`
> also reads. A unit test asserts no single point of life may move the chip more than one
> segment — do not re-collapse the range.

**Amber is deliberate** — it is the existing rampage-pip colour (`hud.css:1377`), so this
introduces no new colour to the language. Boss adds a soft outer glow; nothing else does.

**The chip** (variant B's treatment, on variant A's placement): a slab plate holding three
discrete vertical bars — `--color-ink-deep` background, 1px `--border-white-12`, radius 4px,
`--slab-shadow-sm`, ~2px/4px padding, three bars at ~4×11px with a 2px gap. This is the same
recipe as `.hud-scorePip`, so it reads as native Fight Night furniture rather than a new
widget.

**Sizing must be `em`-relative, not px.** `.cart-nametag` already steps its font-size down
responsively (24px → 13px ≤768 → 11px ≤380, `hud.css:1226/1247`). A px chip would stay huge
on a phone. Express the chip and its bars in `em` so it rides the existing steps — and note
this is a **UI-SCALE-1 interaction**: when that migration lands, the chip should need no
special-casing.

## Implementation

Display-only. **No netcode work, no protocol change, no new sync** — `lifeCargoPoints` is
already replicated as `lc` on both wire paths (`netcode.js:1775` send, `:1267-1270` apply;
`netcode/binary.js:117-118/:248`), so every remote cart's value is already client-side.

1. **`src/cargoLoad.js`** — two pure functions beside `lifeCargoVisibleCount()`:
   `cargoFillLevelFor()` → `0–4` (**the shared phase source** — `lifeCargoVisibleCount` now
   derives its bay count from it, so chip and basket step together by construction) and
   `cargoTierFor()` → `"stripped" | "stocked" | "boss"` for the colour band. **The
   unit-testable seam.**
2. **`src/main.js:112` `nametagHtml(...)`** — take a `cargoTier` argument and emit
   `<span class="cart-nametag-cargo" data-cargo="…"><i></i><i></i><i></i></span>` after the
   name, before the crown. Building it into the returned HTML string is what makes step 3
   free.
3. **`src/main.js:3695`** (inside `updateNameLabels`) — pass `cargoTierFor(cart.lifeCargoPoints)`.
   **No new plumbing or scheduling:** `updateNameLabels()` already runs every frame and is
   diff-gated on the produced HTML (`_labelHtml !== contentHtml`, `:3699`) — the comment at
   `:3727` states running it per frame is cheap for exactly this reason. A tier change
   invalidates the cache and writes `innerHTML` **once per transition**; a steady state costs
   one string compare.
4. **`src/ui/styles/hud.css`** — chip styles next to the existing `.cart-nametag` block
   (~`:1175`), following `.hud-scorePip` (`:1368`) for plate/border/shadow.

Nothing else. No HUD element, no store, no analytics.

## Do not

- Do not add a continuous 0–1 bar, and do not collapse the segment count back to three —
  see the corrected spec above; a unit test guards the one-segment-per-step property.
- Do not put a second copy in the score strip. That was variant B and it lost; C (both) was
  the density check, not a proposal.
- Do not gate the chip on proximity/approach without a separate ack — always-on is what was
  approved from the mock.
- Do not touch netcode. If a change here seems to need a wire field, the plan is wrong.
- Do not reopen CARGO-VIS-1 (closed, `b13bafb`) or re-tune `fillPhases` — this card only
  *reads* cargo state.

## Verification

- **Unit:** `cargoTierFor` boundaries — 0 → stripped, 1 and `fullScore-1` → stocked,
  `fullScore` and above → boss, plus non-finite/negative input falling back safely.
- **Visual (agent):** reuse the CARGO-HUD-1a rig recipe — hardware-GPU headless
  (`--enable-gpu --ignore-gpu-blocklist --use-gl=angle`), enter play via the menu's
  `cartrave:menu` event (not `?room=solo`, which skips the warm branch and spawns procedural
  carts), then drive per-cart state and shoot all three tiers in one frame. Recipe detail:
  [archive/status-log-2026-07-30-cargo-vis-1.md](../archive/status-log-2026-07-30-cargo-vis-1.md).
- **Responsive:** confirm the chip at 1920, 1366 and 390 wide — it must shrink with the
  plate, not overflow it. (Full sweep belongs to UI-SCALE-1.)
- **Wyatt playtest closes the card** — the question is whether it actually changes ram
  decisions, which no screenshot can answer.
- `npm run qa` green.

## Open (answer at ack, or accept the default)

1. **Own cart too?** The mock showed all four and was approved as-is → **default: all four.**
   Opponents-only is a one-line filter if it reads as clutter in motion.
2. **Countdown visibility?** Default: yes, visible from countdown — it doubles as a teach
   moment while the personality intro is already on the plate.
