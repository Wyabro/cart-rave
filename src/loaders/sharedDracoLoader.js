/**
 * sharedDracoLoader.js — Single DRACOLoader singleton for the whole client.
 *
 * cartRaveGltf and groceryPool both decode Draco GLBs; sharing one loader avoids
 * duplicate WASM fetches and parallel worker pools.
 */

import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { publicUrl } from "../utils/publicUrl.js";

/** WASM/JS Draco decoder served from `public/draco/gltf/` (base-aware for Glitch CDN). */
const DRACO_DECODER_PATH = "draco/gltf/";

/** @type {DRACOLoader | null} */
let _dracoLoader = null;

/** @returns {DRACOLoader} */
export function getSharedDracoLoader() {
  if (!_dracoLoader) {
    _dracoLoader = new DRACOLoader();
    _dracoLoader.setDecoderPath(publicUrl(DRACO_DECODER_PATH));
    _dracoLoader.setWorkerLimit(
      Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1)),
    );
    // * Preload wasm + worker source once (parallel with first GLB fetch).
    _dracoLoader.preload();
  }
  return _dracoLoader;
}
