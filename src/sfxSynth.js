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

/** @type {AudioBuffer | null} */
let _noiseBuffer = null;

/**
 * Fire-and-forget filtered white-noise burst with auto-cleanup — the water/whoosh
 * counterpart to spawnTone. A shared 1s noise buffer is lazily built per context.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} destination
 * @param {"bandpass" | "lowpass" | "highpass"} filterType
 * @param {number} startFreq Filter frequency at start.
 * @param {number} endFreq Filter frequency at end (exponential sweep).
 * @param {number} duration
 * @param {number} peakGain
 * @param {number} startTime
 * @param {number} [attack] Seconds to ramp from silence to peak (default 0.01).
 * @param {number} [q] Filter Q (default 0.9 — broad, watery).
 */
function spawnNoise(ctx, destination, filterType, startFreq, endFreq, duration, peakGain, startTime, attack = 0.01, q = 0.9) {
  if (!_noiseBuffer || _noiseBuffer.sampleRate !== ctx.sampleRate) {
    const len = Math.floor(ctx.sampleRate);
    _noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = _noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(startFreq, startTime);
  if (endFreq !== startFreq) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), startTime + duration);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), startTime + Math.min(attack, duration));
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  src.start(startTime);
  src.stop(startTime + duration + 0.05);
  src.onended = () => {
    try { src.disconnect(); } catch {}
    try { filter.disconnect(); } catch {}
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

// * Victory fanfare, defeat sting, and Sudden Death tension hit moved to
// * src/announcer/announcerStings.js — those moments are announcer-owned now.

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
 * Round-start whoosh (~0.3s): rising triangle sweep with an airy noise layer —
 * the audio half of the GO! camera punch-in.
 */
export function playGoWhoosh() {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const g = 0.14 * vol;
  spawnTone(ctx, dest, "triangle", 220, 880, 0.28, g, now, 0.05);
  spawnNoise(ctx, dest, "bandpass", 500, 2600, 0.3, g * 0.6, now, 0.06, 1.2);
}

/**
 * Water entry splash (~0.3s): a bandpass noise sweep falling from bright spray to
 * a low slosh, plus a short high sprinkle tail. Non-positional like every other
 * SFX here; intensity (0..1) scales level and brightness.
 *
 * @param {number} intensity
 */
export function playWaterSplash(intensity = 0.5) {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const i = Math.min(Math.max(intensity, 0), 1);
  const g = (0.10 + i * 0.08) * vol;
  // * Body: spray falling into a slosh.
  spawnNoise(ctx, dest, "bandpass", 1800 + i * 600, 300, 0.26 + i * 0.08, g, now, 0.015);
  // * Droplet sprinkle riding above the body, slightly delayed.
  spawnNoise(ctx, dest, "highpass", 3200, 2400, 0.16, g * 0.45, now + 0.05, 0.02);
}

/**
 * Underwater detonation (~0.5s): deep sine boom with a pitch drop, a muffled
 * mid crack, and a low boil tail — the audio half of spawnWaterDeathBurst.
 */
export function playWaterDeathBoom() {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const g = 0.2 * vol;
  // * Core boom: pitch falls through the sub range.
  spawnTone(ctx, dest, "sine", 90, 38, 0.45, g, now, 0.012);
  // * Muffled crack: what a sharp transient sounds like through a water column.
  spawnNoise(ctx, dest, "bandpass", 900, 400, 0.12, g * 0.5, now, 0.005);
  // * Boil tail: low noise swell as the surface churns.
  spawnNoise(ctx, dest, "lowpass", 500, 220, 0.5, g * 0.4, now + 0.08, 0.09);
}

/**
 * Crowd reaction swell (~1s): layered filtered-noise "crowd" rising and falling —
 * the rave audience finally makes noise on KOs and wins. intensity 0..1 scales
 * level and length (1 = victory roar).
 *
 * @param {number} intensity
 */
export function playCrowdCheer(intensity = 0.6) {
  const p = resolvePlayback();
  if (!p) return;
  const { ctx, dest, vol, now } = p;
  const i = Math.min(Math.max(intensity, 0), 1);
  const g = (0.05 + i * 0.06) * vol;
  const dur = 0.7 + i * 0.5;
  // * Body of the crowd: broad mid noise swelling in and decaying.
  spawnNoise(ctx, dest, "bandpass", 900, 700, dur, g, now, dur * 0.3, 0.5);
  // * "Voices" layer: higher, brighter, slightly delayed.
  spawnNoise(ctx, dest, "bandpass", 2200, 1600, dur * 0.85, g * 0.6, now + 0.06, dur * 0.25, 0.8);
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
