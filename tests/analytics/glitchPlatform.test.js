// @vitest-environment happy-dom
// glitchPlatform.test.js — Glitch Technical runtime client (install / validate / events).
// Admin token CRUD and retention/report GETs must never be called from this module.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GLITCH_API_BASE,
  GLITCH_BUILD_TYPE,
  GLITCH_GAME_VERSION,
  GLITCH_TITLE_ID,
} from "../../src/analytics/glitchConfig.js";
import { STORAGE_KEYS } from "../../src/utils/storage.js";

const TITLE_PATH = `${GLITCH_API_BASE}/titles/${GLITCH_TITLE_ID}`;
const FAKE_TOKEN = "test-title-token";
const INSTALL_UUID = "11111111-2222-4333-8444-555555555555";

const tokenState = vi.hoisted(() => ({ token: "test-title-token", optedOut: false }));

vi.mock("../../src/analytics/glitchConfig.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGlitchTitleToken: () => tokenState.token,
  };
});

vi.mock("../../src/analytics/analytics.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isAnalyticsOptedOut: () => tokenState.optedOut,
  };
});

function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function parseBody(init) {
  return init?.body ? JSON.parse(init.body) : null;
}

function authHeader(init) {
  return init?.headers?.Authorization || init?.headers?.authorization || "";
}

describe("glitchPlatform", () => {
  /** @type {import("../../src/analytics/glitchPlatform.js")} */
  let platform;
  /** @type {ReturnType<typeof vi.fn>} */
  let fetchMock;

  beforeEach(async () => {
    vi.useFakeTimers();
    tokenState.token = FAKE_TOKEN;
    tokenState.optedOut = false;
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    fetchMock = vi.fn(async (url) => {
      const path = String(url);
      if (path.endsWith("/installs") && !path.includes("/installs/")) {
        return jsonRes(200, {
          data: {
            id: INSTALL_UUID,
            title_id: GLITCH_TITLE_ID,
            user_install_id: "local-id",
          },
        });
      }
      if (path.includes("/validate")) {
        return jsonRes(200, {
          valid: true,
          user_id: null,
          user_name: "Guest Player",
          license_type: "free",
          build_type: GLITCH_BUILD_TYPE,
          has_full_access: true,
        });
      }
      if (path.endsWith("/events")) {
        return jsonRes(200, { id: "evt-1", game_install_id: INSTALL_UUID });
      }
      return jsonRes(404, { valid: false, reason: "INSTALL_NOT_FOUND" });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    platform = await import("../../src/analytics/glitchPlatform.js");
  });

  afterEach(() => {
    platform?.__resetGlitchPlatformForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates an install with required user_install_id and documented optional fields only", async () => {
    localStorage.setItem(STORAGE_KEYS.clientId, "client-stable");
    localStorage.setItem(STORAGE_KEYS.username, "Wyatt");
    const result = await platform.installGlitchPlatform();
    expect(result.installId).toBe(INSTALL_UUID);
    expect(result.valid).toBe(true);
    expect(platform.getGlitchInstallId()).toBe(INSTALL_UUID);

    const createCall = fetchMock.mock.calls.find(([url]) =>
      String(url) === `${TITLE_PATH}/installs`,
    );
    expect(createCall).toBeTruthy();
    expect(createCall[1].method).toBe("POST");
    expect(authHeader(createCall[1])).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(authHeader(createCall[1])).not.toMatch(/^Bearer gl_deploy_/);

    const body = parseBody(createCall[1]);
    expect(body.user_install_id).toBe("client-stable");
    expect(body.platform).toBe("web");
    expect(body.device_type).toBe("desktop");
    expect(typeof body.operating_system).toBe("string");
    expect(body.game_version).toBe(GLITCH_GAME_VERSION);
    expect(body.build_type).toBe(GLITCH_BUILD_TYPE);
    expect(body.device_id).toBe("client-stable");
    expect(body.user_name).toBe("Wyatt");
    expect(body.session_id).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("game_build_id");
    expect(body).not.toHaveProperty("consent_given");
    expect(body).not.toHaveProperty("user_id");
    expect(body).not.toHaveProperty("user_email");
    expect(localStorage.getItem(STORAGE_KEYS.glitchInstallId)).toBe(INSTALL_UUID);
    expect(localStorage.getItem(STORAGE_KEYS.glitchUserInstallId)).toBe("client-stable");
  });

  it("reuses a persisted user_install_id instead of minting a new one", async () => {
    localStorage.setItem(STORAGE_KEYS.glitchUserInstallId, "stable-local-key");
    await platform.installGlitchPlatform();
    const body = parseBody(fetchMock.mock.calls[0][1]);
    expect(body.user_install_id).toBe("stable-local-key");
    expect(platform.getGlitchUserInstallId()).toBe("stable-local-key");
  });

  it("reads Desktop App launch query params before local fallbacks", async () => {
    window.history.replaceState(
      {},
      "",
      `/?title_id=${GLITCH_TITLE_ID}&game_id=not-a-create-field&install_id=${INSTALL_UUID}&user_install_id=desk-user&session_id=desk-session`,
    );
    await platform.installGlitchPlatform();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${TITLE_PATH}/installs/${INSTALL_UUID}/validate`,
    );
    const body = parseBody(
      fetchMock.mock.calls.find(([url]) => String(url) === `${TITLE_PATH}/installs`)[1],
    );
    expect(body.user_install_id).toBe("desk-user");
    expect(body.session_id).toBe("desk-session");
    expect(body).not.toHaveProperty("title_id");
    expect(body).not.toHaveProperty("game_id");
    expect(body).not.toHaveProperty("game_build_id");
    expect(platform.getGlitchSessionId()).toBe("desk-session");
  });

  it("keeps Desktop App install_id when local user_install_id would mint a different row", async () => {
    const launchId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const otherId = "99999999-8888-4777-8666-555555555555";
    localStorage.setItem(STORAGE_KEYS.glitchUserInstallId, "stale-web-key");
    window.history.replaceState({}, "", `/?install_id=${launchId}`);
    fetchMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path === `${TITLE_PATH}/installs`) {
        return jsonRes(200, { data: { id: otherId, user_install_id: "stale-web-key" } });
      }
      if (path === `${TITLE_PATH}/installs/${launchId}/validate`) {
        return jsonRes(200, { valid: true, license_type: "free" });
      }
      return jsonRes(404, { valid: false, reason: "INSTALL_NOT_FOUND" });
    });
    const result = await platform.installGlitchPlatform();
    expect(result.installId).toBe(launchId);
    expect(result.valid).toBe(true);
    expect(platform.getGlitchInstallId()).toBe(launchId);
    expect(localStorage.getItem(STORAGE_KEYS.glitchInstallId)).toBe(launchId);
    const creates = fetchMock.mock.calls.filter(([url]) => String(url) === `${TITLE_PATH}/installs`);
    expect(creates).toHaveLength(0);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    const laterCreates = fetchMock.mock.calls.filter(([url]) => String(url) === `${TITLE_PATH}/installs`);
    expect(laterCreates).toHaveLength(0);
  });

  it("creates after Desktop App install_id returns INSTALL_NOT_FOUND", async () => {
    const deadLaunch = "dead0000-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    window.history.replaceState({}, "", `/?install_id=${deadLaunch}`);
    fetchMock.mockImplementation(async (url, init) => {
      const path = String(url);
      if (path === `${TITLE_PATH}/installs/${deadLaunch}/validate`) {
        return jsonRes(404, { valid: false, reason: "INSTALL_NOT_FOUND", code: "INSTALL_NOT_FOUND" });
      }
      if (path === `${TITLE_PATH}/installs`) {
        const body = parseBody(init);
        return jsonRes(200, { data: { id: INSTALL_UUID, user_install_id: body.user_install_id } });
      }
      if (path === `${TITLE_PATH}/installs/${INSTALL_UUID}/validate`) {
        return jsonRes(200, { valid: true, license_type: "free" });
      }
      return jsonRes(404, {});
    });
    const result = await platform.installGlitchPlatform();
    expect(result.installId).toBe(INSTALL_UUID);
    expect(result.valid).toBe(true);
  });

  it("validates the returned install_id before treating play as allowed", async () => {
    await platform.installGlitchPlatform();
    const validateUrl = `${TITLE_PATH}/installs/${INSTALL_UUID}/validate`;
    const validateCall = fetchMock.mock.calls.find(([url]) => String(url) === validateUrl);
    expect(validateCall).toBeTruthy();
    expect(validateCall[1].method).toBe("POST");
    expect(platform.getGlitchValidation()?.valid).toBe(true);
  });

  it("creates a new install after INSTALL_NOT_FOUND, then validates again", async () => {
    let validates = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const path = String(url);
      if (path === `${TITLE_PATH}/installs`) {
        const body = parseBody(init);
        return jsonRes(200, { data: { id: INSTALL_UUID, user_install_id: body.user_install_id } });
      }
      if (path.includes("/validate")) {
        validates += 1;
        if (validates === 1) {
          return jsonRes(404, { valid: false, reason: "INSTALL_NOT_FOUND", code: "INSTALL_NOT_FOUND" });
        }
        return jsonRes(200, { valid: true, license_type: "free" });
      }
      return jsonRes(404, {});
    });
    localStorage.setItem(STORAGE_KEYS.glitchInstallId, "dead-install");
    const result = await platform.installGlitchPlatform();
    expect(result.valid).toBe(true);
    expect(result.installId).toBe(INSTALL_UUID);
    expect(validates).toBe(2);
    const creates = fetchMock.mock.calls.filter(([url]) => String(url) === `${TITLE_PATH}/installs`);
    expect(creates.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    [401, "UNAUTHENTICATED"],
    [403, "ACCESS_DENIED"],
    [422, "VALIDATION_ERROR"],
  ])("does not heartbeat after create HTTP %s", async (status, reason) => {
    fetchMock.mockImplementation(async () => jsonRes(status, { code: reason }));
    const result = await platform.installGlitchPlatform();
    expect(result.valid).toBe(false);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toasts license denials and still heartbeats (does not hard-block the jam)", async () => {
    const toast = vi.fn();
    window.CartRave = { showToast: toast };
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === `${TITLE_PATH}/installs`) {
        return jsonRes(200, { data: { id: INSTALL_UUID } });
      }
      if (String(url).includes("/validate")) {
        return jsonRes(403, {
          valid: false,
          reason: "LICENSE_EXPIRED_OR_MISSING",
          code: "LICENSE_EXPIRED_OR_MISSING",
        });
      }
      return jsonRes(404, {});
    });
    const result = await platform.installGlitchPlatform();
    expect(result.valid).toBe(false);
    expect(toast).toHaveBeenCalledWith("Glitch access: LICENSE_EXPIRED_OR_MISSING", 5000);
    delete window.CartRave;
  });

  it("POSTs GameEvents with game_install_id from create", async () => {
    await platform.installGlitchPlatform();
    fetchMock.mockClear();
    const ok = await platform.trackGlitchGameEvent(
      "session",
      "session_start",
      { referrerHost: "direct" },
      { step_label: "Session", event_label: "Session Start" },
    );
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${TITLE_PATH}/events`);
    const body = parseBody(init);
    expect(body.game_install_id).toBe(INSTALL_UUID);
    expect(body.step_key).toBe("session");
    expect(body.action_key).toBe("session_start");
    expect(body.step_label).toBe("Session");
    expect(body.event_label).toBe("Session Start");
    expect(body.metadata).toEqual({ referrerHost: "direct" });
    expect(typeof body.event_timestamp).toBe("string");
  });

  it("skips all Glitch calls when analytics are opted out", async () => {
    tokenState.optedOut = true;
    const result = await platform.installGlitchPlatform();
    expect(result).toEqual({ installId: null, valid: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await platform.trackGlitchGameEvent("session", "session_start")).toBe(false);
  });

  it("skips all Glitch calls when the runtime title token is missing", async () => {
    tokenState.token = "";
    const result = await platform.installGlitchPlatform();
    expect(result).toEqual({ installId: null, valid: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
