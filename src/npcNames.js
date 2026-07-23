// * Canonical NPC name pool lives in shared/ (single source of truth for client + server).
// * Re-exported here so existing `./npcNames.js` importers keep working unchanged.
export { NPC_NAME_POOL } from "../shared/npcNames.js";
import { CART_COLORS } from "./config.js";

/**
 * Player-facing presentation for each personality — one source for the HUD
 * scoreboard chips and the 3D nametags (replaces the old duplicated
 * PERSONALITY_BADGES letter maps). `icon` is a glyph name in src/ui/icons.js.
 */
export const PERSONALITY_META = Object.freeze({
  aggressor: Object.freeze({ icon: "aggressor", color: "#ff4d4d", label: "AGGRESSOR" }),
  lurker: Object.freeze({ icon: "lurker", color: "#b366ff", label: "LURKER" }),
  scavenger: Object.freeze({ icon: "scavenger", color: "#4dff88", label: "SCAVENGER" }),
  chaotic: Object.freeze({ icon: "chaotic", color: "#ffaa33", label: "CHAOTIC" }),
});

const PERSONALITY_PROFILES = {
  aggressor: {
    name: "aggressor",
    humanWeight: 0.93,
    patrolWeight: 0.052,
    wanderWeight: 0.031,
    decisionIntervalMin: 200,
    decisionIntervalMax: 450,
    steerGainMin: 1.3,
    steerGainMax: 1.8,
    npcRamCommitChance: 0.62,
  },
  lurker: {
    name: "lurker",
    humanWeight: 0.55,
    patrolWeight: 0.37,
    wanderWeight: 0.08,
    decisionIntervalMin: 400,
    decisionIntervalMax: 850,
    steerGainMin: 0.9,
    steerGainMax: 1.3,
    npcRamCommitChance: 0.35,
  },
  scavenger: {
    name: "scavenger",
    humanWeight: 0.70,
    patrolWeight: 0.22,
    wanderWeight: 0.08,
    decisionIntervalMin: 250,
    decisionIntervalMax: 550,
    steerGainMin: 1.1,
    steerGainMax: 1.5,
    npcRamCommitChance: 0.35,
  },
  chaotic: {
    name: "chaotic",
    humanWeight: 0.45,
    patrolWeight: 0.10,
    wanderWeight: 0.45,
    decisionIntervalMin: 150,
    decisionIntervalMax: 950,
    steerGainMin: 1.0,
    steerGainMax: 2.2,
    npcRamCommitChance: 0.45,
  },
};

const NAME_PERSONALITY_MAP = {
  WheelSnipe: "aggressor",
  CartNapper: "aggressor",
  BuggyBrawler: "aggressor",
  TrolleyTerror: "aggressor",
  BumperDumper: "aggressor",
  NitroNancy: "aggressor",
  TurboTuesday: "aggressor",
  FullSend: "aggressor",
  NoBrakes: "aggressor",
  CartGod: "aggressor",
  ShelfShark: "aggressor",
  CurbStomp: "aggressor",

  AisleGoblin: "lurker",
  AisleDrifter: "lurker",
  CartJacker: "lurker",
  GreaseGremlin: "lurker",
  ParkingPal: "lurker",
  RimRattler: "lurker",
  RampRat: "lurker",
  CartBlanche: "lurker",

  CouponCrusher: "scavenger",
  BagRattler: "scavenger",
  ReceiptReaper: "scavenger",
  SnackBandit: "scavenger",
  CheckoutChamp: "scavenger",
  BasketCase: "scavenger",
  DentedDolly: "scavenger",

  YeetCart: "chaotic",
  WobbleBot: "chaotic",
  PushNPray: "chaotic",
  WobblesMcGee: "chaotic",
  Spinout: "chaotic",
  WipeOut: "chaotic",
  SendIt: "chaotic",
  SkidMark: "chaotic",
  RollCage: "chaotic",
  HotWheelz: "chaotic",
  DriftWood: "chaotic",
  LaneCrasher: "chaotic",
  CartWheel: "chaotic",

  // * Cart Clash flavor expansion (shared/npcNames.js) — same four personalities.
  RamRaider: "aggressor",
  BasketBruiser: "aggressor",
  ClashCart: "aggressor",
  CartKong: "aggressor",
  PlowLord: "aggressor",
  DoorBuster: "aggressor",
  BulkBasher: "aggressor",
  FreshBruise: "aggressor",
  GridlockGus: "lurker",
  BuggyBandit: "lurker",
  KartelBoss: "lurker",
  FreezerBurn: "lurker",
  TotalRecall: "scavenger",
  SpillSeeker: "scavenger",
  PalletPusher: "scavenger",
  RackAttack: "scavenger",
  CrashRegister: "chaotic",
  CleanupAisle5: "chaotic",
  SelfCheckout: "chaotic",
  BumperCrop: "chaotic",
};

/**
 * Resolves an NPC name or slot index to a personality profile.
 * @param {string|number|null|undefined} identifier
 * @returns {typeof PERSONALITY_PROFILES["aggressor"]}
 */
export function getNpcPersonality(identifier) {
  if (typeof identifier === "string" && NAME_PERSONALITY_MAP[identifier]) {
    return PERSONALITY_PROFILES[NAME_PERSONALITY_MAP[identifier]];
  }
  const profiles = [
    PERSONALITY_PROFILES.aggressor,
    PERSONALITY_PROFILES.lurker,
    PERSONALITY_PROFILES.scavenger,
    PERSONALITY_PROFILES.chaotic,
  ];
  const idx = typeof identifier === "number" ? Math.abs(identifier) % profiles.length : 0;
  return profiles[idx];
}

/**
 * Cart-color key / css class / hex → a css color string, defensively (slot
 * color may arrive as a PALETTE key like "pink", a "bg-pink" class, a "#hex",
 * or a 0xRRGGBB number depending on the source).
 * @param {string|number|null|undefined} color
 * @returns {string}
 */
function cartColorCss(color) {
  if (color == null) return "#f2ede4";
  if (typeof color === "number") return "#" + (color >>> 0).toString(16).padStart(6, "0").slice(-6);
  if (typeof color === "string") {
    if (color[0] === "#") return color;
    const key = color.startsWith("bg-") ? color.slice(3) : color;
    const entry = CART_COLORS[key];
    if (entry) return "#" + entry.hex.toString(16).padStart(6, "0");
    return color; // already a css color name/value
  }
  return "#f2ede4";
}

/**
 * Uniform emblem descriptor for ANY player slot — the single resolver every
 * roster / scoreboard / podium / nameplate uses so humans and NPCs render the
 * same way. Shape mirrors PERSONALITY_META: `{ icon, color, label }`.
 *  - NPC   → its personality emblem (baked color + white die-cut contour).
 *  - human → the cart-color "shopper" glyph, tinted by the slot's cart color.
 *  - empty → null.
 * Host / leader / YOU stay as SEPARATE pips (not baked here), matching the mocks.
 * @param {{ kind?: string, name?: string, color?: string|number }|null|undefined} slot
 * @returns {{ icon: string, color: string, label: string }|null}
 */
export function emblemForSlot(slot) {
  if (!slot) return null;
  if (slot.kind === "npc") {
    const p = getNpcPersonality(slot.name);
    return p ? PERSONALITY_META[p.name] : null;
  }
  if (slot.kind === "human") {
    return { icon: "shopper", color: cartColorCss(slot.color), label: "SHOPPER" };
  }
  return null;
}
