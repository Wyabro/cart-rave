// audio.js — procedural SFX refs bridge (music handled by audioManager.js)

import { CONFIG } from "./config.js";

let _sfx = null;
let _leaderHum = null;

/**
 * * Wires live audio subsystems into this delegation layer.
 * @param {{ sfx?: object, leaderHum?: object }} refs
 * @returns {void}
 */
export function registerAudioRefs(refs) {
  if (refs.sfx !== undefined) _sfx = refs.sfx;
  if (refs.leaderHum !== undefined) _leaderHum = refs.leaderHum;

  if (CONFIG.debug.audio) {
    // eslint-disable-next-line no-console
    console.log("[audio] registerAudioRefs", {
      sfx: Boolean(_sfx),
      leaderHum: Boolean(_leaderHum),
    });
  }
}
