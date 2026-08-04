// gameTeardownHooks.js — BUNDLE-1 Lever D, Edge 1.
//
// The menu half of boot (main.js, orchestration/menuPlayEntry.js) has to reach a handful of
// in-round modules — HUD, the directive engine, the announcer, arena ambience — for exactly
// two reasons: cold-boot teardown no-ops on the way back to the title screen, and the
// gameplay-side toggles it flips on the way into a round. Importing those modules for that
// is what kept `src/hud.js`, `src/directives/directiveEngine.js`,
// `src/announcer/announcerManager.js` and `src/ambience/arenaAmbience.js` (and everything
// they pull) in the EAGER graph — the split could not pay while a single static edge
// remained.
//
// So this module is the seam: every hook defaults to a no-op (or, for the one predicate,
// the value that is true before a world exists), and `orchestration/gameBoot.js` overwrites
// them with the real implementations at the end of its boot. Nothing here imports a game
// module — it is deliberately dependency-free so it can stay eager for free.
//
// ⚠ THE RISK OF THIS SEAM IS SILENT. A hook that is registered but never called (or wired
// to the wrong function) does not throw: it leaves gameplay HUD elements, announcer audio,
// an active directive or an arena ambience bed running over the title screen after a round
// ends. No automated gate catches that. Both ends of every hook are enumerated in the
// Lever D commit body; keep them in step.

/**
 * @typedef {object} GameTeardownHooks
 * @property {() => void} hideGameplayElements HUD.hideGameplayElements
 * @property {() => void} hideAudioWidget HUD.hideAudioWidget
 * @property {() => void} showAudioWidget HUD.showAudioWidget
 * @property {() => boolean} isEscOverlayVisible HUD.isEscOverlayVisible
 * @property {() => void} showEscOverlay HUD.showEscOverlay
 * @property {() => void} hideEscOverlay HUD.hideEscOverlay
 * @property {() => void} clearActiveDirective directives/directiveEngine
 * @property {() => void} stopAnnouncer announcer/announcerManager
 * @property {(levelId?: string | null) => void} startArenaAmbience ambience/arenaAmbience
 * @property {() => void} stopArenaAmbience ambience/arenaAmbience
 */

/**
 * Live hook table. Read through the object (never destructure a hook into a local at
 * import time — that latches the no-op forever, the same trap as `gameRefs`).
 * @type {GameTeardownHooks}
 */
export const gameTeardownHooks = {
  // * Pre-boot there is no #hud at all, so hiding gameplay elements is genuinely nothing
  // * to do; gameBoot re-applies the menu HUD state itself once HUD.init has run.
  hideGameplayElements: () => {},
  hideAudioWidget: () => {},
  showAudioWidget: () => {},
  // * No world ⇒ no pause overlay. `false` is the correct pre-boot answer, not a guess.
  isEscOverlayVisible: () => false,
  showEscOverlay: () => {},
  hideEscOverlay: () => {},
  clearActiveDirective: () => {},
  stopAnnouncer: () => {},
  startArenaAmbience: () => {},
  stopArenaAmbience: () => {},
};

/**
 * Called ONCE from `orchestration/gameBoot.js`. Mutates the shared table in place so any
 * closure that already captured `gameTeardownHooks` picks the real implementations up live.
 * @param {Partial<GameTeardownHooks>} impls
 */
export function registerGameTeardownHooks(impls) {
  Object.assign(gameTeardownHooks, impls);
}
