// * Canonical NPC name pool lives in shared/ (single source of truth for client + server).
// * Re-exported here so existing `./npcNames.js` importers keep working unchanged.
export { NPC_NAME_POOL } from "../shared/npcNames.js";

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
    humanWeight: 0.917,
    patrolWeight: 0.052,
    wanderWeight: 0.031,
    decisionIntervalMin: 200,
    decisionIntervalMax: 450,
    steerGainMin: 1.3,
    steerGainMax: 1.8,
    npcRamCommitChance: 0.50,
  },
  lurker: {
    name: "lurker",
    humanWeight: 0.474,
    patrolWeight: 0.442,
    wanderWeight: 0.084,
    decisionIntervalMin: 400,
    decisionIntervalMax: 850,
    steerGainMin: 0.9,
    steerGainMax: 1.3,
    npcRamCommitChance: 0.25,
  },
  scavenger: {
    name: "scavenger",
    humanWeight: 0.636,
    patrolWeight: 0.273,
    wanderWeight: 0.091,
    decisionIntervalMin: 250,
    decisionIntervalMax: 550,
    steerGainMin: 1.1,
    steerGainMax: 1.5,
    npcRamCommitChance: 0.25,
  },
  chaotic: {
    name: "chaotic",
    humanWeight: 0.368,
    patrolWeight: 0.105,
    wanderWeight: 0.527,
    decisionIntervalMin: 150,
    decisionIntervalMax: 950,
    steerGainMin: 1.0,
    steerGainMax: 2.2,
    npcRamCommitChance: 0.35,
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
