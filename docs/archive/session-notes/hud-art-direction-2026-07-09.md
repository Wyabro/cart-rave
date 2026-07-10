# HUD Art Direction — "Peel-and-Stick" identity pass (2026-07-09)

Follow-up to the HUD redesign (same day). Layout, hierarchy, regions, tokens, and the
animation system are FROZEN — this pass replaces the *material, shapes, lettering, and
motion feel* so the HUD reads "Super Shopping Carts Bros.", not "Rocket League with carts".
Reviewed by three discipline passes (Nintendo-style UI critique, graphic design vocabulary,
motion tuning); synthesized and decided here.

## 1. Honest critique of what shipped this morning

The redesign fixed *where* everything is and *what* it says, then dressed it in the Riot
house style. Nearly every element is the same material: `rgba(0,0,0,0.75)` glass +
`backdrop-filter: blur` + 1–2px 15%-white hairline border + 10px rounded rect + additive
blur-glow. That combination IS the esports look. The three most Cart-Clash things on the
HUD were already the three opaque ones — the YOU tag, the rampage pip, and the status
banner's `4px 4px 0` hard shadow. The fix is to make everything else match them.

## 2. Element-by-element: what still reads esports and why

- **Timer** — dark glass rect + left accent stripe + tracked micro-caps "TIME LEFT" +
  hairline progress bar = Rocket League boost panel. The Bungee numeral is trapped in chrome.
- **Score chips** — translucent gradient + hairline border + 4px edge stripe = Valorant
  scoreboard. Called "sticker chips" in comments; the material disagrees.
- **Kill feed** — chrome-free tracked caps, dim 45%-white verb = Apex/CS killfeed. The verb
  (the joke) is the smallest, dimmest text in the row: backwards.
- **Combo badge / boost meter / toast** — blurred glass ability-tooltips; boost is a
  hairline FPS ability bar with a tracked "BOOST" caption.
- **Hitmarker** — literally the CoD gapped 4-tick X, while our own icon set contains the
  correct cartoon KO burst.
- **Announcer** — the skewed stamp is right; the tracked micro-caps kicker + triple glow +
  chromatic-aberration flick are esports/glitch idioms (cartoons stamp, they don't glitch).
  (The flick also never rendered — children override the animated textShadow.)
- **Icons** — the stroke-only glyphs (scavenger claw, chaotic spiral, dizzy, host antenna)
  turn to mush at 12px; the antenna says "server", not "driver".

## 3. The unified direction: pigment on vinyl, not light through glass

**Family test:** could you peel this element off the screen with a fingernail?
Opaque ink surface · continuous sticker-white die-cut contour · hard zero-blur down-right
shadow · lettering as filled pigment with ink outline + stepped extrude · color as printed
ink (flat fills, hazard stripes, tag shapes) · glow ONLY when something worth cheering
happened in the last ~2 seconds.

Core vocabulary (full specs live in the CSS):
- **3 neutral tokens**: `--color-sticker-white #f2ede4` (warm vinyl, never a large fill),
  `--color-ink #14101e` (every panel surface), `--color-ink-deep #08050f` (outlines/shadows).
- **Die-cut recipe**: `box-shadow: 0 0 0 <edge> sticker-white, <off> <off> 0 <edge> ink-deep,
  inset 0 2px 0 rgba(255,255,255,.07)`; edge/offset tiers: micro 1.5/2px, chip 2.5/3px,
  panel 3/4px, billboard 4/6px. All `backdrop-filter` and resting glows deleted.
- **Silhouettes**: timer = price-tag point (clip-path + punched hole; the old state stripe
  becomes the tag's state zone with **hazard stripes** on warn/urgent/sudden-death);
  arena splash = aisle-marker parallelogram; toast = coupon (dashed inner keyline, +1.5°);
  combo = tilted ticket (−2°). Persistent chrome stays level (chips, timer body).
- **Lettering**: stack A (sticker-white fill, ink text-stroke, 2-step hard extrude) on all
  big text; celebration variant (yellow fill, magenta extrude, ONE glow layer) only on GO /
  victory / tier-3 moments. Tracked micro-caps meta layer purged ("TIME LEFT" label gone,
  boost label → bolt glyph, feed verb promoted to hero weight in sticker-white).
- **Color roles**: yellow promoted to retail workhorse (hazard stripes, leader chip edge,
  crown); magenta demoted to celebration pigment; cyan = small printed accents; alert red
  always paired with hazard geometry, never glow. Arena stays dark — opaque ink panels read
  darker than glowing glass.
- **Collectible emblems**: personality glyphs get shaped sticker backings with a white ring —
  aggressor = red impact burst, lurker = purple surveillance shield, scavenger = green price
  tag (retail motif is visual only — no retail copy), chaotic = orange jagged clearance burst.
  White icon ink on dark backings, deep ink on bright ones.
- **Host mark** = steering wheel in a small round ink sticker ("the driver of the cart",
  still labeled HOST — no cute names, per earlier decision). Replaces the antenna everywhere.
- **Hitmarker** = the burst glyph stamping in; the 4-tick X retires.
- **Motion feel** ("sticker slap"): travel compressed into the first ~30–45% of every
  existing animation, then squash/settle — SLAP curve `cubic-bezier(0.1,0.9,0.2,1)`,
  fatter outBack settles, anticipation exits (`inBack`) on the kill feed, `steps(3)` cel
  cadence on dizzy stars, shadow catch-up keyframes on countdown/score-float/rank-swap.
  Nothing slower; reduced-motion guards byte-identical. Deliberately untouched: conn pulse,
  hover affordances, touch press, readyPulse idle, boostCharged, suddenDeath loop, countUp.

## 4. Deliberate deviations from the specialist reports (CD calls)

- The `◆` kicker diamond stays — it's the game-wide typographic brand mark (menu uses ◇);
  consistency beats icon-purity here.
- No starburst backing on multi-KO score floats (needs new state plumbing = engineering).
- Combo ticket uses the simple die-cut + tilt, not the perforation mask (fiddly tier);
  toast uses the dashed-keyline coupon fallback.
- Menu-side motion retunes (card enter 420ms etc.) are out of scope: HUD pass only.
- Mobile timer keeps the plain pill sticker; the price-tag silhouette is desktop-only.
- Mute button grows to the 44px touch floor (readability red-line flagged in review).

## 5. Status

Implemented (uncommitted, on top of the redesign). Gates green (tsc, 129 vitest, knip
unchanged from HEAD, build). An independent gameplay-UX review of the diff rated desktop a
net readability GAIN (all fixed-palette text 5.5–16:1) and found three regressions, all
fixed in-session:
- Dark custom cart hues (200–290°, e.g. #0000ff at 2.2:1 on ink) → the existing
  `clampAccentLuminance` now floors chip glow (`applyHudScoreBoxGlow`) and feed row
  colors (`addKillFeedEntry`).
- Touch lost the hazard SHAPE channel (stripe hidden on the pill) → warn/urgent hazard
  gradients now paint the touch timer-bar track.
- Stale `letter-spacing: 0.22em` mobile override on the (now solid-tag) announcer kicker → removed.
Also applied from the review: urgent stripes at tighter pitch than warn (geometry channel),
RD meta 0.45→0.55 alpha, conn pulse floor 0.55→0.7, hitmarker reduced-motion fade variant,
Safari `@supports not (paint-order)` thin-stroke fallback, fatter host-wheel strokes,
44px mute floor on touch, toast kicker 10px floor, reduced-motion guards on the timer
numeral pulses (pre-existing gap).

Verified in-browser via computed styles (die-cut stacks, price-tag clip, ink surfaces,
stroke lettering, kicker tag, hazard gradients, touch overrides) — the Browser pane's
rAF was frozen (hidden-tab quirk) so no pixel screenshots this session; first live look
is on the human. Pending human checks: everything from the redesign doc (two-browser MP,
real phone incl. Safari paint-order confirmation, taste pass on the new material).
