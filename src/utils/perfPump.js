/**
 * perfPump.js — dev-only hidden-tab frame pump for headless profiling.
 *
 * Chromium stops firing requestAnimationFrame in hidden tabs, which freezes the
 * whole game loop and makes automated profiling (e.g. from a devtools/console
 * driver against a background preview pane) impossible. When the page is loaded
 * with `?perfPump` in DEV, this shims rAF with an unthrottled MessageChannel
 * task loop gated to ~60 Hz, so the game keeps stepping while hidden.
 *
 * Never active in production builds (dead-code-eliminated via import.meta.env.DEV)
 * and inert without the query flag.
 *
 * Self-installs at import time (must evaluate before any module captures a
 * reference to requestAnimationFrame, e.g. animejs) — import it first in main.js.
 *
 * @returns {boolean} true if the pump was installed
 */
function installPerfPumpIfRequested() {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  if (!new URLSearchParams(window.location.search).has("perfPump")) return false;

  const FRAME_MS = 16.6;
  /** @type {Array<FrameRequestCallback>} */
  let queue = [];
  let nextId = 1;
  /** @type {Map<number, FrameRequestCallback>} */
  const pending = new Map();
  let lastFrame = performance.now();

  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    const now = performance.now();
    if (now - lastFrame >= FRAME_MS && pending.size > 0) {
      lastFrame = now;
      const batch = [...pending.values()];
      pending.clear();
      for (const cb of batch) {
        try {
          cb(now);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[perfPump] rAF callback threw:", err);
        }
      }
    }
    channel.port2.postMessage(null);
  };
  channel.port2.postMessage(null);

  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };

  // eslint-disable-next-line no-console
  console.warn("[perfPump] hidden-tab frame pump active (~60Hz MessageChannel rAF shim)");
  return true;
}

installPerfPumpIfRequested();
