// errorReporter.js — Lightweight production error forwarder to a Cloudflare Worker endpoint.

import { recordDiagEvent } from "./diagnostics.js";

/**
 * Packages an error and optional context into a JSON payload and POSTs it to
 * `/api/log-error` using sendBeacon or a keepalive fetch as a fallback.
 * Network errors are silently swallowed so this never breaks the caller.
 *
 * @param {Error | unknown} error
 * @param {Record<string, unknown>} [context]
 */
function sendErrorLog(error, context = {}) {
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

    // * DEV is served by Vite (:3000); the Worker's /api/log-error route only exists on
    // * the wrangler origin, so a relative POST 404s — and during a hot per-frame error
    // * loop that 404 floods the console (masking the real stack). The full error is
    // * already in DevTools in dev, so skip the network hop. Prod is same-origin with the
    // * Worker, so the beacon lands and persists (party/index.ts → errorLog.ts).
    if (import.meta.env.DEV) return;

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

// * Runtime error forwarding — the inline index.html handlers only cover the boot
// * phase (they bail once __cartRaveBootstrapped is set), so without this, errors
// * outside the game loop are never reported in production.

/** Max reports per page load — a hot error loop must not beacon-flood the Worker. */
const MAX_REPORTS_PER_SESSION = 20;
/** Same message+context is reported at most once per window. */
const DEDUPE_WINDOW_MS = 60000;

let reportsSent = 0;
/** @type {Map<string, number>} message key → last sent timestamp */
const recentReports = new Map();

/**
 * Rate-limited wrapper around {@link sendErrorLog} for global handlers and the game
 * loop's catch — a poisoned wasm world re-throws every frame, so the raw sender would
 * beacon-flood the Worker (self-DoS) and bury the first diagnostic report. This caps at
 * {@link MAX_REPORTS_PER_SESSION} and dedupes identical message+context within a window.
 * @param {Error | unknown} error
 * @param {Record<string, unknown>} [context]
 */
export function sendErrorLogLimited(error, context = {}) {
  if (reportsSent >= MAX_REPORTS_PER_SESSION) return;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const key = `${context.context ?? ""}:${message}`.slice(0, 300);
  const now = Date.now();
  const lastSent = recentReports.get(key);
  if (lastSent != null && now - lastSent < DEDUPE_WINDOW_MS) return;
  recentReports.set(key, now);
  reportsSent += 1;
  sendErrorLog(error, context);
}

/** Wired once from main() so menu/UI/async errors reach /api/log-error too. */
export function installGlobalErrorReporting() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (ev) => {
    // * Resource load errors (script/img/audio) surface as events on the target
    // * with no error object — the boot handlers in index.html own those.
    if (!(ev instanceof ErrorEvent)) return;
    // * Diag mirror (no-op without ?diag): page errors land on the "error" channel so
    // * capture bundles and the harness "zero errors" checks see them — the beacon path
    // * below skips DEV entirely, so this is the only trace a rig gets.
    recordDiagEvent("error", "window-error", {
      message: ev.message?.slice?.(0, 300) ?? String(ev.message ?? ""),
      source: `${ev.filename ?? ""}:${ev.lineno ?? 0}`,
    });
    sendErrorLogLimited(ev.error ?? ev.message, {
      context: "windowError",
      source: `${ev.filename ?? ""}:${ev.lineno ?? 0}`,
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason ?? "");
    recordDiagEvent("error", "unhandled-rejection", { message: reason.slice(0, 300) });
    sendErrorLogLimited(ev.reason, { context: "unhandledRejection" });
  });
}

// * Expose globally so boot-time inline scripts in index.html can also forward
// * errors after the module graph has loaded.
if (typeof window !== "undefined") {
  window.__cartRaveSendErrorLog = sendErrorLog;
}
