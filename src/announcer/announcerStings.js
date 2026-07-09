// announcerStings.js — procedural fallback stings for "The Store PA" announcer.
// Standalone copy of sfxSynth.js's spawnTone idiom (no import — this module must work
// even if sfxSynth is torn out) so voice-less events still get a musical sting until
// recorded voice assets land.

// === Module state (mirrors the sfxSynth/leaderHum pattern: init once, play from anywhere) ===

/** @type {THREE.AudioListener | null} */
let _audioListener = null;
/** @type {(() => number) | null} */
let _getSfxVolume = null;
/** @type {(() => boolean) | null} */
let _getIsMuted = null;

/**
 * Fire-and-forget procedural tone with auto-cleanup.
 * Copied from sfxSynth.js's spawnTone so this module has zero dependency on it.
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
 * Initializes the announcer sting synthesizer. Safe to call once from main.
 *
 * @param {THREE.AudioListener} audioListener Three.js audio listener on the camera.
 * @param {{
 *   getSfxVolume: () => number,
 *   getIsMuted: () => boolean,
 * }} deps
 */
export function initAnnouncerStings(audioListener, deps) {
  _audioListener = audioListener;
  _getSfxVolume = deps.getSfxVolume;
  _getIsMuted = deps.getIsMuted;
}

// === Individual sting recipes ===
// Each takes the resolved playback context and renders its notes. Kept separate from
// the dispatch table below so the table stays a flat, readable name -> fn map.

function stingFirstSpill({ ctx, dest, vol, now }) {
  const g = 0.16 * vol;
  // * Bright rising two-note lead.
  spawnTone(ctx, dest, "triangle", 660, 880, 0.09, g, now);
  spawnTone(ctx, dest, "triangle", 880, 1320, 0.12, g, now + 0.09);
  // * Octave layer underneath for body.
  spawnTone(ctx, dest, "square", 330, 440, 0.09, g * 0.4, now);
  spawnTone(ctx, dest, "square", 440, 660, 0.12, g * 0.4, now + 0.09);
}

function stingDoubleSpill({ ctx, dest, vol, now }) {
  const g = 0.15 * vol;
  // * Two quick paired hits — first pair, then a second pair a beat later.
  spawnTone(ctx, dest, "triangle", 740, 740, 0.07, g, now);
  spawnTone(ctx, dest, "square", 370, 370, 0.07, g * 0.5, now);
  spawnTone(ctx, dest, "triangle", 740, 740, 0.07, g, now + 0.16);
  spawnTone(ctx, dest, "square", 370, 370, 0.07, g * 0.5, now + 0.16);
}

function stingWipeout({ ctx, dest, vol, now }) {
  const g = 0.17 * vol;
  // * Three descending impacts.
  spawnTone(ctx, dest, "square", 880, 660, 0.1, g, now);
  spawnTone(ctx, dest, "square", 660, 494, 0.1, g, now + 0.11);
  spawnTone(ctx, dest, "square", 494, 330, 0.12, g, now + 0.22);
  // * Low sawtooth undertone tying the hits together.
  spawnTone(ctx, dest, "sawtooth", 110, 82, 0.4, g * 0.45, now, 0.05);
}

function stingTierUp({ ctx, dest, vol, now }, stepIndex) {
  // * Rising arpeggio; each tier starts one step higher and runs slightly longer/louder.
  const base = [440, 554.37, 659.25][stepIndex] ?? 440;
  const dur = 0.14 + stepIndex * 0.03;
  const g = (0.13 + stepIndex * 0.02) * vol;
  const notes = [base, base * 1.25, base * 1.5];
  for (let i = 0; i < notes.length; i++) {
    spawnTone(ctx, dest, "triangle", notes[i], notes[i], dur, g, now + i * dur * 0.7);
  }
}

function stingCriticalKo({ ctx, dest, vol, now }) {
  const g = 0.15 * vol;
  // * Sharp high double-stab with a quick pitch snap — reads as "that hit HARD".
  spawnTone(ctx, dest, "square", 1174.66, 1568, 0.07, g, now);
  spawnTone(ctx, dest, "square", 1568, 1174.66, 0.1, g, now + 0.08);
  spawnTone(ctx, dest, "sawtooth", 146.83, 110, 0.22, g * 0.5, now, 0.02);
}

function stingLeaderDown({ ctx, dest, vol, now }) {
  const g = 0.15 * vol;
  // * Regal-then-toppled: a bright hit that falls a fifth and lands low.
  spawnTone(ctx, dest, "triangle", 880, 880, 0.1, g, now);
  spawnTone(ctx, dest, "triangle", 587.33, 587.33, 0.12, g, now + 0.11);
  spawnTone(ctx, dest, "square", 293.66, 220, 0.2, g * 0.6, now + 0.22, 0.02);
}

function stingRefund({ ctx, dest, vol, now }) {
  const g = 0.15 * vol;
  // * "Cha-ching"-like triangle pair: quick dip then a bright ring up top.
  spawnTone(ctx, dest, "triangle", 587.33, 392, 0.08, g, now);
  spawnTone(ctx, dest, "triangle", 784, 1174.66, 0.22, g, now + 0.09, 0.02);
}

function stingNewLeader({ ctx, dest, vol, now }) {
  const g = 0.13 * vol;
  // * Short ascending major third.
  spawnTone(ctx, dest, "triangle", 587.33, 587.33, 0.12, g, now);
  spawnTone(ctx, dest, "triangle", 739.99, 739.99, 0.16, g, now + 0.1);
}

function stingComeback({ ctx, dest, vol, now }) {
  const g = 0.15 * vol;
  // * Triumphant three-note rise.
  const notes = [523.25, 659.25, 880];
  for (let i = 0; i < notes.length; i++) {
    spawnTone(ctx, dest, "triangle", notes[i], notes[i], 0.16 + i * 0.03, g, now + i * 0.13);
  }
}

function stingCleanup({ ctx, dest, vol, now }) {
  const g = 0.12 * vol;
  // * Comedic descending minor-second "womp".
  spawnTone(ctx, dest, "square", 233.08, 220, 0.35, g, now, 0.02);
}

function stingCloseCall({ ctx, dest, vol, now }) {
  const g = 0.11 * vol;
  // * Quick breath-like high blip pair.
  spawnTone(ctx, dest, "sine", 1568, 1760, 0.05, g, now);
  spawnTone(ctx, dest, "sine", 1760, 1976, 0.05, g, now + 0.08);
}

function stingTimeCheck({ ctx, dest, vol, now }) {
  const g = 0.12 * vol;
  // * Single soft PA chime — a time check, not an alarm (lastCall owns urgency).
  spawnTone(ctx, dest, "triangle", 987.77, 987.77, 0.12, g, now);
  spawnTone(ctx, dest, "triangle", 659.25, 659.25, 0.16, g * 0.6, now + 0.1);
}

function stingLastCall({ ctx, dest, vol, now }) {
  const g = 0.15 * vol;
  // * Urgent double square stab.
  spawnTone(ctx, dest, "square", 880, 880, 0.09, g, now);
  spawnTone(ctx, dest, "square", 880, 880, 0.09, g, now + 0.14);
}

function stingSuddenDeath({ ctx, dest, vol, now }) {
  // * Reimplementation of sfxSynth.playSuddenDeathSting's tension recipe.
  spawnTone(ctx, dest, "sawtooth", 110, 110, 0.9, 0.1 * vol, now, 0.5);
  spawnTone(ctx, dest, "square", 622.25, 622.25, 0.14, 0.14 * vol, now);
  spawnTone(ctx, dest, "square", 659.25, 659.25, 0.14, 0.14 * vol, now + 0.16);
}

function stingVictory({ ctx, dest, vol, now }) {
  // * Reimplementation of sfxSynth.playVictoryFanfare's rising major arpeggio.
  const g = 0.18 * vol;
  const notes = [523.25, 659.25, 784, 1046.5];
  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.12;
    const isFinal = i === notes.length - 1;
    const dur = isFinal ? 0.5 : 0.32;
    spawnTone(ctx, dest, "triangle", notes[i], notes[i], dur, g, t);
    spawnTone(ctx, dest, "sawtooth", notes[i] / 2, notes[i] / 2, dur, g * 0.35, t);
  }
  spawnTone(ctx, dest, "triangle", 1046.5, 1046.5, 0.5, g * 0.5, now + 0.55);
}

function stingDefeat({ ctx, dest, vol, now }) {
  // * Reimplementation of sfxSynth.playDefeatSting's descending soft minor line.
  const g = 0.12 * vol;
  const notes = [440, 349.23, 293.66];
  for (let i = 0; i < notes.length; i++) {
    spawnTone(ctx, dest, "sine", notes[i], notes[i], 0.38, g, now + i * 0.18);
  }
}

/** @type {Record<string, (p: { ctx: AudioContext, dest: AudioNode, vol: number, now: number }) => void>} */
const STING_RECIPES = {
  firstSpill: stingFirstSpill,
  doubleSpill: stingDoubleSpill,
  wipeout: stingWipeout,
  tierUp1: (p) => stingTierUp(p, 0),
  tierUp2: (p) => stingTierUp(p, 1),
  tierUp3: (p) => stingTierUp(p, 2),
  refund: stingRefund,
  criticalKo: stingCriticalKo,
  leaderDown: stingLeaderDown,
  newLeader: stingNewLeader,
  comeback: stingComeback,
  cleanup: stingCleanup,
  closeCall: stingCloseCall,
  timeCheck: stingTimeCheck,
  lastCall: stingLastCall,
  suddenDeath: stingSuddenDeath,
  victory: stingVictory,
  defeat: stingDefeat,
};

/**
 * Plays a named procedural announcer sting.
 *
 * @param {string} name One of the keys in STING_RECIPES (e.g. "firstSpill", "tierUp2").
 * @returns {boolean} True if the sting actually played; false when not initialized,
 *   muted, volume is zero, the AudioContext isn't running, or the name is unknown.
 */
export function playAnnouncerSting(name) {
  const recipe = STING_RECIPES[name];
  if (!recipe) return false;
  const p = resolvePlayback();
  if (!p) return false;
  recipe(p);
  return true;
}
