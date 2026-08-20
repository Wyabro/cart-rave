// roomCodes.js — private-room codes a player can say out loud.
//
// FRIENDS-JOIN-1. The old codes were `party` + 6 random base36 chars, rendered as
// `PARTYK3X9QZ`: eleven characters, mixed letters and digits, with 0/O and 1/I
// collisions. On 08-01 that produced exactly the failure it invites — two clients
// landed in `partywmtdlw` and `partywtmdlw` (cap-218/219), one transposition apart,
// each the host of its own empty room. A code that cannot survive being read aloud
// over Discord is the wrong primitive for a mode whose whole job is "play with the
// people you are already talking to".
//
// The shape is a grocery word plus one digit — `KALE7`, spoken "kale seven". Five
// characters, on-theme, and every ambiguous glyph is designed out: the letters come
// from real words (self-correcting when misheard), and the digit set omits 0 and 1
// so nothing collides with O or I.
//
// CASE IS LOAD-BEARING. PartySocket room ids are exact strings, so `KALE7` and
// `kale7` are two different Durable Objects — the same silent split as a
// transposition. Everything here emits and returns uppercase, and `normalizeRoomCode`
// is the single funnel every entry point must pass through before the room name
// reaches a URL or a socket.

/**
 * Reserved room-name prefixes. The room string *is* the game mode: `detectGameMode`
 * (src/main.js) keys off a `solo` prefix, a `testdrive` prefix and exact `quickplay`,
 * and `isContinuousModeRoom` (shared/readiness.js) additionally treats `quickplay__*`
 * as a continuous room. A code colliding with any of these silently boots the joiner
 * into the wrong mode.
 *
 * Matched case-INSENSITIVELY on purpose. `detectGameMode` is itself inconsistent —
 * `room.toLowerCase().startsWith("testdrive")` but `room.startsWith("solo")` unlowered
 * — so an uppercase `SOLO2` slips its solo branch entirely. This module does not rely
 * on that behaviour; it refuses the whole family up front.
 */
export const RESERVED_ROOM_PREFIXES = Object.freeze(["solo", "testdrive", "quickplay"]);

/** Digits 2-9 — 0 and 1 are omitted because they are misread as O and I. */
export const ROOM_CODE_DIGITS = "23456789";

/**
 * Four-letter grocery words, uppercase. Real words only: a listener who mishears one
 * letter can still recover the whole word, which a random string never allows.
 * Grouped by aisle purely for human review.
 */
export const ROOM_CODE_WORDS = Object.freeze([
  // Produce
  "KALE", "LEEK", "BEET", "CORN", "PEAS", "BEAN", "OKRA", "YAMS", "SLAW", "HERB",
  "PEEL", "PODS", "HUSK", "CROP", "STEM", "BUDS", "LEAF", "RIPE", "SPUD", "SAGE",
  "DILL", "MINT",
  // Fruit
  "PEAR", "PLUM", "LIME", "DATE", "FIGS", "KIWI", "SLOE", "YUZU", "PIPS", "ZEST",
  "PULP", "RIND",
  // Bakery and grains
  "CAKE", "TART", "PIES", "BUNS", "ROLL", "NAAN", "PITA", "LOAF", "RUSK", "BRAN",
  "OATS", "MEAL", "MASA", "SAGO", "BAKE", "CHIA", "FLAX", "HEMP", "SOYA",
  // Dairy
  "MILK", "EGGS", "BRIE", "FETA", "EDAM", "CURD", "GHEE", "WHEY", "YOLK", "BLUE",
  "GOAT",
  // Meat and fish
  "BEEF", "PORK", "LAMB", "VEAL", "TUNA", "SOLE", "BASS", "HAKE", "CARP", "EELS",
  "CHOP", "RIBS", "LOIN", "SHIN", "RUMP", "CLAM", "KELP", "NORI",
  // Pantry
  "SALT", "RICE", "SOUP", "STEW", "TACO", "FLAN", "CHIP", "DIPS", "NUTS", "SEED",
  "MALT", "HOPS", "MACE", "OILS", "HASH", "MOLE", "MISO", "UDON", "TOFU",
  // Drinks
  "COLA", "SODA", "BREW", "WINE", "BEER", "TEAS", "MEAD", "PORT",
  // Sweets
  "GUMS", "BARS", "CANE", "ICES", "JAMS",
  // Household
  "SOAP", "MOPS", "RAGS", "WIPE", "FOIL", "WRAP", "BAGS", "TAPE", "PADS", "PEGS",
  "BINS", "MITT",
  // Kitchen
  "POTS", "PANS", "WOKS", "FORK", "DISH", "BOWL", "TRAY", "DICE", "STIR", "WHIP",
  "BOIL", "SEAR", "TOSS", "MASH", "THAW", "WARM", "HEAT", "COLD",
  // The store itself
  "CART", "LANE", "TILL", "SCAN", "LINE", "RACK", "BULK", "DEAL", "SALE", "CASH",
  "COIN", "CLUB", "LIST", "TOTE", "CASE", "PACK", "CANS", "JARS", "LIDS", "TINS",
  "CUPS", "MUGS", "DELI", "SUBS", "MELT", "CHEF", "COOK", "POUR", "FILL", "WASH",
  "SHOP", "CARD", "SILO", "BARN", "OPEN", "SHUT", "FREE", "HALF", "LOTS", "ROWS",
  "PILE", "HEAP", "MENU", "DIET", "KETO", "CARB", "IRON", "ZINC",
  // Eating
  "CHEW", "BITE", "GULP", "SIPS", "FEED", "DINE", "FULL",
]);

/**
 * Shape a room code must satisfy. Deliberately the same alphabet and bounds as
 * `resolvedPartyRoomFromUrl` (src/netcode.js) so a code that passes here can never be
 * rejected downstream as a malformed `?room=`.
 */
const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{2,16}$/;

/**
 * QUICKPLAY-SHARD-1. Public quickplay is sharded: shard 1 is `quickplay`, and overflow
 * shards are `quickplay2` … `quickplay<MAX_QUICKPLAY_SHARDS>`. This predicate is the single
 * definition of "is this a public quickplay room", and every mode/policy decision on both
 * planes must route through it — `detectGameMode` (src/netcode.js), `isContinuousModeRoom`
 * (shared/readiness.js) and the arena/difficulty branch in party/index.ts. Miss one and a
 * shard silently becomes a *friends* room: no auto-ready (so the lobby deadlocks), no arena
 * rotation, the private CHECKOUT LINE lobby with its invite link in public matchmaking, and
 * SEC-DIAG-1's score-cheat gate disarms.
 *
 * ALPHANUMERIC ONLY, and that is a hard constraint, not a style choice.
 * `resolvedPartyRoomFromUrl` (src/netcode.js) tests `/^[A-Za-z0-9]{2,16}$/` and **silently
 * falls back to `"quickplay"`** on a miss, so a `quickplay__2`-style scheme would collapse
 * every shard URL back into the one global room and sharding would appear to do nothing.
 * (`quickplay__*` remains the party-do harness prefix — those tests inject the Durable Object
 * name directly and never pass through the URL funnel. See `isContinuousModeRoom`.)
 *
 * Shard 1 is `quickplay`, never `quickplay1`, so one room can never have two names.
 * `quickplay1` is *accepted* here rather than special-cased — it is unreachable in practice,
 * since `isReservedRoomName` already refuses the whole `quickplay*` family from the typed-code
 * field and `nextQuickplayShard` never emits it.
 *
 * @param {unknown} room
 * @returns {room is string} Type predicate so callers (e.g. `nextQuickplayShard`) narrow.
 */
export function isQuickplayRoom(room) {
  if (typeof room !== "string") return false;
  return room === "quickplay" || /^quickplay[0-9]+$/.test(room);
}

/**
 * Highest shard index the overflow chain will walk to. 20 shards × 4 seats = 80 concurrent
 * humans; past that a joiner gets the same "room full" toast it gets today, so the cap can
 * only ever be as bad as current behaviour, never worse.
 */
export const MAX_QUICKPLAY_SHARDS = 20;

/**
 * Next shard in the overflow chain, or `null` once the cap is reached.
 *
 * Filling is deliberately sequential from shard 1 rather than spread: a four-player brawler
 * is worth playing because other humans are in it, so concentrating joiners beats balancing
 * them across empty rooms.
 *
 * @param {unknown} room Current (full) room name.
 * @returns {string | null}
 */
export function nextQuickplayShard(room) {
  if (!isQuickplayRoom(room)) return null;
  const index = room === "quickplay" ? 1 : Number(room.slice("quickplay".length));
  if (!Number.isInteger(index) || index < 1) return null;
  const next = index + 1;
  return next > MAX_QUICKPLAY_SHARDS ? null : `quickplay${next}`;
}

/**
 * Every public Quickplay shard name, fill order. Occupancy is not prefix-dense
 * (overflow auto-rejoin), so QP-PLAYING-1 sums this whole list.
 *
 * @returns {string[]}
 */
export function listQuickplayShardNames() {
  const names = ["quickplay"];
  let room = "quickplay";
  for (;;) {
    const next = nextQuickplayShard(room);
    if (!next) break;
    names.push(next);
    room = next;
  }
  return names;
}

/**
 * Whether a room name is reserved for a built-in mode.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isReservedRoomName(raw) {
  if (typeof raw !== "string") return false;
  const lower = raw.trim().toLowerCase();
  return RESERVED_ROOM_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * The single funnel for turning player input into a room name. Trims, uppercases, and
 * refuses anything malformed or reserved.
 *
 * Callers must use the RETURNED string — never the raw field value — when writing
 * `?room=`, or a lowercase entry reaches the URL and splits the room.
 *
 * @param {unknown} raw Typed code, pasted code, or anything else a field can hold.
 * @returns {string | null} Canonical uppercase code, or null when unusable.
 */
export function normalizeRoomCode(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!ROOM_CODE_PATTERN.test(trimmed)) return null;
  if (isReservedRoomName(trimmed)) return null;
  return trimmed.toUpperCase();
}

/**
 * Generates a fresh private-room code, e.g. `KALE7`.
 *
 * No registry exists, so collisions cannot be detected: with this word list and eight
 * digits the space is `words × 8`, which at playtest scale (a handful of concurrent
 * rooms) makes a shared code a low-single-digit percentage risk whose worst outcome is
 * a stranger appearing in the lobby. Revisit only if real traffic arrives.
 *
 * @param {() => number} [rng] Injectable for tests; defaults to Math.random.
 * @returns {string}
 */
export function generateRoomCode(rng = Math.random) {
  const word = ROOM_CODE_WORDS[Math.floor(rng() * ROOM_CODE_WORDS.length)];
  const digit = ROOM_CODE_DIGITS[Math.floor(rng() * ROOM_CODE_DIGITS.length)];
  return `${word}${digit}`;
}
