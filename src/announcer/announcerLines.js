// announcerLines.js — localization-ready subtitle lines for "The Store PA" announcer.
// Pure text data + lookup. Tokens {attacker}/{victim}/{leader}/{aisle} are substituted
// from the data object passed to getAnnouncerLine.

/**
 * @typedef {object} AnnouncerLineData
 * @property {string} [attacker] Name of the attacking player/NPC.
 * @property {string} [victim] Name of the falling/eliminated player/NPC.
 * @property {string} [leader] Name of the current/new scoreboard leader.
 * @property {string | number} [aisle] Aisle number for cleanup-flavored lines.
 * @property {string} [title] Challenge title for challenge_complete lines.
 * @property {string} [name] Player name for new_host lines.
 */

/** @type {Record<string, Record<string, string[]>>} */
const LINES = {
  en: {
    countdown_3: ["3"],
    countdown_2: ["2"],
    countdown_1: ["1"],
    go: ["GO!"],
    first_spill: [
      "FIRST SPILL!",
      "{attacker} DRAWS FIRST SPILL!",
      "AND THE FIRST SPILL GOES TO {attacker}!",
    ],
    double_spill: [
      "DOUBLE SPILL!",
      "TWO CARTS DOWN!",
      "BUY ONE, GET ONE!",
    ],
    aisle_wipeout: [
      "AISLE WIPEOUT!",
      "TOTAL WIPEOUT!",
      "EVERYTHING MUST GO!",
    ],
    rampage: [
      "{attacker} IS ON A RAMPAGE!",
      "{attacker} IS HEATING UP!",
      "{attacker} IS STOCKING UP ON KILLS!",
    ],
    savage: [
      "{attacker} IS SAVAGE!",
      "{attacker} IS OUT OF CONTROL!",
      "{attacker} IS ON CLEARANCE FOR CARTS!",
    ],
    carnage: [
      "CARNAGE! {attacker} IS UNSTOPPABLE!",
      "TOTAL CARNAGE!",
      "{attacker} IS RUNNING THE WHOLE STORE!",
    ],
    critical_ko: [
      "CRITICAL HIT!",
      "{attacker} BROUGHT THE FULL-SPEED SPECIAL!",
      "STEAMROLLED AT SPEED!",
    ],
    leader_down: [
      "THE LEADER IS DOWN!",
      "{attacker} TOPPLES THE TOP OF THE RECEIPT!",
      "{victim} JUST LOST THE LEAD — THE HARD WAY!",
    ],
    challenge_complete: [
      "{title} — COMPLETE!",
      "DAILY SPECIAL CLAIMED: {title}!",
    ],
    refund: [
      "REFUND! {attacker} GETS PAYBACK!",
      "REVENGE SERVED COLD!",
      "{attacker} SETTLES THE BILL!",
    ],
    new_leader: [
      "{leader} TAKES THE LEAD!",
      "NEW LEADER: {leader}!",
      "{leader} IS TOP OF THE RECEIPT!",
    ],
    new_host: [
      "{name} HAS THE WHEEL!",
    ],
    comeback: [
      "WHAT A COMEBACK!",
      "{leader} CAME BACK FROM THE DEAD!",
      "CLEARANCE-RACK COMEBACK!",
    ],
    cleanup_aisle: [
      "CLEAN-UP ON AISLE {aisle}!",
      "{victim} ATE THE FLOOR!",
      "SPILL ON AISLE {aisle}!",
    ],
    close_call: [
      "CLOSE ONE!",
      "THAT WAS CLOSE!",
    ],
    one_minute: [
      "ONE MINUTE ON THE CLOCK!",
      "SIXTY SECONDS OF SHOPPING LEFT!",
    ],
    thirty_seconds: [
      "THIRTY SECONDS!",
      "HALF A MINUTE! MAKE IT COUNT!",
    ],
    last_call: [
      "LAST CALL!",
      "TEN SECONDS! REGISTERS CLOSING!",
    ],
    sudden_death: ["SUDDEN DEATH!"],
    victory: ["VICTORY!"],
    defeat: ["DEFEAT!"],
  },
};

/** Remembers the last variant index played per event id so it never repeats back-to-back. */
const _lastIndexByEvent = new Map();

/**
 * Substitutes `{token}` placeholders in a line with values from data.
 * Unknown/missing tokens are left as an empty string.
 * @param {string} line
 * @param {AnnouncerLineData} data
 * @returns {string}
 */
function fillTokens(line, data) {
  return line.replace(/\{(\w+)\}/g, (_match, token) => {
    const value = data[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

/**
 * Resolves a subtitle line for an announcer event, substituting tokens and picking a
 * random variant that never repeats the previous pick for that event (when >1 variant
 * exists). Falls back to the "en" locale when the requested locale/event is missing.
 *
 * @param {string} eventId
 * @param {AnnouncerLineData} [data]
 * @param {string} [locale]
 * @returns {string | null}
 */
export function getAnnouncerLine(eventId, data = {}, locale = "en") {
  const table = LINES[locale] ?? LINES.en;
  const allVariants = table[eventId] ?? LINES.en[eventId];
  if (!allVariants || allVariants.length === 0) return null;

  // * Prefer variants whose tokens are all satisfied by data — "{attacker} DRAWS
  // * FIRST SPILL!" with no attacker would otherwise render as " DRAWS FIRST SPILL!".
  const satisfied = allVariants.filter((line) => {
    const tokens = line.match(/\{(\w+)\}/g) ?? /** @type {string[]} */ ([]);
    return tokens.every((t) => {
      const value = data[t.slice(1, -1)];
      return value !== undefined && value !== null && String(value) !== "";
    });
  });
  const variants = satisfied.length > 0 ? satisfied : allVariants;

  let index = 0;
  if (variants.length > 1) {
    const lastIndex = _lastIndexByEvent.get(eventId);
    do {
      index = Math.floor(Math.random() * variants.length);
    } while (index === lastIndex);
  }
  _lastIndexByEvent.set(eventId, index);

  return fillTokens(variants[index], data);
}

/**
 * Clears the no-repeat memory. Call at round reset so the first line of a new round
 * isn't biased against the previous round's last pick.
 * @returns {void}
 */
export function resetAnnouncerLineState() {
  _lastIndexByEvent.clear();
}
