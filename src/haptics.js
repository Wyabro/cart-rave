// haptics.js — controller rumble + touch vibration. Every hardware call is
// feature-detected and fire-and-forget, so unsupported devices stay safe.
import { STORAGE_KEYS, storageGet, storageSet } from "./utils/storage.js";

const DUALSENSE_VENDOR_ID = 0x054c;
const DUALSENSE_PRODUCT_ID = 0x0ce6;
const DUALSENSE_USB_OUTPUT_REPORT_ID = 0x02;
const RUMBLE_PRIORITY = { menuFocus: 1, menuConfirm: 2, test: 3, gameplay: 4 };

let controllerRumbleEnabled = storageGet(STORAGE_KEYS.controllerRumble) === "true";
let selectedDualSenseHid = null;
let activeRumbleUntil = 0;
let activeRumblePriority = 0;
let lastMenuFocusAt = -Infinity;
const statusListeners = new Set();

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function connectedPads() {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).filter((pad) => pad?.connected);
  } catch {
    return [];
  }
}

function supportsStandardRumble(pad) {
  const anyPad = /** @type {any} */ (pad);
  return !!(anyPad?.vibrationActuator?.playEffect || anyPad?.hapticActuators?.[0]?.pulse);
}

function isUsbDualSenseGamepad(pad) {
  const id = String(pad?.id || "");
  return /vendor:\s*054c\s+product:\s*0ce6/i.test(id) || /dualsense/i.test(id);
}

function isUsbDualSenseHid(device) {
  return device?.vendorId === DUALSENSE_VENDOR_ID && device?.productId === DUALSENSE_PRODUCT_ID;
}

function hidApi() {
  return /** @type {any} */ (navigator).hid;
}

function hasDualSenseRumbleReport(device) {
  return !!device?.collections?.some((collection) =>
    collection.outputReports?.some((report) => report.reportId === DUALSENSE_USB_OUTPUT_REPORT_ID),
  );
}

/** @returns {{ kind: "disconnected"|"standard"|"hid-ready"|"hid-permission"|"unsupported", enabled: boolean, path: "standard"|"dualsense-hid"|null }} */
function currentStatus() {
  const pads = connectedPads();
  if (pads.length === 0) return { kind: "disconnected", enabled: controllerRumbleEnabled, path: null };
  if (pads.some(supportsStandardRumble)) return { kind: "standard", enabled: controllerRumbleEnabled, path: "standard" };
  if (pads.some(isUsbDualSenseGamepad) && hidApi()) {
    return {
      kind: selectedDualSenseHid && hasDualSenseRumbleReport(selectedDualSenseHid) ? "hid-ready" : "hid-permission",
      enabled: controllerRumbleEnabled,
      path: selectedDualSenseHid ? "dualsense-hid" : null,
    };
  }
  return { kind: "unsupported", enabled: controllerRumbleEnabled, path: null };
}

function notifyStatus() {
  const status = currentStatus();
  for (const listener of statusListeners) listener(status);
}

/** @returns {{ kind: "disconnected"|"standard"|"hid-ready"|"hid-permission"|"unsupported", enabled: boolean, path: "standard"|"dualsense-hid"|null }} */
export function getControllerRumbleStatus() {
  return currentStatus();
}

/** @param {(status: ReturnType<typeof getControllerRumbleStatus>) => void} listener */
export function onControllerRumbleStatusChange(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function isControllerRumbleEnabled() {
  return controllerRumbleEnabled;
}

export function setControllerRumbleEnabled(enabled) {
  controllerRumbleEnabled = Boolean(enabled);
  storageSet(STORAGE_KEYS.controllerRumble, controllerRumbleEnabled ? "true" : "false");
  notifyStatus();
}

/** Refreshes previously approved USB DualSense access without showing a picker. */
export async function refreshControllerRumbleCapability() {
  const hid = hidApi();
  if (!hid?.getDevices) {
    selectedDualSenseHid = null;
    notifyStatus();
    return currentStatus();
  }
  try {
    const devices = await hid.getDevices();
    selectedDualSenseHid = devices.find((device) => isUsbDualSenseHid(device) && hasDualSenseRumbleReport(device)) ?? null;
  } catch {
    selectedDualSenseHid = null;
  }
  notifyStatus();
  return currentStatus();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function dualSenseUsbRumbleData(strong, weak) {
  // USB DualSense output report 0x02: flags, power-save byte, right (weak), left (strong).
  // The selected device must expose this output report before this bytestring is sent.
  const report = new Uint8Array(47);
  report[0] = 0x03;
  report[2] = Math.round(clamp(weak, 0, 1) * 255);
  report[3] = Math.round(clamp(strong, 0, 1) * 255);
  return report;
}

async function sendStandardRumble(pads, strong, weak, duration, targetIndex) {
  const sends = pads.map(async (pad) => {
    if (targetIndex != null && pad.index !== targetIndex) return false;
    const anyPad = /** @type {any} */ (pad);
    const actuator = anyPad.vibrationActuator;
    try {
      if (actuator?.playEffect) {
        await actuator.playEffect("dual-rumble", { duration, strongMagnitude: strong, weakMagnitude: weak });
        return true;
      }
      const legacy = anyPad.hapticActuators?.[0];
      if (legacy?.pulse) {
        await legacy.pulse(Math.max(strong, weak), duration);
        return true;
      }
    } catch {
      // A newer effect can preempt this one. Do not let one controller block another.
    }
    return false;
  });
  const results = await Promise.all(sends);
  return results.some(Boolean);
}

async function sendDualSenseHidRumble(pads, strong, weak, duration, targetIndex) {
  const pad = pads.find((candidate) => (
    isUsbDualSenseGamepad(candidate)
    && !supportsStandardRumble(candidate)
    && (targetIndex == null || candidate.index === targetIndex)
  ));
  if (!pad || !selectedDualSenseHid || !hasDualSenseRumbleReport(selectedDualSenseHid)) return false;
  try {
    if (!selectedDualSenseHid.opened) await selectedDualSenseHid.open();
    await selectedDualSenseHid.sendReport(DUALSENSE_USB_OUTPUT_REPORT_ID, dualSenseUsbRumbleData(strong, weak));
    setTimeout(() => {
      selectedDualSenseHid?.sendReport?.(DUALSENSE_USB_OUTPUT_REPORT_ID, dualSenseUsbRumbleData(0, 0)).catch?.(() => {});
    }, duration);
    return true;
  } catch {
    selectedDualSenseHid = null;
    notifyStatus();
    return false;
  }
}

async function controllerPulse(strong, weak, durationMs, priority, targetIndex = null) {
  if (!controllerRumbleEnabled) return false;
  const now = nowMs();
  const duration = clamp(durationMs, 20, 300);
  if (priority < activeRumblePriority && now < activeRumbleUntil) return false;
  if (priority === RUMBLE_PRIORITY.menuFocus && now - lastMenuFocusAt < 70) return false;
  if (priority === RUMBLE_PRIORITY.menuFocus) lastMenuFocusAt = now;
  activeRumblePriority = priority;
  activeRumbleUntil = now + duration;

  const pads = connectedPads();
  const standard = await sendStandardRumble(pads, strong, weak, duration, targetIndex);
  const hid = await sendDualSenseHidRumble(pads, strong, weak, duration, targetIndex);
  return standard || hid;
}

/**
 * Enables standard controller rumble, or asks Chrome for the known USB DualSense
 * device only after the player presses the Settings button.
 */
export async function enableControllerRumble() {
  let status = currentStatus();
  if (status.kind === "standard") {
    setControllerRumbleEnabled(true);
    const ok = await controllerPulse(0.45, 0.7, 90, RUMBLE_PRIORITY.test);
    if (!ok) setControllerRumbleEnabled(false);
    return { ok, status: currentStatus() };
  }
  if (status.kind !== "hid-ready") {
    const hid = hidApi();
    if (status.kind !== "hid-permission" || !hid?.requestDevice) return { ok: false, status };
    try {
      const devices = await hid.requestDevice({
        filters: [{ vendorId: DUALSENSE_VENDOR_ID, productId: DUALSENSE_PRODUCT_ID }],
      });
      selectedDualSenseHid = devices.find((device) => hasDualSenseRumbleReport(device)) ?? null;
    } catch {
      selectedDualSenseHid = null;
    }
    status = currentStatus();
    notifyStatus();
    if (status.kind !== "hid-ready") return { ok: false, status };
  }
  setControllerRumbleEnabled(true);
  const ok = await controllerPulse(0.45, 0.7, 90, RUMBLE_PRIORITY.test);
  if (!ok) setControllerRumbleEnabled(false);
  return { ok, status: currentStatus() };
}

/** Menu-only: never invokes navigator.vibrate. @param {number | undefined} gamepadIndex */
export function hapticMenuFocus(gamepadIndex) {
  void controllerPulse(0.08, 0.16, 24, RUMBLE_PRIORITY.menuFocus, gamepadIndex);
}

/** Menu-only: never invokes navigator.vibrate. @param {number | undefined} gamepadIndex */
export function hapticMenuConfirm(gamepadIndex) {
  void controllerPulse(0.2, 0.36, 42, RUMBLE_PRIORITY.menuConfirm, gamepadIndex);
}

/**
 * Gameplay haptics: controller rumble respects the Settings preference, while
 * touch vibration preserves its existing fallback behavior.
 */
export function hapticPulse(strong, weak, durationMs) {
  const duration = clamp(durationMs, 20, 300);
  void controllerPulse(clamp(strong, 0, 1), clamp(weak, 0, 1), duration, RUMBLE_PRIORITY.gameplay);
  try {
    navigator.vibrate?.(duration);
  } catch {}
}

if (typeof window !== "undefined") {
  window.addEventListener("gamepadconnected", () => { void refreshControllerRumbleCapability(); });
  window.addEventListener("gamepaddisconnected", () => { notifyStatus(); });
  hidApi()?.addEventListener?.("connect", () => { void refreshControllerRumbleCapability(); });
  hidApi()?.addEventListener?.("disconnect", () => { void refreshControllerRumbleCapability(); });
}

export const __TEST_ONLY__ = {
  dualSenseUsbRumbleData,
  reset() {
    controllerRumbleEnabled = false;
    selectedDualSenseHid = null;
    activeRumbleUntil = 0;
    activeRumblePriority = 0;
    lastMenuFocusAt = -Infinity;
  },
};
