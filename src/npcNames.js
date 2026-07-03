/** @type {readonly string[]} Canonical NPC name pool — keep in sync with party/index.ts */
export const NPC_NAME_POOL = [
  "CartNapper",
  "WheelSnipe",
  "BuggyBrawler",
  "TrolleyTerror",
  "AisleDrifter",
  "CartJacker",
  "PushNPray",
  "WobbleBot",
  "RimRattler",
  "BasketCase",
  "SkidMark",
  "BumperDumper",
  "RollCage",
  "HotWheelz",
  "CurbStomp",
  "CartBlanche",
  "DriftWood",
  "NitroNancy",
  "TurboTuesday",
  "WipeOut",
  "SendIt",
  "FullSend",
  "YeetCart",
  "NoBrakes",
  "CartGod",
  "Spinout",
  "ParkingPal",
  "LaneCrasher",
  "CartWheel",
  "RampRat",
  "AisleGoblin",
  "CouponCrusher",
  "BagRattler",
  "DentedDolly",
  "WobblesMcGee",
  "ReceiptReaper",
  "ShelfShark",
  "SnackBandit",
  "CheckoutChamp",
  "GreaseGremlin",
];

export const PERSONALITY_PROFILES = {
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
