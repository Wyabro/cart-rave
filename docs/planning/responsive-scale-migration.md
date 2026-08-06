# Responsive Scale Migration — Cart Clash UI

**Date:** 2026-07-30 (diagnosis); **Pass 1 shipped + PASSed 08-05; Pass 2 shipped 08-06.**
**Branch:** `cart-clash` @ `56dfa61` (2026-07-23, merge of PR #3 from `redesign/fight-night-ui`)
**Status:** Pass 1 (root scale + `cart-rave-menu.css`) done, `9e2ec60`..`f057abe`, playtest-verified
3/3 08-05. **Pass 2 shipped 08-06** (`dacca48`, `271c5cc`, `5cbc63f`, `8c65bd7` — `hud.css`,
`results.css`, `pauseOverlay.css`, `announcer.css`/`stickers.css`/`loadingScreen.css`), base-scope
clamps only per the plan's rule 4 (skip `@media` internals — see `## Execution plan` below for
what that deliberately left out). Awaiting Wyatt playtest — see [BACKLOG.md](./BACKLOG.md)
§ Playtest owed. TOUCH-HOVER-1 rode the same wave (`78acdb4`).

---

## Problem

The Fight Night UI redesign renders correctly on ultrawide 1440p and on 1080p. On other laptop
resolutions and on mobile it is inconsistent and partially broken. Goal: one UI that holds together
from mobile portrait up to 4K.

---

## Root cause

There are **513** `clamp(min, Nvw, max)` declarations across the stylesheets, each with an
independently chosen slope and independently chosen bounds. There is no shared scale.

### Where each clamp saturates

| Viewport width | at MAX | at MIN | in fluid zone |
| --- | --- | --- | --- |
| 390px | 0 | 433 | 80 |
| 768px | 173 | 172 | 168 |
| 1024px | 326 | 7 | 180 |
| 1280px | 419 | 1 | 93 |
| 1366px | 434 | 0 | 79 |
| 1512px | 471 | 0 | 42 |
| 1920px | 511 | 0 | 2 |
| 2560px | 513 | 0 | 0 |
| 3440px | 513 | 0 | 0 |

**This table is the whole diagnosis.** At 1920px and above, effectively every clamp is pinned to its
max — so 1080p and ultrawide 1440p render the *same* layout. The max values **are** the design, and
both tested screens sit above the point where everything locks there.

Below ~1900px the UI enters a zone nothing was tuned for. At 768px, 173 elements are frozen at max,
172 at min, and 168 are mid-slope **simultaneously** — three scaling regimes at once.

### Saturation width scatter

| Percentile | Width at which the clamp reaches max |
| --- | --- |
| p0 | 400px |
| p10 | 480px |
| p25 | 591px |
| p50 | 933px |
| p75 | 1200px |
| p90 | 1500px |
| p100 | 1923px |

No two elements shrink together, so proportional relationships collapse in the mid-range.

### Why mobile is worse

Most `max ÷ min` ratios are only 1.1–1.5×, so elements are barely permitted to shrink at all when
squeezed into a fraction of the design width.

### Breakpoint drift

`tokens.css` documents a contract of **380 / 768 / 1024 / 1025**. The CSS also uses **420, 480, 560,
900, 1064, 1176** — including values the contract explicitly says not to reintroduce.

---

## File inventory

| File | Lines | Media queries |
| --- | --- | --- |
| `src/cart-rave-menu.css` | 3654 | 24 |
| `src/ui/styles/hud.css` | 2268 | 13 |
| `src/ui/styles/results.css` | 684 | 4 |
| `src/ui/loadingScreen.css` | 593 | 3 |
| `src/ui/styles/pauseOverlay.css` | 536 | 3 |
| `src/ui/styles/tokens.css` | 278 | — |
| `src/ui/styles/stickers.css` | 217 | — |
| `src/ui/styles/announcer.css` | 170 | 3 |
| `src/ui/styles/global.css` | 39 | — |

### Properties driven by `clamp()`

`font-size` 225 · `gap` 84 · `padding` 59 · `width` 18 · `height` 16 · `--hud-feed-top` 14 ·
`padding-top` 11 · `margin` 7 · `padding-bottom` 6 · `margin-top` 6 · `bottom` 6 ·
`--hud-timer-reserve` 4 · plus `top`, `left`, `min-width`, `max-height`, `grid-template-columns`,
`flex`, `font-family`

### Load order

`src/main.js` imports CSS at lines 40–43, in this order:
`tokens.css` → `stickers.css` → `cart-rave-menu.css` → `global.css`.
`tokens.css` is already first, so **no load-order change is required.**

### Viewport-height units currently in use

77 occurrences of `dvh`, 0 of `svh`, 99 total `vh`-family. (Correction to an earlier estimate of
"~20" in conversation — the real figure is 77.) The `dvh` usage matters: see the `svh` rationale
below.

---

## The fix: one global scale

Replace 513 independent local scales with a single fluid root size, and express all sizing in `rem`.

```css
/* tokens.css — top of file, before :root */
html {
  font-size: clamp(0.75rem, min(0.84vw, 1.5svh), 1rem);
}
```

Resulting root scale: **1.0** at 1920px and above · **~0.79** on a 1512-wide laptop · **floor
(0.75)** at 1366px and below.

### Why `min(vw, svh)`

The ratio is tuned so that **16:9 is the crossover** — at 1920×1080 both terms land on ~16px. Wider
than 16:9 and *height* becomes the binding constraint, which is exactly the ultrawide case: the UI
stops growing with width instead of ballooning. Narrower or shorter and width binds.

### Why `svh` and not `dvh`

`dvh` changes when mobile browser chrome shows/hides, which would re-scale the **entire UI**
mid-interaction. `svh` is stable. Note the tree currently uses `dvh` in 77 places — those are
separate from the root scale, but any that affect UI sizing rather than full-bleed layout should be
reviewed during migration.

### Why `rem` bounds and not `px` bounds

Inside `html { font-size }`, `rem` resolves against the user's browser default. Using `rem` bounds
preserves accessibility font-size preferences instead of overriding them.

---

## Conversion rules

1. `clamp(min, Nvw, max)` → `(max ÷ 16)rem`. Discard the min and the slope; **the max is the
   design.**
2. Bare `px` in UI sizing → `rem` at the same ratio.
3. `--space-*` / `--pad-*` / `--gap-*` tokens lose their clamps and become `rem` constants.
4. **Stay in `px`:** hairline borders (1px), and **all media query values.**
5. Delete media queries that only adjust *size* — the root scale now covers that. Keep only ones
   that reflow *structure* (stack, hide, change column count).
6. Reconcile the drifted breakpoints (420, 480, 560, 900, 1064, 1176) back to the documented
   380 / 768 / 1024 / 1025 contract.

> **Trap worth stating explicitly (rule 4):** `rem` inside a media query resolves against the
> *initial* root font size, **not** the scaled `html` value. Media queries must remain `px` or they
> will silently mis-evaluate.

---

## Verification

**The safety invariant:** because every clamp already resolves to max at ≥1920px, a correct
migration that produces the max values at scale = 1 must render **pixel-identical** at 1920×1080 and
3440×1440. Any diff at those two sizes is a migration bug, not a design change. This reduces a
513-declaration refactor to something mechanically checkable.

Existing tooling — both confirmed present in the tree:

- `tools/shoot.mjs` — headless Playwright screenshot. Accepts `--w`, `--h`, `--menu`, `--level`,
  `--shot`, `--out`. Defaults 1280×720, `deviceScaleFactor: 1`. Requires
  `npx playwright install chromium`.
- `tools/compare.mjs` — side-by-side PNG compare plus **mean absolute channel error**. Accepts
  `--a`, `--b`, `--out`.

Capture matrix:

| Size | Purpose |
| --- | --- |
| 3440×1440 | identity check — MAE must be ~0 |
| 1920×1080 | identity check — MAE must be ~0 |
| 1512×982 | new coverage (laptop) |
| 1366×768 | new coverage (laptop, at scale floor) |
| 768×1024 | new coverage (tablet portrait) |
| 390×844 | new coverage (phone portrait) |

Output a **contact sheet to eyeball** for the new-coverage sizes rather than a hard pass/fail
assertion gate. The MAE identity check on the two ≥1920 sizes is the only place a numeric threshold
is appropriate.

---

## Execution plan — split into two passes

### Pass 1 — ✅ shipped + PASSed 08-05
- `src/ui/styles/tokens.css` — add the root scale; convert `--space-*` / `--pad-*` / `--gap-*`
  tokens. Shipped `9e2ec60`.
- `src/cart-rave-menu.css` — 172 font-sizes, 24 media queries. This file holds the bulk of the
  breakpoint drift. Shipped `97e4591`/`1b09a33`/`0599796`/`39d6afb`/`cd683a7`.

HUD and overlays stayed untouched and keep their own clamps, as planned — they remain visually
correct at ≥1920 because both systems produce max values there. Playtest evidence: three phone
checks PASSed 08-05 (results portrait/landscape stacking, kill-feed sizing), which also landed
opportunistic patches to `results.css`/`hud.css` — real fixes, but not the systematic sweep below.

### Pass 2 — ✅ shipped 08-06, awaiting playtest
- `src/ui/styles/hud.css` (`dacca48`), `results.css` (`271c5cc`), `pauseOverlay.css` (`5cbc63f`),
  `announcer.css`/`stickers.css`/`src/ui/loadingScreen.css` (`8c65bd7`).
- **Scope was narrower than this doc's rules 5–6 on purpose:** every `@media` block was left
  untouched (values, breakpoints, the 08-05 phone/orientation patches), matching Pass 1's own
  "skip @media internals" precedent — reconciling the drifted breakpoints and deleting size-only
  media queries is now its own follow-up, filed as **UI-SCALE-P2-MEDIA-1** in
  [BACKLOG.md](./BACKLOG.md) UI/UX, so it doesn't re-open playtest-PASSed phone evidence.
- A handful of sites that mathematically saturate at 1920 (an exact or near-exact tie, margin
  under ~1px) were left unconverted anyway: real viewports aren't always exactly 1920 logical px
  (scrollbar gutter, vw rounding), and `--screen-pad-x`'s identical shape already proved this in
  Pass 1 (L6, `39d6afb`, reverted after breaking 1920 identity). See the P2a/P2b commit messages
  for the exact sites.

---

## Open items

1. **Tuning is unverified — ✅ resolved for Pass 1's scope (menu), still open for Pass 2.** The
   `0.84vw` / `1.5svh` / `0.75rem` numbers held up on real phone hardware — 3/3 PASS 08-05. Pass 2's
   files (HUD, results, pause overlay, announcer, stickers, loading screen) haven't had an equivalent
   render check yet.

2. **Analysis is static, not rendered — same scope split as #1.** Settled for the menu by the Pass 1
   playtest; still genuinely unknown for Pass 2's files (how much of their mobile breakage, if any,
   is flex/grid structure rather than scale).

3. **Blocking question for pass 1 — ✅ answered: fewer elements.** Shipped in L4 (`1b09a33`,
   `cd683a7`): phone hides tagline / cmd-qual / stats / context-desc rather than shrinking them to
   ~75%. Pass 2 will need the same call made per-file (HUD kill-feed already chose "fewer/smaller
   elements" too, per the `hud.css` residual patches — see Pass 1 note above).

---

## Related existing docs in the tree

- `docs/planning/fight-night-ui-handover.md`
- `docs/BRIEFING.md`
- `docs/STATUS.md`
