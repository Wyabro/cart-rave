// audio.js — modular audio interface/delegates

let _sfx = null;
let _crowd = null;
let _leaderHum = null;

export function registerAudioRefs(refs) {
  if (refs.sfx !== undefined) _sfx = refs.sfx;
  if (refs.crowd !== undefined) _crowd = refs.crowd;
  if (refs.leaderHum !== undefined) _leaderHum = refs.leaderHum;
}

export function playCollision(intensity) {
  _sfx?.playCollision?.(intensity);
}

export function playNitro() {
  _sfx?.playNitro?.();
}

export function playHop() {
  _sfx?.playHop?.();
}

export function playFallOff() {
  _sfx?.playFallOff?.();
}

export function playWheelScreech(intensity) {
  _sfx?.playWheelScreech?.(intensity);
}

export function bumpCrowd() {
  _crowd?.bump?.();
}

export function ensureCrowdStarted() {
  _crowd?.ensureStarted?.();
}

export function applyAmbientCrowd() {
  _crowd?.applyAmbient?.();
}

export function resyncLeaderHumVolume() {
  _leaderHum?.resyncVolume?.();
}

export function setLeader(slotIndex) {
  _leaderHum?.setLeader?.(slotIndex);
}

export function updateLeaderHumPosition(cart) {
  _leaderHum?.updatePositionFromCart?.(cart);
}
