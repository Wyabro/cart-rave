// errorReporter.js — Lightweight production error forwarder to a Cloudflare Worker endpoint.

/**
 * Packages an error and optional context into a JSON payload and POSTs it to
 * `/api/log-error` using sendBeacon or a keepalive fetch as a fallback.
 * Network errors are silently swallowed so this never breaks the caller.
 *
 * @param {Error | unknown} error
 * @param {Record<string, unknown>} [context]
 */
export function sendErrorLog(error, context = {}) {
  try {
    const payload = {
      message: error instanceof Error ? error.message : String(error ?? ""),
      stack: error instanceof Error ? error.stack ?? null : null,
      context,
      timestamp: Date.now(),
      userAgent: navigator.userAgent.slice(0, 256),
      url: location.href.slice(0, 512),
    };

    const body = JSON.stringify(payload);
    const endpoint = "/api/log-error";

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // * Never throw from the error reporter itself.
  }
}

// * Expose globally so boot-time inline scripts in index.html can also forward
// * errors after the module graph has loaded.
if (typeof window !== "undefined") {
  window.__cartRaveSendErrorLog = sendErrorLog;
}
