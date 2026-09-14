/**
 * glitchPlatform.js — Glitch install / validate / heartbeat / GameEvent client.
 *
 * Runtime title-token routes only. Never call token CRUD, retention reports,
 * or other admin-JWT endpoints from the shipped client. Failures never break
 * play (free jam on cartclash.lol). Opt-out mirrors cartRaveAnalytics.
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
/** @type {{ valid: boolean, reason: string | null, raw: unknown } | null} */
let lastValidation = null;
/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatTimer = null;
/** @type {(() => void) | null} */
let onVisibility = null;
/** @type {(() => void) | null} */
let onPageHide = null;
let started = false;
/**
 * False when Desktop App passed install_id but not user_install_id.
 * Create-by-user_install_id would mint a different row and steal identity.
 */
let allowCreateHeartbeat = true;
/** Desktop App launch install_id; create must not replace it. */
let pinnedInstallId = null;

function newId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  return `cc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Desktop App may append title_id, game_id, install_id, user_install_id, session_id.
 * Read them before minting local fallbacks. Do not send title_id/game_id on create —
 * those are not create-install fields.
 */
function readLaunchParams() {
  try {
    const q = new URLSearchParams(window.location.search || "");
    return {
      title_id: q.get("title_id") || null,
      game_id: q.get("game_id") || null,
      install_id: q.get("install_id") || null,
      user_install_id: q.get("user_install_id") || null,
      session_id: q.get("session_id") || null,
    };
  } catch {
    return {
      title_id: null,
      game_id: null,
      install_id: null,
      user_install_id: null,
      session_id: null,
    };
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
    keepalive: opts.method === "POST" || !opts.method,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json };
}

function denialReason(json, status) {
  if (typeof json?.reason === "string" && json.reason) return json.reason;
  if (typeof json?.code === "string" && json.code) return json.code;
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "INSTALL_NOT_FOUND";
  if (status === 422) return "VALIDATION_ERROR";
  return `HTTP_${status}`;
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
  };
  if (sessionId) body.session_id = String(sessionId).slice(0, 255);
  const deviceId = storageGet(STORAGE_KEYS.clientId);
  if (deviceId) body.device_id = String(deviceId).slice(0, 255);
  const userName = storageGet(STORAGE_KEYS.username);
  if (userName) body.user_name = String(userName).slice(0, 255);
  return body;
}

function persistInstallId(id) {
  if (typeof id !== "string" || !id) return;
  if (pinnedInstallId && id !== pinnedInstallId) return;
  installId = id;
  storageSet(STORAGE_KEYS.glitchInstallId, id);
}

function clearPersistedInstallId() {
  pinnedInstallId = null;
  installId = null;
  storageSet(STORAGE_KEYS.glitchInstallId, "");
  try {
    localStorage.removeItem(STORAGE_KEYS.glitchInstallId);
  } catch { /* ignore */ }
}

/**
 * POST /titles/{id}/installs — create or heartbeat by reusing user_install_id.
 * @returns {Promise<{ ok: boolean, status: number, reason: string | null, id: string | null }>}
 */
async function createOrHeartbeatInstall() {
  const { res, json } = await glitchFetch(`${TITLE_PATH}/installs`, {
    body: installBody(),
  });
  const id = typeof json?.data?.id === "string" ? json.data.id : null;
  if (res.status === 401 || res.status === 403 || res.status === 422 || !res.ok) {
    return { ok: false, status: res.status, reason: denialReason(json, res.status), id: null };
  }
  persistInstallId(id);
  return { ok: true, status: res.status, reason: null, id };
}

/**
 * POST /titles/{id}/installs/{install_id}/validate
 * @param {string} id
 */
async function validateInstall(id) {
  const deviceId = storageGet(STORAGE_KEYS.clientId);
  /** @type {Record<string, unknown>} */
  const body = {};
  if (deviceId) body.device_id = String(deviceId).slice(0, 255);
  const { res, json } = await glitchFetch(`${TITLE_PATH}/installs/${id}/validate`, {
    body,
  });
  const reason = denialReason(json, res.status);
  if (res.status === 404 || reason === "INSTALL_NOT_FOUND") {
    return { valid: false, reason: "INSTALL_NOT_FOUND", raw: json };
  }
  if (!res.ok) {
    return { valid: false, reason, raw: json };
  }
  return {
    valid: Boolean(json?.valid),
    reason: json?.valid ? null : reason,
    raw: json,
  };
}

function pulseHeartbeat() {
  if (!allowCreateHeartbeat) return;
  void createOrHeartbeatInstall().catch(() => {});
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    pulseHeartbeat();
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer != null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function unbindLifecycle() {
  if (onVisibility && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibility);
  }
  if (onPageHide && typeof window !== "undefined") {
    window.removeEventListener("pagehide", onPageHide);
  }
  onVisibility = null;
  onPageHide = null;
}

function bindLifecycle() {
  unbindLifecycle();
  onVisibility = () => {
    if (document.visibilityState === "hidden") pulseHeartbeat();
  };
  onPageHide = () => {
    stopHeartbeat();
    pulseHeartbeat();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
}

function toastDenial(reason) {
  if (!reason || reason === "INSTALL_NOT_FOUND") return;
  try {
    window.CartRave?.showToast?.(`Glitch access: ${reason}`, 5000);
  } catch { /* ignore */ }
}

/** @returns {string | null} */
export function getGlitchInstallId() {
  return installId;
}

/** @returns {string | null} */
export function getGlitchUserInstallId() {
  return userInstallId;
}

/** @returns {string | null} */
export function getGlitchSessionId() {
  return sessionId;
}

/** @returns {{ valid: boolean, reason: string | null, raw: unknown } | null} */
export function getGlitchValidation() {
  return lastValidation;
}

/**
 * @param {{ valid: boolean, reason: string | null, raw: unknown }} check
 * @returns {{ installId: string | null, valid: boolean | null }}
 */
function finishBoot(check) {
  lastValidation = check;
  if (check.valid === false && check.reason && check.reason !== "INSTALL_NOT_FOUND") {
    toastDenial(check.reason);
  }
  startHeartbeat();
  bindLifecycle();
  return { installId, valid: check.valid };
}

/**
 * Create/heartbeat, then validate. Used when no launch install_id, or after 404.
 * @returns {Promise<{ installId: string | null, valid: boolean | null }>}
 */
async function createThenValidate() {
  const created = await createOrHeartbeatInstall();
  if (created.status === 401 || created.status === 403 || created.status === 422) {
    lastValidation = { valid: false, reason: created.reason, raw: null };
    return { installId, valid: false };
  }
  if (!installId) return { installId: null, valid: null };

  let check = await validateInstall(installId);
  if (!check.valid && check.reason === "INSTALL_NOT_FOUND") {
    clearPersistedInstallId();
    const retry = await createOrHeartbeatInstall();
    if (retry.ok && installId) check = await validateInstall(installId);
  }
  return finishBoot(check);
}

/**
 * Boot Glitch identity: reuse Desktop App query ids when present, else localStorage.
 * @returns {Promise<{ installId: string | null, valid: boolean | null }>}
 */
export async function installGlitchPlatform() {
  if (started) return { installId, valid: lastValidation?.valid ?? (installId ? true : null) };
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

  allowCreateHeartbeat = true;
  if (launch.install_id) persistInstallId(launch.install_id);
  else persistInstallId(storageGet(STORAGE_KEYS.glitchInstallId));

  try {
    // * Desktop App install_id is the Glitch row. Validate it before any create.
    // * Create uses user_install_id; a leftover local key would mint a new row.
    if (launch.install_id) {
      pinnedInstallId = launch.install_id;
      persistInstallId(launch.install_id);
      allowCreateHeartbeat = Boolean(launch.user_install_id);
      const check = await validateInstall(launch.install_id);
      if (!check.valid && check.reason === "INSTALL_NOT_FOUND") {
        clearPersistedInstallId();
        allowCreateHeartbeat = true;
        return await createThenValidate();
      }
      if (allowCreateHeartbeat) {
        await createOrHeartbeatInstall().catch(() => {});
      }
      return finishBoot(check);
    }
    return await createThenValidate();
  } catch (err) {
    if (err?.name === "AbortError") return { installId, valid: null };
    // eslint-disable-next-line no-console
    console.warn("[glitch] platform init failed", err?.message || err);
    return { installId, valid: null };
  }
}

/**
 * POST /titles/{id}/events — requires game_install_id from create install.
 * Admin list/report GETs stay out of the client.
 * @param {string} stepKey
 * @param {string} actionKey
 * @param {Record<string, unknown>} [metadata]
 * @param {{ step_label?: string, event_label?: string, step_description?: string, event_description?: string }} [labels]
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
    if (labels?.step_description) body.step_description = String(labels.step_description).slice(0, 255);
    if (labels?.event_description) body.event_description = String(labels.event_description).slice(0, 255);
    if (metadata && typeof metadata === "object") body.metadata = metadata;
    const { res } = await glitchFetch(`${TITLE_PATH}/events`, { body });
    return res.ok;
  } catch {
    return false;
  }
}

/** Test-only singleton reset. */
export function __resetGlitchPlatformForTest() {
  stopHeartbeat();
  unbindLifecycle();
  installId = null;
  userInstallId = null;
  sessionId = null;
  lastValidation = null;
  started = false;
  allowCreateHeartbeat = true;
  pinnedInstallId = null;
}
