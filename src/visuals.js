// visuals.js — cart visual updates + misc visual helpers

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { updateCartVisuals as _updateCartVisuals, resetCartVisualState as _resetCartVisualState } from "../cart.js";

export { _updateCartVisuals as updateCartVisuals, _resetCartVisualState as resetCartVisualState };

const _v = new THREE.Vector3();

export function updateAmbientParticles(geometry, count, radius, height, drift, dt, nowMs) {
  const positions = geometry.attributes.position.array;
  const nowSec = nowMs * 0.001;

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const d = i * 4;
    const wave = Math.sin(nowSec * 0.55 + drift[d + 3]) * 0.04;

    positions[p]     += (drift[d] + wave) * dt;
    positions[p + 1] += drift[d + 1] * dt;
    positions[p + 2] += (drift[d + 2] - wave) * dt;

    const x = positions[p];
    const z = positions[p + 2];
    const r = Math.hypot(x, z);

    if (r > radius) {
      const scale = -radius / r;
      positions[p] = x * scale;
      positions[p + 2] = z * scale;
    }
    if (positions[p + 1] > height) positions[p + 1] = 0;
    if (positions[p + 1] < 0) positions[p + 1] = height;
  }
  geometry.attributes.position.needsUpdate = true;
}