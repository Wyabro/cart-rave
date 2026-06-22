/**
 * config.js — Central game configuration for Cart Rave.
 *
 * Last tuned: 2026-06-19
 *
 * Main sections:
 *   - CONFIG_VERSION     — bump when tuning values change materially (debug / diff aid)
 *   - CONFIG             — runtime settings (debug, net, camera, audio, scoring, physics)
 *   - CONFIG.physics     — grouped physics / arena / cart tuning (flat aliases on CONFIG.*)
 *   - BASELINE_CONFIG    — snapshot of core driving feel for A/B comparisons
 *   - CART_COLORS / PALETTE — immutable cart color palette ("Original Rave")
 *   - MSG                — PartyKit wire-protocol message type strings
 *   - PARTYKIT_PUBLIC_HOST — deployed PartyKit host
 *
 * Spawn ring radius and spawn height are computed after CONFIG is defined (see bottom).
 */

/** @type {string} Bump when physics or net tuning changes materially. */
export const CONFIG_VERSION = "2026.06.19";

const physics = {
  gravity: -24, // m/s² — world Y acceleration
  fixedTimeStep: 1 / 60, // seconds — Rapier substep dt
  maxSubsteps: 4, // count — max physics substeps per frame

  record: {
    radius: 26.4, // meters — outer dancefloor ring
    innerRadius: 3.63, // meters — center hole
    thickness: 0.6, // meters — collider / mesh depth
    y: -0.3, // meters — floor center height
    rotationSpeedRadPerSec: 0.35, // rad/s — visual mesh spin
    physicsSpinRadPerSec: 0.08, // rad/s — host-applied floor tangential push
    friction: 0.8, // unitless — high values catch on trimesh seams and cause grip-hop
    restitution: 0.05, // unitless — bounce on floor contact
    color: 0x050006,
    rimColor: 0xff2bd6,
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

  // * Host-applied assist so carts slide off the rim and fall through cleanly.
  holeAssist: {
    lowFrictionBandM: 1.5, // meters — rim band width for reduced friction
    lowFriction: 0.05, // unitless — friction inside rim band
    approachDownAccel: 5.0, // m/s² — downward nudge near hole edge
    fallThroughAccel: 16.0, // m/s² — stronger pull once over the hole
    unstickAccel: 32.0, // m/s² — escape stuck contacts on hole lip
  },

  cart: {
    size: { x: 1.31, y: 1.35, z: 2.26 }, // meters — collider half-extents basis
    spawnHeight: 1.077, // meters — overridden below from booth geometry
    friction: 1.1, // unitless — Mongoose-style grip
    restitution: 0.3, // unitless
    linearDamping: 0.6, // 1/s — light, agile coast
    angularDamping: 1.2, // 1/s — tippy but not endless spin
    maxPitchRoll: 4.5, // rad/s — high limit for edge tipping (clamp disabled in sim)
    visualOffset: 0.82, // meters — mesh Y offset from body origin
    collider: {
      hyReduction: 0.25, // meters — subtract from half-height for physics collider
      localYOffset: 0.13, // meters — collider translation Y in body space
      roundRadius: 0.08, // meters — roundCuboid corner radius (Mongoose-style bounce)
    },
    rigidBody: {
      canSleep: false, // bool — keep carts awake for responsive physics
      // pitch, yaw, roll, wake — Rapier setEnabledRotations args
      enabledRotations: [false, true, false, true],
    },

    ramBoost: {
      enabled: true,
      durationSec: 1.5, // seconds — nitro active window
      cooldownSec: 3.0, // seconds — time before nitro recharges
      boostedMaxSpeed: 26, // m/s — speed cap while nitro active
      boostedAccel: null, // m/s² — null uses driving.accel × multiplier in sim
      streakDurationSec: 0.4, // seconds — trail particle lifetime
      streakSpawnRatePerSec: 12, // particles/s — nitro trail spawn rate
      streakLengthMeters: 2.0, // meters — trail segment length
      npc: {
        enabled: true,
        alignmentAngleDeg: 13.2, // degrees — aim cone toward target
        minTargetDistance: 3.6, // meters
        maxTargetDistance: 19.8, // meters
      },
    },

    hop: {
      impulse: 25, // N·s scale — upward hop impulse
      cooldownMs: 500, // ms — minimum time between hops
    },
  },

  driving: {
    maxSpeed: 23.5, // m/s — forward speed cap
    reverseMaxSpeed: 8.0, // m/s — reverse speed cap
    accel: 125.0, // m/s² — drive force scaling
    braking: 35.0, // m/s² — passive decel when throttle released
    steeringTorque: 110.0, // N·m scale — tank steer while moving
    tankYawRate: 5.6, // rad/s — in-place pivot rate
    yawResponsiveness: 22.0, // 1/s — yaw smoothing toward target
    lateralGrip: 20.0, // force scale — sideways slip resistance
    driftGripFactor: 0.25, // unitless — lateral grip multiplier when drifting
    driftImpulseStrength: 0.55, // unitless — extra impulse during drift
    airControlFactor: 0.15, // unitless — steering authority while airborne
    extraYawDamping: 12.0, // 1/s — straight-line yaw torque damping when not steering
    groundVerticalVelThreshold: 2.0, // m/s — |vy| below this counts as grounded
    steerDeadzone: 0.01, // unitless — axis magnitude below this skips steer/drift
    driftMinSpeed: 0.25, // m/s — minimum |vForward| before drift impulse applies
    holeZoneLinearYDamping: 0.35, // 1/s — vertical linear damping scale near center hole
    defaultLinearYDamping: 1.2, // 1/s — vertical linear damping scale elsewhere
  },

  ramming: {
    minSpeed: 0.8, // m/s — minimum relative speed to score a hit
    strength: 2.64, // unitless — collision impulse multiplier (8.0 × 0.33)
    maxImpulse: 200.0, // N·s — per-frame impulse clamp
    spreadSteps: 3, // count — frames over which ram impulse is applied
    alignmentDotMin: 0.1, // unitless — min rammer→victim alignment dot product
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
    respawnDelayMs: 600, // ms — visible fall before respawn
  },

  booth: {
    platformY: 4.0, // meters — spawn booth deck height
    platformWidth: 7.0, // meters
    platformDepth: 5.0, // meters
    platformThickness: 0.6, // meters
    rampLength: 0, // meters — ramp removed; gap jump only
    rampWidth: 5.0, // meters
    rampEndY: 0.1, // meters
    rampThickness: 0.3, // meters
    gapDistance: 1.5, // meters — booth platform to dancefloor gap
    railHeight: 1.8, // meters
    railThickness: 0.12, // meters
    gearEnabled: true,
    neonColor1: 0xff2bd6,
    neonColor2: 0x2bd6ff,
    neonCycleSpeed: 0.4, // cycles/s — booth neon pulse
    friction: 2.0, // unitless
    restitution: 0.0, // unitless
  },
};

// * Legacy alias — holeAssist originally lived under record.
physics.record.holeAssist = physics.holeAssist;

export const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x070010,

  debug: {
    input: false,
    velocity: false,
    arenaTrimesh: false,
    audio: false,
  },

  net: {
    interpBufferMs: 75, // ms — remote cart interpolation delay (non-host)
    hostSendHz: 40, // Hz — host transform broadcast rate
    clientInputHz: 60, // Hz — client input send rate to host
    keepaliveIntervalMs: 5000, // ms — WebSocket keepalive interval
    stateBufferMaxSize: 64, // count — max authoritative snapshots retained client-side
    extrapolationCapMs: 50, // ms — max velocity extrapolation when buffer has no "after" snapshot
    hostMigrationFreezeMs: 300, // ms — non-host input freeze after host_migrated

    // * Client-side prediction (multiplayer non-host only). Host remains authoritative.
    prediction: {
      // * Positional error correction speed (1/s). Higher = snappier snap toward host truth.
      reconcilePosRate: 8,
      // * Rotational error correction speed (1/s). Smooths quaternion drift vs host snapshot.
      reconcileRotRate: 6,
      // * Velocity error correction speed (1/s). Aligns predicted motion with host velocities.
      reconcileVelRate: 5,
      // * Hard teleport when error exceeds this (m). Covers respawns and large desyncs.
      maxCorrectionM: 4.0,
      // * Ignore correction below this error (m). Prevents micro-jitter on well-predicted bodies.
      minErrorM: 0.12,
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
    criticalVelocityThreshold: 11.0, // m/s — speed for critical hit bonus
  },

  postFx: {
    bloomStrength: 0.6, // unitless — UnrealBloomPass intensity
    bloomRadius: 0.4, // unitless — bloom spread
    bloomThreshold: 0.85, // unitless — luminance cutoff before bloom applies
  },

  physics,

  // * Flat aliases — existing code uses CONFIG.cart, CONFIG.gravity, etc.
  ...physics,
};

// Spawn ring radius calculation (same as original)
CONFIG.cart.spawnRingRadius =
  CONFIG.record.radius +
  CONFIG.booth.gapDistance +
  CONFIG.booth.rampLength +
  CONFIG.booth.platformDepth / 2;

CONFIG.cart.spawnHeight =
  CONFIG.booth.platformY +
  CONFIG.booth.platformThickness / 2 +
  CONFIG.cart.size.y / 2 +
  0.05;

export const BASELINE_CONFIG = {
  accel: CONFIG.driving.accel,
  maxSpeed: CONFIG.driving.maxSpeed,
  linearDamping: CONFIG.cart.linearDamping,
  angularDamping: CONFIG.cart.angularDamping,
  lateralGrip: CONFIG.driving.lateralGrip,
  driftGripFactor: CONFIG.driving.driftGripFactor,
};

export const CART_COLORS = {
  pink:       { hex: 0xff00ff, css: "bg-pink" },
  blue:       { hex: 0x00ffff, css: "bg-blue" },
  green:      { hex: 0x00ff00, css: "bg-green" },
  yellow:     { hex: 0xffff00, css: "bg-yellow" },
  neonOrange: { hex: 0xff6600, css: "bg-neonOrange" },
};

export const PALETTE = Object.keys(CART_COLORS);

export const MSG = {
  join: "join",
  hostTransform: "host_transform",
  clientInput: "client_input",
  hostEventCollision: "host_event_collision",
  hostEventFall: "host_event_fall",
  hostRound: "host_round",
  keepalive: "keepalive",
  colorPick: "color_pick",
  readyToggle: "ready_toggle",
  playAgain: "play_again",
  hello: "hello",
  hostAssigned: "host_assigned",
  hostMigrated: "host_migrated",
  slots: "slots",
  state: "state",
  round: "round",
  joinRejected: "join_rejected",
  gameStart: "game_start",
};

export const PARTYKIT_PUBLIC_HOST = "cart-rave.wyabro.partykit.dev";
