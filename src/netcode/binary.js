const HEADER_BYTES = 12;
const CART_BYTES = 52;

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
  const jsonString = JSON.stringify(tailData);
  const jsonBytes = new TextEncoder().encode(jsonString);
  
  const bufferLength = HEADER_BYTES + (numCarts * CART_BYTES) + jsonBytes.byteLength;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);
  
  // Header: 12 bytes
  view.setUint8(0, 0); // Unused / type byte
  view.setUint8(1, numCarts);
  view.setUint8(2, 0); // Padding
  view.setUint8(3, 0); // Padding
  
  view.setUint32(4, state.seq || 0, true);
  view.setFloat32(8, state.tHost || 0, true);
  
  let offset = HEADER_BYTES;
  for (let i = 0; i < numCarts; i++) {
    const c = carts[i] || {};
    
    const p = c.p || [0, 0, 0];
    view.setFloat32(offset, p[0] || 0, true); offset += 4;
    view.setFloat32(offset, p[1] || 0, true); offset += 4;
    view.setFloat32(offset, p[2] || 0, true); offset += 4;
    
    const q = c.q || [0, 0, 0, 1];
    view.setFloat32(offset, q[0] || 0, true); offset += 4;
    view.setFloat32(offset, q[1] || 0, true); offset += 4;
    view.setFloat32(offset, q[2] || 0, true); offset += 4;
    view.setFloat32(offset, q[3] || 1, true); offset += 4;
    
    const lv = c.lv || [0, 0, 0];
    view.setFloat32(offset, lv[0] || 0, true); offset += 4;
    view.setFloat32(offset, lv[1] || 0, true); offset += 4;
    view.setFloat32(offset, lv[2] || 0, true); offset += 4;
    
    const av = c.av || [0, 0, 0];
    view.setFloat32(offset, av[0] || 0, true); offset += 4;
    
    const ackSeq = c.ackSeq || 0;
    view.setFloat32(offset, ackSeq, true); offset += 4;
    
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

// Add this helper function above decodeHostStateSnapshot
function getSafeFloat32(view, offset, littleEndian) {
  const val = view.getFloat32(offset, littleEndian);
  return Number.isFinite(val) ? val : 0;
}

/**
 * Decodes a hybrid binary payload back into a host state snapshot object.
 * @param {ArrayBuffer} buffer
 * @returns {object}
 */
export function decodeHostStateSnapshot(buffer) {
  const view = new DataView(buffer);
  const numCarts = view.getUint8(1);
  const seq = view.getUint32(4, true);
  const tHost = getSafeFloat32(view, 8, true);
  
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
    
    const avX = getSafeFloat32(view, offset, true); offset += 4;
    const ackSeq = getSafeFloat32(view, offset, true); offset += 4;
    
    const flags = view.getUint8(offset); offset += 1;
    offset += 3; // padding
    
    // Reconstruct the object to match the original JSON structure
    carts.push({
      p: [pX, pY, pZ],
      q: [qX, qY, qZ, qW],
      lv: [lvX, lvY, lvZ],
      av: [avX, 0, 0], // Assume Y and Z angvel are 0 for arcade physics
      ackSeq: ackSeq,
      b: (flags & 1) === 1,
      h: (flags & 2) === 2,
      c: (flags & 4) === 4,
      s: (flags & 8) === 8,
    });
  }
  
  // Decode JSON tail
  let collisions = [];
  let falls = [];
  if (offset < buffer.byteLength) {
    const tailBytes = new Uint8Array(buffer, offset);
    const jsonTail = new TextDecoder().decode(tailBytes);
    try {
      const parsed = JSON.parse(jsonTail);
      collisions = parsed.collisions || [];
      falls = parsed.falls || [];
    } catch (e) {
      console.error("[binary] Failed to parse JSON tail", e);
    }
  }
  
  return {
    type: "hostTransform", // Ensure this matches MSG.hostTransform
    seq,
    tHost,
    carts,
    collisions,
    falls
  };
}
