/**
 * Canonical NPC name pool for Cart Rave.
 * Single source of truth shared by the server (party/) and client (src/).
 *
 * The server assigns NPC names from this pool and broadcasts them in slot payloads;
 * the client uses the same pool for solo/testdrive slot seeding. Keep additions here only.
 */
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
