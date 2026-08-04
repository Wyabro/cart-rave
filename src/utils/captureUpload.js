/**
 * captureUpload.js — POST an F8 / ?diag capture bundle to /api/captures.
 *
 * Both playtest machines hit the same Worker endpoint so the agent can pull with
 * `npm run captures:pull` instead of emailing JSON between PCs. Fire-and-forget:
 * never blocks the capture hotkey; failures only console.warn.
 */

const ENDPOINT = "/api/captures";

/**
 * @param {Record<string, unknown>} bundle  __ccDiag.captureBundle() result
 * @param {{ label?: string }} [opts]
 * @returns {Promise<{ ok: boolean, id?: number, error?: string }>}
 */
export async function uploadCaptureBundle(bundle, opts = {}) {
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, error: "no_bundle" };
  }
  const label =
    (typeof opts.label === "string" && opts.label.trim()) ||
    deriveDefaultLabel(bundle);

  const envelope = {
    label,
    clientTs: Date.now(),
    url: typeof location !== "undefined" ? location.href : "",
    body: JSON.stringify(bundle),
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      // ! NO `keepalive` — Chrome enforces a hard ~64 KiB inflight body cap on keepalive
      // ! requests and rejects the fetch outright above it. Across 251 pulled bundles the
      // ! largest envelope that ever landed was 65,179 bytes: the distribution was clipped
      // ! exactly at the ceiling, i.e. every bigger capture was silently lost. Captures are
      // ! never fired during page unload, so there is nothing to keep alive.
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `http_${res.status}` };
    }
    return { ok: true, id: Number(data.id) || undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network" };
  }
}

/**
 * URL params that MUST survive a return-to-menu navigation. Those paths rebuild the
 * location down to a bare pathname, which drops `?diag` — and without `?diag` the F8
 * listener is never installed again, so captures are silently dead for the rest of the
 * session. `room` is deliberately NOT carried: those paths clear it on purpose and
 * reattaching it causes rejoin ghosts.
 */
const MENU_RETURN_CARRY_PARAMS = ["diag", "captureLabel"];

/**
 * Build the href a "back to menu" navigation should use: the bare pathname plus only the
 * diag-carrying params. Never carries `room`.
 * @param {string} href Current location href.
 * @returns {string}
 */
export function menuReturnHref(href) {
  try {
    const url = new URL(href);
    const kept = new URLSearchParams();
    for (const key of MENU_RETURN_CARRY_PARAMS) {
      const value = url.searchParams.get(key);
      if (value !== null) kept.set(key, value);
    }
    const query = kept.toString();
    return query ? `${url.pathname}?${query}` : url.pathname;
  } catch {
    return typeof href === "string" ? href : "/";
  }
}

/**
 * Prefer a short human label: phase + host/nonhost + tier.
 * @param {Record<string, unknown>} bundle
 */
/** @param {Record<string, unknown>} bundle */
export function deriveDefaultLabel(bundle) {
  const phase = typeof bundle.phase === "string" ? bundle.phase : "nophase";
  const snap = /** @type {Record<string, unknown>|null} */ (bundle.snapshot ?? null);
  const net = /** @type {Record<string, unknown>|null} */ (snap?.net ?? null);
  const runtime = /** @type {Record<string, unknown>|null} */ (snap?.runtime ?? null);
  const role = net?.isHost === true ? "host" : net?.isHost === false ? "nonhost" : "role?";
  const tier = typeof runtime?.qualityTier === "string" ? runtime.qualityTier : "tier?";
  return `${phase}-${role}-${tier}`;
}
