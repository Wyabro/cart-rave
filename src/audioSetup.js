// audioSetup.js — leader chime initialization (procedural, no WAV dependency)

import * as Netcode from "./netcode.js";

/**
 * Fire-and-forget procedural tone with auto-cleanup.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} destination
 * @param {OscillatorType} type
 * @param {number} startFreq
 * @param {number} endFreq
 * @param {number} duration
 * @param {number} peakGain
 * @param {number} startTime
 */
function spawnTone(ctx, destination, type, startFreq, endFreq, duration, peakGain, startTime) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  if (endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.0001, endFreq), startTime + duration);
  }
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
  osc.onended = () => {
    try { osc.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  };
}

/**
 * Creates leader-change chime SFX (plays when local player becomes leader).
 *
 * @param {THREE.AudioListener} audioListener
 * @param {() => number} getSfxVolume
 * @param {() => boolean} getIsMuted
 */
function initLeaderHumSfx(audioListener, getSfxVolume, getIsMuted) {
  /** @type {null|number} */
  let currentLeaderSlot = null;

  const playLeadChime = () => {
    if (getIsMuted() || getSfxVolume() <= 0) return;
    const ctx = audioListener.context;
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    const g = 0.15 * getSfxVolume();
    spawnTone(ctx, audioListener.gain, "sine", 660, 660, 0.075, g, now);
    spawnTone(ctx, audioListener.gain, "sine", 880, 880, 0.075, g, now + 0.075);
  };

  const setLeader = (slotIndex) => {
    const wants = Number.isFinite(slotIndex) ? slotIndex : null;
    if (wants === currentLeaderSlot) return;

    const localIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    const wasLocalLeader = currentLeaderSlot !== null && currentLeaderSlot === localIdx;
    const isLocalLeader = wants !== null && wants === localIdx;

    currentLeaderSlot = wants;
    if (!wasLocalLeader && isLocalLeader) {
      playLeadChime();
    }
  };

  const updatePositionFromCart = (cart) => {
    void cart;
  };

  const resyncVolume = () => {};

  return { setLeader, updatePositionFromCart, resyncVolume };
}

/**
 * Initializes the leader chime system.
 *
 * @param {THREE.AudioListener} audioListener Three.js audio listener on the camera.
 * @param {{
 *   getSfxVolume: () => number,
 *   getIsMuted: () => boolean,
 * }} deps
 * @returns {{ leaderHum: object }}
 */
export function initAudioSystem(audioListener, deps) {
  const { getSfxVolume, getIsMuted } = deps;
  const leaderHum = initLeaderHumSfx(audioListener, getSfxVolume, getIsMuted);
  return { leaderHum };
}
