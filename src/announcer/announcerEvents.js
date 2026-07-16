// announcerEvents.js — data-driven event table for "The Store PA" announcer.
// Pure data: no imports, no side effects. announcerManager.js reads this table to
// arbitrate which events get voiced/stung/called-out and when.

/**
 * @typedef {"sequence" | "critical" | "high" | "medium" | "low" | "ambient"} AnnouncerEventClass
 */

/**
 * @typedef {object} AnnouncerCalloutDef
 * @property {string} kicker Short uppercase label shown above the main line (e.g. "FIRST BLOOD").
 * @property {string} accent CSS color for the callout's accent glow/border.
 * @property {number} holdMs How long the callout stays visible once shown.
 */

/**
 * @typedef {object} AnnouncerVoiceDef
 * @property {string} key Voice asset lookup key (matches the event id unless noted).
 * @property {number} variants Number of recorded variants available (01..NN).
 */

/**
 * Fallback sting definition: "sfxKey" plays an already-registered Howler SFX by key;
 * "proc" plays a named procedural sting from announcerStings.js.
 * @typedef {{ type: "sfxKey", key: string } | { type: "proc", name: string }} AnnouncerStingDef
 */

/**
 * @typedef {object} AnnouncerEventDef
 * @property {string} id Unique event id — also the default table key.
 * @property {number} priority Higher wins arbitration (interrupt/queue ordering).
 * @property {AnnouncerEventClass} cls Arbitration class — see announcerManager.js rules.
 * @property {number} cooldownMs Minimum time between two firings of this same event.
 * @property {boolean} oncePerRound Fires at most once per round regardless of cooldown.
 * @property {number} maxPerRound Hard cap on firings per round (0 = unlimited).
 * @property {number} chance Probability gate in [0, 1]; 1 = always eligible.
 * @property {number} ttlMs How long a queued instance of this event stays valid before expiring.
 * @property {boolean} interruptible Whether a higher-priority event may cut this one off mid-play.
 * @property {number} durationMs Estimated announcement audio length, used to reserve the channel.
 * @property {AnnouncerCalloutDef | null} callout Visual callout payload, or null for audio-only events.
 * @property {AnnouncerVoiceDef} voice Voice asset lookup definition.
 * @property {AnnouncerStingDef | null} sting Fallback sting definition, or null for events with no audio.
 * @property {boolean} [focus] Living Store directive starts: while this event's callout is on
 *   screen, the manager suppresses every other non-sequence, non-critical announcement so the
 *   rule change can be read uncontested. The callout also renders at full "feature" size
 *   (announcer.css [data-focus]); regular events display 25% smaller.
 */

// * Voice assets resolve from `public/sounds/announcer/<locale>/<key>_<NN>.opus`
// * — see docs/announcer.md for the recording/drop-in pipeline.

/**
 * Frozen event table keyed by event id. See AnnouncerEventDef for field semantics.
 * @type {Readonly<Record<string, AnnouncerEventDef>>}
 */
export const ANNOUNCER_EVENTS = Object.freeze({
  countdown_3: Object.freeze({
    id: "countdown_3",
    priority: 90,
    cls: "sequence",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 800,
    interruptible: false,
    durationMs: 700,
    callout: null,
    voice: Object.freeze({ key: "countdown_3", variants: 1 }),
    sting: Object.freeze({ type: "sfxKey", key: "countdown_3" }),
  }),
  countdown_2: Object.freeze({
    id: "countdown_2",
    priority: 90,
    cls: "sequence",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 800,
    interruptible: false,
    durationMs: 700,
    callout: null,
    voice: Object.freeze({ key: "countdown_2", variants: 1 }),
    sting: Object.freeze({ type: "sfxKey", key: "countdown_2" }),
  }),
  countdown_1: Object.freeze({
    id: "countdown_1",
    priority: 90,
    cls: "sequence",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 800,
    interruptible: false,
    durationMs: 700,
    callout: null,
    voice: Object.freeze({ key: "countdown_1", variants: 1 }),
    sting: Object.freeze({ type: "sfxKey", key: "countdown_1" }),
  }),
  go: Object.freeze({
    id: "go",
    priority: 90,
    cls: "sequence",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 800,
    interruptible: false,
    durationMs: 800,
    callout: null,
    voice: Object.freeze({ key: "go", variants: 1 }),
    sting: Object.freeze({ type: "sfxKey", key: "countdown_go" }),
  }),
  first_spill: Object.freeze({
    id: "first_spill",
    priority: 70,
    cls: "high",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 3000,
    interruptible: false,
    durationMs: 1200,
    callout: Object.freeze({ kicker: "FIRST BLOOD", accent: "#ff2bd6", holdMs: 1600 }),
    voice: Object.freeze({ key: "first_spill", variants: 3 }),
    sting: Object.freeze({ type: "proc", name: "firstSpill" }),
  }),
  double_spill: Object.freeze({
    id: "double_spill",
    priority: 62,
    cls: "high",
    cooldownMs: 6000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2000,
    interruptible: false,
    durationMs: 1100,
    callout: Object.freeze({ kicker: "TWO DOWN", accent: "#22e6ff", holdMs: 1500 }),
    voice: Object.freeze({ key: "double_spill", variants: 3 }),
    sting: Object.freeze({ type: "proc", name: "doubleSpill" }),
  }),
  aisle_wipeout: Object.freeze({
    id: "aisle_wipeout",
    priority: 68,
    cls: "high",
    cooldownMs: 10000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2500,
    interruptible: false,
    durationMs: 1400,
    callout: Object.freeze({ kicker: "EVERYBODY DOWN", accent: "#ffe53d", holdMs: 1800 }),
    voice: Object.freeze({ key: "aisle_wipeout", variants: 3 }),
    sting: Object.freeze({ type: "proc", name: "wipeout" }),
  }),
  rampage: Object.freeze({
    id: "rampage",
    priority: 50,
    cls: "medium",
    cooldownMs: 8000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2500,
    interruptible: true,
    durationMs: 1100,
    callout: Object.freeze({ kicker: "COMBO", accent: "#ff8a3d", holdMs: 1500 }),
    voice: Object.freeze({ key: "rampage", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "tierUp1" }),
  }),
  savage: Object.freeze({
    id: "savage",
    priority: 55,
    cls: "medium",
    cooldownMs: 8000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2500,
    interruptible: true,
    durationMs: 1100,
    callout: Object.freeze({ kicker: "COMBO", accent: "#ff5e3d", holdMs: 1500 }),
    voice: Object.freeze({ key: "savage", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "tierUp2" }),
  }),
  carnage: Object.freeze({
    id: "carnage",
    priority: 60,
    cls: "high",
    cooldownMs: 8000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2500,
    interruptible: false,
    durationMs: 1300,
    callout: Object.freeze({ kicker: "COMBO", accent: "#ff3333", holdMs: 1700 }),
    voice: Object.freeze({ key: "carnage", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "tierUp3" }),
  }),
  critical_ko: Object.freeze({
    id: "critical_ko",
    priority: 44,
    cls: "medium",
    cooldownMs: 12000,
    oncePerRound: false,
    maxPerRound: 3,
    chance: 1,
    ttlMs: 2000,
    interruptible: true,
    durationMs: 1000,
    callout: Object.freeze({ kicker: "CRITICAL HIT", accent: "#ffe53d", holdMs: 1400 }),
    voice: Object.freeze({ key: "critical_ko", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "criticalKo" }),
  }),
  leader_down: Object.freeze({
    id: "leader_down",
    priority: 52,
    cls: "medium",
    cooldownMs: 10000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2500,
    interruptible: true,
    durationMs: 1100,
    callout: Object.freeze({ kicker: "LEADER DOWN", accent: "#ff8a3d", holdMs: 1500 }),
    voice: Object.freeze({ key: "leader_down", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "leaderDown" }),
  }),
  challenge_complete: Object.freeze({
    id: "challenge_complete",
    priority: 25,
    cls: "low",
    cooldownMs: 4000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 3000,
    interruptible: true,
    durationMs: 900,
    callout: Object.freeze({ kicker: "DAILY SPECIAL", accent: "#4dff88", holdMs: 1600 }),
    voice: Object.freeze({ key: "challenge_complete", variants: 2 }),
    // * No sting — the SfxSynth challenge sparkle already plays at completion.
    sting: null,
  }),
  refund: Object.freeze({
    id: "refund",
    priority: 45,
    cls: "medium",
    cooldownMs: 10000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2500,
    interruptible: true,
    durationMs: 1100,
    callout: Object.freeze({ kicker: "REVENGE", accent: "#b366ff", holdMs: 1500 }),
    voice: Object.freeze({ key: "refund", variants: 3 }),
    sting: Object.freeze({ type: "proc", name: "refund" }),
  }),
  new_leader: Object.freeze({
    id: "new_leader",
    priority: 35,
    cls: "low",
    cooldownMs: 12000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2500,
    interruptible: true,
    durationMs: 1000,
    callout: Object.freeze({ kicker: "SCOREBOARD", accent: "#22e6ff", holdMs: 1400 }),
    voice: Object.freeze({ key: "new_leader", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  new_host: Object.freeze({
    id: "new_host",
    priority: 55,
    cls: "high",
    cooldownMs: 3000,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 4000,
    interruptible: false,
    durationMs: 1200,
    callout: Object.freeze({ kicker: "NEW HOST", accent: "#ffffff", holdMs: 1800 }),
    voice: Object.freeze({ key: "new_host", variants: 1 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  comeback: Object.freeze({
    id: "comeback",
    // * A clawed-back sole lead (was >=3 down) is a narrative peak — escalate it clearly above
    // * the routine "SCOREBOARD" new_leader beat so it doesn't read as the same callout. Own
    // * kicker, "high" tier, and a longer hold make it land; green accent keeps the positive read.
    priority: 52,
    cls: "high",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 3500,
    interruptible: true,
    durationMs: 2000,
    callout: Object.freeze({ kicker: "COMEBACK", accent: "#4dff88", holdMs: 2200 }),
    voice: Object.freeze({ key: "comeback", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "comeback" }),
  }),
  cleanup_aisle: Object.freeze({
    id: "cleanup_aisle",
    priority: 20,
    cls: "low",
    cooldownMs: 18000,
    oncePerRound: false,
    maxPerRound: 2,
    chance: 0.4,
    ttlMs: 2000,
    interruptible: true,
    durationMs: 1200,
    callout: Object.freeze({ kicker: "SELF CHECKOUT", accent: "#ffaa33", holdMs: 1500 }),
    voice: Object.freeze({ key: "cleanup_aisle", variants: 3 }),
    sting: Object.freeze({ type: "proc", name: "cleanup" }),
  }),
  // * The Living Store — directive starts. The PA is running the match for the next
  // * ~18s; class "high" + long callout hold so the rule change can't be missed.
  // * Fired by directiveEngine.js (host schedules; every peer announces locally).
  directive_flash_sale: Object.freeze({
    id: "directive_flash_sale",
    // * Critical class: a directive IS the ruleset changing — it interrupts whatever
    // * callout is up and clears the queue so the announcement lands the instant the
    // * effect starts (a queued directive would lag its own gameplay window).
    priority: 66,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 4000,
    interruptible: false,
    // * Feature moment: channel + focus window reserved for the whole on-screen hold
    // * so no other callout replaces or crowds the rule change while players read it.
    durationMs: 4000,
    focus: true,
    callout: Object.freeze({ kicker: "FLASH SALE", accent: "#ff2bd6", holdMs: 4000 }),
    voice: Object.freeze({ key: "directive_flash_sale", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  directive_double_bag: Object.freeze({
    id: "directive_double_bag",
    priority: 66,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 4000,
    interruptible: false,
    // * Feature moment: channel + focus window reserved for the whole on-screen hold
    // * so no other callout replaces or crowds the rule change while players read it.
    durationMs: 4000,
    focus: true,
    callout: Object.freeze({ kicker: "DOUBLE BAG", accent: "#ffd24a", holdMs: 4000 }),
    voice: Object.freeze({ key: "directive_double_bag", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  directive_express_lane: Object.freeze({
    id: "directive_express_lane",
    priority: 66,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 4000,
    interruptible: false,
    // * Feature moment: channel + focus window reserved for the whole on-screen hold
    // * so no other callout replaces or crowds the rule change while players read it.
    durationMs: 4000,
    focus: true,
    callout: Object.freeze({ kicker: "EXPRESS LANE", accent: "#2bd6ff", holdMs: 4000 }),
    voice: Object.freeze({ key: "directive_express_lane", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  directive_spill_bonus: Object.freeze({
    id: "directive_spill_bonus",
    priority: 66,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 4000,
    interruptible: false,
    // * Feature moment: channel + focus window reserved for the whole on-screen hold
    // * so no other callout replaces or crowds the rule change while players read it.
    durationMs: 4000,
    focus: true,
    callout: Object.freeze({ kicker: "SPILL BONUS", accent: "#2bffb3", holdMs: 4000 }),
    voice: Object.freeze({ key: "directive_spill_bonus", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  directive_rush_hour: Object.freeze({
    id: "directive_rush_hour",
    priority: 66,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: false,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 4000,
    interruptible: false,
    // * Feature moment: channel + focus window reserved for the whole on-screen hold
    // * so no other callout replaces or crowds the rule change while players read it.
    durationMs: 4000,
    focus: true,
    callout: Object.freeze({ kicker: "RUSH HOUR", accent: "#ff6600", holdMs: 4000 }),
    voice: Object.freeze({ key: "directive_rush_hour", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  // * Living Cargo — a cart's bay just hit "overflowing" (round score reached
  // * CONFIG.cargo.fullScore). Fired once per slot per round from cargoLoad.js.
  cart_overflow: Object.freeze({
    id: "cart_overflow",
    priority: 45,
    cls: "medium",
    cooldownMs: 20000,
    oncePerRound: false,
    maxPerRound: 2,
    chance: 1,
    ttlMs: 3000,
    interruptible: true,
    durationMs: 1100,
    callout: Object.freeze({ kicker: "CART OVERFLOW", accent: "#ffd24a", holdMs: 1600 }),
    voice: Object.freeze({ key: "cart_overflow", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "newLeader" }),
  }),
  // * Living Cargo — the local player's spill-comeback buff kicked in ("empty cart is
  // * a fast cart"). Ambient nudge; fired from cargoLoad.js on the buff's rising edge.
  spill_rush: Object.freeze({
    id: "spill_rush",
    priority: 12,
    cls: "ambient",
    cooldownMs: 12000,
    oncePerRound: false,
    maxPerRound: 3,
    chance: 0.75,
    ttlMs: 1200,
    interruptible: true,
    durationMs: 800,
    callout: Object.freeze({ kicker: "FRESH START", accent: "#2bffb3", holdMs: 1200 }),
    voice: Object.freeze({ key: "spill_rush", variants: 2 }),
    sting: null,
  }),
  close_call: Object.freeze({
    id: "close_call",
    priority: 10,
    cls: "ambient",
    cooldownMs: 25000,
    oncePerRound: false,
    maxPerRound: 2,
    chance: 1,
    ttlMs: 1000,
    interruptible: true,
    durationMs: 700,
    callout: Object.freeze({ kicker: "SURVIVED", accent: "#4dff88", holdMs: 1100 }),
    voice: Object.freeze({ key: "close_call", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "closeCall" }),
  }),
  one_minute: Object.freeze({
    id: "one_minute",
    priority: 30,
    cls: "low",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2000,
    interruptible: true,
    durationMs: 1000,
    callout: Object.freeze({ kicker: "ONE MINUTE", accent: "#ffe53d", holdMs: 1400 }),
    voice: Object.freeze({ key: "one_minute", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "timeCheck" }),
  }),
  thirty_seconds: Object.freeze({
    id: "thirty_seconds",
    priority: 34,
    cls: "low",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 2000,
    interruptible: true,
    durationMs: 1000,
    callout: Object.freeze({ kicker: "30 SECONDS", accent: "#ff8a3d", holdMs: 1400 }),
    voice: Object.freeze({ key: "thirty_seconds", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "timeCheck" }),
  }),
  last_call: Object.freeze({
    id: "last_call",
    priority: 40,
    cls: "low",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 1500,
    interruptible: true,
    durationMs: 1000,
    callout: Object.freeze({ kicker: "10 SECONDS", accent: "#ff3333", holdMs: 1500 }),
    voice: Object.freeze({ key: "last_call", variants: 2 }),
    sting: Object.freeze({ type: "proc", name: "lastCall" }),
  }),
  sudden_death: Object.freeze({
    id: "sudden_death",
    priority: 95,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 4000,
    interruptible: false,
    // * NOT a focus event: it has no callout, so a focus window here would mute the
    // * announcer for the opening seconds of Sudden Death with nothing on screen.
    durationMs: 1400,
    callout: null,
    voice: Object.freeze({ key: "sudden_death", variants: 1 }),
    sting: Object.freeze({ type: "proc", name: "suddenDeath" }),
  }),
  victory: Object.freeze({
    id: "victory",
    priority: 100,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 5000,
    interruptible: false,
    durationMs: 1600,
    callout: null,
    voice: Object.freeze({ key: "victory", variants: 1 }),
    sting: Object.freeze({ type: "proc", name: "victory" }),
  }),
  defeat: Object.freeze({
    id: "defeat",
    priority: 100,
    cls: "critical",
    cooldownMs: 0,
    oncePerRound: true,
    maxPerRound: 0,
    chance: 1,
    ttlMs: 5000,
    interruptible: false,
    durationMs: 1400,
    callout: null,
    voice: Object.freeze({ key: "defeat", variants: 1 }),
    sting: Object.freeze({ type: "proc", name: "defeat" }),
  }),
});
