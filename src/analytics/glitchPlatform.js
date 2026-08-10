/**
 * glitchPlatform.js — Glitch install / validate / heartbeat / GameEvent client.
 *
 * Uses exact routes from Glitch Technical + Reports docs. Title token only
 * (never deploy token). Opt-out mirrors cartRaveAnalytics. Failures never break play.
 */

import {
  GLITCH_API_BASE,
  GLITCH_BUILD_TYPE,
  GLITCH_GAME_VERSION,
  GLITCH_TITLE_ID,
  getGlitchTitleToken,
} from "./glitchConfig.js";
import { isAnalyticsOptedOut } from "./analytics.js";
import { STORAGE_KEYS, storageGet, storageSet } from "../utils/storage.js";

const HEARTBEAT_MS = 30_000;
const TITLE_PATH = `${GLITCH_API_BASE}/titles/${GLITCH_TITLE_ID}`;

/** @type {string | null} */
let installId = null;
/** @type {string | null} */
let userInstallId = null;
/** @type {string | null} */
let sessionId = null;
/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatTimer = null;
let started = false;

function newId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  return `cc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readLaunchParams() {
  try {
    const q = new URLSearchParams(window.location.search || "");
    return {
      install_id: q.get("install_id") || null,
      user_install_id: q.get("user_install_id") || null,
      session_id: q.get("session_id") || null,
    };
  } catch {
    return { install_id: null, user_install_id: null, session_id: null };
  }
}

function deviceSnapshot() {
  const touch =
    typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0;
  return {
    platform: "web",
    device_type: touch ? "mobile" : "desktop",
    operating_system:
      typeof navigator !== "undefined"
        ? String(
            navigator.platform ||
              /** @type {any} */ (navigator).userAgentData?.platform ||
              "browser",
          ).slice(0, 255)
        : "browser",
  };
}

function enabled() {
  if (typeof window === "undefined") return false;
  if (isAnalyticsOptedOut()) return false;
  return Boolean(getGlitchTitleToken());
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: Record<string, unknown> }} [opts]
 */
async function glitchFetch(path, opts = {}) {
  const token = getGlitchTitleToken();
  if (!token) throw new Error("missing title token");
  const res = await fetch(path, {
    method: opts.method || "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    keepalive: opts.method === "POST",
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json };
}

function installBody() {
  const device = deviceSnapshot();
  /** @type {Record<string, unknown>} */
  const body = {
    user_install_id: userInstallId,
    platform: device.platform,
    device_type: device.device_type,
    operating_system: device.operating_system,
    game_version: GLITCH_GAME_VERSION,
    build_type: GLITCH_BUILD_TYPE,
    session_id: sessionId,
    device_id: storageGet(STORAGE_KEYS.clientId) || undefined,
  };
  return body;
}

async function createOrHeartbeatInstall() {
  const { res, json } = await glitchFetch(`${TITLE_PATH}/installs`, {
    body: installBody(),
  });
  if (!res.ok) {
    const err = new Error(`glitch install HTTP ${res.status}`);
    /** @type {any} */ (err).status = res.status;
    /** @type {any} */ (err).json = json;
    throw err;
  }
  const id = json?.data?.id;
  if (typeof id === "string" && id) {
    installId = id;
    storageSet(STORAGE_KEYS.glitchInstallId, id);
  }
  return installId;
}

async function validateInstall(id) {
  const { res, json } = await glitchFetch(`${TITLE_PATH}/installs/${id}/validate`, {
    body: {},
  });
  if (res.status === 404 || json?.reason === "INSTALL_NOT_FOUND" || json?.code === "INSTALL_NOT_FOUND") {
    return { valid: false, reason: "INSTALL_NOT_FOUND", raw: json };
  }
  if (!res.ok) {
    return { valid: false, reason: json?.reason || json?.code || `HTTP_${res.status}`, raw: json };
  }
  return {
    valid: Boolean(json?.valid),
    reason: json?.reason || json?.code || null,
    raw: json,
  };
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void createOrHeartbeatInstall().catch(() => {});
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer != null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Boot Glitch identity: reuse Desktop App query ids when present, else localStorage.
 * @returns {Promise<{ installId: string | null, valid: boolean | null }>}
 */
export async function installGlitchPlatform() {
  if (started) return { installId, valid: installId ? true : null };
  started = true;
  if (!enabled()) return { installId: null, valid: null };

  const launch = readLaunchParams();
  userInstallId =
    launch.user_install_id ||
    storageGet(STORAGE_KEYS.glitchUserInstallId) ||
    storageGet(STORAGE_KEYS.clientId) ||
    newId();
  storageSet(STORAGE_KEYS.glitchUserInstallId, userInstallId);

  sessionId = launch.session_id || newId();
  storageSet(STORAGE_KEYS.glitchSessionId, sessionId);

  if (launch.install_id) {
    installId = launch.install_id;
    storageSet(STORAGE_KEYS.glitchInstallId, installId);
  } else {
    installId = storageGet(STORAGE_KEYS.glitchInstallId);
  }

  try {
    await createOrHeartbeatInstall();
    if (!installId) return { installId: null, valid: null };

    let check = await validateInstall(installId);
    if (!check.valid && check.reason === "INSTALL_NOT_FOUND") {
      storageSet(STORAGE_KEYS.glitchInstallId, "");
      try {
        localStorage.removeItem(STORAGE_KEYS.glitchInstallId);
      } catch { /* ignore */ }
      installId = null;
      await createOrHeartbeatInstall();
      if (installId) check = await validateInstall(installId);
    }
    // * Free browser jam: soft-fail access denials (toast path optional). Still heartbeat.
    if (check.valid === false && check.reason && check.reason !== "INSTALL_NOT_FOUND") {
      try {
        window.CartRave?.showToast?.(`Glitch access: ${check.reason}`, 5000);
      } catch { /* ignore */ }
    }
    startHeartbeat();

    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void createOrHeartbeatInstall().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => {
      stopHeartbeat();
      void createOrHeartbeatInstall().catch(() => {});
    });

    return { installId, valid: check.valid };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[glitch] platform init failed", err?.message || err);
    return { installId, valid: null };
  }
}

/**
 * POST /titles/{id}/events — requires game_install_id from create install.
 * @param {string} stepKey
 * @param {string} actionKey
 * @param {Record<string, unknown>} [metadata]
 * @param {{ step_label?: string, event_label?: string }} [labels]
 * @returns {Promise<boolean>}
 */
export async function trackGlitchGameEvent(stepKey, actionKey, metadata, labels) {
  if (!enabled() || !installId) return false;
  try {
    /** @type {Record<string, unknown>} */
    const body = {
      game_install_id: installId,
      step_key: String(stepKey).slice(0, 100),
      action_key: String(actionKey).slice(0, 100),
      event_timestamp: new Date().toISOString(),
    };
    if (labels?.step_label) body.step_label = String(labels.step_label).slice(0, 255);
    if (labels?.event_label) body.event_label = String(labels.event_label).slice(0, 255);
    if (metadata && typeof metadata === "object") body.metadata = metadata;
    const { res } = await glitchFetch(`${TITLE_PATH}/events`, { body });
    return res.ok;
  } catch {
    return false;
  }
}
