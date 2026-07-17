// arenaCatalog.js — Pure authoring metadata shared by client-side arena consumers.

/**
 * @typedef {"classic" | "liminal" | "sunset"} ArenaMenuTheme
 */

/**
 * @typedef {object} ArenaUnlockDefinition
 * @property {boolean} [free]
 * @property {string} [killsOnLevel]
 * @property {number} [goal]
 * @property {string} hint
 */

/**
 * @typedef {object} ArenaDefinition
 * @property {string} id Stable runtime and persistence identifier.
 * @property {string} displayName Player-facing arena name.
 * @property {ArenaMenuTheme} menuTheme Menu preview palette.
 * @property {boolean} quickplay Whether the Worker may place this arena in rotation.
 * @property {readonly string[]} music Filenames under public/sounds/.
 * @property {Readonly<{ bed: string, hype?: string }>} ambience Ambience layer keys.
 * @property {Readonly<ArenaUnlockDefinition>} unlock Progression policy.
 */

/**
 * * Keep simulation, hazards, importers, and presentation tuning out of this catalog.
 * * Those systems have runtime dependencies and remain in their existing modules.
 * @type {readonly Readonly<ArenaDefinition>[]}
 */
export const ARENA_CATALOG = Object.freeze([
  Object.freeze({
    id: "classicRecord",
    displayName: "Cart Rave",
    menuTheme: "classic",
    quickplay: true,
    music: Object.freeze(["music.opus", "song2.opus"]),
    ambience: Object.freeze({
      bed: "classic_crowd_bed",
      hype: "classic_crowd_hype",
    }),
    unlock: Object.freeze({
      free: true,
      hint: "Always available",
    }),
  }),
  Object.freeze({
    id: "backrooms",
    displayName: "The Storerooms",
    menuTheme: "liminal",
    quickplay: true,
    music: Object.freeze(["storerooms.opus"]),
    ambience: Object.freeze({ bed: "backrooms_bed" }),
    unlock: Object.freeze({
      killsOnLevel: "classicRecord",
      goal: 10,
      hint: "10 KOs on Cart Rave",
    }),
  }),
  Object.freeze({
    id: "zanzibar",
    displayName: "Sundial Station",
    menuTheme: "sunset",
    quickplay: true,
    music: Object.freeze(["song3.opus", "song4.opus"]),
    ambience: Object.freeze({ bed: "zanzibar_bed" }),
    unlock: Object.freeze({
      killsOnLevel: "backrooms",
      goal: 15,
      hint: "15 KOs on The Storerooms",
    }),
  }),
  Object.freeze({
    id: "testArena",
    displayName: "Test Arena",
    menuTheme: "classic",
    quickplay: false,
    music: Object.freeze([]),
    ambience: Object.freeze({ bed: "" }),
    unlock: Object.freeze({
      free: true,
      hint: "Dev",
    }),
  }),
]);

/** @type {Readonly<Record<string, Readonly<ArenaDefinition>>>} */
export const ARENA_BY_ID = Object.freeze(
  Object.fromEntries(ARENA_CATALOG.map((arena) => [arena.id, arena])),
);
