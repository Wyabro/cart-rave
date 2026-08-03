// directives.js — data-driven directive table for "The Living Store".
// Pure data: no imports, no side effects (mirrors announcerEvents.js). The Store PA
// periodically issues one of these mini-mutators; directiveEngine.js arbitrates
// scheduling, applies the temporary CONFIG overrides, and restores them on expiry.

/**
 * A single temporary CONFIG mutation. `path` is a dot-path into CONFIG (flat-alias
 * space, e.g. "ramming.strength"); the engine multiplies the current value by `mul`
 * for the directive window and restores the saved value afterward — multipliers keep
 * directives robust to future base-tuning changes.
 * @typedef {object} DirectiveOverride
 * @property {string} path Dot-path into CONFIG.
 * @property {number} mul Multiplier applied to the value at `path`.
 */

/**
 * @typedef {object} DirectiveDef
 * @property {string} id Unique directive id — also the table key.
 * @property {string} title Short display name, shown on the HUD countdown chip.
 * @property {string} blurb One-line store-voice rule under the title on the HUD tag
 *   (mock 6a: "10 ITEMS OR LESS · NO EXCEPTIONS"). PLACEHOLDER COPY — written to be
 *   replaced; it is display-only and nothing reads it but the HUD.
 * @property {string} announceEvent Announcer event id fired when the directive starts.
 * @property {number} weight Relative pick weight (higher = more common).
 * @property {ReadonlyArray<DirectiveOverride>} [overrides] Temporary CONFIG mutations for the window.
 * @property {number} [koRewardMul] KO reward.total multiplier while active (host-applied
 *   in buildKOEvent via deps; the falls[] wire carries the boosted reward to clients).
 * @property {number} [spillBonusPoints] Points the host awards a rammer whose hit
 *   force-spills a victim's groceries while this directive is active.
 */

/**
 * Frozen directive table keyed by id. All four launch directives are default-safe:
 * short, loud, readable, and they modify *consequences* — never the five core verbs.
 * @type {Readonly<Record<string, DirectiveDef>>}
 */
export const DIRECTIVES = Object.freeze({
  flash_sale: Object.freeze({
    id: "flash_sale",
    title: "FLASH SALE",
    blurb: "RAMS HIT HARDER",
    announceEvent: "directive_flash_sale",
    weight: 1,
    overrides: Object.freeze([
      Object.freeze({ path: "ramming.strength", mul: 1.5 }),
    ]),
  }),
  double_bag: Object.freeze({
    id: "double_bag",
    title: "DOUBLE BAG",
    blurb: "KOS COUNT TWICE",
    announceEvent: "directive_double_bag",
    weight: 1,
    koRewardMul: 2,
  }),
  express_lane: Object.freeze({
    id: "express_lane",
    title: "EXPRESS LANE",
    blurb: "BOOST COMES BACK",
    announceEvent: "directive_express_lane",
    weight: 1,
    overrides: Object.freeze([
      Object.freeze({ path: "cart.ramBoost.cooldownSec", mul: 0.5 }),
      Object.freeze({ path: "cart.ramBoost.boostCharge.boostChargeTimeMs", mul: 0.55 }),
      Object.freeze({ path: "cart.ramBoost.boostCharge.boostCooldownMs", mul: 0.5 }),
    ]),
  }),
  spill_bonus: Object.freeze({
    id: "spill_bonus",
    title: "SPILL BONUS",
    blurb: "SPILLS PAY",
    announceEvent: "directive_spill_bonus",
    weight: 1,
    spillBonusPoints: 1,
  }),
  // * The tempo axis the other four don't touch: everyone's base driving speeds up.
  // * maxSpeed ×1.12 stays under nitro's 27 m/s; boostedMaxSpeed lifts ×1.08 so nitro
  // * keeps meaningful headroom above the raised base for the whole window.
  rush_hour: Object.freeze({
    id: "rush_hour",
    title: "RUSH HOUR",
    blurb: "EVERYONE SPEEDS UP",
    announceEvent: "directive_rush_hour",
    weight: 1,
    overrides: Object.freeze([
      Object.freeze({ path: "driving.maxSpeed", mul: 1.12 }),
      Object.freeze({ path: "driving.accel", mul: 1.25 }),
      Object.freeze({ path: "cart.ramBoost.boostedMaxSpeed", mul: 1.08 }),
    ]),
  }),
});
