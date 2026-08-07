/**
 * config.js — Central game configuration for Cart Clash.
 *
 * Last tuned: 2026-06-22
 *
 * Main sections:
 *   - CONFIG_VERSION     — bump when tuning values change materially (debug / diff aid)
 *   - CONFIG             — runtime settings (debug, net, camera, audio, scoring, physics)
 *   - CONFIG.physics     — grouped physics / arena / cart tuning (flat aliases on CONFIG.*)
 *   - CART_COLORS / PALETTE — immutable cart color palette ("Original Rave")
 *   - MSG                — wire-protocol message type strings
 *   - WORKER_PUBLIC_HOST — deployed Cloudflare Worker host
 *
 * Spawn ring radius and spawn height are computed after CONFIG is defined (see bottom).
 */

import { getQualityTier } from "./utils/qualityMode.js";
import { QUALITY_KNOBS } from "./utils/qualityTiers.js";
import { COUNTDOWN_MS, ROUND_DURATION_MS } from "../shared/roundConstants.js";

/** @type {string} Bump when physics or net tuning changes materially. */
const CONFIG_VERSION = "2026.07.09";

const physics = {
  gravity: -24, // m/s² — world Y acceleration
  fixedTimeStep: 1 / 60, // seconds — Rapier substep dt
  maxSubsteps: 4, // count — max physics substeps per frame

  record: {
    radius: 26.4, // meters — outer dancefloor ring
    // * Per-level arena radius overrides — applied (and restored) by loadLevel() in
    // * levels/index.js before a level builds. Levels read record.radius live at build
    // * time, so deck, booths, spawn ring, and AI bounds all follow automatically.
    // * Sundial Station is +20% so it stops shadowing Classic Record's footprint.
    radiusByLevel: { zanzibar: 31.7 },
    innerRadius: 3.63, // meters — center hole
    thickness: 0.6, // meters — collider / mesh depth
    y: -0.3, // meters — floor center height
    rotationSpeedRadPerSec: 0.35, // rad/s — visual mesh spin
    friction: 0.8, // unitless — high values catch on trimesh seams and cause grip-hop
    restitution: 0.05, // unitless — bounce on floor contact
    color: 0x050006,
    rimColor: 0xff2bd6,
    // * Center-hole suck/assist toggle. Levels with a solid center (e.g. Backrooms
    // * Supermarket) set enabled=false so carts are not pulled down at the origin.
    centerHole: { enabled: true },
    surface: {
      concentricRings: {
        count: 96,
        lineWidth: 0.018, // meters
        color: 0x2a2a32,
        yOffset: 0.3, // meters — above floor top
        innerRadius: 7.15, // meters
        outerRadius: 25.9, // meters
      },
      spindleRing: {
        enabled: true,
        innerRadius: 3.3, // meters
        outerRadius: 3.7, // meters
        color: 0xffffff,
        yOffset: 0.3, // meters
      },
    },
    // * Physics-only hole clearance (visual mesh unchanged). Tuned to reduce center-hole
    // * sticking and random hopping while keeping a protective expanded collision hole.
    physics: {
      chamferWidth: 0.35, // meters — radial width of the inner hole chamfer ramp
      holeClearance: 0.45, // meters — modest physics hole expansion beyond visual inner radius
      outerBevel: 0.12, // meters
      segments: 72, // count — radial collision mesh segments
    },
  },

  // * Host-applied hole response — only active when cart footprint overhangs playInnerR.
  holeAssist: {
    lowFrictionBandM: 1.5, // meters — overhang depth ramp for inward/down assist
    lowFriction: 0.05, // unitless — cart friction while overhanging the physics lip
    approachDownAccel: 5.0, // m/s² — base downward nudge once overhanging
    fallThroughAccel: 16.0, // m/s² — extra downward pull at full overhang (commit → 1)
    unstickAccel: 32.0, // m/s² — inward pull off the chamfer lip (scaled ×0.3 × commit)
  },

  cart: {
    size: { x: 1.31, y: 1.35, z: 2.26 }, // meters — collider half-extents basis
    spawnHeight: 1.077, // meters — overridden below from booth geometry
    friction: 1.1, // unitless — Mongoose-style grip
    restitution: 0.3, // unitless
    linearDamping: 0.6, // 1/s — light, agile coast
    angularDamping: 1.2, // 1/s — tippy but not endless spin
    maxPitchRoll: 4.5, // rad/s — reference limit; sim clamp disabled for V1 tipping
    visualOffset: 0.82, // meters — mesh Y offset from body origin
    collider: {
      hyReduction: 0.25, // meters — subtract from half-height for physics collider
      localYOffset: 0.13, // meters — collider translation Y in body space
      roundRadius: 0.08, // meters — roundCuboid corner radius (Mongoose-style bounce)
    },
    rigidBody: {
      canSleep: false, // bool — keep carts awake for responsive physics
      // pitch, yaw, roll, wake — Rapier setEnabledRotations args (not applied; V1 tipping)
      enabledRotations: [true, true, true, true],
      // * PIT-PT-1: extra contact-solver passes on the CART bodies only (Rapier's
      // * per-body knob), on top of the world default of 4. Carts were sinking most of
      // * the way through the pit wall and the depth did not track impact speed.
      // * Per-body keeps the cost off every other collider in the arena.
      additionalSolverIterations: 4,
    },

    ramBoost: {
      enabled: true,
      durationSec: 1.7, // seconds — nitro active window (enough to close + connect)
      cooldownSec: 3.1, // seconds — recharge; ~35% duty cycle
      boostedMaxSpeed: 27, // m/s — +~15% over base; punchy without runaway speed
      boostedAccel: 205, // m/s² — snappy surge; null falls back to accel × multiplier
      nitroGripFactor: 0.78, // unitless — lateral grip while nitro + throttle forward
      launchAccelMul: 1.38, // unitless — extra accel during opening burst
      launchWindowSec: 0.2, // seconds — launch burst window from nitro start
      nitroDriftMul: 1.12, // unitless — drift impulse scale while nitro active
      streakDurationSec: 0.32, // seconds — snappy afterimage (shader is punchy enough)
      streakSpawnRatePerSec: 22, // particles/s — nitro trail spawn rate
      streakLengthMeters: 1.75, // meters — speed-line segment length
      streakRadiusMeters: 0.022, // meters — core line width (readable at chase cam)
      streakTipRadiusScale: 0.12, // unitless — taper to point at trailing tip
      streakGlowRadiusMul: 2.8, // unitless — outer halo vs core
      streakGlowOpacity: 0.55, // unitless — soft neon sheath
      streakCoreOpacity: 0.85, // unitless — hot filament
      streakSaturationMul: 1.35, // unitless — richer cart neon on trails
      streakBrightnessMul: 0.95, // unitless — keep chroma (high L → white wash under bloom; run-6: 1.05 still washed white)
      streakSecondaryChance: 0.28, // unitless — occasional twin streak
      streakMaxActive: 80, // count — global streak cap (perf guard)
      streakPulseHz: 14, // Hz — shimmer on active streaks
      // * Placement: whole segment sits aft of the rear bumper (not under the chassis).
      streakRearClearanceM: 0.10, // meters — gap from rear bumper to nearest streak tip
      streakHeightM: 0.40, // meters — lift above body origin (exhaust / wake height)
      // * Charged boost (human charge-release): ~40% solid gold filaments, rest pure cart neon.
      // * Instant/NPC: 100% cart neon. No gold wash on cart-colored segments.
      streakChargedIntensityMul: 1.25, // unitless — opacity / punch vs normal trails
      streakChargedGoldHex: 0xffb020, // hex — saturated gold filament (not pale yellow)
      streakChargedGoldChance: 0.4, // unitless — chance a charged segment is solid gold
      npc: {
        enabled: true,
        // * FEEL-DAY-1: global base cone (all difficulties + MP host-sim); Hard stacks −12°.
        alignmentAngleDeg: 34, // degrees — aim cone toward target
        minTargetDistance: 5.0, // meters
        maxTargetDistance: 12.0, // meters
      },

      // * Solo-only AI rubberband (multiplayer ignores this). When the human is
      // * crushed, bots ease off; when the human is stomping, they hunt harder.
      soloRubberband: {
        enabled: true,
        trailBy: 2, // points — human behind best NPC by this much → ease up
        leadBy: 3, // points — human ahead of best NPC by this much → hunt harder
        trailChaseMul: 0.72, // unitless — human-chase weight scale while trailing
        leadChaseMul: 1.32, // unitless — human-chase weight scale while leading
        trailDistanceMul: 1.28, // unitless — effective human distance² while trailing (>1 = less chase)
        leadDistanceMul: 0.72, // unitless — effective human distance² while leading (<1 = more chase)
        trailNitroMul: 0.55, // unitless — nitro commit scale vs human while trailing
        leadNitroMul: 1.40, // unitless — nitro commit scale vs human while leading
        trailAimSlackDeg: 10, // degrees — looser aim cone while trailing (fewer clean boosts)
        leadAimSlackDeg: -6, // degrees — tighter aim cone while leading
      },

      // * Auto-Charge Boost — tap to charge, auto-releases at full charge.
      // * Replaces the instant nitro for human carts (mobile-friendly one-tap flow).
      // * NPCs keep instant boost via the instant flag on triggerRamBoost.
      boostCharge: {
        enabled: true, // bool — master toggle for the charge mechanic
        boostChargeTimeMs: 1500, // ms — full charge duration before auto-release
        boostMinMultiplier: 0.3, // unitless — burst scale at zero charge (reserved for early-release)
        boostMaxMultiplier: 1.0, // unitless — burst scale at full charge (auto-release)
        boostCooldownMs: 200, // ms — lockout after a released burst before charging again (near-instant re-charge per 07-17 playtest)
        burstImpulse: 28.0, // N·s — instantaneous forward impulse at release (× mass × multiplier)
        // * 3D charge telegraph — frame emissive ramps while holding charge (HUD bar is local-only).
        // * Run-6: peak + white-mix pulled down — the ready glow was reading white/hot
        // * instead of the cart's own color under ACES + bloom.
        glowPeakIntensityMul: 1.6, // unitless — emissive intensity at full charge vs idle
        glowReadyThreshold: 0.92, // unitless — charge01 above this gets a ready white-pulse
        glowReadyWhiteMixMin: 0.04, // unitless — white mix floor when ready
        glowReadyWhiteMixMax: 0.12, // unitless — white mix peak of ready pulse
        glowReadyPulseHz: 6, // Hz — ready-state shimmer rate
      },
    },

    hop: {
      impulse: 25, // N·s scale — upward hop impulse
      cooldownMs: 500, // ms — minimum time between hops
      // * Landing thud window — rising-edge floor contact after a hop (not every bump).
      landingMaxMs: 900, // ms — abandon hop-landing await after this long airborne
      airborneVy: 1.15, // m/s — upward vel that counts as "left the ground" after hop
      // * Solo/host NPC rare hop (dodge incoming ram / near-edge juke). Multiplayer:
      // * host-sim only via gameFlow, same gate as ramBoost.npc.
      npc: {
        enabled: true,
        cooldownMs: 2800, // ms — rarer than player hop so bots stay mostly grounded
        chance: 0.11, // unitless — roll when a threat/edge condition is met
        minThreatDistance: 2.4, // meters — ignore body-contact range (already colliding)
        maxThreatDistance: 7.5, // meters — don't hop at distant threats
        alignmentDotMin: 0.35, // unitless — threat must be approaching roughly toward us
        minThreatSpeed: 6.0, // m/s — planar speed of the approaching cart
        edgeSaveChance: 0.18, // unitless — higher chance when near a void + threatened
        edgeProximityM: 3.2, // meters — "near hazard" band for edge-save hops
      },
    },
  },

  driving: {
    maxSpeed: 23.5, // m/s — forward speed cap
    reverseMaxSpeed: 8.0, // m/s — reverse speed cap
    accel: 125.0, // m/s² — drive force scaling
    tankYawRate: 5.6, // rad/s — in-place pivot rate
    yawResponsiveness: 22.0, // 1/s — yaw smoothing toward target
    lateralGrip: 20.0, // force scale — sideways slip resistance
    driftGripFactor: 0.25, // unitless — lateral grip multiplier when drifting
    driftImpulseStrength: 0.55, // unitless — extra impulse during drift
    airControlFactor: 0.15, // unitless — steering authority while airborne
    extraYawDamping: 12.0, // 1/s — straight-line yaw torque damping when not steering
  },

  ramming: {
    minSpeed: 0.6, // m/s — minimum relative speed to score a hit
    // * FEEL-DAY-1: strength is mid-hit only — maxImpulse clamps base before boost mul.
    strength: 3.15, // unitless — collision impulse multiplier
    maxImpulse: 200.0, // N·s — per-frame impulse clamp (base only; boost mul is post-clamp)
    spreadSteps: 1, // count — fixed steps over which ram impulse is applied; 1 = full knockback on the next step (3 read as a hit→launch delay in playtests)
    alignmentDotMin: 0.18, // unitless — min rammer→victim alignment dot (~80° cone; eased 10% from 0.2/~78°)
    // * FEEL-DAY-1 primary launch lever: boosted impulse is uncapped after the base clamp.
    boostImpulseMultiplier: 2.55, // unitless — nitro ram impulse scale
    nitroAccelMultiplier: 1.72, // unitless — fallback drive accel when boostedAccel is null
    fx: {
      // * FEEL-DAY-1 lever 2: hedged juice — one non-boost gate + modest scale/floor.
      particleCountBase: 10, // count — cart-hit burst floor
      particleCountPerIntensity: 20, // count — extra particles per unit intensity
      particleBoostCountBonus: 6, // count — extra particles when rammer is boosting
      particleMaxCount: 28, // count — hard cap per burst (pool performance guard)
      // * HIT-FEEL-1 Round 2: normals often land ~0.1–0.35; old 0.38 gate muted most of them.
      shakeMinIntensity: 0.20, // unitless — min intensity for local ram screen shake / pulse / rumble
      shakeBoostMinIntensity: 0.12, // unitless — lower shake threshold during nitro rams
      shakePixelScale: 6.2, // px — screen shake amplitude scale
      // * Directional hit vignette (DOM) — lower than shake so everyday rams still cue.
      // * HIT-FEEL-1 Round 1: raised floor + softer display remap so love-taps don't scream.
      hitDirMinIntensity: 0.14, // unitless — min collision intensity for hit-from vignette
      hitDirDisplayBias: 0.3, // unitless — displayI = bias + sqrt(intensity) * scale
      hitDirDisplayScale: 0.62, // unitless — was 0.46 + sqrt * 0.79 (too loud on soft hits)
      // * Crash SFX volume floor (not an intensity gate — SFX still fires when fxIntensity > 0).
      crashVolumeFloor: 0.25, // unitless — playCartCrash volume max(floor, floor + intensity * 0.7)
    },
  },

  // * Living Cargo — life-scoped weight (CARGO-WT-1). Round score still wins on the HUD;
  // * cart groceries / handling follow lifeCargoPoints this life only: spawn at baseline
  // * (today's feel), score while alive → slower kiteable boss (harder to launch), spill →
  // * stripped fast/glass until you score again, respawn → baseline. Synced via snapshot
  // * cart padding byte (lc), not roundScores.
  cargo: {
    fullScore: 8, // points — life cargo at which the bay / weight reads "boss" (weight01 1.0)
    baselinePoints: 3, // points — spawn/respawn stocked load (maps to today's handling = 1.0)
    // * 4-phase visual fill (Wyatt 07-30): discrete jumps read as "cart got fuller"
    // * moments. Quarter-split over fullScore: life 1–2 → 5, 3–4 → 10, 5–7 → 20, 8 → 30.
    fillPhases: [5, 10, 20, 30], // counts per phase; last entry = GRID length
    baseItems: 10, // count — spawn/baseline look (= fillPhases[1]; legacy setCargoFill floor)
    maxItems: 30, // count — full cargo (= fillPhases[3]; mirrors GRID length in createCargoBay)
    // * Top-heavy handling — lateral grip at BOSS weight (piecewise: baseline stays 1.0).
    gripFullFactor: 0.58, // unitless — lateral grip scale at weight01 1.0 (readable slide)
    // * Drive curve vs baseline 1.0 (piecewise stripped ↔ baseline ↔ boss).
    // * First Solo pass felt soft — boss pushed harder; stripped kept near prior (liked).
    driveSpeedAtStripped: 1.14, // × driving.maxSpeed at life cargo 0
    driveAccelAtStripped: 1.50, // × driving.accel at life cargo 0
    driveSpeedAtBoss: 0.76, // × driving.maxSpeed at life cargo full
    driveAccelAtBoss: 0.65, // × driving.accel at life cargo full
    // * Incoming ram mul (victim weight) — boss shrugs hard, stripped launches easier.
    ramIncomingAtStripped: 1.32, // × impulseMagBase at life cargo 0
    ramIncomingAtBoss: 0.52, // × impulseMagBase at life cargo full
    // * Soft Rapier mass (drive stays mass-compensated; inertia / contacts only).
    massAtStripped: 0.85, // × base mass at life cargo 0
    massAtBoss: 1.45, // × base mass at life cargo full
    // * Taste-gated experiment — raise center of mass with fullness. OFF by default:
    // * raising CoM can flip carts into the pit; the grip slide is the shipped feel.
    comRaise: {
      enabled: false,
      maxRaiseY: 0.25, // meters — CoM lift at fullness 1.0 (base CoM y is -0.55)
    },
    // * Spill announce / VFX window only — drive speed/accel come from the stripped curve
    // * (muls stay 1.0 so we do not double-dip). Bay fill follows lifeCargoPoints.
    spillBoost: {
      durationMs: 2600, // ms — spill_rush announce / VFX window from the spill moment
      speedMul: 1.0, // retired — stripped drive curve owns surge
      accelMul: 1.0, // retired — stripped drive curve owns surge
      restockDelayMs: 400, // unused for weight restore (kept for tune-pane compat)
    },
    // * Spill size scales with life-cargo weight — the boss drops a BIGGER mess.
    spillCountBase: 3, // groceries launched at stripped cargo
    spillCountMax: 12, // groceries launched at boss cargo
  },

  // * The Living Store — the Store PA issues short mini-mutator "directives" mid-round
  // * (Flash Sale, Double Bag, Express Lane, Spill Bonus, Rush Hour). Scheduling knobs
  // * live here; the directive content table is src/directives/directives.js.
  // * Host-authored, broadcast one-shot over the DataChannel; never fires in Sudden Death.
  directives: {
    enabled: true,
    // * Three per round, evenly spaced across the first two minutes (round is 2.5 min);
    // * every window fully clears the endgame — the last 30s belong to the round climax.
    fireAtMs: [20000, 55000, 90000], // ms into the round — one directive per slot
    jitterMs: 5000, // ms — ± wiggle applied per slot each round
    durationMs: 18000, // ms — directive window length
    quietFinaleMs: 30000, // ms — no directive may run inside this tail of the round clock
  },

  environmentImpacts: {
    floorFallSpeedThreshold: 3.0, // m/s — min downward pre-step speed for floor impact FX
    edgeDeltaVThreshold: 2.5, // m/s — min horizontal Δv for wall/edge impact FX
    intensityRange: 15.0, // m/s — divisor mapping excess speed/Δv to intensity 0–1
    minIntensity: 0.01, // unitless — ignore FX below this intensity
    contactYOffset: -0.4, // meters — floor contact point below cart origin
    pitRadiusOffset: 2, // meters — added to record radius for edge contact placement
    pitRadiusScale: 1.56, // unitless — 1.30 × 1.20 edge contact radius multiplier
  },

  fall: {
    yThreshold: -10, // meters — Y below arena triggers fall state
    entryYThreshold: -2.0, // meters — Y below platform rim where fall entry position/time is recorded
    respawnDelayMs: 1000, // ms — delay after shatter VFX plays out before booth respawn
    // * Host-only anti-wedge safeguard — no score / kill feed (geometry trap workaround).
    stuck: {
      respawnMs: 10000, // ms — idle on arena before booth respawn
      positionRadiusM: 0.45, // meters — XZ movement that resets the idle timer
      // * (Speed gate is hardcoded in gameFlow's idle watch: planar speed > 2.0 m/s
      // * resets the timer — there is no config knob for it.)
      unstickAfterMs: 2000, // ms — earlier physics nudge before forced respawn
    },
  },

  booth: {
    platformY: 4.0, // meters — spawn booth deck height
    platformWidth: 7.0, // meters
    platformDepth: 5.0, // meters
    platformThickness: 0.6, // meters
    rampLength: 0, // meters — ramp removed; gap jump only (kept: still read as a 0 offset)
    gapDistance: 1.5, // meters — booth platform to dancefloor gap
    // * Per-level gap overrides — applied (and restored) by loadLevel(), same mechanism
    // * as record.radiusByLevel. This one knob moves the booths AND the spawn ring
    // * together, because every booth builder and computeSpawnRingRadius read
    // * booth.gapDistance live at build time — so they cannot drift apart and strand a
    // * cart spawning off its deck. Storerooms and Sundial sit +0.75m further out
    // * (SPAWN-BACKROOMS-1 / SPAWN-SUNDIAL-1: spawns were close enough to the edge that
    // * an opening scramble could put a cart over it). Classic keeps the base 1.5.
    gapDistanceByLevel: { backrooms: 2.25, zanzibar: 2.25 },
    railHeight: 1.8, // meters
    railThickness: 0.12, // meters
    gearEnabled: true,
    // * Classic Record booth neon: intensity pulse rate only (per-booth hue is sticky).
    neonCycleSpeed: 0.4, // cycles/s — booth neon emissive pulse
    friction: 1.2, // unitless
    restitution: 0.0, // unitless
  },
};

// * Legacy alias — holeAssist originally lived under record.
physics.record.holeAssist = physics.holeAssist;

// * Quality tier — physics substep cap and streak budget at boot; live tier changes
// * re-apply these in main.js rebuildForQualityChange().
{
  const knobs = QUALITY_KNOBS[getQualityTier()];
  physics.maxSubsteps = knobs.maxSubsteps;
  physics.cart.ramBoost.streakMaxActive = Math.min(
    physics.cart.ramBoost.streakMaxActive,
    knobs.streakCap,
  );
}

export const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x070010,

  debug: {
    arenaTrimesh: false,
    audio: false,
  },

  net: {
    interpBufferMs: 75, // ms — remote cart interpolation delay (non-host)
    hostSendHz: 40, // Hz — host transform broadcast rate
    // * (Client input has no Hz knob — sends ride the 60Hz fixed-step input sample.)
    keepaliveIntervalMs: 5000, // ms — WebSocket keepalive interval
    stateBufferMaxSize: 64, // count — max authoritative snapshots retained client-side
    extrapolationCapMs: 50, // ms — max velocity extrapolation when buffer has no "after" snapshot
    hostMigrationFreezeMs: 300, // ms — legacy min label; freeze ends on first post-migration snap
    // * NET-MIG-3: max hold while awaiting first post-epoch host snapshot (WebRTC re-handshake).
    hostMigrationFreezeMaxMs: 2000,
    clockResyncIntervalMs: 30000, // ms — periodic 3-sample median re-sync (arrests slow clock drift)
    // * Host-side delay before applying remote DataChannel inputs. Smooths packet
    // * jitter so remote carts don't stutter when arrival cadence is uneven.
    // * ackSeq in host snapshots advances only when a frame is *applied* after this
    // * delay (not on wire receive) so client prediction does not prune unapplied inputs.
    inputJitterBufferMs: 40,
    // * Max queued remote input frames per peer (drop oldest when exceeded).
    inputJitterQueueMax: 24,
    // * Non-host prediction history cap (physics-rate samples). ~400 ms at 60 Hz.
    // * Run-7 Match A: 120 (~2s) fed a reconcile death spiral on the Intel non-host
    // * (pending hit the cap → 120 Rapier steps/snap → snapHz 40→13 + 72 m teleports)
    // * while the 4090 host stayed clean. Keep this in the same ballpark as
    // * prediction.reconcileReplayMaxSteps.
    predictionPendingInputsMax: 24,
    // * How long to wait for Cloudflare TURN credentials before opening WebRTC with STUN-only.
    turnCredentialsTimeoutMs: 2500,
    // * Min time between host WebRTC re-offer attempts for the same peer (mid-match recovery).
    p2pReconnectCooldownMs: 3000,
    // * If a peer PC exists but the DataChannel never opens, force teardown + re-offer after this.
    p2pConnectingTimeoutMs: 10000,

    // * Client-side prediction (multiplayer non-host only). Host remains authoritative.
    // * The PHYSICS reconcile is a hard body snap + input replay (gameLoop.js); these
    // * knobs ease the RENDERED pose across each correction — the pre↔post correction
    // * delta accumulates into cart._reconcileVisOffset (gameLoop capture), which
    // * frameVisuals applies to the mesh (and main.js feeds to the follow camera) while
    // * decaying it at the rates below. Run-4 "laggy-rubberbandy" fix.
    // * NH-SMOOTH: v1 prev-pose+rates, v2 soft debt — both failed live (cap-82/83).
    // * v3: display-pose low-pass for non-host local mesh+camera (frameVisuals / main).
    // * Physics hard-snap unchanged. Legacy offset knobs remain for metrics / fallback.
    prediction: {
      // * Visual positional correction decay (1/s). Higher = snappier settle to host truth.
      reconcilePosRate: 3.2,
      // * Visual heading correction decay (1/s). Heading is the only eased rotation
      // * axis — pitch/roll snap with the body (hardcoded in frameVisuals; easing
      // * them reads as wobble under arcade physics).
      reconcileRotRate: 2.5,
      // * NH-SMOOTH v2: max mesh correction speed (m/s) while eating visual debt.
      reconcilePosMaxMps: 5,
      // * NH-SMOOTH v2: max heading correction speed (rad/s).
      reconcileYawMaxRadPs: 4,
      // * NH-SMOOTH v2: max meters of ease debt one snapshot may add (rest shows immediately).
      reconcileVisAddCapM: 0.45,
      // * NH-SMOOTH v3: display pose chase rates (1/s) toward physics mesh pose.
      displayPosRate: 14,
      displayRotRate: 12,
      // * Hard visual teleport when display lags body by more than this (m), or a single
      // * reconcile correction exceeds it. Accumulated debt is clamped (not zeroed).
      maxCorrectionM: 6.0,
      // * NET-PERF-1 (run-7): max Rapier fixed-steps per host snapshot on the non-host.
      // * After the body hard-snaps to host truth, only the oldest N unacked inputs are
      // * replayed (continuous extension of host; newer ones dropped). 12 ≈ 200 ms at
      // * 60 Hz — covers normal RTT with headroom; Intel retest had ~3% over33 so we can
      // * afford more than the initial 8 that still felt "hit 1s late".
      reconcileReplayMaxSteps: 12,
      // * Run-7 combat retest (efdca62): when host snaps go silent longer than this (ms),
      // * non-host prediction freezes instead of driving a ghost world. Host freezes of
      // * 1–5s produced snap gaps + 28 m teleports + "hit then it reverses / death pops
      // * where I was". 150 ms ≈ 6 missed 40 Hz ticks — past normal jitter, before multi-
      // * second host stalls. Below this, live prediction still runs for input feel.
      // * Silence is measured in the host tHost domain (not client onmessage wall time)
      // * so a hitchy non-host does not false-trip hold while the host keeps sending (2e).
      holdAfterSnapGapMs: 150,
      // * Reconcile skip-replay threshold (ms between snapshot tHost stamps). Only long
      // * host silences hard-snap without replaying; truncating newest under
      // * reconcileReplayMaxSteps still replays the continuous oldest-N (cap-13).
      skipReplayAfterSnapGapMs: 500,
    },
  },

  camera: {
    fov: 55, // degrees — base field of view
    minFov: 50, // degrees — speed-zoom lower bound
    maxFov: 75, // degrees — speed-zoom upper bound
    followBack: 8.36, // meters — chase distance behind cart
    followUp: 3.894, // meters — chase height above cart
    lookAhead: 5.0, // meters — forward look target offset
    lookUp: 1.2, // meters — vertical look target offset
    positionDamping: 10.0, // 1/s — exponential follow smoothing (position)
    rotationDamping: 12.0, // 1/s — exponential follow smoothing (rotation)
    snapDistance: 80.0, // meters — instant camera reset if cart teleports farther
  },

  audio: {
    musicVolume: 0.1725, // unitless gain — in-game music (master gain applied separately)
  },

  scoring: {
    criticalVelocityThreshold: 16.0, // m/s — speed for critical hit bonus (~68% of top speed; ~60% of committed hits)
    hitWindowMs: 3000, // ms — max time after a hit to credit a fall kill
  },

  combo: {
    decayMs: 5000, // ms — time before combo tier resets to 0
    maxTier: 3, // count — maximum combo tier cap
    tiers: {
      0: { multiplier: 1.0, name: "" },
      1: { multiplier: 1.5, name: "RAMPAGE" },
      2: { multiplier: 2.0, name: "SAVAGE" },
      3: { multiplier: 3.0, name: "CARNAGE" },
    },
  },

  round: {
    // * Shared with the server's podium plausibility cap — tune it in
    // * shared/roundConstants.js, never here alone (AGENTS.md invariant).
    durationMs: ROUND_DURATION_MS,
    // * Run-6: Sudden Death stalemate cap — SD only ends on a resolving KO, so two
    // * cagey drivers on a solid floor could circle forever (live MP capture). After
    // * this window the host ends the round via the most-recent-scoring-hit tiebreak.
    suddenDeathMaxMs: 45000, // ms — max SD length before tiebreak resolution
    // * 3…2…1…GO window; HUD digits hold countdownMs/3 each. Single-sourced with the
    // * server's game_start arming timer (shared/roundConstants.js).
    countdownMs: COUNTDOWN_MS, // ms — 3000 read as rushed in the 07-17 playtest
  },

  postFx: {
    // * Renderer exposure — lower keeps diffuse surfaces subdued while emissive neon blooms.
    // * Retuned for the corrected pipeline (OutputPass tone-map + sRGB encode): the old
    // * 0.88 was authored when exposure was silently ignored; values now display brighter.
    // * HISTORICAL: "kept deliberately low — dark arena + punchy neon" (2026-07-08). That rule
    // * is SUPERSEDED by docs/reference/art-direction.md: brightness is a per-arena budget, not
    // * one global number. ART-EXPO-1 owns retiring this lock; do not tune it ad-hoc.
    toneMappingExposure: 0.4,

    // * Per-arena multiplier on toneMappingExposure, applied at level load (main.js
    // * applyLoadedLevelSideEffects). ACESFilmic pulls mids down harder than Neutral
    // * and Sundial's sunset palette lives in those mids (07-17 playtest: "sundial
    // * looks a bit too dark with acesfilmic on"). Unlisted arenas get 1.0.
    arenaExposureMul: {
      zanzibar: 1.32, // 1.18 still read as too dark in run 2; artifacts near the sun under review
    },

    // * IBL (Image-Based Lighting) — RoomEnvironment PMREM on scene.environment.
    // * intensity drives scene.environmentIntensity — the only knob that scales IBL for
    // * materials inheriting scene.environment (three r152+ ignores their envMapIntensity).
    // * materialEnvMapIntensity only affects materials with an OWNED envMap reference
    // * (arena floor clampFloorEnv, sunglasses lens) — see the STATUS gotcha before tuning.
    environment: {
      intensity: 0.6, // unitless — global IBL multiplier (scene.environmentIntensity)
      materialEnvMapIntensity: 0.4, // unitless — base reflectivity for owned-envMap materials only
    },

    // * UnrealBloomPass tuning — see applyBloomSettings() in scene.js.
    // * bloomHalfRes: internal bloom RTs at 0.5× (fill-rate win); strength mul compensates.
    // * Used when ?bloompipe=hdr (Classic/Sundial pre-tonemap path). Default experiment is
    // * ?bloompipe=display — all levels use display-referred knobs in scene.js instead.
    // * Default numbers = shipping emissive-biased stack. A/B: ?bloom=mid | og.
    bloomHalfRes: true,
    bloomHalfResStrengthMul: 1.2,
    bloom: {
      strength: 0.34, // unitless — bloom composite intensity
      radius: 0.34, // unitless — halo tightness
      // * Lower threshold + wide knee: Rec.709 under-weights red/blue; magenta neon
      // * needs the knee or it never blooms while cyan does.
      threshold: 0.76, // unitless — luminance cutoff (higher = emissive-only bloom)
      smoothWidth: 0.14, // unitless — soft knee on the high-pass
    },
    // * Middle-ground A/B — ?bloom=mid
    bloomMid: {
      strength: 0.42,
      radius: 0.35,
      threshold: 0.45,
      smoothWidth: 0.12,
    },
    // * Jam main.js UnrealBloomPass(res, 0.5, 0.35) threshold default 0 — ?bloom=og
    bloomOg: {
      strength: 0.5,
      radius: 0.35,
      threshold: 0,
      smoothWidth: 0.05,
    },

    // * Applied ONCE in createComposer (scene.js) from this global object, so every level
    // * inherits it — there is no per-level arcade write today. Per art-direction.md the CRT
    // * layer belongs to The Storerooms only; ART-FILTER-1 adds the level gate (mirror the VHS
    // * gate below). Keep the impact-pulse base capture intact when you do (main.js ~1110).
    arcade: {
      aberration: 0.003,
      scanlineDensity: 1.8,
      vignette: 0.5,
    },

    // * VHS/security-cam layer on the arcade pass — enabled per level (Backrooms only;
    // * see applyLoadedLevelSideEffects in main.js). "Cheap always-on CCTV feed", subtle
    // * by design: gameplay readability wins over the effect.
    vhs: {
      amount: 0.3, // unitless — master 0..1 applied while The Storerooms is loaded
      noise: 0.1, // unitless — luminance-only tape-noise floor amplitude (scaled by amount)
      trackPeriodSec: 22, // seconds — interval between tracking-band sweeps
    },

    // * Scene FogExp2 — Classic uses default fog on createScene(); Backrooms overrides on load.
    // * Fog hexes retuned for the corrected pipeline: colors now display as authored
    // * (previously they rendered darker via the missing sRGB encode), so each hex was
    // * shifted toward its old *perceived* value to keep the arena identities.
    fog: {
      color: 0x040112, // deep blue-violet void (matches renderer clear)
      density: 0.0065, // conservative — depth at distance without hiding gameplay
      backrooms: {
        color: 0x1a1510, // thick warm musty haze
        density: 0.029,
      },
      zanzibar: {
        color: 0xff5a22, // sunset ember — melts ocean seamlessly into sunset horizon
        // * Slightly denser than Classic — Sundial is the mood arena (golden-hour haze).
        density: 0.00355,
      },
    },

    // * Per-arena sun azimuth, radians. Lives here rather than in the level module because
    // * main.js needs it for the ambient-dust sun lobe and must not import a lazily-chunked
    // * level to get it (that would defeat prefetchLevelChunks). The level reads this back,
    // * so there is exactly one copy of the number — same single-source pattern as
    // * record.radiusByLevel and booth.gapDistanceByLevel.
    // * Arenas absent from this map have no directional sun and get uniform dust.
    sunAzimuthByLevel: {
      zanzibar: Math.PI * 0.78, // between two booth lanes, never behind a booth
    },
  },

  // * Blob contact shadows — see contactShadows.js (no renderer.shadowMap; cheap quads).
  contactShadows: {
    enabled: true,
    floorY: 0,
    floorEpsilon: 0.045,
    textureSize: 128,
    textureSoftness: 0.92, // outer gradient radius — higher = wider soft falloff
    cart: {
      // * Run-6 ruling (Wyatt): every cart gets the SAME flat circle, centered, pinned to
      // * the arena floor — no ellipse, no height shrink, no per-arena light bias.
      footprintRadiusX: 1.0, // meters — equal radii = a true circle
      footprintRadiusZ: 1.0,
      opacity: 0.58,
      heightFadeStart: 0.3,
      heightFadeEnd: 4.8,
      minAirborneScale: 1.0, // 1.0 = constant size regardless of height (opacity still fades)
    },
    static: {
      opacity: 0.44,
    },
  },

  physics,

  // * Flat aliases — existing code uses CONFIG.cart, CONFIG.gravity, etc.
  ...physics,
};

/**
 * Spawn-ring radius from the current arena radius — the single source of truth for the
 * booth/spawn distance formula. Re-invoked by loadLevel() after a per-level radius
 * override so spawns land on the (possibly resized) booth ring.
 *
 * @param {typeof CONFIG} config
 * @returns {number}
 */
export function computeSpawnRingRadius(config) {
  return (
    config.record.radius +
    config.booth.gapDistance +
    config.booth.rampLength +
    config.booth.platformDepth / 2
  );
}

// Spawn ring radius calculation (same as original)
CONFIG.cart.spawnRingRadius = computeSpawnRingRadius(CONFIG);

CONFIG.cart.spawnHeight =
  CONFIG.booth.platformY +
  CONFIG.booth.platformThickness / 2 +
  CONFIG.cart.size.y / 2 +
  0.05;

export const CART_COLORS = {
  pink:       { hex: 0xff00ff, css: "bg-pink" },
  blue:       { hex: 0x00ffff, css: "bg-blue" },
  green:      { hex: 0x00ff00, css: "bg-green" },
  yellow:     { hex: 0xffff00, css: "bg-yellow" },
  neonOrange: { hex: 0xff6600, css: "bg-neonOrange" },
};

export const PALETTE = Object.keys(CART_COLORS);

export { MSG } from '../shared/protocol.js';

export const WORKER_PUBLIC_HOST = "cart-rave.wyabro.workers.dev";
