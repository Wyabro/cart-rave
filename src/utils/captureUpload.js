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
      // * Keep the upload alive across soft navigations (menu return mid-send).
      keepalive: true,
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
