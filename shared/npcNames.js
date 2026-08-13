/**
 * Canonical NPC name pool for Cart Clash.
 * Single source of truth shared by the server (party/) and client (src/).
 *
 * The server assigns NPC names from this pool and broadcasts them in slot payloads;
 * the client uses the same pool for solo/testdrive slot seeding. Keep additions here only.
 */
export const NPC_PERSONALITY_ORDER = Object.freeze([
  "aggressor",
  "lurker",
  "scavenger",
  "chaotic",
]);

export const NPC_NAME_PERSONALITY = Object.freeze({
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

  // * Cart Clash flavor expansion — same four personalities.
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
});

/**
 * Rotate NPC_PERSONALITY_ORDER so `omitIndex` is first. Solo fields [1],[2],[3].
 * @param {number} omitIndex
 * @returns {readonly string[]}
 */
export function rotateNpcPersonalityOrder(omitIndex) {
  const n = NPC_PERSONALITY_ORDER.length;
  const parsed = typeof omitIndex === "number" ? omitIndex : Number(omitIndex);
  const idx = Number.isFinite(parsed) ? ((Math.trunc(parsed) % n) + n) % n : 0;
  return [...NPC_PERSONALITY_ORDER.slice(idx), ...NPC_PERSONALITY_ORDER.slice(0, idx)];
}

/**
 * @param {string[]} list
 * @param {() => number} rng
 */
function shuffleInPlace(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

/**
 * One unused name per personality, in `order`. Shuffle lives inside each bucket.
 * @param {readonly string[]} order
 * @param {() => number} [rng]
 * @returns {string[]}
 */
export function drawNpcNamesByPersonality(order, rng = Math.random) {
  /** @type {Record<string, string[]>} */
  const buckets = Object.fromEntries(NPC_PERSONALITY_ORDER.map((type) => [type, []]));
  for (const [name, type] of Object.entries(NPC_NAME_PERSONALITY)) {
    if (buckets[type]) buckets[type].push(name);
  }
  const roll = typeof rng === "function" ? rng : Math.random;
  for (const type of NPC_PERSONALITY_ORDER) {
    shuffleInPlace(buckets[type], roll);
  }
  const used = new Set();
  const names = [];
  for (const type of order) {
    const bucket = buckets[type];
    if (!bucket) continue;
    const name = bucket.find((entry) => !used.has(entry));
    if (!name) continue;
    used.add(name);
    names.push(name);
  }
  return names;
}

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
  // * Cart Clash flavor expansion (2026-07-12): arena-brawl energy + supermarket puns.
  // * Style guide: KO-friendly wording only — no "kill" vocabulary.
  "RamRaider",
  "BasketBruiser",
  "ClashCart",
  "CartKong",
  "PlowLord",
  "DoorBuster",
  "BulkBasher",
  "FreshBruise",
  "GridlockGus",
  "BuggyBandit",
  "KartelBoss",
  "FreezerBurn",
  "TotalRecall",
  "SpillSeeker",
  "PalletPusher",
  "RackAttack",
  "CrashRegister",
  "CleanupAisle5",
  "SelfCheckout",
  "BumperCrop",
];
