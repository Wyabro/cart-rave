// assetCache.js — Cache-Control policy for static assets served via the ASSETS binding.
//
// Hashed Vite bundles under /assets/ are immutable forever; fixed-name models/sounds/
// fonts/images use a short TTL + SWR so a deploy refreshes them within ~1h.

/**
 * Returns the Cache-Control value for a pathname, or null when the path should
 * keep whatever headers the ASSETS binding already set (no override).
 *
 * @param {string} path URL pathname (e.g. "/models/cart.glb")
 * @returns {string | null}
 */
export function assetCacheControlForPath(path) {
  // * Hashed Vite output: assets/index-Ab12CdEf.js, assets/animejs-DvbCZ-VV.js.map.
  // * Separator is `-` (Vite default); hash alphabet is base64url-ish, not hex-only.
  if (/^\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(js|css|mjs|wasm)(\.map)?$/i.test(path)) {
    return "public, max-age=31536000, immutable";
  }
  if (
    /^\/(models|sounds|draco|fonts)\//i.test(path) ||
    /\.(glb|wasm|ogg|mp3|png|ico|webmanifest|woff2?)$/i.test(path)
  ) {
    return "public, max-age=3600, stale-while-revalidate=300";
  }
  return null;
}
