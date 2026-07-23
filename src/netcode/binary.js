import { MSG } from "../../shared/protocol.js";
import {
  MAX_SNAPSHOT_TAIL_BYTES,
  MAX_TAIL_COLLISIONS,
  MAX_TAIL_FALLS,
} from "./p2pLimits.js";

/** Reused across 40 Hz host encode — avoids per-tick TextEncoder allocation. */
const _textEncoder = new TextEncoder();
/** Reused across 40 Hz client decode — avoids per-tick TextDecoder allocation. */
const _textDecoder = new TextDecoder();
/** Scratch tail object for JSON.stringify — mutated in place each encode. */
const _tailScratch = { collisions: /** @type {unknown[]} */ ([]), falls: /** @type {unknown[]} */ ([]) };

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

  // * Most 40 Hz frames carry no collisions/falls/directive/attribution — skip the
  // * stringify+encode (and the client's parse) entirely instead of shipping
  // * `{"collisions":[],"falls":[]}` every tick. The decoder already treats a
  // * missing tail as empty. Steady-state GC churn on BOTH peers, not a feature.
  const hasTail =
    (state.collisions?.length ?? 0) > 0 ||
    (state.falls?.length ?? 0) > 0 ||
    !!state.dir ||
    !!state.attr;
  /** @type {Uint8Array | null} */
  let jsonBytes = null;
  if (hasTail) {
    _tailScratch.collisions = state.collisions || [];
    _tailScratch.falls = state.falls || [];
    // * Active Living Store directive ({ id, r: remainingMs }) — rides every snapshot
    // * so a client that missed the one-shot MSG.directive (unreliable channel) or
    // * joined mid-window self-heals from the next 40Hz frame.
    if (state.dir) _tailScratch.dir = state.dir;
    else delete _tailScratch.dir;
    // * Compact kill-credit / combo ages for host migration (NET-MIG-1).
    if (state.attr) _tailScratch.attr = state.attr;
    else delete _tailScratch.attr;
    jsonBytes = _textEncoder.encode(JSON.stringify(_tailScratch));
  }

  const bufferLength = HEADER_BYTES + (numCarts * CART_BYTES) + (jsonBytes ? jsonBytes.byteLength : 0);
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
    if (c.ch) flags |= 16;
    view.setUint8(offset, flags); offset += 1;
    // * Padding[0] = life cargo points (CARGO-WT-1); remaining two bytes reserved.
    const lc = Math.max(0, Math.min(255, Number(c.lc) || 0)) | 0;
    view.setUint8(offset, lc); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 0); offset += 1;
  }
  
  // JSON tail (collisions/falls) — only when there is actual tail payload.
  if (jsonBytes) new Uint8Array(buffer, offset).set(jsonBytes);

  return buffer;
}

// * ---- Decode-side snapshot ring pool (run-4 "stuttery mess" fix) ----
// * A non-host decodes 40 snapshots/sec and netcode's interp buffer retains up to
// * CONFIG.net.stateBufferMaxSize (64) of them (~1.6s at 40Hz). Freshly-allocated decode
// * output therefore SURVIVES the GC nursery, is promoted, and becomes steady old-gen
// * garbage — the periodic ~67ms major-GC pause visible every ~1.1s in the 07-18 run-4
// * non-host video. Reusing a fixed ring larger than the retention window removes the
// * promoted churn entirely (encode side was already pooled; decode was not).
// * Ring size 96 = 64 (interp-buffer cap) + 32 snapshots (~0.8s) of slack for transient
// * refs (lastCartsCache, snapshot-pair scratch, same-frame reconcile reads). Consumers
// * must treat decoded snapshots as immutable — entries are recycled in arrival order.
const DECODE_RING_SIZE = 96;
/** @type {Array<{snap: any, cartPool: any[]}>} */
const _decodeRing = [];
let _decodeRingIdx = 0;

function nextDecodeRingEntry() {
  let entry = _decodeRing[_decodeRingIdx];
  if (!entry) {
    const cartPool = [];
    for (let i = 0; i < MAX_CARTS; i++) {
      cartPool.push({
        p: [0, 0, 0],
        q: [0, 0, 0, 1],
        lv: [0, 0, 0],
        av: [0, 0, 0], // Yaw only; pitch/roll unused by arcade remote visuals
        ackSeq: 0,
        b: false,
        h: false,
        c: false,
        s: false,
        ch: false,
        lc: 0,
      });
    }
    entry = {
      snap: {
        // * Must equal the shared protocol constant so the receiver's dispatcher
        // * (handleRemoteP2PMessage) routes decoded binary snapshots to handleRemoteHostState.
        type: MSG.hostTransform,
        seq: 0,
        tHost: 0,
        carts: [],
        collisions: [],
        falls: [],
        dir: null,
        attr: null,
      },
      cartPool,
    };
    _decodeRing[_decodeRingIdx] = entry;
  }
  _decodeRingIdx = (_decodeRingIdx + 1) % DECODE_RING_SIZE;
  return entry;
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

  const ringEntry = nextDecodeRingEntry();
  const carts = ringEntry.snap.carts;
  carts.length = 0;
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
    const lc = view.getUint8(offset); offset += 1;
    offset += 2; // remaining padding
    
    // Refill the pooled cart record in place (same shape as the original JSON structure).
    const cart = ringEntry.cartPool[i];
    cart.p[0] = pX; cart.p[1] = pY; cart.p[2] = pZ;
    cart.q[0] = qX; cart.q[1] = qY; cart.q[2] = qZ; cart.q[3] = qW;
    cart.lv[0] = lvX; cart.lv[1] = lvY; cart.lv[2] = lvZ;
    cart.av[1] = avY;
    cart.ackSeq = ackSeq;
    cart.b = (flags & 1) === 1;
    cart.h = (flags & 2) === 2;
    cart.c = (flags & 4) === 4;
    cart.s = (flags & 8) === 8;
    cart.ch = (flags & 16) === 16;
    cart.lc = lc;
    carts.push(cart);
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
      const jsonTail = _textDecoder.decode(tailBytes);
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

  // * Tail arrays (collisions/falls) stay freshly-parsed/allocated: they are processed
  // * on arrival and never retained by the interp buffer, so they die young in the
  // * nursery — only the retained cart transforms needed pooling.
  const snap = ringEntry.snap;
  snap.seq = seq;
  snap.tHost = tHost;
  snap.collisions = collisions;
  snap.falls = falls;
  snap.dir = dir;
  snap.attr = attr;
  return snap;
}
