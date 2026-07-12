import { MSG } from "../../shared/protocol.js";
import {
  MAX_SNAPSHOT_TAIL_BYTES,
  MAX_TAIL_COLLISIONS,
  MAX_TAIL_FALLS,
} from "./p2pLimits.js";

// * Header: type(1) + numCarts(1) + pad(2) + seq(Uint32) + tHost(Float64) = 16 bytes.
// * tHost is absolute monotonic ms (~1e12); Float32 only has ~7 digits and quantizes
// * to ~42s steps, which breaks clock offset estimation and interpolation.
const HEADER_BYTES = 16;
const CART_BYTES = 52;
/** Max carts on the wire (matches room slot count). Rejects garbage numCarts bytes. */
const MAX_CARTS = 4;

/**
 * Coerce a wire float: keep finite numbers (including 0); else use fallback.
 * Do not use `||` — legitimate zeros (e.g. quaternion w=0 for 180° rotations) must survive.
 * @param {unknown} v
 * @param {number} [fallback=0]
 * @returns {number}
 */
function encodeF32(v, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Encodes a host state snapshot object into a hybrid binary payload.
 * @param {object} state
 * @returns {ArrayBuffer}
 */
export function encodeHostStateSnapshot(state) {
  const carts = state.carts || [];
  const numCarts = carts.length;
  
  const tailData = {
    collisions: state.collisions || [],
    falls: state.falls || [],
  };
  // * Active Living Store directive ({ id, r: remainingMs }) — rides every snapshot
  // * so a client that missed the one-shot MSG.directive (unreliable channel) or
  // * joined mid-window self-heals from the next 40Hz frame.
  if (state.dir) tailData.dir = state.dir;
  // * Compact kill-credit / combo ages for host migration (NET-MIG-1).
  if (state.attr) tailData.attr = state.attr;
  const jsonString = JSON.stringify(tailData);
  const jsonBytes = new TextEncoder().encode(jsonString);
  
  const bufferLength = HEADER_BYTES + (numCarts * CART_BYTES) + jsonBytes.byteLength;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);
  
  // Header: 16 bytes
  view.setUint8(0, 0); // Unused / type byte
  view.setUint8(1, numCarts);
  view.setUint8(2, 0); // Padding
  view.setUint8(3, 0); // Padding
  
  view.setUint32(4, (Number(state.seq) || 0) >>> 0, true);
  view.setFloat64(8, encodeF32(state.tHost, 0), true);
  
  let offset = HEADER_BYTES;
  for (let i = 0; i < numCarts; i++) {
    const c = carts[i] || {};
    
    const p = c.p ?? [0, 0, 0];
    view.setFloat32(offset, encodeF32(p[0]), true); offset += 4;
    view.setFloat32(offset, encodeF32(p[1]), true); offset += 4;
    view.setFloat32(offset, encodeF32(p[2]), true); offset += 4;
    
    const q = c.q ?? [0, 0, 0, 1];
    view.setFloat32(offset, encodeF32(q[0]), true); offset += 4;
    view.setFloat32(offset, encodeF32(q[1]), true); offset += 4;
    view.setFloat32(offset, encodeF32(q[2]), true); offset += 4;
    // * Identity default only when w is missing/non-finite — never coerce 0 → 1.
    view.setFloat32(offset, encodeF32(q[3], 1), true); offset += 4;
    
    const lv = c.lv ?? [0, 0, 0];
    view.setFloat32(offset, encodeF32(lv[0]), true); offset += 4;
    view.setFloat32(offset, encodeF32(lv[1]), true); offset += 4;
    view.setFloat32(offset, encodeF32(lv[2]), true); offset += 4;
    
    // * Yaw rate (av[1]) drives caster swivel / steer visuals on remote carts.
    // * Pitch (av[0]) and roll (av[2]) are near-zero under arcade physics.
    const av = c.av ?? [0, 0, 0];
    view.setFloat32(offset, encodeF32(av[1]), true); offset += 4;
    
    view.setUint32(offset, (Number(c.ackSeq) || 0) >>> 0, true); offset += 4;
    
    let flags = 0;
    if (c.b) flags |= 1;
    if (c.h) flags |= 2;
    if (c.c) flags |= 4;
    if (c.s) flags |= 8;
    view.setUint8(offset, flags); offset += 1;
    // 3 bytes padding
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 0); offset += 1;
  }
  
  // JSON tail (collisions/falls)
  new Uint8Array(buffer, offset).set(jsonBytes);
  
  return buffer;
}

function getSafeFloat32(view, offset, littleEndian) {
  const val = view.getFloat32(offset, littleEndian);
  return Number.isFinite(val) ? val : 0;
}

function getSafeFloat64(view, offset, littleEndian) {
  const val = view.getFloat64(offset, littleEndian);
  return Number.isFinite(val) ? val : 0;
}

/**
 * Decodes a hybrid binary payload back into a host state snapshot object.
 * @param {ArrayBuffer} buffer
 * @returns {object | null} Decoded snapshot, or null if the buffer is truncated/malformed.
 */
export function decodeHostStateSnapshot(buffer) {
  if (!buffer || buffer.byteLength < HEADER_BYTES) {
    console.error("[binary] Buffer too small for header:", buffer?.byteLength ?? 0);
    return null;
  }

  const view = new DataView(buffer);
  const numCarts = view.getUint8(1);
  if (numCarts > MAX_CARTS) {
    console.error("[binary] Invalid cart count:", numCarts);
    return null;
  }

  const expectedMinBytes = HEADER_BYTES + numCarts * CART_BYTES;
  if (buffer.byteLength < expectedMinBytes) {
    console.error(
      "[binary] Buffer too small for cart count. Expected:",
      expectedMinBytes,
      "Got:",
      buffer.byteLength,
    );
    return null;
  }

  const seq = view.getUint32(4, true);
  const tHost = getSafeFloat64(view, 8, true);
  
  const carts = [];
  let offset = HEADER_BYTES;
  for (let i = 0; i < numCarts; i++) {
    const pX = getSafeFloat32(view, offset, true); offset += 4;
    const pY = getSafeFloat32(view, offset, true); offset += 4;
    const pZ = getSafeFloat32(view, offset, true); offset += 4;
    
    const qX = getSafeFloat32(view, offset, true); offset += 4;
    const qY = getSafeFloat32(view, offset, true); offset += 4;
    const qZ = getSafeFloat32(view, offset, true); offset += 4;
    const qW = getSafeFloat32(view, offset, true); offset += 4;
    
    const lvX = getSafeFloat32(view, offset, true); offset += 4;
    const lvY = getSafeFloat32(view, offset, true); offset += 4;
    const lvZ = getSafeFloat32(view, offset, true); offset += 4;
    
    const avY = getSafeFloat32(view, offset, true); offset += 4;
    const ackSeq = view.getUint32(offset, true); offset += 4;
    
    const flags = view.getUint8(offset); offset += 1;
    offset += 3; // padding
    
    // Reconstruct the object to match the original JSON structure
    carts.push({
      p: [pX, pY, pZ],
      q: [qX, qY, qZ, qW],
      lv: [lvX, lvY, lvZ],
      av: [0, avY, 0], // Yaw only; pitch/roll unused by arcade remote visuals
      ackSeq: ackSeq,
      b: (flags & 1) === 1,
      h: (flags & 2) === 2,
      c: (flags & 4) === 4,
      s: (flags & 8) === 8,
    });
  }
  
  // Decode JSON tail (collisions/falls/dir/attr). The tail rides the unreliable P2P
  // DataChannel from a semi-trusted host and is parsed every frame, so it is size- and
  // count-capped (see p2pLimits). An over-limit or malformed tail is dropped; the cart
  // transforms above are fixed-size and always kept, so the sim still advances.
  let collisions = [];
  let falls = [];
  let dir = null;
  let attr = null;
  if (offset < buffer.byteLength) {
    const tailBytes = new Uint8Array(buffer, offset);
    if (tailBytes.byteLength > MAX_SNAPSHOT_TAIL_BYTES) {
      console.warn("[binary] Oversized JSON tail dropped:", tailBytes.byteLength);
    } else {
      const jsonTail = new TextDecoder().decode(tailBytes);
      try {
        const parsed = JSON.parse(jsonTail);
        collisions = Array.isArray(parsed.collisions)
          ? parsed.collisions.slice(0, MAX_TAIL_COLLISIONS)
          : [];
        falls = Array.isArray(parsed.falls) ? parsed.falls.slice(0, MAX_TAIL_FALLS) : [];
        dir = parsed.dir || null;
        attr = parsed.attr && typeof parsed.attr === "object" ? parsed.attr : null;
      } catch (e) {
        console.error("[binary] Failed to parse JSON tail", e);
      }
    }
  }

  return {
    // * Must equal the shared protocol constant so the receiver's dispatcher
    // * (handleRemoteP2PMessage) routes decoded binary snapshots to handleRemoteHostState.
    type: MSG.hostTransform,
    seq,
    tHost,
    carts,
    collisions,
    falls,
    dir,
    attr,
  };
}
