// wsMessageLimits.test.js — Party WS size policy (no Workers runtime).
import { describe, expect, it } from "vitest";
import { MSG } from "../shared/protocol.js";
import {
  WS_ABSOLUTE_MAX,
  WS_BOMB_CLOSE_MAX,
  WS_CONTROL_MAX,
  WS_SIGNALING_MAX,
  classifyWsMessagePostParse,
  classifyWsMessagePreParse,
} from "../shared/wsMessageLimits.js";

describe("classifyWsMessagePreParse", () => {
  it("accepts normal and elevated-size envelopes under the absolute ceiling", () => {
    expect(classifyWsMessagePreParse(100)).toBe("accept");
    expect(classifyWsMessagePreParse(WS_CONTROL_MAX)).toBe("accept");
    expect(classifyWsMessagePreParse(WS_SIGNALING_MAX)).toBe("accept");
    expect(classifyWsMessagePreParse(WS_ABSOLUTE_MAX)).toBe("accept");
  });

  it("drops over absolute without closing", () => {
    expect(classifyWsMessagePreParse(WS_ABSOLUTE_MAX + 1)).toBe("drop");
    expect(classifyWsMessagePreParse(WS_BOMB_CLOSE_MAX)).toBe("drop");
  });

  it("closes only pathological bombs", () => {
    expect(classifyWsMessagePreParse(WS_BOMB_CLOSE_MAX + 1)).toBe("close");
  });
});

describe("classifyWsMessagePostParse", () => {
  it("allows SDP / ICE / host_spawn up to the signaling ceiling", () => {
    expect(classifyWsMessagePostParse(WS_CONTROL_MAX + 500, MSG.sdpOffer)).toBe("accept");
    expect(classifyWsMessagePostParse(WS_SIGNALING_MAX, MSG.sdpAnswer)).toBe("accept");
    expect(classifyWsMessagePostParse(WS_SIGNALING_MAX, MSG.iceCandidate)).toBe("accept");
    expect(classifyWsMessagePostParse(WS_SIGNALING_MAX, MSG.hostSpawn)).toBe("accept");
  });

  it("drops oversized signaling above the elevated ceiling", () => {
    expect(classifyWsMessagePostParse(WS_SIGNALING_MAX + 1, MSG.sdpOffer)).toBe("drop");
  });

  it("keeps routine control messages at 4KB", () => {
    expect(classifyWsMessagePostParse(WS_CONTROL_MAX, MSG.join)).toBe("accept");
    expect(classifyWsMessagePostParse(WS_CONTROL_MAX + 1, MSG.join)).toBe("drop");
    expect(classifyWsMessagePostParse(WS_CONTROL_MAX + 1, MSG.hostRound)).toBe("drop");
    expect(classifyWsMessagePostParse(WS_CONTROL_MAX + 1, MSG.readyToggle)).toBe("drop");
  });

  it("treats unknown types as control (strict)", () => {
    expect(classifyWsMessagePostParse(WS_CONTROL_MAX + 1, "mystery")).toBe("drop");
    expect(classifyWsMessagePostParse(WS_CONTROL_MAX + 1, null)).toBe("drop");
  });
});
