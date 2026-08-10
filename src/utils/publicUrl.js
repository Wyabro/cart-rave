/**
 * publicUrl.js — Resolve static files from `public/` for dual hosting.
 *
 * Cloudflare serves the game at the domain root (`/models/...` works).
 * Glitch iframe builds live under a nested CDN prefix
 * (`…/builds/<id>/index.html`), so root-absolute `/models/...` 403s and the
 * customize preview falls back to a purple placeholder / legacy cart.
 *
 * Always resolve against the directory of the current page URL.
 */

/**
 * @param {string} path  Public path, with or without a leading slash
 *   (e.g. `models/cartrave4-draco.glb` or `/draco/gltf/`).
 * @param {string} [baseHref] Optional page URL (tests); defaults to `location.href`.
 * @returns {string} Absolute URL safe for fetch / Three loaders / Howler.
 */
export function publicUrl(path, baseHref) {
  const raw = String(path ?? "");
  const wantSlash = raw.endsWith("/");
  const rel = raw.replace(/^\//, "");
  const href =
    baseHref ||
    (typeof window !== "undefined" && window.location?.href ? window.location.href : "");
  if (!href) {
    return wantSlash ? `/${rel}` : `/${rel}`;
  }
  try {
    const base = new URL(".", href);
    let out = new URL(rel, base).href;
    if (wantSlash && !out.endsWith("/")) out += "/";
    return out;
  } catch {
    return wantSlash ? `/${rel}` : `/${rel}`;
  }
}
