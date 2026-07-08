// sfxSynth.js — procedural sting synthesizer (match stings, timer ticks, challenge sparkles).
// Companion to audioSetup.js: same fire-and-forget oscillator idiom, no sample dependencies.

// === Module state (mirrors the leaderHum pattern: init once, play from anywhere) ===

/** @type {THREE.AudioListener | null} */
let _audioListener = null;
/** @type {(() => number) | null} */
let _getSfxVolume = null;
/** @type {(() => boolean) | null} */
let _getIsMuted = null;

/**
 * Fire-and-forget procedural tone with auto-cleanup.
 * Adapted from audioSetup.js spawnTone with an optional attack time for slow swells.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} destination
 * @param {OscillatorType} type
 * @param {number} startFreq
 * @param {number} endFreq
 * @param {number} duration
 * @param {number} peakGain
 * @param {number} startTime
 * @param {number} [attack] Seconds to ramp from silence to peak (default 0.01).
 */
function spawnTone(ctx, destination, type, startFreq, endFreq, duration, peakGain, startTime, attack = 0.01) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  if (endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.0001, endFreq), startTime + duration);
  }
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), startTime + Math.min(attack, duration));
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
 * Guard shared by every play function: resolves the audio context and effective
 * SFX volume, or null when playback must silently no-op (not initialized, muted,
 * volume zero, or the AudioContext isn't running yet).
 *
 * @returns {{ ctx: AudioContext, dest: AudioNode, vol: number, now: number } | null}
 */
function resolvePlayback() {
  if (!_audioListener || !_getSfxVolume || !_getIsMuted) return null;
  if (_getIsMuted()) return null;
  const vol = _getSfxVolume();
  if (vol <= 0) return null;
  const ctx = _audioListener.context;
  if (ctx.state !== "running") return null;
  return { ctx, dest: _audioListener.gain, vol, now: ctx.currentTime };
}

/**
 * Initializes the sting synthesizer. Safe to call once from main.
 *
 * @param {THREE.AudioListener} audioListener Three.js audio listener on the camera.
 * @param {{
 *   getSfxVolume: () => number,
 *   getIsMuted: () => boolean,
 * }} deps
 */
export function initSfxSynth(audioListener, deps) {
  _audioListener = audioListener;
  _getSfxVolume = deps.getSfxVolume;
  _getIsMuted = deps.getIsMuted;
}

/**
 * Bright two-note arcade "hit confirm" (~120ms): rising triangle pair with a
 * quiet square layer one octave down for body.
 */
export function playKillConfirm() {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const g = 0.16 * vol;
  // * Lead: triangle sweep up, then a higher confirm blip overlapping its tail.
  spawnTone(ctx, dest, "triangle", 880, 1175, 0.06, g, now);
  spawnTone(ctx, dest, "triangle", 1320, 1320, 0.07, g, now + 0.055);
  // * Body: square layer one octave down at half the lead's gain.
  spawnTone(ctx, dest, "square", 440, 587.5, 0.06, g * 0.5, now);
  spawnTone(ctx, dest, "square", 660, 660, 0.07, g * 0.5, now + 0.055);
}

/**
 * Rising major arpeggio C5→E5→G5→C6 (~1.1s) with a supporting sawtooth layer an
 * octave down; the final C6 is held longer with a gentle second strike for shimmer.
 */
export function playVictoryFanfare() {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const g = 0.18 * vol;
  const notes = [523.25, 659.25, 784, 1046.5];
  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.12;
    const isFinal = i === notes.length - 1;
    const dur = isFinal ? 0.5 : 0.32;
    spawnTone(ctx, dest, "triangle", notes[i], notes[i], dur, g, t);
    // * Supporting sawtooth one octave down at 0.35x gain fills out the low end.
    spawnTone(ctx, dest, "sawtooth", notes[i] / 2, notes[i] / 2, dur, g * 0.35, t);
  }
  // * Gentle second strike of the top note during its hold for shimmer.
  spawnTone(ctx, dest, "triangle", 1046.5, 1046.5, 0.5, g * 0.5, now + 0.55);
}

/**
 * Descending soft minor line A4→F4→D4 (~0.9s), sine, subdued.
 * Sad but dignified — not mocking.
 */
export function playDefeatSting() {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const g = 0.12 * vol;
  const notes = [440, 349.23, 293.66];
  for (let i = 0; i < notes.length; i++) {
    spawnTone(ctx, dest, "sine", notes[i], notes[i], 0.38, g, now + i * 0.18);
  }
}

/**
 * Tension hit (~0.9s): low sawtooth drone swelling underneath two dissonant
 * minor-second square stabs. Everything is on the line.
 */
export function playSuddenDeathSting() {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  // * Drone: A2 swelling over 500ms, then decaying through the stabs' tail.
  spawnTone(ctx, dest, "sawtooth", 110, 110, 0.9, 0.1 * vol, now, 0.5);
  // * Stabs: D#5 then E5 (minor 2nd apart) — grinding, unresolved.
  spawnTone(ctx, dest, "square", 622.25, 622.25, 0.14, 0.14 * vol, now);
  spawnTone(ctx, dest, "square", 659.25, 659.25, 0.14, 0.14 * vol, now + 0.16);
}

/**
 * Single short metronomic countdown tick (30ms square). Pitch and level rise
 * for the final three seconds; kept quiet so ten plays in a row don't grate.
 *
 * @param {number} secondsLeft Whole seconds remaining on the clock (10..1).
 */
export function playTimerTick(secondsLeft) {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const urgent = secondsLeft <= 3;
  const freq = urgent ? 2093 : 1568;
  const g = (urgent ? 0.14 : 0.09) * vol;
  spawnTone(ctx, dest, "square", freq, freq, 0.03, g, now);
}

/**
 * Light sparkle up-arpeggio E5→B5→E6 (~0.5s), triangle, for challenge completion.
 */
export function playChallengeComplete() {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const g = 0.13 * vol;
  const notes = [659.25, 987.77, 1318.5];
  for (let i = 0; i < notes.length; i++) {
    spawnTone(ctx, dest, "triangle", notes[i], notes[i], 0.2, g, now + i * 0.09);
  }
}
