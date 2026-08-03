// camera.js — cinematic countdown fly-over warm-up pose.
// getCinematicCountdownWarmupPose gives the shader/composer warm-up pass a representative
// point on the fly-over orbit so it can prime the view before the countdown camera ever
// hard-cuts to it live (see main.js warmupActiveSceneShaders — the previously-never-rendered
// wide/high orbit was stalling the countdown itself, round-start jank confirmed by playtest).

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { getCinematicCountdownWarmupPose } from "../src/camera.js";

describe("getCinematicCountdownWarmupPose", () => {
  it("matches the default fly-over config (radius 28, height 14, lookAt y 1.5)", () => {
    const { position, lookAt } = getCinematicCountdownWarmupPose();
    expect(position.x).toBeCloseTo(28, 5);
    expect(position.y).toBeCloseTo(14, 5);
    expect(position.z).toBeCloseTo(0, 5);
    expect(lookAt.x).toBeCloseTo(0, 5);
    expect(lookAt.y).toBeCloseTo(1.5, 5);
    expect(lookAt.z).toBeCloseTo(0, 5);
  });

  it("honors per-arena overrides (Sundial's wider/higher orbit) the same way beginRoundFlyover does", () => {
    const { position } = getCinematicCountdownWarmupPose({ radius: 32.53, height: 16 });
    expect(position.x).toBeCloseTo(32.53, 2);
    expect(position.y).toBeCloseTo(16, 5);
    expect(position.z).toBeCloseTo(0, 5);
  });

  it("stays on the orbit circle at the configured radius regardless of startAngle", () => {
    const { position } = getCinematicCountdownWarmupPose({ startAngle: Math.PI / 3 });
    const radiusFromOrigin = Math.hypot(position.x, position.z);
    expect(radiusFromOrigin).toBeCloseTo(28, 5);
  });

  it("is pure — repeated calls return equal but distinct Vector3 instances", () => {
    const a = getCinematicCountdownWarmupPose();
    const b = getCinematicCountdownWarmupPose();
    expect(a.position).not.toBe(b.position);
    expect(a.position.equals(b.position)).toBe(true);
  });
});

// * CAM-OPEN-1: the solo opening hold. The pre-roll runs BEFORE syncRoundPhase
// * ("countdown"), which is a window nothing used to occupy — so both the cancel path and
// * the quit funnel need to invalidate it, and neither did. The camera work is a live
// * setTimeout inside a game_start handler, so these are source asserts; all four fail
// * against the pre-fix files.
describe("CAM-OPEN-1 solo fly-over pre-roll", () => {
  const cameraSrc = readFileSync(new URL("../src/camera.js", import.meta.url), "utf8");
  const mainSrc = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  /**
   * Slice between two anchors, failing loudly if either moved — a missed indexOf
   * returns -1 and slice() would silently hand back a passage wide enough to match
   * anything.
   */
  function between(src, startAnchor, endAnchor) {
    const start = src.indexOf(startAnchor);
    const end = src.indexOf(endAnchor, start + 1);
    expect(start, `anchor not found: ${startAnchor}`).toBeGreaterThan(-1);
    expect(end, `anchor not found: ${endAnchor}`).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("slows the opening orbit 15% without touching the podium orbit", () => {
    const cinematic = between(
      cameraSrc,
      "const DEFAULT_CINEMATIC_CONFIG",
      "* Allocates cinematic fly-over scratch state",
    );
    expect(cinematic).toMatch(/angularSpeed:\s*0\.51\b/);
    const podium = cameraSrc.slice(cameraSrc.indexOf("const DEFAULT_PODIUM_CONFIG"));
    expect(podium).not.toMatch(/angularSpeed:\s*0\.51\b/);
  });

  it("holds the arena before the countdown without lengthening the countdown", () => {
    expect(mainSrc).toMatch(/const SOLO_FLYOVER_PREROLL_MS = 2000;/);
    expect(mainSrc).toMatch(/\}, SOLO_FLYOVER_PREROLL_MS\);/);
    // * COUNTDOWN_MS is shared with the server's game_start arming timer — a pre-roll
    // * implemented by growing it would desync every MP client's digits.
    const shared = readFileSync(
      new URL("../shared/roundConstants.js", import.meta.url),
      "utf8",
    );
    expect(shared).toMatch(/COUNTDOWN_MS\s*=\s*3600\b/);
  });

  it("cancel invalidates the solo defer and ends the cinematic unconditionally", () => {
    const cancel = between(
      mainSrc,
      "onCountdownCancelledRef = () => {",
      'syncRoundPhase("lobby");',
    );
    expect(cancel).toMatch(/soloCountdownDeferGen \+= 1;/);
    // * Outside the phase branch: during the pre-roll the camera is already cinematic
    // * while the phase is still pre-countdown.
    expect(cancel).toMatch(/CameraMod\.endCinematicCountdown\(camera\);/);
  });

  it("the quit funnel invalidates the solo defer too", () => {
    const reset = between(mainSrc, "resetRoundState: () => {", "hideEscOverlay:");
    expect(reset).toMatch(/soloCountdownDeferGen \+= 1;/);
    expect(reset).toMatch(/CameraMod\.endCinematicCountdown\(camera\);/);
  });
});

// * CAM-PT-MP-1: the same opening hold in multiplayer, driven by the server's absolute
// * game_start anchor instead of a local timer — every client holds to the same
// * wall-clock instant, so no client's countdown is delayed relative to its peers (that
// * would be the reverted c8df8fd). Source asserts for the same reason as CAM-OPEN-1:
// * the hold is a live setTimeout inside the game_start handler.
describe("CAM-PT-MP-1 multiplayer fly-over pre-roll", () => {
  const mainSrc = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const netcodeSrc = readFileSync(new URL("../src/netcode.js", import.meta.url), "utf8");
  const hudSrc = readFileSync(new URL("../src/hud.js", import.meta.url), "utf8");
  const partySrc = readFileSync(new URL("../party/index.ts", import.meta.url), "utf8");
  const sharedSrc = readFileSync(
    new URL("../shared/roundConstants.js", import.meta.url),
    "utf8",
  );

  function between(src, startAnchor, endAnchor) {
    const start = src.indexOf(startAnchor);
    const end = src.indexOf(endAnchor, start + 1);
    expect(start, `anchor not found: ${startAnchor}`).toBeGreaterThan(-1);
    expect(end, `anchor not found: ${endAnchor}`).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  const hostBranch = () => between(
    mainSrc,
    "hostMpCountdownDeferGen += 1;",
    "nonHostCountdownApplyGen += 1;",
  );
  const nonHostBranch = () => between(
    mainSrc,
    "nonHostCountdownApplyGen += 1;",
    "let lastResultsOverlayKey = null;",
  );

  it("adds the pre-roll as its own constant instead of growing the countdown", () => {
    expect(sharedSrc).toMatch(/FLYOVER_PREROLL_MS\s*=\s*2000\b/);
    // * COUNTDOWN_MS is shared with the client's digit cadence — absorbing the pre-roll
    // * into it would stretch 3-2-1 to ~5.6s instead of adding a hold before it.
    expect(sharedSrc).toMatch(/COUNTDOWN_MS\s*=\s*3600\b/);
  });

  it("the server pushes the shared anchor and widens the arm window by the same amount", () => {
    expect(partySrc).toMatch(
      /startsAtMs = this\.#serverNowMs\(\) \+ FLYOVER_PREROLL_MS \+ COUNTDOWN_MS;/,
    );
    // * The arm window gates aborts (#abortArmedCountdown) and the host-quality
    // * rebalance guard — leaving it at COUNTDOWN_MS would disarm mid-pre-roll.
    expect(partySrc).toMatch(/\}, FLYOVER_PREROLL_MS \+ COUNTDOWN_MS\);/);
    expect(partySrc).toMatch(/import \{ COUNTDOWN_MS, FLYOVER_PREROLL_MS \}/);
  });

  it("the host holds the arena when the anchor is further out than one countdown", () => {
    const host = hostBranch();
    expect(host).toMatch(/starts - now > CONFIG\.round\.countdownMs/);
    expect(host).toMatch(/beginRoundFlyover\(\);/);
    expect(host).toMatch(/HUD\.showReadyHold\(\);/);
    expect(host).toMatch(/hostMpHoldPending = true;/);
    // * Hands off at T−countdownMs, and still starts the countdown against the absolute
    // * server anchor — not a fresh local now + countdownMs.
    expect(host).toMatch(/startCountdown\(starts\);/);
    expect(host).toMatch(/starts - CONFIG\.round\.countdownMs - now/);
  });

  it("the non-host holds too, keeping its pending flag up until the hold fires", () => {
    const nonHost = nonHostBranch();
    expect(nonHost).toMatch(/startsAtLocalMs - now > CONFIG\.round\.countdownMs/);
    expect(nonHost).toMatch(/HUD\.showReadyHold\(\);/);
    expect(nonHost).toMatch(/startsAtLocalMs - CONFIG\.round\.countdownMs - now/);
    // * The pre-roll branch must NOT clear the flag at arm time — netcode reads it to
    // * route a mid-hold abort while local phase is still lobby.
    const holdBranch = between(
      nonHost,
      "startsAtLocalMs - now > CONFIG.round.countdownMs",
      "startsAtLocalMs - CONFIG.round.countdownMs - now",
    );
    const beforeTimeout = holdBranch.slice(0, holdBranch.indexOf("setTimeout("));
    expect(beforeTimeout).not.toMatch(/nonHostCountdownApplyPending = false;/);
    expect(holdBranch).toMatch(/nonHostCountdownApplyPending = false;/);
  });

  it("a cancel during the hold is not a no-op just because phase is still lobby", () => {
    const cancel = between(netcodeSrc, "if (type === MSG.countdownCancel) {", "maybeAutoReadyLobby();");
    expect(cancel).toMatch(/hasPendingNonHostCountdownApply\?\.\(\)/);
    expect(cancel).toMatch(/hasPendingHostMpHold\?\.\(\)/);
    // * Only flip phase when there was a countdown phase to flip.
    expect(cancel).toMatch(/if \(cancelPrevPhase === "countdown"\) GameState\.setRoundPhase\("lobby"\);/);
    expect(netcodeSrc).toMatch(/hasPendingHostMpHold: \(\) => false,/);
  });

  it("both cleanup funnels invalidate the MP holds", () => {
    const cancelRef = between(mainSrc, "onCountdownCancelledRef = () => {", 'syncRoundPhase("lobby");');
    expect(cancelRef).toMatch(/hostMpHoldPending = false;/);
    expect(cancelRef).toMatch(/nonHostCountdownApplyPending = false;/);
    const reset = between(mainSrc, "resetRoundState: () => {", "hideEscOverlay:");
    expect(reset).toMatch(/hostMpCountdownDeferGen \+= 1;/);
    expect(reset).toMatch(/hostMpHoldPending = false;/);
    expect(reset).toMatch(/nonHostCountdownApplyGen \+= 1;/);
    expect(reset).toMatch(/nonHostCountdownApplyPending = false;/);
  });

  it("the HUD status tick leaves the GET READY banner alone", () => {
    // * updateStatus's fallback branch runs every frame while phase is pre-countdown,
    // * which wiped the hold banner one tick after showReadyHold() set it.
    expect(hudSrc).toMatch(/\} else if \(_lastBannerKey !== "ready-hold"\) \{/);
  });
});
